#!/bin/bash
# Health check script for Live Ad Detection cluster

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
INVENTORY_FILE="${1:-$PROJECT_DIR/deployment/inventory.yaml}"
TIMEOUT=5

echo -e "${BLUE}=== Live Ad Detection Health Check ===${NC}"
echo ""

# Function to check HTTP endpoint
check_http() {
    local url=$1
    local name=$2

    echo -n "  $name... "

    if timeout $TIMEOUT curl -s "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        return 1
    fi
}

# Function to check SSH access
check_ssh() {
    local host=$1
    local user=$2
    local name=$3

    echo -n "  $name SSH... "

    if timeout $TIMEOUT ssh -o ConnectTimeout=5 -o BatchMode=yes ${user}@${host} exit 2>/dev/null; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        return 1
    fi
}

# Check Services
echo -e "${YELLOW}Checking Services:${NC}"

SERVICES_OK=0
SERVICES_FAIL=0

check_http "http://localhost:8000/health" "API Server" && ((SERVICES_OK++)) || ((SERVICES_FAIL++))
check_http "http://localhost:8000/docs" "API Docs" && ((SERVICES_OK++)) || ((SERVICES_FAIL++))
check_http "http://localhost:3000" "Dashboard" && ((SERVICES_OK++)) || ((SERVICES_FAIL++))
check_http "http://localhost:3001" "Grafana" && ((SERVICES_OK++)) || ((SERVICES_FAIL++))
check_http "http://localhost:9090" "Prometheus" && ((SERVICES_OK++)) || ((SERVICES_FAIL++))

# Check PostgreSQL
echo -n "  PostgreSQL... "
if timeout $TIMEOUT nc -z localhost 5432 2>/dev/null; then
    echo -e "${GREEN}✓ OK${NC}"
    ((SERVICES_OK++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((SERVICES_FAIL++))
fi

# Check Redis
echo -n "  Redis... "
if timeout $TIMEOUT nc -z localhost 6379 2>/dev/null; then
    echo -e "${GREEN}✓ OK${NC}"
    ((SERVICES_OK++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((SERVICES_FAIL++))
fi

echo ""

# Check Devices (if inventory file exists)
if [ -f "$INVENTORY_FILE" ]; then
    echo -e "${YELLOW}Checking Devices:${NC}"

    DEVICES_OK=0
    DEVICES_FAIL=0

    # Check head device
    HEAD_IP=$(grep -A 10 "^head_device:" "$INVENTORY_FILE" | grep "ip:" | head -1 | sed 's/.*: *//' | tr -d ' ')
    HEAD_USER=$(grep -A 10 "^head_device:" "$INVENTORY_FILE" | grep "user:" | head -1 | sed 's/.*: *//' | tr -d ' ')

    if [ -n "$HEAD_IP" ]; then
        check_ssh "$HEAD_IP" "$HEAD_USER" "Head Device" && ((DEVICES_OK++)) || ((DEVICES_FAIL++))
        check_http "http://$HEAD_IP:5000/api/current" "Head Web Interface" && ((DEVICES_OK++)) || ((DEVICES_FAIL++))
        check_http "http://$HEAD_IP:5000/api/device/info" "Head Device Info" && ((DEVICES_OK++)) || ((DEVICES_FAIL++))
    fi

    echo ""
else
    echo -e "${YELLOW}No inventory file found, skipping device checks${NC}"
    echo ""
fi

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
echo ""

if [ $SERVICES_OK -gt 0 ]; then
    echo -e "Services:  ${GREEN}$SERVICES_OK OK${NC}, ${RED}$SERVICES_FAIL Failed${NC}"
fi

if [ -f "$INVENTORY_FILE" ]; then
    echo -e "Devices:   ${GREEN}$DEVICES_OK OK${NC}, ${RED}$DEVICES_FAIL Failed${NC}"
fi

echo ""

# Overall status
TOTAL_FAIL=$((SERVICES_FAIL + DEVICES_FAIL))

if [ $TOTAL_FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ All systems operational${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some systems are down${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check service logs: cd services && docker compose logs"
    echo "  - Check device logs: ssh user@device sudo journalctl -u live-ad-web -f"
    echo "  - Restart services: cd services && bash deploy_services.sh restart"
    exit 1
fi
