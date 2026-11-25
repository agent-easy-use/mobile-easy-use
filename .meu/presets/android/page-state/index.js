import { inspectRuntime } from '../runtime/index.js';

export async function inspectPageState() {
  inspectRuntime();
  const home = await element.findUiView(R.id.api_main_root);
  return common.runOnMainThread(() => {
    const state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState').getInstance();
    return {
      homeVisible: home !== null && Boolean(home.isShown()),
      generation: state.getGeneration(),
      activity: state.getActivity().toString(),
      scenario: state.getScenario().toString(),
      clickCount: state.getClickCount(),
      longPressCount: state.getLongPressCount(),
      inputText: state.getInputText().toString().slice(0, 512),
      scrollX: state.getScrollX(),
      scrollY: state.getScrollY(),
      dialogOpen: Boolean(state.isDialogOpen()),
      popupOpen: Boolean(state.isPopupOpen()),
    };
  });
}
