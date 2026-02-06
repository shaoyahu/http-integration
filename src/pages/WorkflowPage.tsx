import React, { useState } from 'react';
import { Layout, Button, Input, List, Space, Popconfirm, message, Empty, Select, Tag, Modal, Tooltip } from 'antd';
import { PlusOutlined, PlayCircleOutlined, DeleteOutlined, EditOutlined, HolderOutlined, ArrowLeftOutlined, ImportOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import { useRequestStore } from '../store/requestStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { proxyRequest } from '../api/http';

const { Sider, Content } = Layout;
const { Option } = Select;

const methodColors: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

interface SortableWorkflowRequestProps {
  id: string;
  request: any;
  index: number;
  onRemove: (id: string) => void;
  onInputChange: (fieldName: string, value: string) => void;
  previousOutputs: Array<{ requestId: string; requestName: string; outputs: any[] }>;
}

interface AddRequestButtonProps {
  onAddRequest: () => void;
}

function AddRequestButton({ onAddRequest }: AddRequestButtonProps) {
  return (
    <div
      onClick={onAddRequest}
      className="flex justify-center py-2 cursor-pointer hover:bg-blue-50 transition-colors"
    >
      <PlusOutlined className="text-blue-500 text-2xl" />
    </div>
  );
}

function SortableWorkflowRequest({ id, request, index, onRemove, onInputChange, previousOutputs }: SortableWorkflowRequestProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleInputChange = (fieldName: string, value: string) => {
    onInputChange(fieldName, value);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-pointer mb-2 border border-gray-200"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600">
            <HolderOutlined />
          </div>
          <span className="text-gray-400 font-mono text-sm">#{index + 1}</span>
          <Tag color={methodColors[request.method] || 'default'} className="m-0 flex-shrink-0">
            {request.method}
          </Tag>
          <span className="font-medium text-gray-800 truncate">{request.name}</span>
        </div>
        <Popconfirm
          title="移除请求"
          description="确定要从工作流中移除这个请求吗？"
          onConfirm={() => onRemove(request.id)}
          okText="确定"
          cancelText="取消"
        >
          <DeleteOutlined className="text-gray-400 hover:text-red-500 cursor-pointer ml-2" />
        </Popconfirm>
      </div>
      <div className="mt-2 text-sm text-gray-500 truncate ml-8">
        {request.url}
      </div>
      {request.inputFields && request.inputFields.length > 0 && (
        <div className="mt-3 ml-8 space-y-2">
          <div className="text-sm font-medium text-gray-700">入参填写：</div>
          {request.inputFields.map((field: any) => (
            <div key={field.name} className="flex items-start gap-2">
              <span className="text-sm text-gray-600 min-w-32 mt-1">
                {field.name}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </span>
              <div className="flex-1 flex flex-col gap-2">
                <Input
                  size="small"
                  placeholder={`输入${field.type === 'params' ? 'Query' : field.type === 'path' ? '路径' : 'Body'}参数，或使用前置请求的出参`}
                  value={request.inputValues?.[field.name] || ''}
                  onChange={(e) => handleInputChange(field.name, e.target.value)}
                />
                {previousOutputs && previousOutputs.length > 0 && (
                  <Select
                    size="small"
                    placeholder="选择前置请求的出参"
                    onChange={(value) => handleInputChange(field.name, `{{${value}}}`)}
                    className="w-full"
                  >
                    {previousOutputs.map((output) => (
                      <Option.Group key={output.requestId} label={output.requestName}>
                        {output.outputs.map((out: any) => (
                          <Option key={`${output.requestId}.${out.name}`} value={`${output.requestId}.${out.name}`}>
                            {out.name}: {String(out.value)}
                          </Option>
                        ))}
                      </Option.Group>
                    ))}
                  </Select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const WorkflowPage: React.FC = () => {
  const navigate = useNavigate();
  const { workflows, selectedWorkflowId, addWorkflow, updateWorkflow, deleteWorkflow, setSelectedWorkflow, addRequestToWorkflow, removeRequestFromWorkflow, reorderWorkflowRequests, updateWorkflowRequestInputValue } = useWorkflowStore();
  const { requests } = useRequestStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [insertIndex, setInsertIndex] = useState(0);
  const [requestOutputs, setRequestOutputs] = useState<any[]>([]);
  const [selectedRequestIdToAdd, setSelectedRequestIdToAdd] = useState<string | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const selectedWorkflow = workflows.find((wf) => wf.id === selectedWorkflowId);

  const handleRename = (id: string, newName: string) => {
    if (newName.trim()) {
      updateWorkflow(id, { name: newName.trim() });
      message.success('工作流已重命名');
    }
    setEditingId(null);
  };

  const startEditing = (e: React.MouseEvent, wf: any) => {
    e.stopPropagation();
    setEditingId(wf.id);
    setEditingName(wf.name);
  };

const handleRunWorkflow = async () => {
    if (!selectedWorkflow || selectedWorkflow.requests.length === 0) {
      message.warning('请先添加请求到工作流');
      return;
    }

    setRunning(true);
    setResults([]);
    setRequestOutputs([]);

    try {
      const workflowResults: any[] = [];
      const localRequestOutputs: any[] = [];

      for (const [index, request] of selectedWorkflow.requests.entries()) {
        try {
          let headers = request.headers.reduce(
            (acc, h) => (h.key ? { ...acc, [h.key]: h.value } : acc),
            {} as Record<string, string>
          );

          let params = { ...request.params.reduce(
            (acc, p) => (p.key ? { ...acc, [p.key]: p.value } : acc),
            {} as Record<string, string>
          )};

          let body = request.body;

          if (request.inputFields && request.inputFields.length > 0) {
            for (const field of request.inputFields) {
              const value = request.inputValues?.[field.name];

 if (value === undefined && field.required) {
            throw new Error(`${field.name} 是必填字段`);
          }

          let processedValue = value;
          if (value && value.startsWith('{{') && value.endsWith('}}')) {
            const ref = value.slice(2, -2);
            const [requestId, fieldName] = ref.split('.');
            const refRequest = localRequestOutputs.find((output) => output.requestId === requestId);
            if (refRequest) {
              const refOutput = refRequest.outputs.find((output) => output.name === fieldName);
              if (refOutput) {
                processedValue = refOutput.value;
              }
            }
          }
          // value will be used in the outer scope, no need to reassign here

              if (value !== undefined) {
                if (field.type === 'params') {
                  params[field.name] = value;
                } else if (field.type === 'body') {
                  try {
                    const bodyObj = JSON.parse(body || '{}');
                    bodyObj[field.name] = value;
                    body = JSON.stringify(bodyObj, null, 2);
                  } catch (e) {
                    throw new Error(`Body 格式错误`);
                  }
                } else if (field.type === 'path') {
                  request.url = request.url.replace(`{${field.name}}`, value);
                }
              }
            }
          }

          let requestBody = undefined;
          if (['POST', 'PUT', 'PATCH'].includes(request.method) && body) {
            try {
              requestBody = JSON.parse(body);
            } catch (e) {
              requestBody = body;
            }
          }

          const startTime = Date.now();
          const response = await proxyRequest({
            url: request.url,
            method: request.method,
            headers,
            body: requestBody,
            params,
          });
          const time = Date.now() - startTime;

          const outputData: any = {};
          if (request.outputFields && request.outputFields.length > 0) {
            for (const field of request.outputFields) {
              try {
                const keys = field.path.split('.');
                let value = response.data;
                for (const key of keys) {
                  value = value?.[key];
                }
                outputData[field.name] = value;
              } catch (e) {
                outputData[field.name] = undefined;
              }
            }
          }

          localRequestOutputs.push({
            requestId: request.id,
            requestName: request.name,
            outputs: Object.entries(outputData).map(([key, value]) => ({
              name: key,
              value,
            })),
          });

          workflowResults.push({
            requestId: request.id,
            name: request.name,
            status: 'success',
            statusCode: response.status || 200,
            time,
            data: response.data,
          });
        } catch (error: any) {
          workflowResults.push({
            requestId: request.id,
            name: request.name,
            status: 'error',
            statusCode: error.response?.status || 500,
            time: 0,
            error: error.message,
          });
          break;
        }
      }

      setRequestOutputs(localRequestOutputs);
      setResults(workflowResults);
      message.success('工作流执行完成');
    } catch (error) {
      message.error('工作流执行失败');
    } finally {
      setRunning(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && selectedWorkflow) {
      const oldIndex = selectedWorkflow.requests.findIndex((req) => req.id === active.id);
      const newIndex = selectedWorkflow.requests.findIndex((req) => req.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderWorkflowRequests(selectedWorkflow.id, oldIndex, newIndex);
      }
    }
  };

  const handleAddRequestClick = (index: number) => {
    setInsertIndex(index);
    setSelectedRequestIdToAdd(undefined);
    setAddModalVisible(true);
  };

  const handleRequestSelect = (requestId: string) => {
    const request = requests.find((r) => r.id === requestId);
    if (request) {
      if (insertIndex === selectedWorkflow?.requests.length) {
        addRequestToWorkflow(selectedWorkflow.id, request);
      } else {
        const workflow = workflows.find((wf) => wf.id === selectedWorkflowId);
        if (workflow) {
          const newRequests = [...workflow.requests];
          newRequests.splice(insertIndex, 0, {
            ...request,
            id: Date.now().toString(),
            inputValues: {},
            inputFields: request.inputFields || [],
            outputFields: request.outputFields || [],
          });
          updateWorkflow(selectedWorkflowId, { requests: newRequests });
        }
      }
      message.success('请求已添加');
    }
    setSelectedRequestIdToAdd(undefined);
    setAddModalVisible(false);
  };

  return (
    <Layout className="min-h-screen bg-white">
      <Sider width={250} theme="light" className="border-r border-gray-200">
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            className="text-gray-500 hover:text-gray-700"
          />
          <h2 className="text-lg font-semibold text-gray-800 margin-0">工作流</h2>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-t border-gray-200">
            <div
              onClick={() => addWorkflow()}
              className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <PlusOutlined />
              <span>添加工作流</span>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                onClick={() => setSelectedWorkflow(wf.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-blue-50 ${
                  selectedWorkflowId === wf.id ? 'bg-blue-100 border-l-4 border-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {editingId === wf.id ? (
                      <Input
                        size="small"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onPressEnter={() => handleRename(wf.id, editingName)}
                        onBlur={() => handleRename(wf.id, editingName)}
                        autoFocus
                        className="flex-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate font-medium">{wf.name}</span>
                    )}
                  </div>
                  <div className="flex items-center flex-shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                    <EditOutlined
                      className="text-gray-400 hover:text-blue-500"
                      onClick={(e) => startEditing(e, wf)}
                    />
                    <Popconfirm
                      title="删除工作流"
                      description="确定要删除这个工作流吗？"
                      onConfirm={() => deleteWorkflow(wf.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <DeleteOutlined className="ml-2 text-gray-400 hover:text-red-500" />
                    </Popconfirm>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {wf.requests.length} 个请求
                </div>
              </div>
            ))}
          </div>
        </div>
      </Sider>

      <Content className="flex-1 overflow-auto bg-[#f5f5f5]">
        <div className="p-6 h-full flex flex-col">
          {selectedWorkflow ? (
            <>
              <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-800">{selectedWorkflow.name}</h3>
                  <Space>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={handleRunWorkflow}
                      loading={running}
                      size="large"
                    >
                      运行工作流
                    </Button>
                  </Space>
                </div>
              </div>

              <div className="flex gap-4 flex-1 min-h-0">
                <div className="flex-1 overflow-auto">
                  <h4 className="text-gray-700 font-medium mb-3">工作流请求</h4>
                  {selectedWorkflow.requests.length === 0 ? (
                    <Empty
                      description="暂无请求，点击下方按钮添加"
                      className="mt-8"
                    />
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={selectedWorkflow.requests.map((req) => req.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {selectedWorkflow.requests.map((req, index) => (
                          <React.Fragment key={req.id}>
                            <SortableWorkflowRequest
                              id={req.id}
                              request={req}
                              index={index}
                              onRemove={(id) => {
                                removeRequestFromWorkflow(selectedWorkflow.id, id);
                                message.success('请求已移除');
                              }}
                              onInputChange={(fieldName, value) => {
                                updateWorkflowRequestInputValue(selectedWorkflow.id, req.id, fieldName, value);
                              }}
                              previousOutputs={requestOutputs.slice(0, index)}
                            />
                            <AddRequestButton onAddRequest={() => handleAddRequestClick(index + 1)} />
                          </React.Fragment>
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>

                {results.length > 0 && (
                  <div className="flex-1 bg-white rounded-lg p-4 shadow-sm overflow-auto">
                    <h4 className="text-gray-700 font-medium mb-3">执行结果</h4>
                    <List
                      dataSource={results}
                      renderItem={(result) => (
                        <List.Item className="border-b border-gray-100 last:border-0">
                          <div className="w-full">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{result.name}</span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    result.status === 'success'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-500'
                                  }`}
                                >
                                  {result.statusCode}
                                </span>
                                {result.status === 'success' && (
                                  <Tooltip title="从响应结果导入出参字段">
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<ImportOutlined />}
                                      onClick={() => {
                                        if (result.data) {
                                          const workflow = workflows.find((wf) => wf.id === selectedWorkflowId);
                                          if (workflow) {
                                            const request = workflow.requests.find((req) => req.id === result.requestId);
                                            if (request) {
                                              useWorkflowStore.getState().addOutputFieldsFromResponse(selectedWorkflowId, request.id, result.data);
                                              message.success(`已为 ${request.name} 导入 ${Object.keys(result.data).length} 个出参字段`);
                                            }
                                          }
                                        }
                                      }}
                                    >
                                      导入出参
                                    </Button>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-gray-500">
                              状态: {result.status === 'success' ? '成功' : '失败'}
                              {result.time > 0 && ` · 耗时: ${result.time}ms`}
                            </div>
                            {result.error && (
                              <div className="text-sm text-red-500 mt-1">
                                错误: {result.error}
                              </div>
                            )}
                          </div>
                        </List.Item>
                      )}
                    />
              </div>
             )}
            </div>
          </>
        ) : (
          <Empty description="请创建或选择一个工作流" />
        )}
        </div>

        <Modal
          title="选择要添加的请求"
          open={addModalVisible}
          onCancel={() => {
            setSelectedRequestIdToAdd(undefined);
            setAddModalVisible(false);
          }}
          footer={null}
          width={500}
        >
          <Select
            showSearch
            placeholder="选择要添加的请求（支持搜索）"
            style={{ width: '100%' }}
            size="large"
            value={selectedRequestIdToAdd}
            onChange={setSelectedRequestIdToAdd}
            filterOption={(input, option) => {
              const request = requests.find((r) => r.id === option?.value);
              return request?.name.toLowerCase().includes(input.toLowerCase()) ?? false;
            }}
            onSelect={handleRequestSelect}
          >
            {requests.map((req) => (
              <Option key={req.id} value={req.id}>
                <Tag color={methodColors[req.method] || 'default'} className="mr-1">
                  {req.method}
                </Tag>
                {req.name}
              </Option>
            ))}
          </Select>
        </Modal>
      </Content>
    </Layout>
  );
};
