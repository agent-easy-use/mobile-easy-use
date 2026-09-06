package com.agenteasyuse.mobileeasyuse.apidemo.state;

import androidx.annotation.Keep;

import com.agenteasyuse.mobileeasyuse.apidemo.input.RecordedInputEvent;

import java.util.ArrayList;
import java.util.List;

@Keep
public final class ApiDemoState {
    private static final ApiDemoState INSTANCE = new ApiDemoState();

    private final ArrayList<RecordedInputEvent> inputEvents = new ArrayList<>();
    private int generation;
    private int inputSequence;
    private String activity = "";
    private String scenario = "";
    private int clickCount;
    private int longPressCount;
    private String inputText = "";
    private int scrollX;
    private int scrollY;
    private boolean dialogOpen;
    private boolean popupOpen;

    private ApiDemoState() {}

    public static ApiDemoState getInstance() {
        return INSTANCE;
    }

    public synchronized int reset(String activityName, String scenarioName) {
        generation += 1;
        inputSequence = 0;
        activity = activityName;
        scenario = scenarioName == null ? "" : scenarioName;
        clickCount = 0;
        longPressCount = 0;
        inputText = "";
        scrollX = 0;
        scrollY = 0;
        dialogOpen = false;
        popupOpen = false;
        inputEvents.clear();
        return generation;
    }

    public synchronized int getGeneration() { return generation; }
    public synchronized String getActivity() { return activity; }
    public synchronized String getScenario() { return scenario; }
    public synchronized int getClickCount() { return clickCount; }
    public synchronized int getLongPressCount() { return longPressCount; }
    public synchronized String getInputText() { return inputText; }
    public synchronized int getScrollX() { return scrollX; }
    public synchronized int getScrollY() { return scrollY; }
    public synchronized boolean isDialogOpen() { return dialogOpen; }
    public synchronized boolean isPopupOpen() { return popupOpen; }

    public synchronized int nextInputSequence() { return ++inputSequence; }
    public synchronized void incrementClick() { clickCount += 1; }
    public synchronized void incrementLongPress() { longPressCount += 1; }
    public synchronized void setInputText(String value) { inputText = value; }
    public synchronized void setScroll(int x, int y) { scrollX = x; scrollY = y; }
    public synchronized void setDialogOpen(boolean value) { dialogOpen = value; }
    public synchronized void setPopupOpen(boolean value) { popupOpen = value; }
    public synchronized void recordInputEvent(RecordedInputEvent event) { inputEvents.add(event); }

    public synchronized List<RecordedInputEvent> getInputEvents() {
        return new ArrayList<>(inputEvents);
    }
}
