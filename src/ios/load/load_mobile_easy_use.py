import json
import os
import posixpath
import re
import time

import lldb


MODE_ENV = "MOBILE_EASY_USE_LLDB_MODE"
TARGET_ENV = "MOBILE_EASY_USE_LLDB_TARGET"
PID_ENV = "MOBILE_EASY_USE_LLDB_PID"
TIMEOUT_ENV = "MOBILE_EASY_USE_LLDB_TIMEOUT"

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


def expression_options(timeout_seconds):
    options = lldb.SBExpressionOptions()
    options.SetLanguage(lldb.eLanguageTypeC)
    options.SetIgnoreBreakpoints(True)
    options.SetUnwindOnError(True)
    options.SetTrapExceptions(False)
    options.SetStopOthers(True)
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
    if len(matches) != 1:
        raise LoaderError(
            f"cannot resolve {module_name}`{function_name}: found {len(matches)} matches"
        )
    return matches[0]


def load_image_with_sbtarget(target, path, timeout_seconds):
    dlopen_address = loaded_function_address(
        target,
        "libdyld.dylib",
        "dlopen",
    )
    options = expression_options(min(timeout_seconds, 10))
    process = target.GetProcess()
    previous_stop_id = process.GetStopID(True)
    value = target.EvaluateExpression(
        f"((void *(*)(const char *, int)){dlopen_address:#x})({json.dumps(path)}, 1)",
        options,
    )
    wait_for_inferior_call_stop(
        process,
        previous_stop_id,
        min(timeout_seconds, 10),
        "direct dlopen",
    )
    error = value.GetError()
    if error.Fail():
        load_state, _ = loaded_image_state(target)
        if load_state in {"bridge-loaded", "already-loaded"}:
            return
        raise LoaderError(f"direct dlopen failed: {error.GetCString()}")
    if value.GetValueAsUnsigned(0) == 0:
        raise LoaderError("direct dlopen returned a null image handle")


def continue_process(process):
    error = process.Continue()
    if error.Fail():
        raise LoaderError(f"continue failed: {error.GetCString()}")


def load_images_synchronously(
    debugger,
    target,
    process,
    timeout_seconds,
    wait_for_dyld,
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
        load_image_with_sbtarget(target, bridge_path, timeout_seconds)
        bridge_state, _ = loaded_image_state(target)
        if bridge_state != "bridge-loaded":
            raise LoaderError(
                f"synchronous Bridge load produced unexpected image state: {bridge_state}"
            )

    load_image_with_sbtarget(target, runtime_path, timeout_seconds)
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

    try:
        target, process = wait_for_process(debugger, expected_pid, timeout_seconds)
        debugger.SetAsync(False)
        image_path, image_token, images, load_state, load_method = (
            load_images_synchronously(
                debugger,
                target,
                process,
                timeout_seconds,
                wait_for_dyld=mode == "simulator",
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
            "loadMethod": load_method,
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
