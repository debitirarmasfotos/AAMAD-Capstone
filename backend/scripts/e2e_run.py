#!/usr/bin/env python3
"""Simple E2E runner that starts a run, polls status, and submits an approve decision.

Runs against http://127.0.0.1:8000 by default.
"""
import json
import time
from urllib import request, error


BASE = "http://127.0.0.1:8000"


def post_start():
    req = request.Request(f"{BASE}/api/runs", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
    with request.urlopen(req) as resp:
        return json.load(resp)


def get_status(run_id: str):
    with request.urlopen(f"{BASE}/api/runs/{run_id}") as resp:
        return json.load(resp)


def post_decision(run_id: str):
    data = json.dumps({"action": "approve"}).encode()
    req = request.Request(f"{BASE}/api/runs/{run_id}/decision", data=data, headers={"Content-Type": "application/json"}, method="POST")
    with request.urlopen(req) as resp:
        return json.load(resp)


def main():
    print("E2E: starting run")
    start = post_start()
    print(json.dumps(start, indent=2))
    run_id = start.get("runId")
    if not run_id:
        print("No runId returned; aborting")
        return 2
    print("Polling status...")
    time.sleep(1)
    status = get_status(run_id)
    print(json.dumps(status, indent=2))
    if status.get("status") == "AWAITING_APPROVAL":
        print("Submitting approve decision...")
        dec = post_decision(run_id)
        print(json.dumps(dec, indent=2))
    else:
        print("Run not awaiting approval; current status:", status.get("status"))


if __name__ == "__main__":
    try:
        exit(main() or 0)
    except error.HTTPError as e:
        print("HTTP error:", e.code, e.read().decode())
        raise
    except Exception:
        raise
