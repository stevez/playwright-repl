# MCP Thin Wrapper Specification

## Short Breakdown

Goal: add a thin stdio MCP server wrapper so external MCP clients can use Playwright automation through this repo without speaking the daemon socket protocol directly.

Scope:
- Provide a standards-friendly MCP endpoint (stdio JSON-RPC) for tool invocation.
- Forward requests to the existing Playwright daemon used by `playwright-repl`.
- Preserve existing behavior while adding validation, observability, and policy controls.

Non-goals:
- Replacing Playwright daemon internals.
- Re-implementing browser automation logic.
- Changing `playwright-repl` command semantics unless needed for MCP compatibility.

Success criteria:
- An MCP client can connect over stdio, list tools, and execute at least the core Playwright workflow (`open/goto/click/fill/snapshot/screenshot`) via the wrapper.
- Wrapper failures are explicit and actionable.
- Existing REPL behavior remains unchanged.

## Architecture Summary

Components:
- `mcp-server` (new): stdio MCP server process.
- `daemon bridge` (new): adapter layer that converts MCP tool calls to daemon `run` requests.
- Existing `DaemonConnection` (reuse): Unix socket transport.
- Existing daemon launcher and workspace/session logic (reuse).

Data flow:
1. MCP client sends `tools/list` and `tools/call` over stdio.
2. Wrapper validates request, applies policy, and maps tool name/arguments.
3. Wrapper sends daemon request via `DaemonConnection.run(...)`.
4. Wrapper normalizes daemon response into MCP tool result (text/json/image).
5. Wrapper logs structured events and returns the MCP response.

## Detailed Phases

## Phase 0: Design Lock and Contract Definition

Objectives:
- Define stable wrapper contracts before implementation.

Deliverables:
- Tool catalog contract: which tools are exposed initially and why.
- Request/response schema contract for each tool.
- Error model contract with machine-readable codes.

Tasks:
- Select initial tool set (MVP): navigation, interaction, inspection, assertions.
- Define parameter schemas (required/optional/defaults).
- Define output forms for textual vs binary results.
- Define startup behavior: auto-start daemon vs fail-fast when unavailable.

Acceptance criteria:
- Contract doc reviewed and approved.
- Each exposed tool has an unambiguous schema and output format.

## Phase 1: MCP Server Skeleton (stdio)

Objectives:
- Stand up a minimal MCP server process and lifecycle.

Deliverables:
- New entrypoint, e.g. `bin/playwright-mcp-server.mjs`.
- Core server module, e.g. `src/mcp-server.mjs`.
- Basic request router for MCP methods.

Tasks:
- Implement stdio message loop and JSON-RPC framing.
- Support MCP handshake and capability advertisement.
- Implement `tools/list` with static tool metadata.
- Implement graceful shutdown and SIGINT/SIGTERM handling.

Acceptance criteria:
- Local MCP client can connect and successfully call `tools/list`.
- Server exits cleanly with no orphan process.

## Phase 2: Daemon Bridge Integration

Objectives:
- Connect MCP tool calls to Playwright daemon execution.

Deliverables:
- Adapter module, e.g. `src/mcp-bridge.mjs`.
- Tool mapping layer from MCP `name+args` -> minimist daemon args.

Tasks:
- Reuse workspace/session discovery and `DaemonConnection`.
- Implement connection lifecycle: connect, retry, reconnect.
- Add daemon auto-start policy switch (`autoStartDaemon: true|false`).
- Map core tools:
  - `open`, `goto`, `click`, `fill`, `press`, `snapshot`, `screenshot`, `verify-*`.

Acceptance criteria:
- End-to-end tool calls execute via daemon for all MVP tools.
- Errors from missing daemon/socket are surfaced with clear remediation text.

## Phase 3: Input Validation, Error Model, and Policies

Objectives:
- Harden API behavior for safe, predictable MCP usage.

Deliverables:
- Central schema validation layer.
- Standardized wrapper error codes and messages.
- Policy engine hooks (allowlist/blocklist/timeouts).

Tasks:
- Validate all incoming args before daemon calls.
- Normalize daemon errors into wrapper errors:
  - `INVALID_ARGUMENT`
  - `DAEMON_UNAVAILABLE`
  - `DAEMON_TIMEOUT`
  - `TOOL_EXECUTION_FAILED`
  - `POLICY_DENIED`
- Add configurable per-tool timeout and concurrency limits.
- Add optional tool allowlist in config.

Acceptance criteria:
- Invalid requests fail before daemon call with deterministic errors.
- Policy-denied requests are auditable and do not hit daemon.

## Phase 4: Response Normalization and Binary Handling

Objectives:
- Return MCP-compatible outputs for text and artifacts.

Deliverables:
- Response normalization utilities.
- Screenshot handling strategy (inline bytes vs file reference).

Tasks:
- Normalize text outputs into consistent `content` entries.
- Handle screenshot/PDF outputs with explicit format metadata.
- Preserve daemon detail in structured debug fields without leaking internals by default.

Acceptance criteria:
- All MVP tools return valid MCP tool responses.
- Screenshot tool returns a format that at least one target MCP client can render.

## Phase 5: Observability and Operational Controls

Objectives:
- Make wrapper diagnosable and production-friendly.

Deliverables:
- Structured logging (JSON lines).
- Config file/env var support.
- Health diagnostics command or MCP utility tool.

Tasks:
- Log request id, tool name, duration, status, and error code.
- Add log levels (`error`, `info`, `debug`).
- Add wrapper config options:
  - `session`
  - `browser`
  - `headed`
  - `autoStartDaemon`
  - `toolTimeoutMs`
  - `allowedTools`
- Add startup diagnostics output in debug mode.

Acceptance criteria:
- Operators can trace failed calls and latency hotspots from logs.
- Wrapper behavior is reproducible via config alone.

## Phase 6: Testing and Compatibility Matrix

Objectives:
- Verify correctness across protocol behavior and runtime environments.

Deliverables:
- Unit tests for mapping, validation, and error normalization.
- Integration tests with a real daemon process.
- Compatibility notes for target MCP clients.

Tasks:
- Add unit tests for each tool mapping path.
- Add integration tests for success and failure scenarios.
- Add regression tests for reconnect and daemon restart.
- Test at least one macOS/Linux path and one Windows path assumption.

Acceptance criteria:
- Test suite covers core tool flows and critical error paths.
- Compatibility matrix documents known-working client configurations.

## Phase 7: Packaging, Docs, and Rollout

Objectives:
- Ship the wrapper with clear usage documentation.

Deliverables:
- `README.md` section: "Using as an MCP server".
- Example MCP client configuration snippets.
- Changelog/release notes entry.

Tasks:
- Add CLI help for `playwright-mcp-server` options.
- Document local and CI usage patterns.
- Provide migration notes for users currently invoking raw daemon sockets.

Acceptance criteria:
- A new user can run the wrapper from docs without code reading.
- Release notes call out limitations and roadmap items.

## Initial Tool Exposure (MVP)

Recommended initial exposed tools:
- `open`
- `goto`
- `click`
- `fill`
- `press`
- `snapshot`
- `screenshot`
- `verify-text`
- `verify-element`
- `verify-value`
- `verify-list`

Rationale:
- Covers end-to-end test flow with minimal surface area.
- Keeps implementation thin while still useful for agent workflows.
- Preserves the same keyword vocabulary users already know from `playwright-repl`.

## Risks and Mitigations

- Risk: daemon protocol drift.
  - Mitigation: isolate mapping in one bridge module and version-gate behavior.
- Risk: image/artifact response mismatch across MCP clients.
  - Mitigation: provide dual modes (inline + file path) with config fallback.
- Risk: noisy/unactionable failures from nested systems.
  - Mitigation: strong error normalization and structured logs with correlation ids.

## Open Decisions

- Whether tool names should mirror daemon names exactly or provide wrapper-friendly aliases.
- Whether the wrapper should support multi-session multiplexing in one process for v1.
- Whether auto-start daemon should be enabled by default in non-interactive environments.

## Milestone Exit Criteria

The feature is complete when:
- An MCP client can connect, list tools, and execute MVP flows reliably.
- Wrapper behavior is documented, tested, and observable.
- The thin wrapper remains thin: no duplicated browser logic, only protocol and policy translation.
