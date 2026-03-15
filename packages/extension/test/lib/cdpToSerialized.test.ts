import { describe, it, expect } from 'vitest';
import {
    fromCdpRemoteObject,
    fromCdpGetProperties,
    type CdpRemoteObject,
    type CdpPropertyDescriptor,
} from '@/components/Console/cdpToSerialized';

// ─── fromCdpRemoteObject ────────────────────────────────────────────────────

describe('fromCdpRemoteObject', () => {
    it('returns undefined type for type === "undefined"', () => {
        expect(fromCdpRemoteObject({ type: 'undefined' })).toEqual({ __type: 'undefined' });
    });

    it('returns null type for type === "object", subtype === "null"', () => {
        expect(fromCdpRemoteObject({ type: 'object', subtype: 'null' })).toEqual({ __type: 'null' });
    });

    it('returns string type', () => {
        expect(fromCdpRemoteObject({ type: 'string', value: 'hello' })).toEqual({ __type: 'string', v: 'hello' });
    });

    it('returns number type', () => {
        expect(fromCdpRemoteObject({ type: 'number', value: 42 })).toEqual({ __type: 'number', v: 42 });
    });

    it('returns boolean type', () => {
        expect(fromCdpRemoteObject({ type: 'boolean', value: true })).toEqual({ __type: 'boolean', v: true });
    });

    it('returns function type with description', () => {
        expect(fromCdpRemoteObject({ type: 'function', description: 'function myFunc() {}' }))
            .toEqual({ __type: 'function', name: 'function myFunc() {}' });
    });

    it('returns function type with (anonymous) when no description', () => {
        expect(fromCdpRemoteObject({ type: 'function' }))
            .toEqual({ __type: 'function', name: '(anonymous)' });
    });

    it('returns object type with className', () => {
        const result = fromCdpRemoteObject({ type: 'object', className: 'MyClass' });
        expect(result).toEqual({ __type: 'object', cls: 'MyClass', props: {}, objectId: undefined });
    });

    it('defaults className to Object', () => {
        const result = fromCdpRemoteObject({ type: 'object' });
        expect(result).toEqual({ __type: 'object', cls: 'Object', props: {}, objectId: undefined });
    });

    it('returns array type for subtype === "array"', () => {
        const result = fromCdpRemoteObject({ type: 'object', subtype: 'array', className: 'Array' });
        expect(result).toEqual({ __type: 'array', cls: 'Array', len: 0, props: {}, objectId: undefined });
    });

    it('includes objectId when present', () => {
        const result = fromCdpRemoteObject({ type: 'object', objectId: 'obj-123' });
        expect(result).toMatchObject({ __type: 'object', objectId: 'obj-123' });
    });

    it('populates props from preview properties', () => {
        const obj: CdpRemoteObject = {
            type: 'object',
            className: 'Object',
            preview: {
                type: 'object',
                properties: [
                    { name: 'a', type: 'string', value: 'hello' },
                    { name: 'b', type: 'number', value: '42' },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object',
            props: {
                a: { __type: 'string', v: 'hello' },
                b: { __type: 'number', v: 42 },
            },
        });
    });

    it('handles array with preview properties', () => {
        const obj: CdpRemoteObject = {
            type: 'object',
            subtype: 'array',
            className: 'Array',
            preview: {
                type: 'object',
                subtype: 'array',
                properties: [
                    { name: '0', type: 'number', value: '1' },
                    { name: '1', type: 'number', value: '2' },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({ __type: 'array', len: 2 });
    });

    // ─── Array length from description ────────────────────────────────────

    it('parses array length from description when preview is truncated', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'array', className: 'Array',
            description: 'Array(5)',
            preview: { type: 'object', subtype: 'array', properties: [
                { name: '0', type: 'number', value: '1' },
                { name: '1', type: 'number', value: '2' },
            ]},
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({ __type: 'array', len: 5 });
    });

    it('falls back to preview length when description is missing', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'array', className: 'Array',
            preview: { type: 'object', subtype: 'array', properties: [
                { name: '0', type: 'number', value: '1' },
            ]},
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({ __type: 'array', len: 1 });
    });

    it('parses length from description for [[Entries]] array with empty preview', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'array', className: 'Array',
            description: 'Array(3)',
            preview: { type: 'object', subtype: 'array', properties: [] },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({ __type: 'array', len: 3 });
    });

    // ─── Special subtypes ──────────────────────────────────────────────────

    it('returns date description for subtype === "date"', () => {
        expect(fromCdpRemoteObject({ type: 'object', subtype: 'date', className: 'Date', description: 'Fri Mar 14 2026 10:30:00 GMT+0000' }))
            .toEqual({ __type: 'string', v: 'Fri Mar 14 2026 10:30:00 GMT+0000' });
    });

    it('returns regexp description for subtype === "regexp"', () => {
        expect(fromCdpRemoteObject({ type: 'object', subtype: 'regexp', className: 'RegExp', description: '/test/gi' }))
            .toEqual({ __type: 'string', v: '/test/gi' });
    });

    it('returns error description for subtype === "error"', () => {
        expect(fromCdpRemoteObject({ type: 'object', subtype: 'error', className: 'Error', description: 'Error: something went wrong' }))
            .toEqual({ __type: 'string', v: 'Error: something went wrong' });
    });

    it('falls back for date with no description', () => {
        expect(fromCdpRemoteObject({ type: 'object', subtype: 'date', className: 'Date' }))
            .toEqual({ __type: 'string', v: '' });
    });

    it('falls back for error with no description', () => {
        expect(fromCdpRemoteObject({ type: 'object', subtype: 'error', className: 'Error' }))
            .toEqual({ __type: 'string', v: '[Error]' });
    });

    it('returns Map entries from preview', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'map', className: 'Map', description: 'Map(2)',
            preview: {
                type: 'object', subtype: 'map',
                entries: [
                    { key: { type: 'string', value: 'a' }, value: { type: 'number', value: '1' } },
                    { key: { type: 'string', value: 'b' }, value: { type: 'number', value: '2' } },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Map(2)',
            props: { a: { __type: 'number', v: 1 }, b: { __type: 'number', v: 2 } },
        });
    });

    it('returns Map entries with description-only values (real CDP format)', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'map', className: 'Map', description: 'Map(2)',
            preview: {
                type: 'object', subtype: 'map',
                entries: [
                    { key: { type: 'string', value: 'a' }, value: { type: 'number', description: '1' } },
                    { key: { type: 'string', value: 'b' }, value: { type: 'number', description: '2' } },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Map(2)',
            props: { a: { __type: 'number', v: 1 }, b: { __type: 'number', v: 2 } },
        });
    });

    it('returns Map with mixed value types', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'map', className: 'Map', description: 'Map(3)',
            preview: {
                type: 'object', subtype: 'map',
                entries: [
                    { key: { type: 'string', value: 'str' }, value: { type: 'string', value: 'hello' } },
                    { key: { type: 'string', value: 'num' }, value: { type: 'number', description: '42' } },
                    { key: { type: 'string', value: 'bool' }, value: { type: 'boolean', value: 'true' } },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Map(3)',
            props: {
                str: { __type: 'string', v: 'hello' },
                num: { __type: 'number', v: 42 },
                bool: { __type: 'boolean', v: true },
            },
        });
    });

    it('returns Map with numeric keys', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'map', className: 'Map', description: 'Map(2)',
            preview: {
                type: 'object', subtype: 'map',
                entries: [
                    { key: { type: 'number', description: '1' }, value: { type: 'string', value: 'one' } },
                    { key: { type: 'number', description: '2' }, value: { type: 'string', value: 'two' } },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Map(2)',
            props: { 1: { __type: 'string', v: 'one' }, 2: { __type: 'string', v: 'two' } },
        });
    });

    it('returns empty Map', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'map', className: 'Map', description: 'Map(0)',
            preview: { type: 'object', subtype: 'map', entries: [] },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({ __type: 'object', cls: 'Map(0)', props: {} });
    });

    it('returns Set entries from preview', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'set', className: 'Set', description: 'Set(3)',
            preview: {
                type: 'object', subtype: 'set',
                entries: [
                    { value: { type: 'number', value: '1' } },
                    { value: { type: 'number', value: '2' } },
                    { value: { type: 'number', value: '3' } },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Set(3)',
            props: { 0: { __type: 'number', v: 1 }, 1: { __type: 'number', v: 2 }, 2: { __type: 'number', v: 3 } },
        });
    });

    it('returns Set entries with description-only values', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'set', className: 'Set', description: 'Set(2)',
            preview: {
                type: 'object', subtype: 'set',
                entries: [
                    { value: { type: 'number', description: '10' } },
                    { value: { type: 'number', description: '20' } },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Set(2)',
            props: { 0: { __type: 'number', v: 10 }, 1: { __type: 'number', v: 20 } },
        });
    });

    it('returns Set with string entries', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'set', className: 'Set', description: 'Set(2)',
            preview: {
                type: 'object', subtype: 'set',
                entries: [
                    { value: { type: 'string', value: 'hello' } },
                    { value: { type: 'string', value: 'world' } },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Set(2)',
            props: { 0: { __type: 'string', v: 'hello' }, 1: { __type: 'string', v: 'world' } },
        });
    });

    it('returns empty Set', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'set', className: 'Set', description: 'Set(0)',
            preview: { type: 'object', subtype: 'set', entries: [] },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({ __type: 'object', cls: 'Set(0)', props: {} });
    });

    // ─── Promise ─────────────────────────────────────────────────────────

    it('serializes fulfilled promise', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'promise', className: 'Promise',
            description: 'Promise',
            preview: {
                type: 'object', subtype: 'promise', description: 'Promise',
                properties: [
                    { name: '[[PromiseState]]', type: 'string', value: 'fulfilled' },
                    { name: '[[PromiseResult]]', type: 'number', value: '42' },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Promise',
            props: {
                '[[PromiseState]]': { __type: 'string', v: 'fulfilled' },
                '[[PromiseResult]]': { __type: 'number', v: 42 },
            },
        });
    });

    it('serializes pending promise', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'promise', className: 'Promise',
            description: 'Promise',
            preview: {
                type: 'object', subtype: 'promise', description: 'Promise',
                properties: [
                    { name: '[[PromiseState]]', type: 'string', value: 'pending' },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Promise',
            props: { '[[PromiseState]]': { __type: 'string', v: 'pending' } },
        });
    });

    it('serializes rejected promise', () => {
        const obj: CdpRemoteObject = {
            type: 'object', subtype: 'promise', className: 'Promise',
            description: 'Promise',
            preview: {
                type: 'object', subtype: 'promise', description: 'Promise',
                properties: [
                    { name: '[[PromiseState]]', type: 'string', value: 'rejected' },
                    { name: '[[PromiseResult]]', type: 'string', value: 'Error: fail' },
                ],
            },
        };
        const result = fromCdpRemoteObject(obj);
        expect(result).toMatchObject({
            __type: 'object', cls: 'Promise',
            props: {
                '[[PromiseState]]': { __type: 'string', v: 'rejected' },
                '[[PromiseResult]]': { __type: 'string', v: 'Error: fail' },
            },
        });
    });

    // ─── Fallback types ──────────────────────────────────────────────────

    it('falls back to string for unknown types', () => {
        expect(fromCdpRemoteObject({ type: 'symbol', value: 'Symbol(x)', description: 'Symbol(x)' }))
            .toEqual({ __type: 'string', v: 'Symbol(x)' });
    });

    it('uses description when value is missing for fallback', () => {
        expect(fromCdpRemoteObject({ type: 'bigint', description: '123n' }))
            .toEqual({ __type: 'string', v: '123n' });
    });

    it('preview property: undefined', () => {
        const obj: CdpRemoteObject = {
            type: 'object',
            preview: { type: 'object', properties: [{ name: 'x', type: 'undefined' }] },
        };
        const result = fromCdpRemoteObject(obj) as any;
        expect(result.props.x).toEqual({ __type: 'undefined' });
    });

    it('preview property: null', () => {
        const obj: CdpRemoteObject = {
            type: 'object',
            preview: { type: 'object', properties: [{ name: 'x', type: 'object', subtype: 'null', value: 'null' }] },
        };
        const result = fromCdpRemoteObject(obj) as any;
        expect(result.props.x).toEqual({ __type: 'null' });
    });

    it('preview property: boolean', () => {
        const obj: CdpRemoteObject = {
            type: 'object',
            preview: { type: 'object', properties: [{ name: 'x', type: 'boolean', value: 'true' }] },
        };
        const result = fromCdpRemoteObject(obj) as any;
        expect(result.props.x).toEqual({ __type: 'boolean', v: true });
    });

    it('preview property: function', () => {
        const obj: CdpRemoteObject = {
            type: 'object',
            preview: { type: 'object', properties: [{ name: 'fn', type: 'function' }] },
        };
        const result = fromCdpRemoteObject(obj) as any;
        expect(result.props.fn).toEqual({ __type: 'function', name: 'fn' });
    });

    it('preview property: nested object as ref', () => {
        const obj: CdpRemoteObject = {
            type: 'object',
            preview: { type: 'object', properties: [{ name: 'child', type: 'object', value: 'MyClass' }] },
        };
        const result = fromCdpRemoteObject(obj) as any;
        expect(result.props.child).toEqual({ __type: 'ref', cls: 'MyClass' });
    });
});

// ─── fromCdpGetProperties ───────────────────────────────────────────────────

describe('fromCdpGetProperties', () => {
    it('converts result array into props map', () => {
        const raw = {
            result: [
                { name: 'a', value: { type: 'string', value: 'hello' } },
                { name: 'b', value: { type: 'number', value: 42 } },
            ] as CdpPropertyDescriptor[],
        };
        expect(fromCdpGetProperties(raw)).toEqual({
            a: { __type: 'string', v: 'hello' },
            b: { __type: 'number', v: 42 },
        });
    });

    it('returns empty object for null input', () => {
        expect(fromCdpGetProperties(null)).toEqual({});
    });

    it('returns empty object for undefined input', () => {
        expect(fromCdpGetProperties(undefined)).toEqual({});
    });

    it('returns empty object when result is missing', () => {
        expect(fromCdpGetProperties({})).toEqual({});
    });

    it('skips descriptors without value', () => {
        const raw = {
            result: [
                { name: 'a', value: { type: 'string', value: 'ok' } },
                { name: 'b' },
            ],
        };
        expect(fromCdpGetProperties(raw)).toEqual({
            a: { __type: 'string', v: 'ok' },
        });
    });
});
