// ─── Last snapshot storage ──────────────────────────────────────────────────
// Shared module-level variable for the most recent snapshot YAML.
// Used by the `locator` local command to resolve element refs.

let _lastSnapshot: string | null = null;

export function setLastSnapshot(yaml: string): void {
    _lastSnapshot = yaml;
}

export function getLastSnapshot(): string | null {
    return _lastSnapshot;
}
