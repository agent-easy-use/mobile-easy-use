const INPUT_ACTION_SETTLE_DELAY_MS = 1000;

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

/**
 * Resolve an input operation only after its terminal native action has had
 * time to settle. Thrown setup or transport errors are propagated without an
 * additional delay, matching the Android runInputAction contract.
 */
async function runInputAction(operation, wait = delay) {
  const result = await operation();
  await wait(INPUT_ACTION_SETTLE_DELAY_MS);
  return result;
}

export { INPUT_ACTION_SETTLE_DELAY_MS, runInputAction };
