import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from 'antd';
import axios from 'axios';
import { Sidebar } from '../components/Sidebar';
import { RequestEditor } from '../components/RequestEditor';
import { RouteSidebar } from '../components/RouteSidebar';
import { fetchRequestState, saveRequestState } from '../api/http';
import { useRequestStore } from '../store/requestStore';

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

export const RequestPage: React.FC = () => {
  const setRequestsState = useRequestStore((state) => state.setRequestsState);
  const initializedRef = useRef(false);
  const lastSavedRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);
  const latestSaveRequestIdRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const persistRequestState = useCallback(
    async (payload: { requests: ReturnType<typeof useRequestStore.getState>['requests']; selectedRequestId: string | null }) => {
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedRef.current) {
        return;
      }

      const requestId = latestSaveRequestIdRef.current + 1;
      latestSaveRequestIdRef.current = requestId;
      setIsSaving(true);
      setSaveError(null);

      try {
        await saveRequestState(payload);
        lastSavedRef.current = serialized;
        setLastSavedAt(Date.now());
      } catch (error) {
        const details = getErrorMessage(error);
        setSaveError(details);
        throw new Error(details);
      } finally {
        if (latestSaveRequestIdRef.current === requestId) {
          setIsSaving(false);
        }
      }
    },
    []
  );

  const persistRequestStateNow = useCallback(async () => {
    const snapshot = useRequestStore.getState();
    await persistRequestState({
      requests: snapshot.requests,
      selectedRequestId: snapshot.selectedRequestId,
    });
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
        setRequestsState(data.requests, data.selectedRequestId);
        setSaveError(null);
      } catch (error) {
        const details = getErrorMessage(error);
        setSaveError(details);
        console.error('Failed to load requests state from DB:', details);
      } finally {
        if (cancelled) {
          return;
        }
        const snapshot = useRequestStore.getState();
        lastSavedRef.current = JSON.stringify({
          requests: snapshot.requests,
          selectedRequestId: snapshot.selectedRequestId,
        });
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
        const payload = {
          requests: state.requests,
          selectedRequestId: state.selectedRequestId,
        };
        try {
          await persistRequestState(payload);
        } catch (error) {
          const details = getErrorMessage(error);
          console.error('Failed to save requests state to DB:', details);
        }
      }, 500);
    });

    return () => {
      unsubscribe();
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [isLoading, persistRequestState]);

  return (
    <Layout className="h-screen bg-white overflow-hidden">
      <RouteSidebar />
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
    </Layout>
  );
};
