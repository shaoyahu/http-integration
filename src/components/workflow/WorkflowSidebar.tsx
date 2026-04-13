import React, { useMemo, useState } from 'react';
import { Layout, Button, Input, Popconfirm, Tag, Tooltip, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  CloseOutlined,
  FolderAddOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  MoreOutlined,
  RightOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { Workflow, WorkflowFolder } from '../../store/workflowStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Sider } = Layout;

interface SortableFolderProps {
  folder: WorkflowFolder;
  workflowCount: number;
  editingFolderId: string | null;
  editingFolderName: string;
  onToggleExpand: () => void;
  onRename: (id: string, name: string) => void;
  onStartEdit: (e: React.MouseEvent, id: string, name: string) => void;
  onDelete: (id: string) => void;
  setEditingFolderName: (name: string) => void;
  children?: React.ReactNode;
}

function SortableFolder({
  folder,
  workflowCount,
  editingFolderId,
  editingFolderName,
  onToggleExpand,
  onRename,
  onStartEdit,
  onDelete,
  setEditingFolderName,
  children,
}: SortableFolderProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: folder.id,
    data: { type: 'folder', folderId: folder.id },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id, data: { type: 'folder', folderId: folder.id } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const setNodeRef = (node: HTMLDivElement | null) => {
    setDropRef(node);
    setSortRef(node);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isOver ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : ''}
    >
      <div
        className="px-4 h-12 flex items-center justify-between cursor-pointer hover:bg-gray-50 border-t border-gray-100"
        onClick={onToggleExpand}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2 min-w-0">
          {folder.expanded ? (
            <DownOutlined className="text-xs text-gray-500" />
          ) : (
            <RightOutlined className="text-xs text-gray-500" />
          )}
          {folder.expanded ? (
            <FolderOpenOutlined className="text-amber-500" />
          ) : (
            <FolderOutlined className="text-amber-500" />
          )}
          {editingFolderId === folder.id ? (
            <Input
              size="small"
              value={editingFolderName}
              onChange={(e) => setEditingFolderName(e.target.value)}
              onPressEnter={() => onRename(folder.id, editingFolderName)}
              onBlur={() => onRename(folder.id, editingFolderName)}
              autoFocus
              className="w-[120px]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate text-sm font-medium text-gray-700">{folder.name}</span>
          )}
          <span className="text-xs text-gray-400">{workflowCount}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400" onClick={(e) => e.stopPropagation()}>
          <EditOutlined
            className="hover:text-blue-500"
            onClick={(e) => onStartEdit(e, folder.id, folder.name)}
          />
          <Popconfirm
            title="删除文件夹"
            description="删除后，文件夹内工作流将移到未分组。"
            onConfirm={() => onDelete(folder.id)}
            okText="确定"
            cancelText="取消"
          >
            <DeleteOutlined className="hover:text-red-500" />
          </Popconfirm>
        </div>
      </div>
      {children}
    </div>
  );
}

interface SortableWorkflowItemProps {
  id: string;
  workflow: Workflow;
  selectedWorkflowId: string | null;
  editingId: string | null;
  editingName: string;
  folderMenuItems: MenuProps['items'];
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onMoveToFolder: (workflowId: string, folderId: string | null) => void;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  inFolder?: boolean;
}

function SortableWorkflowItem({
  id,
  workflow,
  selectedWorkflowId,
  editingId,
  editingName,
  folderMenuItems,
  onRename,
  onDelete,
  onSelect,
  onMoveToFolder,
  setEditingId,
  setEditingName,
  inFolder = false,
}: SortableWorkflowItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: 'workflow' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const actionMenuItems: MenuProps['items'] = [
    {
      key: 'move-folder',
      label: '移动到文件夹',
      icon: <FolderOpenOutlined />,
      children: folderMenuItems,
    },
    {
      key: 'edit',
      label: '编辑名称',
      icon: <EditOutlined />,
    },
    {
      key: 'delete',
      label: '删除工作流',
      icon: <DeleteOutlined />,
      danger: true,
    },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`px-4 py-3 cursor-pointer hover:bg-blue-50 ${inFolder ? 'bg-amber-50/50' : ''} ${selectedWorkflowId === workflow.id ? 'bg-blue-100 border-l-4 border-blue-500' : ''}`}
      onClick={() => onSelect(workflow.id)}
      {...attributes}
      {...listeners}
    >
      {selectedWorkflowId === workflow.id && (
        <div className="w-1 h-full bg-blue-500 flex-shrink-0" />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {editingId === workflow.id ? (
            <Input
              size="small"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onPressEnter={() => onRename(workflow.id, editingName)}
              onBlur={() => onRename(workflow.id, editingName)}
              autoFocus
              className="flex-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate font-medium">{workflow.name}</span>
          )}
        </div>
        <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger={['click']}
            menu={{
              items: actionMenuItems,
              onClick: ({ key }) => {
                if (key === 'edit') {
                  setEditingId(workflow.id);
                  setEditingName(workflow.name);
                  return;
                }
                if (key === 'delete') {
                  onDelete(workflow.id);
                  return;
                }
                if (key === '__ungrouped' || folderMenuItems?.some((item) => item?.key === key)) {
                  onMoveToFolder(workflow.id, key === '__ungrouped' ? null : String(key));
                }
              },
            }}
          >
            <Tooltip title="更多操作">
              <MoreOutlined
                className="ml-2 text-gray-400 hover:text-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Dropdown>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {workflow.requests.length} 个请求
      </div>
    </div>
  );
}

interface WorkflowSidebarProps {
  workflows: Workflow[];
  folders: WorkflowFolder[];
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
  onAddWorkflow: (folderId?: string | null) => void;
  onDeleteWorkflow: (id: string) => void;
  onRenameWorkflow: (id: string, name: string) => void;
  onAddFolder: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onReorderFolders: (oldIndex: number, newIndex: number) => void;
  onToggleFolderExpanded: (id: string) => void;
  onMoveWorkflowToFolder: (workflowId: string, folderId: string | null) => void;
}

export const WorkflowSidebar = React.memo(function WorkflowSidebar({
  workflows,
  folders,
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
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onReorderFolders,
  onToggleFolderExpanded,
  onMoveWorkflowToFolder,
}: WorkflowSidebarProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredWorkflows = useMemo(
    () => (searchKeyword.trim() === '' ? workflows : workflows.filter((wf) => wf.name.toLowerCase().includes(searchKeyword.toLowerCase()))),
    [searchKeyword, workflows]
  );

  const folderMenuItems = useMemo<MenuProps['items']>(() => [
    { key: '__ungrouped', label: '移到未分组' },
    ...folders.map((folder) => ({
      key: folder.id,
      label: folder.name,
    })),
  ], [folders]);

  const handleRename = (id: string, newName: string) => {
    if (newName.trim()) {
      onRenameWorkflow(id, newName.trim());
      message.success('工作流已重命名');
    }
    setEditingId(null);
  };

  const startEditing = (event: React.MouseEvent, workflow: Workflow) => {
    event.stopPropagation();
    setEditingId(workflow.id);
    setEditingName(workflow.name);
  };

  const startFolderEditing = (e: React.MouseEvent, folderId: string, folderName: string) => {
    e.stopPropagation();
    setEditingFolderId(folderId);
    setEditingFolderName(folderName);
  };

  const handleFolderRename = (id: string, newName: string) => {
    if (newName.trim()) {
      onRenameFolder(id, newName.trim());
      message.success('文件夹已重命名');
    }
    setEditingFolderId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'folder') {
      if (overData?.type !== 'folder') {
        return;
      }
      const oldIndex = folders.findIndex((folder) => folder.id === active.id);
      const newIndex = folders.findIndex((folder) => folder.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderFolders(oldIndex, newIndex);
      }
      return;
    }

    if (activeData?.type === 'workflow') {
      if (overData?.type === 'folder') {
        const targetFolderId = overData.folderId as string;
        const activeWf = workflows.find((wf) => wf.id === active.id);
        if (activeWf && activeWf.folderId !== targetFolderId) {
          onMoveWorkflowToFolder(activeWf.id, targetFolderId);
          message.success('工作流已移动到文件夹');
        }
        return;
      }

      const oldIndex = workflows.findIndex((wf) => wf.id === active.id);
      const newIndex = workflows.findIndex((wf) => wf.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
      }
    }
  };

  const handleMoveWorkflowToFolder = (workflowId: string, folderId: string | null) => {
    onMoveWorkflowToFolder(workflowId, folderId);
    message.success(folderId ? '工作流已移动到文件夹' : '工作流已移动到未分组');
  };

  const getFolderWorkflows = (folderId: string) =>
    filteredWorkflows.filter((wf) => wf.folderId === folderId);

  const ungroupedWorkflows = filteredWorkflows.filter(
    (wf) => !wf.folderId || !folders.some((folder) => folder.id === wf.folderId)
  );

  const hasAnyVisibleWorkflow = ungroupedWorkflows.length > 0 || folders.some((folder) => getFolderWorkflows(folder.id).length > 0);

  if (workflowSiderCollapsed) {
    return null;
  }

  return (
    <Sider
      width={250}
      theme="light"
      collapsed={false}
      collapsedWidth={0}
      className="border-r border-gray-200 relative flex flex-col"
      style={{ height: '100vh' }}
    >
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 flex-shrink-0">
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
      <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0 flex items-center gap-2">
        <Input
          placeholder="搜索工作流"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          size="small"
          allowClear
          className="flex-1"
        />
        <Tooltip title="添加工作流">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAddWorkflow()}
            disabled={isLoadingState}
          />
        </Tooltip>
        <Tooltip title="添加文件夹">
          <Button
            type="text"
            size="small"
            icon={<FolderAddOutlined />}
            onClick={onAddFolder}
            disabled={isLoadingState}
          />
        </Tooltip>
      </div>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {isLoadingState ? (
            <div className="px-3 py-3 space-y-2 animate-pulse">
              {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-14 rounded-md bg-gray-200/80" />
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              {ungroupedWorkflows.length > 0 && (
                <SortableContext
                  items={ungroupedWorkflows.map((wf) => wf.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {ungroupedWorkflows.map((wf) => (
                    <SortableWorkflowItem
                      key={wf.id}
                      id={wf.id}
                      workflow={wf}
                      folderMenuItems={folderMenuItems}
                      selectedWorkflowId={selectedWorkflowId}
                      editingId={editingId}
                      editingName={editingName}
                      onRename={handleRename}
                      onDelete={(id) => {
                        onDeleteWorkflow(id);
                        message.success('工作流已删除');
                      }}
                      onSelect={onSelectWorkflow}
                      onMoveToFolder={handleMoveWorkflowToFolder}
                      setEditingId={setEditingId}
                      setEditingName={setEditingName}
                    />
                  ))}
                </SortableContext>
              )}

              <SortableContext
                items={folders.map((folder) => folder.id)}
                strategy={verticalListSortingStrategy}
              >
                {folders.map((folder) => {
                  const folderWorkflows = getFolderWorkflows(folder.id);
                  const workflowCount = folderWorkflows.length;
                  return (
                    <SortableFolder
                      key={folder.id}
                      folder={folder}
                      workflowCount={workflowCount}
                      editingFolderId={editingFolderId}
                      editingFolderName={editingFolderName}
                      onToggleExpand={() => onToggleFolderExpanded(folder.id)}
                      onRename={handleFolderRename}
                      onStartEdit={startFolderEditing}
                      onDelete={(id) => {
                        onDeleteFolder(id);
                        message.success('文件夹已删除');
                      }}
                      setEditingFolderName={setEditingFolderName}
                    >
                      {folder.expanded && (
                        <>
                          {workflowCount > 0 ? (
                            <SortableContext
                              items={folderWorkflows.map((wf) => wf.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {folderWorkflows.map((wf) => (
                                <SortableWorkflowItem
                                  key={wf.id}
                                  id={wf.id}
                                  workflow={wf}
                                  folderMenuItems={folderMenuItems}
                                  selectedWorkflowId={selectedWorkflowId}
                                  editingId={editingId}
                                  editingName={editingName}
                                  onRename={handleRename}
                                  onDelete={(id) => {
                                    onDeleteWorkflow(id);
                                    message.success('工作流已删除');
                                  }}
                                  onSelect={onSelectWorkflow}
                                  onMoveToFolder={handleMoveWorkflowToFolder}
                                  setEditingId={setEditingId}
                                  setEditingName={setEditingName}
                                  inFolder
                                />
                              ))}
                            </SortableContext>
                          ) : (
                            <div className="px-4 py-2 text-xs text-gray-400">文件夹为空</div>
                          )}
                        </>
                      )}
                    </SortableFolder>
                  );
                })}
              </SortableContext>

              {!hasAnyVisibleWorkflow && folders.length === 0 && (
                <div className="px-4 py-6 text-sm text-gray-500">暂无工作流，点击"添加工作流"开始。</div>
              )}
            </DndContext>
          )}
        </div>
      </div>
    </Sider>
  );
});

export default WorkflowSidebar;