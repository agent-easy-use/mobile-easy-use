import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Evidence contract failed: ${message}`);
}

function requireEmpty(value, name) {
  const size = Array.isArray(value) ? value.length : Object.keys(value ?? {}).length;
  requireEvidence(size === 0, `${name} must be empty`);
}

function requireScreenshotPath(path, name) {
  requireEvidence(typeof path === 'string' && path.endsWith('.jpg'), `${name} screenshot path`);
}

function verifyUi(document) {
  requireEvidence(document.actionDescription === 'ApiDemo hidden fixture becomes visible', 'actionDescription');
  requireEmpty(document.chain, 'chain');
  requireEmpty(document.state, 'state');
  const fixture = document.ui?.hiddenFixture;
  requireEvidence(fixture?.className === 'android.widget.TextView', 'hiddenFixture className');
  requireEvidence(fixture?.before?.exist === true && fixture.before.visible === false, 'hiddenFixture before state');
  requireEvidence(fixture?.after?.exist === true && fixture.after.visible === true, 'hiddenFixture after state');
  requireEvidence(fixture?.changed === true, 'hiddenFixture.changed');
  requireEvidence(!Object.hasOwn(document, 'screenshots'), 'top-level screenshots must be absent');
  requireScreenshotPath(fixture.before?.screenshots?.window, 'before window');
  requireEvidence(fixture.before?.screenshots?.element === null, 'hidden before element crop must be null');
  requireScreenshotPath(fixture.after?.screenshots?.window, 'after window');
  requireScreenshotPath(fixture.after?.screenshots?.element, 'after hiddenFixture element');
  return { contract: 'ui-visibility-v4', screenshots: 3 };
}

function verifyEvidence(contract, document) {
  if (contract === 'ui-visibility-v4') return verifyUi(document);
  throw new Error(`Unknown Evidence contract: ${contract}`);
}

async function main() {
  const [contract, filePath] = process.argv.slice(2);
  if (!contract || !filePath) {
    throw new Error('Usage: node verify-evidence.mjs <contract> <evidence.json>');
  }
  const document = JSON.parse(await readFile(filePath, 'utf8'));
  console.log(JSON.stringify({ passed: true, ...verifyEvidence(contract, document), evidencePath: filePath }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { verifyEvidence };
