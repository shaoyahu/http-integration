import React from 'react';
import { Layout, Button, Input, Popconfirm, Tag } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, MenuFoldOutlined } from '@ant-design/icons';
import { useWorkflowStore } from '../../store/workflowStore';

const { Sider } = Layout;

interface WorkflowSidebarProps {
  isLoadingState: boolean;
  statusColor: string;
  statusText: string;
  workflowSiderCollapsed: boolean;
  setWorkflowSiderCollapsed: (collapsed: boolean) => void;
}

export const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({
  isLoadingState,
  statusColor,
  statusText,
  workflowSiderCollapsed,
  setWorkflowSiderCollapsed,
}) => {
  const {
    workflows,
    selectedWorkflowId,
    setSelectedWorkflow,
    addWorkflow,
    deleteWorkflow,
    editingId,
    editingName,
    setEditingId,
    setEditingName,
  } = useWorkflowStore();

  const handleRename = (id: string, newName: string) => {
    if (newName.trim()) {
      useWorkflowStore.getState().updateWorkflow(id, { name: newName.trim() });
    }
    setEditingId(null);
  };

  const startEditing = (e: React.MouseEvent, wf: { id: string; name: string }) => {
    e.stopPropagation();
    setEditingId(wf.id);
    setEditingName(wf.name);
  };

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
        <h2 className="text-lg font-semibold text-gray-800 margin-0">工作流</h2>
        <div className="flex items-center gap-2">
          <Tag color={statusColor} className="m-0">
            {statusText}
          </Tag>
          <Button
            type="text"
            size="small"
            icon={<MenuFoldOutlined />}
            onClick={() => setWorkflowSiderCollapsed(true)}
            className="text-gray-400 hover:text-gray-600"
          />
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-t border-gray-200">
          <div
            onClick={() => {
              if (isLoadingState) {
                return;
              }
              addWorkflow();
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
          ) : workflows.map((wf) => (
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
  );
};

export default WorkflowSidebar;
