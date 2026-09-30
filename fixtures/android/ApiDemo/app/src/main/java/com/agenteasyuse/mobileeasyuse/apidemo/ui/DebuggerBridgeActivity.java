package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
import com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerBridgeFixture;

/** Explicit CLI trigger; the worker reaches the breakpoint without holding Frida's JS lock. */
public final class DebuggerBridgeActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        TextView label = new TextView(this);
        label.setText("JDI → AgentBridge.inspect → Frida proof");
        setContentView(label);
        new Thread(() -> new DebuggerBridgeFixture().checkpoint(), "debugger-bridge-proof").start();
    }
}
