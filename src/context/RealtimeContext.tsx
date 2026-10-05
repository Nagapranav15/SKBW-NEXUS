import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../api/axios';

export interface RealtimeEvent {
  entity: string;
  action: string;
  data?: any;
  id?: string;
  referenceId?: string;
  timestamp: number;
  [key: string]: any;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeContextType {
  isConnected: boolean;
  lastEvent: RealtimeEvent | null;
  subscribe: (entities: string | string[], callback: RealtimeListener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType>({
  isConnected: false,
  lastEvent: null,
  subscribe: () => () => {}
});

export const useRealtime = () => useContext(RealtimeContext);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, selectedCompany, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  // Active listeners map: entity -> Set of callbacks
  const listenersRef = useRef<Map<string, Set<RealtimeListener>>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<any>(null);

  // Subscribe function that components/hooks can use
  const subscribe = useCallback((entities: string | string[], callback: RealtimeListener) => {
    const entityList = Array.isArray(entities) ? entities : [entities];
    
    entityList.forEach(ent => {
      if (!listenersRef.current.has(ent)) {
        listenersRef.current.set(ent, new Set());
      }
      listenersRef.current.get(ent)!.add(callback);
    });

    // Cleanup unsubscription function
    return () => {
      entityList.forEach(ent => {
        const set = listenersRef.current.get(ent);
        if (set) {
          set.delete(callback);
          if (set.size === 0) {
            listenersRef.current.delete(ent);
          }
        }
      });
    };
  }, []);

  // Connect to SSE stream
  useEffect(() => {
    const companyId = selectedCompany?._id || selectedCompany?.id;
    const currentToken = token || localStorage.getItem('token');

    // Only connect if authenticated with a company selected
    if (!isAuthenticated || !companyId || !currentToken) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isMounted = true;

    const connectSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const streamUrl = `${API_BASE_URL}/realtime/stream?companyId=${encodeURIComponent(companyId)}&token=${encodeURIComponent(currentToken)}`;

      try {
        const es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        es.onopen = () => {
          if (isMounted) {
            setIsConnected(true);
          }
        };

        es.onmessage = (e) => {
          if (!isMounted) return;
          try {
            const parsed = JSON.parse(e.data);
            
            // Ignore keep-alive heartbeats
            if (parsed.type === 'ping') {
              return;
            }

            const evt: RealtimeEvent = parsed;
            setLastEvent(evt);

            // Notify specific entity subscribers
            if (evt.entity && listenersRef.current.has(evt.entity)) {
              listenersRef.current.get(evt.entity)!.forEach(cb => {
                try { cb(evt); } catch (err) { console.error('Realtime callback error:', err); }
              });
            }

            // Notify wildcard '*' subscribers
            if (listenersRef.current.has('*')) {
              listenersRef.current.get('*')!.forEach(cb => {
                try { cb(evt); } catch (err) { console.error('Realtime callback error:', err); }
              });
            }

            // Also dispatch global window CustomEvent for any decoupled vanilla listeners
            window.dispatchEvent(new CustomEvent('erp:realtime', { detail: evt }));
            if (evt.entity) {
              window.dispatchEvent(new CustomEvent(`erp:realtime:${evt.entity}`, { detail: evt }));
            }
          } catch (err) {
            // Non-JSON message or ping
          }
        };

        es.onerror = () => {
          if (!isMounted) return;
          setIsConnected(false);
          es.close();
          eventSourceRef.current = null;

          // Attempt reconnect after 3 seconds
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            if (isMounted) connectSSE();
          }, 3000);
        };
      } catch (err) {
        console.error('Failed to establish Realtime SSE connection:', err);
      }
    };

    connectSSE();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isAuthenticated, token, selectedCompany?._id, selectedCompany?.id]);

  return (
    <RealtimeContext.Provider value={{ isConnected, lastEvent, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
};
