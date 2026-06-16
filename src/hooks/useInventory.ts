import { useState, useEffect, useCallback } from 'react';
import * as invApi from '../api/inventoryApi';
import * as ledgerApi from '../api/inventoryLedgerApi';

interface UseInventoryOptions {
  companyId?: string;
  autoLoad?: boolean;
}

export const useInventory = ({ companyId, autoLoad = true }: UseInventoryOptions = {}) => {
  const [summary, setSummary] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await invApi.getInventorySummary(companyId);
      setSummary(res.data);
    } catch (err: any) {
      setError(err.response?.data?.msg || err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const fetchBalances = useCallback(async (filters?: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ledgerApi.getInventoryBalances({ companyId, ...filters });
      setBalances(res.data.balances || []);
      return res.data;
    } catch (err: any) {
      setError(err.response?.data?.msg || err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const fetchLowStock = useCallback(async () => {
    try {
      const res = await ledgerApi.getLowStockItems(companyId);
      setLowStock(res.data);
      return res.data;
    } catch (err: any) {
      console.error('Low stock fetch error:', err);
      return [];
    }
  }, [companyId]);

  const fetchDashboardSummary = useCallback(async () => {
    try {
      const res = await ledgerApi.getInventoryDashboardSummary(companyId);
      setDashboardSummary(res.data);
      return res.data;
    } catch (err: any) {
      console.error('Dashboard summary error:', err);
      return null;
    }
  }, [companyId]);

  const addStock = useCallback(async (data: any) => {
    try {
      const res = await invApi.addStock({ ...data, company: companyId });
      await fetchSummary();
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.msg || err.message };
    }
  }, [companyId, fetchSummary]);

  const transferStock = useCallback(async (id: string, targetWarehouse: string, targetSectionId: string, quantity: number) => {
    try {
      await invApi.transferStock(id, targetWarehouse, targetSectionId, quantity);
      await fetchSummary();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.msg || err.message };
    }
  }, [fetchSummary]);

  const removeStock = useCallback(async (id: string) => {
    try {
      await invApi.removeStock(id);
      await fetchSummary();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.msg || err.message };
    }
  }, [fetchSummary]);

  const recordOpeningStock = useCallback(async (data: any) => {
    try {
      const res = await ledgerApi.recordOpeningStock({ ...data, company: companyId });
      await fetchSummary();
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.msg || err.message };
    }
  }, [companyId, fetchSummary]);

  const bulkAdjust = useCallback(async (adjustments: any[]) => {
    try {
      const res = await ledgerApi.bulkAdjustment({ adjustments, company: companyId });
      await fetchSummary();
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.msg || err.message };
    }
  }, [companyId, fetchSummary]);

  const exportCSV = useCallback(async () => {
    try {
      const res = await ledgerApi.exportInventory(companyId);
      return res.data;
    } catch (err: any) {
      console.error('Export error:', err);
      return null;
    }
  }, [companyId]);

  useEffect(() => {
    if (autoLoad && companyId) {
      fetchSummary();
    }
  }, [autoLoad, companyId, fetchSummary]);

  return {
    summary, balances, lowStock, dashboardSummary, loading, error,
    fetchSummary, fetchBalances, fetchLowStock, fetchDashboardSummary,
    addStock, transferStock, removeStock, recordOpeningStock, bulkAdjust, exportCSV,
    refresh: fetchSummary
  };
};

export default useInventory;
