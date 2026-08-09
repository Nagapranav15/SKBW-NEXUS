import api from '../../../api/axios';
import { SkuV2, WarehouseLocationV2 } from '../../../api/mfgApiV2';

export interface PurchaseInvoiceItemV2 {
  skuId: SkuV2 | string;
  quantity: number;
  unit: string;
  purchasePrice: number;
  totalPrice: number;
  lotNumber: string;
  locationId: WarehouseLocationV2 | string;
  reamWeight?: number;
  ratePerKg?: number;
}

export interface PurchaseInvoiceV2 {
  _id?: string;
  invoiceNumber: string;
  vendorId: {
    _id: string;
    firmName: string;
    ownerName: string;
    phone?: string;
    email?: string;
    outstanding?: number;
  } | string;
  items: PurchaseInvoiceItemV2[];
  subTotal: number;
  taxAmount: number;
  grandTotal: number;
  paymentStatus: 'Unpaid' | 'Partially Paid' | 'Paid';
  paidAmount: number;
  dueDate?: string;
  remarks?: string;
  createdBy?: {
    _id: string;
    fullName: string;
  };
  createdAt?: string;
  status: 'Draft' | 'Posted' | 'Cancelled';
}

export interface FetchInvoicesResponse {
  invoices: PurchaseInvoiceV2[];
  total: number;
  page: number;
  limit: number;
}

export const getPurchaseInvoicesV2 = async (params: {
  companyId: string;
  vendorId?: string;
  paymentStatus?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<FetchInvoicesResponse> => {
  const response = await api.get('/v2/purchases/invoices', { params });
  return response.data;
};

export const createPurchaseInvoiceV2 = async (invoiceData: any): Promise<PurchaseInvoiceV2> => {
  const response = await api.post('/v2/purchases/invoices', invoiceData);
  return response.data;
};

export const recordPurchasePaymentV2 = async (paymentData: {
  vendorId: string;
  amount: number;
  paymentMethod?: string;
  referenceId?: string;
  invoiceId?: string;
  remarks?: string;
  company: string;
}): Promise<any> => {
  const response = await api.post('/v2/purchases/payments', paymentData);
  return response.data;
};

export const updatePurchaseInvoiceV2 = async (id: string, invoiceData: any): Promise<PurchaseInvoiceV2> => {
  const response = await api.put(`/v2/purchases/invoices/${id}`, invoiceData);
  return response.data;
};

export const deletePurchaseInvoiceV2 = async (id: string, companyId: string): Promise<any> => {
  const response = await api.delete(`/v2/purchases/invoices/${id}`, {
    params: { company: companyId }
  });
  return response.data;
};
