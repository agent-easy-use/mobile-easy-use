#!/usr/bin/env bash

set -euo pipefail

target_configuration="Debug"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --configuration)
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "error: --configuration requires a value" >&2
        exit 2
      fi
      target_configuration="$2"
      shift 2
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "${CONFIGURATION:-}" != "${target_configuration}" ]]; then
  exit 0
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
integration_dir="$(dirname "${script_dir}")"

case "${PLATFORM_NAME:-}" in
  iphoneos)
    binaries_dir="${integration_dir}/Binaries/iphoneos"
    ;;
  iphonesimulator)
    binaries_dir="${integration_dir}/Binaries/iphonesimulator"
    ;;
  *)
    echo "error: MobileEasyUse does not support platform '${PLATFORM_NAME:-<missing>}'" >&2
    exit 1
    ;;
esac

bridge_source="${binaries_dir}/MobileEasyUse.dylib"
runtime_source="${binaries_dir}/MobileEasyUseRuntime.dylib"
for source_path in "${bridge_source}" "${runtime_source}"; do
  if [[ ! -f "${source_path}" ]]; then
    echo "error: MobileEasyUse binary is missing: ${source_path}" >&2
    exit 1
  fi
done

frameworks_dir="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}"
resources_dir="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
bridge_destination="${frameworks_dir}/MobileEasyUse.dylib"
runtime_destination="${frameworks_dir}/MobileEasyUseRuntime.dylib"

mkdir -p "${frameworks_dir}" "${resources_dir}"
/usr/bin/ditto "${bridge_source}" "${bridge_destination}"
/usr/bin/ditto "${runtime_source}" "${runtime_destination}"
/usr/bin/ditto \
  "${integration_dir}/MobileEasyUseRuntime.config" \
  "${resources_dir}/MobileEasyUseRuntime.config"
/usr/bin/install_name_tool -id \
  "@loader_path/MobileEasyUseRuntime.dylib" \
  "${runtime_destination}"
/usr/bin/install_name_tool -id \
  "@loader_path/MobileEasyUse.dylib" \
  "${bridge_destination}"

if [[ "${CODE_SIGNING_ALLOWED:-NO}" == "YES" ]]; then
  signing_identity="${EXPANDED_CODE_SIGN_IDENTITY:--}"
  if [[ -z "${signing_identity}" ]]; then
    signing_identity="-"
  fi
  /usr/bin/codesign --force --sign "${signing_identity}" \
    --preserve-metadata=identifier,entitlements,flags \
    "${runtime_destination}"
  /usr/bin/codesign --force --sign "${signing_identity}" \
    --preserve-metadata=identifier,entitlements,flags \
    "${bridge_destination}"
fi
