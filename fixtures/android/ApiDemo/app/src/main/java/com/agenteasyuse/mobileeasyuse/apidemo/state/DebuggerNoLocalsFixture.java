package com.agenteasyuse.mobileeasyuse.apidemo.state;

// The debugger-mvp build removes only LocalVariableTable/LocalVariableTypeTable.
// Source lines remain, so the breakpoint can still be installed.
public class DebuggerNoLocalsFixture {
    public int count = 100;
    public int call(int count) {
        return this.count + count; // BP_NO_LOCALS
    }
}
