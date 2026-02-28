import { useEffect, useState, useRef } from 'react';

interface SplitterProps {
    editorPaneRef: React.RefObject<HTMLDivElement | null>
}
function Splitter({editorPaneRef}: SplitterProps) {
    const [isDragging, setisDragging] = useState(false);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);

    function handleMouseMove(event: MouseEvent) {
        const delta = event.clientY - dragStartY.current;
        const newHeight = dragStartHeight.current + delta;
        const minHeight = 80;
        const clamped = Math.max(minHeight, Math.min(newHeight, window.innerHeight - minHeight));
        editorPaneRef.current!.style.flex = `0 0 ${clamped}px`;
    };

    function handleMouseUp() {
        setisDragging(false);
        dragStartHeight.current = 0;
        dragStartY.current = 0;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        dragStartY.current = event.clientY;
        const editorPane = editorPaneRef.current;
        dragStartHeight.current = editorPane!.offsetHeight;
        setisDragging(true);
    }

    useEffect(() => {
      if(isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp)
      } else {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp)
      }
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }, [isDragging])
    return (
        <div
            id="splitter"
            className="h-[6px] bg-(--bg-splitter) cursor-row-resize shrink-0 flex items-center justify-center border-y border-(--border-primary)"
            onMouseDown={handleMouseDown}>
            <div
                id="splitter-handle"
                className="w-10 h-[2px] bg-(--color-splitter-handle) rounded-[1px]"
            >
            </div>
        </div>
    );
}

export default Splitter;