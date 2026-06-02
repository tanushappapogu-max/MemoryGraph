#!/bin/bash
# MemoryGraph API — curl examples for every endpoint
# Start daemon first: npm run dev

BASE="http://127.0.0.1:3033"

echo "=== Health ==="
curl -s $BASE/api/health | python3 -m json.tool

echo -e "\n=== Ingest ==="
curl -s -X POST $BASE/api/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{"text":"Sarah from Acme asked about SOC2 compliance and data residency for EU customers.","source":"manual","title":"Demo ingest"}' \
  | python3 -m json.tool

echo -e "\n=== Live Context ==="
curl -s -X POST $BASE/api/v1/live \
  -H 'Content-Type: application/json' \
  -d '{"dialogue":"What about security compliance?"}' \
  | python3 -m json.tool

echo -e "\n=== Cluely Insight ==="
curl -s -X POST $BASE/api/v1/cluely/insight \
  -H 'Content-Type: application/json' \
  -d '{"dialogue":"How do you handle data residency?"}' \
  | python3 -m json.tool

echo -e "\n=== System Prompt Injection ==="
curl -s -X POST $BASE/api/v1/cluely/system-prompt \
  -H 'Content-Type: application/json' \
  -d '{"dialogue":"Tell me about pricing"}' \
  | python3 -m json.tool

echo -e "\n=== Hybrid Search ==="
curl -s -X POST $BASE/api/v1/hybrid-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"ROI proof for leadership","topK":5}' \
  | python3 -m json.tool

echo -e "\n=== Custom Action: Graph Summary ==="
curl -s -X POST $BASE/api/v1/cluely/action \
  -H 'Content-Type: application/json' \
  -d '{"action":"graph_summary"}' \
  | python3 -m json.tool

echo -e "\n=== Custom Action: Person Brief ==="
curl -s -X POST $BASE/api/v1/cluely/action \
  -H 'Content-Type: application/json' \
  -d '{"action":"person_brief","query":"Sarah"}' \
  | python3 -m json.tool

echo -e "\n=== Export Graph ==="
curl -s $BASE/api/v1/export | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'{d[\"counts\"][\"memories\"]} memories exported')"

echo -e "\n=== Consolidation Report ==="
curl -s $BASE/api/v1/consolidation | python3 -m json.tool
