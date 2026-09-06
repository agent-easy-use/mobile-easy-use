import Java from 'frida-java-bridge';

function resolveResource(type, name) {
  let resourceId;
  Java.performNow(() => {
    const application = Java.use('android.app.ActivityThread').currentApplication();
    if (!application) {
      throw new Error('Application is unavailable');
    }
    const packageName = application.getPackageName().toString();
    resourceId = Number(application.getResources().getIdentifier(name, type, packageName));
  });
  return resourceId;
}

function createResourceClass() {
  return new Proxy(Object.create(null), {
    get(_target, type) {
      if (typeof type !== 'string') {
        return undefined;
      }
      return new Proxy(Object.create(null), {
        get(_resourceType, name) {
          return typeof name === 'string' ? resolveResource(type, name) : undefined;
        },
      });
    },
  });
}

export { createResourceClass };
