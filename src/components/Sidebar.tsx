import React, { useState } from 'react';
import { Layout, Popconfirm, message, Input, Tag, Select, Button } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, HolderOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
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

const { Sider } = Layout;
const { Option } = Select;

interface SidebarProps {
  children?: React.ReactNode;
}

const methodColors: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

interface SortableItemProps {
  id: string;
  req: any;
  selectedRequestId: string | null;
  editingId: string | null;
  editingName: string;
  onRename: (id: string, newName: string) => void;
  onEdit: (e: React.MouseEvent, req: any) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
}

function SortableItem({
  id,
  req,
  selectedRequestId,
  editingId,
  editingName,
  onRename,
  onEdit,
  onDelete,
  onSelect,
  setEditingId,
  setEditingName,
}: SortableItemProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`px-2 my-2 cursor-pointer hover:bg-blue-50 ${selectedRequestId === req.id ? 'bg-blue-100 border-l-4 border-blue-500' : ''}`}
      onClick={() => onSelect(req.id)}
    >
      <div className="flex items-center justify-between w-full h-10">
        <div className="flex items-center gap-2 min-w-0 flex-1 h-full">
          <div {...attributes} {...listeners} className="cursor-grab flex-shrink-0">
            <HolderOutlined className="text-gray-400 hover:text-gray-600" />
          </div>
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
              className="flex-1 h-full"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1 h-full flex items-center">{req.name}</span>
          )}
        </div>
        <div className="flex items-center flex-shrink-0 h-full" onClick={(e) => e.stopPropagation()}>
          <EditOutlined
            className="ml-2 text-gray-400 hover:text-blue-500"
            onClick={(e) => onEdit(e, req)}
          />
          <Popconfirm
            title="删除请求"
            description="确定要删除这个请求吗？"
            onConfirm={() => onDelete(req.id)}
            okText="确定"
            cancelText="取消"
          >
            <DeleteOutlined className="ml-2 text-gray-400 hover:text-red-500" />
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

export const Sidebar: React.FC<SidebarProps> = ({ children }) => {
  const navigate = useNavigate();
  const { requests, selectedRequestId, addRequest, deleteRequest, setSelectedRequest, updateRequest, reorderRequests } = useRequestStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('all');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredRequests = filterMethod === 'all'
    ? requests
    : requests.filter((req) => req.method === filterMethod);

  const handleRename = (id: string, newName: string) => {
    if (newName.trim()) {
      updateRequest(id, { name: newName.trim() });
      message.success('请求已重命名');
    }
    setEditingId(null);
  };

  const startEditing = (e: React.MouseEvent, req: any) => {
    e.stopPropagation();
    setEditingId(req.id);
    setEditingName(req.name);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = filteredRequests.findIndex((req) => req.id === active.id);
      const newIndex = filteredRequests.findIndex((req) => req.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderRequests(oldIndex, newIndex);
      }
    }
  };

  return (
    <Sider width={250} theme="light" className="border-r border-gray-200 flex flex-col" style={{ height: '100vh' }}>
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 flex-shrink-0">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
          className="text-gray-500 hover:text-gray-700"
        />
        <h2 className="text-lg font-semibold text-gray-800 margin-0">请求管理</h2>
      </div>
      <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
        <Select
          value={filterMethod}
          onChange={setFilterMethod}
          className="w-full"
          size="small"
        >
          <Option value="all">全部</Option>
          <Option value="GET">GET</Option>
          <Option value="POST">POST</Option>
          <Option value="PUT">PUT</Option>
          <Option value="DELETE">DELETE</Option>
          <Option value="PATCH">PATCH</Option>
        </Select>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="border-t border-gray-200 flex-shrink-0">
          <div
            onClick={() => addRequest()}
            className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 text-gray-600 hover:text-gray-800 transition-colors h-12"
          >
            <PlusOutlined />
            <span>添加请求</span>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 custom-scrollbar">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredRequests.map((req) => req.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredRequests.map((req) => (
                <SortableItem
                  key={req.id}
                  id={req.id}
                  req={req}
                  selectedRequestId={selectedRequestId}
                  editingId={editingId}
                  editingName={editingName}
                  onRename={handleRename}
                  onEdit={startEditing}
                  onDelete={(id) => {
                    deleteRequest(id);
                    message.success('请求已删除');
                  }}
                  onSelect={setSelectedRequest}
                  setEditingId={setEditingId}
                  setEditingName={setEditingName}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </Sider>
  );
};