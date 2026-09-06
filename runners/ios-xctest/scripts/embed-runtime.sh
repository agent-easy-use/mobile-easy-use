#!/usr/bin/env bash

set -euo pipefail

runner_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "${PLATFORM_NAME:-}" in
  iphoneos|iphonesimulator)
    ;;
  *)
    echo "error: MEUStandaloneRunner does not support platform '${PLATFORM_NAME:-<missing>}'" >&2
    exit 1
    ;;
esac

runtime_source="${runner_dir}/Binaries/${PLATFORM_NAME}/MobileEasyUseRuntime.dylib"
config_source="${runner_dir}/MobileEasyUseRuntime.config"
frameworks_dir="${TARGET_BUILD_DIR}/${WRAPPER_NAME}/Frameworks"
runtime_destination="${frameworks_dir}/MobileEasyUseRuntime.dylib"
config_destination="${frameworks_dir}/MobileEasyUseRuntime.config"
runner_port="${MEU_RUNNER_PORT:-8485}"

if [[ ! "${runner_port}" =~ ^[1-9][0-9]*$ || "${runner_port}" -gt 65535 ]]; then
  echo "error: MEU_RUNNER_PORT must be an integer between 1 and 65535" >&2
  exit 1
fi

for source_path in "${runtime_source}" "${config_source}"; do
  if [[ ! -f "${source_path}" ]]; then
    echo "error: MEUStandaloneRunner input is missing: ${source_path}" >&2
    exit 1
  fi
done

mkdir -p "${frameworks_dir}"
/bin/rm -f "${frameworks_dir}/MobileEasyUse.dylib"
/usr/bin/ditto "${runtime_source}" "${runtime_destination}"
/usr/bin/ditto "${config_source}" "${config_destination}"
/usr/bin/plutil -replace interaction.port -integer "${runner_port}" "${config_destination}"

if [[ "${CODE_SIGNING_ALLOWED:-NO}" == "YES" ]]; then
  signing_identity="${EXPANDED_CODE_SIGN_IDENTITY:--}"
  if [[ -z "${signing_identity}" ]]; then signing_identity="-"; fi
  /usr/bin/codesign --force --sign "${signing_identity}" \
    --preserve-metadata=identifier,entitlements,flags \
    "${runtime_destination}"
fi
