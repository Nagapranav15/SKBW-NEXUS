import { SalesInvoice } from '../../api/invoiceApi';

export interface DispatchDeliveryRecord {
  id: string;
  dispatchNo: string;
  dispatchDate: string;
  customerName: string;
  customerPhone?: string;
  region: string;
  city: string;
  orderNumber: string;
  itemCount: number;
  totalGbl: number;
  totalPcs: number;
  transporterName: string;
  vehicleNumber?: string;
  lrNumber?: string;
  lrDate?: string;
  packagesCount?: number;
  invoiceStatus: 'Not Invoiced' | 'Partially Invoiced' | 'Invoiced';
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  days: number;
  billToAddress?: {
    name?: string;
    firmName?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
  };
  shipToAddress?: {
    name?: string;
    firmName?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
  };
  items: Array<{
    itemCode?: string;
    itemName: string;
    dispatchedGbl: number;
    dispatchedPcs: number;
    uom?: string;
    locationName?: string;
    rate?: number;
    amount?: number;
  }>;
}

// Default arrays are completely empty to ensure 100% dynamic data
export const INITIAL_DISPATCH_DELIVERIES: DispatchDeliveryRecord[] = [];
export const INITIAL_FEATURED_INVOICE: SalesInvoice | null = null;
export const SECOND_FEATURED_INVOICE: SalesInvoice | null = null;
