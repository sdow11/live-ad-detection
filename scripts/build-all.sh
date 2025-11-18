#!/bin/bash
# Build all packages

set -e

echo "Building all packages..."

# Build Python packages
for pkg in edge-device cloud-api ml-training model-registry orchestrator; do
    if [ -d "packages/$pkg" ]; then
        echo "Building $pkg..."
        cd "packages/$pkg"
        python -m build
        cd ../..
    fi
done

# Build shared library
if [ -d "packages/shared/python-common" ]; then
    echo "Building python-common..."
    cd "packages/shared/python-common"
    python -m build
    cd ../../..
fi

# Build frontend
if [ -d "packages/frontend" ]; then
    echo "Building frontend..."
    cd "packages/frontend"
    npm run build
    cd ../..
fi

echo "All packages built successfully!"
