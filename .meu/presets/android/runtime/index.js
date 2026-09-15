export function inspectRuntime() {
  const status = runtimeStatus();
  if (status.platform !== 'android' || !status.available || status.appId !== 'com.agenteasyuse.mobileeasyuse.apidemo') {
    throw new Error('This preset requires the android ApiDemo runtime');
  }
  return status;
}
