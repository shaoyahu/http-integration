import React from 'react'
import { Row, Col, Input, Button, Select } from 'antd'
import type { HttpRequest } from '../../store/requestStore'

type Props = {
  request: HttpRequest
  isEditing: boolean
  onAddMapping: () => void
  onRemoveMapping: (index: number) => void
  onMappingChange: (
    index: number,
    field: 'inputName' | 'target' | 'key',
    value: string
  ) => void
}

const RequestMappings: React.FC<Props> = React.memo((props) => {
  const { request, isEditing, onAddMapping, onRemoveMapping, onMappingChange } = props
  const mappings = request.apiMappings || []
  return (
    <div className="space-y-3 p-3 border rounded bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-700">API 配置</div>
        {isEditing && (
          <Button size="small" onClick={onAddMapping} icon={<span>＋</span>}>添加映射</Button>
        )}
      </div>
      {mappings.length === 0 && <div className="text-sm text-gray-500">暂无映射，请添加以绑定入参与请求路径、查询参数或 body</div>}
      {mappings.map((m, idx) => (
        <Row key={idx} gutter={8} align="middle" className="p-2 hover:bg-gray-50 rounded">
          <Col flex={2}>
            {isEditing ? (
              <Select
                placeholder="输入字段"
                value={m.inputName || undefined}
                onChange={(v) => onMappingChange(idx, 'inputName', v || '')}
                className="w-full"
              >
                {request.inputFields.map((f, fi) => (
                  <Select.Option key={fi} value={f.name}>{f.name || `字段 ${fi + 1}`}</Select.Option>
                ))}
              </Select>
            ) : (
              <div className="text-sm text-gray-700">{m.inputName || '-'}</div>
            )}
          </Col>
          <Col flex={1}>
            {isEditing ? (
              <Select value={m.target} onChange={(v) => onMappingChange(idx, 'target', v || '')} className="w-full">
                <Select.Option value="path">Path</Select.Option>
                <Select.Option value="params">Params</Select.Option>
                <Select.Option value="body">Body</Select.Option>
              </Select>
            ) : (
              <div className="text-sm text-gray-700">{m.target}</div>
            )}
          </Col>
          <Col flex={3}>
            {isEditing ? (
              <Input placeholder="键名" value={m.key} onChange={(e) => onMappingChange(idx, 'key', e.target.value)} />
            ) : (
              <div className="text-sm text-gray-700">{m.key}</div>
            )}
          </Col>
          <Col flex={1}>
            {isEditing ? (
              <Button danger onClick={() => onRemoveMapping(idx)} icon={<span>删除</span>} />
            ) : (
              <span />
            )}
          </Col>
        </Row>
      ))}
    </div>
  )
})

export default RequestMappings
