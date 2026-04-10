/**
 * Tests for filterTypes() — filters assertion types by element tag and input type.
 */

import { describe, it, expect } from 'vitest';
import { filterTypes } from '../../src/assertView';

describe('filterTypes', () => {
  it('returns all types when no tag specified', () => {
    const types = filterTypes();
    expect(types.length).toBeGreaterThan(10);
    expect(types.map(t => t.value)).toContain('toBeVisible');
    expect(types.map(t => t.value)).toContain('toBeChecked');
    expect(types.map(t => t.value)).toContain('toHaveValue');
  });

  it('returns all types for generic elements (div, span)', () => {
    const types = filterTypes('div');
    // Should include general types but not form-specific ones
    expect(types.map(t => t.value)).toContain('toBeVisible');
    expect(types.map(t => t.value)).toContain('toContainText');
    expect(types.map(t => t.value)).not.toContain('toBeChecked');
    expect(types.map(t => t.value)).not.toContain('toHaveValue');
  });

  it('returns toHaveValue for input elements', () => {
    const types = filterTypes('input', 'text');
    expect(types.map(t => t.value)).toContain('toHaveValue');
    expect(types.map(t => t.value)).toContain('toBeChecked');
  });

  it('excludes toHaveValue for checkbox/radio (prioritizes toBeChecked)', () => {
    const checkboxTypes = filterTypes('input', 'checkbox');
    expect(checkboxTypes.map(t => t.value)).toContain('toBeChecked');
    expect(checkboxTypes.map(t => t.value)).not.toContain('toHaveValue');

    const radioTypes = filterTypes('input', 'radio');
    expect(radioTypes.map(t => t.value)).toContain('toBeChecked');
    expect(radioTypes.map(t => t.value)).not.toContain('toHaveValue');
  });

  it('returns toHaveValue for textarea', () => {
    const types = filterTypes('textarea');
    expect(types.map(t => t.value)).toContain('toHaveValue');
    expect(types.map(t => t.value)).not.toContain('toBeChecked');
  });

  it('returns toHaveValue for select', () => {
    const types = filterTypes('select');
    expect(types.map(t => t.value)).toContain('toHaveValue');
  });

  it('always includes page-level types', () => {
    const types = filterTypes('div');
    expect(types.map(t => t.value)).toContain('toHaveURL');
    expect(types.map(t => t.value)).toContain('toHaveTitle');
  });

  it('is case-insensitive for tag', () => {
    const upper = filterTypes('INPUT', 'checkbox');
    const lower = filterTypes('input', 'checkbox');
    expect(upper.map(t => t.value)).toEqual(lower.map(t => t.value));
  });
});
