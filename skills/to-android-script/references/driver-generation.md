# Driver Generation

Use these rules to generate code that moves the App into a target scene or state.

## Resolve the flow

- Resolve resource ids, Views, routes, and business methods from source. Never guess identifiers.
- Use high-level input for user interaction. Use a route or business method only when the requested scenario explicitly requires it.

## Generate input

Generate only these InputManager-backed APIs:

```javascript
AndroidExp.input.click(target)
AndroidExp.input.longPress(target)
AndroidExp.input.scroll(target, direction)
AndroidExp.input.input(target, text)
```

Do not generate lower-level injection, `View.performClick()`, or retired input APIs.

Choose the target in this order:

1. stable resource id such as `R.id.value_input`;
2. already-resolved Android View;
3. absolute physical screen location `{ x, y }`.

A resource id resolves only inside the root whose Window has `hasWindowFocus()`. Use coordinates only when no stable id or View exists.

## Wait for transitions

Use wait instead of a fixed sleep when a step triggers an asynchronous transition:

```javascript
AndroidExp.wait.ui(resourceIdOrView, 'exist' | 'visible' | 'gone', options)
AndroidExp.wait.until(() => boolean, options)
```

When the Driver decides a failed result is terminal, capture the current App Window before returning:

```javascript
if (!ready.ok) {
  const screenshot = await AndroidExp.screenshot();
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

Use `ui` for View presence or visibility. It re-resolves resource ids in the focused Window root on every check. Use `until` for Activity, Fragment, or business state; its predicate must be synchronous and return boolean.

Both APIs default to `{ timeoutMs: 5000, intervalMs: 100 }`. Override only when the scenario requires different timing.

## Compose steps

Await every input and wait result. Stop the flow when `ok` is `false`:

```javascript
async function openAndFill(value) {
  const opened = await AndroidExp.input.click(R.id.entry_button);
  if (!opened.ok) return opened;

  const ready = await AndroidExp.wait.ui(R.id.value_input, 'visible');
  if (!ready.ok) return ready;

  const input = await AndroidExp.input.input(R.id.value_input, value);
  return input;
}
```
