#!/bin/bash

# Red Pill MCP Server Start Script

set -e

# Default configuration
DEFAULT_PORT=8080
DEFAULT_LOG_LEVEL="info"
DEFAULT_CONFIG_FILE="config/production.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show help
show_help() {
    cat << EOF
Red Pill MCP Server - Start Script

Usage: $0 [OPTIONS]

Options:
    -p, --port PORT         Set server port (default: ${DEFAULT_PORT})
    -l, --log-level LEVEL   Set log level: debug, info, warn, error (default: ${DEFAULT_LOG_LEVEL})
    -c, --config FILE       Configuration file path (default: ${DEFAULT_CONFIG_FILE})
    -d, --daemon            Run as daemon
    -h, --help              Show this help message
    --dev                   Run in development mode
    --build                 Build before starting
    --clean                 Clean build artifacts before building

Environment Variables:
    MCP_PORT                Server port
    MCP_LOG_LEVEL           Log level
    MCP_MAX_CLIENTS         Maximum number of clients
    MCP_POPUP_TIMEOUT       Default popup timeout (ms)
    MCP_HEARTBEAT_INTERVAL  Heartbeat interval (ms)
    MCP_ENABLE_DIAGNOSTICS  Enable diagnostics (true/false)

Examples:
    $0                      # Start with defaults
    $0 -p 9090 -l debug     # Start on port 9090 with debug logging
    $0 --dev                # Start in development mode
    $0 --daemon             # Start as background daemon
EOF
}

# Parse command line arguments
PORT=${DEFAULT_PORT}
LOG_LEVEL=${DEFAULT_LOG_LEVEL}
CONFIG_FILE=${DEFAULT_CONFIG_FILE}
DAEMON_MODE=false
DEV_MODE=false
BUILD_FIRST=false
CLEAN_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -l|--log-level)
            LOG_LEVEL="$2"
            shift 2
            ;;
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -d|--daemon)
            DAEMON_MODE=true
            shift
            ;;
        --dev)
            DEV_MODE=true
            shift
            ;;
        --build)
            BUILD_FIRST=true
            shift
            ;;
        --clean)
            CLEAN_BUILD=true
            BUILD_FIRST=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

print_status "Starting Red Pill MCP Server..."
print_status "Project directory: $PROJECT_DIR"

# Change to project directory
cd "$PROJECT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18 or later."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
    print_error "Node.js version $REQUIRED_VERSION or later is required. Current version: v$NODE_VERSION"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
fi

# Clean build if requested
if [ "$CLEAN_BUILD" = true ]; then
    print_status "Cleaning build artifacts..."
    npm run clean
fi

# Build if requested or if dist doesn't exist
if [ "$BUILD_FIRST" = true ] || [ ! -d "dist" ]; then
    print_status "Building project..."
    npm run build
fi

# Set environment variables
export MCP_PORT=${PORT}
export MCP_LOG_LEVEL=${LOG_LEVEL}

# Additional environment variables from file if it exists
if [ -f ".env" ]; then
    print_status "Loading environment variables from .env file..."
    set -a
    source .env
    set +a
fi

# Validate port
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    print_error "Invalid port number: $PORT"
    exit 1
fi

# Check if port is available
if command -v lsof &> /dev/null; then
    if lsof -ti:$PORT &> /dev/null; then
        print_warning "Port $PORT appears to be in use"
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Create necessary directories
mkdir -p logs
mkdir -p config

# Create default config if it doesn't exist
if [ ! -f "$CONFIG_FILE" ] && [ "$CONFIG_FILE" != "${DEFAULT_CONFIG_FILE}" ]; then
    print_warning "Config file $CONFIG_FILE not found"
fi

print_status "Configuration:"
print_status "  Port: $PORT"
print_status "  Log Level: $LOG_LEVEL"
print_status "  Development Mode: $DEV_MODE"
print_status "  Daemon Mode: $DAEMON_MODE"

# Start the server
if [ "$DEV_MODE" = true ]; then
    print_status "Starting in development mode..."
    exec npm run dev
elif [ "$DAEMON_MODE" = true ]; then
    print_status "Starting as daemon..."
    
    # Create systemd service file if on Linux
    if command -v systemctl &> /dev/null; then
        cat > /tmp/red-pill-mcp.service << EOF
[Unit]
Description=Red Pill MCP Server
After=network.target

[Service]
Type=simple
User=\$(whoami)
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
Environment=MCP_PORT=$PORT
Environment=MCP_LOG_LEVEL=$LOG_LEVEL
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
        print_status "Systemd service file created at /tmp/red-pill-mcp.service"
        print_status "To install: sudo cp /tmp/red-pill-mcp.service /etc/systemd/system/"
        print_status "To start: sudo systemctl start red-pill-mcp"
        print_status "To enable: sudo systemctl enable red-pill-mcp"
    fi
    
    # Start with nohup as fallback
    nohup node dist/index.js > logs/server.log 2>&1 &
    PID=$!
    echo $PID > logs/server.pid
    print_status "Server started with PID: $PID"
    print_status "Logs: logs/server.log"
    print_status "PID file: logs/server.pid"
else
    print_status "Starting server..."
    exec node dist/index.js
fi