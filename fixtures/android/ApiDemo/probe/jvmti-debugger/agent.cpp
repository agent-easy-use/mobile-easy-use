#include <jni.h>
#include <jvmti.h>
#include <atomic>
#include <string>
#include <sstream>
#include <vector>
#include <mutex>
#include <unistd.h>

static jvmtiEnv* ti = nullptr;
static JavaVM* vm = nullptr;
using Script = void (*)(jthread, jmethodID, jlong);
static Script script = nullptr;
static std::atomic<int> active{0}, hits{0};
static std::atomic<bool> gateEntered{false}, gateReleased{false};
static std::atomic<bool> enabled{false};
static std::mutex mutex;
static std::vector<std::pair<jmethodID,jlocation>> locations;
static thread_local jthread thread = nullptr;
static thread_local JNIEnv* jni = nullptr;
static thread_local jmethodID original = nullptr;
static thread_local int returnKind = 0;
static thread_local jint returnInt = 0;
static thread_local jobject returnObject = nullptr;
static std::atomic<int> lastReturnError{0}, reentrant{0};

static void JNICALL breakpoint(jvmtiEnv*, JNIEnv* env, jthread t, jmethodID m, jlocation loc) {
    { std::lock_guard<std::mutex> lock(mutex); if (!enabled) return; active++; }
    if (thread != nullptr) { reentrant++; active--; return; }
    thread=t; jni=env; original=m; returnKind=0; returnObject=nullptr;
    hits++;
    env->PushLocalFrame(64);
    script(t, m, loc);
    // The script/Java helper has completely returned. Early return is last frame operation.
    jvmtiError e=JVMTI_ERROR_NONE;
    if (returnKind==1) e=ti->ForceEarlyReturnInt(t,returnInt);
    else if (returnKind==2) e=ti->ForceEarlyReturnObject(t,returnObject);
    else if (returnKind==3) e=ti->ForceEarlyReturnVoid(t);
    lastReturnError=e;
    if(returnObject) env->DeleteGlobalRef(returnObject);
    env->PopLocalFrame(nullptr);
    thread=nullptr; jni=nullptr; original=nullptr; returnKind=0;
    active--;
}
extern "C" JNIEXPORT jint JNICALL Agent_OnAttach(JavaVM* v, char*, void*) {
    if (ti != nullptr || active != 0) return -104;
    // The .so remains mapped after DisposeEnvironment; each attach is a fresh proof session.
    hits=0; reentrant=0; lastReturnError=0; gateEntered=false; gateReleased=false;
    script=nullptr; enabled=false; locations.clear();
    vm=v;
    if(v->GetEnv(reinterpret_cast<void**>(&ti), JVMTI_VERSION_1_2)!=JNI_OK) return -1;
    jvmtiCapabilities c{};
    c.can_generate_breakpoint_events=1; c.can_access_local_variables=1;
    c.can_get_line_numbers=1; c.can_get_source_file_name=1; c.can_force_early_return=1;
    int e=ti->AddCapabilities(&c); if(e) return e;
    jvmtiEventCallbacks cb{}; cb.Breakpoint=breakpoint;
    return ti->SetEventCallbacks(&cb,sizeof(cb));
}
extern "C" {
void* proof_env() { return ti; }
int proof_capabilities() {
    jvmtiCapabilities c{}; int e=ti->GetCapabilities(&c); if(e) return -e;
    return c.can_generate_breakpoint_events | c.can_access_local_variables<<1 |
        c.can_get_line_numbers<<2 | c.can_get_source_file_name<<3 | c.can_force_early_return<<4;
}
int proof_install(jmethodID m, int line, Script s) {
    jint n=0; jvmtiLineNumberEntry* entries=nullptr;
    int e=ti->GetLineNumberTable(m,&n,&entries); if(e) return e;
    jlocation chosen=-1;
    for(int i=0;i<n;i++) if(entries[i].line_number==line && (chosen<0 || entries[i].start_location<chosen)) chosen=entries[i].start_location;
    ti->Deallocate(reinterpret_cast<unsigned char*>(entries));
    if(chosen<0) return -100;
    e=ti->SetBreakpoint(m,chosen); if(e) return e;
    locations.emplace_back(m,chosen); script=s; enabled=true;
    return ti->SetEventNotificationMode(JVMTI_ENABLE,JVMTI_EVENT_BREAKPOINT,nullptr);
}
int proof_stop() {
    { std::lock_guard<std::mutex> lock(mutex); enabled=false; }
    int error=0;
    for(auto& loc:locations) {int e=ti->ClearBreakpoint(loc.first,loc.second); if(e)error=e;}
    locations.clear();
    int e=ti->SetEventNotificationMode(JVMTI_DISABLE,JVMTI_EVENT_BREAKPOINT,nullptr);
    return error ? error : e;
}
int proof_active() {return active;}
int proof_dispose() {if(active)return -103;int e=ti->DisposeEnvironment();if(!e){ti=nullptr;script=nullptr;}return e;}
void proof_gate() {gateEntered=true;while(!gateReleased)usleep(1000);}
int proof_gate_entered() {return gateEntered;}
void proof_gate_release() {gateReleased=true;}
int proof_argument_slot(jmethodID method,int index) {
    jint max=0,args=0,modifiers=0;char* signature=nullptr;
    int e=ti->GetMaxLocals(method,&max);if(e)return -e;
    e=ti->GetArgumentsSize(method,&args);if(e)return -e;
    e=ti->GetMethodModifiers(method,&modifiers);if(e)return -e;
    e=ti->GetMethodName(method,nullptr,&signature,nullptr);if(e)return -e;
    int slot=max-args+((modifiers&0x8)?0:1),position=0,result=-104;
    for(char* p=signature+1;*p && *p!=')';position++) {
        if(position==index){result=slot;break;}
        bool array=false;while(*p=='['){array=true;p++;}
        char type=*p++;
        if(type=='L'){while(*p && *p!=';')p++;if(*p)p++;}
        slot+=(!array && (type=='J'||type=='D'))?2:1;
    }
    ti->Deallocate((unsigned char*)signature);return result;
}
int proof_hits() {return hits;}
int proof_reentrant() {return reentrant;}
int proof_return_error() {return lastReturnError;}
int proof_frame() {
    jmethodID m=nullptr; jlocation l=0;
    int e=ti->GetFrameLocation(thread,0,&m,&l);
    return e ? e : (m==original?0:-101);
}
int proof_get_int(int slot, jint* out) {return ti->GetLocalInt(thread,0,slot,out);}
int proof_get_long(int slot, jlong* out) {return ti->GetLocalLong(thread,0,slot,out);}
int proof_get_double(int slot, jdouble* out) {return ti->GetLocalDouble(thread,0,slot,out);}
int proof_get_object(int slot,jobject* out) {return ti->GetLocalObject(thread,0,slot,out);}
int proof_set_int(int slot,jint val) {int e=proof_frame(); return e?e:ti->SetLocalInt(thread,0,slot,val);}
int proof_set_long(int slot,jlong val) {int e=proof_frame();return e?e:ti->SetLocalLong(thread,0,slot,val);}
int proof_set_double(int slot,jdouble val) {int e=proof_frame();return e?e:ti->SetLocalDouble(thread,0,slot,val);}
int proof_set_object(int slot,jobject val) {int e=proof_frame();return e?e:ti->SetLocalObject(thread,0,slot,val);}
int proof_return(int kind,jint val,jobject obj) {
    if(returnKind) return -102;
    returnKind=kind; returnInt=val;
    if(obj) returnObject=jni->NewGlobalRef(obj);
    return 0;
}
void proof_cancel_return() {
    if(returnObject)jni->DeleteGlobalRef(returnObject);
    returnObject=nullptr; returnKind=0;
}
const char* proof_metadata(jmethodID method) {
    static thread_local std::string text;
    jint n=0; jvmtiLocalVariableEntry* vars=nullptr;
    int e=ti->GetLocalVariableTable(method,&n,&vars);
    std::ostringstream out; out << "{\"error\":" << e << ",\"locals\":[";
    for(int i=0;e==0 && i<n;i++) {
        auto& x=vars[i]; if(i)out<<",";
        out << "{\"name\":\""<<x.name<<"\",\"signature\":\""<<x.signature<<"\",\"slot\":"<<x.slot<<",\"start\":"<<x.start_location<<",\"length\":"<<x.length<<"}";
        ti->Deallocate((unsigned char*)x.name);ti->Deallocate((unsigned char*)x.signature);
        if(x.generic_signature)ti->Deallocate((unsigned char*)x.generic_signature);
    }
    if(vars)ti->Deallocate((unsigned char*)vars);
    out<<"]}";text=out.str();return text.c_str();
}
const char* proof_stack(int depth) {
    static thread_local std::string text;
    std::vector<jvmtiFrameInfo> frames(depth);jint count=0;
    int e=ti->GetStackTrace(thread,0,depth,frames.data(),&count);
    std::ostringstream out;out<<"{\"error\":"<<e<<",\"frames\":[";
    for(int i=0;e==0 && i<count;i++) {
        jclass c=nullptr;char *name=nullptr,*sig=nullptr,*source=nullptr;
        ti->GetMethodName(frames[i].method,&name,nullptr,nullptr);
        ti->GetMethodDeclaringClass(frames[i].method,&c);
        ti->GetClassSignature(c,&sig,nullptr);ti->GetSourceFileName(c,&source);
        jint n=0; jvmtiLineNumberEntry* lines=nullptr;int line=-1;
        if(!ti->GetLineNumberTable(frames[i].method,&n,&lines)) {
            for(int j=0;j<n;j++) if(lines[j].start_location<=frames[i].location)line=lines[j].line_number;
            ti->Deallocate((unsigned char*)lines);
        }
        if(i)out<<",";
        out<<"{\"className\":\""<<(sig?sig:"")<<"\",\"methodName\":\""<<(name?name:"")<<"\",\"sourceFile\":\""<<(source?source:"")<<"\",\"line\":"<<line<<"}";
        if(name)ti->Deallocate((unsigned char*)name);if(sig)ti->Deallocate((unsigned char*)sig);if(source)ti->Deallocate((unsigned char*)source);if(c)jni->DeleteLocalRef(c);
    }
    out<<"]}";text=out.str();return text.c_str();
}
}
