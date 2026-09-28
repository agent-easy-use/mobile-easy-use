import Java from 'frida-java-bridge';
import { errorMessage, safeEmit } from '../../common/reporting.js';
import { backend, check, takeString, readBinding, encode, snapshot } from './native.js';

/**
 * 本文件负责 Probe.debugger 的 JS 编排；JVMTI 的 JS 调用接口封装在 native.js，原生实现位于 debugger.cpp。
 *
 * 注册：确认同步回调 → 选择方法并读取返回类型 → open 创建并启用断点 → 返回 stop。
 * 命中：native → onHit（条件、取值、用户脚本）→ native（执行提前返回）
 *             → onFinish（补充原生错误、保存记录）。
 * 清理：stop → 关闭新命中 → 等待在途回调 → 释放环境 → 返回记录数组。
 *
 * onHit/onFinish 都在命中的业务线程上同步执行。stop 是异步的，不能在自己的
 * 断点回调里等待它，否则会等待当前回调结束，形成死锁。
 */

// SDK 级状态：供正常断连时统一清理，同时强引用仍被 native 使用的回调函数。
const registrations = new Set();
let shuttingDown = false;
// 必须按线程判断，不能用全局 boolean：某个线程正在命中时，Host 仍应能调用 stop。
const callbackThreads = new Set();
const isInBreakpointCallback = () => callbackThreads.has(Process.getCurrentThreadId());
const failure = error => ({ status: 'error', message: errorMessage(error) });

// 配置结构由公开类型约定；只阻止不能在断点同步阶段执行的函数。
function requireSynchronous(fn) {
  const kind = Object.prototype.toString.call(fn);
  if (['[object AsyncFunction]', '[object GeneratorFunction]', '[object AsyncGeneratorFunction]'].includes(kind)) {
    throw new Error('Debugger callbacks must be synchronous, not async or generators');
  }
}

// 从按别名保存的 {slot, signature, value} 中提取用户函数接收的 {别名: value}。
// 槽位信息仅由 ctx 使用；用户拿到的对象不暴露 native 地址或 frame 操作细节。
function bindingValues(bindings) {
  return Object.fromEntries(Object.entries(bindings).map(([name, binding]) => [name, binding.value]));
}

// 返回一个精确重载，以及它所属 ClassLoader 的工厂，供绑定对象的类型转换使用。
function resolveMethod(definition) {
  const target = typeof definition.target === 'string' ? Java.use(definition.target) : definition.target;
  const name = definition.method;
  const wrapper = typeof name === 'string' ? target?.[name] : null;
  if (!target?.$className || !Array.isArray(wrapper?.overloads)) {
    throw new Error('Java method not found');
  }
  if (['$new', '$init', '<init>', '<clinit>'].includes(name)) {
    throw new Error('Constructors and class initializers are unsupported');
  }
  if (definition.argumentTypes === undefined && wrapper.overloads.length !== 1) {
    throw new Error('Specify argumentTypes for an overloaded method');
  }
  const method = definition.argumentTypes === undefined ? wrapper.overloads[0] : wrapper.overload(...definition.argumentTypes);
  return { method, factory: Java.ClassFactory.get(target.class.getClassLoader()) };
}

/**
 * 创建一次 debugger 注册。下面的回调和 stop 共用此闭包，避免将一份注册状态拆散。
 * 原生环境、在途记录、最终结果都属于这次注册，不跨 debugger 共享。
 */
function install(definition) {
  const { method, factory } = resolveMethod(definition);
  const api = backend();
  // Frida 已有返回类型描述符，无需再向 C++ 查询。首次命中前就要准备好。
  const returnType = method.returnType.name;
  // handle 是本次注册的 jvmtiEnv*，不是 method.handle（jmethodID）。
  // 回调只使用 native 传入的 Hit*，不依赖 open 返回后的 handle 赋值。
  let handle = null;
  let hitSequence = 0;
  let stopPromise;

  // pendingHits: native Hit* 地址 → JS 命中状态，连接 onHit 与稍后的 onFinish。
  // completedHits: 原生收尾已结束的记录；不同线程可能按不同于进入顺序的次序完成。
  const pendingHits = new Map();
  const completedHits = [];
  const makeHit = () => ({
    hitId: `h${++hitSequence}`,
    timestamp: new Date().toISOString(),
    thread: { id: String(Process.getCurrentThreadId()), name: null },
    observations: Object.create(null),
  });
  // 阶段一：仍可访问目标 frame。native 传入的 hit 是仅本次回调有效的 Hit*。
  const onHit = new NativeCallback(hit => {
    callbackThreads.add(Process.getCurrentThreadId());
    const hitState = {
      record: makeHit(),
      order: hitSequence,
      // 记录哪个 observation 提交了提前返回，便于取消意图、归属延迟执行的错误。
      returnObservationName: null,
      // 条件 false 时不保存；条件错误和框架错误仍需保存。
      shouldRecord: true,
    };
    pendingHits.set(hit.toString(), hitState);
    // 暂存本次读取/转换时创建的 Java wrapper，退出 onHit 前统一释放。
    // 记录中保存的是 snapshot 后的数据，不能持有这些临时 wrapper。
    const wrappers = [];
    const read = source => readBinding(api, hit, source, factory, wrappers);
    const readBindings = bindings => {
      const result = Object.create(null);
      for (const [name, source] of Object.entries(bindings)) {
        result[name] = read(source);
      }
      return result;
    };
    try {
      hitState.record.thread.name = takeString(api, api.thread(hit));
      // 1. 先执行条件。false 和条件报错都不再执行 observations，但报错会留记录。
      if (definition.condition) {
        try {
          const values = bindingValues(readBindings(definition.condition.bindings));
          const predicate = definition.condition.predicate;
          const matched = predicate(values);
          if (typeof matched !== 'boolean') {
            throw new Error('Condition must synchronously return boolean');
          }
          if (!matched) {
            hitState.shouldRecord = false;
            return;
          }
        } catch (error) {
          hitState.record.condition = failure(error);
          return;
        }
      }
      // 2. 按配置顺序逐项读取、执行和保存。后续项可以读到前序 setBinding 的写入。
      // 一项失败只记录该项错误，不中止后续项；forceReturn 仍等整个 onHit 结束后执行。
      for (const option of definition.observations) {
        try {
          if (option.kind === 'value') {
            hitState.record.observations[option.name] = { status: 'ok', value: snapshot(read(option.source).value) };
            continue;
          }
          if (option.kind === 'stack') {
            const output = Memory.alloc(Process.pointerSize);
            check(api.stack(hit, option.maxDepth ?? 3, output), 'Read stack');
            hitState.record.observations[option.name] = { status: 'ok', value: JSON.parse(takeString(api, output.readPointer())) };
            continue;
          }
          if (option.kind !== 'customRun') {
            throw new Error(`Unsupported debugger observation kind: ${option.kind}`);
          }
          const bindings = readBindings(option.bindings);
          let running = true;
          const assertRunning = () => {
            if (!running) {
              throw new Error('ctx is only valid during this synchronous run invocation');
            }
          };
          const ctx = Object.freeze({
            // 立即写入原 frame 的槽位；传给用户函数的 JS 实参不会随之刷新。
            setBinding(name, value) {
              assertRunning();
              const selected = bindings[name];
              if (!selected) {
                throw new Error(`Unknown binding: ${name}`);
              }
              const buffer = encode(value, selected.signature, factory, wrappers);
              check(api.write(hit, selected.slot, selected.signature.charCodeAt(0), buffer), 'setBinding');
            },
            // 这里只向 native 保存返回意图。真正的 ForceEarlyReturn 要等 onHit 完全退出。
            forceReturn(value) {
              assertRunning();
              if (hitState.returnObservationName !== null) {
                throw new Error('forceReturn was already requested for this hit');
              }
              const buffer = encode(value, returnType, factory, wrappers);
              check(api.return(hit, buffer), 'forceReturn');
              hitState.returnObservationName = option.name;
            },
          });
          const values = bindingValues(bindings);
          let value;
          try {
            const run = option.run;
            value = run(values, ctx);
          } finally {
            // 即使用户保存了 ctx，函数返回之后也不能再读写本次 frame。
            running = false;
          }
          hitState.record.observations[option.name] = { status: 'ok', value: snapshot(value) };
        } catch (error) {
          // 只取消当前失败 observation 自己的意图，不取消其他 observation 的成功请求。
          // 已执行的 setBinding 不回滚；序列化失败也按当前 observation 失败处理。
          if (hitState.returnObservationName === option.name) {
            api.cancelReturn(hit);
            hitState.returnObservationName = null;
          }
          hitState.record.observations[option.name] = failure(error);
        }
      }
    } catch (error) {
      // 框架级失败：取消未执行的返回意图，保留已收集内容，并让 native 正常退出回调。
      api.cancelReturn(hit);
      hitState.returnObservationName = null;
      hitState.record.error = failure(error);
    } finally {
      for (const wrapper of wrappers) {
        try {
          wrapper.$dispose();
        } catch (_) {
          // 单个 wrapper 的释放异常不能阻止其他 wrapper 清理，也不能冒泡到业务线程。
        }
      }
      callbackThreads.delete(Process.getCurrentThreadId());
    }
  }, 'void', ['pointer']);
  // 阶段二：native 完成收尾（若有提前返回请求，也已尝试执行），把最终错误码交回 JS。
  // 这里仅整理 JS 数据，不能再访问 Java/frame，也不能再执行用户脚本。
  const onFinish = new NativeCallback((hit, error) => {
    const key = hit.toString();
    // native 建立 JNI local frame 失败时不会调用 onHit，此处补一条框架错误记录。
    const hitState = pendingHits.get(key) ?? {
      record: makeHit(),
      order: hitSequence,
      returnObservationName: null,
      shouldRecord: true,
    };
    pendingHits.delete(key);
    if (error !== 0) {
      let diagnostic;
      try {
        check(error, 'Complete breakpoint');
      } catch (cause) {
        diagnostic = failure(cause);
      }
      if (hitState.returnObservationName !== null) {
        hitState.record.observations[hitState.returnObservationName] = diagnostic;
      } else {
        hitState.record.error = diagnostic;
      }
    }
    if (hitState.shouldRecord) completedHits.push(hitState);
  }, 'void', ['pointer', 'int']);

  // 必须强引用 NativeCallback，直到原生事件已关闭且所有在途回调结束。
  const registration = { stop, onHit, onFinish };
  function stop() {
    if (isInBreakpointCallback()) {
      throw new Error('Do not await/stop a debugger from a breakpoint callback');
    }
    if (stopPromise) return stopPromise;
    // 先保存 Promise，再进入清理。native 调用可能释放 JS 锁，重复 stop 要复用同一任务。
    stopPromise = Promise.resolve().then(async () => {
      // 1. 关闭新命中、清除断点；失败直接抛出。
      check(api.close(handle), 'Clear breakpoint');
      // 2. 异步等待 onHit + 原生收尾 + onFinish 全部结束，不能阻塞 JS 线程等待。
      while (api.active(handle) !== 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const skipped = api.reentrant(handle);
      if (skipped) safeEmit('probe.debugger.reentrant', { count: skipped });
      // 3. 释放环境需要 JNI 线程上下文。成功之后才允许释放回调。
      Java.performNow(() => check(api.dispose(handle), 'Dispose debugger'));
      registrations.delete(registration);
      // 4. 按进入 JS 回调的顺序返回原始记录；并发完成次序可能不同，不做汇总或去重。
      return completedHits.sort((a, b) => a.order - b.order).map(hitState => hitState.record);
    }).catch(error => {
      // 仅在环境还存活时允许重试清理；已完成的 stop 保留同一 Promise/result。
      if (registrations.has(registration)) stopPromise = undefined;
      throw error;
    });
    return stopPromise;
  }
  // open 内完成注册和启用；此时回调所需的 JS 状态已准备好。
  // 安装过程中的局部引用保住 onHit/onFinish；成功后由 registrations 继续持有。
  // 原生层保证失败时回滚且不向 JS 派发命中，因此这里只检查错误码。
  // Pass Frida's JVM descriptors as const char*[]; native copies them during open.
  const argumentTypes = method.argumentTypes.map(type => Memory.allocUtf8String(type.name));
  const argumentTypePointers = argumentTypes.length === 0
    ? ptr(0)
    : Memory.alloc(argumentTypes.length * Process.pointerSize);
  argumentTypes.forEach((type, index) => {
    argumentTypePointers.add(index * Process.pointerSize).writePointer(type);
  });
  const returnTypePointer = Memory.allocUtf8String(returnType);
  const output = Memory.alloc(Process.pointerSize);
  check(api.open(Java.vm.handle, method.handle, argumentTypePointers, argumentTypes.length,
    returnTypePointer, definition.fileLine, onHit, onFinish, output), 'Register debugger');
  handle = output.readPointer();
  registrations.add(registration);
  return stop;
}

// 公开入口：Java.performNow 为安装代码提供 JNI 上下文，不会切换到 Android 主线程。
export async function debuggerProbe(definition) {
  if (isInBreakpointCallback()) throw new Error('Do not register a debugger from a breakpoint callback');
  if (shuttingDown) throw new Error('Debugger runtime is shutting down');
  if (definition.condition) requireSynchronous(definition.condition.predicate);
  for (const observation of definition.observations) {
    if (observation.kind === 'customRun') requireSynchronous(observation.run);
  }

  let stop;
  Java.performNow(() => { stop = install(definition); });
  return stop;
}

// 正常断连的 SDK 级清理：禁止新注册，然后清理已有注册。
export async function stopDebuggers() {
  shuttingDown = true;
  // 尝试清理所有注册；其中一个失败也不能让其他注册跳过清理。
  const results = await Promise.allSettled([...registrations].map(registration => registration.stop()));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
}
