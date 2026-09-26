import { ProductionOrder, ProductionEntry } from '../types/production';

const STORAGE_PREFIX = 'skbw_production_orders_v1_';

export const getProductionOrders = (companyId?: string): ProductionOrder[] => {
  try {
    const key = `${STORAGE_PREFIX}${companyId || 'default'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to get production orders from localStorage:', err);
    return [];
  }
};

export const getProductionOrderById = (idOrNumber: string, companyId?: string): ProductionOrder | undefined => {
  const orders = getProductionOrders(companyId);
  return orders.find(o => o._id === idOrNumber || o.orderNumber.toLowerCase() === idOrNumber.toLowerCase());
};

export const saveProductionOrder = (order: ProductionOrder, companyId?: string): void => {
  try {
    const key = `${STORAGE_PREFIX}${companyId || 'default'}`;
    const orders = getProductionOrders(companyId);
    const existingIndex = orders.findIndex(o => o._id === order._id || o.orderNumber === order.orderNumber);

    let updated: ProductionOrder[];
    if (existingIndex >= 0) {
      updated = [...orders];
      updated[existingIndex] = { ...updated[existingIndex], ...order, updatedAt: new Date().toISOString() };
    } else {
      updated = [order, ...orders];
    }

    updated.sort((a, b) => b.orderNumber.localeCompare(a.orderNumber, undefined, { numeric: true, sensitivity: 'base' }));
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save production order to localStorage:', err);
  }
};

export const deleteProductionOrder = (idOrNumber: string, companyId?: string): void => {
  try {
    const key = `${STORAGE_PREFIX}${companyId || 'default'}`;
    const orders = getProductionOrders(companyId);
    const filtered = orders.filter(o => o._id !== idOrNumber && o.orderNumber !== idOrNumber);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete production order:', err);
  }
};

export const clearLocalProductionOrders = (companyId?: string): void => {
  try {
    const key = `${STORAGE_PREFIX}${companyId || 'default'}`;
    localStorage.removeItem(key);
  } catch (err) {
    console.error('Failed to clear local production orders:', err);
  }
};
