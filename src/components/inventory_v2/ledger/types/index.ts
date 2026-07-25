import { SkuV2, WarehouseLocationV2 } from '../../../../api/mfgApiV2';

export interface LedgerEntryV2 {
  _id: string;
  transactionNumber: string;
  transactionType: 'Purchase' | 'Processing' | 'Production' | 'Transfer' | 'Adjustment' | 'Sale' | 'Opening Balance';
  skuId: SkuV2;
  quantity: number;
  unit: string;
  direction: 'IN' | 'OUT';
  referenceType: string;
  referenceId: string;
  warehouseId: WarehouseLocationV2;
  floorId: WarehouseLocationV2;
  zoneId: WarehouseLocationV2;
  locationId: WarehouseLocationV2;
  remarks?: string;
  createdBy: {
    _id: string;
    fullName: string;
    email: string;
  };
  status: 'Posted' | 'Pending' | 'Cancelled';
  reels?: {
    reelNumber: string;
    gsm: number;
    width: number;
    weight: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface LedgerFetchParams {
  companyId: string;
  skuId?: string;
  locationId?: string;
  transactionType?: string;
  excludeType?: string;
  direction?: string;
  startDate?: string;
  endDate?: string;
  referenceId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LedgerFetchResponse {
  entries: LedgerEntryV2[];
  total: number;
  page: number;
  limit: number;
}
