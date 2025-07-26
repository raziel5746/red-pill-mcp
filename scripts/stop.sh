#!/bin/bash

# Red Pill MCP Server Stop Script

set -e

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

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

print_status "Stopping Red Pill MCP Server..."

# Change to project directory
cd "$PROJECT_DIR"

# Function to stop server by PID file
stop_by_pid_file() {
    local pid_file="$1"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping server with PID: $pid"
            kill "$pid"
            
            # Wait for process to stop
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 30 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            if kill -0 "$pid" 2>/dev/null; then
                print_warning "Process did not stop gracefully, forcing..."
                kill -9 "$pid"
            fi
            
            rm -f "$pid_file"
            print_status "Server stopped successfully"
            return 0
        else
            print_warning "PID file exists but process is not running"
            rm -f "$pid_file"
            return 1
        fi
    else
        return 1
    fi
}

# Function to stop server by process name
stop_by_process_name() {
    local processes=$(pgrep -f "red-pill-mcp\|dist/index.js" 2>/dev/null || true)
    
    if [ -n "$processes" ]; then
        print_status "Found running processes: $processes"
        
        for pid in $processes; do
            if kill -0 "$pid" 2>/dev/null; then
                print_status "Stopping process: $pid"
                kill "$pid"
                
                # Wait for process to stop
                local count=0
                while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                    sleep 1
                    count=$((count + 1))
                done
                
                if kill -0 "$pid" 2>/dev/null; then
                    print_warning "Process $pid did not stop gracefully, forcing..."
                    kill -9 "$pid"
                fi
            fi
        done
        
        print_status "All processes stopped"
        return 0
    else
        return 1
    fi
}

# Function to stop systemd service
stop_systemd_service() {
    if command -v systemctl &> /dev/null; then
        if systemctl is-active --quiet red-pill-mcp 2>/dev/null; then
            print_status "Stopping systemd service..."
            sudo systemctl stop red-pill-mcp
            print_status "Systemd service stopped"
            return 0
        fi
    fi
    return 1
}

# Try different methods to stop the server
stopped=false

# Method 1: Stop systemd service
if stop_systemd_service; then
    stopped=true
fi

# Method 2: Stop by PID file
if [ "$stopped" = false ]; then
    if stop_by_pid_file "logs/server.pid"; then
        stopped=true
    fi
fi

# Method 3: Stop by process name
if [ "$stopped" = false ]; then
    if stop_by_process_name; then
        stopped=true
    fi
fi

# Method 4: Stop by port (find process using the port)
if [ "$stopped" = false ]; then
    local port=${MCP_PORT:-8080}
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ -n "$pid" ]; then
        print_status "Found process using port $port: $pid"
        kill "$pid"
        sleep 2
        
        if kill -0 "$pid" 2>/dev/null; then
            print_warning "Process did not stop gracefully, forcing..."
            kill -9 "$pid"
        fi
        
        print_status "Server stopped (was using port $port)"
        stopped=true
    fi
fi

if [ "$stopped" = false ]; then
    print_warning "No running Red Pill MCP Server found"
    exit 1
else
    print_status "Red Pill MCP Server stopped successfully"
fi

# Clean up any remaining files
if [ -f "logs/server.pid" ]; then
    rm -f "logs/server.pid"
fi

# Check if any processes are still running
remaining=$(pgrep -f "red-pill-mcp\|dist/index.js" 2>/dev/null || true)
if [ -n "$remaining" ]; then
    print_warning "Some processes may still be running: $remaining"
else
    print_status "All processes cleaned up"
fi