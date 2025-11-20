#!/bin/bash
# Deploy Live Ad Detection Services

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Deploying Live Ad Detection Services ===${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Get Docker Compose command
if command -v docker compose &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

cd "$SCRIPT_DIR"

# Parse arguments
ACTION="${1:-up}"
SERVICES="${2:-all}"

case $ACTION in
    up|start)
        echo -e "${YELLOW}Starting services...${NC}"
        if [ "$SERVICES" = "all" ]; then
            $DOCKER_COMPOSE up -d
        else
            $DOCKER_COMPOSE up -d $SERVICES
        fi
        echo ""
        echo -e "${GREEN}Services started!${NC}"
        echo ""
        echo "Available services:"
        echo "  API Server:     http://localhost:8000"
        echo "  API Docs:       http://localhost:8000/docs"
        echo "  Dashboard:      http://localhost:3000"
        echo "  Grafana:        http://localhost:3001 (admin/admin)"
        echo "  Prometheus:     http://localhost:9090"
        echo "  PostgreSQL:     localhost:5432"
        echo "  Redis:          localhost:6379"
        ;;

    down|stop)
        echo -e "${YELLOW}Stopping services...${NC}"
        $DOCKER_COMPOSE down
        echo -e "${GREEN}Services stopped${NC}"
        ;;

    restart)
        echo -e "${YELLOW}Restarting services...${NC}"
        if [ "$SERVICES" = "all" ]; then
            $DOCKER_COMPOSE restart
        else
            $DOCKER_COMPOSE restart $SERVICES
        fi
        echo -e "${GREEN}Services restarted${NC}"
        ;;

    logs)
        if [ "$SERVICES" = "all" ]; then
            $DOCKER_COMPOSE logs -f
        else
            $DOCKER_COMPOSE logs -f $SERVICES
        fi
        ;;

    ps|status)
        $DOCKER_COMPOSE ps
        ;;

    build)
        echo -e "${YELLOW}Building services...${NC}"
        if [ "$SERVICES" = "all" ]; then
            $DOCKER_COMPOSE build
        else
            $DOCKER_COMPOSE build $SERVICES
        fi
        echo -e "${GREEN}Build complete${NC}"
        ;;

    clean)
        echo -e "${YELLOW}Cleaning up...${NC}"
        $DOCKER_COMPOSE down -v
        echo -e "${GREEN}Cleanup complete (volumes removed)${NC}"
        ;;

    *)
        echo "Usage: $0 {up|down|restart|logs|ps|build|clean} [service-name]"
        echo ""
        echo "Actions:"
        echo "  up       - Start services"
        echo "  down     - Stop services"
        echo "  restart  - Restart services"
        echo "  logs     - View logs"
        echo "  ps       - Show running services"
        echo "  build    - Build/rebuild services"
        echo "  clean    - Stop and remove all data"
        echo ""
        echo "Services:"
        echo "  all (default), api-server, data-collector, dashboard,"
        echo "  postgres, redis, grafana, prometheus"
        echo ""
        echo "Examples:"
        echo "  $0 up                    # Start all services"
        echo "  $0 restart api-server    # Restart only API server"
        echo "  $0 logs data-collector   # View collector logs"
        exit 1
        ;;
esac
