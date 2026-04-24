import React from 'react';
import { Tag } from 'antd';
import { HTTP_METHOD_COLORS } from '../../constants/http';
import type { WorkflowAvailableRequest } from '../../api/http';

interface WorkflowAddPanelProps {
  addPanelOpen: boolean;
  addPanelRef: React.MutableRefObject<HTMLDivElement | null>;
  addPanelPos: { x: number; y: number };
  view: { scale: number; offsetX: number; offsetY: number };
  onRequestSelect: (requestKey: string) => void;
  availableRequests: WorkflowAvailableRequest[];
}

export const WorkflowAddPanel: React.FC<WorkflowAddPanelProps> = ({
  addPanelOpen,
  addPanelRef,
  addPanelPos,
  view,
  onRequestSelect,
  availableRequests,
}) => {
  if (!addPanelOpen) {
    return null;
  }

  const getAddPanelStyle = () => {
    const anchorScreenX = (addPanelPos.x - view.offsetX) * view.scale;
    const anchorScreenY = (addPanelPos.y - view.offsetY) * view.scale;
    const gap = 14;
    const ADD_PANEL_HEIGHT = 300;

    return {
      left: anchorScreenX + gap,
      top: anchorScreenY - ADD_PANEL_HEIGHT / 2,
    };
  };

  const setAddPanelNode = (node: HTMLDivElement | null) => {
    addPanelRef.current = node;
  };

  return (
    <div
      ref={setAddPanelNode}
      className="absolute bg-white border border-gray-200 rounded-lg shadow-lg w-[280px] p-3 z-20"
      style={getAddPanelStyle()}
    >
      <div className="max-h-[260px] overflow-auto space-y-1">
        {availableRequests.map((req) => (
          <div
            key={`${req.ownerUserId || 'self'}:${req.id}`}
            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
            onClick={() => onRequestSelect(`${req.ownerUserId || 'self'}:${req.id}`)}
          >
            <Tag color={HTTP_METHOD_COLORS[req.method] || 'default'} className="m-0">
              {req.method}
            </Tag>
            <span className="text-sm text-gray-800 truncate">{req.name}</span>
            {req.isPublic && req.ownerUserId ? (
              <Tag className="m-0" color="gold">
                公开
              </Tag>
            ) : null}
            {req.ownerUsername ? (
              <span className="ml-auto text-xs text-gray-400 truncate max-w-[72px]">{req.ownerUsername}</span>
            ) : null}
          </div>
        ))}
        {availableRequests.length === 0 && (
          <div className="text-sm text-gray-500 px-2 py-3">无请求可用</div>
        )}
      </div>
    </div>
  );
};

export default WorkflowAddPanel;
