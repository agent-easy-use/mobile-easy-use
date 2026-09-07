#!/usr/bin/env bash

set -euo pipefail

device_name=""
simulator_name=""
bundle_id=""
timeout_seconds="90"

usage() {
  echo "Usage:"
  echo "  load-mobile-easy-use.sh --device NAME --bundle-id ID [--timeout SECONDS]"
  echo "  load-mobile-easy-use.sh --simulator NAME_OR_UDID --bundle-id ID [--timeout SECONDS]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      [[ $# -ge 2 ]] || { echo "Missing value for --device" >&2; exit 2; }
      device_name="$2"
      shift 2
      ;;
    --simulator)
      [[ $# -ge 2 ]] || { echo "Missing value for --simulator" >&2; exit 2; }
      simulator_name="$2"
      shift 2
      ;;
    --bundle-id)
      [[ $# -ge 2 ]] || { echo "Missing value for --bundle-id" >&2; exit 2; }
      bundle_id="$2"
      shift 2
      ;;
    --timeout)
      [[ $# -ge 2 ]] || { echo "Missing value for --timeout" >&2; exit 2; }
      timeout_seconds="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "${device_name}" && -n "${simulator_name}" ]]; then
  echo "--device and --simulator are mutually exclusive" >&2
  usage >&2
  exit 2
fi
if [[ -z "${device_name}" && -z "${simulator_name}" ]]; then
  echo "Either --device or --simulator is required" >&2
  usage >&2
  exit 2
fi
if [[ -z "${bundle_id}" ]]; then
  echo "--bundle-id is required" >&2
  usage >&2
  exit 2
fi
if [[ ! "${timeout_seconds}" =~ ^[1-9][0-9]*$ ]]; then
  echo "--timeout must be a positive integer" >&2
  exit 2
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lldb_loader="${script_dir}/load_mobile_easy_use.py"
lldb_loader_escaped="${lldb_loader//\\/\\\\}"
lldb_loader_escaped="${lldb_loader_escaped//\"/\\\"}"

run_lldb_loader() {
  local mode="$1"
  local target_name="$2"
  local attach_pid="$3"
  local device_udid="${4:-}"
  local device_udid_escaped="${device_udid//\\/\\\\}"
  device_udid_escaped="${device_udid_escaped//\"/\\\"}"

  local -a attach_commands
  if [[ "${mode}" == "device" ]]; then
    attach_commands=(
      -o "device list"
      -o "device select \"${device_udid_escaped}\""
      -o "device process attach -p ${attach_pid}"
    )
  else
    attach_commands=(
      -o "process attach --pid ${attach_pid}"
    )
  fi

  echo "Starting LLDB for ${mode} '${target_name}' and process ${attach_pid}..."
  MOBILE_EASY_USE_LLDB_MODE="${mode}" \
  MOBILE_EASY_USE_LLDB_TARGET="${target_name}" \
  MOBILE_EASY_USE_LLDB_PID="${attach_pid}" \
  MOBILE_EASY_USE_LLDB_TIMEOUT="${timeout_seconds}" \
    xcrun lldb --batch \
      -o "settings set target.preload-symbols false" \
      -o "settings set symbols.enable-external-lookup false" \
      -o "settings set symbols.load-on-demand true" \
      -o "settings set target.memory-module-load-level minimal" \
      "${attach_commands[@]}" \
      -o "command script import \"${lldb_loader_escaped}\"" \
      -o "mobile-easy-use-load"
}

if [[ -n "${simulator_name}" ]]; then
  if ! simulator_udid="$(
    xcrun simctl getenv "${simulator_name}" SIMULATOR_UDID 2>&1
  )"; then
    echo "Simulator '${simulator_name}' is unavailable or not booted." >&2
    echo "${simulator_udid}" >&2
    exit 1
  fi

  if ! app_path="$(
    xcrun simctl get_app_container "${simulator_udid}" "${bundle_id}" app 2>&1
  )"; then
    echo "Failed to resolve '${bundle_id}' on simulator '${simulator_name}'." >&2
    echo "${app_path}" >&2
    exit 1
  fi
  if ! executable_name="$(
    /usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${app_path}/Info.plist" 2>&1
  )" || [[ -z "${executable_name}" ]]; then
    echo "Could not resolve the simulator App executable for '${bundle_id}'." >&2
    echo "${executable_name}" >&2
    exit 1
  fi
  app_executable="${app_path}/${executable_name}"
  bridge_path="${app_path}/Frameworks/MobileEasyUse.dylib"
  runtime_path="${app_path}/Frameworks/MobileEasyUseRuntime.dylib"
  for image_path in "${bridge_path}" "${runtime_path}"; do
    if [[ ! -f "${image_path}" ]]; then
      echo "MobileEasyUse simulator image is missing: ${image_path}" >&2
      exit 1
    fi
  done
  simulator_pid="$(
    ps -axo pid=,command= \
      | /usr/bin/awk -v executable="${app_executable}" \
        '$2 == executable && !pid {pid = $1} END {if (pid) print pid}'
  )"
  simulator_was_launched=false
  if [[ ! "${simulator_pid}" =~ ^[1-9][0-9]*$ ]]; then
    if ! launch_output="$(
      xcrun simctl launch "${simulator_udid}" "${bundle_id}" 2>&1
    )"; then
      echo "Failed to launch '${bundle_id}' on simulator '${simulator_name}'." >&2
      echo "${launch_output}" >&2
      exit 1
    fi
    if [[ ! "${launch_output}" =~ :[[:space:]]+([0-9]+) ]]; then
      echo "Could not determine the simulator App PID from simctl output:" >&2
      echo "${launch_output}" >&2
      exit 1
    fi
    simulator_pid="${BASH_REMATCH[1]}"
    simulator_was_launched=true
  fi
  if [[ "${simulator_was_launched}" == true ]]; then
    # Let the launch transaction advance before LLDB stops the process. The
    # in-LLDB dyld state check remains the authority for readiness.
    sleep 0.5
  fi

  if loader_output="$(
    run_lldb_loader simulator "${simulator_name}" "${simulator_pid}"
  )"; then
    :
  else
    loader_status=$?
    echo "${loader_output}" >&2
    exit "${loader_status}"
  fi

  ready=false
  deadline=$((SECONDS + timeout_seconds))
  while (( SECONDS < deadline )); do
    if ! kill -0 "${simulator_pid}" 2>/dev/null; then
      echo "Simulator App process ${simulator_pid} exited during MobileEasyUse startup." >&2
      exit 1
    fi
    if /usr/sbin/lsof -nP -a -p "${simulator_pid}" \
      -iTCP:8484 -sTCP:LISTEN >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 0.1
  done
  if [[ "${ready}" != true ]]; then
    echo "MobileEasyUse simulator Runtime did not listen on port 8484 within ${timeout_seconds} seconds." >&2
    exit 1
  fi
  printf '%s\n' "${loader_output}"
  exit 0
fi

device_tmp_dir="$(mktemp -d -t mobile-easy-use-device)"
device_details_json="${device_tmp_dir}/details.json"
device_details_log="${device_tmp_dir}/details.log"
device_launch_json="${device_tmp_dir}/launch.json"
device_launch_log="${device_tmp_dir}/launch.log"
device_ddi_json="${device_tmp_dir}/ddi.json"
device_ddi_log="${device_tmp_dir}/ddi.log"
device_process_json="${device_tmp_dir}/process.json"
device_process_log="${device_tmp_dir}/process.log"
device_console_log="${device_tmp_dir}/console.log"
device_console_pid=""

cleanup_device_session() {
  if [[ "${device_console_pid}" =~ ^[1-9][0-9]*$ ]] \
    && kill -0 "${device_console_pid}" 2>/dev/null; then
    # SIGKILL stops only the local devicectl console client. Catchable signals
    # are intentionally avoided because devicectl forwards them to the App.
    kill -KILL "${device_console_pid}" 2>/dev/null || true
    wait "${device_console_pid}" 2>/dev/null || true
  fi
  rm -rf -- "${device_tmp_dir}"
}
trap cleanup_device_session EXIT

if xcrun devicectl device info details \
  --quiet \
  --device "${device_name}" \
  --timeout "${timeout_seconds}" \
  --json-output "${device_details_json}" \
  --log-output "${device_details_log}"; then
  :
else
  device_details_status=$?
  echo "Failed to resolve device '${device_name}'." >&2
  [[ -f "${device_details_log}" ]] && cat "${device_details_log}" >&2
  exit "${device_details_status}"
fi

if ! core_device_identifier="$(
  /usr/bin/plutil -extract result.identifier raw -o - "${device_details_json}" 2>/dev/null
)" || [[ -z "${core_device_identifier}" ]]; then
  echo "Could not resolve the CoreDevice identifier for '${device_name}'." >&2
  exit 1
fi
if ! hardware_udid="$(
  /usr/bin/plutil -extract result.hardwareProperties.udid raw -o - "${device_details_json}" 2>/dev/null
)" || [[ -z "${hardware_udid}" ]]; then
  echo "Could not resolve CoreDevice and hardware identifiers for '${device_name}'." >&2
  exit 1
fi

device_launch_output=""
device_launch_attempt=1
device_launch_max_attempts=3
device_launch_succeeded=false

while (( device_launch_attempt <= device_launch_max_attempts )); do
  rm -f "${device_launch_json}" "${device_launch_log}"
  if xcrun devicectl device process launch \
      --quiet \
      --device "${core_device_identifier}" \
      --timeout "${timeout_seconds}" \
      --json-output "${device_launch_json}" \
      --log-output "${device_launch_log}" \
      "${bundle_id}"; then
    device_launch_succeeded=true
    break
  else
    device_launch_status=$?
  fi
  device_launch_output=""
  [[ -f "${device_launch_log}" ]] && device_launch_output="$(<"${device_launch_log}")"

  if [[ "${device_launch_output}" != *"Timed out"* \
    && "${device_launch_output}" != *"timed out"* \
    && "${device_launch_output}" != *"Timeout"* \
    && "${device_launch_output}" != *"timeout"* ]]; then
    echo "Failed to resolve or launch '${bundle_id}' on device '${device_name}'." >&2
    echo "${device_launch_output}" >&2
    exit "${device_launch_status}"
  fi

  if (( device_launch_attempt == device_launch_max_attempts )); then
    echo "CoreDevice launch resolution for '${device_name}' timed out after ${device_launch_max_attempts} attempts." >&2
    echo "${device_launch_output}" >&2
    exit 1
  fi

  echo "CoreDevice launch resolution attempt ${device_launch_attempt}/${device_launch_max_attempts} timed out; retrying..." >&2
  sleep 1
  ((device_launch_attempt += 1))
done

if [[ "${device_launch_succeeded}" != true ]]; then
  echo "CoreDevice launch resolution failed for '${device_name}'." >&2
  exit 1
fi

if ! device_pid="$(
  /usr/bin/plutil \
    -extract result.process.processIdentifier \
    raw \
    -o - \
    "${device_launch_json}" \
    2>/dev/null
)" || [[ ! "${device_pid}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not determine the device App PID from CoreDevice JSON output." >&2
  [[ -f "${device_launch_log}" ]] && cat "${device_launch_log}" >&2
  exit 1
fi
if ! device_executable="$(
  /usr/bin/plutil \
    -extract result.process.executable \
    raw \
    -o - \
    "${device_launch_json}" \
    2>/dev/null
)" || [[ -z "${device_executable}" ]]; then
  echo "Could not determine the device App executable from CoreDevice JSON output." >&2
  [[ -f "${device_launch_log}" ]] && cat "${device_launch_log}" >&2
  exit 1
fi

xcrun devicectl device process launch \
  --quiet \
  --device "${core_device_identifier}" \
  --console \
  --log-output "${device_console_log}" \
  "${bundle_id}" &
device_console_pid=$!
if ! kill -0 "${device_console_pid}" 2>/dev/null; then
  echo "Could not keep the CoreDevice session active for LLDB." >&2
  [[ -f "${device_console_log}" ]] && cat "${device_console_log}" >&2
  exit 1
fi

if xcrun devicectl device info ddiServices \
  --quiet \
  --device "${core_device_identifier}" \
  --timeout "${timeout_seconds}" \
  --json-output "${device_ddi_json}" \
  --log-output "${device_ddi_log}"; then
  :
else
  device_ddi_status=$?
  echo "Developer Disk Image services are unavailable for '${device_name}'." >&2
  [[ -f "${device_ddi_log}" ]] && cat "${device_ddi_log}" >&2
  exit "${device_ddi_status}"
fi

if ! xcrun devicectl device info processes \
    --quiet \
    --device "${core_device_identifier}" \
    --timeout "${timeout_seconds}" \
    --filter "processIdentifier == ${device_pid}" \
    --json-output "${device_process_json}" \
    --log-output "${device_process_log}"; then
  device_process_status=$?
  echo "Could not verify device App process ${device_pid} before attaching LLDB." >&2
  [[ -f "${device_process_log}" ]] && cat "${device_process_log}" >&2
  exit "${device_process_status}"
fi

if ! ready_pid="$(
  /usr/bin/plutil \
    -extract result.runningProcesses.0.processIdentifier \
    raw \
    -o - \
    "${device_process_json}" \
    2>/dev/null
)" || [[ "${ready_pid}" != "${device_pid}" ]]; then
  echo "Device App process ${device_pid} exited before LLDB attach." >&2
  exit 1
fi
if ! ready_executable="$(
  /usr/bin/plutil \
    -extract result.runningProcesses.0.executable \
    raw \
    -o - \
    "${device_process_json}" \
    2>/dev/null
)" || [[ "${ready_executable}" != "${device_executable}" ]]; then
  echo "Device App process ${device_pid} changed identity before LLDB attach; refusing LLDB attach." >&2
  exit 1
fi

run_lldb_loader device "${device_name}" "${device_pid}" "${hardware_udid}"
