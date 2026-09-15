# Direct iOS Frida Generation

Prefer explicitly iOS-compatible presets and encapsulated `IOS`, `Override`, and `Probe.evidence` capabilities when they preserve the requested semantics. Use `globalThis.ObjC` or other Frida Gum APIs only when those capabilities are insufficient.

## Rules

- Resolve Objective-C classes and exact `- ` or `+ ` selectors from source or runtime evidence. Never guess Swift-to-Objective-C exposure.
- Treat pure Swift symbols as native targets only when source, symbols, ABI, and calling convention are known. Do not infer mangled names or signatures.
- Resolve native modules, exports, offsets, pointer size, ownership, and lifetime from exact evidence before using `Module`, `NativeFunction`, `Interceptor`, or memory APIs.
- Bound class enumeration, object search, hooks, backtraces, memory access, and event collection with explicit filters and limits. Do not perform broad heap or object-graph scans by default.
- Respect UIKit main-queue requirements and any business queue documented by source. Direct Objective-C calls do not inherit the SDK's automatic dispatch.
- Keep temporary Interceptors, listeners, timers, retained objects, and native allocations inside the operation. Release or detach them in `finally`, and install nothing persistent at Module top level.
- Do not retain transient UIView, UIViewController, or other lifecycle objects beyond the operation unless the request requires it and their validity can be checked.
- Treat work as mutating unless proven read-only. Never retry a potentially mutating operation after failure or timeout without restoring a known scene.
- Return bounded, transportable plain data. Convert Objective-C values to strings, numbers, booleans, null, arrays, or plain objects; do not return native wrappers or pointers.
- Use `Probe.evidence` only for requested chain, state, or UIKit evidence. Never imitate its internal transport protocol.
- A hook installed after an event cannot observe that past event. Report the startup-timing limitation instead of claiming negative evidence.
- Treat repeated iOS App-specific patterns as candidates for an explicitly iOS-compatible preset workflow, and repeated cross-App patterns as SDK extension candidates.
