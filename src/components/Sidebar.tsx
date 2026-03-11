import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Popconfirm, message, Input, Tag, Dropdown, Tooltip, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  MoreOutlined,
  RightOutlined,
  DownOutlined,
  ShareAltOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
} from '@ant-design/icons';
import { DEFAULT_REQUEST_ID, useRequestStore, type HttpRequest } from '../store/requestStore';
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
import { healthCheck } from '../api/http';

const { Sider } = Layout;

interface SidebarProps {
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;
  lastSavedAt: number | null;
  onPersistNow: () => Promise<void>;
}

const methodColors: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

interface SortableFolderProps {
  folder: { id: string; name: string; expanded: boolean };
  requestCount: number;
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
  requestCount,
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
      {...attributes}
      {...listeners}
    >
      <div
        className="px-4 h-12 flex items-center justify-between cursor-pointer hover:bg-gray-50 border-t border-gray-100"
        onClick={onToggleExpand}
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
          <span className="text-xs text-gray-400">{requestCount}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400" onClick={(e) => e.stopPropagation()}>
          <EditOutlined
            className="hover:text-blue-500"
            onClick={(e) => onStartEdit(e, folder.id, folder.name)}
          />
          <Popconfirm
            title="删除文件夹"
            description="删除后，文件夹内请求将移到未分组。"
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

interface SortableItemProps {
  id: string;
  req: HttpRequest;
  folderMenuItems: MenuProps['items'];
  selectedRequestId: string | null;
  editingId: string | null;
  editingName: string;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onMoveToFolder: (requestId: string, folderId: string | null) => void;
  onTogglePublic: (requestId: string, nextIsPublic: boolean) => void;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  inFolder?: boolean;
}

function SortableItem({
  id,
  req,
  folderMenuItems,
  selectedRequestId,
  editingId,
  editingName,
  onRename,
  onDelete,
  onSelect,
  onMoveToFolder,
  onTogglePublic,
  setEditingId,
  setEditingName,
  inFolder = false,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: 'request' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isDefaultRequest = req.id === DEFAULT_REQUEST_ID;

  const actionMenuItems: MenuProps['items'] = [
    {
      key: 'toggle-public',
      label: req.isPublic ? '取消公开' : '公开给所有人',
      icon: <ShareAltOutlined />,
      disabled: isDefaultRequest,
    },
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
      label: '删除请求',
      icon: <DeleteOutlined />,
      danger: true,
    },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`h-14 flex items-center cursor-pointer hover:bg-blue-50 ${inFolder ? 'bg-amber-50/50' : ''} ${selectedRequestId === req.id ? 'bg-blue-100' : ''}`}
      onClick={() => onSelect(req.id)}
      {...attributes}
      {...listeners}
    >
      {inFolder && (
        <div className="w-1 h-full bg-amber-300 flex-shrink-0" />
      )}
      {selectedRequestId === req.id && (
        <div className="w-1 h-full bg-blue-500 flex-shrink-0" />
      )}
      <div className={`flex-1 ${inFolder ? 'px-3' : 'px-4'}`}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Tag color={methodColors[req.method] || 'default'} className="m-0 flex-shrink-0">
              {req.method}
            </Tag>
            {editingId === req.id ? (
              <Input
                size="small"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onPressEnter={() => onRename(req.id, editingName)}
                onBlur={() => onRename(req.id, editingName)}
                autoFocus
                className="flex-1"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate flex-1">{req.name}</span>
            )}
          </div>
          <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Dropdown
              trigger={['click']}
              menu={{
                items: actionMenuItems,
                onClick: ({ key }) => {
                  if (key === 'toggle-public') {
                    if (isDefaultRequest) {
                      return;
                    }
                    onTogglePublic(req.id, !req.isPublic);
                    return;
                  }
                  if (key === 'edit') {
                    setEditingId(req.id);
                    setEditingName(req.name);
                    return;
                  }
                  if (key === 'delete') {
                    onDelete(req.id);
                    return;
                  }
                  if (key === '__ungrouped' || folderMenuItems?.some((item) => item?.key === key)) {
                    onMoveToFolder(req.id, key === '__ungrouped' ? null : String(key));
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
      </div>
    </div>
  );
}

const getSaveStatusText = (isLoading: boolean, isSaving: boolean, saveError: string | null) => {
  if (isLoading) {
    return '正在加载请求...';
  }
  if (isSaving) {
    return '保存中...';
  }
  if (saveError) {
    return `保存失败：${saveError}`;
  }
  return '已保存';
};

export const Sidebar: React.FC<SidebarProps> = ({
  isLoading,
  isSaving,
  saveError,
  lastSavedAt,
  onPersistNow,
}) => {
  const {
    requests,
    folders,
    selectedRequestId,
    addRequest,
    updateRequest,
    deleteRequest,
    reorderRequests,
    addFolder,
    updateFolder,
    deleteFolder,
    reorderFolders,
    toggleFolderExpanded,
    moveRequestToFolder,
    setSelectedRequest,
  } = useRequestStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const [showTopHint, setShowTopHint] = useState(false);
  const [showBottomHint, setShowBottomHint] = useState(false);
  const [isDatabaseConnected, setIsDatabaseConnected] = useState(false);
  const [showSavedStatus, setShowSavedStatus] = useState(false);

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

  const filteredRequests = useMemo(
    () => (searchKeyword.trim() === '' ? requests : requests.filter((req) => req.name.toLowerCase().includes(searchKeyword.toLowerCase()))),
    [searchKeyword, requests]
  );

  const folderMenuItems = useMemo<MenuProps['items']>(() => ([
    { key: '__ungrouped', label: '移到未分组' },
    ...folders.map((folder) => ({
      key: folder.id,
      label: folder.name,
    })),
  ]), [folders]);

  const handleRename = (id: string, newName: string) => {
    if (newName.trim()) {
      updateRequest(id, { name: newName.trim() });
      message.success('请求已重命名');
    }
    setEditingId(null);
  };

  const startFolderEditing = (e: React.MouseEvent, folderId: string, folderName: string) => {
    e.stopPropagation();
    setEditingFolderId(folderId);
    setEditingFolderName(folderName);
  };

  const handleFolderRename = (id: string, newName: string) => {
    if (newName.trim()) {
      updateFolder(id, { name: newName.trim() });
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
        reorderFolders(oldIndex, newIndex);
      }
      return;
    }

    if (activeData?.type === 'request') {
      if (overData?.type === 'folder') {
        const targetFolderId = overData.folderId as string;
        const activeReq = requests.find((req) => req.id === active.id);
        if (activeReq && activeReq.folderId !== targetFolderId) {
          moveRequestToFolder(activeReq.id, targetFolderId);
          message.success('请求已移动到文件夹');
        }
        return;
      }

      const oldIndex = requests.findIndex((req) => req.id === active.id);
      const newIndex = requests.findIndex((req) => req.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const activeReq = requests[oldIndex];
        const overReq = requests[newIndex];
        if ((activeReq.folderId || null) === (overReq.folderId || null)) {
          reorderRequests(oldIndex, newIndex);
        }
      }
    }
  };

  const handleMoveRequestToFolder = (requestId: string, folderId: string | null) => {
    moveRequestToFolder(requestId, folderId);
    message.success(folderId ? '请求已移动到文件夹' : '请求已移动到未分组');
  };

  const handleToggleRequestPublic = (requestId: string, nextIsPublic: boolean) => {
    updateRequest(requestId, { isPublic: nextIsPublic });
    message.success(nextIsPublic ? '请求已公开，其他用户可在工作流中使用' : '请求已取消公开');
  };

  const getFolderRequests = (folderId: string) =>
    filteredRequests.filter((req) => req.folderId === folderId);

  const ungroupedRequests = filteredRequests.filter((req) => !req.folderId || !folders.some((folder) => folder.id === req.folderId));

  const hasAnyVisibleRequest = ungroupedRequests.length > 0 || folders.some((folder) => getFolderRequests(folder.id).length > 0);

  const addRequestAndPersist = async () => {
    if (isLoading) {
      return;
    }
    addRequest(null);
    try {
      await onPersistNow();
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      message.error(`新增请求已创建，但保存到数据库失败：${details}`);
    }
  };

  const addFolderAndPersist = async () => {
    if (isLoading) {
      return;
    }
    addFolder();
    try {
      await onPersistNow();
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      message.error(`新增文件夹已创建，但保存到数据库失败：${details}`);
    }
  };

  const updateScrollHints = () => {
    const el = listRef.current;
    if (!el) return;
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const current = Math.ceil(el.scrollTop);
    setShowTopHint(current > 0);
    setShowBottomHint(maxScrollTop > 0 && current < maxScrollTop);
  };

  const scrollToTop = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    updateScrollHints();
  }, [filteredRequests.length, folders.length]);

  useEffect(() => {
    let mounted = true;

    const checkDatabaseStatus = async () => {
      try {
        const result = await healthCheck();
        if (!mounted) return;
        setIsDatabaseConnected(result?.status === 'ok');
      } catch (error) {
        if (!mounted) return;
        setIsDatabaseConnected(false);
      }
    };

    checkDatabaseStatus();
    const timer = window.setInterval(checkDatabaseStatus, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!lastSavedAt || isLoading || isSaving || saveError) {
      return;
    }
    setShowSavedStatus(true);
    const timer = window.setTimeout(() => {
      setShowSavedStatus(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [lastSavedAt, isLoading, isSaving, saveError]);

  const showSaveStatus = isLoading || isSaving || Boolean(saveError) || showSavedStatus;
  const statusText = showSaveStatus
    ? getSaveStatusText(isLoading, isSaving, saveError)
    : (isDatabaseConnected ? '数据库已连接' : '数据库未连接');
  const statusColor = showSaveStatus
    ? (saveError ? 'error' : (isLoading || isSaving ? 'processing' : 'success'))
    : (isDatabaseConnected ? 'success' : 'error');

  return (
    <Sider
      width={250}
      theme="light"
      className="border-r border-gray-200 flex flex-col overflow-hidden request-sidebar"
      style={{ height: '100vh' }}
    >
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-800 margin-0">请求管理</h2>
        <Tag color={statusColor} className="m-0">
          {statusText}
        </Tag>
      </div>
      <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0 flex items-center gap-2">
        <Input
          placeholder="搜索请求"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          size="small"
          allowClear
          className="flex-1"
        />
        <Tooltip title="添加请求">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={addRequestAndPersist}
            disabled={isLoading}
          />
        </Tooltip>
        <Tooltip title="添加文件夹">
          <Button
            type="text"
            size="small"
            icon={<FolderAddOutlined />}
            onClick={addFolderAndPersist}
            disabled={isLoading}
          />
        </Tooltip>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="relative flex flex-col flex-1 min-h-0">
          {showTopHint && !isLoading && (
            <div className="absolute top-0 left-0 right-0 z-10 flex justify-center">
              <button
                type="button"
                onClick={scrollToTop}
                className="mt-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs text-gray-500 shadow hover:text-gray-700"
              >
                <VerticalAlignTopOutlined className="text-base" />
              </button>
            </div>
          )}
          {showBottomHint && !isLoading && (
            <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center">
              <button
                type="button"
                onClick={scrollToBottom}
                className="mb-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs text-gray-500 shadow hover:text-gray-700"
              >
                <VerticalAlignBottomOutlined className="text-base" />
              </button>
            </div>
          )}
          <div
            ref={listRef}
            onScroll={updateScrollHints}
            className={`request-list overflow-y-auto flex-1 min-h-0 custom-scrollbar transition-opacity duration-300 ${isLoading ? 'opacity-70' : 'opacity-100'}`}
          >
            {isLoading ? (
              <div className="px-3 py-3 space-y-2 animate-pulse">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="h-10 rounded-md bg-gray-200/80" />
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                {ungroupedRequests.length > 0 && (
                  <SortableContext
                    items={ungroupedRequests.map((req) => req.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {ungroupedRequests.map((req) => (
                      <SortableItem
                        key={req.id}
                        id={req.id}
                        req={req}
                        folderMenuItems={folderMenuItems}
                        selectedRequestId={selectedRequestId}
                        editingId={editingId}
                        editingName={editingName}
                        onRename={handleRename}
                        onDelete={(id) => {
                          deleteRequest(id);
                          message.success('请求已删除');
                        }}
                        onSelect={setSelectedRequest}
                        onMoveToFolder={handleMoveRequestToFolder}
                        onTogglePublic={handleToggleRequestPublic}
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
                    const folderRequests = getFolderRequests(folder.id);
                    const requestCount = folderRequests.length;
                    return (
                      <SortableFolder
                        key={folder.id}
                        folder={folder}
                        requestCount={requestCount}
                        editingFolderId={editingFolderId}
                        editingFolderName={editingFolderName}
                        onToggleExpand={() => toggleFolderExpanded(folder.id)}
                        onRename={handleFolderRename}
                        onStartEdit={startFolderEditing}
                        onDelete={(id: string) => {
                          deleteFolder(id);
                          message.success('文件夹已删除');
                        }}
                        setEditingFolderName={setEditingFolderName}
                      >
                        {folder.expanded && (
                          <>
                            {requestCount > 0 ? (
                              <SortableContext
                                items={folderRequests.map((req) => req.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {folderRequests.map((req) => (
                                  <SortableItem
                                    key={req.id}
                                    id={req.id}
                                    req={req}
                                    folderMenuItems={folderMenuItems}
                                    selectedRequestId={selectedRequestId}
                                    editingId={editingId}
                                    editingName={editingName}
                                    onRename={handleRename}
                                    onDelete={(id) => {
                                      deleteRequest(id);
                                      message.success('请求已删除');
                                    }}
                                    onSelect={setSelectedRequest}
                                    onMoveToFolder={handleMoveRequestToFolder}
                                    onTogglePublic={handleToggleRequestPublic}
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

                {!hasAnyVisibleRequest && folders.length === 0 && (
                  <div className="px-4 py-6 text-sm text-gray-500">暂无请求，点击“添加请求”开始。</div>
                )}
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </Sider>
  );
};
