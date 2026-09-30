import Java from 'frida-java-bridge';
const prefix = 'com.agenteasyuse.mobileeasyuse.apidemo.state.JvmtiDebuggerFixture';
let F, Box, api, callback, method, metadata, mode, records = [], errors = [], sequence = 0;
const check = (e, op) => { if(e !== 0) throw new Error(op + ': ' + e); };
const native = (m, name, ret, args=[]) => new NativeFunction(m.getExportByName('proof_'+name), ret, args);
function slot(name, location) {
  const matches = metadata.locals.filter(v => v.name===name && location>=v.start && location<v.start+v.length);
  if(matches.length!==1) throw new Error('Local unavailable/ambiguous: '+name);
  return matches[0].slot;
}
function readInt(s) {const p=Memory.alloc(4);check(api.get_int(s,p),'GetLocalInt');return p.readS32();}
function readObject(s) {const p=Memory.alloc(Process.pointerSize);check(api.get_object(s,p),'GetLocalObject');return Java.cast(p.readPointer(),Box);}
function hit(t,m,l) {
  const location=Number(l.toString());
  let r={hitId:++sequence,location,thread:Process.getCurrentThreadId(),mode};
  try {
    check(api.frame(),'frame-before');
    r.stack=JSON.parse(api.stack(3).readUtf8String());
    if(mode==='object') {
      const value=Java.use('java.lang.String').$new('forced-object');
      check(api.return(2,0,value.$h),'forceReturn-object');
    } else if(mode==='void') check(api.return(3,0,ptr(0)),'forceReturn-void');
    else {
      const inputSlot=api.argument_slot(m,0), localSlot=slot('local',location), boxSlot=api.argument_slot(m,1);
      r.argumentSlots=[0,1,2,3].map(i=>api.argument_slot(m,i));
      const p=Memory.alloc(8);
      check(api.get_long(api.argument_slot(m,2),p),'GetLocalLong');r.wide=p.readS64().toString();
      check(api.get_double(api.argument_slot(m,3),p),'GetLocalDouble');r.fraction=p.readDouble();
      r.input=readInt(inputSlot);r.local=readInt(localSlot);
      // Method calls deliberately happen before SetLocal and the second frame check.
      const box=readObject(boxSlot);
      if(mode==='gc') Java.use('java.lang.System').gc();r.field=box.config.value.version.value.toString();r.javaCall=box.read().toString();
      r.javaThread=Java.use('java.lang.Thread').currentThread().getName().toString();
      check(api.frame(),'frame-after-java-call');
      if(mode==='wide-write') {
        check(api.set_long(api.argument_slot(m,2),new Int64('9007199254740993')),'SetLocalLong');
        check(api.set_double(api.argument_slot(m,3),9.75),'SetLocalDouble');
        check(api.get_long(api.argument_slot(m,2),p),'GetLocalLong-after');r.wideAfter=p.readS64().toString();
        check(api.get_double(api.argument_slot(m,3),p),'GetLocalDouble-after');r.doubleAfter=p.readDouble();
      }
      if(mode==='missing-local') slot('noSuchLocal',location);
      if(mode==='bad-slot') r.invalidSlot=api.get_int(999,Memory.alloc(4));
      if(mode==='inflight') api.gate();
      if(mode==='reentrant') r.nestedResult=F.compute(5,box,10000000003,2.5);
      if(mode==='condition' && r.input%2===0) return;
      if(mode==='condition-error') throw new Error('intentional condition error');
      if(mode==='write' || mode==='write-throw') {
        check(api.set_int(localSlot,90),'SetLocalInt-local');check(api.set_int(inputSlot,20),'SetLocalInt-argument');
        const replacement=Box.$new();replacement.label.value='replacement';
        check(api.set_object(boxSlot,replacement.$h),'SetLocalObject-argument');
        r.after={input:readInt(inputSlot),local:readInt(localSlot),label:readObject(boxSlot).label.value.toString()};
      }
      if(mode==='force' || mode==='write-throw' || mode==='duplicate-return') {
        check(api.return(1,777,ptr(0)),'forceReturn-int');
        if(mode==='duplicate-return') r.secondReturnError=api.return(1,888,ptr(0));
      }
      if(mode==='write-throw' || mode==='script-error') throw new Error('intentional script error');
    }
    r.status='ok';
  } catch(e) {api.cancel_return();r.status='error';r.message=String(e);errors.push(r.message);}
  records.push(r);
}
Java.perform(() => {
 try {
  F=Java.use(prefix);Box=Java.use(prefix+'$Box');Box.$new();
  Java.use('android.os.Debug').attachJvmtiAgent('/data/data/com.agenteasyuse.mobileeasyuse.apidemo/files/libdebugger_proof.so',null,F.class.getClassLoader());
  const lib=Process.getModuleByName('libdebugger_proof.so');api={};
  for(const name of ['capabilities','active','hits','reentrant','return_error','frame','stop','dispose','gate_entered']) api[name]=native(lib,name,'int');
  api.gate=native(lib,'gate','void');api.gate_release=native(lib,'gate_release','void');
  api.argument_slot=native(lib,'argument_slot','int',['pointer','int']);
  api.env=native(lib,'env','pointer');
  api.install=native(lib,'install','int',['pointer','int','pointer']);
  api.metadata=native(lib,'metadata','pointer',['pointer']);api.stack=native(lib,'stack','pointer',['int']);
  for(const name of ['get_int','get_long','get_double','get_object'])api[name]=native(lib,name,'int',['int','pointer']);
  api.set_long=native(lib,'set_long','int',['int','int64']);api.set_double=native(lib,'set_double','int',['int','double']);
  api.set_int=native(lib,'set_int','int',['int','int']);api.set_object=native(lib,'set_object','int',['int','pointer']);
  api.return=native(lib,'return','int',['int','int','pointer']);api.cancel_return=native(lib,'cancel_return','void');
  callback=new NativeCallback(hit,'void',['pointer','pointer','int64']);
  send({event:'ready',env:api.env().toString(),capabilities:api.capabilities(),fridaEnv:Java.api.jvmti?.handle?.toString()});
 }catch(e){send({event:'fatal',message:String(e),stack:e.stack});}
});
rpc.exports={
 configure(nextMode,line){
  return Java.performNow(()=>{
   check(api.stop(),'stop-before-config');mode=nextMode;records=[];errors=[];sequence=0;F.result.value='';
   method=mode==='instance'?F.computeInstance.overload('int',prefix+'$Box','long','double'):mode==='kotlin'?Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.JvmtiTopLevelKt').topLevelCompute.overload('int',prefix+'$Box','long','double'):mode==='object'?F.objectResult.overload(prefix+'$Box'):mode==='void'?F.voidResult.overload():F.compute.overload('int',prefix+'$Box','long','double');
   if(method.implementation!==null) throw new Error('METHOD_ALREADY_HOOKED');
   metadata=JSON.parse(api.metadata(method.handle).readUtf8String());
   const before=api.hits();check(api.install(method.handle,line,callback),'install');
   return {handle:method.handle.toString(),metadata,before};
  });
 },
 poll(){return Java.performNow(()=>({result:F.result.value,records,errors,hits:api.hits(),active:api.active(),returnError:api.return_error(),reentrant:api.reentrant()}));},
 stop(){check(api.stop(),'stop');return {active:api.active(),hits:api.hits(),records};},
 dispose(){check(api.dispose(),'dispose');},
 gate(){return api.gate_entered();},
 release(){api.gate_release();},
 hook(enable){Java.performNow(()=>{const m=F.compute.overload('int',prefix+'$Box','long','double');m.implementation=enable?function(...args){return m.call(this,...args);}:null;});},
 reset(){Java.performNow(()=>{F.result.value='';});}
};
