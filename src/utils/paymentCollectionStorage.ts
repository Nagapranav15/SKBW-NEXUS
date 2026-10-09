import { showToast } from '../components/ui/Toast';

export interface PaymentPhotoProof {
  id: string;
  dataUrl: string;
  timestamp: string;
  type: 'cheque' | 'upi' | 'person' | 'shop';
  filename: string;
}

export interface PaymentCollectionEntry {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  city: string;
  timestamp: string;
  collectorName?: string;
  location?: {
    lat: number;
    lng: number;
  };
  cash?: number;
  cheque?: {
    amount: number;
    number: string;
    bankName?: string;
    depositDate: string;
    photo?: PaymentPhotoProof;
  };
  upi?: {
    amount: number;
    refNumber?: string;
    screenshot?: PaymentPhotoProof;
  };
  totalAmount: number;
  notes?: string;
}

export interface RouteCustomerVisit {
  customerId: string;
  customerName: string;
  city: string;
  pgNo?: string;
  closingBalance: number;
  status: 'not_visited' | 'visited' | 'come_later' | 'payment_collected';
  visitedAt?: string;
  notes?: string;
}

const STORAGE_PAYMENTS_PREFIX = 'skbw_payment_collections_';
const STORAGE_VISITS_PREFIX = 'skbw_route_visits_';

export function getPaymentCollections(companyId?: string): PaymentCollectionEntry[] {
  const key = STORAGE_PAYMENTS_PREFIX + (companyId || 'default');
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse payment collections:', err);
    return [];
  }
}

export function savePaymentCollection(entry: PaymentCollectionEntry, companyId?: string): PaymentCollectionEntry[] {
  const key = STORAGE_PAYMENTS_PREFIX + (companyId || 'default');
  try {
    const existing = getPaymentCollections(companyId);
    const updated = [entry, ...existing];
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('skbw_collections_updated', { detail: { companyId } }));
    return updated;
  } catch (err) {
    console.error('Failed to save payment collection:', err);
    return getPaymentCollections(companyId);
  }
}

export function deletePaymentCollection(id: string, companyId?: string): PaymentCollectionEntry[] {
  const key = STORAGE_PAYMENTS_PREFIX + (companyId || 'default');
  try {
    const existing = getPaymentCollections(companyId);
    const updated = existing.filter(p => p.id !== id);
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('skbw_collections_updated', { detail: { companyId } }));
    return updated;
  } catch (err) {
    console.error('Failed to delete payment collection:', err);
    return getPaymentCollections(companyId);
  }
}

export function getRouteVisits(companyId?: string): Record<string, RouteCustomerVisit> {
  const key = STORAGE_VISITS_PREFIX + (companyId || 'default');
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse route visits:', err);
    return {};
  }
}

export function saveRouteVisit(visit: RouteCustomerVisit, companyId?: string): Record<string, RouteCustomerVisit> {
  const key = STORAGE_VISITS_PREFIX + (companyId || 'default');
  try {
    const existing = getRouteVisits(companyId);
    const updated = { ...existing, [visit.customerId]: visit };
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('skbw_visits_updated', { detail: { companyId } }));
    return updated;
  } catch (err) {
    console.error('Failed to save route visit:', err);
    return getRouteVisits(companyId);
  }
}
