#!/bin/bash
# Bootstrap script for initial project setup

set -e

echo "========================================="
echo "Live Ad Detection - Bootstrap Script"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check Python version
echo -e "${BLUE}Checking Python version...${NC}"
python_version=$(python3 --version 2>&1 | awk '{print $2}')
required_version="3.11.0"

if [[ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]]; then
    echo -e "${RED}Error: Python 3.11+ is required (found $python_version)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python $python_version${NC}"
echo ""

# Check Node.js version (for frontend)
echo -e "${BLUE}Checking Node.js version...${NC}"
if command -v node &> /dev/null; then
    node_version=$(node --version | sed 's/v//')
    echo -e "${GREEN}✓ Node.js $node_version${NC}"
else
    echo -e "${RED}Warning: Node.js not found. Frontend development will not be available.${NC}"
fi
echo ""

# Check Docker
echo -e "${BLUE}Checking Docker...${NC}"
if command -v docker &> /dev/null; then
    docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
    echo -e "${GREEN}✓ Docker $docker_version${NC}"
else
    echo -e "${RED}Warning: Docker not found. Local services will not be available.${NC}"
fi
echo ""

# Check Docker Compose
echo -e "${BLUE}Checking Docker Compose...${NC}"
if command -v docker-compose &> /dev/null; then
    compose_version=$(docker-compose --version | awk '{print $4}' | sed 's/,//')
    echo -e "${GREEN}✓ Docker Compose $compose_version${NC}"
else
    echo -e "${RED}Warning: Docker Compose not found.${NC}"
fi
echo ""

# Install pre-commit hooks
echo -e "${BLUE}Installing pre-commit hooks...${NC}"
if command -v pre-commit &> /dev/null; then
    pre-commit install
    echo -e "${GREEN}✓ Pre-commit hooks installed${NC}"
else
    echo -e "${RED}Warning: pre-commit not installed. Run: pip install pre-commit${NC}"
fi
echo ""

# Create virtual environments for Python packages
echo -e "${BLUE}Creating virtual environments...${NC}"
for pkg in edge-device cloud-api ml-training; do
    if [ -d "packages/$pkg" ]; then
        echo "  Creating venv for $pkg..."
        cd "packages/$pkg"
        python3 -m venv venv
        cd ../..
    fi
done

# Create venv for shared python-common
if [ -d "packages/shared/python-common" ]; then
    echo "  Creating venv for python-common..."
    cd "packages/shared/python-common"
    python3 -m venv venv
    cd ../../..
fi
echo -e "${GREEN}✓ Virtual environments created${NC}"
echo ""

# Install Python development dependencies
echo -e "${BLUE}Installing development dependencies...${NC}"
pip3 install pytest pytest-cov pytest-asyncio ruff mypy black isort pre-commit build
echo -e "${GREEN}✓ Development dependencies installed${NC}"
echo ""

# Create .env files from examples if they exist
echo -e "${BLUE}Checking for .env files...${NC}"
if [ -f "infra/docker-compose/.env.example" ]; then
    if [ ! -f "infra/docker-compose/.env" ]; then
        cp infra/docker-compose/.env.example infra/docker-compose/.env
        echo -e "${GREEN}✓ Created .env file from example${NC}"
    else
        echo "  .env file already exists"
    fi
fi
echo ""

# Summary
echo "========================================="
echo -e "${GREEN}Bootstrap complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Review configuration files"
echo "  2. Run 'make install' to install dependencies"
echo "  3. Run 'make docker-compose-up' to start local services"
echo "  4. Start developing!"
echo ""
echo "For more information, see README.md"
echo ""
