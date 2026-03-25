/**
 * Preloaded via NODE_OPTIONS --require.
 * Intercepts require('workerMain') → loads REAL workerMain, then patches
 * its create() to wrap runTestGroup with bridge/Node routing.
 *
 * Bridge-compatible tests: compile + send to bridge (fast path)
 * Node-dependent tests: real WorkerMain handles everything (normal path)
 */
'use strict';

const Module = require('module');
const origLoad = Module._load;

Module._load = function(request, parent) {
  if (typeof request === 'string' && request.includes('workerMain')) {
    console.error('[pw] patching workerMain');
    // Load the REAL workerMain
    const realModule = origLoad.call(this, request, parent);
    const origCreate = realModule.create;

    // Return patched module — wraps runTestGroup per worker
    return {
      create: function(params) {
        const worker = origCreate(params);
        const bridge = require(require('path').resolve(__dirname, 'pw-worker.cjs'));
        bridge.patchWorker(worker, params);
        return worker;
      }
    };
  }
  return origLoad.apply(this, arguments);
};
