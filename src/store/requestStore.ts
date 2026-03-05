import { create } from 'zustand'

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

export interface HttpRequest {
  id: string
  name: string
  description?: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers: HttpParam[]
  params: HttpParam[]
  body: string
  inputFields: ParamField[]
  outputFields: OutputField[]
  apiMappings: ApiMapping[]
}

interface RequestStore {
  requests: HttpRequest[]
  addRequest: () => void
  updateRequest: (id: string, updates: Partial<HttpRequest>) => void
  deleteRequest: (id: string) => void
  reorderRequests: (oldIndex: number, newIndex: number) => void
  setRequestsState: (requests: HttpRequest[], selectedRequestId: string | null) => void
  selectedRequestId: string | null
  setSelectedRequest: (id: string | null) => void
}

const DEFAULT_REQUEST_ID = 'default-feishu-callback'
const DEFAULT_REQUEST: HttpRequest = {
  id: DEFAULT_REQUEST_ID,
  name: '默认请求示例',
  description: '',
  method: 'POST',
  url: 'https://open.feishu.cn/anycross/trigger/callback/MDY1NThjOGZlYzE0ZGUxNTNiY2U4N2RkYzQ1YzU0ZmZk',
  headers: [],
  params: [],
  body: JSON.stringify({}, null, 2),
  inputFields: [],
  outputFields: [],
  apiMappings: [],
}

const createRequestTemplate = (index: number): HttpRequest => ({
  id: Date.now().toString(),
  name: `请求 ${index}`,
  description: '',
  method: 'GET',
  url: '',
  headers: [],
  params: [],
  body: JSON.stringify({}, null, 2),
  inputFields: [],
  outputFields: [],
  apiMappings: [],
})

const normalizeRequest = (req: Partial<HttpRequest>, fallbackIndex: number): HttpRequest => ({
  id: req.id || `${Date.now()}-${fallbackIndex}`,
  name: req.name || `请求 ${fallbackIndex + 1}`,
  description: req.description || '',
  method: req.method || 'GET',
  url: req.url || '',
  headers: Array.isArray(req.headers) ? req.headers : [],
  params: Array.isArray(req.params) ? req.params : [],
  body: typeof req.body === 'string' ? req.body : JSON.stringify({}, null, 2),
  inputFields: Array.isArray(req.inputFields) ? req.inputFields : [],
  outputFields: Array.isArray(req.outputFields) ? req.outputFields : [],
  apiMappings: Array.isArray(req.apiMappings) ? req.apiMappings : [],
})

export const useRequestStore = create<RequestStore>((set) => ({
  requests: [DEFAULT_REQUEST],
  addRequest: () => set((state) => {
    const next = createRequestTemplate(state.requests.length + 1)
    return {
      requests: [
        ...state.requests,
        next,
      ],
      selectedRequestId: next.id,
    };
  }),
  updateRequest: (id, updates) =>
    set((state) => ({
      requests: state.requests.map((req) =>
        req.id === id ? { ...req, ...updates } : req
      ),
    })),
  deleteRequest: (id) =>
    set((state) => ({
      requests: state.requests.filter((req) => req.id !== id),
      selectedRequestId: state.selectedRequestId === id ? null : state.selectedRequestId,
    })),
  reorderRequests: (oldIndex, newIndex) =>
    set((state) => {
      const newRequests = [...state.requests];
      const [movedItem] = newRequests.splice(oldIndex, 1);
      newRequests.splice(newIndex, 0, movedItem);
      return { requests: newRequests };
    }),
  setRequestsState: (requests, selectedRequestId) =>
    set(() => {
      const normalizedRequests = (Array.isArray(requests) ? requests : [])
        .map((req, index) => normalizeRequest(req, index));
      const nextRequests = normalizedRequests.length > 0 ? normalizedRequests : [DEFAULT_REQUEST];
      const nextSelectedRequestId = selectedRequestId && nextRequests.some((req) => req.id === selectedRequestId)
        ? selectedRequestId
        : nextRequests[0]?.id || null;
      return {
        requests: nextRequests,
        selectedRequestId: nextSelectedRequestId,
      };
    }),
  selectedRequestId: DEFAULT_REQUEST_ID,
  setSelectedRequest: (id) => set({ selectedRequestId: id }),
}))
