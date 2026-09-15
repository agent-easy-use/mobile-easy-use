# Direct Frida generation

Prefer presets and encapsulated SDK capabilities when they preserve the requested semantics. Use `globalThis.Java` directly for Java/Kotlin runtime work and other Frida Gum APIs only when needed. Direct Frida may run alone or compose with Driver, Override, and Evidence.

## Rules

- Resolve targets from source or runtime evidence; never guess classes, overloads, class loaders, modules, symbols, or fields.
- Bound enumeration, heap search, hooks, backtraces, memory access, and event collection with explicit filters and limits.
- Respect required threads, class loaders, Native ABI, pointer size, calling convention, and module lifetime.
- Keep temporary resources inside the operation, clean them up in `finally`, and install nothing persistent at Module top level.
- Treat work as mutating unless proven read-only; never retry potentially mutating work after failure or timeout.
- Return bounded, transportable plain data. Structure expected outcomes and throw when the probe cannot safely continue.
- Use `Probe.evidence` only for requested chain, state, or UI evidence; never imitate its internal transport protocol.
- Promote repeated App-specific patterns to presets and repeated cross-App patterns to the SDK.
