import json
import os
import posixpath
import struct
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
LC_DYLD_INFO_ONLY = 0x80000022
LC_DYLD_EXPORTS_TRIE = 0x80000033
LC_SEGMENT_64 = 0x19
EXPORT_SYMBOL_FLAGS_REEXPORT = 0x08
BOOTSTRAP_STATUS_MAGIC = 0x4D455542
BOOTSTRAP_ERROR_SIZE = 256
BOOTSTRAP_STATUS_FORMAT = f"<Ii{BOOTSTRAP_ERROR_SIZE}s"


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
        return "bootstrap-loaded", images
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


def bridge_function_address(target, function_name):
    bridges = matching_images(target, BRIDGE_IMAGE_NAME)
    if len(bridges) != 1:
        raise LoaderError(
            f"cannot resolve {function_name}: expected one {BRIDGE_IMAGE_NAME}"
        )
    return exported_symbol_address(target, bridges[0]["path"], f"_{function_name}")


def evaluate_int_function(target, function_name, timeout_seconds):
    address = bridge_function_address(target, function_name)
    value = target.EvaluateExpression(
        f"((int (*)(void)){address:#x})()",
        expression_options(min(timeout_seconds, 5)),
    )
    error = value.GetError()
    if error.Fail():
        raise LoaderError(f"{function_name} failed: {error.GetCString()}")
    return value.GetValueAsSigned(-1)


def bootstrap_error(target, timeout_seconds):
    address = bridge_function_address(
        target,
        "mobile_easy_use_runtime_bootstrap_error",
    )
    value = target.EvaluateExpression(
        f"((const char *(*)(void)){address:#x})()",
        expression_options(min(timeout_seconds, 5)),
    )
    if value.GetError().Fail():
        return "bootstrap error is unavailable"
    return value.GetSummary() or value.GetValue() or "unknown bootstrap error"


def legacy_bootstrap_status(target, timeout_seconds, fallback_reason):
    state = evaluate_int_function(
        target,
        "mobile_easy_use_runtime_bootstrap_state",
        timeout_seconds,
    )
    error = bootstrap_error(target, timeout_seconds) if state == -1 else ""
    return state, error, f"legacy-functions ({fallback_reason})"


def bootstrap_status(target, timeout_seconds):
    try:
        address = bridge_function_address(
            target,
            "mobile_easy_use_runtime_bootstrap_status",
        )
        raw = read_process_memory(
            target.GetProcess(),
            address,
            struct.calcsize(BOOTSTRAP_STATUS_FORMAT),
            "MobileEasyUse bootstrap status",
        )
        magic, state, error_bytes = struct.unpack(BOOTSTRAP_STATUS_FORMAT, raw)
        if magic != BOOTSTRAP_STATUS_MAGIC:
            return legacy_bootstrap_status(
                target,
                timeout_seconds,
                f"invalid status magic {magic:#x}",
            )
        error = error_bytes.split(b"\0", 1)[0].decode("utf-8", errors="replace")
        return state, error, "shared-status"
    except LoaderError as error:
        return legacy_bootstrap_status(target, timeout_seconds, str(error))


def read_process_memory(process, address, size, subject):
    error = lldb.SBError()
    data = process.ReadMemory(address, size, error)
    if error.Fail() or len(data) != size:
        message = error.GetCString() if error.Fail() else f"read {len(data)} of {size} bytes"
        raise LoaderError(f"failed to read {subject}: {message}")
    return data


def read_uleb128(data, offset):
    value = 0
    shift = 0
    while offset < len(data):
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte & 0x80 == 0:
            return value, offset
        shift += 7
        if shift >= 64:
            break
    raise LoaderError("invalid ULEB128 value in Mach-O export trie")


def export_offset(export_trie, symbol_name):
    node_offset = 0
    remaining = symbol_name
    visited = set()
    while node_offset not in visited and node_offset < len(export_trie):
        visited.add(node_offset)
        terminal_size, cursor = read_uleb128(export_trie, node_offset)
        terminal_offset = cursor
        children_offset = terminal_offset + terminal_size
        if children_offset >= len(export_trie):
            raise LoaderError("invalid Mach-O export trie node")
        if not remaining and terminal_size:
            flags, cursor = read_uleb128(export_trie, terminal_offset)
            if flags & EXPORT_SYMBOL_FLAGS_REEXPORT:
                raise LoaderError(f"{symbol_name} is unexpectedly re-exported")
            address, _ = read_uleb128(export_trie, cursor)
            return address

        child_count = export_trie[children_offset]
        cursor = children_offset + 1
        next_node = None
        for _ in range(child_count):
            edge_end = export_trie.find(b"\0", cursor)
            if edge_end < 0:
                raise LoaderError("unterminated edge in Mach-O export trie")
            edge = export_trie[cursor:edge_end].decode("utf-8")
            child_offset, cursor = read_uleb128(export_trie, edge_end + 1)
            if next_node is None and remaining.startswith(edge):
                remaining = remaining[len(edge):]
                next_node = child_offset
        if next_node is None:
            return None
        node_offset = next_node
    return None


def exported_symbol_address(target, module_path, symbol_name):
    module = next(
        (candidate for candidate in target.modules
         if str(candidate.GetPlatformFileSpec()) == module_path),
        None,
    )
    if module is None:
        raise LoaderError(f"{module_path} is not loaded")
    header_address = module.GetObjectFileHeaderAddress().GetLoadAddress(target)
    process = target.GetProcess()
    header = read_process_memory(process, header_address, 32, f"{module_path} header")
    if struct.unpack_from("<I", header)[0] != 0xFEEDFACF:
        raise LoaderError(f"{module_path} does not have a 64-bit Mach-O header")
    command_count, command_size = struct.unpack_from("<II", header, 16)
    commands = read_process_memory(
        process,
        header_address + 32,
        command_size,
        f"{module_path} load commands",
    )
    export_file_offset = None
    export_size = None
    image_vm_address = None
    linkedit_vm_address = None
    linkedit_file_offset = None
    cursor = 0
    for _ in range(command_count):
        if cursor + 8 > len(commands):
            raise LoaderError(f"invalid load commands in {module_path}")
        command, size = struct.unpack_from("<II", commands, cursor)
        if size < 8 or cursor + size > len(commands):
            raise LoaderError(f"invalid load command size in {module_path}")
        if command == LC_SEGMENT_64 and size >= 72:
            segment_name = commands[cursor + 8:cursor + 24].split(b"\0", 1)[0]
            vm_address = struct.unpack_from("<Q", commands, cursor + 24)[0]
            file_offset = struct.unpack_from("<Q", commands, cursor + 40)[0]
            if file_offset == 0:
                image_vm_address = vm_address
            if segment_name == b"__LINKEDIT":
                linkedit_vm_address = vm_address
                linkedit_file_offset = file_offset
        if command == LC_DYLD_EXPORTS_TRIE:
            export_file_offset, export_size = struct.unpack_from("<II", commands, cursor + 8)
            break
        if command == LC_DYLD_INFO_ONLY:
            export_file_offset, export_size = struct.unpack_from("<II", commands, cursor + 40)
        cursor += size
    if export_file_offset is None or not export_size:
        raise LoaderError(f"{module_path} has no export trie")
    if None in {image_vm_address, linkedit_vm_address, linkedit_file_offset}:
        raise LoaderError(f"{module_path} has no usable __LINKEDIT segment")
    export_address = (
        header_address
        + linkedit_vm_address
        - image_vm_address
        + export_file_offset
        - linkedit_file_offset
    )
    trie = read_process_memory(process, export_address, export_size, f"{module_path} exports")
    address_offset = export_offset(trie, symbol_name)
    if address_offset is None:
        raise LoaderError(f"{symbol_name} is not exported by {module_path}")
    return header_address + address_offset


def load_image_without_dlerror(target, path, timeout_seconds):
    dlopen_address = exported_symbol_address(
        target,
        "/usr/lib/system/libdyld.dylib",
        "_dlopen",
    )
    options = expression_options(min(timeout_seconds, 10))
    options.SetUnwindOnError(False)
    value = target.EvaluateExpression(
        f"((void *(*)(const char *, int)){dlopen_address:#x})({json.dumps(path)}, 1)",
        options,
    )
    error = value.GetError()
    if error.Fail():
        load_state, _ = loaded_image_state(target)
        if load_state in {"bootstrap-loaded", "already-loaded"}:
            return
        raise LoaderError(f"direct dlopen failed: {error.GetCString()}")
    if value.GetValueAsUnsigned(0) == 0:
        raise LoaderError("direct dlopen returned a null image handle")


def continue_process(process):
    error = process.Continue()
    if error.Fail():
        raise LoaderError(f"continue failed: {error.GetCString()}")


def wait_for_runtime_load(target, process, timeout_seconds):
    deadline = time.monotonic() + timeout_seconds
    last_interrupt = 0.0
    continue_process(process)
    time.sleep(0.5)

    while time.monotonic() < deadline:
        state = process.GetState()
        if state in TERMINAL_FAILURE_STATES:
            raise LoaderError(
                "process ended while MobileEasyUseRuntime was loading: "
                f"state={state_name(state)}"
            )
        if state == lldb.eStateStopped:
            load_state, images = loaded_image_state(target)
            bootstrap_state, bootstrap_message, bootstrap_source = bootstrap_status(
                target, timeout_seconds
            )
            if load_state == "already-loaded":
                return images, bootstrap_source

            if bootstrap_state == -1:
                raise LoaderError(
                    "MobileEasyUseRuntime bootstrap failed: "
                    + (bootstrap_message or "unknown bootstrap error")
                )
            if bootstrap_state not in {0, 1}:
                raise LoaderError(
                    f"unexpected MobileEasyUseRuntime bootstrap state: {bootstrap_state}"
                )

            # Ignore unrelated App stops while the bootstrap worker is loading.
            continue_process(process)
            time.sleep(0.5)
            continue
        now = time.monotonic()
        if now - last_interrupt >= 0.5:
            process.SendAsyncInterrupt()
            last_interrupt = now
        time.sleep(0.1)

    if process.GetState() != lldb.eStateStopped:
        process.Stop()
    raise LoaderError(
        f"MobileEasyUseRuntime did not finish loading within {timeout_seconds} seconds"
    )


def load_bridge(target, timeout_seconds):
    path = remote_bridge_path(target)
    load_state, images = loaded_image_state(target)
    if load_state == "already-loaded":
        _, _, bootstrap_source = bootstrap_status(target, timeout_seconds)
        return path, None, images, load_state, bootstrap_source

    image_token = None
    if load_state == "absent":
        error = lldb.SBError()
        image_token = target.GetProcess().LoadImage(lldb.SBFileSpec(path), error)
        if error.Fail() or image_token == lldb.LLDB_INVALID_IMAGE_TOKEN:
            message = error.GetCString() if error.Fail() else "invalid image token"
            if "dlerror" not in message:
                raise LoaderError(f"failed to load bootstrap {path}: {message}")
            load_image_without_dlerror(target, path, timeout_seconds)
            image_token = None

    load_state, images = loaded_image_state(target)
    if load_state == "already-loaded":
        _, _, bootstrap_source = bootstrap_status(target, timeout_seconds)
        return path, image_token, images, "loaded", bootstrap_source
    if load_state != "bootstrap-loaded":
        raise LoaderError(
            "MobileEasyUse bootstrap did not load without Runtime: "
            + json.dumps(
                {name: len(matches) for name, matches in images.items()},
                separators=(",", ":"),
            )
        )

    images, bootstrap_source = wait_for_runtime_load(
        target, target.GetProcess(), timeout_seconds
    )
    return (
        path,
        image_token,
        images,
        "loaded",
        bootstrap_source,
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
        image_path, image_token, images, load_state, bootstrap_source = load_bridge(
            target,
            timeout_seconds,
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
            "bootstrapStatusSource": bootstrap_source,
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
