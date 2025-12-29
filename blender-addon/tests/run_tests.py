#!/usr/bin/env python3
"""
Unified test runner for Modelibr Blender addon.

Usage:
    python tests/run_tests.py           # Run all unit tests (no Blender)
    python tests/run_tests.py --unit    # Run unit tests only
    python tests/run_tests.py --e2e     # Run E2E tests with mock server
    python tests/run_tests.py --all     # Run unit + E2E (integration requires Blender)
    
For integration tests (require Blender):
    blender --background --python tests/integration/run_in_blender.py
"""
import argparse
import subprocess
import sys
import os


def get_project_root():
    """Get the project root directory."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_unit_tests(verbose: bool = False) -> int:
    """Run unit tests using pytest or unittest."""
    print("\n" + "="*60)
    print("UNIT TESTS")
    print("="*60 + "\n")
    
    project_root = get_project_root()
    tests_dir = os.path.join(project_root, 'tests', 'unit')
    
    # Try pytest first
    result = subprocess.run(
        ['python3', '-m', 'pytest', '--version'],
        capture_output=True
    )
    
    if result.returncode == 0:
        args = ['python3', '-m', 'pytest', tests_dir]
        if verbose:
            args.append('-v')
        result = subprocess.run(args, cwd=project_root)
        return result.returncode
    else:
        # Fallback to unittest
        print("(pytest not found, using unittest)")
        args = ['python3', '-m', 'unittest', 'discover', '-s', tests_dir]
        if verbose:
            args.append('-v')
        result = subprocess.run(args, cwd=project_root)
        return result.returncode


def run_e2e_tests(verbose: bool = False) -> int:
    """Run E2E tests with mock server."""
    print("\n" + "="*60)
    print("E2E TESTS")
    print("="*60 + "\n")
    
    project_root = get_project_root()
    tests_dir = os.path.join(project_root, 'tests', 'e2e')
    
    # Try pytest first
    result = subprocess.run(
        ['python3', '-m', 'pytest', '--version'],
        capture_output=True
    )
    
    if result.returncode == 0:
        args = ['python3', '-m', 'pytest', tests_dir]
        if verbose:
            args.append('-v')
        result = subprocess.run(args, cwd=project_root)
        return result.returncode
    else:
        # Fallback to unittest
        print("(pytest not found, using unittest)")
        args = ['python3', '-m', 'unittest', 'discover', '-s', tests_dir]
        if verbose:
            args.append('-v')
        result = subprocess.run(args, cwd=project_root)
        return result.returncode


def run_integration_tests() -> int:
    """
    Run integration tests inside Blender.
    
    This requires Blender to be installed and in PATH.
    """
    print("\n" + "="*60)
    print("INTEGRATION TESTS (requires Blender)")
    print("="*60 + "\n")
    
    project_root = get_project_root()
    test_script = os.path.join(project_root, 'tests', 'integration', 'run_in_blender.py')
    
    # Try to find Blender
    blender_cmd = 'blender'
    
    # Check if Blender is available
    try:
        subprocess.run([blender_cmd, '--version'], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("ERROR: Blender not found in PATH")
        print("Install Blender and ensure 'blender' is available in your PATH")
        print("\nAlternatively, run manually:")
        print(f"  blender --background --python {test_script}")
        return 1
    
    args = [blender_cmd, '--background', '--python', test_script]
    result = subprocess.run(args, cwd=project_root)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(
        description='Run Modelibr Blender addon tests',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('--unit', action='store_true', help='Run unit tests only')
    parser.add_argument('--e2e', action='store_true', help='Run E2E tests only')
    parser.add_argument('--integration', action='store_true', help='Run integration tests (requires Blender)')
    parser.add_argument('--all', action='store_true', help='Run all tests')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    # Default to unit tests if no option specified
    if not any([args.unit, args.e2e, args.integration, args.all]):
        args.unit = True
    
    results = []
    
    if args.unit or args.all:
        results.append(('Unit', run_unit_tests(args.verbose)))
    
    if args.e2e or args.all:
        results.append(('E2E', run_e2e_tests(args.verbose)))
    
    if args.integration or args.all:
        results.append(('Integration', run_integration_tests()))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    all_passed = True
    for name, code in results:
        status = "PASSED" if code == 0 else "FAILED"
        symbol = "✓" if code == 0 else "✗"
        print(f"  {symbol} {name}: {status}")
        if code != 0:
            all_passed = False
    
    print("="*60)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
