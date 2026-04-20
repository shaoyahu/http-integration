import { create } from 'zustand'
import type { HttpParam, ParamField, OutputField, ApiMapping } from '../types/workflow'

export type { HttpParam, ParamField, OutputField, ApiMapping }

const DEFAULT_ICON_URL = '/icons/default-icon.png'

export interface RequestFolder {
  id: string
  name: string
  expanded: boolean
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
  folderId?: string | null
  isPublic?: boolean
  ownerUserId?: string
  ownerUsername?: string
  iconUrl?: string
}

interface RequestStore {
  requests: HttpRequest[]
  folders: RequestFolder[]
  addRequest: (folderId?: string | null) => void
  updateRequest: (id: string, updates: Partial<HttpRequest>) => void
  deleteRequest: (id: string) => void
  reorderRequests: (oldIndex: number, newIndex: number) => void
  addFolder: () => void
  updateFolder: (id: string, updates: Partial<RequestFolder>) => void
  deleteFolder: (id: string) => void
  reorderFolders: (oldIndex: number, newIndex: number) => void
  toggleFolderExpanded: (id: string) => void
  moveRequestToFolder: (requestId: string, folderId: string | null) => void
  setRequestsState: (requests: HttpRequest[], selectedRequestId: string | null, folders?: RequestFolder[]) => void
  selectedRequestId: string | null
  setSelectedRequest: (id: string | null) => void
}

export const DEFAULT_REQUEST_ID = 'default-feishu-callback'
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
  folderId: null,
  isPublic: false,
  iconUrl: DEFAULT_ICON_URL,
}

const createRequestTemplate = (index: number, folderId: string | null = null): HttpRequest => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
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
  folderId,
  isPublic: false,
  iconUrl: DEFAULT_ICON_URL,
})

const createFolderTemplate = (index: number): RequestFolder => ({
  id: `folder-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  name: `文件夹 ${index}`,
  expanded: true,
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
  folderId: typeof req.folderId === 'string' && req.folderId.trim() ? req.folderId : null,
  isPublic: Boolean(req.isPublic),
  ownerUserId: typeof req.ownerUserId === 'string' ? req.ownerUserId : undefined,
  ownerUsername: typeof req.ownerUsername === 'string' ? req.ownerUsername : undefined,
  iconUrl: typeof req.iconUrl === 'string' ? req.iconUrl : DEFAULT_ICON_URL,
})

const normalizeFolder = (folder: Partial<RequestFolder>, fallbackIndex: number): RequestFolder => ({
  id: typeof folder.id === 'string' && folder.id.trim() ? folder.id : `folder-${Date.now()}-${fallbackIndex}`,
  name: typeof folder.name === 'string' && folder.name.trim() ? folder.name : `文件夹 ${fallbackIndex + 1}`,
  expanded: folder.expanded !== false,
})

export const useRequestStore = create<RequestStore>((set) => ({
  requests: [DEFAULT_REQUEST],
  folders: [],
  addRequest: (folderId = null) => set((state) => {
    const hasFolder = folderId && state.folders.some((folder) => folder.id === folderId);
    const next = createRequestTemplate(state.requests.length + 1, hasFolder ? folderId : null)
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
  addFolder: () =>
    set((state) => ({
      folders: [...state.folders, createFolderTemplate(state.folders.length + 1)],
    })),
  updateFolder: (id, updates) =>
    set((state) => ({
      folders: state.folders.map((folder) => (
        folder.id === id ? { ...folder, ...updates } : folder
      )),
    })),
  deleteFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((folder) => folder.id !== id),
      requests: state.requests.map((req) => (
        req.folderId === id ? { ...req, folderId: null } : req
      )),
    })),
  reorderFolders: (oldIndex, newIndex) =>
    set((state) => {
      const newFolders = [...state.folders];
      const [movedItem] = newFolders.splice(oldIndex, 1);
      newFolders.splice(newIndex, 0, movedItem);
      return { folders: newFolders };
    }),
  toggleFolderExpanded: (id) =>
    set((state) => ({
      folders: state.folders.map((folder) => (
        folder.id === id ? { ...folder, expanded: !folder.expanded } : folder
      )),
    })),
  moveRequestToFolder: (requestId, folderId) =>
    set((state) => {
      const normalizedFolderId = folderId && state.folders.some((folder) => folder.id === folderId) ? folderId : null;
      return {
        requests: state.requests.map((req) => (
          req.id === requestId ? { ...req, folderId: normalizedFolderId } : req
        )),
      };
    }),
  setRequestsState: (requests, selectedRequestId, folders) =>
    set(() => {
      const normalizedFolders = (Array.isArray(folders) ? folders : [])
        .map((folder, index) => normalizeFolder(folder, index));
      const folderIds = new Set(normalizedFolders.map((folder) => folder.id));
      const normalizedRequests = (Array.isArray(requests) ? requests : [])
        .map((req, index) => {
          const normalized = normalizeRequest(req, index);
          return {
            ...normalized,
            folderId: normalized.folderId && folderIds.has(normalized.folderId) ? normalized.folderId : null,
          };
        });
      const nextRequests = normalizedRequests.length > 0 ? normalizedRequests : [DEFAULT_REQUEST];
      const nextSelectedRequestId = selectedRequestId && nextRequests.some((req) => req.id === selectedRequestId)
        ? selectedRequestId
        : nextRequests[0]?.id || null;
      return {
        requests: nextRequests,
        folders: normalizedFolders,
        selectedRequestId: nextSelectedRequestId,
      };
    }),
  selectedRequestId: DEFAULT_REQUEST_ID,
  setSelectedRequest: (id) => set({ selectedRequestId: id }),
}))
