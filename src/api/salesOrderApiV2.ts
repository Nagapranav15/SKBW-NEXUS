import api from './axios';
import { SkuV2 } from './mfgApiV2';

export interface SalesOrderItemV2 {
  _id?: string;
  skuId?: SkuV2 | string;
  skuCode: string;
  itemName: string;
  category?: string;
  uom: string;
  altUnit?: string;
  altUnitConversion?: number;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxableAmount?: number;
  hsnCode?: string;
  gstRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalAmount: number;
  dispatchedQty?: number;
}

export interface SalesOrderV2 {
  _id?: string;
  orderNumber: string;
  company: string;
  customer?: any;
  customerId?: string;
  customerName: string;
  orderDate: string;
  promisedDate?: string;
  customerPoNumber?: string;
  customerPoDate?: string;
  facility?: string;
  internalNotes?: string;
  billingAddress?: any;
  shippingAddress?: any;
  isInterstate?: boolean;
  items: SalesOrderItemV2[];
  subtotal: number;
  totalCgst?: number;
  totalSgst?: number;
  totalIgst?: number;
  freightCharges?: number;
  roundOff?: number;
  grandTotal: number;
  materialsStatus: 'Ready' | 'Shortfall' | 'Done';
  fulfillmentStatus: 'Not Started' | 'Partial' | 'Fulfilled';
  status: 'Draft' | 'Confirmed' | 'In Production' | 'Partially Delivered' | 'Delivered' | 'Invoiced' | 'Cancelled';
  isTemplate?: boolean;
  isLegacy?: boolean;
  createdAt?: string;
}

export interface BomRequirementResult {
  orderId: string;
  orderNumber: string;
  customerName: string;
  promisedDate: string;
  grandTotal: number;
  productsToManufacture: {
    skuId: string;
    skuCode: string;
    itemName: string;
    uom: string;
    orderedQty: number;
    dispatchedQty: number;
    presentStock: number;
    netToManufacture: number;
    bomDefined: boolean;
  }[];
  rawMaterialsList: {
    materialName: string;
    uom: string;
    requiredQty: number;
    availableStock: number;
    shortfallQty: number;
    status: 'Ready' | 'Shortfall';
  }[];
  materialsStatus: 'Ready' | 'Shortfall';
}

export const getSalesOrdersV2 = async (
  companyId: string,
  status?: string,
  period?: string,
  search?: string
): Promise<SalesOrderV2[]> => {
  const response = await api.get('/v2/sales-orders', {
    params: { companyId, status, period, search }
  });
  return response.data;
};

export const getSalesOrderV2ById = async (id: string): Promise<SalesOrderV2> => {
  const response = await api.get(`/v2/sales-orders/${id}`);
  return response.data;
};

export const createSalesOrderV2 = async (orderData: Partial<SalesOrderV2>): Promise<SalesOrderV2> => {
  const response = await api.post('/v2/sales-orders', orderData);
  return response.data;
};

export const updateSalesOrderV2 = async (id: string, orderData: Partial<SalesOrderV2>): Promise<SalesOrderV2> => {
  const response = await api.put(`/v2/sales-orders/${id}`, orderData);
  return response.data;
};

export const updateSalesOrderV2Status = async (
  id: string,
  statusPayload: { status?: string; fulfillmentStatus?: string; materialsStatus?: string }
): Promise<SalesOrderV2> => {
  const response = await api.patch(`/v2/sales-orders/${id}/status`, statusPayload);
  return response.data.order;
};

export const getSalesOrderBomRequirementsV2 = async (id: string): Promise<BomRequirementResult> => {
  const response = await api.get(`/v2/sales-orders/${id}/bom-requirements`);
  return response.data;
};

export const getNextSalesOrderNumberV2 = async (companyId: string): Promise<string> => {
  const response = await api.get('/v2/sales-orders/next-number', {
    params: { companyId }
  });
  return response.data.nextOrderNumber;
};
