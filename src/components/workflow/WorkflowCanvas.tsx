import React from 'react';

interface WorkflowCanvasProps {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  canvasContainerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  canvasRef,
  canvasContainerRef,
}) => {
  const setContainerNode = (node: HTMLDivElement | null) => {
    canvasContainerRef.current = node;
  };

  const setCanvasNode = (node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
  };

  return (
    <div ref={setContainerNode} className="relative h-full w-full overflow-hidden">
      <canvas ref={setCanvasNode} className="block h-full w-full" />
    </div>
  );
};

export default WorkflowCanvas;
