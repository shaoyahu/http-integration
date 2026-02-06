import { create } from 'zustand'

export interface HttpParam {
  key: string
  value: string
}

export interface ParamField {
  name: string
  type: 'params' | 'path' | 'body'
  required: boolean
  description?: string
}

export interface OutputField {
  name: string
  path: string
  description?: string
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

export const useRequestStore = create<RequestStore>((set) => ({
  requests: [],
  addRequest: () => set((state) => ({
    requests: [
      ...state.requests,
      {
        id: Date.now().toString(),
        name: `请求 ${state.requests.length + 1}`,
        method: 'GET',
        url: '',
        headers: [{ key: '', value: '' }],
        params: [{ key: '', value: '' }],
        body: JSON.stringify({}, null, 2),
        inputFields: [],
        outputFields: [],
      },
    ],
    selectedRequestId: Date.now().toString(),
  })),
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
  selectedRequestId: null,
  setSelectedRequest: (id) => set({ selectedRequestId: id }),
}))