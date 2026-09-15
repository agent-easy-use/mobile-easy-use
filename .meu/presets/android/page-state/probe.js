import { inspectRuntime } from '../runtime/probe.js';

export async function inspectPageState() {
  inspectRuntime();
  return AndroidExp.runOnMainThread(() => {
    const state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState').getInstance();
    const home = AndroidExp.ui.find(R.id.api_main_root);
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
