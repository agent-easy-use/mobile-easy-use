# iOS event input backend

`events.js` runs inside the XCTest Runner's Frida script. The public SDK API remains
`IOS.input.click / longPress / scroll / input`; this directory is not a public API.

- Tap and long press encode down/up offsets in one `XCPointerEventPath`.
- Scroll encodes down, a 50 ms hold, a 300 ms move, and up in one record. Direction
  means finger direction. Completion does not wait for scrolling inertia.
- Input preflights both touch and text interfaces, sends a focus tap, awaits its
  completion, then sends a text record at 30 characters per second. The target must
  focus an editable control; native completion does not prove the intended text or
  business state was reached. Contents are not cleared.
- Records use interface orientation, not physical device orientation. Coordinates
  are points in the main screen's current coordinate space, not pixels.
- The SDK resolves all targets in the App. Identifier/path targets use `ui.find`'s
  first-match UIView query (each step includes its root; no ambiguity check or
  backtracking). Lookup, clipping ancestors/window/screen bounds and UIKit hit-testing
  happen in one App main-queue turn. Input requires a foreground `UIWindowScene` on
  the main screen. Raw coordinates use its key window.
- For UIView-resolving targets, the actual touch-down point is hit-tested across
  `UIApplication.windows` in front-to-back order, restricted to the target scene.
  Equal-level windows retain UIKit's ordering; hidden/non-interactive/pass-through
  windows are skipped. The first hit must be the target or its descendant. Raw
  coordinates do not require a target hit. This is an App-window precheck, not a
  guarantee against other processes' system UI or changes after resolution.
- `TOUCH_TARGET_MISMATCH` reports the target, screen point, actual hit view and
  whether the hit is in another App window. `NO_TOUCH_RECEIVER` means no view in
  the target scene receives that point. Both fail before any event dispatch.
- App-side geometry also computes scroll endpoints. The Runner receives only
  `action`, `point`, `bounds`, `orientation`, optional `gesture` endpoints, action
  parameters and `expiresAt`. No UIView, identifier or UIPath reaches the Runner.
  The Runner validates event parameters and coordinates, then checks foreground state,
  orientation and deadline immediately before submitting each event;
  it never queries XCTest elements or calculates gesture geometry from a target.
- Virtual AX elements without a UIView are not addressable by identifier/path.
  Known coordinates remain usable. Coordinates are not continuously updated if the
  target moves after lookup; event completion does not prove the intended target received it.
- Supported major versions: iOS 18 and 26. Classes/selectors are checked at runtime;
  there is no silent fallback to high-level tap/drag/typeText on unsupported runtimes.

The App and Runner bundles must be refreshed together.

Every record is submitted as a whole; no JS timers generate individual moves or key
strokes. Native calls are scheduled on the main queue without blocking it to await
completion. Owned event records, sender objects and callback blocks survive until
native completion. The internal deadline starts before App main-queue target resolution
and travels across Host/Runner queues,
so an expired queued request cannot start a new gesture.

`SYNTHESIS_UNCERTAIN` means a submitted event has unknown completion, not that it was
cancelled. The backend retains in-flight objects and refuses further input, including
after a late callback, until the Runner is restarted. Inspect the App before deciding
on a new action. Never automatically replay an uncertain tap or text input.

Validation: `test/ios-input-events.test.js` covers native callback ordering, object
lifetime, missing capabilities, timeout/late completion and complete gesture records.
`test/ios-input-driver-routing.test.js` checks coordinate-only dispatch, unchanged
endpoints and pre-submit guards.
`test/ios-sdk.test.js` checks all public target forms, App-main lookup/geometry,
clipping/hit-testing, missing targets and deadlines before transport.
These tests simulate the runtime; they are not device compatibility certification.
