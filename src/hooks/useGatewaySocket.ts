import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketEventEnvelope {
  event: string;
  event_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export function useGatewaySocket(userId?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEventEnvelope | null>(null);
  const [eventsFeed, setEventsFeed] = useState<WebSocketEventEnvelope[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<(payload: Record<string, unknown>) => void>>>(new Map());

  const addListener = useCallback((eventName: string, callback: (payload: Record<string, unknown>) => void) => {
    if (!listenersRef.current.has(eventName)) {
      listenersRef.current.set(eventName, new Set());
    }
    listenersRef.current.get(eventName)!.add(callback);
    return () => {
      listenersRef.current.get(eventName)?.delete(callback);
    };
  }, []);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let isSubscribed = true;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/user/connect${userId ? `?token=${userId}` : ''}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isSubscribed) return;
          setIsConnected(true);
          console.log('[Gateway WS] Connected to user stream');
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const data: WebSocketEventEnvelope = JSON.parse(event.data);
            setLastEvent(data);
            setEventsFeed(prev => [data, ...prev.slice(0, 49)]);

            // Trigger registered listeners
            const specificListeners = listenersRef.current.get(data.event);
            if (specificListeners) {
              specificListeners.forEach(cb => {
                try { cb(data.payload); } catch (e) { console.error(e); }
              });
            }

            // Universal listener
            const allListeners = listenersRef.current.get('*');
            if (allListeners) {
              allListeners.forEach(cb => {
                try { cb(data.payload); } catch (e) { console.error(e); }
              });
            }
          } catch (e) {
            console.error('[Gateway WS] Parse error:', e);
          }
        };

        ws.onclose = () => {
          if (!isSubscribed) return;
          setIsConnected(false);
          // Try reconnect after 3 seconds
          reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (!isSubscribed) return;
          setIsConnected(false);
        };
      } catch (err) {
        console.error('[Gateway WS] Connection failed:', err);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId]);

  return {
    isConnected,
    lastEvent,
    eventsFeed,
    addListener
  };
}
