#!/usr/bin/env bash
set -Eeuo pipefail
# keep terminal open on exit
if [[ -t 1 ]]; then
  trap 'code=$?; echo; echo "*** exit code: $code ***"; read -rp "Press Enter to close..." _' EXIT
fi

if [[ ${1:-} == "-h" || ${1:-} == "--help" || $# -lt 1 ]]; then
  echo "Usage: GZQR_PASS=yourpass $(basename "$0") <png_dir> [out_dir]"
  echo "Example: GZQR_PASS=12345678 packages/app/scripts/decode_dir.sh packages/app/_gzqr_tmp/qrcodes-*/"
  exit 2
fi

png_dir="$1"
out_dir="${2:-$(dirname "$png_dir")/out}"

mkdir -p "$out_dir"
this="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$this/../../.." && pwd)"

bin="$root/GitZipQR.cpp/build/decode"
if [[ ! -x "$bin" ]]; then
  echo "ERROR: decoder binary not found at $bin. Build first: make -C GitZipQR.cpp" >&2
  exit 1
fi

export GZQR_PASS="${GZQR_PASS:-}"
if [[ -z "${GZQR_PASS}" ]]; then
  echo "WARN: GZQR_PASS not set; you may be prompted in TTY..." >&2
fi

set -x
"$bin" "$png_dir" "$out_dir"
set +x

echo "OK: Restored to -> $out_dir"
