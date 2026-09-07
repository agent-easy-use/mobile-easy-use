#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
integration_dir="$(dirname "${script_dir}")"
sources_dir="${integration_dir}/Sources/Internal"

build_platform() {
  local platform_name="$1"
  local sdk_name="$2"
  local minimum_version_flag="$3"
  local binaries_dir="${integration_dir}/Binaries/${platform_name}"
  local runtime_path="${binaries_dir}/MobileEasyUseRuntime.dylib"
  local output_path="${binaries_dir}/MobileEasyUse.dylib"
  local temporary_dir
  local architecture
  local -a slices=()

  if [[ ! -f "${runtime_path}" ]]; then
    echo "error: MobileEasyUse runtime is missing: ${runtime_path}" >&2
    return 1
  fi

  temporary_dir="$(mktemp -d -t mobile-easy-use-ios-build)"
  trap 'rm -rf "${temporary_dir}"' RETURN

  /usr/bin/install_name_tool -id \
    "@loader_path/MobileEasyUseRuntime.dylib" \
    "${runtime_path}"

  for architecture in $(/usr/bin/lipo -archs "${runtime_path}"); do
    local slice_path="${temporary_dir}/MobileEasyUse-${architecture}.dylib"
    xcrun --sdk "${sdk_name}" clang \
      -fobjc-arc \
      -dynamiclib \
      -arch "${architecture}" \
      "${minimum_version_flag}" \
      -I "${sources_dir}" \
      "${sources_dir}/MEULog.m" \
      "${sources_dir}/MEUScreenshot.m" \
      "${sources_dir}/MEUUIQuery.m" \
      -framework Foundation \
      -framework CoreGraphics \
      -framework UIKit \
      -Wl,-install_name,@loader_path/MobileEasyUse.dylib \
      -o "${slice_path}"
    slices+=("${slice_path}")
  done

  /usr/bin/lipo -create "${slices[@]}" -output "${output_path}"
  /usr/bin/codesign --force --sign - "${runtime_path}"
  /usr/bin/codesign --force --sign - "${output_path}"

  if /usr/bin/otool -L "${output_path}" \
    | /usr/bin/grep -q '@loader_path/MobileEasyUseRuntime.dylib'; then
    echo "error: ${output_path} must not link MobileEasyUseRuntime directly" >&2
    return 1
  fi
}

build_platform iphoneos iphoneos -miphoneos-version-min=14.0
build_platform iphonesimulator iphonesimulator -mios-simulator-version-min=14.0
