import React, { useEffect } from 'react';
import { Form, Input, Select, Button, Tabs, Card, Space, Row, Col, message, Drawer } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useRequestStore } from '../store/requestStore';
import { proxyRequest } from '../api/http';
import Editor from '@monaco-editor/react';
import { applyPathMapping, parseBodyValue, setNestedValue } from '../utils/requestPayload';

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

const parseResponseData = (data: any): any | null => {
  if (data === null || data === undefined) return null;
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
};

const hasPathPlaceholder = (url: string, key: string) => url.includes(`{${key}}`) || url.includes(`:${key}`);

export const RequestEditor: React.FC = () => {
  const { requests, selectedRequestId, updateRequest } = useRequestStore();
  const [testForm] = Form.useForm();
  const [testLoading, setTestLoading] = React.useState(false);
  const [requestName, setRequestName] = React.useState('');
  const [response, setResponse] = React.useState<any>(null);
  const [previousRequestId, setPreviousRequestId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activeTestTab, setActiveTestTab] = React.useState<'inputs' | 'results'>('inputs');
  const [curlPreview, setCurlPreview] = React.useState('');

  const selectedRequest = requests.find((req) => req.id === selectedRequestId);

  useEffect(() => {
    // 只有当实际切换请求时才清除响应结果
    if (selectedRequestId !== previousRequestId) {
      if (selectedRequest) {
        setRequestName(selectedRequest.name);
        // 清除响应结果
        setResponse(null);
      } else {
        setRequestName('');
        // 清除响应结果
        setResponse(null);
      }
      setPreviousRequestId(selectedRequestId);
    }
  }, [selectedRequest, selectedRequestId, previousRequestId]);

  useEffect(() => {
    if (drawerOpen && selectedRequest) {
      const initialValues = selectedRequest.inputFields.reduce((acc, field, index) => {
        const key = field.name || `field_${index + 1}`;
        acc[key] = field.value ?? '';
        return acc;
      }, {} as Record<string, string>);
      testForm.setFieldsValue(initialValues);
      setActiveTestTab('inputs');
    }
  }, [drawerOpen, selectedRequest, testForm]);

  const handleRenameRequest = () => {
    if (!selectedRequestId || !requestName.trim()) {
      message.error('请输入请求名称');
      return;
    }
    updateRequest(selectedRequestId, { name: requestName.trim() });
    message.success('请求已重命名');
  };

  const handleImportOutputFields = () => {
    if (!response || !selectedRequest) return;
    const parsed = parseResponseData(response.data);
    if (!parsed) {
      message.warning('响应结果不是有效的 JSON 对象');
      return;
    }

    const outputFields: Array<{ name: string; path: string; description: string }> = [];
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

    traverse(parsed);

    if (outputFields.length === 0) {
      message.warning('响应中没有可提取的出参字段');
      return;
    }

    updateRequest(selectedRequest.id, {
      outputFields: [...selectedRequest.outputFields, ...outputFields],
    });
    message.success(`已导入 ${outputFields.length} 个出参字段`);
  };

  const buildRequestPayload = (inputValueMap: Record<string, string>) => {
    const headers: Record<string, string> = {};
    const params: Record<string, string> = {};
    const bodyObject: Record<string, any> = {};
    let url = selectedRequest?.url || '';

    const mappings = selectedRequest?.apiMappings || [];
    for (const mapping of mappings) {
      if (!mapping.inputName || !mapping.key) continue;
      const value = inputValueMap[mapping.inputName];
      if (value === undefined) continue;
      if (mapping.target === 'path') {
        url = applyPathMapping(url, mapping.key, value);
      } else if (mapping.target === 'params') {
        params[mapping.key] = value;
      } else if (mapping.target === 'body') {
        setNestedValue(bodyObject, mapping.key, parseBodyValue(value));
      }
    }

    let body = undefined;
    if (selectedRequest && ['POST', 'PUT', 'PATCH'].includes(selectedRequest.method) && Object.keys(bodyObject).length > 0) {
      body = bodyObject;
    }

    return { url, headers, params, body };
  };

  const buildCurl = (url: string, method: string, params: Record<string, string>, body?: any) => {
    let fullUrl = url;
    const entries = Object.entries(params);
    if (entries.length > 0) {
      const query = entries
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      fullUrl += fullUrl.includes('?') ? `&${query}` : `?${query}`;
    }
    const parts = [`curl -X ${method}`];
    if (body !== undefined) {
      parts.push(`-H "Content-Type: application/json"`);
      parts.push(`-d '${JSON.stringify(body)}'`);
    }
    parts.push(`"${fullUrl}"`);
    return parts.join(' ');
  };

  const handleDebugRun = async () => {
    if (!selectedRequest || !selectedRequest.url) {
      message.error('请输入URL');
      return;
    }
    try {
      const incompleteMappings = (selectedRequest.apiMappings || []).filter(
        (mapping) => !mapping.inputName || !mapping.key
      );
      if (incompleteMappings.length > 0) {
        message.warning('API 配置中存在未完整填写的映射');
        return;
      }

      const values = await testForm.validateFields();
      const inputValueMap = selectedRequest.inputFields.reduce((acc, field, index) => {
        if (field.name) {
          acc[field.name] = values[field.name];
        } else {
          acc[`field_${index + 1}`] = values[`field_${index + 1}`];
        }
        return acc;
      }, {} as Record<string, string>);

      const missingRequired = selectedRequest.inputFields.filter(
        (field) => field.required && field.name && !inputValueMap[field.name]
      );
      if (missingRequired.length > 0) {
        message.error(`请填写必填入参: ${missingRequired.map((f) => f.name || '未命名').join(', ')}`);
        return;
      }

      const pathMissing = (selectedRequest.apiMappings || [])
        .filter((mapping) => mapping.target === 'path' && mapping.key && !hasPathPlaceholder(selectedRequest.url, mapping.key))
        .map((mapping) => mapping.key);
      if (pathMissing.length > 0) {
        message.warning(`URL 缺少路径占位符: ${pathMissing.join(', ')}`);
        return;
      }

      const mappedInputs = new Set((selectedRequest.apiMappings || []).map((mapping) => mapping.inputName).filter(Boolean));
      const unmappedInputs = selectedRequest.inputFields
        .map((field) => field.name)
        .filter((name) => name && !mappedInputs.has(name));
      if (unmappedInputs.length > 0) {
        message.warning(`以下入参未映射: ${unmappedInputs.join(', ')}`);
      }

      setTestLoading(true);
      const { url, headers, params, body } = buildRequestPayload(inputValueMap);
      setCurlPreview(buildCurl(url, selectedRequest.method, params, body));
      const result = await proxyRequest({
        url,
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
      setActiveTestTab('results');
      message.success('请求成功');
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      const errorData = error.response?.data || error.message || '请求失败';
      setResponse({
        status: error.response?.status || 500,
        statusText: error.response?.statusText || 'Error',
        data: errorData,
        headers: error.response?.headers || {},
      });
      setActiveTestTab('results');
      message.error(error.response?.data?.message || error.message || '请求失败');
    } finally {
      setTestLoading(false);
    }
  };

  const handleAddInputField = () => {
    if (selectedRequest) {
      updateRequest(selectedRequest.id, {
        inputFields: [...selectedRequest.inputFields, { name: '', type: 'params', required: false, value: '', description: '' }],
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

  const handleInputChange = (index: number, field: 'name' | 'type' | 'required' | 'description' | 'value', value: any) => {
    if (selectedRequest) {
      const newInputFields = [...selectedRequest.inputFields];
      const previousName = newInputFields[index]?.name;
      newInputFields[index] = { ...newInputFields[index], [field]: value };
      const updates: any = { inputFields: newInputFields };
      if (field === 'name' && previousName && previousName !== value) {
        updates.apiMappings = (selectedRequest.apiMappings || []).map((mapping) =>
          mapping.inputName === previousName ? { ...mapping, inputName: value } : mapping
        );
      }
      updateRequest(selectedRequest.id, updates);
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

  const handleAddMapping = () => {
    if (selectedRequest) {
      updateRequest(selectedRequest.id, {
        apiMappings: [...(selectedRequest.apiMappings || []), { inputName: '', target: 'params', key: '' }],
      });
    }
  };

  const handleRemoveMapping = (index: number) => {
    if (selectedRequest) {
      const newMappings = [...(selectedRequest.apiMappings || [])];
      newMappings.splice(index, 1);
      updateRequest(selectedRequest.id, { apiMappings: newMappings });
    }
  };

  const handleMappingChange = (index: number, field: 'inputName' | 'target' | 'key', value: string) => {
    if (selectedRequest) {
      const newMappings = [...(selectedRequest.apiMappings || [])];
      newMappings[index] = { ...newMappings[index], [field]: value };
      updateRequest(selectedRequest.id, { apiMappings: newMappings });
    }
  };

  if (!selectedRequest) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">请创建或选择一个请求</p>
      </div>
    );
  }

  const apiMappings = selectedRequest.apiMappings || [];
  const parsedResponseData = response ? parseResponseData(response.data) : null;
  const incompleteMappings = apiMappings.filter((mapping) => !mapping.inputName || !mapping.key);
  const pathMappingsMissingPlaceholder = apiMappings
    .filter((mapping) => mapping.target === 'path' && mapping.key && !hasPathPlaceholder(selectedRequest.url, mapping.key))
    .map((mapping) => mapping.key);
  const mappedInputs = new Set(apiMappings.map((mapping) => mapping.inputName).filter(Boolean));
  const unmappedInputs = selectedRequest.inputFields
    .map((field) => field.name)
    .filter((name) => name && !mappedInputs.has(name));

  const inputFieldsTab = {
    key: '1',
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
              <Input
                placeholder="默认值/测试值"
                value={field.value}
                onChange={(e) => handleInputChange(index, 'value', e.target.value)}
                className="border-orange-200 focus:border-orange-400"
              />
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

  const apiConfigTab = {
    key: '2',
    label: 'API 配置',
    className: '[&_.ant-tabs-tab]:bg-slate-50/50 [&_.ant-tabs-tab-active]:bg-slate-100 [&_.ant-tabs-tab-active]:border-b-[#64748b] [&_.ant-tabs-tab]:border-b-transparent',
    children: (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-700">API 配置</div>
          <Button type="dashed" onClick={handleAddMapping} icon={<PlusOutlined />}>
            添加映射
          </Button>
        </div>
        {(incompleteMappings.length > 0 || pathMappingsMissingPlaceholder.length > 0 || unmappedInputs.length > 0) && (
          <div className="mb-3 space-y-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            {incompleteMappings.length > 0 && <div>存在未完整填写的映射。</div>}
            {pathMappingsMissingPlaceholder.length > 0 && (
              <div>URL 缺少路径占位符: {pathMappingsMissingPlaceholder.join(', ')}</div>
            )}
            {unmappedInputs.length > 0 && <div>以下入参尚未映射: {unmappedInputs.join(', ')}</div>}
          </div>
        )}
        {apiMappings.length === 0 ? (
          <div className="text-gray-500 text-sm">添加映射后，入参会自动应用到路径、Query 参数或 Body 中。</div>
        ) : (
          <div className="space-y-2">
            {apiMappings.map((mapping, index) => (
              <Row key={index} gutter={8} align="middle" className="p-2 hover:bg-gray-50 rounded transition-colors">
                <Col flex={2}>
                  <Select
                    placeholder="选择入参"
                    value={mapping.inputName || undefined}
                    onChange={(value) => handleMappingChange(index, 'inputName', value)}
                    className="w-full"
                  >
                    {selectedRequest.inputFields.map((field, fieldIndex) => (
                      <Option key={`${field.name}-${fieldIndex}`} value={field.name} disabled={!field.name}>
                        {field.name || `未命名 ${fieldIndex + 1}`}
                      </Option>
                    ))}
                  </Select>
                </Col>
                <Col flex={1}>
                  <Select
                    value={mapping.target}
                    onChange={(value) => handleMappingChange(index, 'target', value)}
                    className="w-full"
                  >
                    <Option value="path">Path</Option>
                    <Option value="params">Query</Option>
                    <Option value="body">Body</Option>
                  </Select>
                </Col>
                <Col flex={3}>
                  <Input
                    placeholder={mapping.target === 'path' ? '路径占位符名，如 id' : mapping.target === 'params' ? 'Query 参数名' : 'Body JSON 路径，如 data.userId'}
                    value={mapping.key}
                    onChange={(e) => handleMappingChange(index, 'key', e.target.value)}
                  />
                </Col>
                <Col flex={1}>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveMapping(index)}
                    className="hover:bg-red-50"
                  />
                </Col>
              </Row>
            ))}
          </div>
        )}
      </div>
    ),
  };

  const outputFieldsTab = {
    key: '3',
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

  const tabsItems = [inputFieldsTab, apiConfigTab, outputFieldsTab];

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
          <Button type="primary" onClick={() => setDrawerOpen(true)}>
            测试运行
          </Button>
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
          <Col span={4} />
        </Row>
      </Card>
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex-1 bg-white rounded-lg p-4 overflow-auto min-h-0">
          <Tabs items={tabsItems} />
        </div>
      </div>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="right"
        width={640}
        title={null}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold text-gray-800">{selectedRequest.name}</div>
          <Button type="primary" onClick={handleDebugRun} loading={testLoading}>
            调试
          </Button>
        </div>
        <Tabs
          activeKey={activeTestTab}
          onChange={(key) => setActiveTestTab(key as 'inputs' | 'results')}
          items={[
            {
              key: 'inputs',
              label: '入参',
              children: (
                <Form form={testForm} layout="vertical">
                  <div className="space-y-2">
                    {selectedRequest.inputFields.map((field, index) => {
                      const nameKey = field.name || `field_${index + 1}`;
                      return (
                        <Form.Item
                          key={nameKey}
                          label={field.name || `未命名字段 ${index + 1}`}
                          name={nameKey}
                          rules={field.required ? [{ required: true, message: '必填项' }] : []}
                        >
                          <Input placeholder="请输入参数值" />
                        </Form.Item>
                      );
                    })}
                  </div>
                </Form>
              ),
            },
            {
              key: 'results',
              label: '运行结果',
              children: (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-gray-700">请求信息</div>
                      <div className="text-xs text-gray-500">
                        {response ? (
                          <span>
                            状态码 {response.status} · 耗时 {response.time ? `${response.time}ms` : '--'}
                          </span>
                        ) : (
                          <span>尚未发送请求</span>
                        )}
                      </div>
                    </div>
                    <pre className="bg-gray-100 rounded p-3 text-xs whitespace-pre-wrap break-all">{curlPreview || '尚未发送请求'}</pre>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-gray-700">响应结果</div>
                      <Button
                        size="small"
                        onClick={handleImportOutputFields}
                        disabled={!parsedResponseData}
                      >
                        一键配置出参
                      </Button>
                    </div>
                    <div className="border border-gray-200 rounded bg-white">
                      <Editor
                        height="260px"
                        defaultLanguage="json"
                        value={response ? formatResponseData(response.data) : ''}
                        theme="vs"
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          scrollBeyondLastLine: false,
                          wordWrap: 'on',
                          readOnly: true,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-700 mb-2">响应头</div>
                    <div className="border border-gray-200 rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="text-left px-3 py-2 w-1/2">Header</th>
                            <th className="text-left px-3 py-2 w-1/2">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {response?.headers && Object.keys(response.headers).length > 0 ? (
                            Object.entries(response.headers).map(([key, value]) => (
                              <tr key={key} className="border-t border-gray-100">
                                <td className="px-3 py-2 text-gray-700">{key}</td>
                                <td className="px-3 py-2 text-gray-600 break-all">{String(value)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-3 py-3 text-gray-500" colSpan={2}>无响应头</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  );
};
