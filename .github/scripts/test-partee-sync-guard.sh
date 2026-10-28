#!/usr/bin/env bash
# Local tests for partee-sync-guard.sh with fixture JSON (no network, no secrets). Needs bash, jq and GNU date.
# Run:  bash .github/scripts/test-partee-sync-guard.sh
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guard="$here/partee-sync-guard.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

NOW="2026-10-28T14:15:30Z" # the (fake) moment the scheduled full run starts
CUR=999                    # the (fake) id of the current run

# run <id> <run_number> <conclusion-json> <display_title> <updated_at>
run() {
  printf '{"id":%s,"run_number":%s,"status":"completed","conclusion":%s,"display_title":"%s","updated_at":"%s"}' "$1" "$2" "$3" "$4" "$5"
}
# runs <run>...  ->  API-shaped response
runs() {
  local IFS=,
  printf '{"total_count":%s,"workflow_runs":[%s]}' "$#" "$*"
}

fails=0
# check <name> <fixture-json> <expected skip> [summary-substring]
check() {
  local name="$1" json="$2" want="$3" sub="${4:-}"
  printf '%s' "$json" > "$tmp/runs.json"
  : > "$tmp/out"
  : > "$tmp/sum"
  local log
  log=$(RUNS_FILE="$tmp/runs.json" NOW="$NOW" GITHUB_RUN_ID="$CUR" GITHUB_OUTPUT="$tmp/out" GITHUB_STEP_SUMMARY="$tmp/sum" bash "$guard" 2>&1)
  local got
  got=$(sed -n 's/^skip=//p' "$tmp/out")
  # A case that is not about failing open must not have fallen back (that would pass "skip=false" for the wrong reason).
  local fell_back=false
  grep -qF "could not check" "$tmp/sum" && fell_back=true
  local fallback_ok=true
  case "$sub" in *"could not check"*) ;; *) [ "$fell_back" = true ] && fallback_ok=false ;; esac
  if [ "$got" = "$want" ] && [ "$fallback_ok" = true ] && { [ -z "$sub" ] || grep -qF -- "$sub" "$tmp/sum"; }; then
    echo "PASS  $name -> skip=$got"
  else
    echo "FAIL  $name -> skip=$got (wanted $want${sub:+, summary containing '$sub'})"
    echo "      log: $log"
    fails=$((fails + 1))
  fi
}

REAL="Partee sync"
DRY="Partee sync (dry run)"
HOURLY="Partee sync (hourly)"
OK='"success"'

check "recent real success (25 min ago) -> skip" \
  "$(runs "$(run 101 41 "$OK" "$REAL" 2026-10-28T13:50:30Z)")" true "Skipped: a real sync finished at 13:50 UTC (run #41)"
check "real success exactly 60 min ago -> skip" \
  "$(runs "$(run 101 41 "$OK" "$REAL" 2026-10-28T13:15:30Z)")" true
check "real success 61 min ago -> run" \
  "$(runs "$(run 101 41 "$OK" "$REAL" 2026-10-28T13:14:30Z)")" false "No recent real sync: running"
check "real success 3 hours ago -> run" \
  "$(runs "$(run 101 41 "$OK" "$REAL" 2026-10-28T11:00:00Z)")" false
check "recent success but dry-run title -> run" \
  "$(runs "$(run 102 42 "$OK" "$DRY" 2026-10-28T14:00:00Z)")" false
check "recent success but hourly title -> run" \
  "$(runs "$(run 103 43 "$OK" "$HOURLY" 2026-10-28T14:00:00Z)")" false
check "the current run itself is ignored -> run" \
  "$(runs "$(run "$CUR" 44 "$OK" "$REAL" 2026-10-28T14:15:00Z)")" false
check "recent failure -> run" \
  "$(runs "$(run 104 45 '"failure"' "$REAL" 2026-10-28T14:00:00Z)")" false
check "recent cancelled -> run" \
  "$(runs "$(run 105 46 '"cancelled"' "$REAL" 2026-10-28T14:00:00Z)")" false
check "recent run without conclusion (null) -> run" \
  "$(runs "$(run 106 47 null "$REAL" 2026-10-28T14:00:00Z)")" false
check "empty list -> run" \
  "$(runs)" false "No recent real sync: running"
check "mixed list: old real + recent hourly/dry + recent real -> skip, newest real reported" \
  "$(runs \
    "$(run 110 50 "$OK" "$HOURLY" 2026-10-28T14:00:00Z)" \
    "$(run 109 49 "$OK" "$REAL" 2026-10-28T13:40:00Z)" \
    "$(run 108 48 "$OK" "$DRY" 2026-10-28T13:45:00Z)" \
    "$(run 107 47 "$OK" "$REAL" 2026-10-28T09:00:00Z)")" true "(run #49)"
check "malformed JSON -> run (fail open)" 'this is { not json' false "guard could not check"
check "empty response -> run (fail open)" '' false "guard could not check"
check "API error object -> run (fail open)" '{"message":"Bad credentials","status":"401"}' false "guard could not check"
check "workflow_runs is not an array -> run (fail open)" '{"workflow_runs":"nope"}' false "guard could not check"
check "garbage entries and bad dates are ignored -> run" \
  '{"workflow_runs":[null,5,"x",{"id":1,"conclusion":"success","display_title":"Partee sync","updated_at":"not a date"}]}' false

# The real fetch path, with a stub `gh` first on PATH (no network).
mkdir "$tmp/bin"
cat > "$tmp/bin/gh" << 'EOF'
#!/usr/bin/env bash
if [ "${GH_STUB_MODE:-}" = "fail" ]; then echo "boom: secret-looking-text" >&2; exit 1; fi
cat "$GH_STUB_FILE"
EOF
chmod +x "$tmp/bin/gh"

: > "$tmp/out"; : > "$tmp/sum"
runs "$(run 101 41 "$OK" "$REAL" 2026-10-28T14:00:00Z)" > "$tmp/stub.json"
log=$(PATH="$tmp/bin:$PATH" GH_STUB_FILE="$tmp/stub.json" GITHUB_REPOSITORY=o/r NOW="$NOW" GITHUB_RUN_ID="$CUR" GITHUB_OUTPUT="$tmp/out" GITHUB_STEP_SUMMARY="$tmp/sum" bash "$guard" 2>&1)
if [ "$(sed -n 's/^skip=//p' "$tmp/out")" = "true" ]; then echo "PASS  gh api path (stub) -> skip=true"; else echo "FAIL  gh api path (stub): $log"; fails=$((fails + 1)); fi

: > "$tmp/out"; : > "$tmp/sum"
log=$(PATH="$tmp/bin:$PATH" GH_STUB_MODE=fail GITHUB_REPOSITORY=o/r NOW="$NOW" GITHUB_RUN_ID="$CUR" GITHUB_OUTPUT="$tmp/out" GITHUB_STEP_SUMMARY="$tmp/sum" bash "$guard" 2>&1)
if [ "$(sed -n 's/^skip=//p' "$tmp/out")" = "false" ] && printf '%s' "$log" | grep -q '^::warning::' && ! printf '%s' "$log" | grep -q 'secret-looking-text'; then
  echo "PASS  gh api failure -> skip=false, warning annotation, gh stderr not echoed"
else
  echo "FAIL  gh api failure: $log"; fails=$((fails + 1))
fi

echo
if [ "$fails" -eq 0 ]; then echo "All guard tests passed."; else echo "$fails guard test(s) FAILED."; exit 1; fi
