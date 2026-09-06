# iOS integration validation

1. Build the selected scheme and internal configuration for the target simulator or device. A physical-device build must use Development signing with `get-task-allow = true`.
2. Inspect the App bundle:
   - `Frameworks/MobileEasyUse.dylib` exists;
   - `Frameworks/MobileEasyUseRuntime.dylib` exists;
   - `MobileEasyUseRuntime.config` exists;
   - both dylibs contain the target architecture;
   - `codesign --verify --deep --strict <App>` succeeds.
3. Inspect the App executable and any App-owned `*.debug.dylib`:
   - `otool -L` shows no MobileEasyUse dependency;
   - `nm` shows no `mobile_easy_use_*`, `MEUInput`, or `MEUUIQuery` symbols;
   - `otool -L MobileEasyUse.dylib` shows `@loader_path/MobileEasyUseRuntime.dylib`.
4. Install and launch the App. Confirm it remains healthy before LLDB attachment.
5. Invoke `to-ios-run` twice with the target, bundle identifier, and this read-only Inline operation:

   ```javascript
   (async () => { return runtimeStatus(); })()
   ```

   Require both invocations to return `{ platform: "ios", available: true }`. This validates initial loading and repeated execution through the `to-ios-run` contract.
6. Build a production configuration. Confirm the App contains no MobileEasyUse dylib, config, dependency, bridge symbol, or MobileEasyUse object file.
7. Report the commands, artifact checks, two runtime results, and any failing stage.
