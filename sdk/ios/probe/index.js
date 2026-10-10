import { withChainEvidence } from './evidence/chain.js';
import { withStateEvidence } from './evidence/state.js';
import { withUiEvidence } from './evidence/ui.js';
import { installDebugger, attachDebugger, detachDebugger } from './debugger.js';

const Probe = Object.freeze({
  debugger: Object.freeze(Object.assign(installDebugger, {
    attach: attachDebugger,
    detach: detachDebugger,
  })),
  evidence: Object.freeze({
    withChainEvidence,
    withStateEvidence,
    withUiEvidence,
  }),
});

export { Probe };
