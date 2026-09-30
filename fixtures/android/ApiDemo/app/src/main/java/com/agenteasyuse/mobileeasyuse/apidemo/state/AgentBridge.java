package com.agenteasyuse.mobileeasyuse.apidemo.state;

/** Minimal JDI-to-Frida feasibility fixture, not a production bridge. */
public final class AgentBridge {
    private AgentBridge() {}

    public static String inspect(Object target, String expression) {
        return "FRIDA_NOT_INSTALLED";
    }
}
