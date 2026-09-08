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

Both dlopen calls run synchronously on the entry thread with other threads
allowed to run. An expression error always fails even if the image is mapped;
each call must return a nonzero handle. This implementation does **not** add a
Bridge worker or modify the host executable. The loader then detaches LLDB.

`ok: true` means the two dlopen calls completed and LLDB detached. It does not
mean the Frida transport or UIKit is ready. Callers must validate a Frida
connection and SDK runtime identity. A bounded transport readiness wait may
retry a failed attach; it must not replay a dlopen or business operation after
an ambiguous failure. See the device test report for the tested binary versions
and success rates. LC_MAIN is a startup checkpoint, not a universal guarantee
against initialization dependencies in arbitrary Apps.

Validation: `python3 -m unittest discover -s test -p '*_test.py'` and
`node --test test/ios-runtime-loader.test.js test/ios-cold-launch.test.js` from
the repository root. The cold-launch tests mock CoreDevice and verify that
an existing App is not relaunched and a new App is launched exactly once before
LLDB attach.
