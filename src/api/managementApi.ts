import api from './axios';

export interface Overview {
  receivables: { outstanding: number; advances: number; overdue: number; customersOwing: number; topDebtors: { partyId: string; name: string; outstanding: number; overdue: number }[] };
  invoiced: { amount: number; count: number };
  collections: { amount: number; count: number; byMode: { mode: string; amount: number; count: number }[] };
  stock: { totalValue: number; itemsInStock: number };
  production: { conversions: number; netCost: number };
}
export interface AgeingRow { partyId: string; name: string; current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number; advance: number; net: number }
export interface Ageing { asOf: string; rows: AgeingRow[]; totals: Record<string, number> }
export interface PipelineRes { stages: string[]; counts: Record<string, { orders: number; value: number }>; rows: any[] }
export interface SalesRow { key: string; name: string; invoices: number; invoiced: number; collected: number; outstanding: number }
export interface Statement { openingBalance: number; rows: { _id: string; date: string; txnType: string; direction: 'DR' | 'CR'; amount: number; referenceNumber: string; runningBalance: number; remarks: string }[]; totalDebit: number; totalCredit: number; closingBalance: number }

const p = (companyId: string, extra: Record<string, any> = {}) => ({ params: { companyId, ...extra } });
export const getOverview = (companyId: string, from?: string, to?: string) => api.get<Overview>('/v3/reports/overview', p(companyId, { from, to }));
export const getAgeing = (companyId: string) => api.get<Ageing>('/v3/sales/receivables/ageing', p(companyId));
export const getPipeline = (companyId: string) => api.get<PipelineRes>('/v3/reports/pipeline', p(companyId, { limit: 300 }));
export const getSalesReport = (companyId: string, groupBy: 'month' | 'customer', from?: string, to?: string) =>
  api.get<{ rows: SalesRow[]; totals: Record<string, number> }>('/v3/reports/sales', p(companyId, { groupBy, from, to }));
export const getStatement = (companyId: string, partyId: string, from?: string, to?: string) =>
  api.get<Statement>(`/v3/sales/parties/${partyId}/statement`, p(companyId, { from, to }));
