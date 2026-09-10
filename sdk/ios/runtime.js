import ObjC from 'frida-objc-bridge';
import { requireObjCRuntime } from './common/main-thread.js';

function requireClassName(className) {
  if (typeof className !== 'string' || className.length === 0 || className.trim() !== className) {
    throw new Error('className must be a non-empty string without surrounding whitespace');
  }
  return className;
}

function requireSelectors(selectors) {
  if (!Array.isArray(selectors)) {
    throw new Error('selectors must be an array');
  }
  for (const selector of selectors) {
    if (typeof selector !== 'string' || !/^[-+] \S/.test(selector)) {
      throw new Error("Each selector must start with '- ' or '+ '");
    }
  }
  return selectors;
}

function hasAllSelectors(target, selectors) {
  return selectors.every(selector => target[selector]?.implementation !== undefined);
}

function findClass(className, selectors = []) {
  requireObjCRuntime();
  requireClassName(className);
  requireSelectors(selectors);

  const exact = ObjC.classes[className];
  if (exact && hasAllSelectors(exact, selectors)) return exact;

  const suffix = `.${className}`;
  const candidates = Object.keys(ObjC.classes)
    .filter(runtimeName => runtimeName.endsWith(suffix))
    .sort()
    .map(runtimeName => ({ runtimeName, target: ObjC.classes[runtimeName] }))
    .filter(({ target }) => hasAllSelectors(target, selectors));

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].target;

  throw new Error(
    `Multiple Objective-C runtime classes matched "${className}"; unable to determine a unique target. `
    + `Candidates: ${candidates.map(({ runtimeName }) => runtimeName).join(', ')}`,
  );
}

const IOSRuntime = Object.freeze({ findClass });

export { IOSRuntime };
