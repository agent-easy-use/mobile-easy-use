import { randomUUID } from 'node:crypto';
import { loadIOSRuntime } from '../ios/load/runtime-loader.js';
import { prepareIOSRunner } from './ios-runner.js';
import { loadPresetsSource, loadSdkSource } from '../sdk-source.js';
import { DEFAULT_EVIDENCE_DIRECTORY } from '../output-paths.js';
import { callFunction } from './call-function.js';
import { connect } from './connect.js';
import { handleControllerMessage } from './controller.js';
import { disconnect } from './disconnect.js';
import { evalScript } from './eval-script.js';

export class GadgetConnection {
  constructor(deviceManager, {
    createConnectionId = randomUUID,
    createEvidenceId = randomUUID,
    createEvalId = randomUUID,
    evidenceDirectory = DEFAULT_EVIDENCE_DIRECTORY,
    loadPresets = loadPresetsSource,
    loadSdk = loadSdkSource,
    loadIOSAppRuntime = loadIOSRuntime,
    prepareIOSRunner: prepareRunner = prepareIOSRunner,
    startIOSRunner = null,
  } = {}) {
    this.deviceManager = deviceManager;
    this.createConnectionId = createConnectionId;
    this.createEvidenceId = createEvidenceId;
    this.createEvalId = createEvalId;
    this.evidenceDirectory = evidenceDirectory;
    this.loadPresets = loadPresets;
    this.loadSdk = loadSdk;
    this.loadIOSAppRuntime = loadIOSAppRuntime;
    this.prepareIOSRunner = prepareRunner;
    this.startIOSRunner = startIOSRunner;
    this.state = 'disconnected';
    this.currentConnection = null;
  }

  connect(input) {
    return connect(this, input);
  }

  disconnect() {
    return disconnect(this);
  }

  getConnectionId() {
    return this.currentConnection?.connectionId ?? null;
  }

  callFunction(input) {
    return callFunction(this, input);
  }

  evalScript(input) {
    return evalScript(this, input);
  }

  handleControllerMessage(script, message, data) {
    return handleControllerMessage(script, message, data, this);
  }
}
