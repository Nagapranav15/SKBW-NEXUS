// Data Export/Import utilities - API-based (no more localStorage)
import * as XLSX from 'xlsx';
import api from '../api/axios';

export interface ExportData {
  companies: any[];
  parties: any[];
  items: any[];
  quotes: any[];
  salesOrders: any[];
  deliveryChallans: any[];
  dispatchCards: any[];
  exportDate: string;
  exportedBy: string;
}

// Fetch all data from API for export
export const exportAllData = async (companyId?: string): Promise<ExportData> => {
  const params: any = {};
  if (companyId) params.companyId = companyId;

  const [companies, parties, items, quotes, salesOrders, deliveryChallans, dispatchCards] = 
    await Promise.all([
      api.get('/companies').then(r => r.data).catch(() => []),
      api.get('/parties', { params }).then(r => r.data).catch(() => []),
      api.get('/items', { params }).then(r => r.data).catch(() => []),
      api.get('/quotes', { params }).then(r => r.data).catch(() => []),
      api.get('/sales-orders', { params }).then(r => r.data).catch(() => []),
      api.get('/delivery-challans', { params }).then(r => r.data).catch(() => []),
      api.get('/dispatch-cards', { params }).then(r => r.data).catch(() => []),
    ]);

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return {
    companies,
    parties,
    items,
    quotes,
    salesOrders,
    deliveryChallans,
    dispatchCards,
    exportDate: new Date().toISOString(),
    exportedBy: user.fullName || user.username || 'Unknown'
  };
};

// Export data as JSON file
export const exportDataAsJSON = async (companyId?: string) => {
  const data = await exportAllData(companyId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `erp_data_export_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Export data as Excel file with multiple sheets
export const exportDataAsExcel = async (companyId?: string) => {
  const data = await exportAllData(companyId);
  const wb = XLSX.utils.book_new();

  // Create sheets for each data type
  const sheetMap: Record<string, any[]> = {
    companies: data.companies,
    parties: data.parties,
    items: data.items,
    quotes: data.quotes,
    salesOrders: data.salesOrders,
    deliveryChallans: data.deliveryChallans,
    dispatchCards: data.dispatchCards,
  };

  Object.entries(sheetMap).forEach(([key, arr]) => {
    if (arr.length > 0) {
      const ws = XLSX.utils.json_to_sheet(arr);
      XLSX.utils.book_append_sheet(wb, ws, key);
    }
  });

  // Add export info sheet
  const infoWs = XLSX.utils.json_to_sheet([{
    'Export Date': data.exportDate,
    'Exported By': data.exportedBy,
    'Total Companies': data.companies.length,
    'Total Parties': data.parties.length,
    'Total Items': data.items.length,
    'Total Quotes': data.quotes.length,
    'Total Orders': data.salesOrders.length,
    'Total DCs': data.deliveryChallans.length,
    'Total Dispatch Cards': data.dispatchCards.length
  }]);
  XLSX.utils.book_append_sheet(wb, infoWs, 'Export Info');

  XLSX.writeFile(wb, `erp_data_export_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// Import data from JSON file (still client-side read, but could post to API)
export const importDataFromJSON = (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string) as ExportData;

        // Validate data structure
        if (!importedData.companies || !importedData.parties || !importedData.items) {
          throw new Error('Invalid data format');
        }

        // Import companies
        for (const company of importedData.companies) {
          const { _id, __v, createdAt, updatedAt, ...companyData } = company;
          await api.post('/companies', companyData).catch(() => {});
        }

        // Import parties
        for (const party of importedData.parties) {
          const { _id, __v, createdAt, updatedAt, ...partyData } = party;
          await api.post('/parties', partyData).catch(() => {});
        }

        // Import items
        for (const item of importedData.items) {
          const { _id, __v, createdAt, updatedAt, ...itemData } = item;
          await api.post('/items', itemData).catch(() => {});
        }

        // Import quotes
        for (const quote of (importedData.quotes || [])) {
          const { _id, __v, createdAt, updatedAt, ...quoteData } = quote;
          await api.post('/quotes', quoteData).catch(() => {});
        }

        // Import sales orders
        for (const order of (importedData.salesOrders || [])) {
          const { _id, __v, createdAt, updatedAt, ...orderData } = order;
          await api.post('/sales-orders', orderData).catch(() => {});
        }

        // Import delivery challans
        for (const dc of (importedData.deliveryChallans || [])) {
          const { _id, __v, createdAt, updatedAt, ...dcData } = dc;
          await api.post('/delivery-challans', dcData).catch(() => {});
        }

        // Import dispatch cards
        for (const card of (importedData.dispatchCards || [])) {
          const { _id, __v, createdAt, updatedAt, ...cardData } = card;
          await api.post('/dispatch-cards', cardData).catch(() => {});
        }

        resolve(true);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

// Get data summary from API
export const getDataSummary = async (companyId?: string) => {
  try {
    const data = await exportAllData(companyId);
    return {
      companies: data.companies.length,
      customers: data.parties.filter(p => p.type === 'customer').length,
      vendors: data.parties.filter(p => p.type === 'vendor').length,
      staff: data.parties.filter(p => p.type === 'staff' || p.type === 'employee').length,
      finishedGoods: data.items.filter(i => i.category === 'finished').length,
      rawMaterials: data.items.filter(i => i.category === 'raw').length,
      semiFinished: data.items.filter(i => i.category === 'semi').length,
      quotes: data.quotes.length,
      orders: data.salesOrders.length,
      deliveryChallans: data.deliveryChallans.length,
      dispatchCards: data.dispatchCards.length,
      lastExport: localStorage.getItem('lastExportDate') || 'Never'
    };
  } catch {
    return {
      companies: 0, customers: 0, vendors: 0, staff: 0,
      finishedGoods: 0, rawMaterials: 0, semiFinished: 0,
      quotes: 0, orders: 0, deliveryChallans: 0, dispatchCards: 0,
      lastExport: 'Never'
    };
  }
};

// Save export timestamp
export const saveExportTimestamp = () => {
  localStorage.setItem('lastExportDate', new Date().toISOString());
};