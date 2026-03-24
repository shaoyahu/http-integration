import React from 'react';
import { Button, Input, Dropdown, Tag } from 'antd';
import { useWorkflowStore } from '../../store/workflowStore';
import { HTTP_METHOD_COLORS } from '../../constants/http';

interface WorkflowNodeDetailProps {
  selectedNodeId: string | null;
  selectedWorkflow: {
    id: string;
    requests: Array<{
      id: string;
      name: string;
      method: string;
      url?: string;
      inputFields?: Array<{ name: string; type?: string }>;
      outputFields?: Array<{ name: string }>;
      inputValues?: Record<string, string>;
    }>;
  } | null;
  resultsLength: number;
  onClose: () => void;
  updateWorkflowRequestInputValue: (
    workflowId: string,
    requestId: string,
    fieldName: string,
    value: string
  ) => void;
}

export const WorkflowNodeDetail: React.FC<WorkflowNodeDetailProps> = ({
  selectedNodeId,
  selectedWorkflow,
  resultsLength,
  onClose,
  updateWorkflowRequestInputValue,
}) => {
  if (!selectedNodeId || !selectedWorkflow) {
    return null;
  }

  const node = selectedWorkflow.requests.find((req) => req.id === selectedNodeId);
  if (!node) {
    return <div className="text-sm text-gray-500">未找到请求</div>;
  }

  const index = selectedWorkflow.requests.findIndex((req) => req.id === node.id);
  const previousOutputs = selectedWorkflow.requests
    .slice(0, index)
    .map((prevRequest) => ({
      requestId: prevRequest.id,
      requestName: prevRequest.name,
      outputs: prevRequest.outputFields || [],
    }));

  return (
    <div
      className="absolute top-0 w-[360px] max-h-full bg-white border-l border-gray-200 overflow-hidden flex flex-col"
      style={{ right: resultsLength > 0 ? 340 : 0 }}
    >
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="font-medium text-gray-800">请求详情</div>
        <Button size="small" onClick={onClose}>关闭</Button>
      </div>
      <div className="p-4 space-y-3 overflow-auto">
        <div>
          <div className="text-xs text-gray-500 mb-1">请求名称</div>
          <div className="text-sm font-medium text-gray-800">{node.name}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">请求方法</div>
          <Tag color={HTTP_METHOD_COLORS[node.method] || 'default'}>{node.method}</Tag>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">请求地址</div>
          <div className="text-sm text-gray-800 break-all">{node.url || '--'}</div>
        </div>
        <div className="space-y-2">
          <div className="text-xs text-gray-500">请求参数</div>
          {node.inputFields && node.inputFields.length > 0 ? (
            node.inputFields.map((field: any, fieldIndex: number) => {
              const dropdownItems = previousOutputs.flatMap((output) =>
                output.outputs.map((out: any) => ({
                  key: `${output.requestId}.${out.name}`,
                  label: `${output.requestName} / ${out.name}`,
                  value: `${output.requestId}.${out.name}`,
                }))
              );
              return (
                <div key={`${field.name}-${fieldIndex}`} className="flex items-center gap-2">
                  <div className="w-24 text-xs text-gray-600 truncate">
                    {field.name || `未命名${fieldIndex + 1}`}
                  </div>
                  <Input
                    size="small"
                    placeholder="请输入参数值"
                    value={node.inputValues?.[field.name] || ''}
                    onChange={(e) => updateWorkflowRequestInputValue(selectedWorkflow.id, node.id, field.name, e.target.value)}
                  />
                  <Dropdown
                    menu={{
                      items: dropdownItems,
                      onClick: ({ key }) => updateWorkflowRequestInputValue(selectedWorkflow.id, node.id, field.name, `{{${key}}}`),
                    }}
                    trigger={['click']}
                    disabled={dropdownItems.length === 0}
                  >
                    <Button size="small" disabled={dropdownItems.length === 0}>出参</Button>
                  </Dropdown>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-gray-500">未配置入参</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowNodeDetail;
