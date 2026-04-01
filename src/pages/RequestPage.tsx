import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from 'antd';
import axios from 'axios';
import { Sidebar } from '../components/Sidebar';
import { RequestEditor } from '../components/RequestEditor';
import {
  deleteRequestItem,
  fetchRequestState,
  saveRequestItem,
  saveRequestSelection,
  saveRequestState,
  type RequestStatePayload,
} from '../api/http';
import { useRequestStore, type HttpRequest, type RequestFolder } from '../store/requestStore';

const { Content } = Layout;

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    if (typeof data === 'string' && data.trim()) {
      return status ? `HTTP ${status}: ${data}` : data;
    }
    const backendDetails = data?.details || data?.error;
    if (backendDetails) {
      return status ? `HTTP ${status}: ${backendDetails}` : backendDetails;
    }
    if (data && typeof data === 'object') {
      const serialized = JSON.stringify(data);
      return status ? `HTTP ${status}: ${serialized}` : serialized;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

type RequestPersistRequest =
  | { type: 'full'; snapshot: RequestStatePayload }
  | { type: 'request'; snapshot: RequestStatePayload; request: HttpRequest }
  | { type: 'delete'; snapshot: RequestStatePayload; requestId: string }
  | { type: 'selection'; snapshot: RequestStatePayload };

const buildRequestSnapshot = (state: {
  requests: HttpRequest[];
  folders: RequestFolder[];
  selectedRequestId: string | null;
}): RequestStatePayload => ({
  requests: state.requests,
  folders: state.folders,
  selectedRequestId: state.selectedRequestId,
});

const serializeRequestSnapshot = (snapshot: RequestStatePayload) => JSON.stringify(snapshot);

const buildRequestPersistRequest = (
  previous: RequestStatePayload,
  next: RequestStatePayload
): RequestPersistRequest | null => {
  if (serializeRequestSnapshot(previous) === serializeRequestSnapshot(next)) {
    return null;
  }

  if (JSON.stringify(previous.folders) !== JSON.stringify(next.folders)) {
    return { type: 'full', snapshot: next };
  }

  const prevIds = previous.requests.map((request) => request.id);
  const nextIds = next.requests.map((request) => request.id);
  const requestOrderChanged = prevIds.length === nextIds.length && prevIds.some((id, index) => id !== nextIds[index]);
  const addedIds = nextIds.filter((id) => !prevIds.includes(id));
  const removedIds = prevIds.filter((id) => !nextIds.includes(id));
  const prevRequestMap = new Map(previous.requests.map((request) => [request.id, request]));
  const nextRequestMap = new Map(next.requests.map((request) => [request.id, request]));
  const changedCommonIds = nextIds
    .filter((id) => prevRequestMap.has(id))
    .filter((id) => JSON.stringify(prevRequestMap.get(id)) !== JSON.stringify(nextRequestMap.get(id)));

  if (requestOrderChanged) {
    return { type: 'full', snapshot: next };
  }

  if (addedIds.length === 0 && removedIds.length === 0) {
    if (changedCommonIds.length === 0 && previous.selectedRequestId !== next.selectedRequestId) {
      return { type: 'selection', snapshot: next };
    }

    if (changedCommonIds.length === 1) {
      const request = nextRequestMap.get(changedCommonIds[0]);
      if (request) {
        return { type: 'request', snapshot: next, request };
      }
    }

    return { type: 'full', snapshot: next };
  }

  if (addedIds.length === 1 && removedIds.length === 0 && changedCommonIds.length === 0) {
    const request = nextRequestMap.get(addedIds[0]);
    if (request) {
      return { type: 'request', snapshot: next, request };
    }
  }

  if (removedIds.length === 1 && addedIds.length === 0 && changedCommonIds.length === 0) {
    return { type: 'delete', snapshot: next, requestId: removedIds[0] };
  }

  return { type: 'full', snapshot: next };
};

export const RequestPage: React.FC = () => {
  const setRequestsState = useRequestStore((state) => state.setRequestsState);
  const initializedRef = useRef(false);
  const lastSavedRef = useRef('');
  const lastSavedSnapshotRef = useRef<RequestStatePayload>({
    requests: [],
    folders: [],
    selectedRequestId: null,
  });
  const saveTimerRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const persistRequestState = useCallback((request: RequestPersistRequest) => {
    const serialized = serializeRequestSnapshot(request.snapshot);
    if (serialized === lastSavedRef.current) {
      return Promise.resolve();
    }

    const persistTask = async () => {
      setIsSaving(true);
      setSaveError(null);

      try {
        if (request.type === 'request') {
          await saveRequestItem({
            request: request.request,
            selectedRequestId: request.snapshot.selectedRequestId,
          });
        } else if (request.type === 'delete') {
          await deleteRequestItem(request.requestId, request.snapshot.selectedRequestId);
        } else if (request.type === 'selection') {
          await saveRequestSelection(request.snapshot.selectedRequestId);
        } else {
          await saveRequestState(request.snapshot);
        }

        lastSavedRef.current = serialized;
        lastSavedSnapshotRef.current = request.snapshot;
        setLastSavedAt(Date.now());
      } catch (error) {
        const details = getErrorMessage(error);
        setSaveError(details);
        throw new Error(details);
      } finally {
        setIsSaving(false);
      }
    };

    savePromiseRef.current = savePromiseRef.current
      .catch(() => undefined)
      .then(persistTask);

    return savePromiseRef.current;
  }, []);

  const persistRequestStateNow = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const snapshot = buildRequestSnapshot(useRequestStore.getState());
    const request = buildRequestPersistRequest(lastSavedSnapshotRef.current, snapshot);
    if (!request) {
      await savePromiseRef.current;
      return;
    }

    await persistRequestState(request);
  }, [persistRequestState]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setIsLoading(true);
      try {
        const data = await fetchRequestState();
        if (cancelled) {
          return;
        }
        setRequestsState(data.requests, data.selectedRequestId, data.folders);
        setSaveError(null);
      } catch (error) {
        const details = getErrorMessage(error);
        setSaveError(details);
        console.error('Failed to load requests state from DB:', details);
      } finally {
        if (cancelled) {
          return;
        }
        const snapshot = buildRequestSnapshot(useRequestStore.getState());
        lastSavedRef.current = serializeRequestSnapshot(snapshot);
        lastSavedSnapshotRef.current = snapshot;
        initializedRef.current = true;
        setIsLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [setRequestsState]);

  useEffect(() => {
    const unsubscribe = useRequestStore.subscribe((state) => {
      if (!initializedRef.current || isLoading) {
        return;
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(async () => {
        const snapshot = buildRequestSnapshot(state);
        const request = buildRequestPersistRequest(lastSavedSnapshotRef.current, snapshot);
        if (!request) {
          return;
        }
        try {
          await persistRequestState(request);
        } catch (error) {
          const details = getErrorMessage(error);
          console.error('Failed to save requests state to DB:', details);
        }
      }, 1200);
    });

    return () => {
      unsubscribe();
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [isLoading, persistRequestState]);

  return (
    <>
      <Sidebar
        isLoading={isLoading}
        isSaving={isSaving}
        saveError={saveError}
        lastSavedAt={lastSavedAt}
        onPersistNow={persistRequestStateNow}
      />
      <Content className="flex-1 min-h-0 overflow-hidden bg-[#f5f5f5]" style={{ padding: 0 }}>
        <div className="h-full overflow-auto p-4">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-12 rounded-lg bg-gray-200/80" />
              <div className="h-[520px] rounded-lg bg-white border border-gray-200" />
            </div>
          ) : (
            <RequestEditor />
          )}
        </div>
      </Content>
    </>
  );
};
