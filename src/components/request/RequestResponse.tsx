import React from 'react'
import Editor from '@monaco-editor/react'
import type { HttpRequest } from '../../store/requestStore'
import { formatResponseData, parseResponseData } from '../../utils/response'

type Props = {
  response: any
  onParseFromResponse?: () => void
  editing?: boolean
  selectedRequest?: HttpRequest | null
}

const RequestResponse: React.FC<Props> = React.memo((props) => {
  const { response, onParseFromResponse } = props
  const pretty = response?.data ? formatResponseData(response.data) : ''
  return (
    <div className="space-y-3 p-3 border rounded bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-700">响应数据</div>
        <button onClick={onParseFromResponse} className="px-3 py-1 text-sm rounded bg-blue-50 text-blue-700 border border-blue-200">从响应解析出参</button>
      </div>
      <div className="h-60 border rounded bg-gray-50 overflow-hidden">
        <Editor
          height="260px"
          defaultLanguage="json"
          value={pretty}
          options={{ readOnly: true, minimap: { enabled: false }, wordWrap: 'on' }}
        />
      </div>
      <div className="text-sm text-gray-600">若需要，点击“从响应解析出参”将从响应数据中提取出参字段。</div>
    </div>
  )
})

export default RequestResponse
