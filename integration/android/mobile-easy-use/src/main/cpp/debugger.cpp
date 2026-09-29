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
 * Native execution layer for Probe.debugger. Interaction with JS:
 *
 * index.js --api.xxx(...)--> native.js --NativeFunction--> meu_debug_xxx in this file
 * index.js <--onHit/onFinish JS bodies <--NativeCallback function pointers <--this file
 *
 * Everything runs inside the App process, without Host RPC. This layer neither parses JS nor stores observations.
 * native.js converts arguments/results; index.js handles conditions, user callbacks, records, and asynchronous stop.
 *
 * Reading order: Context/Hit → onBreakpoint → open → resolve/read/write/return
 *           → close/active/dispose。
 *
 * Three distinct pointer types:
 * - JavaVM*: the App virtual machine, used to obtain interface environments.
 * - jvmtiEnv*: the tool environment owned by one registration, exposed as handle in index.js.
 * - Hit*: temporary context for one hit, available to JS only during its onHit/onFinish callbacks.
 */
namespace {
// Negative codes are bridge errors; positive codes are JVMTI errors; zero means success. native.js creates Errors.
constexpr int kMissingLine = -1, kMissingBinding = -2, kAmbiguousBinding = -3;
constexpr int kWrongFrame = -4, kReturnConflict = -5, kBusy = -6;
struct Hit;
// These function pointers come from new NativeCallback(...) in index.js.
// C++ invokes them normally; Frida synchronously enters the corresponding JS function.
using OnHit = void (*)(Hit*);
using OnFinish = void (*)(Hit*, int);
// Lifecycle: meu_debug_open creates → close stops accepting hits → dispose releases.
// Concurrent hits share registration state but each has its own Hit.
struct Context {
    jvmtiEnv* ti = nullptr;
    JavaVM* vm = nullptr;
    jmethodID method = nullptr;
    jclass owner = nullptr; // JNI global ref keeps the declaring class loaded for the lifetime of the registration.
    jlocation location = 0; // VM location within the method, not a machine instruction address.
    std::string result; // Return type descriptor, not the return value of this invocation.
    bool enabled = false; // Whether new hits are accepted; protected by contextsMutex.
    bool breakpoint = false; // Whether a physical breakpoint still needs to be cleared.
    std::atomic<int> active{0}; // Entered callbacks whose cleanup is incomplete; stop waits for this count.
    std::atomic<int> reentrant{0}; // Hits skipped due to recursive observation on the same thread.
    OnHit onHit = nullptr;
    OnFinish onFinish = nullptr;
};
// Temporary object on the onBreakpoint stack; onHit and onFinish receive the same address.
// The address expires when the native callback exits; JS must not save it for later hits or asynchronous work.
struct Hit {
    Context* context;
    JNIEnv* jni;
    jthread thread;
    jlocation location;
    bool returning = false; // Whether JS has staged an earlyReturn that native code has yet to apply.
    jvalue result{}; // JNI value union: i/j/f/d/l hold int, long, float, double, and object references.
};
// JVMTI callbacks supply only env; this map finds the registration and its JS callbacks.
// shared_ptr keeps a callback's Context alive even if the map changes.
std::mutex contextsMutex;
std::unordered_map<jvmtiEnv*, std::shared_ptr<Context>> contexts;
// Java helpers called by JS may hit breakpoints again. Skip recursion on this thread without blocking other threads.
thread_local bool observing = false;

std::shared_ptr<Context> lookup(jvmtiEnv* env) {
    std::lock_guard<std::mutex> lock(contextsMutex);
    auto it = contexts.find(env);
    return it == contexts.end() ? nullptr : it->second;
}
// Free JVMTI tables/strings with Deallocate; never mix them with the strdup/free allocations below.
void deallocate(jvmtiEnv* ti, void* p) {
    if (p) ti->Deallocate(static_cast<unsigned char*>(p));
}
// Stack results reach JS as JSON; escape strings and preserve null here.
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
// Java helpers called from JS must have returned so frame 0 points to the original method/location again.
// Check before frame access and early return to avoid operating on frames introduced by bridge calls.
int frame(Hit* hit) {
    jmethodID method; jlocation location;
    int e = hit->context->ti->GetFrameLocation(hit->thread, 0, &method, &location);
    return e ? e : (method == hit->context->method && location == hit->location ? 0 : kWrongFrame);
}
// Apply the early return only from onBreakpoint, after the JS onHit callback has returned.
// boolean/byte/char/short/int use Int; objects and arrays use Object.
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
 * Breakpoint event entry called directly by ART on the thread that hit the breakpoint.
 *
 * 1. Verify that the registration accepts events, increment active, then release the management lock.
 * 2. Enter JS through onHit to read variables and run callbacks; JS may call meu_debug_* synchronously.
 * 3. Apply any staged ForceEarlyReturn only after onHit has returned.
 * 4. Enter JS through onFinish to append native errors and save serialized records without accessing the target frame.
 * 5. Release temporary references and decrement active so stop can finish cleanup.
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
    // Do not hold contextsMutex across JS calls: JS reenters this library and other threads may call stop.
    observing = true;
    Hit hit{context.get(), jni, thread, location};
    // A JNI local frame scopes temporary object references; it is not a Java method stack frame.
    // 64 requests initial reference capacity; it is neither stack depth nor a hard reference limit.
    int error = jni->PushLocalFrame(64) == JNI_OK ? 0 : JVMTI_ERROR_OUT_OF_MEMORY;
    const bool hasLocalFrame = error == 0;
    if (hasLocalFrame) {
        context->onHit(&hit); // Enter onHit in index.js and wait for its synchronous execution to finish.
        if (hit.returning) {
            error = frame(&hit);
            if (!error) error = earlyReturn(&hit);
            // After success, do not access the target frame or call user Java code.
        }
    } else if (jni->ExceptionCheck()) {
        jni->ExceptionClear();
    }
    // Notify JS of native completion even when no earlyReturn was requested.
    // If local frame creation failed, onHit was skipped; onFinish creates a framework error record.
    context->onFinish(&hit, error);
    if (hit.returning && (context->result[0] == 'L' || context->result[0] == '[') && hit.result.l)
        jni->DeleteGlobalRef(hit.result.l);
    if (hasLocalFrame) jni->PopLocalFrame(nullptr);
    observing = false;
    context->active--;
}
} // namespace

// Keep stable C symbol names for native.js getExportByName lookups.
// meu_debug_* exports are called directly by Frida, not through Java native method name binding.
extern "C" {
// Android calls this entry after loading the agent. Acknowledge loading without creating breakpoints or tool environments.
JNIEXPORT jint JNICALL Agent_OnAttach(JavaVM*, char*, void*) { return JNI_OK; }

/**
 * index.js: api.open(vm, method, returnType, line, onHit, onFinish, output)
 *
 * onHit/onFinish are Frida callback pointers; output points to pointer-sized storage allocated by JS.
 * On success, write jvmtiEnv* to *output; JS obtains the handle with output.readPointer().
 * open installs and enables the breakpoint, publishing Context only after all steps succeed.
 * On failure, output remains null and native code rolls back without asynchronous JS cleanup.
 */
JNIEXPORT int meu_debug_open(JavaVM* vm, jmethodID method,
                             const char* returnType,
                             int line, OnHit onHit, OnFinish onFinish, jvmtiEnv** output) {
    *output = nullptr;
    auto context = std::make_shared<Context>();
    context->vm = vm;
    context->method = method;
    context->onHit = onHit;
    context->onFinish = onFinish;
    context->result = returnType;
    // Each registration owns a tool environment; leave Frida's JVMTI callbacks/capabilities untouched.
    if (vm->GetEnv(reinterpret_cast<void**>(&context->ti), JVMTI_VERSION_1_2) != JNI_OK)
        return JVMTI_ERROR_NOT_AVAILABLE;
    auto ti = context->ti;
    auto fail = [&](int e) {
        ti->DisposeEnvironment();
        return e;
    };
    // Request required capabilities. Report failures instead of silently falling back to another observation mechanism.
    jvmtiCapabilities capabilities{};
    capabilities.can_generate_breakpoint_events = 1;
    capabilities.can_access_local_variables = 1;
    capabilities.can_get_line_numbers = 1;
    capabilities.can_get_source_file_name = 1;
    capabilities.can_force_early_return = 1;
    int e = ti->AddCapabilities(&capabilities);
    if (e) return fail(e);
    // Map the source line to its smallest jlocation in this method; do not search other methods or nearby lines.
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
    // Register C++ onBreakpoint, not JS onHit; it handles the native steps before and after JS execution.
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
    // Events received before publication fail the onBreakpoint lookup and never enter JS.
    // No JVMTI setup remains after publication. A hit may precede open returning; JS state is already ready.
    {
        std::lock_guard<std::mutex> lock(contextsMutex);
        context->enabled = true;
        contexts[ti] = context;
    }
    *output = ti;
    return 0;
}
// First stop step: reject new hits, clear the breakpoint, and disable events without waiting or releasing env.
// enabled and callback entry active++ share a lock, defining which hits must be drained.
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
// index.js polls active asynchronously so it does not block the JS thread needed by pending callbacks.
JNIEXPORT int meu_debug_active(jvmtiEnv* env) { auto context = lookup(env); return context ? context->active.load() : 0; }
JNIEXPORT int meu_debug_reentrant(jvmtiEnv* env) { auto context = lookup(env); return context ? context->reentrant.load() : 0; }
// Final stop step: release the environment only after new hits are disabled and active reaches zero.
// JS releases callback references only after disposal succeeds; the agent .so remains loaded.
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
// native.js calls this after takeString reads a string allocated here with strdup.
JNIEXPORT void meu_debug_free(void* p) { std::free(p); }
// resolve slot tags: >= 0 = local/parameter slot, -1 = this, -2 = instance field.
// field is a valid jfieldID only for slot == -2; negative tags never reach local_read/write.
// Names resolve in the method's declaring class, not the receiver's runtime subclass.
JNIEXPORT int meu_debug_resolve(Hit* hit, const char* name, int* slot, char** type, jfieldID* field) {
    int e = frame(hit);
    if (e) return e;
    auto context = hit->context;
    auto ti = context->ti;
    *field = nullptr;
    std::string signature;
    if (!strcmp(name, "this")) {
        jint modifiers = 0;
        if ((e = ti->GetMethodModifiers(context->method, &modifiers))) return e;
        if (modifiers & 0x8) return JVMTI_ERROR_INVALID_SLOT;
        char* descriptor = nullptr;
        if ((e = ti->GetClassSignature(context->owner, &descriptor, nullptr))) return e;
        signature = descriptor;
        deallocate(ti, descriptor);
        *slot = -1;
    } else {
        jint count = 0;
        jvmtiLocalVariableEntry* locals = nullptr;
        // Missing debug information is an error, not permission to fall back to a field.
        if ((e = ti->GetLocalVariableTable(context->method, &count, &locals))) return e;
        int matches = 0;
        bool unnamed = count == 0;
        for (int i = 0; i < count; ++i) {
            auto& local = locals[i];
            if (hit->location >= local.start_location && hit->location - local.start_location < local.length) {
                if (!local.name || !local.signature) unnamed = true;
                else if (!strcmp(local.name, name)) {
                    ++matches; *slot = local.slot; signature = local.signature;
                }
            }
            deallocate(ti, local.name); deallocate(ti, local.signature); deallocate(ti, local.generic_signature);
        }
        deallocate(ti, locals);
        if (matches > 1) return kAmbiguousBinding;
        if (!matches) {
            if (unnamed) return JVMTI_ERROR_ABSENT_INFORMATION;
            jint modifiers = 0;
            if ((e = ti->GetMethodModifiers(context->method, &modifiers))) return e;
            if (modifiers & 0x8) return kMissingBinding;
            // Walk the declaring class hierarchy, preserving Java field hiding rules.
            jclass owner = static_cast<jclass>(hit->jni->NewLocalRef(context->owner));
            while (owner && !*field && !e) {
                jfieldID* fields = nullptr;
                e = ti->GetClassFields(owner, &count, &fields);
                for (int i = 0; !e && i < count; ++i) {
                    char *fieldName = nullptr, *descriptor = nullptr;
                    e = ti->GetFieldName(owner, fields[i], &fieldName, &descriptor, nullptr);
                    if (!e && !strcmp(fieldName, name)) {
                        e = ti->GetFieldModifiers(owner, fields[i], &modifiers);
                        if (!e && (modifiers & 0x8)) e = JVMTI_ERROR_INVALID_FIELDID;
                        if (!e) { *field = fields[i]; signature = descriptor; }
                    }
                    deallocate(ti, fieldName); deallocate(ti, descriptor);
                    if (*field) break;
                }
                deallocate(ti, fields);
                jclass parent = !e && !*field ? hit->jni->GetSuperclass(owner) : nullptr;
                hit->jni->DeleteLocalRef(owner);
                owner = parent;
            }
            if (e) return e;
            if (!*field) return kMissingBinding;
            *slot = -2;
        }
    }
    *type = strdup(signature.c_str());
    return *type ? 0 : JVMTI_ERROR_OUT_OF_MEMORY;
}

// Read the current receiver without relying on local slots or the local variable table.
JNIEXPORT int meu_debug_this(Hit* hit, jobject* value) {
    int e = frame(hit);
    return e ? e : hit->context->ti->GetLocalInstance(hit->thread, 0, value);
}

// Fields and locals share the jvalue format; boolean/byte/char/short/int use i.
JNIEXPORT int meu_debug_field_read(Hit* hit, jfieldID field, int type, jvalue* value) {
    jobject receiver = nullptr;
    int e = meu_debug_this(hit, &receiver);
    if (e) return e;
    auto jni = hit->jni;
    switch (type) {
        case 'Z': value->i = jni->GetBooleanField(receiver, field); break;
        case 'B': value->i = jni->GetByteField(receiver, field); break;
        case 'C': value->i = jni->GetCharField(receiver, field); break;
        case 'S': value->i = jni->GetShortField(receiver, field); break;
        case 'I': value->i = jni->GetIntField(receiver, field); break;
        case 'J': value->j = jni->GetLongField(receiver, field); break;
        case 'F': value->f = jni->GetFloatField(receiver, field); break;
        case 'D': value->d = jni->GetDoubleField(receiver, field); break;
        case '[': case 'L': value->l = jni->GetObjectField(receiver, field); break;
        default: e = JVMTI_ERROR_ILLEGAL_ARGUMENT;
    }
    jni->DeleteLocalRef(receiver);
    if (jni->ExceptionCheck()) { jni->ExceptionClear(); return JVMTI_ERROR_INTERNAL; }
    return e;
}

// Fields and locals share the jvalue format; boolean/byte/char/short/int use i.
JNIEXPORT int meu_debug_field_write(Hit* hit, jfieldID field, int type, const jvalue* value) {
    jobject receiver = nullptr;
    int e = meu_debug_this(hit, &receiver);
    if (e) return e;
    auto jni = hit->jni;
    switch (type) {
        case 'Z': jni->SetBooleanField(receiver, field, value->i); break;
        case 'B': jni->SetByteField(receiver, field, value->i); break;
        case 'C': jni->SetCharField(receiver, field, value->i); break;
        case 'S': jni->SetShortField(receiver, field, value->i); break;
        case 'I': jni->SetIntField(receiver, field, value->i); break;
        case 'J': jni->SetLongField(receiver, field, value->j); break;
        case 'F': jni->SetFloatField(receiver, field, value->f); break;
        case 'D': jni->SetDoubleField(receiver, field, value->d); break;
        case '[': case 'L': jni->SetObjectField(receiver, field, value->l); break;
        default: e = JVMTI_ERROR_ILLEGAL_ARGUMENT;
    }
    jni->DeleteLocalRef(receiver);
    if (jni->ExceptionCheck()) { jni->ExceptionClear(); return JVMTI_ERROR_INTERNAL; }
    return e;
}

// native.js allocates a jvalue-sized buffer; this function fills it and JS decodes it using the signature.
// GetLocalObject returns a JNI reference, not a snapshot of object memory.
JNIEXPORT int meu_debug_local_read(Hit* hit, int slot, int type, jvalue* value) {
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
// overrides → native.js encodes a jvalue → SetLocal* writes it immediately here.
// Update only the target slot in the current frame, not copies already read into JS.
JNIEXPORT int meu_debug_local_write(Hit* hit, int slot, int type, const jvalue* value) {
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
// earlyReturn only stages the intent/value here; never call ForceEarlyReturn while JS is still running.
// A global ref keeps an object return value alive through native completion after JS disposes temporary wrappers.
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
// When onHit catches a framework exception, JS calls this to cancel the staged return and release its reference.
// Stage errors are handled independently; cancellation does not roll back completed local or instance field writes.
JNIEXPORT void meu_debug_cancel_return(Hit* hit) {
    if (hit->returning && (hit->context->result[0] == 'L' || hit->context->result[0] == '[') && hit->result.l)
        hit->jni->DeleteGlobalRef(hit->result.l);
    hit->returning = false;
    hit->result = {};
}
// Read the Java thread name, which is separate from the native thread ID recorded by JS.
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
// Read runtime frames starting at target frame 0, adding class/method names, source files, and line numbers.
// Return JSON to JS without storing hit records or reconstructing Kotlin coroutine/inline frames.
JNIEXPORT int meu_debug_stack(Hit* hit, int depth, char** output) {
    if (depth < 1) return JVMTI_ERROR_ILLEGAL_ARGUMENT;
    int e = frame(hit);
    if (e) return e;
    auto ti = hit->context->ti;
    jint available = 0;
    if ((e = ti->GetFrameCount(hit->thread, &available))) return e;
    // Limit allocation to the actual frame count even if the requested depth is very large.
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
        if (!e) ti->GetSourceFileName(owner, &source); // Missing source file information is represented as null.
        int line = -1; jlocation nearest = -1; jint n = 0; jvmtiLineNumberEntry* lines = nullptr;
        // A stack location need not start a line entry; choose the nearest entry at or before it.
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
