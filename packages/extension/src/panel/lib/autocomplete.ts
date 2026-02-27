import {COMMAND_NAMES} from '@/lib/commands';

export function getGhostText(input: string) :string {
        const val = input.toLowerCase();
        if(!val) return '';
        const match = COMMAND_NAMES.find(command => command.startsWith(val) && command !== val)
        if(!match) return '';
        return match.slice(input.length);
}

export function getMatches(input: string) :string[] {
       const val = input.toLowerCase();
       if(!val) return [];
       const matches = COMMAND_NAMES.filter(command => command.startsWith(val) && command !== val);
       return matches;
}