# iOS Driver Generation

Use these rules to generate code that moves the App into a target scene or state.

## Resolve the flow

- Resolve accessibility identifiers, labels, UIViews, routes, and business methods from source. Never guess identifiers or selectors.
- Assume the App starts on its home page unless the caller supplies another known scene.
- Use high-level input for user interaction. Use a route or business method only when the requested scenario explicitly requires it.

## Generate input

Generate only these input APIs:

```javascript
IOS.input.click(target)
IOS.input.input(target, text)
IOS.input.scroll(target, direction, distance?)
IOS.input.longPress(target, durationMs?)
```

Choose a target in this order:

1. a stable accessibility identifier string;
2. a path using `identifier::` and `label::` steps;
3. a native `UIView`, resolved to its current screen center;
4. an absolute screen point `{ x, y }`.

A string target is shorthand for one `identifier::` step. Each path step searches descendants of the preceding match in order. Use a native `UIView` only when it is already available; the SDK resolves it to its current screen center. Use coordinates only when source or the caller supplies a stable point. Do not invent getter or `class::` steps.

Each input result resolves after the SDK's 1000 ms settle interval; still wait for an explicit condition when the expected transition can take longer.

## Wait for transitions

Use wait instead of a fixed sleep when a step triggers an asynchronous transition:

```javascript
IOS.wait.ui(target, 'exist' | 'visible' | 'gone', options)
IOS.wait.until(() => boolean, options)
```

When the Driver decides a failed result is terminal, capture the current App Window before returning:

```javascript
if (!ready.ok) {
  const screenshot = await IOS.screenshot();
  return screenshot.ok
    ? {
        ...ready,
        screenshots: { window: screenshot.window, element: null },
      }
    : ready;
}
```

Do not capture exploratory or retryable failures. Use the final failure image with the structured
error to distinguish a wrong target, unexpected page, overlay, incomplete navigation, or timeout.
Preserve the original failure when screenshot capture also fails.

Use `ui` for native View presence or visibility. It re-resolves the target on every check. In the current contract, `gone` means not visible and does not prove that the View no longer exists. Use `until` for ViewController, model, session, or other business state; its predicate must synchronously return a boolean and must not return a Promise.

Both APIs default to `{ timeoutMs: 5000, intervalMs: 100 }`. Override only when the scenario requires different timing. Treat `TIMEOUT` and `INVALID_ARGUMENT` as failed results and stop the flow.

Use the same waits after a direct UI handler, route, or business call. A successful return alone does not
prove that the requested page, state, or UI result was reached.

## Compose steps

Await every input and wait result. Stop when `ok` is `false`:

```javascript
async function openAndFill(value) {
  const opened = await IOS.input.click('entry_button');
  if (!opened.ok) return opened;

  const ready = await IOS.wait.ui(
    ['identifier::dialog', 'identifier::value_input'],
    'visible',
  );
  if (!ready.ok) return ready;

  return IOS.input.input(
    ['identifier::dialog', 'identifier::value_input'],
    value,
  );
}
```

Keep exported operations small and preserve the underlying structured action or wait result. A
terminal failure may add only the `screenshots` field shown above.
