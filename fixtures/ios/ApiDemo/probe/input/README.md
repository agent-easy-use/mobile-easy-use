# Input runtime coverage

Execute each operation separately and serially through `call_function`. Require
`result.passed === true` and `navigation.returnedToMain === true`. No suite export
is provided. All operations begin at Main and select a fresh scenario through real input.

`targetKind` is `identifier`, `path`, `view`, or `coordinates`. Numeric optional
arguments use strings at the MCP boundary. Omitting them exercises SDK defaults.
`result.elapsedMs` measures only the tested SDK call, including its fixed 1000 ms
settle delay; it excludes navigation and native oracle reads. Text append returns
separate `first` and `second` timings. The error probe times its complete sequence.

| Operation | Arguments / expansion | Cases | Native oracle |
| --- | --- | ---: | --- |
| Four `probeClickBy*` exports | no args | 4 | UIButton action counter = 1 |
| `probeCustomViewTouch` | no args | 1 | touchesEnded = 1, accessibilityActivate = 0 |
| `probeTextInput` | `["Hello 中文🙂", targetKind]` | 4 | editingChanged text exactly matches |
| `probeTextAppend` | `[targetKind]` | 4 | complete text = `prefix-中文🙂` |
| `probeLongPress` | `[targetKind]`, `[targetKind, "800"]` | 8 | long-press recognizer began once |
| `probeVerticalScroll` | `[targetKind, "up"]`, `[targetKind, "down"]` | 8 | contentOffset.y moves in the expected direction |
| `probeHorizontalScroll` | `[targetKind, "left"]`, `[targetKind, "right"]` | 8 | contentOffset.x moves in the expected direction |
| Scroll clamping | vertical `["view", "up", "5000"]`, horizontal `["path", "left", "5000"]` | 2 | bounded endpoints and actual content movement |
| `probeClippedTarget` | `[targetKind]` | 4 | view targets click the visible strip; raw center lies outside it |
| `probeCoveredTarget` | `[targetKind]` | 4 | view targets fail without touching; coordinates touch the cover |
| `probeFirstMatch` | `["identifier"]`, `["path"]` | 2 | only the first duplicate changes; path includes the current root |
| `probeTargetErrors` | no args | 1 | 18 structured failures plus a coordinate touch on a disabled button with no action |
| `probeWindowClick` | eight modes below × four target kinds | 32 | independent underlying/front button counters |
| `probeWindowBlocked` | input/longPress/scroll × identifier/path/view | 9 | rejection, zero button/press counts, unchanged text/offset |
| `probeWindowLifecycle` | no args; seven transitions on the same windows | 1 | view and raw-coordinate touches reach the same expected button |
| Total | | 92 | |

## Explicit cross-window test paths

For every call start at **Main → Input → windows** (`api.input.scenario.windows`). The probe
configures a real second UIWindow, performs the indicated input, reads only the two windows'
ordering/key/level state and native action counters, hides/releases the overlay and returns to Main.
Window configuration is native test setup, not an input result. SDK input parameters are unchanged.
`APIInputWindowFixture` owns the fixture and cleans up on navigation/reset, including failed probes.

Call the Module at `fixtures/ios/ApiDemo/probe/input/probe.js` with `functionName` and positional
`args` below. Run each independently and serially. Require both `passed` and `navigation.returnedToMain`.

| `probeWindowClick` args | Setup and target | Expected native result |
| --- | --- | --- |
| `["same", kind]` | Show an equal-level non-key overlay; target underlying button | identifier/path/view: TOUCH_TARGET_MISMATCH, both counts 0; coordinates: front count 1 |
| `["higher", kind]` | Overlay level = main + 1; target underlying button | Same expectations as `same` |
| `["lower", kind]` | Overlay level = main - 1; target underlying button | All kinds: underlying count 1, front count 0 |
| `["hidden", kind]` | Overlay hidden; target underlying button | All kinds: underlying count 1 |
| `["passthrough", kind]` | Visible overlay returns nil from hitTest | All kinds: underlying count 1 |
| `["outside", kind]` | Overlay is shifted away from target point | All kinds: underlying count 1 |
| `["top", kind]` | Equal-level overlay is key; target its front button | All kinds: front count 1, underlying count 0 |
| `["reshow", kind]` | Hide/show the same equal-level overlay; target underlying button | Same expectations as `same`; detects stale ordering |

Expand `kind` to `identifier`, `path`, `view`, `coordinates`: 32 calls. Identifier/path use the existing
focused-window native query; `top` makes the overlay key so its identifier/path can resolve. Other modes
keep the main window key. The SDK must still account for a non-key overlay covering that main window.

`probeWindowBlocked`: expand `[action, kind]` for actions `input`, `longPress`, `scroll` and kinds
`identifier`, `path`, `view`: 9 calls. The target is respectively a UITextField, a button with a
long-press recognizer, or UIScrollView. A same-level non-key overlay covers the whole fixture.
Require TOUCH_TARGET_MISMATCH and unchanged native text, offset and action counters.
Mismatch messages identify the target, screen point, actual hit view and whether it is in another
App window. NO_TOUCH_RECEIVER means no window in the target scene hit a view at that point.

`probeWindowLifecycle`: one call with no arguments. Reuse the same two windows through
**show → hide → show → overlay.makeKeyWindow → main.makeKeyWindow → hide → show**.
For every phase, click the expected frontmost fixture button by UIView, then at the same raw screen
coordinate. Each successful phase adds exactly two clicks to that button and none to the other.
Counters are never reset between phases; abort on a mismatch. This verifies that key changes do not
substitute for window ordering, and compares the SDK precheck against actual event delivery.

Run on iOS 18 and 26. UIApplication.windows is intentionally used for its documented ordering even
though deprecated since iOS 15. Capture the returned windowOrder when diagnosing OS differences;
do not replace expected native counters with expectations calculated from that same array.
On 2026-09-08, all 42 new cases passed on the iPhone 17 / iOS 26.0 simulator on their first run,
including all seven lifecycle transitions. iOS 18 validation of this change remains pending;
the previously tested iOS 18 device was unavailable. The historical results below cover only
the original 50 cases and do not certify this cross-window change on iOS 18.
Those runtime results predate the diagnostic error-code/message update. The matrix above uses
the current error codes; local tests separately verify the updated messages and failure categories.

Reverse scrolls prepare contentOffset = 500 on the App main queue before the
tested input. This is setup only: success always requires a subsequent real
gesture to change the native offset. No probe uses a hook to manufacture action
success or edits the observed counter/text in place of performing input.

The geometry scenario adds a partially clipped button, a button covered by a
touch-observing UIView, and two buttons with the same identifier. These expose
behavior that the original click/text/scroll fixtures could not independently
verify. The custom view separately counts touch and accessibility activation.

On the tested iOS 18.7.10 and iOS 26.0 UIKit runtimes, a disabled UIButton is skipped by window
hit-testing: its parent receives the point. Identifier targeting therefore returns
`TOUCH_TARGET_MISMATCH`; coordinate targeting dispatches successfully but does not
invoke the button action. The old expectation of identifier-tap success was removed.

Historical verification on 2026-09-08, before the cross-window change (original 50 cases):

| Runtime | Device | Final matrix result |
| --- | --- | --- |
| iOS 26.0 simulator | iPhone 17 | 50/50; one obsolete disabled-button assertion corrected after the first run |
| iOS 18.7.10 physical device | iPhone XS Max | 50/50 on the first run, with no retries |

These runs cover the stated device/OS combinations in portrait. They do not certify
other OS versions, rotation races, a frozen App main queue, or late native completion
after a timeout; callback lifetime and expiry guards also have targeted runtime-mock tests.
