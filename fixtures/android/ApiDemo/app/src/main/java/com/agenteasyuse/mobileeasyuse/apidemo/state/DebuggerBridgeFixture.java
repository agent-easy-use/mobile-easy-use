package com.agenteasyuse.mobileeasyuse.apidemo.state;

public final class DebuggerBridgeFixture {
    public final Session session = new Session();

    public static final class Session {
        public final Config config = new Config();
        public Config getConfig() { return config; }
    }

    public static final class Config {
        public final String version = "bridge-proof-20260920";
        public String getVersion() { return version; }
    }

    public void checkpoint() {
        android.util.Log.i("DebuggerBridgeProof", "checkpoint continued: " + session.config.version);
    }
}
