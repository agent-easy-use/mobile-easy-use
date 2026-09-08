#!/usr/bin/env bash

set -euo pipefail

kind=""
destination_id=""
team_id=""
bundle_id=""
listen_port="8485"
runner_dir=""

usage() {
  echo "Usage:"
  echo "  build-runner.sh --simulator UDID [--port PORT] --runner PATH"
  echo "  build-runner.sh --device UDID --team TEAM_ID --bundle-id BUNDLE_ID [--port PORT] --runner PATH"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --simulator|--device)
      if [[ -n "${kind}" || $# -lt 2 || -z "$2" ]]; then usage >&2; exit 2; fi
      kind="${1#--}"
      destination_id="$2"
      shift 2
      ;;
    --runner)
      if [[ $# -lt 2 || -z "$2" ]]; then usage >&2; exit 2; fi
      runner_dir="$2"
      shift 2
      ;;
    --bundle-id)
      if [[ $# -lt 2 || -z "$2" ]]; then usage >&2; exit 2; fi
      bundle_id="$2"
      shift 2
      ;;
    --team)
      if [[ $# -lt 2 || -z "$2" ]]; then usage >&2; exit 2; fi
      team_id="$2"
      shift 2
      ;;
    --port)
      if [[ $# -lt 2 || ! "$2" =~ ^[1-9][0-9]*$ || "$2" -gt 65535 ]]; then
        echo "--port must be an integer between 1 and 65535" >&2
        exit 2
      fi
      listen_port="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown runner argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${kind}" ]]; then usage >&2; exit 2; fi
if [[ "${kind}" == "device" && ( ! "${team_id}" =~ ^[A-Z0-9]{10}$ || ! "${bundle_id}" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ) ]]; then
  echo "A valid --team and --bundle-id are required for a physical device build" >&2
  exit 2
fi

if [[ ! -d "${runner_dir}" ]]; then
  echo "MobileEasyUse iOS Runner is unavailable at '${runner_dir}'." >&2
  echo "Use --runner with the downloaded runnerPath." >&2
  exit 1
fi

if [[ "${kind}" == "simulator" ]]; then
  destination="platform=iOS Simulator,id=${destination_id}"
  platform_name="iphonesimulator"
else
  destination="platform=iOS,id=${destination_id}"
  platform_name="iphoneos"
fi

# Keep the cache key and fingerprint compatible with the independent skill/Host builder.
cache_key="$(printf '%s\0%s\0%s\0%s\0%s' "${kind}" "${destination_id}" "${team_id}" "${listen_port}" "${bundle_id}" \
  | /usr/bin/shasum -a 256 | /usr/bin/awk '{print substr($1, 1, 16)}')"
derived_data="${runner_dir}/.derived-data/${kind}-${cache_key}"

runtime_path="${runner_dir}/Binaries/${platform_name}/MobileEasyUseRuntime.dylib"
fingerprint_path="${derived_data}/mobile-easy-use-runner.fingerprint"
fingerprint_inputs=(
  "${runner_dir}/MEUStandaloneRunner.xcodeproj/project.pbxproj"
  "${runner_dir}/MEUStandaloneRunner.xcodeproj/xcshareddata/xcschemes/MEUStandaloneRunner.xcscheme"
  "${runner_dir}/MEUStandaloneRunner/MEUStandaloneRunner.swift"
  "${runner_dir}/MobileEasyUseRuntime.config"
  "${runner_dir}/scripts/embed-runtime.sh"
  "${runtime_path}"
)
for input_path in "${fingerprint_inputs[@]}"; do
  if [[ ! -f "${input_path}" ]]; then
    echo "Runner fingerprint input is missing: ${input_path}" >&2
    exit 1
  fi
done
fingerprint="$({
  printf '%s\n' "runner-cache-v3" "${kind}" "${destination_id}" "${team_id}" "${listen_port}" "${bundle_id}"
  xcodebuild -version
  /usr/bin/shasum -a 256 "${fingerprint_inputs[@]}"
} | /usr/bin/shasum -a 256 | /usr/bin/awk '{print $1}')"

products="${derived_data}/Build/Products"
shopt -s nullglob
run_specs=("${products}"/MEUStandaloneRunner_*.xctestrun)
if [[ "${kind}" == "simulator" ]]; then
  runner_app="${products}/Debug-iphonesimulator/MEUStandaloneRunner-Runner.app"
else
  runner_app="${products}/Debug-iphoneos/MEUStandaloneRunner-Runner.app"
fi

verify_runner() {
  runner_is_reusable=false
  if [[ ${#run_specs[@]} -eq 1 && -d "${runner_app}" \
      && -f "${runner_app}/PlugIns/MEUStandaloneRunner.xctest/Frameworks/MobileEasyUseRuntime.dylib" ]] \
      && /usr/bin/codesign --verify --deep --strict "${runner_app}" 2>/dev/null; then
    runner_is_reusable=true
    if [[ "${kind}" == "device" ]]; then
      signed_team="$(/usr/bin/codesign -dvv "${runner_app}" 2>&1 \
        | /usr/bin/sed -n 's/^TeamIdentifier=//p')"
      profile="${runner_app}/embedded.mobileprovision"
      expiration=""
      provisioned_devices=""
      if [[ -f "${profile}" ]]; then
        expiration="$(/usr/bin/security cms -D -i "${profile}" 2>/dev/null \
          | /usr/bin/plutil -extract ExpirationDate raw -o - - 2>/dev/null || true)"
        provisioned_devices="$(/usr/bin/security cms -D -i "${profile}" 2>/dev/null \
          | /usr/bin/plutil -extract ProvisionedDevices xml1 -o - - 2>/dev/null || true)"
      fi
      expiration_epoch="$(/bin/date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "${expiration}" +%s 2>/dev/null || true)"
      if [[ "${signed_team}" != "${team_id}" || -z "${expiration_epoch}" \
          || "${expiration_epoch}" -le "$(/bin/date +%s)" ]] \
          || ! /usr/bin/grep -Fq "<string>${destination_id}</string>" <<<"${provisioned_devices}"; then
        runner_is_reusable=false
      fi
    fi
  fi

}
verify_runner
if [[ ! -f "${fingerprint_path}" || "$(<"${fingerprint_path}")" != "${fingerprint}" ]]; then
  runner_is_reusable=false
fi

build_arguments=(
  build-for-testing
  -project "${runner_dir}/MEUStandaloneRunner.xcodeproj"
  -scheme MEUStandaloneRunner
  -destination "${destination}"
  -derivedDataPath "${derived_data}"
  "MEU_RUNNER_PORT=${listen_port}"
)
if [[ "${kind}" == "device" ]]; then
  build_arguments+=("DEVELOPMENT_TEAM=${team_id}" "PRODUCT_BUNDLE_IDENTIFIER=${bundle_id}" "CODE_SIGN_STYLE=Automatic" -allowProvisioningUpdates \
    -allowProvisioningDeviceRegistration)
fi
if [[ "${runner_is_reusable}" != true ]]; then
  echo "Building and signing Runner for ${kind} ${destination_id}" >&2
  xcodebuild "${build_arguments[@]}"
  run_specs=("${products}"/MEUStandaloneRunner_*.xctestrun)
  verify_runner
  if [[ "${runner_is_reusable}" != true ]]; then
    echo "error: Runner signing verification failed (signature, team, profile expiry or device)." >&2
    exit 1
  fi
  printf '%s\n' "${fingerprint}" > "${fingerprint_path}"
else
  echo "Reusing signed Runner for ${kind} ${destination_id}" >&2
fi

if [[ ${#run_specs[@]} -ne 1 ]]; then
  echo "Expected one generated MEUStandaloneRunner .xctestrun, found ${#run_specs[@]}" >&2
  exit 1
fi
echo "Runner signing verified for ${destination_id}" >&2
