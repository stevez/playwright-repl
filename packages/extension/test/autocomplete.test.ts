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


})