import React from 'react'
import { Input, Button, Select } from 'antd'
import type { HttpRequest } from '../../store/requestStore'

type Props = {
  request: HttpRequest
  isEditing: boolean
  name: string
  description?: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  iconUrl?: string
  draftMethod: string
  draftUrl: string
  onNameChange: (v: string) => void
  onDescriptionChange?: (v: string) => void
  onIconUrlChange?: (v: string) => void
  onMethodChange: (v: string) => void
  onUrlChange: (v: string) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onSave?: () => void
  onImport?: () => void
  onExport?: () => void
}

const RequestBasicInfo: React.FC<Props> = React.memo((props) => {
  const {
    isEditing,
    name,
    method,
    url,
    draftMethod,
    draftUrl,
    onNameChange,
    onMethodChange,
    onUrlChange,
    onImport,
    onExport,
  } = props

  return (
    <div className="space-y-3 p-3 border rounded bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-700">基本信息</div>
        <div className="flex items-center gap-2">
          {!isEditing && props.onStartEdit ? (
            <Button size="small" onClick={props.onStartEdit}>编辑</Button>
          ) : null}
          <Button size="small" onClick={onImport}>导入</Button>
          <Button size="small" onClick={onExport}>导出</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">请求名称</div>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="请求名称"
            disabled={!isEditing}
          />
        </div>
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">请求方法</div>
          <Select
            value={isEditing ? draftMethod : method}
            style={{ width: 120 }}
            onChange={(v) => onMethodChange(v as string)}
            disabled={!isEditing}
          >
            <Select.Option value="GET">GET</Select.Option>
            <Select.Option value="POST">POST</Select.Option>
            <Select.Option value="PUT">PUT</Select.Option>
            <Select.Option value="DELETE">DELETE</Select.Option>
            <Select.Option value="PATCH">PATCH</Select.Option>
          </Select>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">请求 URL</div>
          <Input
            value={isEditing ? draftUrl : url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://api.example.com/resource"
            disabled={!isEditing}
          />
        </div>
      </div>
      <div className="text-sm text-gray-500">当前配置将用于发起请求与调试</div>
    </div>
  )
})

export default RequestBasicInfo
