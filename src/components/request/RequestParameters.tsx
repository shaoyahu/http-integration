import React from 'react'
import { Row, Col, Input, Button, Select } from 'antd'
import type { HttpRequest } from '../../store/requestStore'

type Props = {
  request: HttpRequest
  isEditing: boolean
  onAddInputField: () => void
  onRemoveInputField: (index: number) => void
  onInputFieldChange: (
    index: number,
    field: 'name' | 'type' | 'required' | 'description' | 'value',
    value: string | boolean
  ) => void
  onAddOutputField: () => void
  onRemoveOutputField: (index: number) => void
  onOutputFieldChange: (
    index: number,
    field: 'name' | 'path' | 'description',
    value: string
  ) => void
}

const RequestParameters: React.FC<Props> = React.memo((props) => {
  const {
    request,
    isEditing,
    onAddInputField,
    onRemoveInputField,
    onInputFieldChange,
    onAddOutputField,
    onRemoveOutputField,
    onOutputFieldChange,
  } = props

  return (
    <div className="space-y-3 p-3 border rounded bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-700">入参/出参字段</div>
        {isEditing && (
          <Button size="small" onClick={onAddInputField} icon={<span>＋</span>}>添加入参</Button>
        )}
      </div>
      {/* Input Fields */}
      <div className="space-y-2">
        {request.inputFields.map((field, index) => (
          <Row key={index} gutter={8} align="middle" className="p-2 hover:bg-gray-50 rounded">
            <Col flex={2}>
              {isEditing ? (
                <Input placeholder="字段名称" value={field.name} onChange={(e) => onInputFieldChange(index, 'name', e.target.value)} />
              ) : (
                <div className="text-sm text-gray-700">{field.name || '-'}</div>
              )}
            </Col>
            <Col flex={2}>
              {isEditing ? (
                <Input placeholder="默认值/测试值" value={field.value} onChange={(e) => onInputFieldChange(index, 'value', e.target.value)} />
              ) : (
                <div className="text-sm text-gray-700">{field.value || '-'}</div>
              )}
            </Col>
            <Col flex={1}>
              {isEditing ? (
                <Select value={field.required ? '必填' : '可选'} onChange={(v) => onInputFieldChange(index, 'required', v === '必填')}>
                  <Select.Option value="必填">必填</Select.Option>
                  <Select.Option value="可选">可选</Select.Option>
                </Select>
              ) : (
                <div className="text-sm text-gray-700">{field.required ? '必填' : '可选'}</div>
              )}
            </Col>
            <Col flex={3}>
              {isEditing ? (
                <Input placeholder="描述" value={field.description} onChange={(e) => onInputFieldChange(index, 'description', e.target.value)} />
              ) : (
                <div className="text-sm text-gray-700">{field.description || '-'}</div>
              )}
            </Col>
            <Col flex={1}>
              {isEditing ? (
                <Button danger onClick={() => onRemoveInputField(index)} icon={<span>删除</span>} />
              ) : (
                <span />
              )}
            </Col>
          </Row>
        ))}
      </div>
      {isEditing && (
        <Button type="dashed" onClick={onAddOutputField} block>添加出参字段</Button>
      )}
      {/* Output Fields */}
      <div className="space-y-2 mt-2">
        {request.outputFields.map((field, index) => (
          <Row key={index} gutter={8} align="middle" className="p-2 hover:bg-gray-50 rounded">
            <Col flex={2}>
              {isEditing ? (
                <Input placeholder="字段名称" value={field.name} onChange={(e) => onOutputFieldChange(index, 'name', e.target.value)} />
              ) : (
                <div className="text-sm text-gray-700">{field.name || '-'}</div>
              )}
            </Col>
            <Col flex={3}>
              {isEditing ? (
                <Input placeholder="JSON 路径" value={field.path} onChange={(e) => onOutputFieldChange(index, 'path', e.target.value)} />
              ) : (
                <div className="text-sm text-gray-700">{field.path || '-'}</div>
              )}
            </Col>
            <Col flex={3}>
              {isEditing ? (
                <Input placeholder="描述" value={field.description} onChange={(e) => onOutputFieldChange(index, 'description', e.target.value)} />
              ) : (
                <div className="text-sm text-gray-700">{field.description || '-'}</div>
              )}
            </Col>
            <Col flex={1}>
              {isEditing ? (
                <Button danger onClick={() => onRemoveOutputField(index)} icon={<span>删除</span>} />
              ) : (
                <span />
              )}
            </Col>
          </Row>
        ))}
      </div>
    </div>
  )
})

export default RequestParameters
