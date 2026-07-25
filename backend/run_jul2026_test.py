#!/usr/bin/env python
"""
Simple script to run JUL2026 test directly
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.development')
django.setup()

# Now import and run the test
from tests.test_batch_jul2026_working import JUL2026WorkingTest

if __name__ == '__main__':
    print("\n" + "="*80)
    print("RUNNING JUL2026 COMPREHENSIVE TEST BATCH")
    print("="*80 + "\n")

    test = JUL2026WorkingTest('test_jul2026_workflow')
    test.setUp()

    try:
        test.test_jul2026_workflow()
        print("\n" + "="*80)
        print("SUCCESS: JUL2026 TEST COMPLETED!")
        print("="*80 + "\n")
        sys.exit(0)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
