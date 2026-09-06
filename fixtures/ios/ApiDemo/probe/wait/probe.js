const CONTROLLER_CLASS = 'APIController';

function onMain(work) {
  return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => {
    try { resolve(work()); } catch (error) { reject(error); }
  }));
}

async function controllerCall(selector, key, delayMs) {
  await onMain(() => ObjC.classes[CONTROLLER_CLASS][selector](key, delayMs));
}

async function snapshot() {
  const raw = await onMain(() => String(ObjC.classes[CONTROLLER_CLASS].snapshotJSON()));
  return JSON.parse(raw);
}

function viewState(target) {
  return onMain(() => {
    const view = IOS.ui.find(target);
    return {
      exists: view !== null,
      hidden: view ? Boolean(view.isHidden()) : null,
    };
  });
}

async function returnToMain() {
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  return IOS.wait.ui('api.menu.wait', 'visible');
}

async function navigate(scenario, action) {
  const fail = (step, result) => ({ passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'wait', scenario } });
  const main = await IOS.wait.ui('api.menu.wait', 'visible');
  if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.wait');
  if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.wait.root', 'visible');
  if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click(`api.wait.scenario.${scenario}`);
  if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui(`api.wait.ready.${scenario}`, 'visible');
  if (!ready.ok) return fail('wait-scenario', ready);
  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  const returned = await returnToMain();
  if (actionError) throw actionError;
  if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

/** Wait for an already attached UIKit view to exist. */
export async function probeImmediateExist() {
  return navigate('immediate', async () => {
    const result = await IOS.wait.ui('api.wait.immediate', 'exist');
    return { passed: result.ok === true, api: 'IOS.wait.ui(exist)', result, oracle: { initiallyExists: true } };
  });
}

/** Schedule a hidden view to become visible, then poll native UI state. */
export async function probeDelayedVisible() {
  return navigate('delayed_visible', async () => {
    await controllerCall('showAfter_delayMs_', 'delayed-visible', 250);
    const result = await IOS.wait.ui('api.wait.delayed-visible', 'visible', { timeoutMs: 2000, intervalMs: 50 });
    const oracle = await viewState('api.wait.delayed-visible');
    return { passed: result.ok === true && oracle.exists && oracle.hidden === false, api: 'IOS.wait.ui(visible)', result, oracle };
  });
}

/** Schedule a visible view to become hidden, then wait for the current gone contract. */
export async function probeDelayedGone() {
  return navigate('delayed_gone', async () => {
    await controllerCall('hideAfter_delayMs_', 'delayed-gone', 250);
    const result = await IOS.wait.ui('api.wait.delayed-gone', 'gone', { timeoutMs: 2000, intervalMs: 50 });
    const oracle = await viewState('api.wait.delayed-gone');
    return { passed: result.ok === true && oracle.exists && oracle.hidden === true, api: 'IOS.wait.ui(gone)', result, oracle };
  });
}

/** Schedule a detached view to enter the hierarchy and wait for exist. */
export async function probeDelayedAttach() {
  return navigate('attach_detach', async () => {
    await controllerCall('attachAfter_delayMs_', 'attach-target', 250);
    const result = await IOS.wait.ui('api.wait.attach-target', 'exist', { timeoutMs: 2000, intervalMs: 50 });
    return { passed: result.ok === true && IOS.ui.find('api.wait.attach-target') !== null, api: 'IOS.wait.ui(attach)', result, oracle: { attached: true } };
  });
}

/** Schedule an attached view to leave the hierarchy and wait for gone. */
export async function probeDelayedDetach() {
  return navigate('attach_detach', async () => {
    await controllerCall('detachAfter_delayMs_', 'detach-target', 250);
    const result = await IOS.wait.ui('api.wait.detach-target', 'gone', { timeoutMs: 2000, intervalMs: 50 });
    return { passed: result.ok === true && IOS.ui.find('api.wait.detach-target') === null, api: 'IOS.wait.ui(detach)', result, oracle: { attached: false } };
  });
}

/** Schedule a zero-size view to receive bounds and wait for visible. */
export async function probeDelayedResize() {
  return navigate('resize', async () => {
    await controllerCall('resizeAfter_delayMs_', 'resize', 250);
    const result = await IOS.wait.ui('api.wait.resize', 'visible', { timeoutMs: 2000, intervalMs: 50 });
    const oracle = await snapshot();
    const width = Number(oracle.fixtures?.resize?.width ?? 0);
    return { passed: result.ok === true && width > 0, api: 'IOS.wait.ui(resize)', result, oracle: { width } };
  });
}

/** Verify an unsatisfied native UI condition returns TIMEOUT. */
export async function probeTimeout() {
  return navigate('timeout', async () => {
    const startedAt = Date.now();
    const result = await IOS.wait.ui('api.wait.timeout', 'visible', { timeoutMs: 300, intervalMs: 50 });
    const elapsedMs = Date.now() - startedAt;
    return { passed: result.ok === false && result.error?.code === 'TIMEOUT' && elapsedMs >= 250, api: 'IOS.wait.ui(timeout)', result: { ...result, elapsedMs }, oracle: { expectedCode: 'TIMEOUT' } };
  });
}

/** Verify wait.until accepts only a synchronous boolean predicate. */
export async function probeUntil() {
  return navigate('immediate', async () => {
    let checks = 0;
    const result = await IOS.wait.until(() => { checks += 1; return checks >= 3; }, { timeoutMs: 1000, intervalMs: 25 });
    return { passed: result.ok === true && checks === 3, api: 'IOS.wait.until', result, oracle: { checks } };
  });
}
