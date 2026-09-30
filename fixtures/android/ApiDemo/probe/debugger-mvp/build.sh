#!/usr/bin/env bash
set -euo pipefail
# Run explicitly from repository root; passing a serial installs/restarts ApiDemo.
mkdir -p artifacts/benchmarks/debugger-mvp
node_modules/.bin/frida-compile fixtures/android/ApiDemo/probe/debugger-mvp/agent.js \
  -o artifacts/benchmarks/debugger-mvp/agent.js -S
# Reuse the real SDK AAR + fixture build and isolated Gadget packaging.
fixtures/android/ApiDemo/probe/debugger-read-types/build.sh "$@"
