import { SalesOrderV2 } from '../api/salesOrderApiV2';

const LEGACY_STORAGE_KEY = 'skbw_custom_sales_orders_v2';

export const getCustomSalesOrders = (companyId?: string): SalesOrderV2[] => {
  try {
    if (!companyId) return [];
    const scopedKey = `skbw_custom_sales_orders_v2_${companyId}`;
    
    // Check legacy key and migrate if any
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      try {
        const legacyList = JSON.parse(legacyRaw);
        if (Array.isArray(legacyList)) {
          // Group legacy orders by their company
          const byComp: Record<string, SalesOrderV2[]> = {};
          legacyList.forEach((o: any) => {
            const cId = String(o.company?._id || o.company || '');
            if (cId) {
              if (!byComp[cId]) byComp[cId] = [];
              byComp[cId].push(o);
            }
          });

          // Save into scoped keys
          Object.entries(byComp).forEach(([cId, items]) => {
            const k = `skbw_custom_sales_orders_v2_${cId}`;
            const existingRaw = localStorage.getItem(k);
            const existingItems: SalesOrderV2[] = existingRaw ? JSON.parse(existingRaw) : [];
            const map = new Map<string, SalesOrderV2>();
            existingItems.forEach(item => map.set(item._id || item.orderNumber, item));
            items.forEach(item => {
              const id = item._id || item.orderNumber;
              if (id && !map.has(id)) map.set(id, item);
            });
            localStorage.setItem(k, JSON.stringify(Array.from(map.values())));
          });
        }
      } catch (err) {
        console.warn('Failed to parse legacy custom sales orders:', err);
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const raw = localStorage.getItem(scopedKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Strictly ensure no foreign company order leaks
    return parsed.filter((o: any) => {
      const cId = String(o.company?._id || o.company || '');
      return !cId || cId === String(companyId);
    });
  } catch (err) {
    console.warn('Failed to read custom sales orders from localStorage:', err);
    return [];
  }
};

export const saveCustomSalesOrder = (order: SalesOrderV2, targetCompanyId?: string): void => {
  try {
    if (!order) return;
    const companyId = targetCompanyId || String((order as any).company?._id || (order as any).company || '');
    if (!companyId) return;

    const scopedKey = `skbw_custom_sales_orders_v2_${companyId}`;
    const existing = getCustomSalesOrders(companyId);
    const orderWithCompany = { ...order, company: companyId as any };

    const idx = existing.findIndex(
      o => (o._id && order._id && o._id === order._id) || 
           (o.orderNumber && order.orderNumber && o.orderNumber === order.orderNumber)
    );

    let updated: SalesOrderV2[];
    if (idx >= 0) {
      updated = [...existing];
      updated[idx] = { ...existing[idx], ...orderWithCompany };
    } else {
      updated = [orderWithCompany, ...existing];
    }

    localStorage.setItem(scopedKey, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save custom sales order to localStorage:', err);
  }
};

export const deleteCustomSalesOrder = (idOrNumber: string, companyId?: string): void => {
  try {
    if (companyId) {
      const scopedKey = `skbw_custom_sales_orders_v2_${companyId}`;
      const existing = getCustomSalesOrders(companyId);
      const filtered = existing.filter(o => o._id !== idOrNumber && o.orderNumber !== idOrNumber);
      localStorage.setItem(scopedKey, JSON.stringify(filtered));
    } else {
      // Clear from any matching key
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('skbw_custom_sales_orders_v2')) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const filtered = list.filter((o: any) => o._id !== idOrNumber && o.orderNumber !== idOrNumber);
                localStorage.setItem(key, JSON.stringify(filtered));
              }
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.error('Failed to delete custom sales order from localStorage:', err);
  }
};

