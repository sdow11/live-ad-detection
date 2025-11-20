#!/bin/bash
# Deploy entire Live Ad Detection cluster
# This script orchestrates deployment of services and devices

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration file
INVENTORY_FILE="${INVENTORY_FILE:-$PROJECT_DIR/deployment/inventory.yaml}"

echo -e "${BLUE}"
cat << "EOF"
╔══════════════════════════════════════════════╗
║   Live Ad Detection - Full Deployment        ║
╚══════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check for inventory file
if [ ! -f "$INVENTORY_FILE" ]; then
    echo -e "${YELLOW}No inventory file found at $INVENTORY_FILE${NC}"
    echo "Creating example inventory file..."

    mkdir -p "$(dirname "$INVENTORY_FILE")"

    cat > "$INVENTORY_FILE" << 'EOF'
# Live Ad Detection Deployment Inventory

# Services (laptop or dedicated server)
services:
  host: localhost  # or IP address if remote
  deploy: true

# Head device
head_device:
  ip: 192.168.1.100
  user: pi
  ap_ssid: LiveAdDetection
  ap_password: ""
  touchscreen: true
  deploy: true

# Cluster nodes
cluster_nodes:
  - name: node-01
    ip: 192.168.1.101
    user: pi
    display: true
    display_type: oled
    deploy: true

  - name: node-02
    ip: 192.168.1.102
    user: pi
    display: false
    deploy: true

  # Add more nodes as needed
  # - name: node-03
  #   ip: 192.168.1.103
  #   user: pi
  #   deploy: false

# Deployment options
options:
  parallel: false  # Deploy nodes in parallel
  skip_tests: false  # Skip health checks
  backup: true  # Backup existing configs
EOF

    echo -e "${GREEN}Created example inventory at: $INVENTORY_FILE${NC}"
    echo "Please edit this file with your device information, then run again."
    exit 0
fi

echo -e "${YELLOW}Using inventory: $INVENTORY_FILE${NC}"
echo ""

# Parse command line arguments
DEPLOY_SERVICES=true
DEPLOY_HEAD=true
DEPLOY_NODES=true
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --services-only)
            DEPLOY_HEAD=false
            DEPLOY_NODES=false
            shift
            ;;
        --devices-only)
            DEPLOY_SERVICES=false
            shift
            ;;
        --head-only)
            DEPLOY_SERVICES=false
            DEPLOY_NODES=false
            shift
            ;;
        --nodes-only)
            DEPLOY_SERVICES=false
            DEPLOY_HEAD=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--services-only|--devices-only|--head-only|--nodes-only] [--dry-run]"
            exit 1
            ;;
    esac
done

# Function to read YAML (simple parser)
read_yaml() {
    local file=$1
    local key=$2
    grep "^$key:" "$file" | sed 's/.*: *//' | tr -d '"' || echo ""
}

# Deploy Services
if [ "$DEPLOY_SERVICES" = true ]; then
    SERVICES_HOST=$(read_yaml "$INVENTORY_FILE" "host")
    SERVICES_DEPLOY=$(read_yaml "$INVENTORY_FILE" "deploy")

    if [ "$SERVICES_DEPLOY" = "true" ]; then
        echo -e "${BLUE}=== Deploying Services ===${NC}"

        if [ "$DRY_RUN" = true ]; then
            echo "[DRY RUN] Would deploy services to: $SERVICES_HOST"
        else
            if [ "$SERVICES_HOST" = "localhost" ] || [ -z "$SERVICES_HOST" ]; then
                echo "Deploying services locally..."
                cd "$PROJECT_DIR/services"
                bash deploy_services.sh up
            else
                echo "Deploying services to remote host: $SERVICES_HOST"
                # Copy services directory and deploy remotely
                rsync -avz "$PROJECT_DIR/services/" "$SERVICES_HOST:/tmp/live-ad-services/"
                ssh "$SERVICES_HOST" "cd /tmp/live-ad-services && bash deploy_services.sh up"
            fi
            echo -e "${GREEN}✓ Services deployed${NC}"
        fi
        echo ""
    fi
fi

# Deploy Head Device
if [ "$DEPLOY_HEAD" = true ]; then
    echo -e "${BLUE}=== Deploying Head Device ===${NC}"

    # Read head device config
    HEAD_IP=$(grep -A 10 "^head_device:" "$INVENTORY_FILE" | grep "ip:" | head -1 | sed 's/.*: *//')
    HEAD_USER=$(grep -A 10 "^head_device:" "$INVENTORY_FILE" | grep "user:" | head -1 | sed 's/.*: *//')
    HEAD_DEPLOY=$(grep -A 10 "^head_device:" "$INVENTORY_FILE" | grep "deploy:" | head -1 | sed 's/.*: *//')

    if [ "$HEAD_DEPLOY" = "true" ] && [ -n "$HEAD_IP" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo "[DRY RUN] Would deploy head device to: $HEAD_IP"
        else
            echo "Deploying to head device: $HEAD_IP"
            bash "$SCRIPT_DIR/deploy_head.sh" "$HEAD_IP" --user "$HEAD_USER"
            echo -e "${GREEN}✓ Head device deployed${NC}"
        fi
    else
        echo "Head device deployment skipped (deploy: false or no IP)"
    fi
    echo ""
fi

# Deploy Cluster Nodes
if [ "$DEPLOY_NODES" = true ]; then
    echo -e "${BLUE}=== Deploying Cluster Nodes ===${NC}"

    # Extract node configurations (simplified - in production use proper YAML parser)
    node_count=0

    # This is a simplified parser - consider using yq or python for complex YAML
    grep -A 5 "  - name:" "$INVENTORY_FILE" | while read line; do
        if [[ $line =~ "- name:" ]]; then
            NODE_NAME=$(echo "$line" | sed 's/.*name: *//')
            node_count=$((node_count + 1))
            echo "Found node: $NODE_NAME"
        fi
    done

    # For now, provide manual deployment instructions
    echo "To deploy cluster nodes, use:"
    echo "  bash scripts/deploy_node.sh <node-ip> --head-ip <head-ip> --node-name <name>"
    echo ""
    echo "Or deploy individually from inventory file"
    echo ""
fi

# Health Check
if [ "$DRY_RUN" = false ]; then
    echo -e "${BLUE}=== Running Health Checks ===${NC}"

    # Check services
    if [ "$DEPLOY_SERVICES" = true ]; then
        echo -n "Checking API server... "
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗${NC}"
        fi
    fi

    # Check head device
    if [ "$DEPLOY_HEAD" = true ] && [ -n "$HEAD_IP" ]; then
        echo -n "Checking head device ($HEAD_IP)... "
        if curl -s "http://$HEAD_IP:5000/api/current" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${YELLOW}?${NC} (may still be starting)"
        fi
    fi

    echo ""
fi

# Summary
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Access Points:"
if [ "$DEPLOY_SERVICES" = true ]; then
    echo "  API Server:  http://localhost:8000"
    echo "  API Docs:    http://localhost:8000/docs"
    echo "  Dashboard:   http://localhost:3000"
    echo "  Grafana:     http://localhost:3001"
fi

if [ "$DEPLOY_HEAD" = true ] && [ -n "$HEAD_IP" ]; then
    echo "  Head Device: http://$HEAD_IP:5000"
fi

echo ""
echo "Next Steps:"
echo "  1. Register devices with API server"
echo "  2. Configure WiFi on devices"
echo "  3. Monitor cluster status in dashboard"
echo ""
