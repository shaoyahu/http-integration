import React from 'react';
import { Button, Input, Tag } from 'antd';
import { HTTP_METHOD_COLORS } from '../../constants/http';

interface WorkflowToolbarProps {
  nodeSearch: string;
  setNodeSearch: (value: string) => void;
  view: { scale: number; offsetX: number; offsetY: number };
  setView: React.Dispatch<React.SetStateAction<{ scale: number; offsetX: number; offsetY: number }>>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasSize: { width: number; height: number };
  selectedWorkflow: {
    id: string;
    name: string;
    requests: Array<{
      id: string;
      name: string;
      method: string;
      iconUrl?: string;
    }>;
  } | null;
  focusNode: (id: string) => void;
  clampOffset: (offset: number, viewSize: number, contentSize: number) => number;
}

export const WorkflowToolbar: React.FC<WorkflowToolbarProps> = ({
  nodeSearch,
  setNodeSearch,
  view,
  setView,
  canvasContainerRef,
  canvasSize,
  selectedWorkflow,
  focusNode,
  clampOffset,
}) => {
  return (
    <>
      {/* Node search */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm p-2 w-[260px]">
        <Input
          size="small"
          placeholder="搜索节点并定位"
          value={nodeSearch}
          onChange={(e) => setNodeSearch(e.target.value)}
        />
        {nodeSearch.trim() && selectedWorkflow && (
          <div className="mt-2 max-h-[200px] overflow-auto border border-gray-100 rounded">
            {selectedWorkflow.requests
              .filter((req) => (req.name || '').toLowerCase().includes(nodeSearch.toLowerCase()))
              .map((req) => (
                <div
                  key={req.id}
                  className="px-2 py-2 text-sm hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                  onClick={() => focusNode(req.id)}
                >
                  <Tag color={HTTP_METHOD_COLORS[req.method] || 'default'} className="m-0">
                    {req.method}
                  </Tag>
                  <span className="truncate">{req.name}</span>
                </div>
              ))}
            {selectedWorkflow.requests.filter((req) => (req.name || '').toLowerCase().includes(nodeSearch.toLowerCase())).length === 0 && (
              <div className="px-2 py-2 text-sm text-gray-500">无匹配节点</div>
            )}
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm p-2 flex items-center gap-2">
        <Button
          size="small"
          onClick={() => {
            const nextScale = Math.min(2, view.scale * 1.1);
            setView((prev) => {
              const container = canvasContainerRef.current;
              const viewWidth = container ? container.clientWidth / nextScale : canvasSize.width / nextScale;
              const viewHeight = container ? container.clientHeight / nextScale : canvasSize.height / nextScale;
              return {
                scale: nextScale,
                offsetX: clampOffset(prev.offsetX, viewWidth, canvasSize.width),
                offsetY: clampOffset(prev.offsetY, viewHeight, canvasSize.height),
              };
            });
          }}
        >
          +
        </Button>
        <Button
          size="small"
          onClick={() => {
            const nextScale = Math.max(0.5, view.scale * 0.9);
            setView((prev) => {
              const container = canvasContainerRef.current;
              const viewWidth = container ? container.clientWidth / nextScale : canvasSize.width / nextScale;
              const viewHeight = container ? container.clientHeight / nextScale : canvasSize.height / nextScale;
              return {
                scale: nextScale,
                offsetX: clampOffset(prev.offsetX, viewWidth, canvasSize.width),
                offsetY: clampOffset(prev.offsetY, viewHeight, canvasSize.height),
              };
            });
          }}
        >
          -
        </Button>
        <Button
          size="small"
          onClick={() => setView({ scale: 1, offsetX: 0, offsetY: 0 })}
        >
          重置
        </Button>
        <span className="text-xs text-gray-500 w-12 text-right">{Math.round(view.scale * 100)}%</span>
      </div>
    </>
  );
};

export default WorkflowToolbar;
