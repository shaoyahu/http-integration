import { describe, it, expect, beforeEach } from 'vitest';
import { useRequestStore, DEFAULT_REQUEST_ID, HttpRequest } from './requestStore';

describe('RequestStore', () => {
  beforeEach(() => {
    // Reset to a clean initial state with a single default request placeholder
    const initial: HttpRequest = {
      id: DEFAULT_REQUEST_ID,
      name: '默认请求示例',
      method: 'POST',
      url: 'https://example.com',
      headers: [],
      params: [],
      body: '',
      inputFields: [],
      outputFields: [],
      apiMappings: [],
      folderId: null,
      isPublic: false,
      ownerUserId: undefined,
      ownerUsername: undefined,
      iconUrl: '',
    };

    useRequestStore.setState({
      requests: [initial],
      folders: [],
      selectedRequestId: initial.id,
    } as any);
  });

  it('should add a new request', () => {
    useRequestStore.getState().addRequest();
    const state = useRequestStore.getState();
    expect(state.requests).toHaveLength(2);
    expect(state.selectedRequestId).toBe(state.requests[1].id);
  });

  it('should update a request', () => {
    const id = useRequestStore.getState().requests[0].id;
    useRequestStore.getState().updateRequest(id, { name: 'Updated Name' } as Partial<HttpRequest>);
    const updated = useRequestStore.getState().requests.find((r) => r.id === id);
    expect(updated?.name).toBe('Updated Name');
  });

  it('should delete a request', () => {
    // Add two requests first
    useRequestStore.getState().addRequest();
    const idToDelete = useRequestStore.getState().requests[1].id;
    useRequestStore.getState().deleteRequest(idToDelete);
    const state = useRequestStore.getState();
    expect(state.requests.find((r) => r.id === idToDelete)).toBeUndefined();
  });

  it('should select a request', () => {
    // Ensure there is at least one candidate to select
    useRequestStore.getState().addRequest();
    const newId = useRequestStore.getState().requests[1].id;
    useRequestStore.getState().setSelectedRequest(newId);
    expect(useRequestStore.getState().selectedRequestId).toBe(newId);
  });
});
