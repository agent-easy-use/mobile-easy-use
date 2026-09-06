package com.agenteasyuse.mobileeasyuse.apidemo.input;

import androidx.annotation.Keep;

@Keep
public final class RecordedInputEvent {
    public final int sequence;
    public final int action;
    public final float x;
    public final float y;
    public final float rawX;
    public final float rawY;
    public final long downTime;
    public final long eventTime;
    public final int displayId;
    public final String targetKey;

    public RecordedInputEvent(
            int sequence,
            int action,
            float x,
            float y,
            float rawX,
            float rawY,
            long downTime,
            long eventTime,
            int displayId,
            String targetKey) {
        this.sequence = sequence;
        this.action = action;
        this.x = x;
        this.y = y;
        this.rawX = rawX;
        this.rawY = rawY;
        this.downTime = downTime;
        this.eventTime = eventTime;
        this.displayId = displayId;
        this.targetKey = targetKey;
    }
}
