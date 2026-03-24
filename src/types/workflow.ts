export interface HttpParam {
  key: string
  value: string
}

export interface ParamField {
  name: string
  type: 'params' | 'path' | 'body'
  required: boolean
  value?: string
  description?: string
}

export interface OutputField {
  name: string
  path: string
  description?: string
}

export interface ApiMapping {
  inputName: string
  target: 'path' | 'params' | 'body'
  key: string
}
