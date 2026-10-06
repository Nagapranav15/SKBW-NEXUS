import api from './axios';

export interface InvoiceItem {
  itemId?: string;
  skuId?: any;
  skuCode?: string;
  itemName: string;
  uom: string;
  pcsPerGbl: number;
  dispatchedGbl: number;
  dispatchedPcs: number;
  invoiceQtyGbl: number;
  invoiceQtyPcs: number;
  locationId?: string;
  locationName?: string;
  locationPath?: string;
  rate: number;
  amount: number;
}

export interface AdditionalCharge {
  description: string;
  type: 'Fixed' | 'Percentage';
  amount: number;
}

export interface AddressInfo {
  name?: string;
  firmName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  gstin?: string;
}

export interface SalesInvoice {
  _id?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dispatchId?: any;
  dispatchNumber?: string;
  dispatchDate?: string;
  orderId?: any;
  orderNumber?: string;
  customerId?: any;
  customerName: string;
  customerPhone?: string;
  region?: string;
  city?: string;
  transporterName?: string;
  lrNumber?: string;
  lrDate?: string;
  vehicleNumber?: string;
  numberOfPackages?: number;
  paymentTerms: string;
  dueDate: string;
  billTo: AddressInfo;
  shipTo: AddressInfo;
  sameAsBillTo: boolean;
  items: InvoiceItem[];
  additionalCharges: AdditionalCharge[];
  subtotal: number;
  totalAdditionalCharges: number;
  grandTotal: number;
  totalQtyGbl: number;
  totalQtyPcs: number;
  remarks?: string;
  status: 'draft' | 'created' | 'paid' | 'cancelled';
  printOptions?: {
    companyHeader?: boolean;
    itemWiseDetails?: boolean;
    locationDetails?: boolean;
    transporterDetails?: boolean;
    pageNumbers?: boolean;
    termsConditions?: boolean;
  };
  company?: any;
  createdAt?: string;
  updatedAt?: string;
}

const STORAGE_PREFIX = 'skbw_sales_invoices_';

export const getLocalInvoices = (companyId?: string): SalesInvoice[] => {
  try {
    const key = `${STORAGE_PREFIX}${companyId || 'default'}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed to load local invoices:', err);
    return [];
  }
};

export const saveLocalInvoice = (invoice: SalesInvoice, companyId?: string): void => {
  try {
    const key = `${STORAGE_PREFIX}${companyId || 'default'}`;
    const list = getLocalInvoices(companyId);
    const idx = list.findIndex(i => (i._id && invoice._id && i._id === invoice._id) || i.invoiceNumber === invoice.invoiceNumber);
    let updated: SalesInvoice[];
    if (idx >= 0) {
      updated = [...list];
      updated[idx] = { ...updated[idx], ...invoice };
    } else {
      updated = [invoice, ...list];
    }
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save local invoice:', err);
  }
};

export const deleteLocalInvoice = (idOrNumber: string, companyId?: string): void => {
  try {
    const key = `${STORAGE_PREFIX}${companyId || 'default'}`;
    const list = getLocalInvoices(companyId);
    const filtered = list.filter(i => i._id !== idOrNumber && i.invoiceNumber !== idOrNumber);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to delete local invoice:', err);
  }
};

export const getInvoices = async (companyId?: string, params: any = {}): Promise<SalesInvoice[]> => {
  const queryParams = { ...params, companyId };
  try {
    const res = await api.get('/invoices', { params: queryParams });
    if (Array.isArray(res.data)) {
      // Merge with local invoices
      const local = getLocalInvoices(companyId);
      const map = new Map<string, SalesInvoice>();
      res.data.forEach((inv: SalesInvoice) => {
        if (inv.invoiceNumber) map.set(inv.invoiceNumber, inv);
      });
      local.forEach(inv => {
        if (inv.invoiceNumber && !map.has(inv.invoiceNumber)) {
          map.set(inv.invoiceNumber, inv);
        }
      });
      return Array.from(map.values());
    }
    return getLocalInvoices(companyId);
  } catch (err) {
    console.warn('API getInvoices fallback to localStorage:', err);
    return getLocalInvoices(companyId);
  }
};

export const getNextInvoiceNumber = async (companyId?: string): Promise<string> => {
  try {
    const res = await api.get('/invoices/next-number', { params: { companyId } });
    if (res.data?.invoiceNumber) return res.data.invoiceNumber;
  } catch (_) {}

  // Fallback generation based on local invoices
  const local = getLocalInvoices(companyId);
  const regex = /^INV-26(\d{4})$/i;
  let maxSeq = 898;
  local.forEach(inv => {
    const m = inv.invoiceNumber ? inv.invoiceNumber.match(regex) : null;
    if (m && m[1]) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  });
  return `INV-26${String(maxSeq + 1).padStart(4, '0')}`;
};

export const getInvoiceById = async (id: string, companyId?: string): Promise<SalesInvoice | null> => {
  try {
    const res = await api.get(`/invoices/${id}`);
    if (res.data) return res.data;
  } catch (_) {}
  const local = getLocalInvoices(companyId);
  return local.find(i => i._id === id || i.invoiceNumber === id) || null;
};

export const createInvoice = async (data: Partial<SalesInvoice>): Promise<SalesInvoice> => {
  try {
    const res = await api.post('/invoices', data);
    if (res.data) {
      saveLocalInvoice(res.data, data.company);
      return res.data;
    }
  } catch (err) {
    console.warn('API createInvoice fallback to local:', err);
  }

  const fallbackDoc: SalesInvoice = {
    _id: `local-inv-${Date.now()}`,
    invoiceNumber: data.invoiceNumber || `INV-26${Math.floor(1000 + Math.random() * 9000)}`,
    invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
    customerName: data.customerName || 'Customer',
    paymentTerms: data.paymentTerms || '30 Days',
    dueDate: data.dueDate || '',
    billTo: data.billTo || {},
    shipTo: data.shipTo || {},
    sameAsBillTo: data.sameAsBillTo ?? true,
    items: data.items || [],
    additionalCharges: data.additionalCharges || [],
    subtotal: data.subtotal || 0,
    totalAdditionalCharges: data.totalAdditionalCharges || 0,
    grandTotal: data.grandTotal || 0,
    totalQtyGbl: data.totalQtyGbl || 0,
    totalQtyPcs: data.totalQtyPcs || 0,
    remarks: data.remarks || '',
    status: data.status || 'created',
    ...data
  } as SalesInvoice;

  saveLocalInvoice(fallbackDoc, data.company);
  return fallbackDoc;
};

export const updateInvoice = async (id: string, data: Partial<SalesInvoice>): Promise<SalesInvoice> => {
  try {
    const res = await api.put(`/invoices/${id}`, data);
    if (res.data) {
      saveLocalInvoice(res.data, data.company);
      return res.data;
    }
  } catch (err) {
    console.warn('API updateInvoice fallback to local:', err);
  }
  const local = getLocalInvoices(data.company);
  const found = local.find(i => i._id === id || i.invoiceNumber === id);
  const updated = { ...(found || {}), ...data } as SalesInvoice;
  saveLocalInvoice(updated, data.company);
  return updated;
};

export const deleteInvoice = async (id: string, companyId?: string): Promise<void> => {
  try {
    await api.delete(`/invoices/${id}`);
  } catch (_) {}
  deleteLocalInvoice(id, companyId);
};
