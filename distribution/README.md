# Distribution compatibility

`compatibility.json` is the public source of truth between GitHub Release artifacts and published MCP versions.

- A Release entry uses an explicit inclusive MCP version range.
- Publishing a Release adds its entry and updates `latestReleaseVersion`.
- Publishing npm updates the applicable Release entry's `maximumMcpVersion` to the newly published package version.
- Publish the npm package before exposing that version in this catalog.

Keep `integration/VERSION`, the GitHub tag, and artifact filenames on the same Release version.
