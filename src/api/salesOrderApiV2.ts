import api from './axios';
import { SkuV2 } from './mfgApiV2';

export interface OrderItemComponent {
  componentId?: string;
  skuId?: string;
  skuCode?: string;
  name: string;
  quantity: number;
  uom: string;
  rate: number;
  amount: number;
  notes?: string;
}

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
  gbl?: number;
  pcsPerGbl?: number;
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
  isMixedBundle?: boolean;
  components?: OrderItemComponent[];
}

export interface OtherChargeItem {
  name: string;
  chargeType?: 'per_gbl' | 'fixed' | string;
  quantity: number;
  rate: number;
  amount: number;
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
  transporter?: string;
  otherCharges?: OtherChargeItem[];
  internalNotes?: string;
  billingAddress?: any;
  shippingAddress?: any;
  isInterstate?: boolean;
  items: SalesOrderItemV2[];
  subtotal: number;
  discountPercent?: number;
  discountAmount?: number;
  totalCgst?: number;
  totalSgst?: number;
  totalIgst?: number;
  freightCharges?: number;
  roundOff?: number;
  grandTotal: number;
  paidAmount?: number;
  balanceDue?: number;
  paymentStatus?: 'Unpaid' | 'Partially Paid' | 'Paid' | string;
  payments?: SalesOrderPaymentRecord[];
  materialsStatus: 'Ready' | 'Shortfall' | 'Done';
  fulfillmentStatus?: 'Not Started' | 'Partial' | 'Fulfilled' | 'Pending' | 'Partially Dispatched' | 'Fully Dispatched' | 'In Production' | string;
  status: 'Draft' | 'Confirmed' | 'In Production' | 'Partially Delivered' | 'Delivered' | 'Invoiced' | 'Cancelled' | string;
  customerPhone?: string;
  contactPerson?: string;
  city?: string;
  region?: string;
  agent?: string;
  orderType?: 'Credit' | 'Cash';
  isTemplate?: boolean;
  isLegacy?: boolean;
  createdAt?: string;
}

export interface SalesOrderPaymentRecord {
  _id?: string;
  paymentId?: string;
  amount: number;
  paymentMethod: 'cash' | 'cheque' | 'upi' | 'bank_transfer' | string;
  date: string;
  referenceId?: string;
  cashLocation?: string;
  chequeNumber?: string;
  chequeDate?: string;
  bankName?: string;
  bankBranch?: string;
  chequeStatus?: string;
  upiProvider?: string;
  accountName?: string;
  remarks?: string;
  createdAt?: string;
}

export interface RecordPaymentPayload {
  amount: number;
  paymentMethod: 'cash' | 'cheque' | 'upi' | 'bank_transfer' | string;
  date?: string;
  referenceId?: string;
  cashLocation?: string;
  chequeNumber?: string;
  chequeDate?: string;
  bankName?: string;
  bankBranch?: string;
  chequeStatus?: string;
  upiProvider?: string;
  accountName?: string;
  remarks?: string;
  orderId?: string;
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

export const recordSalesOrderPaymentV2 = async (
  orderId: string,
  paymentData: RecordPaymentPayload
): Promise<{ msg: string; order: SalesOrderV2; customer?: any; payment: SalesOrderPaymentRecord }> => {
  const response = await api.post(`/v2/sales-orders/${orderId}/payments`, paymentData);
  return response.data;
};

export const getSalesOrderPaymentsV2 = async (orderId: string): Promise<{
  orderNumber: string;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: string;
  payments: SalesOrderPaymentRecord[];
}> => {
  const response = await api.get(`/v2/sales-orders/${orderId}/payments`);
  return response.data;
};

