import { inspectRuntime } from '../runtime/probe.js';

export async function inspectPageState() {
  inspectRuntime();
  return IOS.runOnMainThread(() => {
    const state = ObjC.classes.APISDKFixtureState.sharedState();
    const home = IOS.ui.find('api.main.root');
    return {
      homeAttached: home !== null && home.window() !== null,
      generation: Number(state.generation()),
      category: state.category().toString(),
      scenario: state.scenario().toString(),
      counter: Number(state.counter()),
      activationCount: Number(state.activationCount()),
      text: state.text().toString().slice(0, 512),
    };
  });
}
