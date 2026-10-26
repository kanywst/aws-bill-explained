#!/usr/bin/env bash
# Install the Playwright browsers and their system packages, retrying when
# the runner's apt mirror stalls. A healthy install takes about 40 seconds;
# a slow mirror can otherwise eat the whole job timeout on one package.
# apt keeps the .debs it already fetched, so each retry picks up where the
# last one stopped.
set -uo pipefail

for attempt in 1 2 3; do
  if timeout 180 npx playwright install --with-deps chromium firefox webkit; then
    exit 0
  fi
  echo "::warning::Browser install attempt ${attempt} failed or timed out"
  # timeout only signals npx; the apt-get it spawned through sudo outlives
  # it and holds the dpkg lock the next attempt needs.
  # Ask politely, then force it after 30 seconds so a wedged apt cannot
  # stall the job the way the mirror did.
  sudo pkill -x apt-get || true
  for _ in $(seq 15); do
    pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null || break
    sleep 2
  done
  sudo pkill -KILL -x apt-get || true
  sudo pkill -KILL -x dpkg || true
  sudo dpkg --configure -a || true
done

echo "::error::Browser install failed after 3 attempts"
exit 1
