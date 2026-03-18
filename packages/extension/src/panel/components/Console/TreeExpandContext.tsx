import { createContext, useContext } from 'react';

interface TreeExpandSignal {
    generation: number;
    expanded: boolean;
}

export const TreeExpandContext = createContext<TreeExpandSignal>({ generation: 0, expanded: false });

export function useTreeExpand() {
    return useContext(TreeExpandContext);
}
