import React from 'react';
import { Layout, Button, Input, Popconfirm, Tag } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import type { Workflow } from '../../store/workflowStore';

const { Sider } = Layout;

interface WorkflowSidebarProps {
  workflows: Workflow[];
  selectedWorkflowId: string | null;
  isLoadingState: boolean;
  databaseStatusText: string;
  databaseStatusColor: string;
  workflowSiderCollapsed: boolean;
  editingId: string | null;
  editingName: string;
  setWorkflowSiderCollapsed: (collapsed: boolean) => void;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  onSelectWorkflow: (id: string | null) => void;
  onAddWorkflow: () => void;
  onDeleteWorkflow: (id: string) => void;
  onRenameWorkflow: (id: string, name: string) => void;
}

export const WorkflowSidebar = React.memo(function WorkflowSidebar({
  workflows,
  selectedWorkflowId,
  isLoadingState,
  databaseStatusText,
  databaseStatusColor,
  workflowSiderCollapsed,
  editingId,
  editingName,
  setWorkflowSiderCollapsed,
  setEditingId,
  setEditingName,
  onSelectWorkflow,
  onAddWorkflow,
  onDeleteWorkflow,
  onRenameWorkflow,
}: WorkflowSidebarProps) {
  const handleRename = React.useCallback((id: string, newName: string) => {
    if (newName.trim()) {
      onRenameWorkflow(id, newName.trim());
    }
    setEditingId(null);
  }, [onRenameWorkflow, setEditingId]);

  const startEditing = React.useCallback((event: React.MouseEvent, workflow: Workflow) => {
    event.stopPropagation();
    setEditingId(workflow.id);
    setEditingName(workflow.name);
  }, [setEditingId, setEditingName]);

  if (workflowSiderCollapsed) {
    return null;
  }

  return (
    <Sider
      width={250}
      theme="light"
      collapsed={false}
      collapsedWidth={0}
      className="border-r border-gray-200 relative"
      style={{ overflow: 'visible' }}
    >
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 m-0">工作流</h2>
        <div className="flex items-center gap-2">
          <Tag color={databaseStatusColor} className="m-0">
            {databaseStatusText}
          </Tag>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => setWorkflowSiderCollapsed(true)}
            className="text-gray-400 hover:text-gray-600"
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-t border-gray-200">
          <div
            onClick={() => {
              if (!isLoadingState) {
                onAddWorkflow();
              }
            }}
            className={`flex items-center gap-2 px-4 py-3 transition-colors ${
              isLoadingState
                ? 'cursor-not-allowed text-gray-400 bg-gray-50'
                : 'cursor-pointer hover:bg-gray-50 text-gray-600 hover:text-gray-800'
            }`}
          >
            <PlusOutlined />
            <span>添加工作流</span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {isLoadingState ? (
            <div className="px-3 py-3 space-y-2 animate-pulse">
              {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-10 rounded-md bg-gray-200/80" />
              ))}
            </div>
          ) : workflows.map((workflow) => (
            <div
              key={workflow.id}
              onClick={() => onSelectWorkflow(workflow.id)}
              className={`px-4 py-3 cursor-pointer hover:bg-blue-50 ${
                selectedWorkflowId === workflow.id ? 'bg-blue-100 border-l-4 border-blue-500' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {editingId === workflow.id ? (
                    <Input
                      size="small"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onPressEnter={() => handleRename(workflow.id, editingName)}
                      onBlur={() => handleRename(workflow.id, editingName)}
                      autoFocus
                      className="flex-1"
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate font-medium">{workflow.name}</span>
                  )}
                </div>

                <div className="flex items-center flex-shrink-0 ml-2" onClick={(event) => event.stopPropagation()}>
                  <EditOutlined
                    className="text-gray-400 hover:text-blue-500"
                    onClick={(event) => startEditing(event, workflow)}
                  />
                  <Popconfirm
                    title="删除工作流"
                    description="确定要删除这个工作流吗？"
                    onConfirm={() => onDeleteWorkflow(workflow.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <DeleteOutlined className="ml-2 text-gray-400 hover:text-red-500" />
                  </Popconfirm>
                </div>
              </div>

              <div className="text-xs text-gray-500 mt-1">
                {workflow.requests.length} 个请求
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sider>
  );
});

export default WorkflowSidebar;
