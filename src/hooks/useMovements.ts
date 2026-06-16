import { useState, useCallback } from 'react';
import * as invApi from '../api/inventoryApi';

interface UseMovementsOptions {
  companyId?: string;
}

export const useMovements = ({ companyId }: UseMovementsOptions = {}) => {
  const [movements, setMovements] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchMovements = useCallback(async (options?: any) => {
    setLoading(true);
    try {
      const res = await invApi.getAllStockMovements(companyId, options);
      setMovements(res.data.movements || []);
      setTotal(res.data.total || 0);
      return res.data;
    } catch (err: any) {
      console.error('Movements fetch error:', err);
      return { movements: [], total: 0 };
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const fetchItemMovements = useCallback(async (itemId: string, options?: any) => {
    setLoading(true);
    try {
      const res = await invApi.getStockMovements(itemId, companyId);
      return res.data;
    } catch (err: any) {
      console.error('Item movements error:', err);
      return { movements: [], total: 0 };
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  return { movements, total, loading, fetchMovements, fetchItemMovements };
};

export default useMovements;
