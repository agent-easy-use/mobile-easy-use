import * as frida from 'frida';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const serial=process.argv[2];if(!serial)throw Error('Usage: node run.mjs <serial>');
const output='artifacts/benchmarks/jvmti-debugger-20260921';
const pkg='com.agenteasyuse.mobileeasyuse.apidemo';
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8'}).trim();
const source=await readFile('fixtures/android/ApiDemo/app/src/main/java/com/agenteasyuse/mobileeasyuse/apidemo/state/JvmtiDebuggerFixture.java','utf8');
const kotlinSource=await readFile('fixtures/android/ApiDemo/app/src/main/java/com/agenteasyuse/mobileeasyuse/apidemo/state/JvmtiTopLevel.kt','utf8');
const kotlinLine=kotlinSource.split('\n').findIndex(s=>s.includes('BP_KOTLIN'))+1;
const line=marker=>source.split('\n').findIndex(s=>s.includes(marker))+1;
const pid=Number(adb('shell','pidof',pkg));if(!pid)throw Error('ApiDemo not running');
const port=adb('forward','tcp:0','tcp:18484');let session,script;
const evidence={device:serial,pid,at:new Date().toISOString(),tests:[]};
try {
 const device=await frida.getDeviceManager().addRemoteDevice(`127.0.0.1:${port}`);
 assert((await device.enumerateProcesses()).some(p=>p.pid===pid),'Gadget PID differs from ApiDemo');
 session=await device.attach(pid);script=await session.createScript(await readFile(output+'/agent.js','utf8'));
 const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('agent ready timeout')),20000);
  script.message.connect(m=>{console.log('FRIDA',JSON.stringify(m));if(m.type==='error'||m.payload?.event==='fatal'){clearTimeout(timer);reject(Error(m.description||m.payload.message));}if(m.payload?.event==='ready'){clearTimeout(timer);evidence.ready=m.payload;resolve();}});
 });
 await script.load();await ready;assert.equal(evidence.ready.capabilities,31);
 assert(evidence.ready.fridaEnv && evidence.ready.fridaEnv!==evidence.ready.env,'independent JVMTI env');
 const trigger=(mode,count)=>adb('shell','am','start','-W','-n',pkg+'/.ui.JvmtiDebuggerActivity','--es','mode',mode,'--ei','count',String(count));
 async function done(){const deadline=Date.now()+12000;while(Date.now()<deadline){const r=await script.exports.poll();if(r.result&&r.active===0)return r;await new Promise(r=>setTimeout(r,100));}throw Error('fixture timeout');}
 const base=i=>(2*i+10+(10000000003|0)+2+8)|0;
 for(const mode of ['read','write','force','object','void','condition','condition-error','script-error','write-throw','duplicate-return','instance','kotlin','gc','missing-local','bad-slot','wide-write']) {
  const count=mode==='gc'?30:mode==='read'?20:mode==='condition'?6:3;
  const config=await script.exports.configure(mode,mode==='kotlin'?kotlinLine:line(mode==='instance'?'BP_INSTANCE':mode==='object'?'BP_OBJECT':mode==='void'?'BP_VOID':'BP_COMPUTE'));
  trigger(mode,count);const r=await done();const actual=JSON.parse(r.result);
  evidence.tests.push({mode,count,config,...r,actual});console.log('CASE',mode,JSON.stringify({actual,hits:r.hits-config.before,records:r.records.length,returnError:r.returnError}));
  assert.equal(r.returnError,0);assert.equal(r.reentrant,0);assert.equal(r.hits-config.before,count);
  assert.equal(r.records.length,mode==='condition'?3:count);
  const forced=['force','object','void','duplicate-return'].includes(mode);
  assert.equal(actual.tail,forced?0:count);assert.equal(actual.finally,['object','void'].includes(mode)||forced?0:count);
  for(let i=0;i<count;i++)assert.equal(actual.values[i],mode==='object'?'forced-object':mode==='void'?'void':mode==='force'||mode==='duplicate-return'?777:mode==='write'||mode==='write-throw'?90+20+(10000000003|0)+2+11:mode==='wide-write'?2*(i+1)+28:base(i+1));
  for(const hit of r.records){assert.equal(hit.stack.frames.length,3);assert.equal(hit.stack.frames[0].methodName,mode==='object'?'objectResult':mode==='void'?'voidResult':mode==='instance'?'computeInstance':mode==='kotlin'?'topLevelCompute':'compute');if(!['object','void'].includes(mode)){assert.equal(hit.wide,'10000000003');assert.equal(hit.fraction,2.5);assert.equal(hit.javaCall,'jvmti-frida');assert.equal(hit.field,'jvmti-frida');}}
  if(mode==='wide-write')assert(r.records.every(x=>x.wideAfter==='9007199254740993'&&x.doubleAfter===9.75));
  if(mode==='bad-slot')assert(r.records.every(x=>x.invalidSlot===35));
  if(['condition-error','script-error','write-throw','missing-local'].includes(mode))assert(r.records.every(x=>x.status==='error'));
  else assert(r.records.every(x=>x.status==='ok'));
  if(mode==='duplicate-return')assert(r.records.every(x=>x.secondReturnError===-102));
  const stopped=await script.exports.stop();assert.equal(stopped.active,0);
  const stoppedAgain=await script.exports.stop();assert.equal(stoppedAgain.hits,stopped.hits);
  await script.exports.reset();trigger('read',2);const after=await done();assert.equal(after.hits,stopped.hits);assert.deepEqual(JSON.parse(after.result).values,[base(1),base(2)]);
 }
 await assert.rejects(script.exports.configure('read',999999),/install: -100/);
 evidence.tests.push({mode:'missing-line',passed:true});
 // Runtime indices use ART parameter-register layout, not parameter names.
 assert.deepEqual(evidence.tests[0].records[0].argumentSlots,[3,4,5,7]);
 await script.exports.hook(true);
 await assert.rejects(script.exports.configure('read',line('BP_COMPUTE')),/METHOD_ALREADY_HOOKED/);
 await script.exports.hook(false);
 evidence.tests.push({mode:'hook-conflict',passed:true});
 const concurrentConfig=await script.exports.configure('concurrent',line('BP_COMPUTE'));
 trigger('concurrent',25);const concurrent=await done();
 assert.equal(concurrent.hits-concurrentConfig.before,100);assert.equal(concurrent.records.length,100);
 assert.equal(new Set(concurrent.records.map(r=>r.thread)).size,4);
 assert.equal(new Set(concurrent.records.map(r=>r.hitId)).size,100);
 assert.deepEqual(concurrent.records.map(r=>r.input).sort((a,b)=>a-b),Array.from({length:100},(_,i)=>i+1));
 assert.deepEqual(JSON.parse(concurrent.result).values.sort((a,b)=>a-b),Array.from({length:100},(_,i)=>base(i+1)));
 assert(concurrent.records.every(r=>r.status==='ok'));
 evidence.tests.push({mode:'concurrent',...concurrent});console.log('CONCURRENT_PASSED');
 await script.exports.configure('reentrant',line('BP_COMPUTE'));trigger('read',3);const reentry=await done();
 assert.equal(reentry.reentrant,3);assert.equal(reentry.records.length,3);
 assert(reentry.records.every(r=>r.nestedResult===base(5)));
 evidence.tests.push({mode:'reentrant',...reentry});console.log('REENTRY_PASSED');
 await script.exports.configure('inflight',line('BP_COMPUTE'));trigger('read',2);
 const gateDeadline=Date.now()+5000;
 while(!await script.exports.gate()){if(Date.now()>gateDeadline)throw Error('gate timeout');await new Promise(r=>setTimeout(r,10));}
 const stopping=await script.exports.stop();assert.equal(stopping.active,1);
 await script.exports.release();const drained=await done();
 assert.equal(drained.active,0);assert.equal(drained.hits,stopping.hits);assert.equal(drained.records.length,1);
 assert.deepEqual(JSON.parse(drained.result).values,[base(1),base(2)]);
 evidence.tests.push({mode:'inflight-stop',stopping,...drained});console.log('INFLIGHT_STOP_PASSED');
 evidence.passed=true;console.log('PROOF_PASSED');
} finally {
 try {
  if(script){await script.exports.release();await script.exports.stop();await script.exports.dispose();await script.exports.reset();await script.unload();}
  if(session)await session.detach();
  assert.equal(Number(adb('shell','pidof',pkg)),pid);
  evidence.cleanup={disposed:true,unloaded:true,detached:true,processAlive:true};
 } catch(e) {evidence.cleanup={error:String(e)};evidence.passed=false;throw e;}
 finally {adb('forward','--remove',`tcp:${port}`);await writeFile(output+'/result.json',JSON.stringify(evidence,null,2)+'\n');}
}
