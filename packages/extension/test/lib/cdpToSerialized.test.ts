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
