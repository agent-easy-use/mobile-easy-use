package com.example.helloworld.feature;

/** App-owned feature boundary used to model a remote rollout decision. */
public final class FeatureFlagProvider {
    public boolean isAdvancedInspectionEnabled() {
        return false;
    }
}
