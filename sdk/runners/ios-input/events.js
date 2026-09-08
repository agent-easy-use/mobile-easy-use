// Runner-only backend: screen points -> native event records. No AX element calls.
const TAP_SECONDS = 0.05;
const DRAG_SECONDS = 0.3;
const TYPING_SPEED = 60;

function required(object, selector) {
  if (!object || typeof object[selector] !== 'function') {
    throw new Error(`UNSUPPORTED_SYNTHESIS: missing ${selector}`);
  }
}

function touchSteps(action, point, gesture, duration) {
  if (action === 'scroll') {
    const start = [gesture.startX, gesture.startY];
    const end = [gesture.endX, gesture.endY];
    return { start, moves: [[start, TAP_SECONDS], [end, TAP_SECONDS + DRAG_SECONDS]],
      up: TAP_SECONDS + DRAG_SECONDS };
  }
  return { start: [point.x, point.y], moves: [],
    up: action === 'longPress' ? duration / 1000 : TAP_SECONDS };
}

function createEventBackend(ObjC, onMain) {
  // Timeout is not cancellation: retain in-flight events/blocks until native completion.
  const pending = new Set();
  let uncertain = false;
  function assertReady(expiresAt) {
    if (uncertain) throw new Error('SYNTHESIS_UNCERTAIN: previous dispatch did not complete; restart the Runner');
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      throw new Error('INPUT_TIMEOUT: input expired before event dispatch');
    }
  }
  function release(entry) {
    if (entry.released) return;
    entry.released = true;
    entry.event.release();
  }
  function prepare(command) {
    const major = Number(String(ObjC.classes.UIDevice.currentDevice().systemVersion()).split('.')[0]);
    if (major !== 18 && major !== 26) {
      throw new Error(`UNSUPPORTED_SYNTHESIS: iOS ${major}; supported versions are 18 and 26`);
    }
    const Path = ObjC.classes.XCPointerEventPath;
    const Record = ObjC.classes.XCSynthesizedEventRecord;
    const Device = ObjC.classes.XCUIDevice;
    required(Path, 'alloc'); required(Record, 'alloc'); required(Device, 'sharedDevice');
    const device = Device.sharedDevice();
    required(device, 'eventSynthesizer');
    const sender = device.eventSynthesizer();
    required(sender, 'synthesizeEvent_completion_');
    const records = [];
    function record(kind, buildPath) {
      let path = Path.alloc();
      let event = null;
      try {
        path = buildPath(path);
        event = Record.alloc();
        required(event, 'initWithName_interfaceOrientation_');
        event = event.initWithName_interfaceOrientation_(`MobileEasyUse ${kind}`, command.orientation);
        required(event, 'addPointerEventPath_');
        event.addPointerEventPath_(path);
        records.push({ event, submitted: false, released: false });
      } catch (error) {
        if (event) event.release();
        throw error;
      } finally {
        if (path) path.release(); // The event retains the added path.
      }
    }
    try {
      const steps = touchSteps(command.action, command.point, command.gesture, command.duration);
      record(command.action, (path) => {
        required(path, 'initForTouchAtPoint_offset_');
        path = path.initForTouchAtPoint_offset_(steps.start, 0);
        required(path, 'liftUpAtOffset_');
        if (steps.moves.length) required(path, 'moveToPoint_atOffset_');
        for (const [point, offset] of steps.moves) path.moveToPoint_atOffset_(point, offset);
        path.liftUpAtOffset_(steps.up);
        return path;
      });
      if (command.action === 'input') {
        // Check text support before the focus tap, so a missing selector has no side effect.
        record('text', (path) => {
          required(path, 'initForTextInput');
          path = path.initForTextInput();
          required(path, 'typeText_atOffset_typingSpeed_shouldRedact_');
          path.typeText_atOffset_typingSpeed_shouldRedact_(command.text, 0, TYPING_SPEED, true);
          return path;
        });
      }
      return { sender: sender.retain(), records };
    } catch (error) {
      for (const entry of records) release(entry);
      throw error;
    }
  }
  function submit(sender, entry, expiresAt, beforeSubmit) {
    return onMain(() => {
      assertReady(expiresAt);
      beforeSubmit();
      assertReady(expiresAt); // Foreground/orientation checks may themselves take time.
      return new Promise((resolve, reject) => {
        let completed = false;
        const finish = (error) => {
          if (error) reject(error); else resolve();
        };
        const timer = setTimeout(() => {
          uncertain = true;
          finish(new Error('SYNTHESIS_UNCERTAIN: dispatch timed out; the event may still execute; restart the Runner'));
        }, Math.max(1, expiresAt - Date.now()));
        const token = { entry, block: null, sender: null };
        try {
          token.block = new ObjC.Block({
            retType: 'void', argTypes: ['bool', 'pointer'],
            implementation(ok, errorPointer) {
              if (completed) return;
              completed = true;
              clearTimeout(timer);
              let error = null;
              try {
                if (!errorPointer.isNull()) error = new Error(`SYNTHESIS_FAILED: ${String(new ObjC.Object(errorPointer))}`);
                else if (!ok) error = new Error('SYNTHESIS_FAILED: native event synthesis returned false');
              } catch (cause) { error = cause; }
              // Cleanup on a later main-queue turn, after the native block returns.
              onMain(() => {
                release(entry);
                if (token.sender) token.sender.release();
                pending.delete(token);
              }).then(
                () => finish(error), (cause) => finish(cause),
              );
            },
          });
          token.sender = sender.retain();
          pending.add(token);
          entry.submitted = true;
          sender.synthesizeEvent_completion_(entry.event, token.block);
        } catch (error) {
          clearTimeout(timer);
          if (entry.submitted && !completed) {
            uncertain = true; // An invocation error does not prove the daemon saw nothing.
            finish(new Error(`SYNTHESIS_UNCERTAIN: ${String(error)}`));
          } else {
            if (!completed && token.sender) token.sender.release();
            pending.delete(token);
            finish(error);
          }
        }
      });
    });
  }
  async function perform(command, { expiresAt, beforeSubmit }) {
    let prepared;
    try {
      prepared = await onMain(() => { assertReady(expiresAt); return prepare(command); });
      // Input waits for focus-tap completion before text dispatch. Never block the main queue.
      for (const entry of prepared.records) await submit(prepared.sender, entry, expiresAt, beforeSubmit);
    } finally {
      if (prepared) await onMain(() => {
        for (const entry of prepared.records) if (!entry.submitted) release(entry);
        prepared.sender.release();
      });
    }
  }
  return { perform, assertReady };
}

export { createEventBackend, touchSteps };
