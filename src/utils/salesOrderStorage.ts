import { SalesOrderV2 } from '../api/salesOrderApiV2';

const STORAGE_KEY = 'skbw_custom_sales_orders_v2';

export const getCustomSalesOrders = (): SalesOrderV2[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to read custom sales orders from localStorage:', err);
    return [];
  }
};

export const saveCustomSalesOrder = (order: SalesOrderV2): void => {
  try {
    if (!order) return;
    const existing = getCustomSalesOrders();
    const idx = existing.findIndex(
      o => (o._id && order._id && o._id === order._id) || 
           (o.orderNumber && order.orderNumber && o.orderNumber === order.orderNumber)
    );

    let updated: SalesOrderV2[];
    if (idx >= 0) {
      updated = [...existing];
      updated[idx] = { ...existing[idx], ...order };
    } else {
      updated = [order, ...existing];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save custom sales order to localStorage:', err);
  }
};

export const deleteCustomSalesOrder = (idOrNumber: string): void => {
  try {
    const existing = getCustomSalesOrders();
    const filtered = existing.filter(o => o._id !== idOrNumber && o.orderNumber !== idOrNumber);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete custom sales order from localStorage:', err);
  }
};
