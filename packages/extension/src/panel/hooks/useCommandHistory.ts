import { useRef } from 'react';

export default function useCommandHistory() {

    const history = useRef<string[]>([]);
    const currentIndex = useRef(0);

    function add(command :string) {
        history.current.push(command);
        currentIndex.current = history.current.length;
    }

    function goUp() {
        if(currentIndex.current > 0) {
            currentIndex.current = currentIndex.current - 1;
            return history.current[currentIndex.current];
        }
        return null;
        
    }

    function goDown() {
        if(currentIndex.current < history.current.length - 1 ) {
            currentIndex.current = currentIndex.current + 1;
            return history.current[currentIndex.current];
        }
        if(currentIndex.current === history.current.length -1) {
            currentIndex.current = history.current.length;
            return '';
        }
        
        return null;
    }

    return {
        add,
        goUp,
        goDown
    }
}