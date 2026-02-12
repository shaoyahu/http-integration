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
  selectedRequestId: string | null
  setSelectedRequest: (id: string | null) => void
}

const DEFAULT_REQUEST_ID = 'default-feishu-callback'
const DEFAULT_REQUEST: HttpRequest = {
  id: DEFAULT_REQUEST_ID,
  name: '飞书回调示例',
  method: 'POST',
  url: 'https://open.feishu.cn/anycross/trigger/callback/MDY1NThjOGZlYzE0ZGUxNTNiY2U4N2RkYzQ1YzU0ZmZk',
  headers: [],
  params: [],
  body: JSON.stringify({}, null, 2),
  inputFields: [],
  outputFields: [],
  apiMappings: [],
}

export const useRequestStore = create<RequestStore>((set) => ({
  requests: [DEFAULT_REQUEST],
  addRequest: () => set((state) => {
    const id = Date.now().toString();
    return {
      requests: [
        ...state.requests,
        {
          id,
          name: `请求 ${state.requests.length + 1}`,
          method: 'GET',
          url: '',
          headers: [],
          params: [],
          body: JSON.stringify({}, null, 2),
          inputFields: [],
          outputFields: [],
          apiMappings: [],
        },
      ],
      selectedRequestId: id,
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
  selectedRequestId: DEFAULT_REQUEST_ID,
  setSelectedRequest: (id) => set({ selectedRequestId: id }),
}))
