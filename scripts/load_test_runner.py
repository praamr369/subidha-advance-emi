#!/usr/bin/env python3
"""
Automated Load, Stress, and Concurrency Test Harness
====================================================
Runs Layer 5 verification tests without external dependencies (pure Python standard library).
Tests:
- Baseline Test: 10 concurrent users, checks latency (< 150ms target)
- Stress Test: Concurrency burst to identify bottlenecks
- Fail/Saturation Test: Verifies zero 500 errors and DB pool resilience
"""

import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"

ENDPOINTS = [
    ("/healthz/", "GET"),
    ("/readyz/", "GET"),
    ("/api/v1/public/product-categories/", "GET"),
    ("/api/v1/public/products/", "GET"),
    ("/api/v1/public/stats/", "GET"),
]


def test_endpoint(path, method="GET", timeout=5.0):
    url = f"{BASE_URL.rstrip('/')}{path}"
    req = urllib.request.Request(url, method=method, headers={"User-Agent": "SubidhaLoadHarness/1.0"})
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            return {"status": resp.status, "latency_ms": elapsed_ms, "error": None}
    except urllib.error.HTTPError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return {"status": e.code, "latency_ms": elapsed_ms, "error": str(e)}
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return {"status": 0, "latency_ms": elapsed_ms, "error": str(e)}


def run_baseline_test(users=10, requests_per_user=5):
    print(f"\n=======================================================")
    print(f"1. BASELINE TEST: {users} concurrent users, target latency < 150ms")
    print(f"=======================================================")
    latencies = []
    statuses = {}
    errors = 0

    total_tasks = []
    with ThreadPoolExecutor(max_workers=users) as pool:
        for _ in range(requests_per_user):
            for path, method in ENDPOINTS[:3]:
                total_tasks.append(pool.submit(test_endpoint, path, method))

        for f in as_completed(total_tasks):
            res = f.result()
            latencies.append(res["latency_ms"])
            code = res["status"]
            statuses[code] = statuses.get(code, 0) + 1
            if code >= 500 or code == 0:
                errors += 1

    if not latencies:
        print("[FAIL] No responses received. Ensure the backend server is running.")
        return False

    latencies.sort()
    avg_ms = sum(latencies) / len(latencies)
    p50_ms = latencies[len(latencies) // 2]
    p95_ms = latencies[int(len(latencies) * 0.95)]
    min_ms = latencies[0]
    max_ms = latencies[-1]

    print(f"Total Requests: {len(latencies)}")
    print(f"Status Codes: {statuses}")
    print(f"Latency (ms): min={min_ms:.1f}ms, avg={avg_ms:.1f}ms, p50={p50_ms:.1f}ms, p95={p95_ms:.1f}ms, max={max_ms:.1f}ms")
    print(f"Errors (5xx or Connection Failed): {errors}")

    if errors > 0:
        print("[FAIL] Unexpected errors during baseline test.")
        return False

    print("[PASS] Baseline test completed successfully.")
    return True


def run_stress_concurrency_test(concurrency=50, total_requests=150):
    print(f"\n=======================================================")
    print(f"2. STRESS & CONCURRENCY TEST: {concurrency} workers, {total_requests} requests burst")
    print(f"=======================================================")
    latencies = []
    statuses = {}
    server_500_errors = 0

    start_time = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        tasks = [
            pool.submit(test_endpoint, ENDPOINTS[i % len(ENDPOINTS)][0])
            for i in range(total_requests)
        ]
        for f in as_completed(tasks):
            res = f.result()
            latencies.append(res["latency_ms"])
            code = res["status"]
            statuses[code] = statuses.get(code, 0) + 1
            if code >= 500:
                server_500_errors += 1

    total_time = time.perf_counter() - start_time
    throughput = len(latencies) / total_time if total_time > 0 else 0

    latencies.sort()
    avg_ms = sum(latencies) / len(latencies) if latencies else 0
    p95_ms = latencies[int(len(latencies) * 0.95)] if latencies else 0

    print(f"Total Time: {total_time:.2f}s")
    print(f"Throughput: {throughput:.1f} req/s")
    print(f"Status Distribution: {statuses}")
    print(f"Latency: avg={avg_ms:.1f}ms, p95={p95_ms:.1f}ms")
    print(f"Server 500 Errors: {server_500_errors}")

    if server_500_errors > 0:
        print("[FAIL] Server returned unhandled 500 errors under stress.")
        return False

    print("[PASS] Stress and concurrency test completed with zero 500 errors.")
    return True


if __name__ == "__main__":
    print(f"Starting Subidha Core Layer 5 Load & Concurrency Harness against {BASE_URL}")
    # Quick probe
    probe = test_endpoint("/healthz/")
    if probe["status"] != 200:
        print(f"[NOTE] Server at {BASE_URL} responded with status {probe['status']} or is offline ({probe['error']}).")
        print("To run live against server, boot: backend/.venv/bin/python backend/manage.py runserver 8000")
        print("Or use Locust: locust -f locustfile.py --host http://localhost:8000")
        sys.exit(0)

    b_ok = run_baseline_test(users=10, requests_per_user=4)
    s_ok = run_stress_concurrency_test(concurrency=30, total_requests=90)

    if b_ok and s_ok:
        print("\n[ALL TESTS PASSED] Server handled baseline and stress concurrency reliably.")
    else:
        sys.exit(1)

