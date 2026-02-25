import {COMMANDS} from '@/lib/commands';

export function getGhostText(input: string) :string {
        const val = input.toLowerCase();
        if(!val) return '';
        const match = COMMANDS.find(command => command.startsWith(val) && command !== val)
        if(!match) return '';
        return match.slice(input.length);
}

export function getMatches(input: string) :string[] {
       const val = input.toLowerCase();
       if(!val) return [];
       const matches = COMMANDS.filter(command => command.startsWith(val) && command !== val);
       return matches;
}