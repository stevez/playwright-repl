#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridgeRunner } from './bridge.js';
import { createEvaluateRunner } from './evaluate.js';
import { createStandaloneRunner } from './standalone.js';
import { logStartup, LOG_FILE } from './logger.js';
import { createMcpServer } from './server-factory.js';
const argv = process.argv.slice(2);
const standalone = argv.includes('--standalone');
const headed = argv.includes('--headed');
const httpMode = argv.includes('--http');
const httpPortIdx = argv.indexOf('--http-port');
const httpPort = httpPortIdx !== -1 ? parseInt(argv[httpPortIdx + 1]) : 9877;

// ─── Create runner ───────────────────────────────────────────────────────────

let runnerModule;
if (standalone) {
    // Try evaluate mode (extension + JS support), fall back to Engine (keyword only)
    try {
        runnerModule = await createEvaluateRunner(argv);
    } catch {
        runnerModule = createStandaloneRunner(headed);
    }
} else {
    runnerModule = await createBridgeRunner(argv);
}

const { runner, descriptions } = runnerModule;

const runnerMode = standalone ? 'standalone' : 'bridge';
const transportMode = httpMode ? `http:${httpPort}` : 'stdio';
logStartup(`${runnerMode}+${transportMode}`, `log → ${LOG_FILE}`);

// ─── Transport ───────────────────────────────────────────────────────────────

if (httpMode) {
    const { startHttpTransport } = await import('./http-transport.js');
    await startHttpTransport(runner, descriptions, httpPort);
} else {
    const server = createMcpServer(runner, descriptions);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
