#include <jni.h>
#include <jvmti.h>
#include <atomic>
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

/**
 * Probe.debugger 的原生执行层。JS 的配合关系：
 *
 * index.js --api.xxx(...)--> native.js --NativeFunction--> 本文件的 meu_debug_xxx
 * index.js <--onHit/onFinish 的 JS 函数体 <--NativeCallback 函数指针 <--本文件
 *
 * 全部发生在 App 进程内，不经过 Host RPC。这里不解析用户 JS，也不保存观测结果。
 * native.js 负责参数/返回值转换，index.js 负责条件、用户脚本、结果与异步 stop。
 *
 * 阅读顺序：Context/Hit → onBreakpoint → open → resolve/read/write/return
 *           → close/active/dispose。
 *
 * 三种容易混淆的指针：
 * - JavaVM*：当前 App 的虚拟机，用于获取接口环境。
 * - jvmtiEnv*：一次 debugger 注册拥有的工具环境，对应 index.js 的 handle。
 * - Hit*：一次命中的临时上下文，JS 只能在对应 onHit/onFinish 期间使用。
 */
namespace {
// 负数是本桥接层的错误；正数沿用 JVMTI 错误码，0 表示成功。native.js 负责转成 Error。
constexpr int kMissingLine = -1, kMissingBinding = -2, kAmbiguousBinding = -3;
constexpr int kWrongFrame = -4, kReturnConflict = -5, kBusy = -6;
struct Hit;
// 这两个地址来自 index.js 的 new NativeCallback(...)。
// C++ 像调用普通函数一样调用它们，Frida 会同步进入对应的 JS 函数体。
using OnHit = void (*)(Hit*);
using OnFinish = void (*)(Hit*, int);
// 生命周期：meu_debug_open 创建 → close 停止接收命中 → dispose 释放。
// 保存一份注册的状态；并发命中共用它，但各自有不同的 Hit。
struct Context {
    jvmtiEnv* ti = nullptr;
    JavaVM* vm = nullptr;
    jmethodID method = nullptr;
    jclass owner = nullptr; // JNI global ref：注册存活期间保住所属类，避免类被卸载。
    jlocation location = 0; // 方法内 VM 位置，不是机器指令地址。
    std::vector<std::string> arguments; // 参数类型描述符，例如 I、J、Ljava/lang/String;。
    std::string result; // 返回类型描述符，不是本次调用的返回值。
    int argumentBase = 0; // ART 中首个显式参数的寄存器槽位，已排除 this。
    bool enabled = false; // 是否接受新命中；读写由 contextsMutex 保护。
    bool breakpoint = false; // 是否仍有需要清除的物理断点。
    std::atomic<int> active{0}; // 已进入、尚未完成全部收尾的回调数量，stop 用它等待。
    std::atomic<int> reentrant{0}; // 因同线程递归观测而跳过的命中数。
    OnHit onHit = nullptr;
    OnFinish onFinish = nullptr;
};
// onBreakpoint 栈上的临时对象：onHit 与 onFinish 收到的是同一个地址。
// 原生回调退出后地址失效，不能保存在 JS 中留待下一次命中/异步任务使用。
struct Hit {
    Context* context;
    JNIEnv* jni;
    jthread thread;
    jlocation location;
    bool returning = false; // JS 是否提交了尚待执行的 forceReturn 意图。
    jvalue result{}; // JNI 的值联合体：i/j/f/d/l 分别存整数、long、float、double、对象引用。
};
// JVMTI 回调只给出 env；通过该表找到对应注册以及它的 JS 回调。
// shared_ptr 保证回调持有的 Context 不会因表项变化而提前销毁。
std::mutex contextsMutex;
std::unordered_map<jvmtiEnv*, std::shared_ptr<Context>> contexts;
// JS 调用 Java helper 时可能再次碰到断点。只跳过当前线程的递归命中，不挡其他线程。
thread_local bool observing = false;

std::shared_ptr<Context> lookup(jvmtiEnv* env) {
    std::lock_guard<std::mutex> lock(contextsMutex);
    auto it = contexts.find(env);
    return it == contexts.end() ? nullptr : it->second;
}
// JVMTI 分配的表/字符串必须用 Deallocate；不能与下方 strdup/free 混用。
void deallocate(jvmtiEnv* ti, void* p) {
    if (p) ti->Deallocate(static_cast<unsigned char*>(p));
}
// stack 结果通过 JSON 字符串返回 JS；这里处理字符串转义和 null。
std::string quoted(const char* s) {
    if (!s) return "null";
    std::ostringstream out; out << '"';
    for (const unsigned char* p = reinterpret_cast<const unsigned char*>(s); *p; ++p) {
        if (*p == '"' || *p == '\\') out << '\\' << *p;
        else if (*p < 0x20) {
            const char* hex = "0123456789abcdef";
            out << "\\u00" << hex[*p >> 4] << hex[*p & 15];
        } else out << *p;
    }
    out << '"'; return out.str();
}
std::string className(const char* signature) {
    std::string name = signature ? signature : "";
    if (!name.empty() && name[0] == 'L') name = name.substr(1, name.size() - 2);
    for (char& ch : name) if (ch == '/') ch = '.';
    return name;
}
// JS 中的 Java helper 必须已经返回，frame 0 才应重新指向命中的方法/位置。
// 所有 frame 读写及真正提前返回之前都检查，避免操作桥接调用产生的其他 frame。
int frame(Hit* hit) {
    jmethodID method; jlocation location;
    int e = hit->context->ti->GetFrameLocation(hit->thread, 0, &method, &location);
    return e ? e : (method == hit->context->method && location == hit->location ? 0 : kWrongFrame);
}
// 真正执行提前返回，仅由 onBreakpoint 在 JS onHit 已返回之后调用。
// 小整数类型 boolean/byte/char/short/int 统一走 Int；对象与数组走 Object。
int earlyReturn(Hit* hit) {
    auto ti = hit->context->ti;
    switch (hit->context->result[0]) {
        case 'V': return ti->ForceEarlyReturnVoid(hit->thread);
        case 'J': return ti->ForceEarlyReturnLong(hit->thread, hit->result.j);
        case 'F': return ti->ForceEarlyReturnFloat(hit->thread, hit->result.f);
        case 'D': return ti->ForceEarlyReturnDouble(hit->thread, hit->result.d);
        case 'L': case '[': return ti->ForceEarlyReturnObject(hit->thread, hit->result.l);
        case 'Z': case 'B': case 'C': case 'S': case 'I':
            return ti->ForceEarlyReturnInt(hit->thread, hit->result.i);
        default: return JVMTI_ERROR_ILLEGAL_ARGUMENT;
    }
}
/**
 * ART 直接调用的断点事件入口，运行在命中的业务线程上。
 *
 * 1. 确认注册仍接受事件，增加 active，然后释放管理锁。
 * 2. onHit 进入 JS：读变量、跑脚本；JS 可通过 meu_debug_* 同步调用回这里。
 * 3. onHit 返回后，才执行已提交的 ForceEarlyReturn。
 * 4. onFinish 进入 JS：补充原生错误、保存已序列化的记录，不再访问目标 frame。
 * 5. 释放临时引用并减少 active，允许 stop 完成清理。
 */
void JNICALL onBreakpoint(jvmtiEnv* ti, JNIEnv* jni, jthread thread, jmethodID method, jlocation location) {
    std::shared_ptr<Context> context;
    {
        std::lock_guard<std::mutex> lock(contextsMutex);
        auto it = contexts.find(ti);
        if (it == contexts.end() || !it->second->enabled) return;
        context = it->second;
        if (method != context->method || location != context->location) return;
        if (observing) {
            context->reentrant++;
            return;
        }
        context->active++;
    }
    // 不能持有 contextsMutex 调用 JS：JS 会再进入本库，其他线程也可能正在 stop。
    observing = true;
    Hit hit{context.get(), jni, thread, location};
    // JNI local frame 是临时“对象引用作用域”，不是 Java 方法栈帧。
    // 64 是请求的初始引用容量，不是 stack.maxDepth，也不是引用数量的硬上限。
    int error = jni->PushLocalFrame(64) == JNI_OK ? 0 : JVMTI_ERROR_OUT_OF_MEMORY;
    const bool hasLocalFrame = error == 0;
    if (hasLocalFrame) {
        context->onHit(&hit); // 进入 index.js 的 onHit；直到其同步执行完才返回此处。
        if (hit.returning) {
            error = frame(&hit);
            if (!error) error = earlyReturn(&hit);
            // 成功后不再读写目标 frame，也不再调用用户 Java 代码。
        }
    } else if (jni->ExceptionCheck()) {
        jni->ExceptionClear();
    }
    // 即使没有 forceReturn，也要通知 JS 本次命中已收尾。
    // local frame 创建失败时没有调用 onHit，onFinish 会补一条框架错误记录。
    context->onFinish(&hit, error);
    if (hit.returning && (context->result[0] == 'L' || context->result[0] == '[') && hit.result.l)
        jni->DeleteGlobalRef(hit.result.l);
    if (hasLocalFrame) jni->PopLocalFrame(nullptr);
    observing = false;
    context->active--;
}
} // namespace

// 保留稳定的 C 符号名，供 native.js 用 getExportByName 查找。
// meu_debug_* 是 Frida 直接调用的导出函数，不是 Java native 方法的自动命名绑定。
extern "C" {
// Android 加载 agent 后调用这个入口。这里只确认加载成功，不创建断点/工具环境。
JNIEXPORT jint JNICALL Agent_OnAttach(JavaVM*, char*, void*) { return JNI_OK; }

/**
 * index.js: api.open(vm, method, argumentTypes, argumentCount, returnType, line, onHit, onFinish, output)
 *
 * onHit/onFinish 是 Frida 回调函数指针；output 是 JS 分配的“一个指针大小”的内存。
 * 成功时把 jvmtiEnv* 写到 *output，JS 用 output.readPointer() 取得 handle。
 * open 内完成设置和启用；只有全部成功才发布 Context，允许事件进入 JS。
 * 失败时 output 保持空，原生层回滚，不需要 JS 异步清理。
 */
JNIEXPORT int meu_debug_open(JavaVM* vm, jmethodID method,
                             const char* const* argumentTypes, int argumentCount, const char* returnType,
                             int line, OnHit onHit, OnFinish onFinish, jvmtiEnv** output) {
    *output = nullptr;
    auto context = std::make_shared<Context>();
    context->vm = vm;
    context->method = method;
    context->onHit = onHit;
    context->onFinish = onFinish;
    // Copy Frida's JVM descriptors; the input pointers are only borrowed during open.
    // Zero-argument methods pass a null argumentTypes pointer and a count of zero.
    for (int i = 0; i < argumentCount; ++i) {
        context->arguments.emplace_back(argumentTypes[i]);
    }
    context->result = returnType;
    // 每次注册获取自己的工具环境，不修改 Frida 自己的 JVMTI callbacks/capabilities。
    if (vm->GetEnv(reinterpret_cast<void**>(&context->ti), JVMTI_VERSION_1_2) != JNI_OK)
        return JVMTI_ERROR_NOT_AVAILABLE;
    auto ti = context->ti;
    auto fail = [&](int e) {
        ti->DisposeEnvironment();
        return e;
    };
    // 申请本实现需要的能力。失败直接报错，不静默降级为另一种观测方式。
    jvmtiCapabilities capabilities{};
    capabilities.can_generate_breakpoint_events = 1;
    capabilities.can_access_local_variables = 1;
    capabilities.can_get_line_numbers = 1;
    capabilities.can_get_source_file_name = 1;
    capabilities.can_force_early_return = 1;
    int e = ti->AddCapabilities(&capabilities);
    if (e) return fail(e);
    // 源码行 → 所选方法内的最小 jlocation；不搜索其他方法，不跳到临近源码行。
    jint count = 0;
    jvmtiLineNumberEntry* lines = nullptr;
    e = ti->GetLineNumberTable(method, &count, &lines);
    if (e) return fail(e);
    bool found = false;
    for (int i = 0; i < count; ++i) {
        if (lines[i].line_number == line && (!found || lines[i].start_location < context->location)) {
            context->location = lines[i].start_location;
            found = true;
        }
    }
    deallocate(ti, lines);
    if (!found) return fail(kMissingLine);
    // ART 的参数放在 DEX 寄存器表尾部，并非从 slot 0 开始。
    // max - args 是参数区起点；实例方法再跳过 this。0x8 是 JVM ACC_STATIC 标志。
    jint max = 0, args = 0, modifiers = 0;
    if ((e = ti->GetMaxLocals(method, &max)) || (e = ti->GetArgumentsSize(method, &args)) ||
        (e = ti->GetMethodModifiers(method, &modifiers))) return fail(e);
    context->argumentBase = max - args + ((modifiers & 0x8) ? 0 : 1);
    // 此处注册的是 C++ onBreakpoint，不是 JS onHit；它负责包住 JS 执行的前后阶段。
    jvmtiEventCallbacks callbacks{};
    callbacks.Breakpoint = onBreakpoint;
    if ((e = ti->SetEventCallbacks(&callbacks, sizeof(callbacks)))) return fail(e);
    JNIEnv* jni = nullptr;
    if (vm->GetEnv(reinterpret_cast<void**>(&jni), JNI_VERSION_1_6) != JNI_OK) return fail(JVMTI_ERROR_UNATTACHED_THREAD);
    jclass owner = nullptr;
    if ((e = ti->GetMethodDeclaringClass(method, &owner))) return fail(e);
    context->owner = static_cast<jclass>(jni->NewGlobalRef(owner));
    jni->DeleteLocalRef(owner);
    if (!context->owner) { if (jni->ExceptionCheck()) jni->ExceptionClear(); return fail(JVMTI_ERROR_OUT_OF_MEMORY); }
    e = ti->SetBreakpoint(method, context->location);
    if (e) { jni->DeleteGlobalRef(context->owner); return fail(e); }
    context->breakpoint = true;
    e = ti->SetEventNotificationMode(JVMTI_ENABLE, JVMTI_EVENT_BREAKPOINT, nullptr);
    if (e) {
        ti->ClearBreakpoint(method, context->location);
        jni->DeleteGlobalRef(context->owner);
        return fail(e);
    }
    // 发布前收到的事件在 onBreakpoint 查表时直接返回，不会进入 JS。
    // 发布后没有后续 JVMTI 安装步骤；回调可能在 open 返回前进入，JS 已提前准备好状态。
    {
        std::lock_guard<std::mutex> lock(contextsMutex);
        context->enabled = true;
        contexts[ti] = context;
    }
    *output = ti;
    return 0;
}
// stop 的第一步：关闭接收、清除断点、禁用事件。不会等待已进入的回调，也不释放 env。
// enabled 和回调入口的 active++ 共用一把锁，明确哪些命中属于需要等待的在途回调。
JNIEXPORT int meu_debug_close(jvmtiEnv* env) {
    auto context = lookup(env);
    if (!context) return 0;
    { std::lock_guard<std::mutex> lock(contextsMutex); context->enabled = false; }
    int e = 0;
    if (context->breakpoint) {
        e = env->ClearBreakpoint(context->method, context->location);
        if (!e || e == JVMTI_ERROR_NOT_FOUND) { context->breakpoint = false; e = 0; }
    }
    int disabled = env->SetEventNotificationMode(JVMTI_DISABLE, JVMTI_EVENT_BREAKPOINT, nullptr);
    return e ? e : disabled;
}
// index.js 异步轮询 active，避免阻塞 JS 线程，导致其他回调无法完成。
JNIEXPORT int meu_debug_active(jvmtiEnv* env) { auto context = lookup(env); return context ? context->active.load() : 0; }
JNIEXPORT int meu_debug_reentrant(jvmtiEnv* env) { auto context = lookup(env); return context ? context->reentrant.load() : 0; }
// stop 的最后一步：只有关闭接收且 active == 0 才能释放环境。
// 释放成功后 index.js 才解除回调强引用；这里不会卸载 agent .so。
JNIEXPORT int meu_debug_dispose(jvmtiEnv* env) {
    auto context = lookup(env);
    if (!context) return 0;
    { std::lock_guard<std::mutex> lock(contextsMutex); if (context->enabled || context->active) return kBusy; }
    JNIEnv* jni = nullptr;
    if (context->vm->GetEnv(reinterpret_cast<void**>(&jni), JNI_VERSION_1_6) != JNI_OK) return JVMTI_ERROR_UNATTACHED_THREAD;
    int e = env->DisposeEnvironment(); if (e) return e;
    jni->DeleteGlobalRef(context->owner);
    std::lock_guard<std::mutex> lock(contextsMutex); contexts.erase(env);
    return 0;
}
// 本库用 strdup 返回的字符串由 native.js 的 takeString 读完后调用此函数释放。
JNIEXPORT void meu_debug_free(void* p) { std::free(p); }
/**
 * 将 binding 来源解析成 slot + JVM 类型描述符，由 JS 再调用 read 取实际值。
 * name == nullptr：argument.index；name != nullptr：当前 frame 的 local.name。
 * slot/type 都是输出参数；type 为 strdup 分配的字符串，读取后由 JS 释放。
 */
JNIEXPORT int meu_debug_resolve(Hit* hit, const char* name, int index, int* slot, char** type) {
    int e = frame(hit);
    if (e) return e;
    auto context = hit->context;
    if (!name) {
        // 参数无需变量名：从参数区起点累加前面参数的宽度；long/double 占两个槽位。
        if (index < 0 || index >= static_cast<int>(context->arguments.size())) return kMissingBinding;
        *slot = context->argumentBase;
        for (int i = 0; i < index; ++i) *slot += (context->arguments[i] == "J" || context->arguments[i] == "D") ? 2 : 1;
        *type = strdup(context->arguments[index].c_str());
    } else {
        // 同名 local 可能属于不同作用域，只选择当前 location 落在其有效区间的条目。
        // 不搜索字段、外部实例或闭包，也不把多个匹配静默选成第一个。
        jint count = 0;
        jvmtiLocalVariableEntry* locals = nullptr;
        e = context->ti->GetLocalVariableTable(context->method, &count, &locals); if (e) return e;
        int matches = 0; std::string signature;
        for (int i = 0; i < count; ++i) {
            auto& local = locals[i];
            if (!strcmp(local.name, name) && hit->location >= local.start_location &&
                hit->location - local.start_location < local.length) {
                ++matches; *slot = local.slot; signature = local.signature;
            }
            deallocate(context->ti, local.name); deallocate(context->ti, local.signature); deallocate(context->ti, local.generic_signature);
        }
        deallocate(context->ti, locals);
        if (matches != 1) return matches ? kAmbiguousBinding : kMissingBinding;
        *type = strdup(signature.c_str());
    }
    return *type ? 0 : JVMTI_ERROR_OUT_OF_MEMORY;
}
// native.js 分配 jvalue 大小的缓冲区；本函数写入它，再由 JS 按 signature 解码。
// GetLocalObject 得到的是 JNI 对象引用，不是对象内容的内存快照。
JNIEXPORT int meu_debug_read(Hit* hit, int slot, int type, jvalue* value) {
    int e = frame(hit);
    if (e) return e;
    auto ti = hit->context->ti;
    switch (type) {
        case 'J': return ti->GetLocalLong(hit->thread, 0, slot, &value->j);
        case 'F': return ti->GetLocalFloat(hit->thread, 0, slot, &value->f);
        case 'D': return ti->GetLocalDouble(hit->thread, 0, slot, &value->d);
        case 'L': case '[': return ti->GetLocalObject(hit->thread, 0, slot, &value->l);
        case 'Z': case 'B': case 'C': case 'S': case 'I':
            return ti->GetLocalInt(hit->thread, 0, slot, &value->i);
        default: return JVMTI_ERROR_ILLEGAL_ARGUMENT;
    }
}
// ctx.setBinding → native.js 编码为 jvalue → 此处立即 SetLocal*。
// 只修改当前 frame 的目标槽位，不更新 JS 中已经读出的变量副本。
JNIEXPORT int meu_debug_write(Hit* hit, int slot, int type, const jvalue* value) {
    int e = frame(hit);
    if (e) return e;
    auto ti = hit->context->ti;
    switch (type) {
        case 'J': return ti->SetLocalLong(hit->thread, 0, slot, value->j);
        case 'F': return ti->SetLocalFloat(hit->thread, 0, slot, value->f);
        case 'D': return ti->SetLocalDouble(hit->thread, 0, slot, value->d);
        case 'L': case '[': return ti->SetLocalObject(hit->thread, 0, slot, value->l);
        case 'Z': case 'B': case 'C': case 'S': case 'I':
            return ti->SetLocalInt(hit->thread, 0, slot, value->i);
        default: return JVMTI_ERROR_ILLEGAL_ARGUMENT;
    }
}
// ctx.forceReturn → 此处仅保存意图/返回值，绝不在 JS 尚未退出时执行 ForceEarlyReturn。
// 对象需转为 global ref，保证 JS 释放临时 wrapper 后，返回值仍存活到原生收尾。
JNIEXPORT int meu_debug_return(Hit* hit, const jvalue* value) {
    if (hit->returning) return kReturnConflict;
    int e = frame(hit);
    if (e) return e;
    hit->result = *value;
    if ((hit->context->result[0] == 'L' || hit->context->result[0] == '[') && value->l) {
        hit->result.l = hit->jni->NewGlobalRef(value->l);
        if (!hit->result.l) {
            if (hit->jni->ExceptionCheck()) hit->jni->ExceptionClear();
            return JVMTI_ERROR_OUT_OF_MEMORY;
        }
    }
    hit->returning = true;
    return 0;
}
// 请求返回的那个 observation 报错时，JS 调用此函数撤销意图并释放保活引用。
// 此操作不会回滚已经完成的 SetLocal 写入。
JNIEXPORT void meu_debug_cancel_return(Hit* hit) {
    if (hit->returning && (hit->context->result[0] == 'L' || hit->context->result[0] == '[') && hit->result.l)
        hit->jni->DeleteGlobalRef(hit->result.l);
    hit->returning = false;
    hit->result = {};
}
// 读取 Java 线程名；它与 JS 记录的原生线程 ID 是两项不同信息。
JNIEXPORT char* meu_debug_thread(Hit* hit) {
    jvmtiThreadInfo info{};
    int e = hit->context->ti->GetThreadInfo(hit->thread, &info);
    if (e) return nullptr;
    char* name = info.name ? strdup(info.name) : nullptr;
    deallocate(hit->context->ti, info.name);
    if (info.thread_group) hit->jni->DeleteLocalRef(info.thread_group);
    if (info.context_class_loader) hit->jni->DeleteLocalRef(info.context_class_loader);
    return name;
}
// 从目标方法所在 frame 0 开始读运行时栈，再补充类名、方法名、源文件和行号。
// 返回 JSON 字符串给 JS，不在 C++ 保存 hit 记录，也不重建 Kotlin 协程/内联逻辑栈。
JNIEXPORT int meu_debug_stack(Hit* hit, int depth, char** output) {
    if (depth < 1) return JVMTI_ERROR_ILLEGAL_ARGUMENT;
    int e = frame(hit);
    if (e) return e;
    auto ti = hit->context->ti;
    jint available = 0;
    if ((e = ti->GetFrameCount(hit->thread, &available))) return e;
    // 按实际帧数限制分配量；maxDepth 很大也无需分配同样大的数组。
    depth = std::min(depth, available);
    if (depth == 0) { *output = strdup("[]"); return *output ? 0 : JVMTI_ERROR_OUT_OF_MEMORY; }
    std::vector<jvmtiFrameInfo> frames(depth); jint count = 0;
    if ((e = ti->GetStackTrace(hit->thread, 0, depth, frames.data(), &count))) return e;
    std::ostringstream out; out << '[';
    for (int i = 0; i < count; ++i) {
        char *name = nullptr, *signature = nullptr, *source = nullptr; jclass owner = nullptr;
        e = ti->GetMethodName(frames[i].method, &name, nullptr, nullptr);
        if (!e) e = ti->GetMethodDeclaringClass(frames[i].method, &owner);
        if (!e) e = ti->GetClassSignature(owner, &signature, nullptr);
        if (!e) ti->GetSourceFileName(owner, &source); // 源文件缺失允许返回 null。
        int line = -1; jlocation nearest = -1; jint n = 0; jvmtiLineNumberEntry* lines = nullptr;
        // 栈中的 location 不一定恰好是行表条目的起点，取不超过它的最近条目。
        if (!e && !ti->GetLineNumberTable(frames[i].method, &n, &lines)) {
            for (int j = 0; j < n; ++j) if (lines[j].start_location <= frames[i].location && lines[j].start_location >= nearest) {
                line = lines[j].line_number; nearest = lines[j].start_location;
            }
            deallocate(ti, lines);
        }
        if (i) out << ',';
        out << "{\"className\":" << quoted(className(signature).c_str())
            << ",\"methodName\":" << quoted(name) << ",\"sourceFile\":" << quoted(source)
            << ",\"line\":" << (line < 0 ? "null" : std::to_string(line)) << '}';
        deallocate(ti, name); deallocate(ti, signature); deallocate(ti, source);
        if (owner) hit->jni->DeleteLocalRef(owner);
        if (e) return e;
    }
    out << ']'; *output = strdup(out.str().c_str());
    return *output ? 0 : JVMTI_ERROR_OUT_OF_MEMORY;
}
} // extern "C"
