# Retained investigations

Ordinary SDK regression scripts have moved to `../tests/`, grouped by current SDK capabilities and executed through `test/e2e/run.mjs`.

`presets/` remains a separate real-App presets smoke check. This smoke check is not automatically run by the E2E suite; historical results do not establish current compatibility.

See [migration decisions](../../../../docs/testing/apidemo-probe-migration.md) for retired contracts, migrated coverage, and remaining scope.
