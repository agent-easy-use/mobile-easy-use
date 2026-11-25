import { inspectRuntime } from '../runtime/index.js';

export async function inspectPageState() {
  inspectRuntime();
  const home = await element.findUiView('api.main.root');
  return common.runOnMainThread(() => {
    const state = ObjC.classes.APISDKFixtureState.sharedState();
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
