# Physical-device runtime loading

`load-mobile-easy-use.sh --device DEVICE --bundle-id APP` preserves an existing
App process. If the App is not running, the loader launches it with
`--no-activate --start-stopped`, waits for LC_MAIN, loads the runtime, and only
then activates the same process.

The loader attaches LLDB before loading either MobileEasyUse dylib. It reads the
running arm64 executable's Mach-O header, maps `LC_MAIN.entryoff` through the
file-backed executable segment and ASLR slide, then installs an **absolute**
address breakpoint with `SBAddress(SBSection(), address)`. A section-bound
breakpoint can become stale when LLDB replaces its provisional executable module
during dyld startup. No `main` symbol, dSYM, or private RunLoop symbol is required.

Before injection, the loader requires both images to be absent, the exact entry
breakpoint and PC to match, and the current executable UUID and mapping to match
the parsed image. Missing LC_MAIN, unexpected stops, unsupported architectures,
or a 30-second entry timeout fail without falling back to arbitrary-thread
injection. The temporary breakpoint and its interrupt timer are removed before
calling `dlopen`.

For memory-backed system libraries without a matching local shared cache,
LLDB's `minimal` module-loading mode provides no symbols. The loader falls back
to the live arm64 Mach-O export trie to resolve `dlopen`, using segment mappings
and the loaded image's slide instead of fixed system-version offsets.

Frida Runtime initialization on recent iOS versions can issue `brk #1337`
PAGE_PLAN requests. The loader recognizes the instruction in the Runtime image
and validates the register protocol (`x1=x2=1337`, `x3=3`) and bounded plan at
`x5` / size `x4`. It writes the plan's original boundary bytes through the
debugger, acknowledges with `x0=0x1337`, and advances PC by four bytes.
These are debugger-assisted page preparations; skipping the trap or only
changing the acknowledgement registers does not implement the protocol.

The interrupted expression is retained and the same `dlopen` call continues;
it is never replayed. A remote result slot records the real returned handle
before LLDB restores its expression frame. Continuation uses synchronous LLDB
resume with a deadline interrupt, so transient internal return-breakpoint state
is not mistaken for the final stop. Unexpected stops (including SIGABRT),
invalid plans, partial writes, timeouts and missing handles fail the load.
This handles requests during initialization only; it does not establish a
persistent debugger service for later Frida operations after LLDB detaches.

Both dlopen calls run synchronously on the entry thread with other threads
allowed to run. An unhandled expression error fails even if the image is mapped;
each call must return a nonzero handle. This implementation does **not** add a
Bridge worker or modify the host executable. The loader then detaches LLDB.

`ok: true` means the two dlopen calls completed and LLDB detached. It does not
mean the Frida transport or UIKit is ready. Callers must validate a Frida
connection and SDK runtime identity. A bounded transport readiness wait may
retry a failed attach; it must not replay a dlopen or business operation after
an ambiguous failure. See the device validation notes below for tested versions
and limitations. LC_MAIN is a startup checkpoint, not a universal guarantee
against initialization dependencies in arbitrary Apps.

Validation: `python3 -m unittest discover -s test -p '*_test.py'` and
`node --test test/ios-runtime-loader.test.js test/ios-cold-launch.test.js` from
the repository root. The cold-launch tests mock CoreDevice and verify that
an existing App is not relaunched and a new App is launched exactly once before
LLDB attach.

Device validation (2026-09-10): iPhone 16, iOS 26.6.1 (23G83), Xcode 26.0,
HelloWorld Debug, Runtime 0.1.0 (UUID
`8C9B18EA-ADFE-3ECF-B555-50354FBBD25A`). With the final synchronous-continuation
implementation, two consecutive cold loads (PIDs 41809, 41811) each serviced
five PAGE_PLAN requests and returned a nonzero Runtime handle in about 0.41 s.
Actual `GadgetConnection.connect` and `runtimeStatus()` then succeeded. A retained
process reconnect kept PID 41811, reported `already-loaded`, performed no dlopen,
and passed the same probe. Runner callbacks were deliberately skipped in the
diagnostic harness; no input, Runner or full ApiDemo coverage is claimed.

One earlier attempt using the final continuation implementation failed before
dlopen because LLDB had no main-executable mapping after attach. That separate
attach/readiness issue is not fixed here. Earlier asynchronous-continuation
attempts exposed transient internal return stops and failed; an older prototype
also saw an unexplained SIGABRT. These results are not evidence of universal
cold-launch reliability or of support for hooks after debugger detach.
