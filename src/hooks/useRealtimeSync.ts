import { useEffect, useRef } from 'react';
import { useRealtime, RealtimeEvent } from '../context/RealtimeContext';

/**
 * Custom hook to subscribe a component to real-time ERP updates.
 * Automatically debounces rapid updates to prevent excess server load.
 *
 * @param entities Entity name or array of entity names ('production_order', 'sales_order', 'cutting_slip', 'inventory', etc.)
 * @param onUpdate Callback function to invoke when an entity changes (e.g., refetching data)
 * @param debounceMs Delay in milliseconds to debounce multiple rapid events (default: 300ms)
 */
export function useRealtimeSync(
  entities: string | string[],
  onUpdate: (event: RealtimeEvent) => void,
  debounceMs: number = 300
) {
  const { subscribe, isConnected } = useRealtime();
  const updateRef = useRef(onUpdate);
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    updateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const handleEvent = (event: RealtimeEvent) => {
      if (debounceMs <= 0) {
        updateRef.current(event);
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        updateRef.current(event);
      }, debounceMs);
    };

    const unsubscribe = subscribe(entities, handleEvent);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      unsubscribe();
    };
  }, [subscribe, Array.isArray(entities) ? entities.join(',') : entities, debounceMs]);

  return { isConnected };
}
