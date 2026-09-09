export function inspectRuntime() {
  const status = runtimeStatus();
  if (status.platform !== 'ios' || !status.available || status.appId !== 'com.agenteasyuse.mobileeasyuse.apidemo.ios') {
    throw new Error('This preset requires the ios ApiDemo runtime');
  }
  return status;
}
