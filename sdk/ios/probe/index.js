import { withChainEvidence } from './evidence/chain.js';
import { withStateEvidence } from './evidence/state.js';
import { withUiEvidence } from './evidence/ui.js';

const Probe = Object.freeze({
  evidence: Object.freeze({
    withChainEvidence,
    withStateEvidence,
    withUiEvidence,
  }),
});

export { Probe };
