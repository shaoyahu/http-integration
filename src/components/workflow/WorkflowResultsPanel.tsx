import React from 'react';
import { List, Button, Tooltip, message } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import { useWorkflowStore } from '../../store/workflowStore';
import { HTTP_METHOD_COLORS } from '../../constants/http';

interface ResultItem {
  requestId: string;
  name: string;
  status: 'success' | 'error';
  statusCode: number;
  time: number;
  data?: any;
  headers?: Record<string, string>;
  error?: string;
}

interface WorkflowResultsPanelProps {
  results: ResultItem[];
  workflows: Array<{
    id: string;
    requests: Array<{
      id: string;
      name: string;
      method: string;
    }>;
  }>;
  selectedWorkflowId: string | null;
  onSelectResult: (result: ResultItem) => void;
  onDetailOpen: () => void;
  onImportOutputFields: (result: ResultItem) => void;
}

export const WorkflowResultsPanel: React.FC<WorkflowResultsPanelProps> = ({
  results,
  workflows,
  selectedWorkflowId,
  onSelectResult,
  onDetailOpen,
  onImportOutputFields,
}) => {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[340px] bg-white border-l border-gray-200 overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
        执行结果
      </div>
      <div className="flex-1 overflow-auto">
        <List
          dataSource={results}
          renderItem={(result) => (
            <List.Item className="border-b border-gray-100 last:border-0">
              <div
                className="w-full cursor-pointer hover:bg-gray-50 rounded p-2 -m-2"
                onClick={() => {
                  onSelectResult(result);
                  onDetailOpen();
                }}
              >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            onImportOutputFields(result);
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
    </div>
  );
};

export default WorkflowResultsPanel;
