#!/usr/bin/env bash
# Decides whether a scheduled FULL "Partee sync" run can be skipped because a REAL sync (a manual run with
# dry = false, e.g. the app's "Actualizar todo" button, or another full run) finished in the last 60 minutes.
# Used by the `guard` job of .github/workflows/partee-sync.yml.
#
# A run counts as a real sync when ALL of these hold (see `run-name` in the workflow):
#   conclusion == success, display_title == "Partee sync" (dry runs are "Partee sync (dry run)", hourly runs
#   "Partee sync (hourly)"), it is not the current run, and it was last updated within the last 60 minutes.
#
# Fails OPEN: any problem (API error, bad JSON, missing jq/gh, ...) gives skip=false plus a warning annotation,
# so the guard can never be the reason a needed sync does not run.
#
# Env: GITHUB_REPOSITORY, GITHUB_RUN_ID, GH_TOKEN (all provided by Actions; the token needs actions: read).
#      GITHUB_OUTPUT / GITHUB_STEP_SUMMARY are written when set (stdout / nowhere otherwise).
# Test hooks: RUNS_FILE (read the API response from this file instead of calling GitHub), NOW (ISO-8601 UTC).
set -uo pipefail

WORKFLOW_FILE="partee-sync.yml"
REAL_TITLE="Partee sync"
WINDOW_SECONDS=3600

out="${GITHUB_OUTPUT:-/dev/stdout}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

finish() { # $1 = true|false, $2 = line for the job summary
  echo "skip=$1" >> "$out"
  echo "$2" >> "$summary"
  echo "$2"
  exit 0
}

fail_open() { # $1 = reason
  echo "::warning::Partee sync guard: $1. Running the full sync anyway."
  finish false "No recent real sync (guard could not check: $1): running"
}

command -v jq > /dev/null 2>&1 || fail_open "jq is not available"

if [ -n "${RUNS_FILE:-}" ]; then
  runs=$(cat "$RUNS_FILE" 2> /dev/null) || fail_open "could not read the runs file"
else
  [ -n "${GITHUB_REPOSITORY:-}" ] || fail_open "GITHUB_REPOSITORY is not set"
  runs=$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?status=completed&per_page=20" 2> /dev/null) \
    || fail_open "the GitHub API call failed"
fi

now_epoch=$(date -u -d "${NOW:-now}" +%s 2> /dev/null) || fail_open "invalid clock"

printf '%s' "$runs" | jq -e '.workflow_runs | type == "array"' > /dev/null 2>&1 \
  || fail_open "unexpected response from GitHub"

hit=$(printf '%s' "$runs" | jq -r \
  --argjson now "$now_epoch" --argjson win "$WINDOW_SECONDS" \
  --arg cur "${GITHUB_RUN_ID:-}" --arg title "$REAL_TITLE" '
  [ .workflow_runs[]
    | select(type == "object" and .conclusion == "success" and .display_title == $title and ((.id | tostring) != $cur))
    | select((try (.updated_at | fromdateiso8601) catch 0) >= ($now - $win))
  ]
  | sort_by(.updated_at) | last // empty
  | "\(.updated_at)\t\(.run_number)"' 2> /dev/null) \
  || fail_open "could not evaluate the response"

if [ -n "$hit" ]; then
  ts="${hit%%$'\t'*}"
  num="${hit##*$'\t'}"
  finish true "Skipped: a real sync finished at ${ts:11:5} UTC (run #${num})"
fi
finish false "No recent real sync: running"
