import React from 'react';
import { Input, Tag } from 'antd';
import { HTTP_METHOD_COLORS } from '../../constants/http';
import type { WorkflowAvailableRequest } from '../../api/http';

interface WorkflowAddPanelProps {
  addPanelOpen: boolean;
  addPanelRef: React.RefObject<HTMLDivElement | null>;
  addSearch: string;
  setAddSearch: (value: string) => void;
  filteredAvailableRequests: WorkflowAvailableRequest[];
  addPanelPos: { x: number; y: number };
  view: { scale: number; offsetX: number; offsetY: number };
  onRequestSelect: (requestKey: string) => void;
}

export const WorkflowAddPanel: React.FC<WorkflowAddPanelProps> = ({
  addPanelOpen,
  addPanelRef,
  addSearch,
  setAddSearch,
  filteredAvailableRequests,
  addPanelPos,
  view,
  onRequestSelect,
}) => {
  if (!addPanelOpen) {
    return null;
  }

  const getAddPanelStyle = () => {
    const anchorScreenX = (addPanelPos.x - view.offsetX) * view.scale;
    const anchorScreenY = (addPanelPos.y - view.offsetY) * view.scale;
    const margin = 12;
    const gap = 14;
    const ADD_PANEL_WIDTH = 280;
    const ADD_PANEL_HEIGHT = 300;

    // We don't have access to container dimensions here, so use defaults
    return {
      left: anchorScreenX + gap,
      top: anchorScreenY - ADD_PANEL_HEIGHT / 2,
    };
  };

  return (
    <div
      ref={addPanelRef}
      className="absolute bg-white border border-gray-200 rounded-lg shadow-lg w-[280px] p-3 z-20"
      style={getAddPanelStyle()}
    >
      <Input
        size="small"
        placeholder="搜索请求"
        value={addSearch}
        onChange={(e) => setAddSearch(e.target.value)}
        className="mb-2"
      />
      <div className="max-h-[260px] overflow-auto space-y-1">
        {filteredAvailableRequests
          .map((req) => (
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
        {filteredAvailableRequests.length === 0 && (
          <div className="text-sm text-gray-500 px-2 py-3">无匹配请求</div>
        )}
      </div>
    </div>
  );
};

export default WorkflowAddPanel;
