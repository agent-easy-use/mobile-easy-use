package com.agenteasyuse.mobileeasyuse.apidemo.input;

import android.view.MotionEvent;

import androidx.annotation.Keep;

import com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState;

@Keep
public final class InputEventRecorder {
    private InputEventRecorder() {}

    public static void record(MotionEvent event, String targetKey) {
        ApiDemoState.getInstance().recordInputEvent(new RecordedInputEvent(
                ApiDemoState.getInstance().nextInputSequence(),
                event.getActionMasked(),
                event.getX(),
                event.getY(),
                event.getRawX(),
                event.getRawY(),
                event.getDownTime(),
                event.getEventTime(),
                0,
                targetKey));
    }
}
