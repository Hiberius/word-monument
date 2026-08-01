#!/bin/bash
# Tell the machines a page exists or changed.
#
# Two channels, both open to anyone with a domain and neither needing an
# account, a login or an API key you have to be granted:
#
#   IndexNow  a shared endpoint that pushes URLs to Bing, Yandex, Seznam and
#             Naver at once. Ownership is proved by hosting a key file at the
#             site root, which is why the key below is a real file in public/.
#             Google does not participate.
#   Wayback   a permanent public snapshot. Worth it for a project whose whole
#             claim is permanence, and it is the only copy that survives the
#             domain lapsing.
#
# Run after deploying anything worth finding. Safe to run repeatedly.
#
#   bash scripts/announce.sh

set -uo pipefail

HOST="wordmonument.com"
KEY="3d29d811bdfa83b0cb14cbb6269b0cce"

URLS=(
  "https://$HOST/"
  "https://$HOST/monument"
  "https://$HOST/about"
  "https://$HOST/notes"
  "https://$HOST/notes/point-the-agents-at-each-other"
)

echo "==> Verifying the IndexNow key is actually served"
served=$(curl -s --max-time 20 "https://$HOST/$KEY.txt")
if [ "$served" != "$KEY" ]; then
  echo "    FAILED: https://$HOST/$KEY.txt did not return the key."
  echo "    Deploy first; IndexNow rejects a submission whose key file is missing."
  exit 1
fi
echo "    ok, key file matches"

echo "==> Submitting $((${#URLS[@]})) URLs to IndexNow"
payload=$(python3 - "$HOST" "$KEY" "${URLS[@]}" <<'PY'
import json, sys
host, key, *urls = sys.argv[1:]
print(json.dumps({
    "host": host,
    "key": key,
    "keyLocation": f"https://{host}/{key}.txt",
    "urlList": urls,
}))
PY
)
code=$(curl -s -o /tmp/indexnow-response.txt -w '%{http_code}' --max-time 30 \
  -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "$payload")
# 200 accepted, 202 accepted but key still being validated. Both are success.
case "$code" in
  200|202) echo "    accepted (HTTP $code)" ;;
  *) echo "    HTTP $code"; cat /tmp/indexnow-response.txt; echo ;;
esac

echo "==> Asking the Wayback Machine to snapshot each page"
for url in "${URLS[@]}"; do
  # save/ is rate limited and slow by design; a failure here is not worth
  # failing the script over, the page is simply not archived this run.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "https://web.archive.org/save/$url")
  printf '    %-58s %s\n' "$url" "$code"
done

echo "==> Done. Google is not on IndexNow: use Search Console for that."
