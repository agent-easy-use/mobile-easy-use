const CONTROLLER_CLASS = 'APIController';

function onMain(work) { return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => { try { resolve(work()); } catch (error) { reject(error); } })); }

async function navigate(action) {
  const fail = (step, result) => ({ passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'probe', scenario: 'ui_evidence' } });
  const main = await IOS.wait.ui('api.menu.probe', 'visible'); if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.probe'); if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.probe.root', 'visible'); if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click('api.probe.scenario.ui_evidence'); if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui('api.probe.ready.ui_evidence', 'visible'); if (!ready.ok) return fail('wait-scenario', ready);
  let result; let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  const returned = await IOS.wait.ui('api.menu.probe', 'visible');
  if (actionError) throw actionError; if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

/** Capture UIKit properties before and after a hidden target becomes visible. */
export async function probeVisibilityUiEvidence() {
  return navigate(async () => {
    const result = await Probe.evidence.withUiEvidence(
      async () => {
        await onMain(() => ObjC.classes[CONTROLLER_CLASS].showAfter_delayMs_('hidden', 100));
        return IOS.wait.ui('api.probe.ui.hidden', 'visible', { timeoutMs: 1000, intervalMs: 50 });
      },
      'ApiDemo iOS visibility evidence',
      {
        hiddenFixture: 'api.probe.ui.hidden',
        missingFixture: 'api.probe.ui.evidence-missing',
      },
    );
    const visible = await onMain(() => {
      const view = IOS.ui.find('api.probe.ui.hidden');
      return view !== null && !Boolean(view.isHidden());
    });
    return { passed: result.ok === true && visible, api: 'Probe.evidence.withUiEvidence', evidenceContract: 'ui-visibility-v4', result, oracle: { visible } };
  });
}

/** Compose UI screenshots with a generated getter for the requested native text property. */
export async function probeUiStateEvidence() {
  return navigate(async () => {
    const actionDescription = 'ui-state-v1';
    const target = 'api.probe.ui.hidden';
    const readText = () => IOS.runOnMainThread(() => String(IOS.ui.find(target).text()));
    let actions = 0;
    const result = await Probe.evidence.withUiEvidence(() => Probe.evidence.withStateEvidence(
      async () => {
        actions++;
        await IOS.runOnMainThread(() => {
          const view = IOS.ui.find(target);
          view.setText_('UPDATED_LABEL');
          view.setHidden_(false);
        });
        return 'action-result';
      }, actionDescription, {'label.text': readText}), actionDescription, {label: target});
    const text = await readText();
    return {passed: result === 'action-result' && actions === 1 && text === 'UPDATED_LABEL',
      api: 'Probe.evidence.withUiEvidence + withStateEvidence', evidenceContract: 'ui-state-v1',
      result, oracle: {actions, text}};
  });
}
