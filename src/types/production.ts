export type ProductionStatus = 'Planned' | 'In Production' | 'Completed' | 'Not Started' | 'Cancelled';
export type MaterialStatus = 'Ready' | 'Shortage';
export type ItemType = 'Finished Good' | 'Semi Finished' | 'Raw Material';
export type PriorityLevel = 'Normal' | 'High' | 'Urgent' | 'Low';

export interface ProductionBomItem {
  id: string;
  component: string;
  code?: string;
  type: 'Raw' | 'Semi' | 'Finished';
  qtyPerBatch: number; // e.g. 1, 26
  totalRequired: number; // e.g. 2,800, 72,800
  uom: string; // e.g. 'PCS', 'KGS'
  availableStock: number; // e.g. 4,200
  stockStatus: MaterialStatus;
  rate: number; // Unit rate in INR
  amount: number; // Total amount in INR
  issuedQty?: number;
  issuedStatus?: 'Issued' | 'Pending' | 'Partial';
}

export interface ProductionEntry {
  id: string;
  date: string; // e.g. '23 Sep 2026'
  shift: string; // e.g. 'Day' | 'Night' | 'Day Shift'
  producedQty: number; // e.g. 5
  producedUom: string; // e.g. 'GBL'
  producedPcs: number; // e.g. 700
  cumulativeQty: number; // e.g. 5
  cumulativePcs: number; // e.g. 700
  remarks?: string;
  createdBy: string; // e.g. 'Kalyan S'
  createdAt?: string;
}

export interface FinishedGoodsBatch {
  batchNo: string; // e.g. 'BATCH-2026-0008'
  manufacturingDate: string; // e.g. '23 Sep 2026'
  expiryDate?: string;
  producedQuantity: string; // e.g. '20 GBL (2,800 PCS)'
  receivedToLocation: string; // e.g. 'Main Factory -> Finished Goods - A1'
  status: 'In Stock' | 'Allocated' | 'Dispatched';
  batchRemarks?: string;
}

export interface StockUpdateItem {
  item: string;
  quantityIn: number;
  uom: string;
  location: string;
}

export interface ProductionOrder {
  _id: string;
  orderNumber: string; // e.g. 'PR-2026-0049'
  itemName: string; // e.g. '112P COLLEGE STYLE KING (UR)'
  itemCode: string; // e.g. 'FG-001'
  itemType: ItemType;
  plannedQty: number; // e.g. 20
  plannedUom: string; // e.g. 'GBL' or 'PCS'
  plannedPcs: number; // e.g. 2800
  conversionFactor: number; // e.g. 140 (1 GBL = 140 PCS)
  producedQty: number; // e.g. 10
  producedPcs: number; // e.g. 1400
  balanceQty: number; // e.g. 10
  balancePcs: number; // e.g. 1400
  materialStatus: MaterialStatus;
  status: ProductionStatus;
  progress: number; // 0 to 100
  department: string; // e.g. 'Notebook Manufacturing'
  factory: string; // e.g. 'Main Factory' / Location name
  locationId?: string;
  locationName?: string;
  warehouseId?: string;
  floorId?: string;
  zoneId?: string;
  plannedStartDate: string; // e.g. '2026-09-23'
  requiredCompletionDate: string; // e.g. '2026-09-25'
  actualCompletionDate?: string; // e.g. '25 Sep 2026, 04:30 PM'
  completedBy?: string;
  priority: PriorityLevel;
  reference?: string; // e.g. 'Sales Order #SO-1029' or 'Not Selected'
  remarks?: string;
  bomType: 'Default BOM' | 'Custom BOM (Production Order Only)';
  bomItems: ProductionBomItem[];
  productionEntries: ProductionEntry[];
  finishedGoodsBatch?: FinishedGoodsBatch;
  stockUpdates?: StockUpdateItem[];
  company?: string;
  createdAt: string;
  updatedAt?: string;
}
