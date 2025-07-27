#!/usr/bin/env node

// Start the MCP server for the Red Pill MCP extension
const { MCPServer } = require('./out/mcp-server.js');

async function startServer() {
    console.log('Starting Red Pill MCP Server...');

    const server = new MCPServer({
        port: 8080,
        host: 'localhost',
        popupTimeout: 0
    });

    try {
        await server.start();
        console.log('✅ MCP Server is running on ws://localhost:8080');
        console.log('Press Ctrl+C to stop the server');

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\nShutting down MCP Server...');
            await server.stop();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\nShutting down MCP Server...');
            await server.stop();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start MCP Server:', error);
        process.exit(1);
    }
}

startServer();
