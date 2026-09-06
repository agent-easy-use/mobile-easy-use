function viewSnapshot(view) {
  if (view === null) return null;
  let snapshot;
  Java.performNow(() => {
    snapshot = {
      id: Number(view.getId()),
      className: view.$className ?? null,
      shown: Boolean(view.isShown()),
      attached: Boolean(view.isAttachedToWindow()),
      width: Number(view.getWidth()),
      height: Number(view.getHeight()),
    };
  });
  return snapshot;
}

/** Find a View through the positive integer resource-ID overload. */
export async function probeFindByResourceId() {
  return navigate('resource_id', () => {
  const view = AndroidExp.ui.find(R.id.api_ui_id_target);
  const result = viewSnapshot(view);
  return {
    passed: result?.id === R.id.api_ui_id_target
      && result.className === 'android.widget.TextView'
      && result.shown,
    api: 'AndroidExp.ui.find(resourceId)',
    result,
    oracle: { id: R.id.api_ui_id_target, className: 'android.widget.TextView', shown: true },
  };
  });
}

/** Find descendant Views through exact id, text and tag path steps. */
export async function probeFindByPath() {
  return navigate('path', () => {
  const tagged = AndroidExp.ui.find([
    `id::${R.id.api_ui_nested_parent}`,
    'tag::api-tag-target',
  ]);
  const textFirst = AndroidExp.ui.find(['text::API_DUPLICATE_TEXT']);
  const nested = AndroidExp.ui.find([
    `id::${R.id.api_ui_nested_parent}`,
    'text::NESTED_CHILD',
  ]);
  const result = {
    tagged: viewSnapshot(tagged),
    textFirst: viewSnapshot(textFirst),
    nested: viewSnapshot(nested),
  };
  return {
    passed: result.tagged?.id === R.id.api_ui_tag_target
      && result.textFirst?.id === R.id.api_ui_text_first
      && result.nested?.id === R.id.api_ui_nested_child,
    api: 'AndroidExp.ui.find(path)',
    result,
    oracle: {
      taggedId: R.id.api_ui_tag_target,
      firstTextId: R.id.api_ui_text_first,
      nestedId: R.id.api_ui_nested_child,
    },
  };
  });
}

/** Find a View with a getter path and verify the concrete runtime wrapper. */
export async function probeFindByGetter() {
  return navigate('path', () => {
  const view = AndroidExp.ui.find([
    (root) => root.findViewById(R.id.api_ui_nested_parent),
    (parent) => parent.findViewById(R.id.api_ui_nested_child),
  ]);
  const result = viewSnapshot(view);
  return {
    passed: result?.id === R.id.api_ui_nested_child
      && result.className === 'android.widget.Button',
    api: 'AndroidExp.ui.find(getterPath)',
    result,
    oracle: { id: R.id.api_ui_nested_child, className: 'android.widget.Button' },
  };
  });
}

/** Verify a valid path with no match returns null. */
export async function probeMissingView() {
  return navigate('path', () => {
  const result = AndroidExp.ui.find([
    `id::${R.id.api_ui_nested_parent}`,
    'tag::api-missing-tag',
  ]);
  return {
    passed: result === null,
    api: 'AndroidExp.ui.find(path)',
    result: { found: result !== null },
    oracle: { found: false },
  };
  });
}

/** Verify find returns an attached INVISIBLE View without claiming it is shown. */
export async function probeFindHiddenView() {
  return navigate('visibility', () => {
  const view = AndroidExp.ui.find(R.id.api_ui_hidden);
  const result = viewSnapshot(view);
  return {
    passed: result?.id === R.id.api_ui_hidden && result.attached && !result.shown,
    api: 'AndroidExp.ui.find(resourceId)',
    result,
    oracle: { attached: true, shown: false },
  };
  });
}

/** Verify a custom View is promoted to its concrete runtime wrapper. */
export async function probeRuntimeWrapper() {
  return navigate('runtime_wrapper', () => {
  const view = AndroidExp.ui.find(R.id.api_ui_custom_view);
  const result = viewSnapshot(view);
  return {
    passed: result?.className === 'com.agenteasyuse.mobileeasyuse.apidemo.ui.ApiDemoCustomView',
    api: 'AndroidExp.ui.find(resourceId)',
    result,
    oracle: { className: 'com.agenteasyuse.mobileeasyuse.apidemo.ui.ApiDemoCustomView' },
  };
  });
}
const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const SCENARIO_LABELS = {
  resource_id: 'Resource ID and Java action',
  path: 'ID, text, tag and descendant path',
  visibility: 'Hidden, gone, disabled and zero-size Views',
  runtime_wrapper: 'Concrete runtime View wrapper',
};

async function withScenarioNavigation(config, action) {
  const failure = (step, result) => ({
    passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: config,
  });
  const returnToMain = async () => {
    try {
      Java.performNow(() => Java.use(CONTROLLER_CLASS).returnToMain());
    } catch (error) {
      try {
        await new Promise((resolveReturn, rejectReturn) => {
          Java.performNow(() => {
            const controller = Java.use(CONTROLLER_CLASS);
            const weakReference = Java.cast(
              controller.current.value,
              Java.use('java.lang.ref.WeakReference'),
            );
            const rawActivity = weakReference.get();
            if (rawActivity === null) throw error;
            const activity = Java.cast(
              rawActivity,
              Java.use('com.agenteasyuse.mobileeasyuse.apidemo.ui.CapabilityActivity'),
            );
            Java.scheduleOnMainThread(() => {
              try {
                activity.finish();
                resolveReturn();
              } catch (finishError) { rejectReturn(finishError); }
            });
          });
        });
      } catch (fallbackError) {
        return failure('return-to-main', {
          message: fallbackError.message ?? String(fallbackError),
        });
      }
    }
    const result = await AndroidExp.wait.ui(R.id.api_menu_input, 'visible');
    return result.ok ? { passed: true } : failure('wait-main-after-return', result);
  };
  let main = await AndroidExp.wait.ui(
    config.capabilityMenuId,
    'visible',
    { timeoutMs: 500, intervalMs: 50 },
  );
  if (!main.ok) {
    const recovered = await returnToMain();
    if (!recovered.passed) return failure('recover-main', recovered);
    main = await AndroidExp.wait.ui(config.capabilityMenuId, 'visible');
  }
  if (!main.ok) return failure('wait-main-menu', main);
  const opened = await AndroidExp.input.click(config.capabilityMenuId);
  if (!opened.ok) return failure('click-capability', opened);
  const catalog = await AndroidExp.wait.ui(config.capabilityRootId, 'visible');
  if (!catalog.ok) {
    await returnToMain();
    return failure('wait-capability-catalog', catalog);
  }
  const scenarioView = AndroidExp.ui.find([`text::${config.scenarioLabel}`]);
  if (scenarioView === null) {
    await returnToMain();
    return failure('find-scenario-item', { found: false });
  }
  await new Promise((resolveReveal, rejectReveal) => Java.scheduleOnMainThread(() => {
    try {
      const rectangle = Java.use('android.graphics.Rect').$new();
      scenarioView.getDrawingRect(rectangle);
      scenarioView.requestRectangleOnScreen(rectangle, true);
      resolveReveal();
    } catch (error) { rejectReveal(error); }
  }));
  const selected = await AndroidExp.input.click(scenarioView);
  if (!selected.ok) {
    await returnToMain();
    return failure('click-scenario', selected);
  }
  const scenario = await AndroidExp.wait.until(() => {
    let matched = false;
    Java.performNow(() => {
      const controller = Java.use(CONTROLLER_CLASS);
      matched = controller.getActivity().toString() === config.capabilityName
        && controller.getScenario().toString() === config.scenarioKey;
    });
    return matched;
  });
  if (!scenario.ok) {
    await returnToMain();
    return failure('wait-scenario', scenario);
  }
  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  const returned = await returnToMain();
  if (actionError !== undefined) throw actionError;
  if (!returned.passed) return returned;
  return { ...result, navigation: { returnedToMain: true } };
}

function navigate(scenarioKey, action) {
  return withScenarioNavigation({
    capabilityMenuId: R.id.api_menu_ui,
    capabilityRootId: R.id.api_ui_root,
    capabilityName: 'UI',
    scenarioKey,
    scenarioLabel: SCENARIO_LABELS[scenarioKey],
  }, action);
}
