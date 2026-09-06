import Java from 'frida-java-bridge';
import { unwrapJavaValue, wrapJavaValue } from '../common/interop.js';

function getRootViews() {
  let rootViews = [];
  Java.performNow(() => {
    const WindowManagerGlobal = Java.use('android.view.WindowManagerGlobal');
    const View = Java.use('android.view.View');
    const manager = WindowManagerGlobal.getInstance();
    if (typeof manager.getRootViews === 'function') {
      try {
        rootViews = Array.from(manager.getRootViews().toArray())
          .map((root) => Java.cast(root, View));
        if (rootViews.length > 0) return;
      } catch (_) {
        try {
          rootViews = Array.from(
            manager.getRootViews.overload('android.os.IBinder').call(manager, null).toArray(),
          ).map((root) => Java.cast(root, View));
          if (rootViews.length > 0) return;
        } catch (_) {
          // Fall through to the private field used on older/newer framework variants.
        }
      }
    }
    try {
      const ViewRootImpl = Java.use('android.view.ViewRootImpl');
      rootViews = Array.from(manager.mRoots.value.toArray())
        .map((root) => Java.cast(root, ViewRootImpl).mView.value)
        .filter((view) => view != null)
        .map((view) => Java.cast(view, View));
      if (rootViews.length > 0) return;
    } catch (_) {
      // Fall through to mViews, which is reliable on AOSP framework variants.
    }
    rootViews = Array.from(manager.mViews.value.toArray())
      .map((root) => Java.cast(root, View));
  });
  return rootViews;
}

function findFocusedRootView() {
  return getRootViews()
    .find((root) => {
      try {
        return Boolean(root?.hasWindowFocus?.());
      } catch (_) {
        return false;
      }
    }) ?? null;
}

function parseUiPathStep(step) {
  if (typeof step === 'function') {
    return { type: 'getter', value: step };
  }
  if (typeof step !== 'string') {
    throw new Error('UI path steps must be id::, text::, tag::, or a View getter');
  }
  const separatorIndex = step.indexOf('::');
  if (separatorIndex <= 0) {
    throw new Error(`Invalid UI path step: ${step}`);
  }
  const type = step.slice(0, separatorIndex);
  const value = step.slice(separatorIndex + 2);
  if (!['id', 'text', 'tag'].includes(type) || value.length === 0) {
    throw new Error(`Invalid UI path step: ${step}`);
  }
  if (type === 'id' && (!Number.isInteger(Number(value)) || Number(value) <= 0)) {
    throw new Error(`Invalid UI resource ID path step: ${step}`);
  }
  return { type, value };
}

function requireUiPath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('UI path must be a non-empty array');
  }
  path.forEach(parseUiPathStep);
  return path;
}

/**
 * Resolves a resource ID or each path step below the View produced by the preceding step.
 * A resource ID and the first path step start at the focused Window root. When
 * findViewsWithText() returns multiple Views, the text step selects its first result.
 * The final result and each getter input are wrapped as their actual runtime classes.
 */
function findUiView(target) {
  const isResourceId = typeof target === 'number';
  if (isResourceId) {
    if (!Number.isInteger(target) || target <= 0) {
      throw new Error('UI resource ID must be a positive integer');
    }
  } else {
    requireUiPath(target);
  }
  let result = null;
  Java.performNow(() => {
    const focusedRoot = findFocusedRootView();
    if (!focusedRoot) return;

    const View = Java.use('android.view.View');
    if (isResourceId) {
      const match = focusedRoot.findViewById(target);
      result = match
        ? wrapJavaValue(Java.cast(match, Java.use(match.$className)))
        : null;
      return;
    }

    const ArrayList = Java.use('java.util.ArrayList');
    const StringClass = Java.use('java.lang.String');
    let root = focusedRoot;
    for (const rawStep of target) {
      const step = parseUiPathStep(rawStep);
      let match = null;
      if (step.type === 'id') {
        const viewRoot = Java.cast(root, View);
        match = viewRoot.findViewById(Number(step.value));
      } else if (step.type === 'text') {
        const viewRoot = Java.cast(root, View);
        const candidates = ArrayList.$new();
        viewRoot.findViewsWithText(
          candidates,
          StringClass.$new(step.value),
          View.FIND_VIEWS_WITH_TEXT.value ?? View.FIND_VIEWS_WITH_TEXT,
        );
        match = Array.from(candidates.toArray())[0] ?? null;
      } else if (step.type === 'tag') {
        const viewRoot = Java.cast(root, View);
        match = viewRoot.findViewWithTag(StringClass.$new(step.value));
      } else {
        match = step.value(wrapJavaValue(Java.cast(root, Java.use(root.$className))));
        match = unwrapJavaValue(match);
        if (match != null && !View.class.isInstance(match)) {
          throw new Error('UI path getter must return an android.view.View, null, or undefined');
        }
      }
      if (!match) return;
      root = match;
    }
    result = wrapJavaValue(Java.cast(root, Java.use(root.$className)));
  });
  return result;
}

export {
  findFocusedRootView,
  findUiView,
  getRootViews,
  requireUiPath,
};
