import React from 'react';
import { Empty, Tag } from 'antd';
import Editor from '@monaco-editor/react';
import type { WorkflowRunLog } from '../../types/workflow';
import { formatResponseData } from '../../utils/response';
import { buildRunLogLayout, getRunLogNodeMap } from '../../utils/workflowEditor';

interface WorkflowRunLogViewerProps {
  log: WorkflowRunLog;
  selectedNodeId: string | null;
  onSelectNode: (requestId: string) => void;
  onNodeClickWithPosition?: (requestId: string, position: { x: number; y: number }) => void;
  nodePositions?: Record<string, { x: number; y: number }>;
  compact?: boolean;
}

const getDurationText = (durationMs: number) => (durationMs > 0 ? `${durationMs}ms` : '--');

export const WorkflowRunLogViewer: React.FC<WorkflowRunLogViewerProps> = ({
  log,
  selectedNodeId,
  onSelectNode,
  onNodeClickWithPosition,
  nodePositions,
  compact = false,
}) => {
  const nodeMap = React.useMemo(() => getRunLogNodeMap(log.nodes), [log.nodes]);
  const layout = React.useMemo(() => buildRunLogLayout(log), [log]);
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) || null : null;
  const sidebarWidthClass = compact ? 'w-[170px]' : 'w-[230px]';
  const sectionTitleClass = compact
    ? 'text-[10px] font-semibold text-gray-700 mb-1.5'
    : 'text-[11px] font-semibold text-gray-700 mb-1.5';
  const monoEditorFontSize = compact ? 10 : 11;

  const renderRelationList = (
    title: string,
    requestIds: string[],
    emptyText: string,
    accentClass: string
  ) => (
    <div>
      <div className={sectionTitleClass}>{title}</div>
      {requestIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {requestIds.map((requestId) => {
            const relatedNode = nodeMap.get(requestId);
            return (
              <button
                key={`${title}-${requestId}`}
                type="button"
                onClick={() => onSelectNode(requestId)}
                className={`rounded-full border px-2 py-1 text-left transition-colors ${accentClass}`}
              >
                <span className={compact ? 'text-[10px]' : 'text-[11px]'}>
                  {relatedNode?.requestName || requestId}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={compact ? 'text-[10px] text-gray-400' : 'text-[11px] text-gray-400'}>
          {emptyText}
        </div>
      )}
    </div>
  );

  if (log.nodes.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无节点日志" />;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`${sidebarWidthClass} flex-shrink-0 border-r border-gray-100 overflow-auto px-2.5 py-2.5`}>
        {layout.branchPaths.length > 0 ? (
          <div className="mb-3">
            <div className={sectionTitleClass}>分支路径</div>
            <div className="space-y-1.5">
              {layout.branchPaths.map((path, index) => (
                <div
                  key={`branch-path-${index}`}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5"
                >
                  <div className={compact ? 'text-[10px] text-gray-500 mb-0.5' : 'text-[11px] text-gray-500 mb-0.5'}>
                    路径 {index + 1}
                  </div>
                  <div className={compact ? 'text-[10px] text-gray-700 break-words' : 'text-[11px] text-gray-700 break-words'}>
                    {path.map((requestId) => nodeMap.get(requestId)?.requestName || requestId).join(' -> ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {layout.levels.map((level) => (
            <div key={`run-log-level-${level.level}`}>
              <div className={compact ? 'text-[10px] text-gray-400 mb-1' : 'text-[11px] text-gray-400 mb-1'}>
                第 {level.level} 层 · {level.requestIds.length} 个节点
              </div>
              <div className="space-y-1.5">
                {level.requestIds.map((requestId) => {
                  const node = nodeMap.get(requestId);
                  if (!node) {
                    return null;
                  }

                  const upstreamIds = layout.upstreamByRequestId[requestId] || [];
                  const downstreamIds = layout.downstreamByRequestId[requestId] || [];
                  const isSelected = selectedNodeId === requestId;

                  return (
                    <button
                      key={requestId}
                      type="button"
                      onClick={() => {
                        onSelectNode(requestId);
                        const pos = nodePositions?.[requestId];
                        if (onNodeClickWithPosition && pos) {
                          onNodeClickWithPosition(requestId, pos);
                        }
                      }}
                      className={`w-full rounded-xl border px-2 py-2 text-left transition-colors ${
                        isSelected
                          ? 'border-blue-300 bg-blue-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className={compact ? 'text-[10px] font-medium text-gray-800 truncate' : 'text-[11px] font-medium text-gray-800 truncate'}>
                          {node.requestName}
                        </div>
                        <div
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            node.status === 'success'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-500'
                          }`}
                        >
                          {node.statusCode ?? '--'}
                        </div>
                      </div>

                      <div className={compact ? 'mt-1 text-[10px] text-gray-500' : 'mt-1 text-[11px] text-gray-500'}>
                        {upstreamIds.length === 0
                          ? '触发起点'
                          : `上游: ${upstreamIds.map((id) => nodeMap.get(id)?.requestName || id).join(' / ')}`}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-1">
                        {downstreamIds.length > 1 ? (
                          <Tag className="m-0" color="processing">
                            分支 {downstreamIds.length}
                          </Tag>
                        ) : null}
                        {upstreamIds.length > 1 ? (
                          <Tag className="m-0" color="purple">
                            汇聚 {upstreamIds.length}
                          </Tag>
                        ) : null}
                        {downstreamIds.length === 0 ? (
                          <Tag className="m-0" color="default">
                            结束
                          </Tag>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-auto">
        {selectedNode ? (
          <div className={compact ? 'p-2.5 space-y-2.5' : 'p-3 space-y-3'}>
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="m-0" color="blue">{selectedNode.method}</Tag>
              <Tag
                className="m-0"
                color={selectedNode.status === 'success' ? 'success' : 'error'}
              >
                {selectedNode.statusCode ?? '--'}
              </Tag>
              {layout.downstreamByRequestId[selectedNode.requestId]?.length > 1 ? (
                <Tag className="m-0" color="processing">分支点</Tag>
              ) : null}
              {layout.upstreamByRequestId[selectedNode.requestId]?.length > 1 ? (
                <Tag className="m-0" color="purple">汇聚点</Tag>
              ) : null}
              <span className={compact ? 'text-[10px] text-gray-500' : 'text-[11px] text-gray-500'}>
                第 {layout.levelByRequestId[selectedNode.requestId] || 1} 层 · {getDurationText(selectedNode.durationMs)}
              </span>
            </div>

            {renderRelationList(
              '上游节点',
              layout.upstreamByRequestId[selectedNode.requestId] || [],
              '当前节点没有上游节点',
              'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300'
            )}

            {renderRelationList(
              '下游节点',
              layout.downstreamByRequestId[selectedNode.requestId] || [],
              '当前节点没有下游节点',
              'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
            )}

            <div>
              <div className={sectionTitleClass}>请求路径</div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                <div className={compact ? 'text-[10px] text-gray-700 font-mono break-all leading-relaxed' : 'text-[11px] text-gray-700 font-mono break-all leading-relaxed'}>
                  {selectedNode.url || '--'}
                </div>
              </div>
            </div>

            {Object.keys(selectedNode.requestInfo?.resolvedInputs || {}).length > 0 ? (
              <div>
                <div className={sectionTitleClass}>实际入参</div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <Editor
                    height={compact ? '80px' : '100px'}
                    defaultLanguage="json"
                    value={formatResponseData(selectedNode.requestInfo?.resolvedInputs || {})}
                    theme="vs"
                    options={{
                      minimap: { enabled: false },
                      fontSize: monoEditorFontSize,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      readOnly: true,
                      lineNumbers: 'off',
                      folding: false,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {Object.keys(selectedNode.requestInfo?.params || {}).length > 0 ? (
              <div>
                <div className={sectionTitleClass}>查询参数</div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <Editor
                    height={compact ? '72px' : '80px'}
                    defaultLanguage="json"
                    value={formatResponseData(selectedNode.requestInfo?.params || {})}
                    theme="vs"
                    options={{
                      minimap: { enabled: false },
                      fontSize: monoEditorFontSize,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      readOnly: true,
                      lineNumbers: 'off',
                      folding: false,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {Object.keys(selectedNode.requestInfo?.headers || {}).length > 0 ? (
              <div>
                <div className={sectionTitleClass}>请求头</div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <Editor
                    height={compact ? '72px' : '80px'}
                    defaultLanguage="json"
                    value={formatResponseData(selectedNode.requestInfo?.headers || {})}
                    theme="vs"
                    options={{
                      minimap: { enabled: false },
                      fontSize: monoEditorFontSize,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      readOnly: true,
                      lineNumbers: 'off',
                      folding: false,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {selectedNode.requestInfo?.body ? (
              <div>
                <div className={sectionTitleClass}>请求体</div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <Editor
                    height={compact ? '92px' : '100px'}
                    defaultLanguage="json"
                    value={
                      typeof selectedNode.requestInfo.body === 'string'
                        ? selectedNode.requestInfo.body
                        : formatResponseData(selectedNode.requestInfo.body)
                    }
                    theme="vs"
                    options={{
                      minimap: { enabled: false },
                      fontSize: monoEditorFontSize,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      readOnly: true,
                      lineNumbers: 'off',
                      folding: false,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div>
              <div className={sectionTitleClass}>响应内容</div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <Editor
                  height={compact ? '140px' : '160px'}
                  defaultLanguage="json"
                  value={formatResponseData(selectedNode.responseData)}
                  theme="vs"
                  options={{
                    minimap: { enabled: false },
                    fontSize: monoEditorFontSize,
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    readOnly: true,
                    lineNumbers: 'off',
                    folding: false,
                  }}
                />
              </div>
            </div>

            {selectedNode.error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
                <div className={compact ? 'text-[10px] font-semibold text-red-600 mb-1' : 'text-[11px] font-semibold text-red-600 mb-1'}>
                  错误信息
                </div>
                <div className={compact ? 'text-[10px] text-red-500 whitespace-pre-wrap' : 'text-[11px] text-red-500 whitespace-pre-wrap'}>
                  {selectedNode.error}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            选择节点查看详情
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowRunLogViewer;
