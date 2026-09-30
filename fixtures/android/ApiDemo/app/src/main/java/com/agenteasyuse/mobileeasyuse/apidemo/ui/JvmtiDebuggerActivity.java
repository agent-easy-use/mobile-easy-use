package com.agenteasyuse.mobileeasyuse.apidemo.ui;
import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
import com.agenteasyuse.mobileeasyuse.apidemo.state.JvmtiDebuggerFixture;
public final class JvmtiDebuggerActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        TextView label = new TextView(this);
        label.setText("JVMTI → Frida debugger proof");
        setContentView(label);
        String mode = getIntent().getStringExtra("mode");
        int count = getIntent().getIntExtra("count", 1);
        if (mode != null && mode.startsWith("mvp:")) {
            com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerMvpFixture.start(mode.substring(4), count);
        } else if ("read-types-static".equals(mode) || "read-types-instance".equals(mode)) {
            com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerReadTypesFixture.start(mode.endsWith("instance"));
        } else {
            new Thread(() -> {
                JvmtiDebuggerFixture.run(mode == null ? "read" : mode, count);
            }, "jvmti-proof-worker").start();
        }
    }
}
