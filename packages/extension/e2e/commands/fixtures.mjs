/**
 * Command integration test fixtures.
 *
 * Launches a real Engine + CommandServer, sends commands via HTTP,
 * and asserts on actual Playwright browser behavior.
 */

import { test as base } from '@playwright/test';
import { Engine, CommandServer } from '@playwright-repl/core';

export const test = base.extend({
  // Worker-scoped: one Engine + CommandServer per worker
  engineContext: [async ({}, use) => {
    const engine = new Engine();
    await engine.start({ browser: 'chromium', headed: false });

    const server = new CommandServer(engine);
    await server.start(0); // OS-assigned port

    await use({ engine, server, port: server.port });

    await server.close();
    await engine.close();
  }, { scope: 'worker' }],

  // Test-scoped: run() helper sends commands to the real server
  run: async ({ engineContext }, use) => {
    const { port } = engineContext;

    const run = async (command) => {
      const res = await fetch(`http://localhost:${port}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: command }),
      });
      return res.json();
    };

    await use(run);
  },
});

export { expect } from '@playwright/test';
