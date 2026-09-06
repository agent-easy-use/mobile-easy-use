import { safeConsole, writeEvidence } from '../../common/reporting.js';

const NSLOG_SYMBOL = 'NSLog';
const BRIDGE_MODULE = 'MobileEasyUse.dylib';
const REPLACEMENT_SYMBOL = 'mobile_easy_use_replace_nslog';
const SET_CAPTURE_SYMBOL = 'mobile_easy_use_set_nslog_capture';

let nativeLogRuntime;
let activeCapture = null;
const filterDataByTag = new Map();

function readUtf8(pointer) {
  if (!pointer || pointer.isNull()) {
    return '';
  }
  return pointer.readUtf8String() ?? '';
}

function resolveGlobalExport(symbol) {
  try {
    return Module.getGlobalExportByName(symbol);
  } catch (error) {
    throw new Error(`Required iOS native symbol is unavailable: ${symbol}`);
  }
}

function resolveBridgeExport(symbol) {
  try {
    return Process.getModuleByName(BRIDGE_MODULE).getExportByName(symbol);
  } catch (error) {
    throw new Error(`Required iOS bridge symbol is unavailable: ${symbol}`);
  }
}

function getNativeLogRuntime() {
  if (nativeLogRuntime) {
    return nativeLogRuntime;
  }

  const onMatchedLog = new NativeCallback((tagPointer, messagePointer) => {
    const capture = activeCapture;
    if (!capture) {
      return;
    }
    try {
      writeEvidence('chain', {
        type: 'log',
        actionDescription: capture.actionDescription,
        level: 'default',
        tag: readUtf8(tagPointer),
        message: readUtf8(messagePointer),
      });
    } catch (_) {
    }
  }, 'void', ['pointer', 'pointer']);

  const setCapture = new NativeFunction(
    resolveBridgeExport(SET_CAPTURE_SYMBOL),
    'void',
    ['pointer', 'uint', 'pointer'],
  );
  nativeLogRuntime = {
    nullPointer: ptr(0),
    onMatchedLog,
    replacement: resolveBridgeExport(REPLACEMENT_SYMBOL),
    setCapture,
  };
  return nativeLogRuntime;
}

function getFilterData(tag) {
  let data = filterDataByTag.get(tag);
  if (data) {
    return data;
  }

  data = {
    tagPointer: Memory.allocUtf8String(tag),
    prefixPointer: Memory.allocUtf8String(`[${tag}] `),
  };
  filterDataByTag.set(tag, data);
  return data;
}

function createFilterTable(tags) {
  const filters = [...tags].map(getFilterData);
  const table = Memory.alloc(filters.length * Process.pointerSize * 2);
  filters.forEach((filter, index) => {
    const entry = table.add(index * Process.pointerSize * 2);
    entry.writePointer(filter.tagPointer);
    entry.add(Process.pointerSize).writePointer(filter.prefixPointer);
  });
  return { count: filters.length, filters, table };
}

function flushInterceptor() {
  if (typeof Interceptor.flush === 'function') {
    Interceptor.flush();
  }
}

function clearNativeCapture(runtime) {
  runtime.setCapture(runtime.nullPointer, 0, runtime.nullPointer);
}

function installNSLogEvidenceReplacement(tags, actionDescription) {
  if (!(tags instanceof Set) || tags.size === 0) {
    throw new Error('Native NSLog replacement requires at least one TAG');
  }
  if (typeof Interceptor === 'undefined'
      || typeof Interceptor.replace !== 'function'
      || typeof Interceptor.revert !== 'function') {
    throw new Error('Interceptor replacement is unavailable in the current iOS process');
  }
  if (activeCapture) {
    throw new Error('Native NSLog evidence capture is already active');
  }

  const runtime = getNativeLogRuntime();
  const target = resolveGlobalExport(NSLOG_SYMBOL);
  const filterTable = createFilterTable(tags);
  activeCapture = { actionDescription, filterTable };
  let replaced = false;

  try {
    runtime.setCapture(filterTable.table, filterTable.count, runtime.onMatchedLog);
    Interceptor.replace(target, runtime.replacement);
    replaced = true;
    flushInterceptor();
  } catch (error) {
    if (replaced) {
      try {
        Interceptor.revert(target);
        flushInterceptor();
      } catch (_) {
      }
    }
    try {
      clearNativeCapture(runtime);
    } catch (_) {
    }
    activeCapture = null;
    throw error;
  }

  let uninstalled = false;
  return () => {
    if (uninstalled) {
      return;
    }
    uninstalled = true;
    try {
      Interceptor.revert(target);
      flushInterceptor();
    } catch (error) {
      safeConsole('warn', '[mobile-easy-use] native NSLog replacement cleanup failed', {
        message: String(error?.message ?? error),
      });
    } finally {
      try {
        clearNativeCapture(runtime);
      } catch (_) {
      }
      activeCapture = null;
    }
  };
}

export { installNSLogEvidenceReplacement };
