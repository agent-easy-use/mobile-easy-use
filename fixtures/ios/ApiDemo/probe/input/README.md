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
| Total | | 50 | |

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
`ELEMENT_NOT_HITTABLE`; coordinate targeting dispatches successfully but does not
invoke the button action. The old expectation of identifier-tap success was removed.

Verified on 2026-09-08 with the same App SDK, Runner JS and probe source:

| Runtime | Device | Final matrix result |
| --- | --- | --- |
| iOS 26.0 simulator | iPhone 17 | 50/50; one obsolete disabled-button assertion corrected after the first run |
| iOS 18.7.10 physical device | iPhone XS Max | 50/50 on the first run, with no retries |

These runs cover the stated device/OS combinations in portrait. They do not certify
other OS versions, rotation races, a frozen App main queue, or late native completion
after a timeout; callback lifetime and expiry guards also have targeted runtime-mock tests.
