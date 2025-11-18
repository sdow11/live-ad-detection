#!/bin/bash
# Run all tests

set -e

echo "Running all tests..."

failed=0

# Test Python packages
for pkg in edge-device cloud-api ml-training; do
    if [ -d "packages/$pkg" ]; then
        echo "Testing $pkg..."
        cd "packages/$pkg"
        if pytest -v; then
            echo "✓ $pkg tests passed"
        else
            echo "✗ $pkg tests failed"
            failed=1
        fi
        cd ../..
    fi
done

# Test shared library
if [ -d "packages/shared/python-common" ]; then
    echo "Testing python-common..."
    cd "packages/shared/python-common"
    if pytest -v; then
        echo "✓ python-common tests passed"
    else
        echo "✗ python-common tests failed"
        failed=1
    fi
    cd ../../..
fi

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed!"
    exit 1
fi
