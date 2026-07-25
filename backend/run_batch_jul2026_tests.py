#!/usr/bin/env python
"""
JUL2026 Test Batch Runner - Execute comprehensive workflow tests
Run with: python manage.py shell < run_batch_jul2026_tests.py
"""

import os
import sys
import django
from django.test.utils import get_runner
from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.test import TestCase
from django.test.runner import DiscoverRunner
from django.db import connection
from django.db.backends.utils import CursorWrapper

# Test imports
from tests.test_batch_jul2026_comprehensive import (
    JUL2026BatchCleanupTest,
    JUL2026CustomerRegistrationTest,
    JUL2026AmritaSubscriptionTest,
    JUL2026ProductsAndLuckyIDsTest,
    JUL2026BatchCreationTest,
    JUL2026SubscriptionWorkflowTest,
    JUL2026ComprehensiveReportTest,
)

print("\n" + "="*80)
print("🚀 JUL2026 COMPREHENSIVE TEST BATCH RUNNER")
print("="*80)

class TestRunnerJUL2026:
    def __init__(self):
        self.runner = DiscoverRunner(verbosity=2, interactive=False)
        self.test_classes = [
            ("STEP 1: Data Cleanup", JUL2026BatchCleanupTest),
            ("STEP 2: Customer Registration", JUL2026CustomerRegistrationTest),
            ("STEP 3: Amrita Customer Setup", JUL2026AmritaSubscriptionTest),
            ("STEP 4: Products & Lucky IDs", JUL2026ProductsAndLuckyIDsTest),
            ("STEP 5: Batch Creation", JUL2026BatchCreationTest),
            ("STEP 6-8: Subscription Workflow", JUL2026SubscriptionWorkflowTest),
            ("STEP 9: Final Report", JUL2026ComprehensiveReportTest),
        ]

    def run_all_tests(self):
        """Run all test steps"""
        print(f"\n📋 Test Plan:")
        for i, (name, _) in enumerate(self.test_classes, 1):
            print(f"  {i}. {name}")

        print(f"\n" + "="*80)
        print("🔄 RUNNING TESTS...")
        print("="*80)

        results = []
        for step_name, test_class in self.test_classes:
            print(f"\n{'='*80}")
            print(f"▶️  {step_name}")
            print(f"{'='*80}")

            try:
                # Run each test class
                suite = self.runner.build_suite(test_labels=[
                    f"{test_class.__module__}.{test_class.__name__}"
                ])
                result = self.runner.run_suite(suite)

                if result.wasSuccessful():
                    results.append((step_name, "✅ PASSED"))
                    print(f"✅ {step_name} - PASSED")
                else:
                    results.append((step_name, "❌ FAILED"))
                    print(f"❌ {step_name} - FAILED")
                    if result.errors:
                        print("Errors:")
                        for test, trace in result.errors:
                            print(f"  {trace}")
                    if result.failures:
                        print("Failures:")
                        for test, trace in result.failures:
                            print(f"  {trace}")

            except Exception as e:
                results.append((step_name, f"⚠️  ERROR: {str(e)}"))
                print(f"⚠️  {step_name} - ERROR: {str(e)}")

        # Print final summary
        print(f"\n{'='*80}")
        print("📊 FINAL TEST SUMMARY")
        print(f"{'='*80}\n")

        for step_name, status in results:
            print(f"  {status} - {step_name}")

        passed = sum(1 for _, status in results if "PASSED" in status)
        failed = sum(1 for _, status in results if "FAILED" in status)
        errors = sum(1 for _, status in results if "ERROR" in status)

        print(f"\n{'='*80}")
        print(f"  Total: {len(results)}")
        print(f"  ✅ Passed: {passed}")
        print(f"  ❌ Failed: {failed}")
        print(f"  ⚠️  Errors: {errors}")
        print(f"{'='*80}\n")

        if failed == 0 and errors == 0:
            print("🎉 ALL TESTS PASSED! JUL2026 BATCH READY!\n")
            return 0
        else:
            print("⚠️  SOME TESTS FAILED - CHECK OUTPUT ABOVE\n")
            return 1


if __name__ == "__main__":
    runner = TestRunnerJUL2026()
    exit_code = runner.run_all_tests()
    sys.exit(exit_code)
