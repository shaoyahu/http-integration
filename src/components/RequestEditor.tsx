import React, { useEffect } from 'react';
import { Form, Input, Select, Button, Tabs, Card, Space, Row, Col, message, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, SendOutlined, ImportOutlined } from '@ant-design/icons';
import { useRequestStore } from '../store/requestStore';
import { proxyRequest, healthCheck } from '../api/http';
import Editor from '@monaco-editor/react';

const { Option } = Select;

const formatResponseData = (data: any): string => {
  if (data === null || data === undefined) {
    return '';
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) {
        return JSON.stringify(parsed, null, 2);
      }
    } catch (e) {
      return data;
    }
    return data;
  }

  if (typeof data === 'object') {
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  }

  return String(data);
};

export const RequestEditor: React.FC = () => {
  const { requests, selectedRequestId, updateRequest, deleteRequest, setSelectedRequest } = useRequestStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [requestName, setRequestName] = React.useState('');
  const [response, setResponse] = React.useState<any>(null);
  const [previousRequestId, setPreviousRequestId] = React.useState<string | null>(null);

  const selectedRequest = requests.find((req) => req.id === selectedRequestId);

  useEffect(() => {
    // 只有当实际切换请求时才清除响应结果
    if (selectedRequestId !== previousRequestId) {
      if (selectedRequest) {
        form.setFieldsValue(selectedRequest);
        setRequestName(selectedRequest.name);
        // 清除响应结果
        setResponse(null);
      } else {
        form.resetFields();
        setRequestName('');
        // 清除响应结果
        setResponse(null);
      }
      setPreviousRequestId(selectedRequestId);
    }
  }, [selectedRequest, selectedRequestId, form, previousRequestId]);

  const handleDeleteRequest = () => {
    if (!selectedRequestId) return;

    const currentIndex = requests.findIndex((req) => req.id === selectedRequestId);
    deleteRequest(selectedRequestId);
    message.success('请求已删除');

    const newRequests = requests.filter((req) => req.id !== selectedRequestId);
    if (newRequests.length > 0) {
      if (currentIndex >= newRequests.length) {
        setSelectedRequest(newRequests[newRequests.length - 1].id);
      } else {
        setSelectedRequest(newRequests[currentIndex]?.id || newRequests[0].id);
      }
    } else {
      setSelectedRequest(null);
    }
  };

  const handleRenameRequest = () => {
    if (!selectedRequestId || !requestName.trim()) {
      message.error('请输入请求名称');
      return;
    }
    updateRequest(selectedRequestId, { name: requestName.trim() });
    message.success('请求已重命名');
  };

  const handleSend = async () => {
    if (!selectedRequest || !selectedRequest.url) {
      message.error('请输入URL');
      return;
    }

    setLoading(true);
    try {
      const headers = selectedRequest.headers.reduce(
        (acc, h) => (h.key ? { ...acc, [h.key]: h.value } : acc),
        {} as Record<string, string>
      );

      const params = selectedRequest.params.reduce(
        (acc, p) => (p.key ? { ...acc, [p.key]: p.value } : acc),
        {} as Record<string, string>
      );

      let body = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(selectedRequest.method) && selectedRequest.body) {
        try {
          body = JSON.parse(selectedRequest.body);
        } catch (e) {
          body = selectedRequest.body;
        }
      }

      const result = await proxyRequest({
        url: selectedRequest.url,
        method: selectedRequest.method,
        headers,
        body,
        params,
      });

      const responseData = result.data !== undefined && result.data !== null ? result.data : result;

      setResponse({
        status: result.status || 200,
        statusText: result.statusText || 'OK',
        data: responseData,
        headers: result.headers || {},
        time: result.time,
      });
      message.success('请求成功');
    } catch (error: any) {
      const errorData = error.response?.data || error.message || '请求失败';

      setResponse({
        status: error.response?.status || 500,
        statusText: error.response?.statusText || 'Error',
        data: errorData,
        headers: error.response?.headers || {},
      });
      message.error(error.response?.data?.message || error.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddHeader = () => {
    if (selectedRequest) {
      updateRequest(selectedRequest.id, {
        headers: [...selectedRequest.headers, { key: '', value: '' }],
      });
    }
  };

  const handleRemoveHeader = (index: number) => {
    if (selectedRequest) {
      const newHeaders = [...selectedRequest.headers];
      newHeaders.splice(index, 1);
      updateRequest(selectedRequest.id, { headers: newHeaders });
    }
  };

  const handleHeaderChange = (index: number, field: 'key' | 'value', value: string) => {
    if (selectedRequest) {
      const newHeaders = [...selectedRequest.headers];
      newHeaders[index][field] = value;
      updateRequest(selectedRequest.id, { headers: newHeaders });
    }
  };

  const handleAddParam = () => {
    if (selectedRequest) {
      updateRequest(selectedRequest.id, {
        params: [...selectedRequest.params, { key: '', value: '' }],
      });
    }
  };

  const handleRemoveParam = (index: number) => {
    if (selectedRequest) {
      const newParams = [...selectedRequest.params];
      newParams.splice(index, 1);
      updateRequest(selectedRequest.id, { params: newParams });
    }
  };

  const handleParamChange = (index: number, field: 'key' | 'value', value: string) => {
    if (selectedRequest) {
      const newParams = [...selectedRequest.params];
      newParams[index][field] = value;
      updateRequest(selectedRequest.id, { params: newParams });
    }
  };

  const handleAddInputField = () => {
    if (selectedRequest) {
      updateRequest(selectedRequest.id, {
        inputFields: [...selectedRequest.inputFields, { name: '', type: 'params', required: false, description: '' }],
      });
    }
  };

  const handleRemoveInputField = (index: number) => {
    if (selectedRequest) {
      const newInputFields = [...selectedRequest.inputFields];
      newInputFields.splice(index, 1);
      updateRequest(selectedRequest.id, { inputFields: newInputFields });
    }
  };

  const handleInputChange = (index: number, field: 'name' | 'type' | 'required' | 'description', value: any) => {
    if (selectedRequest) {
      const newInputFields = [...selectedRequest.inputFields];
      newInputFields[index] = { ...newInputFields[index], [field]: value };
      updateRequest(selectedRequest.id, { inputFields: newInputFields });
    }
  };

  const handleAddOutputField = () => {
    if (selectedRequest) {
      updateRequest(selectedRequest.id, {
        outputFields: [...selectedRequest.outputFields, { name: '', path: '', description: '' }],
      });
    }
  };

  const handleRemoveOutputField = (index: number) => {
    if (selectedRequest) {
      const newOutputFields = [...selectedRequest.outputFields];
      newOutputFields.splice(index, 1);
      updateRequest(selectedRequest.id, { outputFields: newOutputFields });
    }
  };

  const handleOutputChange = (index: number, field: 'name' | 'path' | 'description', value: string) => {
    if (selectedRequest) {
      const newOutputFields = [...selectedRequest.outputFields];
      newOutputFields[index] = { ...newOutputFields[index], [field]: value };
      updateRequest(selectedRequest.id, { outputFields: newOutputFields });
    }
  };

  const extractOutputFieldsFromResponse = () => {
    if (!response || !response.data || !selectedRequest) {
      message.warning('没有有效的响应数据');
      return;
    }

    const outputFields = [];
    const visitedPaths = new Set<string>();

    const traverse = (obj: any, path: string = '') => {
      if (typeof obj !== 'object' || obj === null) return;

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          traverse(value, currentPath);
        } else {
          if (!visitedPaths.has(currentPath)) {
            outputFields.push({
              name: key,
              path: currentPath,
              description: `从响应中提取的参数: ${currentPath}`,
            });
            visitedPaths.add(currentPath);
          }
        }
      }
    };

    traverse(response.data);

    if (outputFields.length === 0) {
      message.warning('响应中没有可提取的出参字段');
      return;
    }

    updateRequest(selectedRequest.id, { 
      outputFields: [...selectedRequest.outputFields, ...outputFields] 
    });
    message.success(`已导入 ${outputFields.length} 个出参字段`);
  };

  if (!selectedRequest) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">请创建或选择一个请求</p>
      </div>
    );
  }

  const headerParamsItems = [
    {
      key: '1',
      label: 'Headers',
      className: '[&_.ant-tabs-tab]:bg-blue-50/50 [&_.ant-tabs-tab-active]:bg-blue-100 [&_.ant-tabs-tab-active]:border-b-[#1890ff] [&_.ant-tabs-tab]:border-b-transparent',
      children: (
        <div className="space-y-2">
          {selectedRequest.headers.map((header, index) => (
            <Row key={index} gutter={8} align="middle" className="p-2 hover:bg-blue-50 rounded transition-colors">
              <Col flex={2}>
                <Input
                  placeholder="Header Key"
                  value={header.key}
                  onChange={(e) => handleHeaderChange(index, 'key', e.target.value)}
                  className="border-blue-200 focus:border-blue-400"
                />
              </Col>
              <Col flex={3}>
                <Input
                  placeholder="Header Value"
                  value={header.value}
                  onChange={(e) => handleHeaderChange(index, 'value', e.target.value)}
                  className="border-blue-200 focus:border-blue-400"
                />
              </Col>
              <Col flex={1}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveHeader(index)}
                  className="hover:bg-red-50"
                />
              </Col>
            </Row>
          ))}
          <Button type="dashed" onClick={handleAddHeader} icon={<PlusOutlined />} block className="border-blue-300 text-blue-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50">
            添加 Header
          </Button>
        </div>
      ),
    },
    {
      key: '2',
      label: 'Params',
      className: '[&_.ant-tabs-tab]:bg-green-50/50 [&_.ant-tabs-tab-active]:bg-green-100 [&_.ant-tabs-tab-active]:border-b-[#52c41a] [&_.ant-tabs-tab]:border-b-transparent',
      children: (
        <div className="space-y-2">
          {selectedRequest.params.map((param, index) => (
            <Row key={index} gutter={8} align="middle" className="p-2 hover:bg-green-50 rounded transition-colors">
              <Col flex={2}>
                <Input
                  placeholder="Param Key"
                  value={param.key}
                  onChange={(e) => handleParamChange(index, 'key', e.target.value)}
                  className="border-green-200 focus:border-green-400"
                />
              </Col>
              <Col flex={3}>
                <Input
                  placeholder="Param Value"
                  value={param.value}
                  onChange={(e) => handleParamChange(index, 'value', e.target.value)}
                  className="border-green-200 focus:border-green-400"
                />
              </Col>
              <Col flex={1}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveParam(index)}
                  className="hover:bg-red-50"
                />
              </Col>
            </Row>
          ))}
          <Button type="dashed" onClick={handleAddParam} icon={<PlusOutlined />} block className="border-green-300 text-green-600 hover:border-green-400 hover:text-green-700 hover:bg-green-50">
            添加 Param
          </Button>
        </div>
      ),
    },
  ];

  const bodyTab = {
    key: '3',
    label: 'Body',
    className: '[&_.ant-tabs-tab]:bg-gray-50/50 [&_.ant-tabs-tab-active]:bg-gray-100 [&_.ant-tabs-tab-active]:border-b-[#8c8c8c] [&_.ant-tabs-tab]:border-b-transparent',
    children: (
      <div className="h-full">
        <div className="mb-2 font-medium text-gray-700">请求 Body (JSON)</div>
        <div className="w-full border border-gray-300 rounded">
          <Editor
            height="calc(100vh - 380px)"
            defaultLanguage="json"
            value={selectedRequest.body}
            onChange={(value) => {
              if (value !== undefined) {
                updateRequest(selectedRequest.id, { body: value });
              }
            }}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              formatOnPaste: true,
              formatOnType: true,
            }}
          />
        </div>
      </div>
    ),
  };

  const inputFieldsTab = {
    key: '4',
    label: '入参字段',
    className: '[&_.ant-tabs-tab]:bg-orange-50/50 [&_.ant-tabs-tab-active]:bg-orange-100 [&_.ant-tabs-tab-active]:border-b-[#fa8c16] [&_.ant-tabs-tab]:border-b-transparent',
    children: (
      <div className="space-y-2">
        {selectedRequest.inputFields.map((field, index) => (
          <Row key={index} gutter={8} align="middle" className="p-2 hover:bg-orange-50 rounded transition-colors">
            <Col flex={2}>
              <Input
                placeholder="字段名称"
                value={field.name}
                onChange={(e) => handleInputChange(index, 'name', e.target.value)}
                className="border-orange-200 focus:border-orange-400"
              />
            </Col>
            <Col flex={2}>
              <Select
                value={field.type}
                onChange={(value) => handleInputChange(index, 'type', value)}
                className="border-orange-200"
              >
                <Option value="params">Query参数</Option>
                <Option value="path">路径参数</Option>
                <Option value="body">Body参数</Option>
              </Select>
            </Col>
            <Col flex={1}>
              <Select
                value={field.required ? '必填' : '可选'}
                onChange={(value) => handleInputChange(index, 'required', value === '必填')}
                className="border-orange-200"
              >
                <Option value="必填">必填</Option>
                <Option value="可选">可选</Option>
              </Select>
            </Col>
            <Col flex={3}>
              <Input
                placeholder="描述"
                value={field.description}
                onChange={(e) => handleInputChange(index, 'description', e.target.value)}
                className="border-orange-200 focus:border-orange-400"
              />
            </Col>
            <Col flex={1}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleRemoveInputField(index)}
                className="hover:bg-red-50"
              />
            </Col>
          </Row>
        ))}
        <Button type="dashed" onClick={handleAddInputField} icon={<PlusOutlined />} block className="border-orange-300 text-orange-600 hover:border-orange-400 hover:text-orange-700 hover:bg-orange-50">
          添加入参字段
        </Button>
      </div>
    ),
  };

  const outputFieldsTab = {
    key: '5',
    label: '出参字段',
    className: '[&_.ant-tabs-tab]:bg-purple-50/50 [&_.ant-tabs-tab-active]:bg-purple-100 [&_.ant-tabs-tab-active]:border-b-[#722ed1] [&_.ant-tabs-tab]:border-b-transparent',
    children: (
      <div className="space-y-2">
        <div className="text-sm text-gray-500 mb-2 p-3 bg-purple-50 rounded">
          点击发送请求后，可以从响应数据中定义出参字段，供工作流中的后续请求使用
        </div>
        {selectedRequest.outputFields.map((field, index) => (
          <Row key={index} gutter={8} align="middle" className="p-2 hover:bg-purple-50 rounded transition-colors">
            <Col flex={2}>
              <Input
                placeholder="字段名称"
                value={field.name}
                onChange={(e) => handleOutputChange(index, 'name', e.target.value)}
                className="border-purple-200 focus:border-purple-400"
              />
            </Col>
            <Col flex={3}>
              <Input
                placeholder="JSON路径 (例: data.userId)"
                value={field.path}
                onChange={(e) => handleOutputChange(index, 'path', e.target.value)}
                className="border-purple-200 focus:border-purple-400"
              />
            </Col>
            <Col flex={3}>
              <Input
                placeholder="描述"
                value={field.description}
                onChange={(e) => handleOutputChange(index, 'description', e.target.value)}
                className="border-purple-200 focus:border-purple-400"
              />
            </Col>
            <Col flex={1}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleRemoveOutputField(index)}
                className="hover:bg-red-50"
              />
            </Col>
          </Row>
        ))}
        <Button type="dashed" onClick={handleAddOutputField} icon={<PlusOutlined />} block className="border-purple-300 text-purple-600 hover:border-purple-400 hover:text-purple-700 hover:bg-purple-50">
          添加出参字段
        </Button>
      </div>
    ),
  };

  const tabsItems = [...headerParamsItems];
  if (['POST', 'PUT', 'PATCH'].includes(selectedRequest.method)) {
    tabsItems.push(bodyTab);
  }
  tabsItems.push(inputFieldsTab);
  tabsItems.push(outputFieldsTab);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <Space>
            <Input
              value={requestName}
              onChange={(e) => setRequestName(e.target.value)}
              onPressEnter={handleRenameRequest}
              onBlur={handleRenameRequest}
              placeholder="请求名称"
              className="w-48"
            />
          </Space>
          <Popconfirm
            title="删除请求"
            description="确定要删除这个请求吗？"
            onConfirm={handleDeleteRequest}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />}>
              删除请求
            </Button>
          </Popconfirm>
        </div>
        <Row gutter={16} align="middle">
          <Col span={4}>
            <Select
              value={selectedRequest.method}
              onChange={(value) =>
                updateRequest(selectedRequest.id, { method: value })
              }
              className="w-full"
            >
              <Option value="GET">GET</Option>
              <Option value="POST">POST</Option>
              <Option value="PUT">PUT</Option>
              <Option value="DELETE">DELETE</Option>
              <Option value="PATCH">PATCH</Option>
            </Select>
          </Col>
          <Col span={16}>
            <Input
              value={selectedRequest.url}
              onChange={(e) => updateRequest(selectedRequest.id, { url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
              size="large"
            />
          </Col>
          <Col span={4}>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              className="w-full"
              size="large"
            >
              发送
            </Button>
          </Col>
        </Row>
      </Card>
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex-1 bg-white rounded-lg p-4 overflow-auto min-h-0">
          <Tabs items={tabsItems} />
        </div>
        {response && (
          <div className="bg-white rounded-lg p-4 flex flex-col min-h-0 border-t-4 border-blue-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800">响应</h3>
              <Space>
                {response.status >= 200 && response.status < 300 && (
                  <Tooltip title="从响应结果导入出参字段">
                    <Button
                      type="default"
                      size="small"
                      icon={<ImportOutlined />}
                      onClick={extractOutputFieldsFromResponse}
                    >
                      导入出参
                    </Button>
                  </Tooltip>
                )}
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  response.status >= 200 && response.status < 300
                    ? 'bg-green-100 text-green-700'
                    : response.status >= 400
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {response.status} {response.statusText || 'OK'}
                </span>
                {response.time && (
                  <span className="text-gray-500 text-sm">
                    {response.time}ms
                  </span>
                )}
              </Space>
            </div>
            <Tabs
              defaultActiveKey="body"
              items={[
                {
                  key: 'body',
                  label: 'Body',
                  children: (
                    <div className="h-full min-h-0">
                      <div className="w-full border border-gray-300 rounded bg-[#1e1e1e]">
                        <Editor
                          height="400px"
                          defaultLanguage="json"
                          value={formatResponseData(response.data)}
                          theme="vs-dark"
                          options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            readOnly: true,
                          }}
                        />
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'headers',
                  label: 'Headers',
                  children: (
                    <div className="space-y-2 bg-gray-50 p-4 rounded max-h-96 overflow-auto">
                      {response.headers && Object.keys(response.headers).length > 0 ? (
                        Object.entries(response.headers).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-3">
                            <span className="font-semibold text-gray-700 min-w-32">{key}:</span>
                            <span className="text-gray-600 break-all">{String(value)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500">无响应头</p>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
};