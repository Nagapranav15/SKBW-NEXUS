import api from '../../../../api/axios';
import { LedgerFetchParams, LedgerFetchResponse, LedgerEntryV2 } from '../types';

export const fetchInventoryLedger = async (params: LedgerFetchParams): Promise<LedgerFetchResponse> => {
  const response = await api.get('/v2/inventory-ledger', { params });
  return response.data;
};

export const fetchInventoryLedgerById = async (id: string, companyId: string): Promise<LedgerEntryV2> => {
  const response = await api.get(`/v2/inventory-ledger/${id}`, {
    params: { companyId }
  });
  return response.data;
};

export const createInventoryLedgerEntry = async (entryData: any): Promise<LedgerEntryV2> => {
  const response = await api.post('/v2/inventory-ledger', entryData);
  return response.data;
};
