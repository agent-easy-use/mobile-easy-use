import { withChainEvidence } from './evidence/chain.js';
import { withStateEvidence } from './evidence/state.js';
import { withUiEvidence } from './evidence/ui.js';

const ProbeEvidence = {
  withChainEvidence,
  withStateEvidence,
  withUiEvidence,
};

export const Probe = {
  evidence: ProbeEvidence,
};
