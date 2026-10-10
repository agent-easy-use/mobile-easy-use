"""Operations on the original hit frame. All user code is native LLDB expression text."""

import lldb


def checked(value):
    if not value.IsValid():
        raise RuntimeError("Value is unavailable")
    if value.GetError().Fail():
        raise RuntimeError(value.GetError().GetCString())
    return value


def options():
    """Native expression options for HitContext.evaluate; leave breakpoint settings unchanged."""
    result = lldb.SBExpressionOptions()
    # Ignore breakpoints encountered by expression calls to avoid nested breakpoint stops.
    result.SetIgnoreBreakpoints(True)
    # Ask LLDB to unwind expression calls on failure; memory and application side effects remain.
    # evaluate still checks restoration through frame().
    result.SetUnwindOnError(True)
    # Keep other threads stopped while the expression runs target code.
    result.SetStopOthers(True)
    # Do not retry with other threads running if execution on this thread cannot complete.
    # Expressions waiting for another thread to release a lock or perform work may time out.
    result.SetTryAllThreads(False)
    # Limit target expression execution to 2 seconds, not the whole compilation/symbol lookup call.
    result.SetTimeoutInMicroSeconds(2_000_000)
    # Fetch the result's dynamic type without running extra target code to resolve that type.
    # This does not prevent the user expression itself from calling native functions.
    result.SetFetchDynamicValue(lldb.eDynamicDontRunTarget)
    return result


class HitContext:
    def __init__(self, thread):
        self.thread = thread
        self.process = thread.GetProcess()
        frame = thread.GetFrameAtIndex(0)
        self.identity = (frame.GetCFA(), frame.GetPC(), frame.GetFunctionName())
        self.swift = frame.GuessLanguage() == lldb.eLanguageTypeSwift
        self.unsafe = None

    def frame(self):
        # Inferior calls invalidate frame caches; reacquire and verify the original frame.
        frame = self.thread.GetFrameAtIndex(0)
        if not frame.IsValid() or (frame.GetCFA(), frame.GetPC(), frame.GetFunctionName()) != self.identity:
            self.unsafe = "Original breakpoint frame was not restored"
        if self.unsafe:
            raise RuntimeError(self.unsafe)
        return frame

    def evaluate(self, code):
        """Return SBValue, or None for successful execution without a result; raise on failure."""
        value = self.frame().EvaluateExpression(code, options())
        self.frame()  # Check restoration even when evaluation failed.
        error = value.GetError()
        # LLDB UserExpression::kNoResult: execution completed without a value
        # (e.g. OC "(void)0"). This is not a failed expression.
        if error.GetType() == lldb.eErrorTypeGeneric and error.GetError() == 0x1001:
            return None
        if error.Fail():
            message = error.GetCString() or "Expression failed"
            if any(word in message.lower() for word in ("timed out", "timeout", "interrupted")):
                self.unsafe = message
            raise RuntimeError(message)
        if not value.IsValid():
            raise RuntimeError("Value is unavailable")
        # Swift throwing expressions can return $E<n> with a successful SBError.
        if (value.GetName() or "").startswith("$E"):
            raise RuntimeError(value.GetSummary() or "Swift expression threw an error")
        return value

    def stack(self, limit):
        self.frame()
        result = []
        for index in range(min(limit, self.thread.GetNumFrames())):
            frame = self.thread.GetFrameAtIndex(index)
            line = frame.GetLineEntry()
            result.append({"index": index, "function": frame.GetFunctionName(),
                           "module": frame.GetModule().GetFileSpec().GetFilename(),
                           "address": hex(frame.GetPC()),
                           "file": str(line.GetFileSpec()) if line.IsValid() else None,
                           "line": line.GetLine() if line.IsValid() else None})
        return result

    def override(self, target, code):
        # LLDB resolves the assignment target, including properties/subscripts,
        # and enforces native type/mutability rules. The RHS executes once.
        self.evaluate(f"{target} = ({code})")

    def early_return(self, code):
        # Evaluate unchanged; the caller supplies the native return type through
        # the expression (e.g. Int32(42)). LLDB owns frame/ABI support decisions.
        value = self.evaluate(code)
        # Swift () is a valid result and passes through unchanged. Only a
        # no-result expression needs an empty SBValue (no return value to set).
        error = self.thread.ReturnFromFrame(
            self.frame(), lldb.SBValue() if value is None else value)
        if error.Fail():
            raise RuntimeError(error.GetCString())
        # No frame access after successful unwind.
