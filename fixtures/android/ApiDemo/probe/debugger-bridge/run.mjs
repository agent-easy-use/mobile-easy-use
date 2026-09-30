import * as frida from 'frida';
import { readFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';

const serial = process.argv[2];
if (!serial) throw new Error('Usage: node run.mjs <adb-serial>');
const output = 'artifacts/benchmarks/jdi-frida-bridge-20260920';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const pid = Number(adb('shell', 'pidof', 'com.agenteasyuse.mobileeasyuse.apidemo'));
if (!Number.isInteger(pid) || pid <= 0) throw new Error('ApiDemo must already be running');
const fridaPort = adb('forward', 'tcp:0', `tcp:${process.argv[3] || 18484}`);
const jdwpPort = adb('forward', 'tcp:0', `jdwp:${pid}`);
let session, script, child;
try {
  const device = await frida.getDeviceManager().addRemoteDevice(`127.0.0.1:${fridaPort}`);
  const processes = await device.enumerateProcesses();
  console.log('TARGET', JSON.stringify({pid, processes: processes.map(p => ({pid:p.pid, name:p.name}))}));
  if (!processes.some(p => p.pid === pid)) throw new Error('Configured port is not the ApiDemo Gadget');
  session = await device.attach(pid);
  script = await session.createScript(await readFile(`${output}/agent.js`, 'utf8'));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Frida hook installation timed out')), 20000);
    script.message.connect(message => {
      console.log('FRIDA', JSON.stringify(message));
      if (message.type === 'error') { clearTimeout(timer); reject(new Error(message.description)); }
      if (message.payload?.event === 'ready') { clearTimeout(timer); resolve(); }
    });
  });
  await script.load();
  await ready;
  child = spawn('/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home/bin/java',
    ['--add-modules', 'jdk.jdi', '-cp', output, 'BridgeProof', jdwpPort]);
  let stdout = '', started = false;
  child.stdout.on('data', chunk => {
    const text = chunk.toString(); stdout += text; process.stdout.write(text);
    if (!started && stdout.includes('BREAKPOINT_READY')) {
      started = true;
      console.log(adb('shell', 'am', 'start', '-W', '-n',
        'com.agenteasyuse.mobileeasyuse.apidemo/.ui.DebuggerBridgeActivity'));
    }
  });
  child.stderr.pipe(process.stderr);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Proof timeout')); }, 45000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 && stdout.includes('PROOF_PASSED') ? resolve() : reject(new Error(`JDI exit ${code}`)); });
  });
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  if (script) await script.unload();
  if (session) await session.detach();
  adb('forward', '--remove', `tcp:${jdwpPort}`);
  adb('forward', '--remove', `tcp:${fridaPort}`);
}
