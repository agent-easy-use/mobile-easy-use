"""Persistent LLDB owner. Breakpoint callbacks capture hits; the loop handles commands and lifecycle."""

import json
import re
from pathlib import Path
import sys
from datetime import datetime, timezone

import lldb

sys.path.insert(0, str(Path(__file__).parent))
from sources import Sources, command as lldb_command
from values import HitContext
from snapshot import snapshot
from transport import Transport


MAX_RECORDS = 10000
CALLBACK_NAME = "meu_code"

# Each worker owns exactly one session. LLDB resolves callbacks by module name.
active_session = None


def on_breakpoint(frame, location, internal_dict):
    session = active_session
    if session is None or session.closed:
        return False
    if session.pending_end or session.ended:
        return True
    breakpoint_id = location.GetBreakpoint().GetID()
    registration = session.by_breakpoint.get(breakpoint_id)
    if registration is None:
        return False
    try:
        # LLDB also invokes callbacks when native condition evaluation fails.
        session.read_diagnostics()
        if session.condition_errors.pop(breakpoint_id, None) is not None:
            return False
        session.hit(frame.GetThread(), registration)
    except Exception as error:
        fail(registration, f"framework: {error}")
        session.pending_end = str(error)
    # Unsafe evaluation must stop first; detach belongs to the outer event loop.
    return session.pending_end is not None


def fail(registration, message):
    if registration.get("error") is None:
        registration["error"] = str(message)


def result(registration, ended=None):
    error = registration.get("error") or ended
    return {"ok": error is None, "data": registration["records"], "error": error}


class Session:
    def __init__(self, debugger):
        self.debugger = debugger
        self.target = debugger.GetSelectedTarget()
        self.process = self.target.GetProcess()
        self.registrations = {}
        self.by_breakpoint = {}
        self.last_stop = -1
        self.ended = None  # End reason; Worker can still return records after target debugging ends.
        self.sources = None
        self.closed = False
        self.condition_errors = {}
        self.pending_end = None
        self.listener = debugger.GetListener()
        self.diagnostics = lldb.SBListener("code-diagnostics")
        self.diagnostics.StartListeningForEvents(debugger.GetBroadcaster(), lldb.SBDebugger.eBroadcastBitError)

    def report_error(self, error):
        print(f"[debugger] {error}", file=sys.stderr, flush=True)

    def read_diagnostics(self):
        # Separate from process events so callbacks cannot consume stop/resume notifications.
        event = lldb.SBEvent()
        while self.diagnostics.GetNextEvent(event):
            diagnostic = lldb.SBDebugger.GetDiagnosticFromEvent(event)
            if not diagnostic.IsValid():
                continue
            message = diagnostic.GetValueForKey("message").GetStringValue(16384)
            match = re.search(r"error evaluating condition of breakpoint (\d+)\.", message)
            if match:
                id_ = int(match[1])
                self.condition_errors[id_] = message
                registration = self.by_breakpoint.get(id_)
                if registration is not None:
                    fail(registration, f"condition: {message}")
            else:
                self.report_error(message)

    def stopped_event(self):
        """Drain process events; ordinary callback hits auto-resume without loop dispatch."""
        self.read_diagnostics()
        event = lldb.SBEvent()
        stopped = False
        while self.listener.GetNextEvent(event):
            if not lldb.SBProcess.EventIsProcessEvent(event):
                continue
            stopped = (lldb.SBProcess.GetStateFromEvent(event) in {lldb.eStateStopped, lldb.eStateCrashed}
                       and not lldb.SBProcess.GetRestartedFromEvent(event))
        return stopped

    def resume(self):
        # Consume the stop we just handled before resuming. StopID can advance on
        # resume while GetState still reports the old stop; only events identify
        # a new stop reliably in an asynchronous LLDB session.
        self.stopped_event()
        self.last_stop = self.process.GetStopID()
        error = self.process.Continue()
        if error.Fail():
            raise RuntimeError(error.GetCString())

    def attach(self, payload):
        """Attach to the SDK's App, prepare the debug session, and resume execution.

        Return {"symbolLoadErrors": [{"path", "resolvedPath", "message"}]} without failing attach for symbol errors.

        Input: {"device": {"kind": "device" or "simulator", "id": "..."},
                "pid": App process ID, "symbols": optional Host-resolved symbol paths}.
        Attach by local PID for a simulator; select the device before attaching by PID on a real device.
        Run attach synchronously, verify PID and stopped state, then handle events asynchronously.
        LLDB discovers symbols normally; load each configured path once and collect failures.
        Resume regardless of missing debug info; source locations are validated when adding breakpoints.
        On failure, raise and retain any target/process handles for subsequent detach cleanup.
        """
        if self.process.IsValid():
            raise RuntimeError("Debugger is already attached")
        pid = payload["pid"]
        if type(pid) is not int or pid <= 0:
            raise ValueError("Invalid debugger PID")
        device = payload["device"]
        if device["kind"] == "simulator":
            commands = [f"process attach --pid {pid}"]
        elif device["kind"] == "device":
            commands = ["device list", f"device select {json.dumps(device['id'])}",
                        f"device process attach -p {pid}"]
        else:
            raise ValueError("Unsupported device kind")
        lldb_command(self.debugger, "settings set symbols.enable-external-lookup true")
        self.debugger.SetAsync(False)
        try:
            for command in commands:
                lldb_command(self.debugger, command)
        finally:
            # Retain a partially attached process so detach can clean it up.
            self.target = self.debugger.GetSelectedTarget()
            self.process = self.target.GetProcess()
            self.debugger.SetAsync(True)
        if self.process.GetProcessID() != payload["pid"]:
            raise RuntimeError("Attached process does not match the SDK process")
        if self.process.GetState() != lldb.eStateStopped:
            raise RuntimeError("LLDB attach did not stop the process")
        # Own target events as well as process events. Breakpoint-change events keep
        # removed breakpoints alive until after LLDB finishes updating its list.
        self.listener.StartListeningForEvents(self.target.GetBroadcaster(), lldb.SBTarget.eBroadcastBitBreakpointChanged)
        self.sources = Sources(self.debugger, payload.get("symbols", []))
        # Compiling a Python callback initializes lldb.frame. Do it once while
        # attach has the App stopped; compiling after auto-continue can cache a
        # stale running-thread frame. Named options let later breakpoints reuse
        # the callback without entering the Python compiler again.
        callback = lldb.SBBreakpointName(self.target, CALLBACK_NAME)
        error = callback.SetScriptCallbackFunction(__name__ + ".on_breakpoint", lldb.SBStructuredData())
        if error.Fail():
            raise RuntimeError(error.GetCString())
        self.resume()
        return {"symbolLoadErrors": self.sources.symbol_load_errors}

    def add(self, payload):
        """Add a breakpoint directly through LLDB without pausing or resuming the App.

        Input: {"id": "debugger-1", "definition": {"breakpoint": {...}, ...}}.
        The SDK generates id for later removal; it differs from LLDB's bp.GetID().
        Create an enabled source/address breakpoint, verify resolved locations, then set its native condition.
        Index the same registration by SDK id and LLDB breakpoint id for removal and hit handling.
        Return {"locations": resolved location count}; delete the new breakpoint and raise on failure.
        """
        if self.sources is None:
            raise RuntimeError("Debugger session is not initialized")
        if self.ended:
            raise RuntimeError(self.ended)
        if self.process.GetState() in {lldb.eStateExited, lldb.eStateDetached}:
            raise RuntimeError("Debugged process has ended")
        bp = None
        try:
            id_ = payload["id"]
            if id_ in self.registrations:
                raise ValueError("Duplicate debugger registration")
            definition = payload["definition"]
            location = definition["breakpoint"]
            if location["kind"] == "source":
                bp = self.sources.breakpoint(location["file"], location["line"])
            elif location["kind"] == "address":
                address = int(location["address"], 16)
                if not self.target.ResolveLoadAddress(address).IsValid():
                    raise ValueError("Breakpoint address is not in a loaded image")
                bp = self.target.BreakpointCreateByAddress(address)
            else:
                raise ValueError("Unsupported breakpoint kind")
            if not bp.IsValid() or not bp.GetNumResolvedLocations():
                raise RuntimeError("Breakpoint has no resolved executable location")
            # Reject ambiguous writes before any callback can modify the frame.
            addresses = {item.GetAddress().GetLoadAddress(self.target) for item in bp}
            mutates = definition.get("overrides") or "earlyReturn" in definition
            for existing in self.by_breakpoint.values():
                previous = existing["definition"]
                if mutates or previous.get("overrides") or "earlyReturn" in previous:
                    other = self.target.FindBreakpointByID(existing["breakpointId"])
                    if any(item.GetAddress().GetLoadAddress(self.target) in addresses for item in other):
                        raise ValueError("Overlapping code registrations involving an override are unsupported")
            if "condition" in location:
                bp.SetCondition(location["condition"])
            registration = {**payload, "breakpointId": bp.GetID(), "sequence": 0,
                            "records": []}
            self.registrations[id_] = registration
            self.by_breakpoint[bp.GetID()] = registration
            if not bp.AddName(CALLBACK_NAME):
                raise RuntimeError("Could not apply debugger callback")
            return {"locations": bp.GetNumResolvedLocations()}
        except Exception:
            if bp and bp.IsValid():
                self.by_breakpoint.pop(bp.GetID(), None)
                self.registrations.pop(payload["id"], None)
                self.delete_breakpoint(bp.GetID())
            raise

    def delete_breakpoint(self, id_):
        if not self.target.BreakpointDelete(id_):
            raise RuntimeError("Could not delete breakpoint")

    def current(self, payload):
        registration = self.registrations[payload["id"]]
        return result(registration, self.ended)

    def remove(self, payload):
        """Delete the breakpoint and return existing records without pausing or processing pending hits."""
        registration = self.registrations.get(payload["id"])
        if registration is None:
            raise ValueError("Debugger registration not found")
        # Return collected records only; do not pause or process a final pending hit.
        # Ended sessions leave the App alone; failed detach retains the index for cleanup retries.
        if not self.ended:
            id_ = registration["breakpointId"]
            self.delete_breakpoint(id_)
            self.by_breakpoint.pop(id_)
        self.condition_errors.pop(registration["breakpointId"], None)
        self.registrations.pop(payload["id"])
        return result(registration, self.ended)

    def hit(self, thread, registration):
        """Condition → capture → overrides → earlyReturn; append after completion.

        All code APIs share this path. Values are JSON snapshots, errors are
        sticky per registration, and failed items do not erase successful values.
        """
        definition = registration["definition"]
        context = HitContext(thread)
        if len(registration["records"]) >= MAX_RECORDS:
            fail(registration, "Code capture limit reached")
            # Recording limits must not disable an installed override.
            if not definition.get("overrides") and "earlyReturn" not in definition:
                return
        registration["sequence"] += 1
        record = {"hitId": f'h{registration["sequence"]}',
                  "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                  "threadId": thread.GetThreadID(), "threadName": thread.GetName()}
        def error_at(stage, error):
            fail(registration, f"{stage}, hit {record['hitId']}: {error}")
        try:
            if definition.get("stack"):
                try:
                    record["stack"] = context.stack(definition["stack"])
                except Exception as error:
                    error_at("stack", error)
                    if context.unsafe:
                        return
            if "capture" in definition:
                record["capture"] = {}
                for name, code in definition["capture"].items():
                    try:
                        record["capture"][name] = snapshot(context, context.evaluate(code))
                    except Exception as error:
                        error_at(f"capture {name}", error)
                        if context.unsafe:
                            return
            for name, code in definition.get("overrides", {}).items():
                try:
                    context.override(name, code)
                except Exception as error:
                    error_at(f"overrides {name}", error)
                    if context.unsafe:
                        return
            if "earlyReturn" in definition:
                try:
                    context.frame()
                    context.early_return(definition["earlyReturn"])
                except Exception as error:
                    error_at("earlyReturn", error)
                    if not context.unsafe:
                        context.frame()
        except Exception as error:
            error_at("framework", error)
        finally:
            if len(registration["records"]) < MAX_RECORDS:
                registration["records"].append(record)
            if context.unsafe:
                self.pending_end = context.unsafe

    def end_session(self, reason):
        """End target debugging but keep Worker/records; remove retrieves records and detach closes Worker."""
        self.ended = reason
        try:
            self.detach(close_worker=False)
        except Exception as error:
            self.ended += f"; detach failed: {error}"
        self.report_error(self.ended)
        for registration in self.registrations.values():
            fail(registration, f"framework: {self.ended}")

    def handle_stop(self):
        """Handle diagnostic/fatal stops only; callbacks have already processed normal hits."""
        if self.pending_end:
            reason, self.pending_end = self.pending_end, None
            self.end_session(reason)
            return False
        if (self.ended or self.process.GetState() not in {lldb.eStateStopped, lldb.eStateCrashed}
                or self.process.GetStopID() == self.last_stop):
            return False
        self.last_stop = self.process.GetStopID()
        fatal = []
        for thread in self.process:
            reason = thread.GetStopReason()
            if reason == lldb.eStopReasonSignal:
                name = self.process.GetUnixSignals().GetSignalAsCString(thread.GetStopReasonDataAtIndex(0))
                if name in {"SIGSEGV", "SIGBUS", "SIGILL", "SIGABRT", "SIGFPE"}:
                    fatal.append(thread.GetStopDescription(1024))
            elif reason == lldb.eStopReasonException:
                description = thread.GetStopDescription(1024) or ""
                # Explicit Darwin exceptions; notifications such as thread creation are excluded.
                if description.startswith(("EXC_BAD_ACCESS", "EXC_BAD_INSTRUCTION",
                                           "EXC_ARITHMETIC", "EXC_BREAKPOINT", "EXC_CRASH", "EXC_GUARD")):
                    fatal.append(description)
        if fatal or self.process.GetState() == lldb.eStateCrashed:
            self.end_session("Target exception: " + ("; ".join(fatal) or "process crashed"))
            return False
        self.last_stop = self.process.GetStopID()
        return True

    def detach(self, close_worker=True):
        """Detach and return None; raise if stopping, deleting breakpoints, or detaching fails.

        Stop a running target, delete our breakpoints and index entries, then call LLDB Detach.
        Keep registration records. Clear the process handle on success to avoid duplicate detach during state lag.
        For an invalid, exited, or detached process, set closed and return immediately.
        close_worker=True (default) ends run's loop, which closes the channel and destroys the debugger.
        end_session passes False to keep Worker available for subsequent record retrieval through remove.
        """
        if not self.process.IsValid() or self.process.GetState() in {lldb.eStateExited, lldb.eStateDetached}:
            self.closed = close_worker
            return
        if self.process.GetState() in {lldb.eStateRunning, lldb.eStateStepping}:
            error = self.process.Stop()
            if error.Fail():
                raise RuntimeError(error.GetCString())
        for id_ in list(self.by_breakpoint):
            self.delete_breakpoint(id_)
            self.by_breakpoint.pop(id_)
        error = self.process.Detach()
        if error.Fail():
            raise RuntimeError(error.GetCString())
        # Detach succeeded; public state may still say stopped briefly. Do not detach the old handle again.
        self.process = lldb.SBProcess()
        self.closed = close_worker


def run(debugger, command, result, internal_dict):
    """Entry point for `meu-debugger`: run the persistent Worker inside the current LLDB process.

    debugger is the CLI-provided instance; create a separate debugger instance below, not another process.
    command contains command arguments; internal_dict is LLDB's script dictionary. Neither is used here.
    result is the command result object, used only to report failures of Worker as a whole.
    Reply to Node requests through Transport, independently of this result object.
    """
    # Isolate protocol output first; a separate debugger prevents the CLI event thread from consuming App stops.
    global active_session
    channel = Transport()
    debugger = lldb.SBDebugger.Create()
    session = None
    try:
        # The separate debugger needs the callback module in its own Python namespace.
        lldb_command(debugger, "script import worker")
        session = Session(debugger)
        active_session = session
        # ready means Worker accepts commands; it has not attached to the App yet.
        channel.send({"type": "ready"})
        while not session.closed and not channel.closed:
            # Callbacks process hits while LLDB runs; this loop owns commands and cleanup.
            for message in channel.receive():
                try:
                    action = message["action"]
                    if action == "detach":
                        session.detach()
                        value = None
                    elif action in {"attach", "add", "remove", "current"}:
                        value = getattr(session, action)(message["payload"])
                    else:
                        raise ValueError("Unknown debugger action")
                    reply = {"id": message["id"], "ok": True, "value": value}
                except Exception as error:
                    # Reply with the same id on command failure; keep Worker running.
                    reply = {"id": message["id"], "ok": False, "error": str(error)}
                channel.send(reply)
                if session.closed:
                    break
            if channel.closed:
                break
            if session.sources and not session.closed:
                # Ordinary callbacks auto-resume; handle remaining diagnostic/fatal stops.
                # App exit does not terminate Worker; remove can still retrieve buffered records.
                if session.stopped_event() and not session.ended:
                    handled = session.handle_stop()
                    if handled and not session.ended:
                        try:
                            session.resume()
                        except Exception as error:
                            session.end_session(f"Could not resume target: {error}")
    except Exception as error:
        # Channel/event-loop failures end the command; LLDB reports the diagnostic.
        result.SetError(str(error))
    finally:
        # Normal detach, stdin closure, and exceptional exits all reach this cleanup.
        # Attempt detach before closing protocol output and destroying the separate debugger.
        try:
            if session and not session.closed:
                session.detach()
        finally:
            active_session = None
            channel.close()
            lldb.SBDebugger.Destroy(debugger)


def __lldb_init_module(debugger, internal_dict):
    """Module initialization hook called by LLDB's `command script import worker.py`.

    Only register `meu-debugger` → worker.run here; do not start the event loop or attach.
    Node's subsequent `-o meu-debugger` calls run; see session.js for both steps.
    """
    debugger.HandleCommand("command script add -f worker.run meu-debugger")
