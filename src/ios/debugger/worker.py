"""Persistent LLDB owner. One loop serializes commands, stops and inferior calls."""

import json
import re
from pathlib import Path
import sys
import time

import lldb

sys.path.insert(0, str(Path(__file__).parent))
from sources import Sources, command as lldb_command
from values import HitContext
from snapshot import snapshot
from transport import Transport


def add_error(record, stage, error, name=None):
    item = {"stage": stage, "message": str(error)[:4096]}
    if name is not None:
        item["name"] = name
    record.setdefault("errors", []).append(item)


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
        self.listener = debugger.GetListener()
        self.condition_errors = {}
        self.listener.StartListeningForEvents(debugger.GetBroadcaster(), lldb.SBDebugger.eBroadcastBitError)

    def report_error(self, error):
        print(f"[debugger] {error}", file=sys.stderr, flush=True)

    def stopped_event(self):
        """Drain listener events without blocking, collect diagnostics, and detect a pending stop.

        Save condition errors by LLDB breakpoint ID for handle_stop; send other diagnostics to stderr.
        Return True if the last process event is stopped/crashed and LLDB has not restarted it.
        Return False without a process event; breakpoint changes and diagnostics do not override the result.
        Only consume events here. run dispatches hits through handle_stop; resume also drains old events.
        """
        event = lldb.SBEvent()
        stopped = False
        while self.listener.GetNextEvent(event):
            diagnostic = lldb.SBDebugger.GetDiagnosticFromEvent(event)
            if diagnostic.IsValid():
                message = diagnostic.GetValueForKey("message").GetStringValue(16384)
                match = re.search(r"error evaluating condition of breakpoint (\d+)\.", message)
                if match:
                    self.condition_errors[int(match[1])] = message
                else:
                    self.report_error(message)
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

        Return {"symbolSource": "lldb" | "dsymPath" | "executable"}, identifying the main-module line-table source.

        Input: {"device": {"kind": "device" or "simulator", "id": "..."},
                "pid": App process ID, "build": optional build symbol paths}.
        Attach by local PID for a simulator; select the device before attaching by PID on a real device.
        Run attach synchronously, verify PID and stopped state, then handle events asynchronously.
        Prefer LLDB-discovered line tables; otherwise try build.dsymPath, then build.executable.
        Resume after verifying main-module line tables; stale hints do not prevent automatic discovery.
        Missing debug info fails attach with the module path and UUID, rather than deferring failure to add.
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
        self.sources = Sources(self.debugger, payload.get("build", {}))
        self.resume()
        return {"symbolSource": self.sources.symbol_source}

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
            if "condition" in location:
                bp.SetCondition(location["condition"])
            registration = {**payload, "breakpointId": bp.GetID(), "sequence": 0,
                            "records": []}
            self.registrations[id_] = registration
            self.by_breakpoint[bp.GetID()] = registration
            return {"locations": bp.GetNumResolvedLocations()}
        except Exception:
            if bp and bp.IsValid():
                self.delete_breakpoint(bp.GetID())
            raise

    def delete_breakpoint(self, id_):
        if not self.target.BreakpointDelete(id_):
            raise RuntimeError("Could not delete breakpoint")

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
        self.registrations.pop(payload["id"])
        return registration["records"]

    def hit(self, thread, registration, stop_error=None):
        """Handle an identified breakpoint hit and append its result to the registration's records.

        thread is the hit thread; registration contains the definition and buffered records.
        Optional stop_error is (stage, message); if supplied, record only the error without running actions.
        Normally execute stack → observations → overrides → earlyReturn in that order.
        Record errors independently; ordinary failures do not skip later actions or roll back prior changes.
        If the original frame is unsafe to use, stop executing actions, save the record, and end debugging.
        This method does not resume the App; the outer stop handler decides whether to resume.

        records is an array of hits returned as JSON by stop(), for example:
        [
          {
            "hitId": "h1",
            "timestamp": 1791500000.25,
            "thread": {"id": "123", "name": "main"},
            "stack": [
              {
                "index": 0, "function": "PriceService.calculate()",
                "module": "MyApp", "address": "0x100012340",
                "file": "/project/PriceService.swift", "line": 43
              }
            ],
            "observations": {"price": 100, "name": "Product", "optional": null},
            "errors": [
              {"stage": "observations", "name": "missing", "message": "Variable is unavailable"}
            ]
          }
        ]
        timestamp is Unix seconds; stack/observations follow the definition; errors appears only on failure.
        Failed observations are omitted; successful overrides/earlyReturn add no result fields.
        """
        registration["sequence"] += 1
        record = {"hitId": f'h{registration["sequence"]}', "timestamp": time.time(),
                  "thread": {"id": str(thread.GetThreadID()), "name": thread.GetName()}}
        if stop_error:
            stage, message = stop_error
            add_error(record, stage, message)
            registration["records"].append(record)
            return
        context = HitContext(thread)
        definition = registration["definition"]
        try:
            if "stack" in definition:
                try:
                    record["stack"] = context.stack(definition["stack"])
                except Exception as error:
                    add_error(record, "stack", error)
                    if context.unsafe:
                        return
            if definition["observations"]:
                record["observations"] = {}
                for name, code in definition["observations"].items():
                    try:
                        record["observations"][name] = snapshot(context, context.evaluate(code))
                    except Exception as error:
                        add_error(record, "observations", error, name)
                        if context.unsafe:
                            return
            for name, code in definition["overrides"].items():
                try:
                    context.override(name, code)
                except Exception as error:
                    add_error(record, "overrides", error, name)
                    if context.unsafe:
                        return
            context.frame()
            if "earlyReturn" in definition:
                try:
                    context.early_return(definition["earlyReturn"])
                except Exception as error:
                    add_error(record, "earlyReturn", error)
                    if not context.unsafe:
                        context.frame()
        except Exception as error:
            add_error(record, "framework", error)
        finally:
            # Also runs when an unsafe stage returns early: preserve its error once.
            registration["records"].append(record)
            if context.unsafe:
                self.end_session(context.unsafe)

    def end_session(self, reason):
        """End target debugging but keep Worker/records; remove retrieves records and detach closes Worker."""
        self.ended = reason
        thread = self.process.GetSelectedThread()
        try:
            self.detach(close_worker=False)
        except Exception as error:
            self.ended += f"; detach failed: {error}"
        self.report_error(self.ended)
        for registration in self.registrations.values():
            self.hit(thread, registration, ("framework", self.ended))
        self.condition_errors.clear()

    def handle_stop(self):
        """Dispatch our breakpoints, resume other ordinary stops, and end on serious exceptions while keeping records.

        Scan every thread before handling hits so one thread's breakpoint cannot hide another's exception.
        Return True when this stop is handled; the event loop resumes if the session has not ended.
        """
        if (self.ended or self.process.GetState() not in {lldb.eStateStopped, lldb.eStateCrashed}
                or self.process.GetStopID() == self.last_stop):
            return False
        self.last_stop = self.process.GetStopID()
        hits = []
        fatal = []
        for thread in self.process:
            reason = thread.GetStopReason()
            if reason == lldb.eStopReasonBreakpoint:
                ids = {thread.GetStopReasonDataAtIndex(i) for i in range(0, thread.GetStopReasonDataCount(), 2)}
                # Exclusive session: skip unknown/deleted breakpoints (including empty data), then resume.
                hits.extend((thread, self.by_breakpoint[id_]) for id_ in ids if id_ in self.by_breakpoint)
            elif reason == lldb.eStopReasonSignal:
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
        # Native condition failures arrive as debugger diagnostic events; the
        # thread's stop description can still be only "breakpoint N.M".
        # Do not reevaluate the condition: it may have side effects.
        # Multiple mutating registrations at the same stop would make execution
        # depend on breakpoint order. Reject this hit rather than choose a winner.
        overlap = len(hits) > 1 and any(r["definition"]["overrides"] or "earlyReturn" in r["definition"] for _, r in hits)
        for thread, registration in hits:
            if self.ended:
                break
            description = self.condition_errors.get(registration["breakpointId"])
            stop_error = None
            if description:
                stop_error = ("condition", description)
            elif overlap:
                stop_error = ("framework", "Overlapping mutating debugger hits")
            self.hit(thread, registration, stop_error)
        self.condition_errors.clear()
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
    channel = Transport()
    debugger = lldb.SBDebugger.Create()
    session = None
    try:
        session = Session(debugger)
        # ready means Worker accepts commands; it has not attached to the App yet.
        channel.send({"type": "ready"})
        while not session.closed and not channel.closed:
            # Handle commands and breakpoint events serially. receive waits briefly for input,
            # then returns so LLDB events are checked even without a Node command.
            for message in channel.receive():
                try:
                    action = message["action"]
                    if action == "detach":
                        session.detach()
                        value = None
                    elif action in {"attach", "add", "remove"}:
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
                # After attach, consume stops: observe/modify the frame and resume when safe.
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
            channel.close()
            lldb.SBDebugger.Destroy(debugger)


def __lldb_init_module(debugger, internal_dict):
    """Module initialization hook called by LLDB's `command script import worker.py`.

    Only register `meu-debugger` → worker.run here; do not start the event loop or attach.
    Node's subsequent `-o meu-debugger` calls run; see session.js for both steps.
    """
    debugger.HandleCommand("command script add -f worker.run meu-debugger")
