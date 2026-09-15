import json
import os
import posixpath
import re
import struct
import sys
import threading
import time

import lldb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from darwin_loader_protocol import (
    MAX_METADATA_SIZE, MAX_PAGE_PLAN_SIZE, PAGE_PLAN_BREAK,
    export_layout, regular_export_offset, page_plan_writes,
)


MODE_ENV = "MOBILE_EASY_USE_LLDB_MODE"
TARGET_ENV = "MOBILE_EASY_USE_LLDB_TARGET"
PID_ENV = "MOBILE_EASY_USE_LLDB_PID"
TIMEOUT_ENV = "MOBILE_EASY_USE_LLDB_TIMEOUT"
WAIT_FOR_MAIN_ENV = "MOBILE_EASY_USE_LLDB_WAIT_FOR_MAIN"

TERMINAL_FAILURE_STATES = {
    lldb.eStateCrashed,
    lldb.eStateDetached,
    lldb.eStateExited,
}

BRIDGE_IMAGE_NAME = "MobileEasyUse.dylib"
RUNTIME_IMAGE_NAME = "MobileEasyUseRuntime.dylib"
DYLD_STATE_TERMINATED_BEFORE_INITIALIZERS = 0x20
DYLD_STATE_PROGRAM_RUNNING = 0x50
DYLD_STATE_TERMINATED = 0x60
DYLD_STATE_RETRYABLE = {0x00, 0x10, 0x30, 0x40}
DYLD_STATE_POLL_INTERVAL_SECONDS = 0.5


class LoaderError(RuntimeError):
    pass


def state_name(state):
    return lldb.SBDebugger.StateAsCString(state) or str(state)


def wait_for_process(debugger, expected_pid, timeout_seconds):
    deadline = time.monotonic() + timeout_seconds
    last_state = lldb.eStateInvalid
    last_interrupt = 0.0

    while time.monotonic() < deadline:
        target = debugger.GetSelectedTarget()
        if target.IsValid():
            process = target.GetProcess()
            if process.IsValid() and process.GetProcessID() == expected_pid:
                last_state = process.GetState()
                if last_state == lldb.eStateStopped:
                    return target, process
                if last_state in TERMINAL_FAILURE_STATES:
                    raise LoaderError(
                        "attach ended before the process stopped: "
                        f"state={state_name(last_state)}"
                    )
                now = time.monotonic()
                if now - last_interrupt >= 0.1:
                    process.SendAsyncInterrupt()
                    last_interrupt = now
        time.sleep(0.05)

    raise LoaderError(
        f"process {expected_pid} did not stop within {timeout_seconds} seconds "
        f"(last state: {state_name(last_state)})"
    )


def module_identity(module):
    platform_file = module.GetPlatformFileSpec()
    return {
        "name": platform_file.GetFilename() or "",
        "path": str(platform_file),
        "uuid": module.GetUUIDString() or "",
    }


def matching_images(target, image_name):
    matches = []
    for index in range(target.GetNumModules()):
        module = target.GetModuleAtIndex(index)
        identity = module_identity(module)
        if identity["name"] == image_name:
            matches.append(identity)
    return matches


def mobile_easy_use_images(target):
    return {
        BRIDGE_IMAGE_NAME: matching_images(target, BRIDGE_IMAGE_NAME),
        RUNTIME_IMAGE_NAME: matching_images(target, RUNTIME_IMAGE_NAME),
    }


def loaded_image_state(target):
    images = mobile_easy_use_images(target)
    counts = {name: len(matches) for name, matches in images.items()}
    bridge_count = counts[BRIDGE_IMAGE_NAME]
    runtime_count = counts[RUNTIME_IMAGE_NAME]
    if bridge_count == 0 and runtime_count == 0:
        return "absent", images
    if bridge_count == 1 and runtime_count == 0:
        return "bridge-loaded", images
    if bridge_count == 1 and runtime_count == 1:
        return "already-loaded", images
    raise LoaderError(
        "MobileEasyUse images are in an inconsistent state: "
        + json.dumps(counts, separators=(",", ":"))
    )


def remote_bridge_path(target):
    if target.GetNumModules() == 0:
        raise LoaderError("the attached target has no executable module")

    executable = target.GetModuleAtIndex(0).GetPlatformFileSpec()
    executable_directory = executable.GetDirectory()
    if not executable_directory:
        raise LoaderError("the remote App executable directory is unavailable")
    app_bridge = posixpath.join(
        executable_directory,
        "Frameworks",
        BRIDGE_IMAGE_NAME,
    )
    return app_bridge


def expression_options(timeout_seconds, all_threads=False):
    options = lldb.SBExpressionOptions()
    options.SetLanguage(lldb.eLanguageTypeC)
    options.SetIgnoreBreakpoints(True)
    options.SetUnwindOnError(True)
    options.SetTrapExceptions(False)
    options.SetStopOthers(not all_threads)
    options.SetTryAllThreads(False)
    options.SetSuppressPersistentResult(True)
    options.SetTimeoutInMicroSeconds(timeout_seconds * 1_000_000)
    return options


def evaluate_cli_expression(debugger, expression, subject):
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        f"expression -l c -- {expression}",
        result,
    )
    if not result.Succeeded():
        detail = (result.GetError() or result.GetOutput() or "unknown error").strip()
        raise LoaderError(f"{subject} failed: {detail}")
    return result.GetOutput() or ""


def integer_expression_result(output, subject):
    matches = re.findall(r"=\s*(0x[0-9a-fA-F]+|[0-9]+)\s*$", output, re.MULTILINE)
    if not matches:
        raise LoaderError(f"{subject} returned no integer result: {output.strip()}")
    return int(matches[-1], 0)


def query_dyld_state(debugger):
    expression = r"""(unsigned int)({
        typedef const void *meu_dyld_process_info_t;
        struct meu_dyld_state_t {
            unsigned long long timestamp;
            unsigned int imageCount;
            unsigned int initialImageCount;
            unsigned char dyldState;
        };
        extern meu_dyld_process_info_t _dyld_process_info_create(
            unsigned int, unsigned long long, int *);
        extern void _dyld_process_info_get_state(
            meu_dyld_process_info_t, struct meu_dyld_state_t *);
        extern void _dyld_process_info_release(meu_dyld_process_info_t);
        int meu_dyld_query_error = 0;
        unsigned int meu_dyld_query_result = 0xFF;
        meu_dyld_process_info_t meu_dyld_query_info = _dyld_process_info_create(
            (unsigned int)(unsigned long)mach_task_self_, 0, &meu_dyld_query_error);
        if (meu_dyld_query_info != 0) {
            struct meu_dyld_state_t meu_dyld_query_state = {0};
            _dyld_process_info_get_state(
                meu_dyld_query_info, &meu_dyld_query_state);
            meu_dyld_query_result = meu_dyld_query_state.dyldState;
            _dyld_process_info_release(meu_dyld_query_info);
        }
        meu_dyld_query_result;
    })"""
    output = evaluate_cli_expression(debugger, expression, "dyld state query")
    return integer_expression_result(output, "dyld state query")


def wait_until_stopped(process, timeout_seconds, subject):
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        state = process.GetState()
        if state == lldb.eStateStopped:
            return
        if state in TERMINAL_FAILURE_STATES:
            raise LoaderError(f"process ended during {subject}: state={state_name(state)}")
        time.sleep(0.01)
    raise LoaderError(f"process did not stop during {subject} within {timeout_seconds} seconds")


def run_process_for(process, duration_seconds, deadline):
    run_until = min(time.monotonic() + duration_seconds, deadline)
    while time.monotonic() < run_until:
        state = process.GetState()
        if state in TERMINAL_FAILURE_STATES:
            raise LoaderError(
                f"process ended while waiting for dyld startup: state={state_name(state)}"
            )
        if state == lldb.eStateStopped:
            continue_process(process)
        time.sleep(min(0.02, max(0.0, run_until - time.monotonic())))

    if process.GetState() != lldb.eStateStopped:
        error = process.Stop()
        if error.Fail():
            raise LoaderError(f"could not stop process for dyld state query: {error.GetCString()}")
    wait_until_stopped(
        process,
        max(0.1, deadline - time.monotonic()),
        "dyld state polling",
    )


def active_dyld_frame(process):
    for thread_index in range(process.GetNumThreads()):
        thread = process.GetThreadAtIndex(thread_index)
        if thread.GetNumFrames() == 0:
            continue
        frame = thread.GetFrameAtIndex(0)
        module_name = frame.GetModule().GetFileSpec().GetFilename() or ""
        if module_name in {"dyld", "dyld_sim"}:
            function_name = frame.GetFunctionName() or frame.GetDisplayFunctionName() or "unknown"
            return f"thread={thread.GetThreadID()} {module_name}`{function_name}"
    return None


def wait_for_program_running(debugger, process, timeout_seconds):
    deadline = time.monotonic() + timeout_seconds
    last_state = None
    last_dyld_frame = None
    last_query_error = None

    while time.monotonic() < deadline:
        debugger.SetAsync(False)
        try:
            last_state = query_dyld_state(debugger)
            last_query_error = None
        except LoaderError as error:
            # Early launch stops may not be able to run even this small dyld
            # introspection expression. Treat that as "not ready" and let the
            # App advance before trying again.
            last_state = None
            last_query_error = str(error)

        if last_state == 0xFF:
            last_state = None
            last_query_error = "dyld process info was unavailable"

        if last_state == DYLD_STATE_PROGRAM_RUNNING:
            last_dyld_frame = active_dyld_frame(process)
            if last_dyld_frame is None:
                return last_state
        if last_state in {
            DYLD_STATE_TERMINATED_BEFORE_INITIALIZERS,
            DYLD_STATE_TERMINATED,
        }:
            raise LoaderError(f"dyld terminated before App startup completed: state={last_state:#x}")
        if (
            last_state is not None
            and last_state != DYLD_STATE_PROGRAM_RUNNING
            and last_state not in DYLD_STATE_RETRYABLE
        ):
            raise LoaderError(f"unexpected dyld process state: {last_state:#x}")

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        debugger.SetAsync(True)
        run_process_for(
            process,
            min(DYLD_STATE_POLL_INTERVAL_SECONDS, remaining),
            deadline,
        )

    last_state_text = f"{last_state:#x}" if last_state is not None else "unavailable"
    raise LoaderError(
        f"dyld did not become quiescent after program_running within "
        f"{timeout_seconds} seconds (last state: {last_state_text}, "
        f"active frame: {last_dyld_frame or 'none'}, "
        f"query error: {last_query_error or 'none'})"
    )


def wait_for_inferior_call_stop(
    process,
    previous_stop_id,
    timeout_seconds,
    subject,
):
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        state = process.GetState()
        if (
            state == lldb.eStateStopped
            and process.GetStopID(True) != previous_stop_id
        ):
            return
        if state in TERMINAL_FAILURE_STATES:
            raise LoaderError(
                f"process ended during {subject}: state={state_name(state)}"
            )
        time.sleep(0.01)
    raise LoaderError(
        f"process did not stop after {subject} within {timeout_seconds} seconds"
    )


def loaded_function_address(target, module_name, function_name):
    matches = []
    contexts = target.FindFunctions(function_name, lldb.eFunctionNameTypeAuto)
    for context in contexts:
        module = context.GetModule()
        symbol = context.GetSymbol()
        if (
            module.GetFileSpec().GetFilename() == module_name
            and symbol.IsValid()
            and symbol.GetName() == function_name
        ):
            address = symbol.GetStartAddress().GetLoadAddress(target)
            if address != lldb.LLDB_INVALID_ADDRESS:
                matches.append(address)
    if not matches:
        return exported_function_address(target, module_name, function_name)
    if len(matches) != 1:
        raise LoaderError(
            f"cannot resolve {module_name}`{function_name}: found {len(matches)} matches"
        )
    return matches[0]


def exported_function_address(target, module_name, function_name):
    """Memory-backed modules have no LLDB symbols in minimal mode."""
    modules = [target.GetModuleAtIndex(i) for i in range(target.GetNumModules())
               if target.GetModuleAtIndex(i).GetFileSpec().GetFilename() == module_name]
    if len(modules) != 1:
        raise LoaderError(f'cannot resolve unique loaded module {module_name}')
    module = modules[0]
    base = module.GetObjectFileHeaderAddress().GetLoadAddress(target)
    if base == lldb.LLDB_INVALID_ADDRESS:
        raise LoaderError(f'{module_name} has no loaded Mach-O header')
    process = target.GetProcess()
    header = read_memory(process, base, 32)
    size = struct.unpack_from('<I', header, 20)[0]
    if not 0 < size <= MAX_METADATA_SIZE:
        raise LoaderError('invalid export load-command size')
    try:
        trie, size, ranges = export_layout(header, read_memory(process, base + 32, size), base)
        address = base + regular_export_offset(read_memory(process, trie, size), ('_' + function_name).encode())
    except ValueError as error:
        raise LoaderError(f'cannot resolve {module_name}`{function_name} from exports: {error}') from error
    if not any(start <= address < end for start, end in ranges):
        raise LoaderError('resolved export is outside executable segments')
    print('MEU_EXPORT_RESOLVED ' + json.dumps({
        'module': module_name, 'uuid': module.GetUUIDString(),
        'symbol': function_name, 'address': address,
    }), flush=True)
    return address


def page_plan_thread(process):
    candidates = []
    for thread in process:
        reason = thread.GetStopReason()
        if reason in (lldb.eStopReasonNone, lldb.eStopReasonInvalid, lldb.eStopReasonPlanComplete):
            continue
        frame = thread.GetFrameAtIndex(0)
        if (reason not in (lldb.eStopReasonException, lldb.eStopReasonSignal)
                or frame.GetModule().GetFileSpec().GetFilename() != RUNTIME_IMAGE_NAME):
            raise LoaderError(f'unexpected stop during dlopen: {thread.GetStopDescription(256)} '
                              f'(thread={thread.GetThreadID()}, pc={frame.GetPC():#x}, sp={frame.GetSP():#x})')
        if read_memory(process, frame.GetPC(), 4) != PAGE_PLAN_BREAK:
            raise LoaderError(f'unexpected Runtime trap: {thread.GetStopDescription(256)}')
        candidates.append(thread)
    if len(candidates) > 1:
        raise LoaderError('concurrent Runtime page-plan stops are unsupported')
    return candidates[0] if candidates else None


def service_page_plan(thread):
    frame = thread.GetFrameAtIndex(0)
    process = thread.GetProcess()
    def register(name):
        value = frame.FindRegister(name)
        error = lldb.SBError()
        number = value.GetValueAsUnsigned(error)
        if not value.IsValid() or error.Fail():
            raise LoaderError(f'cannot read page-plan register {name}')
        return number
    if (register('x1'), register('x2'), register('x3')) != (1337, 1337, 3):
        raise LoaderError('unrecognized Frida breakpoint protocol')
    size, address = register('x4'), register('x5')
    if not 4 <= size <= MAX_PAGE_PLAN_SIZE:
        raise LoaderError('invalid page plan size')
    try:
        writes = page_plan_writes(read_memory(process, address, size))
    except ValueError as error:
        raise LoaderError(f'invalid page plan: {error}') from error
    # Validate every original byte before any write. Writes intentionally
    # re-store identical bytes through debugserver to prepare executable pages.
    for destination, data in writes:
        if read_memory(process, destination, len(data)) != data:
            raise LoaderError('page bytes differ from the submitted plan')
    for destination, data in writes:
        error = lldb.SBError()
        written = process.WriteMemory(destination, data, error)
        if error.Fail() or written != len(data):
            raise LoaderError(f'page-plan debugger write failed: {error}')
    pc = frame.GetPC()
    if not frame.FindRegister('x0').SetValueFromCString('0x1337') or not frame.SetPC(pc + 4):
        raise LoaderError('cannot acknowledge page plan')
    print('MEU_PAGE_PLAN ' + json.dumps({'thread': thread.GetThreadID(), 'writes': len(writes)}), flush=True)


def evaluate_dlopen(target, expression, options, timeout_seconds, enable_page_plans):
    if not enable_page_plans:
        return target.EvaluateExpression(expression, options)
    process = target.GetProcess()
    error = lldb.SBError()
    slot = process.AllocateMemory(8, lldb.ePermissionsReadable | lldb.ePermissionsWritable, error)
    if error.Fail() or slot == lldb.LLDB_INVALID_ADDRESS:
        raise LoaderError(f'cannot allocate dlopen result slot: {error}')
    completed = False
    try:
        written = process.WriteMemory(slot, b'\0' * 8, error)
        if error.Fail() or written != 8:
            raise LoaderError('cannot initialize dlopen result slot')
        options.SetUnwindOnError(False)
        deadline = time.monotonic() + timeout_seconds
        # Store the real return value before LLDB restores the expression frame.
        # The expression is submitted once, even if initialization yields traps.
        value = target.EvaluateExpression(f'*(void **){slot:#x} = ({expression})', options)
        if value.GetError().Success():
            handle = struct.unpack('<Q', read_memory(process, slot, 8))[0]
            data = lldb.SBData.CreateDataFromUInt64Array(lldb.eByteOrderLittle, 8, [handle])
            value = target.CreateValueFromData('dlopen_handle', data, target.GetBasicType(lldb.eBasicTypeVoid).GetPointerType())
            completed = True
            return value
        handled = 0
        while True:
            thread = page_plan_thread(process)
            if thread is None:
                if not handled:
                    return value
                handle = struct.unpack('<Q', read_memory(process, slot, 8))[0]
                if not handle:
                    raise LoaderError('continued dlopen did not return a nonzero handle')
                completed = True
                # Materialize a host-owned value before freeing the remote slot.
                data = lldb.SBData.CreateDataFromUInt64Array(lldb.eByteOrderLittle, 8, [handle])
                return target.CreateValueFromData('dlopen_handle', data, target.GetBasicType(lldb.eBasicTypeVoid).GetPointerType())
            if handled >= 128 or time.monotonic() >= deadline:
                raise LoaderError('page-plan handling exceeded dlopen limit')
            service_page_plan(thread)
            handled += 1
            debugger = target.GetDebugger()
            was_async = debugger.GetAsync()
            previous_stop = process.GetStopID(True)
            # Synchronous Continue waits for LLDB to finish processing the stop
            # and restoring the expression frame. Polling GetState/GetStopID
            # asynchronously can expose a transient internal return breakpoint.
            debugger.SetAsync(False)
            expired = threading.Event()
            def interrupt():
                expired.set()
                process.SendAsyncInterrupt()
            timer = threading.Timer(max(0.1, deadline - time.monotonic()), interrupt)
            timer.daemon = True
            timer.start()
            try:
                continue_process(process)
                if expired.is_set():
                    raise LoaderError('page-plan continuation timed out')
                wait_for_inferior_call_stop(process, previous_stop, max(0.1, deadline - time.monotonic()), 'dlopen page-plan continuation')
            finally:
                timer.cancel()
                timer.join()
                debugger.SetAsync(was_async)
    finally:
        if completed:
            process.DeallocateMemory(slot)
        # On failure the interrupted call may still refer to the slot. Leave it
        # allocated rather than freeing storage from underneath that call.


def load_image_with_sbtarget(target, path, timeout_seconds, all_threads=False):
    dlopen_address = loaded_function_address(
        target,
        "libdyld.dylib",
        "dlopen",
    )
    timeout_limit = 60 if posixpath.basename(path) == RUNTIME_IMAGE_NAME else 10
    call_timeout = min(timeout_seconds, timeout_limit)
    options = expression_options(call_timeout, all_threads)
    process = target.GetProcess()
    previous_stop_id = process.GetStopID(True)
    started = time.monotonic()
    value = evaluate_dlopen(
        target,
        f"((void *(*)(const char *, int)){dlopen_address:#x})({json.dumps(path)}, 1)",
        options,
        call_timeout,
        posixpath.basename(path) == RUNTIME_IMAGE_NAME
        and target.GetTriple().startswith('arm64'),
    )
    error = value.GetError()
    print("MEU_DLOPEN " + json.dumps({
        "path": path, "seconds": time.monotonic() - started,
        "error": error.GetCString(), "handle": value.GetValue(),
        "allThreads": all_threads,
    }), flush=True)
    if error.Fail():
        # Mapping an image does not prove that its initializers returned.
        raise LoaderError(f"direct dlopen failed: {error.GetCString()}")
    wait_for_inferior_call_stop(
        process,
        previous_stop_id,
        call_timeout,
        "direct dlopen",
    )
    if value.GetValueAsUnsigned(0) == 0:
        raise LoaderError("direct dlopen returned a null image handle")


def continue_process(process):
    error = process.Continue()
    if error.Fail():
        raise LoaderError(f"continue failed: {error.GetCString()}")


def read_memory(process, address, size):
    error = lldb.SBError()
    data = process.ReadMemory(address, size, error)
    if error.Fail() or len(data) != size:
        raise LoaderError(f"cannot read Mach-O at {address:#x}: {error.GetCString()}")
    return data


def parse_main_entry(header, commands, load_address):
    """Parse the running arm64 slice, independent of symbols and local files."""
    if len(header) != 32:
        raise LoaderError("truncated Mach-O header")
    magic, cpu, subtype, filetype, count, size, flags, reserved = struct.unpack("<8I", header)
    if magic != 0xFEEDFACF or cpu != 0x0100000C or filetype != 2:
        raise LoaderError("LC_MAIN cold loading requires an arm64 MH_EXECUTE")
    if size != len(commands) or size > 1024 * 1024 or count > size // 8:
        raise LoaderError("invalid Mach-O load command bounds")
    entries, segments = [], []
    offset = 0
    for _ in range(count):
        if offset + 8 > size:
            raise LoaderError("truncated Mach-O load command")
        command, command_size = struct.unpack_from("<II", commands, offset)
        if command_size < 8 or command_size % 8 or offset + command_size > size:
            raise LoaderError("invalid Mach-O load command size")
        if command == 0x80000028:
            if command_size != 24:
                raise LoaderError("invalid LC_MAIN size")
            entries.append(struct.unpack_from("<Q", commands, offset + 8)[0])
        elif command == 0x19:
            if command_size < 72:
                raise LoaderError("truncated LC_SEGMENT_64")
            segment = struct.unpack_from("<16sQQQQiiII", commands, offset + 8)
            segments.append(segment)
        offset += command_size
    if offset != size or len(entries) != 1:
        raise LoaderError("expected exactly one LC_MAIN; no symbol fallback")
    headers = [s for s in segments if s[3] == 0 and s[4] >= 32 + size and s[6] & 1]
    entryoff = entries[0]
    containing = [s for s in segments if s[3] <= entryoff < s[3] + s[4] and s[6] & 4]
    if len(headers) != 1 or len(containing) != 1:
        raise LoaderError("LC_MAIN is not in a unique executable file-backed segment")
    segment = containing[0]
    delta = entryoff - segment[3]
    if delta >= segment[2]:
        raise LoaderError("LC_MAIN is outside the segment virtual size")
    slide = load_address - headers[0][1]
    entry = segment[1] + delta + slide
    if entry % 4:
        raise LoaderError("unaligned arm64 LC_MAIN address")
    return {"entryoff": entryoff, "address": entry, "slide": slide,
            "headerAddress": load_address, "cpuSubtype": subtype}


def wait_for_main_entry(debugger, target, process, timeout_seconds):
    initial_state, images = loaded_image_state(target)
    print("MEU_AFTER_ATTACH " + json.dumps({
        "pid": process.GetProcessID(), "images": images,
    }), flush=True)
    if initial_state != "absent":
        raise LoaderError("a newly launched App requires both MobileEasyUse images absent after attach")
    module = target.GetModuleAtIndex(0)
    address = module.GetObjectFileHeaderAddress().GetLoadAddress(target)
    if address == lldb.LLDB_INVALID_ADDRESS:
        raise LoaderError("main executable Mach-O header is not mapped")
    header = read_memory(process, address, 32)
    size = struct.unpack_from("<I", header, 20)[0]
    if size > 1024 * 1024:
        raise LoaderError("Mach-O load commands exceed 1 MiB")
    entry = parse_main_entry(header, read_memory(process, address + 32, size), address)
    entry["module"] = module_identity(module)
    # dyld startup may replace LLDB's provisional module object. Keep this
    # one-process checkpoint absolute, rather than bound to that object's section.
    absolute_address = lldb.SBAddress(lldb.SBSection(), entry["address"])
    breakpoint = target.BreakpointCreateBySBAddress(absolute_address)
    if not breakpoint.IsValid() or breakpoint.GetNumLocations() != 1:
        target.BreakpointDelete(breakpoint.GetID())
        raise LoaderError("could not install LC_MAIN address breakpoint")
    print("MEU_ENTRY_RESOLVED " + json.dumps(entry), flush=True)
    print("MEU_ENTRY_BREAKPOINT " + str(breakpoint), flush=True)
    timed_out = threading.Event()

    def interrupt():
        timed_out.set()
        process.SendAsyncInterrupt()

    timer = threading.Timer(min(timeout_seconds, 30), interrupt)
    debugger.SetAsync(False)
    timer.start()
    try:
        started = time.monotonic()
        continue_process(process)
        print("MEU_ENTRY_STOP " + json.dumps({
            "seconds": time.monotonic() - started,
            "state": state_name(process.GetState()),
            "threads": [{"id": thread.GetThreadID(),
                         "reason": thread.GetStopDescription(256),
                         "frames": [str(thread.GetFrameAtIndex(i))
                                    for i in range(min(16, thread.GetNumFrames()))]}
                        for thread in list(process)[:4]],
            "breakpoint": str(breakpoint),
            "currentHeaderAddress": module.GetObjectFileHeaderAddress().GetLoadAddress(target),
        }), flush=True)
        if timed_out.is_set():
            raise LoaderError("LC_MAIN breakpoint timed out")
        if process.GetState() != lldb.eStateStopped:
            raise LoaderError("process did not stop at LC_MAIN")
        for thread in process:
            if thread.GetStopReason() != lldb.eStopReasonBreakpoint:
                continue
            reasons = [thread.GetStopReasonDataAtIndex(i)
                       for i in range(0, thread.GetStopReasonDataCount(), 2)]
            if breakpoint.GetID() in reasons and thread.GetFrameAtIndex(0).GetPC() == entry["address"]:
                current_module = thread.GetFrameAtIndex(0).GetModule()
                if (current_module.GetUUIDString() != entry["module"]["uuid"]
                        or current_module.GetObjectFileHeaderAddress().GetLoadAddress(target) != address):
                    raise LoaderError("main executable identity or mapping changed before LC_MAIN")
                process.SetSelectedThread(thread)
                entry["threadID"] = thread.GetThreadID()
                if loaded_image_state(target)[0] != "absent":
                    raise LoaderError("MobileEasyUse loaded before the LC_MAIN injection gate")
                print("MEU_ENTRY_HIT " + json.dumps(entry), flush=True)
                return entry
        raise LoaderError("unexpected stop before LC_MAIN; refusing injection")
    finally:
        timer.cancel()
        timer.join()
        target.BreakpointDelete(breakpoint.GetID())


def load_images_synchronously(
    debugger,
    target,
    process,
    timeout_seconds,
    wait_for_dyld,
    all_threads=False,
):
    bridge_path = remote_bridge_path(target)
    runtime_path = posixpath.join(
        posixpath.dirname(bridge_path),
        RUNTIME_IMAGE_NAME,
    )
    initial_state, images = loaded_image_state(target)
    if initial_state == "already-loaded":
        return bridge_path, None, images, "already-loaded", "existing-images"

    if wait_for_dyld:
        wait_for_program_running(debugger, process, timeout_seconds)
    if initial_state == "absent":
        load_image_with_sbtarget(target, bridge_path, timeout_seconds, all_threads)
        bridge_state, _ = loaded_image_state(target)
        if bridge_state not in {"bridge-loaded", "already-loaded"}:
            raise LoaderError(
                f"synchronous Bridge load produced unexpected image state: {bridge_state}"
            )

    # An explicit second dlopen also waits for initialization when the Bridge
    # already brought Runtime in as a dependency.
    load_image_with_sbtarget(target, runtime_path, timeout_seconds, all_threads)
    final_state, images = loaded_image_state(target)
    if final_state != "already-loaded":
        raise LoaderError(
            f"synchronous Runtime load produced unexpected image state: {final_state}"
        )
    return (
        bridge_path,
        None,
        images,
        "loaded",
        (
            "dyld-program-running+sbtarget-dlopen"
            if wait_for_dyld
            else "sbtarget-dlopen"
        ),
    )


def detach_process(process):
    error = process.Detach()
    if error.Fail():
        raise LoaderError(f"detach failed: {error.GetCString()}")


def required_environment():
    mode = os.environ.get(MODE_ENV, "")
    target_name = os.environ.get(TARGET_ENV, "")
    pid_text = os.environ.get(PID_ENV, "")
    timeout_text = os.environ.get(TIMEOUT_ENV, "")

    if mode not in {"device", "simulator"}:
        raise LoaderError(f"{MODE_ENV} must be device or simulator")
    if not target_name:
        raise LoaderError(f"{TARGET_ENV} is required")
    if not pid_text.isdigit() or int(pid_text) <= 0:
        raise LoaderError(f"{PID_ENV} must be a positive integer")
    if not timeout_text.isdigit() or int(timeout_text) <= 0:
        raise LoaderError(f"{TIMEOUT_ENV} must be a positive integer")

    return mode, target_name, int(pid_text), int(timeout_text)


def load_runtime(debugger):
    mode, target_name, expected_pid, timeout_seconds = required_environment()
    debugger.SetAsync(True)
    process = None
    wait_for_main = os.environ.get(WAIT_FOR_MAIN_ENV) == "true"
    entry = None

    try:
        target, process = wait_for_process(debugger, expected_pid, timeout_seconds)
        debugger.SetAsync(False)
        if wait_for_main:
            if mode != "device":
                raise LoaderError("LC_MAIN cold loading currently supports devices only")
            entry = wait_for_main_entry(debugger, target, process, timeout_seconds)
        image_path, image_token, images, load_state, load_method = (
            load_images_synchronously(
                debugger,
                target,
                process,
                timeout_seconds,
                wait_for_dyld=mode == "simulator",
                all_threads=wait_for_main,
            )
        )
        detach_process(process)
        return {
            "ok": True,
            "mode": mode,
            "target": target_name,
            "pid": expected_pid,
            "attachState": "stopped",
            "imagePath": image_path,
            "imageToken": image_token,
            "loadState": load_state,
            "loadMethod": "lc-main+all-threads-dlopen" if wait_for_main else load_method,
            "entryCheckpoint": entry,
            "images": images,
            "detachState": "detached",
        }
    finally:
        if process is None:
            target = debugger.GetSelectedTarget()
            if target.IsValid():
                candidate = target.GetProcess()
                if candidate.IsValid() and candidate.GetProcessID() == expected_pid:
                    process = candidate
        if process is not None and process.IsValid():
            if process.GetState() not in {lldb.eStateDetached, lldb.eStateExited}:
                process.Detach()


def run(debugger, command, result, internal_dict):
    del command, internal_dict
    try:
        payload = load_runtime(debugger)
    except Exception as error:
        result.SetError(str(error))
        return
    result.AppendMessage(json.dumps(payload, separators=(",", ":")))


def __lldb_init_module(debugger, internal_dict):
    del internal_dict
    debugger.HandleCommand(
        "command script add -f load_mobile_easy_use.run mobile-easy-use-load"
    )
