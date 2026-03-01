import { describe, it, expect } from "vitest";

import { getGhostText, getMatches } from '@/lib/autocomplete';

describe('test useAutoComplete', () => {
    describe('getGhostText', () => {
        it('it should return o-back when input is g', () => {
            expect(getGhostText('g')).toEqual('o-back');
        })
        it(`it should return '' when input is ''`, () => {
            expect(getGhostText('')).toEqual('');
        })
        it(`it should return '' when input includes empty spaces`, () => {
            expect(getGhostText('   ')).toEqual('');
        })

        it(`it should return '' when input includes full command with spaces`, () => {
            expect(getGhostText('click e5')).toEqual('');
        })
    })

    describe('getMatches', () => {
        it('getMatches should return array when input is g', () => {
            expect(getMatches('g')).toEqual(['go-back', 'go-forward', 'goto']);
        })

        it('getMatches should return array when input is goto', () => {
            expect(getMatches('goto')).toEqual([]);
        })

         it(`getMatches should return empty array when input is ''`, () => {
            expect(getMatches('')).toEqual([]);
        })

    })

    describe('verify commands autocomplete', () => {
        it('getGhostText completes "ver" to "ify"', () => {
            expect(getGhostText('ver')).toEqual('ify');
        })

        it('getGhostText returns empty for full "verify"', () => {
            expect(getGhostText('verify')).toEqual('');
        })

        it('getMatches for "verify" returns verify-* variants', () => {
            const matches = getMatches('verify');
            expect(matches).toContain('verify-element');
            expect(matches).toContain('verify-no-element');
            expect(matches).toContain('verify-no-text');
            expect(matches).toContain('verify-text');
            expect(matches).toContain('verify-title');
            expect(matches).toContain('verify-url');
        })

        it('getMatches for "verify-t" returns title and text', () => {
            const matches = getMatches('verify-t');
            expect(matches).toContain('verify-text');
            expect(matches).toContain('verify-title');
            expect(matches).not.toContain('verify-url');
        })

        it('getMatches for "verify-no" returns no-text and no-element', () => {
            const matches = getMatches('verify-no');
            expect(matches).toContain('verify-no-text');
            expect(matches).toContain('verify-no-element');
            expect(matches.length).toBe(2);
        })
    })

})