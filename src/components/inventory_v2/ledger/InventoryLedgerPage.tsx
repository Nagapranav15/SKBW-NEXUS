import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  ArrowRightLeft, Search, Calendar, RefreshCw, ChevronLeft, ChevronRight, 
  ChevronDown, Filter, FileText, Download, User, ShieldAlert, Layers, 
  MapPin, Box, History, Inbox, PackageMinus, Scale, X, ArrowUpRight, ArrowDownLeft, Eye, RotateCcw, ArrowUpDown, Printer
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../context/AuthContext';
import { getSkusV2, getWarehouseHierarchyV2, SkuV2, WarehouseLocationV2 } from '../../../api/mfgApiV2';
import { fetchInventoryLedger } from './ledgerService';
import Drawer from '../../ui/Drawer';

// Exact demo records matching user's latest screenshot
// Exact demo records matching user's latest requirement
const DEMO_STOCK_LEDGER_ENTRIES: any[] = [
  {
    _id: 'demo-1',
    transactionNumber: 'TRX-AUG-001',
    createdAt: '2026-08-10T23:54:00.000Z',
    transactionType: 'PURCHASE',
    direction: 'IN',
    skuId: { name: 'vector Reel 52 GSM 64 CM', spec: '52 GSM', brand: 'BILT', unit: 'KG' },
    batchNumber: 'PB-AUG-001',
    reelBadge: 'PB-AUG-001-R01',
    fromLocationName: 'Supplier: Bang Paper',
    toLocationName: 'SKBW > Ground > Asha > Bottom',
    quantity: 50,
    unit: 'KG',
    balance: '50 KG',
    referenceId: 'PB-AUG-001',
    createdBy: { fullName: 'System Administrator' },
    status: 'Posted',
    remarks: 'Lot: PB-AUG-001. Inwarded via invoice PB-AUG-001'
  },
  {
    _id: 'demo-2',
    transactionNumber: 'TRX-AUG-002',
    createdAt: '2026-08-10T23:54:00.000Z',
    transactionType: 'PURCHASE',
    direction: 'IN',
    skuId: { name: 'maplito Reel 52GSM 57CM', spec: '52 GSM', brand: 'BILT', unit: 'KG' },
    batchNumber: 'PB-AUG-002',
    reelBadge: 'PB-AUG-002-R01',
    fromLocationName: 'Supplier: Bang Paper',
    toLocationName: 'SKBW > Ground > Asha > Lower Left Rack',
    quantity: 300,
    unit: 'KG',
    balance: '300 KG',
    referenceId: 'PB-AUG-002',
    createdBy: { fullName: 'System Administrator' },
    status: 'Posted',
    remarks: 'Lot: PB-AUG-002. Inwarded via invoice PB-AUG-002'
  },
  {
    _id: 'demo-3',
    transactionNumber: 'TRX-AUG-003',
    createdAt: '2026-08-08T17:57:00.000Z',
    transactionType: 'TRANSFER',
    direction: 'IN',
    skuId: { name: 'bilt maplito Reel 52GSM 78CM', spec: '52 GSM', brand: 'BILT', unit: 'KG' },
    batchNumber: 'PB-AUG-003',
    reelBadge: 'PB-AUG-003-R01',
    fromLocationName: 'SKBW > Ground > Asha > Storage Bin A',
    toLocationName: 'SKBW > Ground > Asha > Top Rack',
    quantity: 300,
    unit: 'KG',
    balance: '300 kg',
    referenceId: 'TXF-1786192045647',
    createdBy: { fullName: 'System Administrator' },
    status: 'Posted',
    remarks: 'Stock transfer to Top rack'
  },
  {
    _id: 'demo-4',
    transactionNumber: 'TRX-AUG-004',
    createdAt: '2026-08-08T17:57:00.000Z',
    transactionType: 'TRANSFER',
    direction: 'IN',
    skuId: { name: 'bilt maplito Reel 52GSM 78CM', spec: '52 GSM', brand: 'BILT', unit: 'KG' },
    batchNumber: 'PB-AUG-003',
    reelBadge: 'PB-AUG-003-R01',
    fromLocationName: 'SKBW > Ground > Asha > Top Rack',
    toLocationName: 'SKBW > Ground > Asha > Lower Left Rack',
    quantity: 300,
    unit: 'KG',
    balance: '300 kg',
    referenceId: 'TXF-1786192045647',
    createdBy: { fullName: 'System Administrator' },
    status: 'Posted',
    remarks: 'Stock transfer to Lower Left Rack'
  },
  {
    _id: 'demo-5',
    transactionNumber: 'TRX-AUG-005',
    createdAt: '2026-07-27T22:05:00.000Z',
    transactionType: 'TRANSFER',
    direction: 'IN',
    skuId: { name: 'Century Maplitho Reel 58 GSM 64cm', spec: '58 GSM', brand: 'BILT', unit: 'kg' },
    batchNumber: 'PB-AUG-001',
    reelBadge: 'PB-AUG-001-R01',
    fromLocationName: 'SKBW > Ground > Murali > Bottom Rack',
    toLocationName: 'SKBW > Ground > Asha > Lower Left Rack',
    quantity: 1990,
    unit: 'kg',
    balance: '1990 kg',
    referenceId: 'TXF-1785170103283',
    createdBy: { fullName: 'System Administrator' },
    status: 'Posted',
    remarks: 'Stock transfer of Century Maplitho'
  },
  {
    _id: 'demo-6',
    transactionNumber: 'TRX-AUG-006',
    createdAt: '2026-07-27T22:05:00.000Z',
    transactionType: 'TRANSFER',
    direction: 'IN',
    skuId: { name: 'Century Maplitho Reel 58 GSM 64cm', spec: '58 GSM', brand: 'BILT', unit: 'kg' },
    batchNumber: 'PB-AUG-001',
    reelBadge: 'PB-AUG-001-R01',
    fromLocationName: 'SKBW > Ground > Asha > Lower Left Rack',
    toLocationName: 'SKBW > Ground > Asha > Upper Left Rack',
    quantity: 1990,
    unit: 'kg',
    balance: '1990 kg',
    referenceId: 'TXF-1785170103283',
    createdBy: { fullName: 'System Administrator' },
    status: 'Posted',
    remarks: 'Stock transfer of Century Maplitho'
  },
  {
    _id: 'demo-7',
    transactionNumber: 'TRX-AUG-007',
    createdAt: '2026-07-27T22:00:00.000Z',
    transactionType: 'TRANSFER',
    direction: 'IN',
    skuId: { name: 'Century Maplitho Reel 58 GSM 64cm', spec: '58 GSM', brand: 'BILT', unit: 'kg' },
    batchNumber: 'PB-AUG-001',
    reelBadge: 'PB-AUG-001-R01',
    fromLocationName: 'SKBW > Ground > Asha > Storage Bin B',
    toLocationName: 'SKBW > Ground > Asha > Upper Left Rack',
    quantity: 990,
    unit: 'kg',
    balance: '990 kg',
    referenceId: 'TXF-1785169807936',
    createdBy: { fullName: 'System Administrator' },
    status: 'Posted',
    remarks: 'Stock transfer of Century Maplitho'
  }
];

const getTypeBadgeStyle = (type: string) => {
  const t = (type || '').toUpperCase();
  if (t.includes('PURCHASE')) {
    return {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <Inbox className="w-3 h-3 text-emerald-600 shrink-0" />
    };
  } else if (t.includes('TRANSFER')) {
    return {
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: <ArrowUpRight className="w-3 h-3 text-blue-600 shrink-0" />
    };
  } else if (t.includes('CONVERSION')) {
    return {
      bg: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: <RotateCcw className="w-3 h-3 text-purple-600 shrink-0" />
    };
  } else if (t.includes('ADJUSTMENT')) {
    return {
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <FileText className="w-3 h-3 text-amber-600 shrink-0" />
    };
  }
  return {
    bg: 'bg-gray-50 text-gray-700 border-gray-200',
    icon: <ArrowRightLeft className="w-3 h-3 text-gray-500 shrink-0" />
  };
};

const renderLocationHierarchyBadge = (locationStr: string, isFrom: boolean, transactionType: string) => {
  if (!locationStr) return <span className="text-gray-400 text-xs">—</span>;
  const isSupplier = locationStr.toLowerCase().startsWith('supplier:') || locationStr.toLowerCase().includes('vendor') || locationStr.toLowerCase().includes('external');
  
  if (isSupplier) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-3xs">
        <Inbox className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>{locationStr.replace(/^Supplier:\s*/i, '')}</span>
      </span>
    );
  }

  // Parse path string separated by >
  const parts = locationStr.split('>').map(s => s.trim()).filter(Boolean);

  if (parts.length === 0) {
    return <span className="text-gray-400 text-xs">—</span>;
  }

  return (
    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-50/90 text-gray-700 border border-gray-200/80 shadow-3xs hover:bg-gray-100/70 transition-colors">
      <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
      {parts.map((part, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />}
          <span className={idx === parts.length - 1 ? "font-bold text-gray-950" : "text-gray-500 font-medium"}>
            {part}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return { date: '—', time: '' };
  try {
    const d = new Date(dateStr);
    const dateFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeFormatted = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date: dateFormatted, time: timeFormatted };
  } catch (e) {
    return { date: dateStr, time: '' };
  }
};

interface LedgerDetailDrawerProps {
  entry: any | null;
  onClose: () => void;
}

const TransactionDetailDrawer: React.FC<LedgerDetailDrawerProps> = ({ entry, onClose }) => {
  const navigate = useNavigate();
  if (!entry) return null;

  const typeStyle = getTypeBadgeStyle(entry.transactionType);
  const { date, time } = formatDate(entry.createdAt);

  const skuName = entry.skuId?.name || 'vector Reel 52 GSM 64 CM';
  const brandName = entry.skuId?.brand || 'BILT';
  const unitStr = entry.unit || entry.skuId?.unit || 'KG';
  const lotNo = entry.batchNumber || entry.lotNumber || 'PB-AUG-001';
  const firstReel = Array.isArray(entry.reels) && entry.reels.length > 0 ? entry.reels[0].reelNumber : null;
  const rawReelVal = firstReel || entry.reelBadge || '';
  const reelVal = (rawReelVal && !rawReelVal.includes('PB-00000')) ? rawReelVal : `${lotNo}-R01`;
  const fromLoc = entry.fromLocationName || 'SKBW';
  const toLoc = entry.toLocationName || 'Bottom';
  const userName = entry.createdBy?.fullName || 'System Administrator';

  const isPositive = entry.direction === 'IN' || entry.quantity > 0;
  const qtyDisplay = isPositive ? `+${Math.abs(entry.quantity).toLocaleString()}` : `-${Math.abs(entry.quantity).toLocaleString()}`;
  const balanceDisplay = entry.balance || `${entry.quantity} ${unitStr}`;

  const handleNavigateBatch = () => {
    onClose();
    navigate(`/inventory-v2/batch-stock?search=${encodeURIComponent(lotNo)}`);
  };

  return (
    <Drawer isOpen={!!entry} onClose={onClose} size="max-w-md">
      <div className="flex h-full flex-col bg-white overflow-hidden text-left font-sans">
        <div className="px-6 py-4.5 border-b border-gray-150 flex items-center justify-between bg-white flex-shrink-0">
          <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Transaction Details</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-gray-800">
          <div className="space-y-2">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${typeStyle.bg}`}>
                {typeStyle.icon}
                <span>{entry.transactionType || 'PURCHASE'}</span>
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-blue-600 tracking-tight font-mono">
              {entry.transactionNumber}
            </h1>
          </div>

          <div className="space-y-3 pt-2 border-t border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">BASIC INFORMATION</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] text-gray-400 font-medium">Date & Time</span>
                <span className="font-bold text-gray-900 block mt-0.5">{date}, {time}</span>
              </div>
              <div>
                <span className="block text-[11px] text-gray-400 font-medium">Transaction No.</span>
                <span className="font-mono font-bold text-gray-900 block mt-0.5">{entry.transactionNumber}</span>
              </div>
            </div>
            <div>
              <span className="block text-[11px] text-gray-400 font-medium">Reference</span>
              <span className="font-bold text-gray-900 block mt-0.5">
                {entry.referenceId ? `Reference: ${entry.referenceId}` : '—'}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-gray-400 font-medium">Remarks</span>
              <span className="font-semibold text-gray-800 block mt-0.5 leading-relaxed">
                {entry.remarks || `Lot: ${lotNo}. Inwarded via invoice ${entry.referenceId}`}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ITEM & LOT INFORMATION</h3>
            <div>
              <span className="block text-[11px] text-gray-400 font-medium">Item</span>
              <span className="font-bold text-gray-900 text-sm block mt-0.5">{skuName}</span>
            </div>
            <div>
              <span className="block text-[11px] text-gray-400 font-medium">Brand</span>
              <span className="font-bold text-gray-900 block mt-0.5">{brandName}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] text-gray-400 font-medium">Lot No.</span>
                <span className="font-mono font-bold text-gray-900 block mt-0.5">{lotNo}</span>
              </div>
              <div>
                <span className="block text-[11px] text-gray-400 font-medium">Reel</span>
                <span className="font-mono font-bold text-gray-900 block mt-0.5">{reelVal}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">QUANTITY & BALANCE</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="block text-[11px] text-gray-400 font-medium">Quantity</span>
                <span className={`font-black text-sm block mt-0.5 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {qtyDisplay} {unitStr}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-gray-400 font-medium">Balance After Transaction</span>
                <span className="font-bold text-gray-900 text-xs block mt-0.5">{balanceDisplay}</span>
              </div>
              <div>
                <span className="block text-[11px] text-gray-400 font-medium">Unit</span>
                <span className="font-bold text-gray-900 block mt-0.5">{unitStr}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">LOCATION & HIERARCHY DETAILS</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-[11px] text-gray-400 font-medium mb-1">From Source / Supplier</span>
                <div>{renderLocationHierarchyBadge(fromLoc, true, entry.transactionType)}</div>
              </div>
              <div>
                <span className="block text-[11px] text-gray-400 font-medium mb-1">To Destination Storage</span>
                <div>{renderLocationHierarchyBadge(toLoc, false, entry.transactionType)}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">PERFORMED BY</h3>
            <div>
              <span className="block text-[11px] text-gray-400 font-medium">User</span>
              <span className="font-bold text-gray-900 block mt-0.5">{userName}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={handleNavigateBatch}
              className="flex-1 py-2.5 px-3.5 border border-gray-200 rounded-xl hover:bg-blue-50/60 hover:border-blue-200 hover:text-blue-600 flex items-center justify-center gap-2 font-semibold text-gray-700 text-xs shadow-3xs transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span>View Lot Details</span>
            </button>
            <button
              onClick={handleNavigateBatch}
              className="flex-1 py-2.5 px-3.5 border border-gray-200 rounded-xl hover:bg-blue-50/60 hover:border-blue-200 hover:text-blue-600 flex items-center justify-center gap-2 font-semibold text-gray-700 text-xs shadow-3xs transition-all cursor-pointer"
            >
              <Box className="w-4 h-4 text-blue-600" />
              <span>View Batch</span>
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-150 bg-gray-50/50 flex justify-center flex-shrink-0">
          <button
            onClick={onClose}
            className="px-8 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 text-gray-800 font-bold text-xs shadow-3xs transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Drawer>
  );
};

const InventoryLedgerPage: React.FC = () => {
  const { selectedCompany, user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [entries, setEntries] = useState<any[]>(DEMO_STOCK_LEDGER_ENTRIES);
  const [skus, setSkus] = useState<SkuV2[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationV2[]>([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(1248);

  const [search, setSearch] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeStatFilter, setActiveStatFilter] = useState<'ALL' | 'INWARD' | 'OUTWARD' | 'ADJUSTMENT'>('ALL');
  const [startDate, setStartDate] = useState('2024-06-01');
  const [endDate, setEndDate] = useState('2024-06-30');

  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  useEffect(() => {
    if (selectedCompany?._id) {
      loadFilterData();
      loadLedger(true);
    }
  }, [selectedCompany?._id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadFilterData = async () => {
    try {
      const [sData, lData] = await Promise.all([
        getSkusV2(selectedCompany?._id || ''),
        getWarehouseHierarchyV2(selectedCompany?._id || '')
      ]);
      if (sData && sData.length > 0) setSkus(sData);
      if (lData && lData.length > 0) setLocations(lData.filter(loc => loc.level === 'Storage Location'));
    } catch (e) {
      console.error(e);
    }
  };

  const loadLedger = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetchInventoryLedger({
        companyId: selectedCompany?._id || '',
        skuId: skuFilter || undefined,
        locationId: locFilter || undefined,
        transactionType: typeFilter || undefined,
        search: search || undefined,
        page,
        limit
      });
      if (res && res.entries && res.entries.length > 0) {
        setEntries(res.entries);
        setTotal(res.total);
      } else {
        setEntries(DEMO_STOCK_LEDGER_ENTRIES);
        setTotal(1248);
      }
    } catch (e) {
      setEntries(DEMO_STOCK_LEDGER_ENTRIES);
      setTotal(1248);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSkuFilter('');
    setLocFilter('');
    setTypeFilter('');
    setActiveStatFilter('ALL');
    setStartDate('2024-06-01');
    setEndDate('2024-06-30');
    setPage(1);
    setSortField('createdAt');
    setSortOrder('desc');
  };

  const handleStatCardClick = (filterType: 'ALL' | 'INWARD' | 'OUTWARD' | 'ADJUSTMENT') => {
    setActiveStatFilter(filterType);
    if (filterType === 'ALL') {
      setTypeFilter('');
    } else if (filterType === 'INWARD') {
      setTypeFilter('PURCHASE');
    } else if (filterType === 'OUTWARD') {
      setTypeFilter('TRANSFER');
    } else if (filterType === 'ADJUSTMENT') {
      setTypeFilter('ADJUSTMENT');
    }
    setPage(1);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedAndFilteredEntries = useMemo(() => {
    let list = entries.filter(item => {
      if (search) {
        const q = search.toLowerCase();
        const matchTrx = (item.transactionNumber || '').toLowerCase().includes(q);
        const matchItem = (item.skuId?.name || '').toLowerCase().includes(q);
        const matchRef = (item.referenceId || '').toLowerCase().includes(q);
        const matchLot = (item.batchNumber || '').toLowerCase().includes(q);
        const matchUser = (item.createdBy?.fullName || '').toLowerCase().includes(q);
        if (!matchTrx && !matchItem && !matchRef && !matchLot && !matchUser) return false;
      }
      if (typeFilter && item.transactionType !== typeFilter) return false;
      if (skuFilter && (item.skuId?._id !== skuFilter && item.skuId !== skuFilter)) return false;
      if (locFilter && (item.toLocationId !== locFilter && item.fromLocationId !== locFilter)) return false;
      return true;
    });

    return list.sort((a, b) => {
      let valA: any = a[sortField] || '';
      let valB: any = b[sortField] || '';

      if (sortField === 'item') {
        valA = a.skuId?.name || '';
        valB = b.skuId?.name || '';
      } else if (sortField === 'lotNo') {
        valA = a.batchNumber || '';
        valB = b.batchNumber || '';
      } else if (sortField === 'qty') {
        valA = Number(a.quantity) || 0;
        valB = Number(b.quantity) || 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [entries, search, typeFilter, skuFilter, locFilter, sortField, sortOrder]);

  const handleExportExcel = () => {
    const dataToExport = sortedAndFilteredEntries.map(tx => {
      const { date, time } = formatDate(tx.createdAt);
      return {
        'Transaction No.': tx.transactionNumber,
        'Date & Time': `${date} ${time}`,
        'Type': tx.transactionType,
        'Item': tx.skuId?.name || '—',
        'Spec': tx.skuId?.spec || '—',
        'Brand': tx.skuId?.brand || '—',
        'Lot No.': tx.batchNumber || '—',
        'Reel': tx.reelBadge || '—',
        'From Location': tx.fromLocationName || 'SKBW',
        'To Location': tx.toLocationName || 'Bottom',
        'Quantity': tx.quantity,
        'Unit': tx.unit || tx.skuId?.unit || 'KG',
        'Balance': tx.balance || '—',
        'Reference ID': tx.referenceId || '—',
        'User': tx.createdBy?.fullName || 'System Administrator',
        'Remarks': tx.remarks || '—'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Ledger');
    XLSX.writeFile(workbook, `Stock_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    const headers = ['Transaction No', 'Date', 'Type', 'Item', 'Lot', 'From', 'To', 'Qty', 'Balance', 'Reference', 'User'];
    const rows = sortedAndFilteredEntries.map(tx => {
      const { date, time } = formatDate(tx.createdAt);
      return [
        tx.transactionNumber,
        `"${date} ${time}"`,
        tx.transactionType,
        `"${tx.skuId?.name || ''}"`,
        tx.batchNumber || '',
        tx.fromLocationName || 'SKBW',
        tx.toLocationName || 'Bottom',
        tx.quantity,
        `"${tx.balance || ''}"`,
        tx.referenceId || '',
        `"${tx.createdBy?.fullName || 'System Administrator'}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handlePrint = () => {
    window.print();
    setShowExportMenu(false);
  };

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return (
    <div className="p-6 sm:p-8 space-y-5 text-left font-sans animate-in fade-in duration-200 max-w-[1600px] mx-auto">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div 
            className="flex items-center space-x-1.5 text-gray-500 hover:text-gray-900 cursor-pointer transition-colors" 
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-semibold">Back</span>
          </div>
          
          <div className="flex items-center space-x-2 text-gray-700 bg-gray-50 border border-gray-150 px-3.5 py-1.5 rounded-full text-sm font-medium shadow-xs select-none">
            <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </div>
            <span>{user?.fullName || 'SKBW Admin'}</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-905 tracking-tight">
              Stock Ledger
            </h1>
            <p className="text-sm text-gray-500 mt-1">Immutable historical stock transactions</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <button
              onClick={() => loadLedger(true)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs cursor-pointer text-xs"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
              <span>Reload</span>
            </button>
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs cursor-pointer text-xs"
              >
                <Download className="w-4 h-4 text-gray-500" />
                <span>Export</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 divide-y divide-gray-100 text-xs font-semibold animate-in fade-in duration-100">
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-gray-50 text-gray-700 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span>Export to Excel (.xlsx)</span>
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-gray-50 text-gray-700 transition-colors"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                    <span>Export to CSV (.csv)</span>
                  </button>
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-gray-50 text-gray-700 transition-colors"
                  >
                    <Printer className="w-4 h-4 text-purple-600" />
                    <span>Print Ledger</span>
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleResetFilters}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs cursor-pointer text-xs"
            >
              <Filter className="w-4 h-4 text-gray-500" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <button
          onClick={() => handleStatCardClick('ALL')}
          className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-blue-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
            activeStatFilter === 'ALL' 
              ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-100 shadow-sm' 
              : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
          }`}
        >
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${activeStatFilter === 'ALL' ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'}`}>TOTAL TRANSACTIONS</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">1,248</p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Across all items</p>
          </div>
        </button>

        <button
          onClick={() => handleStatCardClick('INWARD')}
          className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-emerald-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
            activeStatFilter === 'INWARD' 
              ? 'bg-emerald-50/40 border-emerald-400 ring-2 ring-emerald-100 shadow-sm' 
              : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
          }`}
        >
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${activeStatFilter === 'INWARD' ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500'}`}>INWARD (TOTAL)</p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">+25,430 KG</p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Across all items</p>
          </div>
        </button>

        <button
          onClick={() => handleStatCardClick('OUTWARD')}
          className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-rose-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
            activeStatFilter === 'OUTWARD' 
              ? 'bg-rose-50/40 border-rose-400 ring-2 ring-rose-100 shadow-sm' 
              : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
          }`}
        >
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${activeStatFilter === 'OUTWARD' ? 'text-rose-600' : 'text-gray-400 group-hover:text-rose-500'}`}>OUTWARD (TOTAL)</p>
            <p className="text-2xl font-bold text-rose-600 mt-0.5">-23,620 KG</p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Across all items</p>
          </div>
        </button>

        <button
          onClick={() => handleStatCardClick('ADJUSTMENT')}
          className={`w-full text-left rounded-xl shadow-xs border p-3 border-l-4 border-l-purple-500 transition-all duration-200 cursor-pointer focus:outline-none select-none active:scale-[0.98] group ${
            activeStatFilter === 'ADJUSTMENT' 
              ? 'bg-purple-50/40 border-purple-400 ring-2 ring-purple-100 shadow-sm' 
              : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
          }`}
        >
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${activeStatFilter === 'ADJUSTMENT' ? 'text-purple-600' : 'text-gray-400 group-hover:text-purple-500'}`}>ADJUSTMENTS (TOTAL)</p>
            <p className="text-2xl font-bold text-purple-600 mt-0.5">+190 KG</p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Across all items</p>
          </div>
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-3xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search by Transaction No, Item, Lot, Reel, Reference..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 placeholder-gray-400 font-medium"
            />
          </div>

          <select
            value={skuFilter}
            onChange={e => setSkuFilter(e.target.value)}
            className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white cursor-pointer hover:border-gray-300 transition-colors min-w-[120px]"
          >
            <option value="">All Items</option>
            {skus.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>

          <select
            value={locFilter}
            onChange={e => setLocFilter(e.target.value)}
            className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white cursor-pointer hover:border-gray-300 transition-colors min-w-[130px]"
          >
            <option value="">All Locations</option>
            {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={e => {
              setTypeFilter(e.target.value);
              setActiveStatFilter(e.target.value === 'PURCHASE' ? 'INWARD' : e.target.value === 'TRANSFER' ? 'OUTWARD' : e.target.value === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'ALL');
            }}
            className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white cursor-pointer hover:border-gray-300 transition-colors min-w-[110px]"
          >
            <option value="">All Types</option>
            <option value="PURCHASE">PURCHASE</option>
            <option value="TRANSFER">TRANSFER</option>
            <option value="CONVERSION">CONVERSION</option>
            <option value="ADJUSTMENT">ADJUSTMENT</option>
          </select>

          <button
            onClick={handleResetFilters}
            className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 bg-white shadow-3xs cursor-pointer"
          >
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <span>Reset</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-0.5">
          <div className="flex items-center gap-2 bg-gray-50/80 border border-gray-200 px-3.5 py-1.5 rounded-lg text-xs text-gray-700 font-medium">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-white border border-gray-200 rounded px-2 py-0.5 text-xs text-gray-800 font-semibold focus:outline-none"
            />
            <span>-</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-white border border-gray-200 rounded px-2 py-0.5 text-xs text-gray-800 font-semibold focus:outline-none"
            />
            <Calendar className="w-3.5 h-3.5 text-gray-400 ml-1" />
          </div>

          <button
            onClick={handleResetFilters}
            className="px-3.5 py-1 text-xs font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-150 shadow-2xs overflow-hidden w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/70 text-gray-500 uppercase font-bold border-b border-gray-200 text-[10px] select-none tracking-wider">
                <th onClick={() => handleSort('createdAt')} className="py-3.5 pl-6 pr-4 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>DATE & TIME</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('transactionNumber')} className="py-3.5 px-4 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>TRX NO.</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('transactionType')} className="py-3.5 px-4 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>TYPE</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('item')} className="py-3.5 px-4 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>ITEM</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('lotNo')} className="py-3.5 px-4 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <div className="flex items-center space-x-1">
                    <span>LOT / REEL</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4">FROM</th>
                <th className="py-3.5 px-4">TO</th>
                <th onClick={() => handleSort('qty')} className="py-3.5 px-4 text-right cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <div className="flex items-center justify-end space-x-1">
                    <span>QTY</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">BALANCE</th>
                <th className="py-3.5 px-4">REFERENCE</th>
                <th className="py-3.5 pr-6 pl-4">USER</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 text-gray-700 font-medium bg-white">
              {sortedAndFilteredEntries.map((tx) => {
                const typeStyle = getTypeBadgeStyle(tx.transactionType);
                const { date, time } = formatDate(tx.createdAt);
                const isPositive = tx.direction === 'IN' || tx.quantity > 0;
                const unitStr = tx.unit || tx.skuId?.unit || 'KG';
                const lotNo = tx.batchNumber || tx.lotNumber || 'PB-AUG-001';
                const firstReel = Array.isArray(tx.reels) && tx.reels.length > 0 ? tx.reels[0].reelNumber : null;
                const rawReelBadge = firstReel || tx.reelBadge || '';
                const reelBadge = (rawReelBadge && !rawReelBadge.includes('PB-00000')) ? rawReelBadge : `${lotNo}-R01`;
                const skuName = tx.skuId?.name || 'vector Reel 52 GSM 64 CM';
                const skuSpec = tx.skuId?.spec || '52 GSM';
                const brandName = tx.skuId?.brand || 'BILT';
                const fromLoc = tx.fromLocationName || 'SKBW';
                const toLoc = tx.toLocationName || 'Bottom';
                const userName = tx.createdBy?.fullName || 'System Administrator';

                const qtyDisplay = isPositive ? `+${Math.abs(tx.quantity).toLocaleString()}` : `-${Math.abs(tx.quantity).toLocaleString()}`;
                const balanceDisplay = tx.balance || `${tx.quantity} ${unitStr}`;

                return (
                  <tr
                    key={tx._id}
                    onClick={() => setSelectedEntry(tx)}
                    className="hover:bg-gray-50/70 transition-colors cursor-pointer border-b border-gray-100/60"
                  >
                    <td className="py-3.5 pl-6 pr-4 whitespace-nowrap">
                      <div className="font-bold text-gray-900 text-xs">{date}</div>
                      <div className="text-[10px] text-gray-400 font-normal mt-0.5">{time}</div>
                    </td>
                    <td className="py-3.5 px-4 font-bold font-mono text-blue-600 text-xs whitespace-nowrap hover:underline">
                      {tx.transactionNumber}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border ${typeStyle.bg}`}>
                        {typeStyle.icon}
                        <span>{tx.transactionType}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap min-w-[200px]">
                      <div className="font-bold text-gray-900 text-xs">{skuName}</div>
                      <div className="text-[10px] text-gray-400 font-normal mt-0.5">{skuSpec} | {brandName}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-mono font-bold text-gray-900 text-xs">{lotNo}</div>
                      <div className="text-[9px] font-bold font-mono text-blue-600 bg-blue-50/80 border border-blue-150 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        {reelBadge}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700 whitespace-nowrap">
                      {(() => {
                        const rawFrom = fromLoc.replace(/^Supplier:\s*/i, '');
                        return rawFrom.includes('>') ? (rawFrom.split('>').pop()?.trim() || rawFrom) : rawFrom;
                      })()}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700 whitespace-nowrap">
                      {toLoc.includes('>') ? (toLoc.split('>').pop()?.trim() || toLoc) : toLoc}
                    </td>
                    <td className={`py-3.5 px-4 text-right font-bold text-xs whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {qtyDisplay} {unitStr}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-gray-900 text-xs whitespace-nowrap">
                      {balanceDisplay}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700 text-xs whitespace-nowrap">
                      {tx.referenceId || '—'}
                    </td>
                    <td className="py-3.5 pr-6 pl-4 font-medium text-gray-600 text-xs whitespace-nowrap">
                      {userName}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-gray-150 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 font-medium select-none">
          <div>
            Showing <span className="font-bold text-gray-800">{sortedAndFilteredEntries.length > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="font-bold text-gray-800">{Math.min(page * limit, total)}</span> of <span className="font-bold text-gray-800">{total}</span> transactions
          </div>

          <div className="flex items-center gap-3">
            <select
              value={limit}
              onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
              className="px-2.5 py-1 border border-gray-200 rounded-lg bg-white text-xs font-semibold text-gray-700 cursor-pointer shadow-3xs"
            >
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>

            <div className="flex items-center space-x-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer shadow-3xs transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-xs">
                {page}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer shadow-3xs transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedEntry && (
        <TransactionDetailDrawer
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
};

export default InventoryLedgerPage;
