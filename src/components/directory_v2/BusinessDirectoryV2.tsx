import React, { useEffect, useState, useCallback } from 'react';
import { 
  Users, 
  Building, 
  Factory, 
  Briefcase, 
  Truck, 
  Map, 
  Search, 
  Plus, 
  X, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Phone, 
  ChevronLeft, 
  ChevronRight,
  MapPin,
  CreditCard,
  Tag,
  Building2,
  Mail,
  FileText,
  User,
  History,
  BookOpen,
  ShoppingCart,
  ExternalLink,
  Coins,
  Percent,
  Filter,
  ArrowUpDown,
  Columns,
  Download,
  Upload,
  FileSpreadsheet,
  RotateCcw,
  Check,
  FileCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { 
  getParties, 
  createParty, 
  updateParty, 
  deleteParty as deletePartyApi,
  importParties
} from '../../api/partyApi';
import { 
  getRoutes, 
  createRoute, 
  updateRoute, 
  deleteRoute 
} from '../../api/routeApi';
import { getActivityLogs, createActivityLog } from '../../api/activityLogApi';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

const TagInput: React.FC<TagInputProps> = ({ tags = [], onChange, placeholder = "Press Enter or Comma to add tags..." }) => {
  const [inputValue, setInputValue] = useState('');

  const addTag = (val: string) => {
    const trimmed = val.trim().replace(/,$/, '');
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (indexToRemove: number) => {
    onChange(tags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  return (
    <div className="w-full border border-gray-200 rounded-xl px-3 py-2 bg-white shadow-2xs focus-within:border-purple-600 focus-within:ring-2 focus-within:ring-purple-100 transition-all flex flex-wrap items-center gap-1.5 min-h-[42px]">
      {(tags || []).map((tag, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-lg border border-purple-200/60"
        >
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(idx)}
            className="hover:bg-purple-200/60 rounded p-0.5 text-purple-500 hover:text-purple-800 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3 stroke-[2.5]" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={(tags || []).length === 0 ? placeholder : "Add tag..."}
        className="flex-1 min-w-[120px] bg-transparent text-xs font-medium border-none focus:outline-none p-0 text-gray-900 placeholder:text-gray-400"
      />
    </div>
  );
};

const WhatsAppIcon: React.FC = () => (
  <svg 
    className="w-4 h-4 text-emerald-500 hover:text-emerald-600 transition-all duration-300 transform hover:scale-125 inline-block align-middle cursor-pointer shrink-0" 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.705 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export type DirectoryTabType = 'customers' | 'vendors' | 'agents' | 'transporters' | 'regions' | 'cities';

interface DirectoryItem {
  _id: string;
  type: string;
  firmName: string;
  contactName?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  altPhone?: string;
  gstNumber?: string;
  gstin?: string;
  aadharNumber?: string;
  doorNo?: string;
  streetName?: string;
  address1?: string;
  area?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  gpsLocation?: string;
  agentAssigned?: string;
  route?: string;
  preferredTransport?: string;
  creditDays?: number;
  creditLimit?: number;
  openingBalance?: number;
  outstandingBalance?: number;
  status: 'active' | 'inactive' | 'on-hold';
  vendorType?: string;
  code?: string;
  citiesCount?: number;
  customersCount?: number;
  assignedCustomersCount?: number;
  assignedRoutes?: string[];
  tags?: string[];
  notes?: string;
  customerPhoto?: string;
  shopPhoto?: string;
  [key: string]: any;
}

export const BusinessDirectoryV2: React.FC = () => {
  const { selectedCompany } = useAuth();

  const [activeMainTab, setActiveMainTab] = useState<DirectoryTabType>('customers');
  const [animationKey, setAnimationKey] = useState<number>(Date.now());

  // Fast On-Demand Pagination State
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);

  // Lazy-Loaded Dropdown Lists (Fetched on mount and kept updated)
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [allRoutes, setAllRoutes] = useState<any[]>([]);
  const [allCities, setAllCities] = useState<any[]>([]);
  const [allTransporters, setAllTransporters] = useState<any[]>([]);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [, setAuxLoaded] = useState(false);

  // Modal Dialog Pop-up State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DirectoryItem | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<DirectoryItem | null>(null);
  const [regionCitySearch, setRegionCitySearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [cardCustomersModal, setCardCustomersModal] = useState<{
    title: string;
    subtitle?: string;
    customers: any[];
  } | null>(null);
  const [cardCustomerSearch, setCardCustomerSearch] = useState('');

  // Accessibility & Action Toolbar Popover States
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);

  // Filter States
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [filterRoute, setFilterRoute] = useState<string>('all');
  const [filterVendorType, setFilterVendorType] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterMinBal, setFilterMinBal] = useState<string>('');
  const [filterMaxBal, setFilterMaxBal] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('');

  // Sort State
  const [sortField, setSortField] = useState<'firmName' | 'outstandingBalance' | 'city' | 'code' | 'created'>('firmName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Dynamic Column Visibility State
  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>({});

  // Activity Log State
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');

  // CSV Import State
  const [isImporting, setIsImporting] = useState(false);

  // Complete Form State matching the exact 3 screenshots
  const [form, setForm] = useState({
    firmName: '',
    ownerName: '',
    phone: '',
    whatsapp: '',
    altPhone: '',
    email: '',
    gstNumber: '',
    aadharNumber: '',
    vendorType: 'BOARD SUPPLIER',
    doorNo: '',
    streetName: '',
    address1: '',
    area: '',
    landmark: '',
    city: '',
    district: '',
    state: 'Andhra Pradesh',
    pincode: '',
    gpsLocation: '',
    route: '',
    agentAssigned: '',
    preferredTransport: '',
    creditDays: '30',
    creditLimit: '100000',
    openingBalance: '0',
    outstandingBalance: '0',
    status: 'active' as 'active' | 'inactive' | 'on-hold',
    tags: [] as string[],
    notes: '',
    customerPhoto: '',
    shopPhoto: '',
    code: '',
    contactName: '',
    assignedRoutes: [] as string[],
    contactPersons: [] as { name: string; phone: string; email: string; role?: string; designation?: string }[]
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle Escape key for customer card modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cardCustomersModal) {
        setCardCustomersModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cardCustomersModal]);

  // Lazy-load auxiliary dropdown data on mount and whenever needed
  const loadAuxiliaryData = useCallback(async () => {
    if (!selectedCompany?._id) return;
    try {
      const [agRes, rtRes, mkRes, trRes, custRes] = await Promise.all([
        getParties({ company: selectedCompany._id, type: 'agent', limit: 500, light: true }),
        getRoutes(selectedCompany._id),
        getParties({ company: selectedCompany._id, type: 'market', limit: 1000 }),
        getParties({ company: selectedCompany._id, type: 'transporter', limit: 500, light: true }),
        getParties({ company: selectedCompany._id, type: 'customer', limit: 5000, light: true })
      ]);

      setAllAgents(agRes.data.parties || agRes.data || []);
      setAllRoutes(rtRes.data.routes || rtRes.data || []);
      setAllCities(mkRes.data.parties || mkRes.data || []);
      setAllTransporters(trRes.data.parties || trRes.data || []);
      setAllCustomers(custRes.data.parties || custRes.data || []);
      setAuxLoaded(true);
    } catch (err) {
      console.error('Failed to load auxiliary dropdown lists:', err);
    }
  }, [selectedCompany?._id]);

  useEffect(() => {
    loadAuxiliaryData();
  }, [loadAuxiliaryData]);

  // Auto-retrieve Region (Route), District, State, and Agent when City is selected
  const handleCitySelect = (cityName: string) => {
    const matchedCity = allCities.find((c: any) => (c.firmName || c.name) === cityName);
    setForm(f => ({
      ...f,
      city: cityName,
      route: matchedCity?.route || f.route,
      district: matchedCity?.district || f.district,
      state: matchedCity?.state || f.state || 'Andhra Pradesh',
      agentAssigned: matchedCity?.agentAssigned || f.agentAssigned
    }));
  };

  // Fast Server-Side/Paginated Data Loading (<50ms response)
  const loadDirectoryData = useCallback(async () => {
    if (!selectedCompany?._id) return;
    setLoading(true);
    try {
      if (activeMainTab === 'regions') {
        const res = await getRoutes(selectedCompany._id);
        const routeData = res.data.routes || res.data || [];
        const formatted = routeData.map((r: any) => ({
          _id: r._id,
          type: 'route',
          firmName: r.name,
          name: r.name,
          code: r.code || r.name,
          assignedAgent: r.assignedAgent || '—',
          citiesCount: r.citiesCount || 0,
          customersCount: r.customersCount || 0,
          outstandingBalance: r.outstandingBalance || 0,
          status: r.status || 'active'
        }));
        setItems(formatted);
        setTotalRecords(formatted.length);
      } else {
        let partyType = 'customer';
        if (activeMainTab === 'vendors') partyType = 'vendor';
        if (activeMainTab === 'agents') partyType = 'agent';
        if (activeMainTab === 'transporters') partyType = 'transporter';
        if (activeMainTab === 'cities') partyType = 'market';

        const res = await getParties({
          company: selectedCompany._id,
          type: partyType,
          page,
          limit,
          search: debouncedSearch
        });

        const partyData = res.data.parties || res.data || [];
        setItems(partyData);
        setTotalRecords(res.data.totalParties || res.data.total || partyData.length);
      }
    } catch (err: any) {
      console.error('Failed to load active tab data:', err);
      showToast(err.message || 'Failed to load directory items', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedCompany?._id, activeMainTab, page, limit, debouncedSearch]);

  // Derived Filtered & Sorted Items
  const processedItems = React.useMemo(() => {
    let result = [...items];

    if (filterStatus !== 'all') {
      result = result.filter(i => (i.status || 'active') === filterStatus);
    }
    if (filterCity !== 'all') {
      result = result.filter(i => (i.city || i.assignedMarket) === filterCity);
    }
    if (filterRoute !== 'all') {
      result = result.filter(i => (i.route || i.assignedRegion || i.name) === filterRoute);
    }
    if (filterVendorType !== 'all') {
      result = result.filter(i => i.vendorType === filterVendorType);
    }
    if (filterAgent !== 'all') {
      result = result.filter(i => i.agentAssigned === filterAgent || i.assignedAgent === filterAgent);
    }
    if (filterMinBal) {
      const min = Number(filterMinBal);
      if (!isNaN(min)) {
        result = result.filter(i => (Number(i.outstandingBalance) || Number(i.outstanding) || 0) >= min);
      }
    }
    if (filterMaxBal) {
      const max = Number(filterMaxBal);
      if (!isNaN(max)) {
        result = result.filter(i => (Number(i.outstandingBalance) || Number(i.outstanding) || 0) <= max);
      }
    }
    if (filterTag.trim()) {
      const tLower = filterTag.toLowerCase().trim();
      result = result.filter(i => Array.isArray(i.tags) && i.tags.some(t => t.toLowerCase().includes(tLower)));
    }

    result.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortField === 'firmName') {
        valA = (a.firmName || a.name || '').toLowerCase();
        valB = (b.firmName || b.name || '').toLowerCase();
      } else if (sortField === 'outstandingBalance') {
        valA = Number(a.outstandingBalance) || Number(a.outstanding) || 0;
        valB = Number(b.outstandingBalance) || Number(b.outstanding) || 0;
      } else if (sortField === 'city') {
        valA = (a.city || a.assignedMarket || '').toLowerCase();
        valB = (b.city || b.assignedMarket || '').toLowerCase();
      } else if (sortField === 'code') {
        valA = (a.code || '').toLowerCase();
        valB = (b.code || '').toLowerCase();
      } else if (sortField === 'created') {
        valA = new Date(a.createdAt || 0).getTime();
        valB = new Date(b.createdAt || 0).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [items, filterStatus, filterCity, filterRoute, filterVendorType, filterAgent, filterMinBal, filterMaxBal, filterTag, sortField, sortOrder]);

  const activeFilterCount = [
    filterStatus !== 'all',
    filterCity !== 'all',
    filterRoute !== 'all',
    filterVendorType !== 'all',
    filterAgent !== 'all',
    Boolean(filterMinBal),
    Boolean(filterMaxBal),
    Boolean(filterTag)
  ].filter(Boolean).length;

  const resetFilters = () => {
    setFilterStatus('all');
    setFilterCity('all');
    setFilterRoute('all');
    setFilterVendorType('all');
    setFilterAgent('all');
    setFilterMinBal('');
    setFilterMaxBal('');
    setFilterTag('');
  };

  const getColumnList = (tab: DirectoryTabType) => {
    if (tab === 'customers') {
      return [
        { id: 'firmName', label: 'Customer Firm' },
        { id: 'phone', label: 'Mobile / WhatsApp' },
        { id: 'city', label: 'City & District' },
        { id: 'route', label: 'Region & Market' },
        { id: 'agent', label: 'Assigned Agent' },
        { id: 'credit', label: 'Credit Limit & Days' },
        { id: 'outstanding', label: 'Outstanding' },
        { id: 'tags', label: 'Tags' }
      ];
    } else if (tab === 'vendors') {
      return [
        { id: 'firmName', label: 'Supplier Name' },
        { id: 'vendorType', label: 'Vendor Type' },
        { id: 'contactName', label: 'Contact Person' },
        { id: 'phone', label: 'Phone / Email' },
        { id: 'city', label: 'City & State' },
        { id: 'credit', label: 'Payment Terms' },
        { id: 'outstanding', label: 'Outstanding Payable' },
        { id: 'tags', label: 'Tags' }
      ];
    } else if (tab === 'agents') {
      return [
        { id: 'firmName', label: 'Agent Name' },
        { id: 'phone', label: 'Phone / WhatsApp' },
        { id: 'regions', label: 'Assigned Regions' }
      ];
    } else if (tab === 'transporters') {
      return [
        { id: 'firmName', label: 'Transporter Name' },
        { id: 'phone', label: 'Phone / WhatsApp' },
        { id: 'customersCount', label: 'Linked Customers' }
      ];
    } else if (tab === 'regions') {
      return [
        { id: 'name', label: 'Region Name' },
        { id: 'code', label: 'Region Code' },
        { id: 'agent', label: 'Assigned Agent' },
        { id: 'citiesCount', label: 'Cities Count' },
        { id: 'customersCount', label: 'Customers Count' },
        { id: 'outstanding', label: 'Total Outstanding' }
      ];
    } else {
      return [
        { id: 'name', label: 'City Name' },
        { id: 'district', label: 'District' },
        { id: 'state', label: 'State' },
        { id: 'region', label: 'Region' },
        { id: 'customersCount', label: 'Customers Count' },
        { id: 'outstanding', label: 'Total Outstanding' }
      ];
    }
  };

  const handleDownloadSampleCSV = () => {
    let headers: string[] = [];
    let sampleRows: string[][] = [];

    if (activeMainTab === 'customers') {
      headers = [
        'Firm Name', 'Owner Name', 'Contact Name', 'Phone', 'Alt Phone', 'WhatsApp', 'Email',
        'GST Number', 'Aadhar Number', 'Door No', 'Street Name', 'Address Line', 'Area', 'Landmark',
        'City', 'District', 'State', 'Pincode', 'GPS Location', 'Region', 'Agent Assigned',
        'Preferred Transport', 'Credit Limit', 'Credit Days', 'Opening Balance', 'Outstanding Balance', 'Tags', 'Remarks', 'Status'
      ];
      sampleRows = [
        [
          'Charminar Notebook Publishers',
          'Mohammad Ali',
          'Mohammad Ali',
          '9988776611',
          '9848022334',
          '9988776611',
          'ali@charminar.com',
          '37AAAAA1111A1Z1',
          '123456789012',
          '12-3-45',
          'Main Market Road',
          'Near Bus Stand',
          'Auto Nagar',
          'Opp. Water Tank',
          'Vijayawada',
          'Ntr',
          'Andhra Pradesh',
          '520003',
          'https://maps.google.com/?q=16.5062,80.6480',
          'Region 1',
          'Venkatesh Rao',
          'GARUDA',
          '500000',
          '30',
          '0',
          '0',
          'vip, regular',
          'Regular client since 2024',
          'active'
        ]
      ];
    } else if (activeMainTab === 'vendors') {
      headers = [
        'Firm Name', 'Owner Name', 'Contact Name', 'Phone', 'Alt Phone', 'WhatsApp', 'Email',
        'GST Number', 'Aadhar Number', 'Door No', 'Street Name', 'Address Line', 'Area', 'Landmark',
        'City', 'District', 'State', 'Pincode', 'GPS Location', 'Vendor Type', 'Credit Limit', 'Credit Days',
        'Opening Balance', 'Outstanding Balance', 'Tags', 'Remarks', 'Status'
      ];
      sampleRows = [
        [
          'Paper Mills Supplier Ltd',
          'Mohammad Ali',
          'Mohammad Ali',
          '9988776611',
          '9848022334',
          '9988776611',
          'ali@charminar.com',
          '37AAAAA1111A1Z1',
          '123456789012',
          '12-3-45',
          'Main Market Road',
          'Near Bus Stand',
          'Auto Nagar',
          'Opp. Water Tank',
          'Tirupati',
          'Tirupati',
          'Andhra Pradesh',
          '517501',
          'https://maps.google.com/?q=13.6288,79.4192',
          'PAPER SUPPLIER',
          '500000',
          '30',
          '0',
          '0',
          'vip, regular',
          'Primary raw material supplier',
          'active'
        ]
      ];
    } else if (activeMainTab === 'agents') {
      headers = ['Agent Name', 'Mobile', 'Status'];
      sampleRows = [
        ['Venkatesh Rao', '9988776611', 'active'],
        ['Ramesh Kumar', '9440212345', 'active']
      ];
    } else if (activeMainTab === 'transporters') {
      headers = ['Transporter Name', 'Contact Person', 'Mobile', 'Email', 'City', 'Status'];
      sampleRows = [
        ['VRL Logistics', 'Suresh Kumar', '9876543210', 'info@vrl.com', 'Vijayawada', 'active']
      ];
    } else if (activeMainTab === 'regions') {
      headers = ['Region Name', 'Assigned Agent', 'Status'];
      sampleRows = [
        ['Region 1', 'Venkatesh Rao', 'active'],
        ['Region 2', 'Ramesh Kumar', 'active']
      ];
    } else if (activeMainTab === 'cities') {
      headers = ['City Name', 'District', 'State', 'Region', 'Status'];
      sampleRows = [
        ['Vijayawada', 'Ntr', 'Andhra Pradesh', 'Region 1', 'active'],
        ['Tirupati', 'Tirupati', 'Andhra Pradesh', 'Region 1', 'active']
      ];
    }

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...sampleRows.map(row => row.map(val => {
        const clean = String(val).replace(/"/g, '""');
        return clean.includes(',') || clean.includes('\n') ? `"${clean}"` : clean;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sample_${activeMainTab}_import_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloaded sample CSV template for ${activeMainTab}`, 'success');
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany?._id) return;
    setIsImporting(true);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        showToast('CSV file is empty or missing data rows', 'error');
        setIsImporting(false);
        return;
      }

      const parseCSVLine = (line: string) => {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());
        return values.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
      };

      const rawHeaders = parseCSVLine(lines[0]);
      const headerMap: Record<string, number> = {};
      rawHeaders.forEach((h, idx) => {
        const cleanH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        headerMap[cleanH] = idx;
      });

      const partiesToImport: any[] = [];
      const partyType = activeMainTab === 'vendors' ? 'vendor' :
                        activeMainTab === 'agents' ? 'agent' :
                        activeMainTab === 'transporters' ? 'transporter' :
                        activeMainTab === 'regions' ? 'route' :
                        activeMainTab === 'cities' ? 'market' : 'customer';

      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length === 0 || !row.some(Boolean)) continue;

        const getValue = (keyName: string) => {
          const cleanK = keyName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const idx = headerMap[cleanK];
          return idx !== undefined && row[idx] !== undefined ? row[idx] : '';
        };

        const firmName = getValue('firmname') || getValue('customerfirm') || getValue('suppliername') || getValue('agentname') || getValue('transportername') || getValue('regionname') || getValue('cityname') || row[0];
        if (!firmName) continue;

        const recordObj: any = {
          company: selectedCompany._id,
          type: partyType,
          firmName,
          name: firmName,
          ownerName: getValue('ownername') || getValue('contactperson') || getValue('contactname'),
          contactName: getValue('contactname') || getValue('contactperson') || getValue('ownername'),
          phone: getValue('phone') || getValue('mobile'),
          altPhone: getValue('altphone'),
          whatsapp: getValue('whatsapp') || getValue('phone'),
          email: getValue('email'),
          gstNumber: getValue('gstnumber') || getValue('gstin'),
          aadharNumber: getValue('aadharnumber') || getValue('pan'),
          doorNo: getValue('doorno'),
          streetName: getValue('streetname'),
          address1: getValue('addressline') || getValue('address'),
          area: getValue('area'),
          landmark: getValue('landmark'),
          city: getValue('city'),
          district: getValue('district'),
          state: getValue('state') || 'Andhra Pradesh',
          pincode: getValue('pincode'),
          gpsLocation: getValue('gpslocation'),
          route: getValue('region') || getValue('route'),
          agentAssigned: getValue('agentassigned') || getValue('assignedagent'),
          preferredTransport: getValue('preferredtransport'),
          vendorType: getValue('vendortype') || 'BOARD SUPPLIER',
          creditDays: Number(getValue('creditdays')) || 30,
          creditLimit: Number(getValue('creditlimit')) || 100000,
          openingBalance: Number(getValue('openingbalance')) || 0,
          outstandingBalance: Number(getValue('outstandingbalance')) || Number(getValue('outstanding')) || 0,
          status: (getValue('status') || 'active').toLowerCase(),
          tags: getValue('tags') ? getValue('tags').split(',').map((t: string) => t.trim()).filter(Boolean) : [],
          notes: getValue('remarks') || getValue('notes')
        };

        partiesToImport.push(recordObj);
      }

      if (partiesToImport.length === 0) {
        showToast('No valid party records parsed from file', 'warning');
        setIsImporting(false);
        return;
      }

      await importParties(partiesToImport);

      createActivityLog({
        action: 'IMPORT',
        entityType: activeMainTab.toUpperCase(),
        entityName: `${partiesToImport.length} ${activeMainTab} imported`,
        details: `Imported ${partiesToImport.length} ${activeMainTab} records directly into database via CSV import`,
        company: selectedCompany._id
      }).catch(() => {});

      showToast(`Successfully imported ${partiesToImport.length} ${activeMainTab} into database!`, 'success');
      await loadDirectoryData();
      await loadAuxiliaryData();
    } catch (err: any) {
      console.error('Import failed:', err);
      showToast(err?.response?.data?.msg || err.message || 'Failed to import CSV file', 'error');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleExportExcel = () => {
    if (processedItems.length === 0) {
      showToast('No records available to export', 'info');
      return;
    }

    let headers: string[] = [];
    if (activeMainTab === 'customers') {
      headers = ['Firm Name', 'Contact Person', 'Phone', 'City', 'District', 'Region', 'Assigned Agent', 'Credit Limit', 'Credit Days', 'Outstanding', 'Tags', 'Status'];
    } else if (activeMainTab === 'vendors') {
      headers = ['Supplier Name', 'Vendor Type', 'Contact Person', 'Phone', 'City', 'District', 'Credit Days', 'Outstanding Payable', 'Tags', 'Status'];
    } else if (activeMainTab === 'agents') {
      headers = ['Agent Name', 'Phone', 'Assigned Regions', 'Status'];
    } else if (activeMainTab === 'transporters') {
      headers = ['Transporter Name', 'Phone', 'Contact Person', 'City', 'Status'];
    } else if (activeMainTab === 'regions') {
      headers = ['Region Name', 'Code', 'Assigned Agent', 'Cities Count', 'Customers Count', 'Total Outstanding', 'Status'];
    } else {
      headers = ['City Name', 'District', 'State', 'Region', 'Customers Count', 'Total Outstanding', 'Status'];
    }

    const rows = processedItems.map(item => {
      if (activeMainTab === 'customers') {
        return [
          item.firmName || item.name,
          item.contactName || item.ownerName || '—',
          item.phone || '—',
          item.city || '—',
          item.district || '—',
          item.route || '—',
          item.agentAssigned || '—',
          item.creditLimit || 0,
          item.creditDays || 30,
          item.outstandingBalance || 0,
          Array.isArray(item.tags) ? item.tags.join('; ') : '',
          item.status || 'active'
        ];
      } else if (activeMainTab === 'vendors') {
        return [
          item.firmName || item.name,
          item.vendorType || 'BOARD SUPPLIER',
          item.contactName || item.ownerName || '—',
          item.phone || '—',
          item.city || '—',
          item.district || '—',
          item.creditDays || 30,
          item.outstandingBalance || 0,
          Array.isArray(item.tags) ? item.tags.join('; ') : '',
          item.status || 'active'
        ];
      } else if (activeMainTab === 'agents') {
        return [
          item.firmName || item.contactName || item.name,
          item.phone || '—',
          Array.isArray(item.assignedRoutes) ? item.assignedRoutes.join('; ') : item.route || '—',
          item.status || 'active'
        ];
      } else if (activeMainTab === 'transporters') {
        return [
          item.firmName || item.name,
          item.phone || '—',
          item.contactName || item.ownerName || '—',
          item.city || '—',
          item.status || 'active'
        ];
      } else if (activeMainTab === 'regions') {
        return [
          item.name || item.firmName,
          item.code || '—',
          item.assignedAgent || '—',
          item.citiesCount || 0,
          item.customersCount || 0,
          item.outstandingBalance || 0,
          item.status || 'active'
        ];
      } else {
        return [
          item.firmName || item.name,
          item.district || '—',
          item.state || 'Andhra Pradesh',
          item.route || '—',
          item.customersCount || 0,
          item.outstandingBalance || 0,
          item.status || 'active'
        ];
      }
    });

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(row => row.map(val => {
        const clean = String(val).replace(/"/g, '""');
        return clean.includes(',') || clean.includes('\n') ? `"${clean}"` : clean;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeMainTab}_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${processedItems.length} ${activeMainTab} to Excel/CSV`, 'success');
  };

  const handleExportPDF = () => {
    if (processedItems.length === 0) {
      showToast('No records available to print PDF', 'info');
      return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
      showToast('Please allow popups to generate PDF', 'error');
      return;
    }

    const title = `${activeMainTab.toUpperCase()} REPORT`;
    const companyName = selectedCompany?.name || 'SKBW ERP';
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let tableHeaders = '';
    if (activeMainTab === 'customers') {
      tableHeaders = `<th>#</th><th>Firm Name</th><th>Contact</th><th>Phone</th><th>City</th><th>Region</th><th>Agent</th><th>Outstanding</th>`;
    } else if (activeMainTab === 'vendors') {
      tableHeaders = `<th>#</th><th>Supplier Name</th><th>Type</th><th>Contact</th><th>Phone</th><th>City</th><th>Payable</th>`;
    } else if (activeMainTab === 'agents') {
      tableHeaders = `<th>#</th><th>Agent Name</th><th>Phone</th><th>Assigned Regions</th><th>Status</th>`;
    } else if (activeMainTab === 'transporters') {
      tableHeaders = `<th>#</th><th>Transporter</th><th>Phone</th><th>Contact</th><th>City</th>`;
    } else if (activeMainTab === 'regions') {
      tableHeaders = `<th>#</th><th>Region Name</th><th>Code</th><th>Agent</th><th>Cities</th><th>Customers</th><th>Outstanding</th>`;
    } else {
      tableHeaders = `<th>#</th><th>City Name</th><th>District</th><th>State</th><th>Region</th><th>Customers</th><th>Outstanding</th>`;
    }

    const tableRowsHtml = processedItems.map((item, idx) => {
      let rowCols = '';
      const outBal = Number(item.outstandingBalance) || Number(item.outstanding) || 0;
      if (activeMainTab === 'customers') {
        rowCols = `<td>${idx+1}</td><td><b>${item.firmName}</b></td><td>${item.contactName || item.ownerName || '—'}</td><td>${item.phone || '—'}</td><td>${item.city || '—'}</td><td>${item.route || '—'}</td><td>${item.agentAssigned || '—'}</td><td>₹${outBal.toLocaleString('en-IN')}</td>`;
      } else if (activeMainTab === 'vendors') {
        rowCols = `<td>${idx+1}</td><td><b>${item.firmName}</b></td><td>${item.vendorType || 'BOARD SUPPLIER'}</td><td>${item.contactName || item.ownerName || '—'}</td><td>${item.phone || '—'}</td><td>${item.city || '—'}</td><td>₹${outBal.toLocaleString('en-IN')}</td>`;
      } else if (activeMainTab === 'agents') {
        rowCols = `<td>${idx+1}</td><td><b>${item.firmName || item.contactName}</b></td><td>${item.phone || '—'}</td><td>${item.route || '—'}</td><td>${item.status || 'active'}</td>`;
      } else if (activeMainTab === 'transporters') {
        rowCols = `<td>${idx+1}</td><td><b>${item.firmName || item.name}</b></td><td>${item.phone || '—'}</td><td>${item.contactName || '—'}</td><td>${item.city || '—'}</td>`;
      } else if (activeMainTab === 'regions') {
        rowCols = `<td>${idx+1}</td><td><b>${item.name || item.firmName}</b></td><td>${item.code || '—'}</td><td>${item.assignedAgent || '—'}</td><td>${item.citiesCount || 0}</td><td>${item.customersCount || 0}</td><td>₹${outBal.toLocaleString('en-IN')}</td>`;
      } else {
        rowCols = `<td>${idx+1}</td><td><b>${item.firmName || item.name}</b></td><td>${item.district || '—'}</td><td>${item.state || 'Andhra Pradesh'}</td><td>${item.route || '—'}</td><td>${item.customersCount || 0}</td><td>₹${outBal.toLocaleString('en-IN')}</td>`;
      }
      return `<tr>${rowCols}</tr>`;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - ${companyName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px; }
            .title { font-size: 20px; font-weight: bold; color: #4338ca; text-transform: uppercase; }
            .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th { background-color: #f1f5f9; color: #334155; text-align: left; padding: 8px 10px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; }
            td { padding: 8px 10px; border: 1px solid #e2e8f0; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .summary { margin-top: 20px; font-size: 12px; font-weight: bold; text-align: right; color: #334155; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">${companyName} — ${title}</div>
              <div class="sub">Generated on ${dateStr} • Total Records: ${processedItems.length}</div>
            </div>
          </div>
          <table>
            <thead><tr>${tableHeaders}</tr></thead>
            <tbody>${tableRowsHtml}</tbody>
          </table>
          <div class="summary">Report Total Count: ${processedItems.length}</div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  const fetchActivityLogs = async () => {
    if (!selectedCompany?._id) return;
    setActivityLogLoading(true);
    try {
      const res = await getActivityLogs({ company: selectedCompany._id, limit: 100 });
      setActivityLogs(res.data?.logs || res.data || []);
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    } finally {
      setActivityLogLoading(false);
    }
  };

  useEffect(() => {
    loadDirectoryData();
  }, [loadDirectoryData]);

  // Tab Switch Handler
  const handleTabChange = (tab: DirectoryTabType) => {
    setActiveMainTab(tab);
    setPage(1);
    setSelectedIds([]);
    setAnimationKey(Date.now());
  };

  // Open Pop-Up Modal for Creating or Editing
  const openModal = async (item?: DirectoryItem) => {
    loadAuxiliaryData();

    if (item) {
      setEditingItem(item);
      setForm({
        firmName: item.firmName || item.name || '',
        ownerName: item.ownerName || '',
        phone: item.phone || '',
        whatsapp: item.whatsapp || item.phone || '',
        altPhone: item.altPhone || '',
        email: item.email || '',
        gstNumber: item.gstNumber || item.gstin || '',
        aadharNumber: item.aadharNumber || '',
        vendorType: item.vendorType || 'BOARD SUPPLIER',
        doorNo: item.doorNo || '',
        streetName: item.streetName || '',
        address1: item.address1 || '',
        area: item.area || '',
        landmark: item.landmark || '',
        city: item.city || '',
        district: item.district || '',
        state: item.state || 'Andhra Pradesh',
        pincode: item.pincode || '',
        gpsLocation: item.gpsLocation || '',
        route: item.route || '',
        agentAssigned: item.agentAssigned || item.assignedAgent || '',
        preferredTransport: item.preferredTransport || '',
        creditDays: String(item.creditDays || 30),
        creditLimit: String(item.creditLimit || 100000),
        openingBalance: String(item.openingBalance || 0),
        outstandingBalance: String(item.outstandingBalance || 0),
        status: (item.status as any) || 'active',
        tags: Array.isArray(item.tags) ? item.tags : item.tags ? String(item.tags).split(',').map(t => t.trim()).filter(Boolean) : [],
        notes: item.notes || item.description || '',
        customerPhoto: item.customerPhoto || '',
        shopPhoto: item.shopPhoto || '',
        code: item.code || '',
        contactName: item.contactName || item.ownerName || '',
        assignedRoutes: allRoutes
          .filter((r: any) => r.assignedAgent && r.assignedAgent === (item.firmName || item.contactName))
          .map((r: any) => r._id),
        contactPersons: (item as any).contactPersons || []
      });
    } else {
      setEditingItem(null);
      setForm({
        firmName: '',
        ownerName: '',
        phone: '',
        whatsapp: '',
        altPhone: '',
        email: '',
        gstNumber: '',
        aadharNumber: '',
        vendorType: 'BOARD SUPPLIER',
        doorNo: '',
        streetName: '',
        address1: '',
        area: '',
        landmark: '',
        city: '',
        district: '',
        state: 'Andhra Pradesh',
        pincode: '',
        gpsLocation: '',
        route: '',
        agentAssigned: '',
        preferredTransport: '',
        creditDays: '30',
        creditLimit: '100000',
        openingBalance: '0',
        outstandingBalance: '0',
        status: 'active',
        tags: [],
        notes: '',
        customerPhoto: '',
        shopPhoto: '',
        code: '',
        contactName: '',
        assignedRoutes: [],
        contactPersons: []
      });
    }
    setShowModal(true);
  };

  // Create / Save Item Handler
  const handleSaveItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCompany?._id) {
      showToast('Please select a company first', 'error');
      return;
    }

    if (!form.firmName.trim()) {
      showToast('Name / Firm Name is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (activeMainTab === 'regions') {
        const payload = {
          name: form.firmName.trim(),
          code: form.code ? form.code.trim() : form.firmName.trim().slice(0, 3).toUpperCase(),
          assignedAgent: form.agentAssigned || '',
          description: form.notes || '',
          status: form.status,
          company: selectedCompany._id
        };

        if (editingItem?._id) {
          await updateRoute(editingItem._id, payload);
          showToast('Region updated successfully', 'success');
        } else {
          await createRoute(payload);
          showToast('New Region created successfully', 'success');
        }
      } else {
        let pType = 'customer';
        if (activeMainTab === 'vendors') pType = 'vendor';
        if (activeMainTab === 'agents') pType = 'agent';
        if (activeMainTab === 'transporters') pType = 'transporter';
        if (activeMainTab === 'cities') pType = 'market';

        const payload: any = {
          ...form,
          type: pType,
          firmName: form.firmName.trim(),
          contactName: form.contactName?.trim() || form.ownerName?.trim() || form.firmName.trim(),
          ownerName: form.ownerName?.trim() || form.contactName?.trim() || form.firmName.trim(),
          phone: form.phone?.trim() || '',
          whatsapp: form.whatsapp?.trim() || form.phone?.trim() || '',
          email: form.email?.trim() || '',
          vendorType: form.vendorType || 'Paper Mill',
          route: form.route || '',
          city: form.city || (activeMainTab === 'cities' ? form.firmName.trim() : ''),
          district: form.district || '',
          state: form.state || 'Andhra Pradesh',
          agentAssigned: form.agentAssigned || '',
          preferredTransport: form.preferredTransport || '',
          company: selectedCompany._id,
          creditLimit: Number(form.creditLimit) || 0,
          creditDays: Number(form.creditDays) || 30,
          openingBalance: Number(form.openingBalance) || 0,
          tags: Array.isArray(form.tags) ? form.tags : typeof form.tags === 'string' ? (form.tags as string).split(',').map(t => t.trim()).filter(Boolean) : []
        };

        if (editingItem?._id) {
          await updateParty(editingItem._id, payload);
          showToast(`${activeMainTab === 'vendors' ? 'Supplier' : activeMainTab === 'cities' ? 'City' : pType.charAt(0).toUpperCase() + pType.slice(1)} updated successfully`, 'success');
        } else {
          await createParty(payload);
          showToast(`New ${activeMainTab === 'vendors' ? 'Supplier' : activeMainTab === 'cities' ? 'City' : pType.charAt(0).toUpperCase() + pType.slice(1)} created successfully`, 'success');
        }

        // Sync route assignments for Agent
        if (activeMainTab === 'agents') {
          const agentName = form.firmName.trim();
          for (const routeItem of allRoutes) {
            const isChecked = form.assignedRoutes.includes(routeItem._id);
            const isCurrentlyAssigned = routeItem.assignedAgent === agentName;

            if (isChecked && !isCurrentlyAssigned) {
              await updateRoute(routeItem._id, { ...routeItem, assignedAgent: agentName });
            } else if (!isChecked && isCurrentlyAssigned) {
              await updateRoute(routeItem._id, { ...routeItem, assignedAgent: '' });
            }
          }
        }
      }

      setShowModal(false);
      setEditingItem(null);
      setAuxLoaded(false);
      loadDirectoryData();
      loadAuxiliaryData();
    } catch (err: any) {
      console.error('Failed to save record:', err);
      showToast(err.response?.data?.msg || err.message || 'Failed to save directory item', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Item
  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this directory record?')) return;
    try {
      if (activeMainTab === 'regions') {
        await deleteRoute(id);
      } else {
        await deletePartyApi(id);
      }
      showToast('Record deleted successfully', 'success');
      loadDirectoryData();
      loadAuxiliaryData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete record', 'error');
    }
  };

  // Dynamic Effective Sub-Module Tab Resolver for Selected Details
  const getEffectiveTab = (item: any, currentTab: DirectoryTabType): DirectoryTabType => {
    if (!item) return currentTab;

    // 1. Check type / partyType property from backend model
    const pType = (item.partyType || item.type || '').toLowerCase().trim();
    if (pType === 'customer') return 'customers';
    if (pType === 'vendor' || pType === 'supplier') return 'vendors';
    if (pType === 'agent') return 'agents';
    if (pType === 'transporter') return 'transporters';
    if (pType === 'route' || pType === 'region') return 'regions';
    if (pType === 'market' || pType === 'city') return 'cities';

    // 2. Check loaded sub-module lists by ID
    if (allCustomers.some((c: any) => c._id === item._id)) return 'customers';
    if (allVendors.some((v: any) => v._id === item._id)) return 'vendors';
    if (allAgents.some((a: any) => a._id === item._id)) return 'agents';
    if (allTransporters.some((t: any) => t._id === item._id)) return 'transporters';
    if (allRoutes.some((r: any) => r._id === item._id)) return 'regions';
    if (allCities.some((c: any) => c._id === item._id)) return 'cities';

    // 3. Fallback attribute checks (ignore empty default strings)
    if (item.vendorType && String(item.vendorType).trim() !== '') return 'vendors';
    if (item.commissionRate !== undefined && item.commissionRate !== null) return 'agents';
    if (item.vehicleNo !== undefined || item.transporterCode !== undefined) return 'transporters';

    // Default fallback to active main tab
    return currentTab;
  };

  // Lucide Icon helper
  const getItemIcon = (tab?: DirectoryTabType) => {
    const targetTab = tab || activeMainTab;
    switch (targetTab) {
      case 'customers': return <Users className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'vendors': return <Factory className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'agents': return <Briefcase className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'transporters': return <Truck className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'regions': return <Map className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'cities': return <Building className="w-4 h-4 text-purple-600 shrink-0" />;
      default: return <Users className="w-4 h-4 text-purple-600 shrink-0" />;
    }
  };

  const totalPages = Math.ceil(totalRecords / limit) || 1;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-slate-50/50 min-h-screen">
      
      {/* 1. Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-purple-100/80 text-purple-700 rounded-2xl shadow-2xs">
            <Users className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>Business Directory</span>
              <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full font-bold">
                {totalRecords} Total
              </span>
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              Unified master directory for Customers, Suppliers, Agents, Transporters, Regions & Cities.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => openModal()}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add New {activeMainTab === 'customers' ? 'Customer' : activeMainTab === 'vendors' ? 'Supplier' : activeMainTab === 'agents' ? 'Agent' : activeMainTab === 'transporters' ? 'Transporter' : activeMainTab === 'regions' ? 'Region' : 'City'}</span>
          </button>
          <button
            onClick={loadDirectoryData}
            className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl border border-gray-200 transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Top Navigation Tabs Bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 rounded-2xl shadow-2xs overflow-x-auto">
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleTabChange('customers')}
            className={`px-4 py-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeMainTab === 'customers'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Users className={`w-4 h-4 ${activeMainTab === 'customers' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span>Customers</span>
          </button>

          <button
            onClick={() => handleTabChange('vendors')}
            className={`px-4 py-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeMainTab === 'vendors'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Factory className={`w-4 h-4 ${activeMainTab === 'vendors' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span>Suppliers</span>
          </button>

          <button
            onClick={() => handleTabChange('agents')}
            className={`px-4 py-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeMainTab === 'agents'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Briefcase className={`w-4 h-4 ${activeMainTab === 'agents' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span>Agents</span>
          </button>

          <button
            onClick={() => handleTabChange('transporters')}
            className={`px-4 py-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeMainTab === 'transporters'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Truck className={`w-4 h-4 ${activeMainTab === 'transporters' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span>Transporters</span>
          </button>

          <button
            onClick={() => handleTabChange('regions')}
            className={`px-4 py-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeMainTab === 'regions'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Map className={`w-4 h-4 ${activeMainTab === 'regions' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span>Regions</span>
          </button>

          <button
            onClick={() => handleTabChange('cities')}
            className={`px-4 py-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeMainTab === 'cities'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Building className={`w-4 h-4 ${activeMainTab === 'cities' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span>Cities</span>
          </button>
        </div>

        {/* Right Action Bar (Search + Icon-Only Action Tools + Add Item Button matching SkuMasterV2) */}
        <div className="py-2 flex items-center gap-2 flex-wrap">
          {/* Global Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeMainTab}...`}
              className="pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl w-40 md:w-52 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 shadow-2xs font-medium"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 1. Filters Icon Button */}
          <button
            type="button"
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
              activeFilterCount > 0
                ? 'bg-purple-600 text-white border-purple-600 shadow-purple-100'
                : 'bg-white hover:bg-purple-50/60 text-purple-600 border-gray-200 hover:border-purple-200'
            }`}
            title={`Filters ${activeFilterCount > 0 ? `(${activeFilterCount} active)` : ''}`}
          >
            <Filter className="w-4 h-4" />
          </button>

          {/* 2. Sort Icon Button & Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowColumnPicker(false);
                setShowExportMenu(false);
              }}
              className="p-2 rounded-xl bg-white hover:bg-purple-50/60 border border-gray-200 hover:border-purple-200 text-purple-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Sort Options"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 text-xs">
                <div className="px-2 py-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Sort Options</div>
                <button
                  onClick={() => { setSortField('firmName'); setSortOrder('asc'); setShowSortMenu(false); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortField === 'firmName' && sortOrder === 'asc' ? 'bg-purple-50 text-purple-700 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                  <span>Firm Name (A to Z)</span>
                </button>
                <button
                  onClick={() => { setSortField('firmName'); setSortOrder('desc'); setShowSortMenu(false); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortField === 'firmName' && sortOrder === 'desc' ? 'bg-purple-50 text-purple-700 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                  <span>Firm Name (Z to A)</span>
                </button>
                <button
                  onClick={() => { setSortField('outstandingBalance'); setSortOrder('desc'); setShowSortMenu(false); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortField === 'outstandingBalance' && sortOrder === 'desc' ? 'bg-purple-50 text-purple-700 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                  <span>Outstanding (High to Low)</span>
                </button>
                <button
                  onClick={() => { setSortField('outstandingBalance'); setSortOrder('asc'); setShowSortMenu(false); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortField === 'outstandingBalance' && sortOrder === 'asc' ? 'bg-purple-50 text-purple-700 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                  <span>Outstanding (Low to High)</span>
                </button>
                <button
                  onClick={() => { setSortField('city'); setSortOrder('asc'); setShowSortMenu(false); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between ${sortField === 'city' ? 'bg-purple-50 text-purple-700 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                  <span>City (A to Z)</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Columns Icon Button & Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowColumnPicker(!showColumnPicker);
                setShowSortMenu(false);
                setShowExportMenu(false);
              }}
              className="p-2 rounded-xl bg-white hover:bg-purple-50/60 border border-gray-200 hover:border-purple-200 text-purple-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Visible Columns"
            >
              <Columns className="w-4 h-4" />
            </button>
            {showColumnPicker && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2.5 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Visible Columns</span>
                  <button onClick={() => setHiddenColumns({})} className="text-[10px] text-purple-600 font-bold hover:underline">Reset</button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {getColumnList(activeMainTab).map(col => (
                    <label key={col.id} className="flex items-center gap-2 text-gray-700 font-semibold cursor-pointer hover:bg-gray-50 p-1 rounded-lg">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns[col.id]}
                        onChange={(e) => {
                          setHiddenColumns(prev => ({ ...prev, [col.id]: !e.target.checked }));
                        }}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Export Icon Button & Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowExportMenu(!showExportMenu);
                setShowSortMenu(false);
                setShowColumnPicker(false);
              }}
              className="p-2 rounded-xl bg-white hover:bg-purple-50/60 border border-gray-200 hover:border-purple-200 text-purple-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Export Data (PDF / Excel)"
            >
              <Download className="w-4 h-4" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 text-xs">
                <button
                  onClick={() => { handleExportExcel(); setShowExportMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl font-semibold hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2 text-gray-700"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export Excel (.csv)</span>
                </button>
                <button
                  onClick={() => { handleExportPDF(); setShowExportMenu(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl font-semibold hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2 text-gray-700"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600" />
                  <span>Export PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* 5. Sample CSV Icon Button */}
          <button
            type="button"
            onClick={handleDownloadSampleCSV}
            className="p-2 rounded-xl bg-white hover:bg-purple-50/60 text-purple-600 border border-gray-200 hover:border-purple-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
            title="Download Sample CSV Template"
          >
            <FileSpreadsheet className="w-4 h-4 text-purple-600" />
          </button>

          {/* 6. Import CSV Icon Button */}
          <label
            className={`p-2 rounded-xl border text-purple-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
              isImporting ? 'bg-purple-100 border-purple-300 animate-pulse' : 'bg-white hover:bg-purple-50/60 border-gray-200 hover:border-purple-200'
            }`}
            title="Import CSV/Excel Data"
          >
            <Upload className={`w-4 h-4 text-purple-600 ${isImporting ? 'animate-bounce' : ''}`} />
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              disabled={isImporting}
              onChange={handleImportCSV}
              className="hidden"
            />
          </label>

          {/* 7. Activity Logs Icon Button */}
          <button
            type="button"
            onClick={() => {
              fetchActivityLogs();
              setShowActivityLogModal(true);
            }}
            className="p-2 rounded-xl bg-white hover:bg-purple-50/60 border border-gray-200 hover:border-purple-200 text-purple-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
            title="View Activity Logs"
          >
            <History className="w-4 h-4 text-purple-600" />
          </button>

          {/* 8. Add New Item Icon Button (Circular + Button matching Item Master SkuMasterV2.tsx!) */}
          <button
            type="button"
            onClick={() => openModal()}
            className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-purple-50 text-purple-600 flex items-center justify-center transition-all shadow-2xs cursor-pointer font-bold shrink-0"
            title={`Add New ${activeMainTab === 'customers' ? 'Customer' : activeMainTab === 'vendors' ? 'Supplier' : activeMainTab === 'agents' ? 'Agent' : activeMainTab === 'transporters' ? 'Transporter' : activeMainTab === 'regions' ? 'Region' : 'City'}`}
          >
            <Plus className="w-4 h-4 text-purple-600 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Expandable Filter Drawer Bar */}
      {showFilterDrawer && (
        <div className="bg-slate-50 border border-purple-100 rounded-2xl p-3.5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-gray-200/60 pb-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-purple-600" />
              <span className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">Advanced Filters</span>
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on-hold">On Hold</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">City / Market</label>
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Cities</option>
                {allCities.map(c => (
                  <option key={c._id} value={c.firmName || c.name}>{c.firmName || c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">Region / Line</label>
              <select
                value={filterRoute}
                onChange={(e) => setFilterRoute(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Regions</option>
                {allRoutes.map(r => (
                  <option key={r._id} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>

            {activeMainTab === 'vendors' && (
              <div>
                <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">Vendor Type</label>
                <select
                  value={filterVendorType}
                  onChange={(e) => setFilterVendorType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All Vendor Types</option>
                  <option value="BOARD SUPPLIER">BOARD SUPPLIER</option>
                  <option value="PAPER SUPPLIER">PAPER SUPPLIER</option>
                  <option value="PRINTING VENDOR">PRINTING VENDOR</option>
                  <option value="GENERAL VENDOR">GENERAL VENDOR</option>
                </select>
              </div>
            )}

            {activeMainTab === 'customers' && (
              <div>
                <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">Assigned Agent</label>
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All Agents</option>
                  {allAgents.map(a => (
                    <option key={a._id} value={a.firmName || a.contactName}>{a.firmName || a.contactName}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">Min Outstanding (₹)</label>
              <input
                type="number"
                value={filterMinBal}
                onChange={(e) => setFilterMinBal(e.target.value)}
                placeholder="0"
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">Max Outstanding (₹)</label>
              <input
                type="number"
                value={filterMaxBal}
                onChange={(e) => setFilterMaxBal(e.target.value)}
                placeholder="Unlimited"
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-mono text-gray-800 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">Filter by Tag</label>
              <input
                type="text"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                placeholder="e.g. VIP, regular"
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Directory Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-gray-200 text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === items.length && items.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(items.map(i => i._id));
                      else setSelectedIds([]);
                    }}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3 w-8 text-center text-gray-400 font-semibold">#</th>

                {activeMainTab === 'customers' && (
                  <>
                    <th className="py-3 px-3 whitespace-nowrap">CUSTOMER FIRM</th>
                    <th className="py-3 px-3 whitespace-nowrap">MOBILE / WHATSAPP</th>
                    <th className="py-3 px-3 whitespace-nowrap">CITY & DISTRICT</th>
                    <th className="py-3 px-3 whitespace-nowrap">REGION & MARKET</th>
                    <th className="py-3 px-3 whitespace-nowrap">ASSIGNED AGENT</th>
                    <th className="py-3 px-3 whitespace-nowrap">CREDIT LIMIT & DAYS</th>
                    <th className="py-3 px-3 whitespace-nowrap">OUTSTANDING</th>
                    <th className="py-3 px-3 whitespace-nowrap">TAGS</th>
                  </>
                )}

                {activeMainTab === 'vendors' && (
                  <>
                    <th className="py-3 px-3 whitespace-nowrap">SUPPLIER NAME</th>
                    <th className="py-3 px-3 whitespace-nowrap">VENDOR CATEGORY</th>
                    <th className="py-3 px-3 whitespace-nowrap">CONTACT PERSON</th>
                    <th className="py-3 px-3 whitespace-nowrap">MOBILE / CONTACT</th>
                    <th className="py-3 px-3 whitespace-nowrap">CITY & STATE</th>
                    <th className="py-3 px-3 whitespace-nowrap">CREDIT DAYS</th>
                    <th className="py-3 px-3 whitespace-nowrap">OUTSTANDING</th>
                    <th className="py-3 px-3 whitespace-nowrap">TAGS</th>
                  </>
                )}

                {activeMainTab === 'agents' && (
                  <>
                    <th className="py-3 px-3 whitespace-nowrap">
                      <span>AGENT NAME</span>
                      <span className="text-[10px] text-gray-400 font-normal ml-1 inline-block">⇅</span>
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">
                      <span>MOBILE</span>
                      <span className="text-[10px] text-gray-400 font-normal ml-1 inline-block">⇅</span>
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">
                      <span>ASSIGNED REGIONS</span>
                      <span className="text-[10px] text-gray-400 font-normal ml-1 inline-block">⇅</span>
                    </th>
                  </>
                )}

                {activeMainTab === 'transporters' && (
                  <>
                    <th className="py-3 px-3 whitespace-nowrap">
                      <span>TRANSPORTER</span>
                      <span className="text-[10px] text-gray-400 font-normal ml-1 inline-block">⇅</span>
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">
                      <span>MOBILE</span>
                      <span className="text-[10px] text-gray-400 font-normal ml-1 inline-block">⇅</span>
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">
                      <span>CUSTOMERS USING</span>
                      <span className="text-[10px] text-gray-400 font-normal ml-1 inline-block">⇅</span>
                    </th>
                  </>
                )}

                {activeMainTab === 'regions' && (
                  <>
                    <th className="py-3 px-3 whitespace-nowrap">REGION CODE</th>
                    <th className="py-3 px-3 whitespace-nowrap">ASSIGNED AGENT</th>
                    <th className="py-3 px-3 whitespace-nowrap">CITIES COUNT</th>
                    <th className="py-3 px-3 whitespace-nowrap">CUSTOMERS COUNT</th>
                    <th className="py-3 px-3 whitespace-nowrap">OUTSTANDING BALANCE</th>
                  </>
                )}

                {activeMainTab === 'cities' && (
                  <>
                    <th className="py-3 px-3 whitespace-nowrap">CITY NAME</th>
                    <th className="py-3 px-3 whitespace-nowrap">PARENT REGION</th>
                    <th className="py-3 px-3 whitespace-nowrap">DISTRICT & STATE</th>
                    <th className="py-3 px-3 whitespace-nowrap">ASSIGNED AGENT</th>
                  </>
                )}

                <th className="py-3 px-3 whitespace-nowrap">
                  <span>STATUS</span>
                  {(activeMainTab === 'agents' || activeMainTab === 'transporters') && (
                    <span className="text-[10px] text-gray-400 font-normal ml-1 inline-block">⇅</span>
                  )}
                </th>
                <th className="py-3 px-3 text-right whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody key={animationKey} className="divide-y divide-gray-100 text-xs text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-400 whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                      <span>Fetching backend records...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-400 whitespace-nowrap">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-8 h-8 text-gray-300" />
                      <p className="font-semibold text-gray-600">No {activeMainTab} found in backend</p>
                      <p className="text-[11px]">Click "+ Add New" above to create an entry</p>
                    </div>
                  </td>
                </tr>
              ) : (
                processedItems.map((item, index) => {
                  const isSelected = selectedIds.includes(item._id);
                  const bal = item.outstandingBalance || 0;

                  return (
                    <tr
                      key={item._id || index}
                      onClick={() => setSelectedDetails(item)}
                      style={{
                        animation: 'slideDownFade 0.35s ease-out forwards',
                        animationDelay: `${index * 35}ms`
                      }}
                      className={`hover:bg-purple-50/20 transition-all cursor-pointer opacity-0 whitespace-nowrap ${isSelected ? 'bg-purple-50/30' : ''}`}
                    >
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds(prev => [...prev, item._id]);
                            else setSelectedIds(prev => prev.filter(id => id !== item._id));
                          }}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 text-center text-gray-400 font-mono font-semibold text-xs">
                        {(page - 1) * limit + index + 1}
                      </td>

                      {/* CUSTOMERS ROW */}
                      {activeMainTab === 'customers' && (
                        <>
                          <td className="py-3 px-3 font-semibold text-gray-900">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-purple-600 shrink-0" />
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-900">{item.firmName}</span>
                                {(item.contactName || item.ownerName || item.contactPersons?.[0]?.name) && (
                                  <span className="text-[11px] text-gray-500 font-medium">{item.contactName || item.ownerName || item.contactPersons?.[0]?.name}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono font-medium text-gray-700">
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <span>{item.phone || '—'}</span>
                              {item.phone && item.phone.length >= 10 && (
                                <a href={`https://wa.me/91${item.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="Chat on WhatsApp">
                                  <WhatsAppIcon />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{[item.city, item.district].filter(Boolean).join(', ') || '—'}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{[item.route, item.assignedMarket].filter(Boolean).join(' • ') || '—'}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{item.agentAssigned || '—'}</td>
                          <td className="py-3 px-3 font-mono text-gray-700 font-semibold">
                            ₹{(item.creditLimit || 50000).toLocaleString('en-IN')} ({item.creditDays || 30} days)
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              bal > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              ₹{Math.abs(bal).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {Array.isArray(item.tags) && item.tags.length > 0 ? (
                              <div className="flex items-center gap-1 whitespace-nowrap" title={item.tags.join(', ')}>
                                {item.tags.slice(0, 2).map((t: string, i: number) => (
                                  <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-md border border-purple-200 uppercase shrink-0">
                                    {t}
                                  </span>
                                ))}
                                {item.tags.length > 2 && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-extrabold rounded-md border border-gray-200 shrink-0">
                                    +{item.tags.length - 2}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 font-normal text-[11px]">—</span>
                            )}
                          </td>
                        </>
                      )}

                      {/* VENDORS / SUPPLIERS ROW */}
                      {activeMainTab === 'vendors' && (
                        <>
                          <td className="py-3 px-3 font-semibold text-gray-900">
                            <div className="flex items-center gap-2">
                              <Factory className="w-4 h-4 text-purple-600 shrink-0" />
                              <span className="font-bold text-gray-900">{item.firmName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-100">
                              {item.vendorType || 'Paper Mill'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{item.contactName || item.ownerName || '—'}</td>
                          <td className="py-3 px-3 font-mono text-gray-700">{item.phone || item.email || '—'}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{[item.city, item.state].filter(Boolean).join(', ') || '—'}</td>
                          <td className="py-3 px-3 font-mono text-gray-700">{item.creditDays || 30} Days</td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              bal > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              ₹{Math.abs(bal).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {Array.isArray(item.tags) && item.tags.length > 0 ? (
                              <div className="flex items-center gap-1 whitespace-nowrap" title={item.tags.join(', ')}>
                                {item.tags.slice(0, 2).map((t: string, i: number) => (
                                  <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-md border border-purple-200 uppercase shrink-0">
                                    {t}
                                  </span>
                                ))}
                                {item.tags.length > 2 && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-extrabold rounded-md border border-gray-200 shrink-0">
                                    +{item.tags.length - 2}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 font-normal text-[11px]">—</span>
                            )}
                          </td>
                        </>
                      )}

                      {/* AGENTS ROW (Matches Screenshot 1 100%) */}
                      {activeMainTab === 'agents' && (
                        <>
                          <td className="py-3 px-3 font-semibold text-gray-900">
                            <span className="font-bold text-gray-900">{item.firmName || item.contactName || item.name}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-gray-700">
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <span className={item.phone ? "font-bold text-blue-600" : "text-gray-400 font-normal"}>{item.phone || '—'}</span>
                              {item.phone && item.phone.length >= 10 && (
                                <a href={`https://wa.me/91${item.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="Chat on WhatsApp">
                                  <WhatsAppIcon />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {(() => {
                              const agentName = (item.firmName || item.contactName || item.name || '').toLowerCase().trim();
                              const assigned = allRoutes.filter((r: any) => 
                                (r.assignedAgent && r.assignedAgent.toLowerCase().trim() === agentName) ||
                                (Array.isArray(item.assignedRoutes) && item.assignedRoutes.includes(r._id))
                              );
                              if (assigned.length === 0) {
                                return <span className="text-gray-400 italic text-xs">No regions assigned</span>;
                              }
                              return (
                                <div className="flex flex-wrap items-center gap-1.5 max-w-[320px]">
                                  {assigned.map((r: any, idx: number) => (
                                    <span
                                      key={r._id || idx}
                                      className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100/80"
                                      title={r.name}
                                    >
                                      {r.code || r.name}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                        </>
                      )}

                      {/* TRANSPORTERS ROW (Matches Screenshot 3 100%) */}
                      {activeMainTab === 'transporters' && (
                        <>
                          <td className="py-3 px-3 font-semibold text-gray-900">
                            <span className="font-bold text-gray-900">{item.firmName || item.name}</span>
                          </td>
                          <td className="py-3 px-3 font-mono font-medium">
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              {item.phone || item.contactPersons?.[0]?.phone ? (
                                <span className="font-bold text-blue-600 font-mono">
                                  {item.phone || item.contactPersons?.[0]?.phone}
                                </span>
                              ) : (
                                <span className="text-gray-400 font-normal">—</span>
                              )}
                              {(item.phone || item.contactPersons?.[0]?.phone) && (
                                <a
                                  href={`https://wa.me/91${(item.phone || item.contactPersons?.[0]?.phone || '').replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Chat on WhatsApp"
                                  className="inline-flex items-center"
                                >
                                  <WhatsAppIcon />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-900 text-xs">
                            {(() => {
                              const transName = (item.firmName || item.name || '').toLowerCase().trim();
                              return allCustomers.filter((c: any) => {
                                const pref = (c.preferredTransport || '').toLowerCase().trim();
                                return pref && pref === transName;
                              }).length;
                            })()}
                          </td>
                        </>
                      )}

                      {/* REGIONS ROW (Matches User Screenshot 2 100%) */}
                      {activeMainTab === 'regions' && (
                        <>
                          <td className="py-3 px-3 font-semibold text-gray-900">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-gray-900 text-xs font-mono">{item.code || '—'}</span>
                              <span className="text-gray-500 text-[11px] font-medium">{item.firmName || item.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {item.agentAssigned || item.assignedAgent ? (
                              <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100/60 inline-block">
                                {item.agentAssigned || item.assignedAgent}
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100/60 inline-block">
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-900 text-xs">
                            {allCities.filter((c: any) => {
                              const rName = (item.firmName || item.name || '').toLowerCase().trim();
                              const rCode = (item.code || '').toLowerCase().trim();
                              const cRoute = (c.route || '').toLowerCase().trim();
                              return cRoute && (cRoute === rName || (rCode && cRoute === rCode));
                            }).length}
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-900 text-xs">
                            {(() => {
                              const rName = (item.firmName || item.name || '').toLowerCase().trim();
                              const rCode = (item.code || '').toLowerCase().trim();
                              const regionCityNames = new Set(
                                allCities
                                  .filter((c: any) => {
                                    const cRoute = (c.route || '').toLowerCase().trim();
                                    return cRoute && (cRoute === rName || (rCode && cRoute === rCode));
                                  })
                                  .map((c: any) => (c.firmName || c.name || '').toLowerCase().trim())
                              );

                              return allCustomers.filter((c: any) => {
                                const cRoute = (c.route || '').toLowerCase().trim();
                                if (cRoute && (cRoute === rName || (rCode && cRoute === rCode))) return true;
                                const cCity = (c.city || '').toLowerCase().trim();
                                if (cCity && regionCityNames.has(cCity)) return true;
                                const cMarket = (c.assignedMarket || '').toLowerCase().trim();
                                if (cMarket && regionCityNames.has(cMarket)) return true;
                                return false;
                              }).length;
                            })()}
                          </td>
                          <td className="py-3 px-3">
                            {(() => {
                              const rName = (item.firmName || item.name || '').toLowerCase().trim();
                              const rCode = (item.code || '').toLowerCase().trim();
                              const regionCityNames = new Set(
                                allCities
                                  .filter((c: any) => {
                                    const cRoute = (c.route || '').toLowerCase().trim();
                                    return cRoute && (cRoute === rName || (rCode && cRoute === rCode));
                                  })
                                  .map((c: any) => (c.firmName || c.name || '').toLowerCase().trim())
                              );

                              const regionCusts = allCustomers.filter((c: any) => {
                                const cRoute = (c.route || '').toLowerCase().trim();
                                if (cRoute && (cRoute === rName || (rCode && cRoute === rCode))) return true;
                                const cCity = (c.city || '').toLowerCase().trim();
                                if (cCity && regionCityNames.has(cCity)) return true;
                                const cMarket = (c.assignedMarket || '').toLowerCase().trim();
                                if (cMarket && regionCityNames.has(cMarket)) return true;
                                return false;
                              });

                              const totalOut = regionCusts.reduce((sum: number, c: any) => sum + (Number(c.outstandingBalance) || Number(c.outstanding) || 0), 0);
                              if (totalOut > 0) {
                                return (
                                  <div className="flex flex-col items-start">
                                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-mono font-bold text-xs">
                                      ₹{totalOut.toLocaleString('en-IN')}
                                    </span>
                                    <span className="text-[10px] text-gray-500 font-medium mt-0.5">Outstanding (To Collect)</span>
                                  </div>
                                );
                              }
                              if (totalOut < 0) {
                                return (
                                  <div className="flex flex-col items-start">
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold text-xs">
                                      ₹{Math.abs(totalOut).toLocaleString('en-IN')}
                                    </span>
                                    <span className="text-[10px] text-gray-500 font-medium mt-0.5">Advance (Credit)</span>
                                  </div>
                                );
                              }
                              return (
                                <div className="flex flex-col items-start">
                                  <span className="font-bold text-xs text-gray-800 font-mono">
                                    ₹0
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-medium mt-0.5">No outstanding</span>
                                </div>
                              );
                            })()}
                          </td>
                        </>
                      )}

                      {/* CITIES ROW */}
                      {activeMainTab === 'cities' && (
                        <>
                          <td className="py-3 px-3 font-semibold text-gray-900">
                            <div className="flex items-center gap-2">
                              <Building className="w-4 h-4 text-purple-600 shrink-0" />
                              <span className="font-bold text-gray-900">{item.firmName || item.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-purple-700 font-bold">{item.route || '—'}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{[item.district, item.state].filter(Boolean).join(', ') || '—'}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{item.agentAssigned || '—'}</td>
                        </>
                      )}

                      {/* STATUS */}
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase border ${
                          item.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : item.status === 'inactive'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {item.status || 'active'}
                        </span>
                      </td>

                      {/* ACTIONS (Matches User Screenshot 100%) */}
                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDetails(item)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md font-bold text-xs transition-all cursor-pointer"
                            title="View Profile"
                          >
                            Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => openModal(item)}
                            className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-md font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                            title="Edit Record"
                          >
                            <Edit className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item._id)}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Fast Pagination */}
        <div className="p-3 bg-gray-50/80 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500 font-semibold">
          <span>
            {activeMainTab === 'regions' 
              ? `Showing ${items.length} of ${totalRecords} records`
              : `Showing ${totalRecords > 0 ? (page - 1) * limit + 1 : 0} to ${Math.min(page * limit, totalRecords)} of ${totalRecords} ${activeMainTab === 'customers' ? 'customers' : activeMainTab === 'vendors' ? 'suppliers' : activeMainTab === 'agents' ? 'agents' : activeMainTab === 'transporters' ? 'transporters' : 'cities'}`
            }
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. POP-UP DIALOG BOX MODAL (Matching Item Master Design System 100%) */}
      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          maxWidth={activeMainTab === 'customers' ? 'max-w-4xl' : activeMainTab === 'vendors' ? 'max-w-3xl' : 'max-w-xl'}
          hideCloseButton
        >
          <form onSubmit={handleSaveItem} className="space-y-4 p-1">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                  <span className="text-base">{getItemIcon()}</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 tracking-tight">
                    {editingItem ? 'Edit' : 'Add'} {activeMainTab === 'customers' ? 'Customer Master' : activeMainTab === 'vendors' ? 'Vendor Master' : activeMainTab === 'agents' ? 'Agent Master' : activeMainTab === 'regions' ? 'Route / Region Master' : activeMainTab === 'cities' ? 'Market / City Master' : 'Transporter Master'}
                  </h3>
                  <p className="text-[11px] text-gray-400 font-medium">Enter master details below</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* A. ADD CUSTOMER MASTER (Matches Screenshots 100%) */}
            {activeMainTab === 'customers' && (
              <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-2 text-xs">
                
                {/* 1. BASIC INFORMATION */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>BASIC INFORMATION</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Firm / Company Name *</label>
                      <input
                        type="text"
                        required
                        value={form.firmName}
                        onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                        placeholder="e.g. Sri Krishna Binding Works"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Owner Name</label>
                      <input
                        type="text"
                        value={form.ownerName}
                        onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))}
                        placeholder="e.g. Ram Prasad"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Mobile Number *</label>
                      <input
                        type="text"
                        required
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="10-digit number"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">WhatsApp Number</label>
                      <input
                        type="text"
                        value={form.whatsapp}
                        onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                        placeholder="Leave blank to match Mobile"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Alternate Mobile</label>
                      <input
                        type="text"
                        value={form.altPhone}
                        onChange={e => setForm(f => ({ ...f, altPhone: e.target.value }))}
                        placeholder="Alternate number"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Email ID</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="e.g. customer@gmail.com"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">GST Number</label>
                      <input
                        type="text"
                        value={form.gstNumber}
                        onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value }))}
                        placeholder="e.g. 37AAAAA1111A1Z1"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono uppercase focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Aadhar Number</label>
                      <input
                        type="text"
                        value={form.aadharNumber}
                        onChange={e => setForm(f => ({ ...f, aadharNumber: e.target.value }))}
                        placeholder="e.g. 123456789012"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. ADDRESS INFORMATION */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>ADDRESS INFORMATION</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Door Number / Dr No</label>
                      <input
                        type="text"
                        value={form.doorNo}
                        onChange={e => setForm(f => ({ ...f, doorNo: e.target.value }))}
                        placeholder="e.g. 5-3/A"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Street Name</label>
                      <input
                        type="text"
                        value={form.streetName}
                        onChange={e => setForm(f => ({ ...f, streetName: e.target.value }))}
                        placeholder="e.g. Press Bazar"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Address Line 1</label>
                      <input
                        type="text"
                        value={form.address1}
                        onChange={e => setForm(f => ({ ...f, address1: e.target.value }))}
                        placeholder="Building, lane details..."
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Area</label>
                      <input
                        type="text"
                        value={form.area}
                        onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                        placeholder="e.g. Auto Nagar"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Landmark</label>
                      <input
                        type="text"
                        value={form.landmark}
                        onChange={e => setForm(f => ({ ...f, landmark: e.target.value }))}
                        placeholder="e.g. Near Water Tank"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1 flex items-center justify-between">
                        <span>City</span>
                        {form.route && (
                          <span className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full font-bold">
                            Auto Region: {form.route}
                          </span>
                        )}
                      </label>
                      <select
                        value={form.city}
                        onChange={e => handleCitySelect(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      >
                        <option value="">Select City</option>
                        {allCities.map((c: any) => {
                          const cityName = c.firmName || c.name;
                          return (
                            <option key={c._id} value={cityName}>
                              {cityName}{c.route ? ` (${c.route})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">District</label>
                      <input
                        type="text"
                        value={form.district}
                        onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                        placeholder="e.g. Tirupati"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">State</label>
                      <input
                        type="text"
                        value={form.state}
                        onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                        placeholder="Andhra Pradesh"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Pin Code</label>
                      <input
                        type="text"
                        value={form.pincode}
                        onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))}
                        placeholder="e.g. 517501"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Google Maps Link</label>
                      <input
                        type="text"
                        value={form.gpsLocation}
                        onChange={e => setForm(f => ({ ...f, gpsLocation: e.target.value }))}
                        placeholder="https://maps.google.com/..."
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. BUSINESS & LOGISTICS */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>BUSINESS & LOGISTICS</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Region / Line</label>
                      <select
                        value={form.route}
                        onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      >
                        <option value="">Select Region</option>
                        {allRoutes.map((r: any) => (
                          <option key={r._id} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Assigned Agent</label>
                      <select
                        value={form.agentAssigned}
                        onChange={e => setForm(f => ({ ...f, agentAssigned: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      >
                        <option value="">Select Agent</option>
                        {allAgents.map((a: any) => (
                          <option key={a._id} value={a.firmName || a.contactName}>{a.firmName || a.contactName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Preferred Transport</label>
                      <select
                        value={form.preferredTransport}
                        onChange={e => setForm(f => ({ ...f, preferredTransport: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      >
                        <option value="">Select Transporter</option>
                        {allTransporters.map((t: any) => (
                          <option key={t._id} value={t.firmName}>{t.firmName}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 4. CREDIT & GRADE SETTINGS */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>CREDIT & GRADE SETTINGS</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Credit Days Limit</label>
                      <input
                        type="number"
                        value={form.creditDays}
                        onChange={e => setForm(f => ({ ...f, creditDays: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Credit Limit (₹)</label>
                      <input
                        type="number"
                        value={form.creditLimit}
                        onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Opening Balance (₹)</label>
                      <input
                        type="number"
                        value={form.openingBalance}
                        onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Outstanding Balance (₹)</label>
                      <input
                        type="number"
                        value={form.outstandingBalance}
                        onChange={e => setForm(f => ({ ...f, outstandingBalance: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-gray-100 shadow-2xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Tags</label>
                      <TagInput
                        tags={form.tags}
                        onChange={newTags => setForm(f => ({ ...f, tags: newTags }))}
                        placeholder="Press Enter or Comma to add tags..."
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-semibold mb-1">Remarks / Notes</label>
                      <textarea
                        rows={2}
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="General business remarks..."
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* B. VENDOR / SUPPLIER FORM (Matches Screenshots 100%) */}
            {activeMainTab === 'vendors' && (
              <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-2 text-xs">
                {/* 1. BASIC INFORMATION */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>Basic Information</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Firm / Company Name*</label>
                      <input
                        type="text"
                        required
                        value={form.firmName}
                        onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                        placeholder="e.g. Tirupati Card Centre"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 bg-white shadow-2xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Owner Name*</label>
                        <input
                          type="text"
                          required
                          value={form.ownerName}
                          onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))}
                          placeholder="e.g. Ramesh Kumar"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Vendor Type*</label>
                        <select
                          required
                          value={form.vendorType}
                          onChange={e => setForm(f => ({ ...f, vendorType: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        >
                          <option value="">Select Vendor Type</option>
                          <option value="PAPER SUPPLIER">PAPER SUPPLIER</option>
                          <option value="BOARD SUPPLIER">BOARD SUPPLIER</option>
                          <option value="ADHESIVE SUPPLIER">ADHESIVE SUPPLIER</option>
                          <option value="WIRE SUPPLIER">WIRE SUPPLIER</option>
                          <option value="PRINTING VENDOR">PRINTING VENDOR</option>
                          <option value="RAW MATERIAL">RAW MATERIAL</option>
                          <option value="GENERAL SUPPLIER">GENERAL SUPPLIER</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Mobile Number*</label>
                        <input
                          type="text"
                          required
                          value={form.phone}
                          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="e.g. 98765 43210"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">WhatsApp Number</label>
                        <input
                          type="text"
                          value={form.whatsapp}
                          onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                          placeholder="Leave blank to match Mobile"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Alternate Mobile</label>
                      <input
                        type="text"
                        value={form.altPhone}
                        onChange={e => setForm(f => ({ ...f, altPhone: e.target.value }))}
                        placeholder="Alternate mobile"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Email Address</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="e.g. example@mail.com"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">GST Number</label>
                        <input
                          type="text"
                          value={form.gstNumber}
                          onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value }))}
                          placeholder="e.g. 37AAAAA1111A1Z1"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono uppercase focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Aadhar Number</label>
                        <input
                          type="text"
                          value={form.aadharNumber}
                          onChange={e => setForm(f => ({ ...f, aadharNumber: e.target.value }))}
                          placeholder="e.g. 123456789012"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. ADDRESS INFORMATION */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>Address Information</span>
                  </h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Door / Plot Number</label>
                        <input
                          type="text"
                          value={form.doorNo}
                          onChange={e => setForm(f => ({ ...f, doorNo: e.target.value }))}
                          placeholder="e.g. 12/A"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Street Name</label>
                        <input
                          type="text"
                          value={form.streetName}
                          onChange={e => setForm(f => ({ ...f, streetName: e.target.value }))}
                          placeholder="e.g. Gandhi Road"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Address Line</label>
                      <input
                        type="text"
                        value={form.address1}
                        onChange={e => setForm(f => ({ ...f, address1: e.target.value }))}
                        placeholder="e.g. Near Bus Stand"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Area / Locality</label>
                        <input
                          type="text"
                          value={form.area}
                          onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                          placeholder="e.g. Anna Nagar"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Landmark</label>
                        <input
                          type="text"
                          value={form.landmark}
                          onChange={e => setForm(f => ({ ...f, landmark: e.target.value }))}
                          placeholder="e.g. Opp. SBI Bank"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Town / City*</label>
                        <input
                          type="text"
                          required
                          value={form.city}
                          onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                          placeholder="e.g. Chennai"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">District*</label>
                        <input
                          type="text"
                          required
                          value={form.district}
                          onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                          placeholder="e.g. Chennai"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">State*</label>
                        <input
                          type="text"
                          required
                          value={form.state}
                          onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                          placeholder="Andhra Pradesh"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Pincode*</label>
                        <input
                          type="text"
                          required
                          value={form.pincode}
                          onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))}
                          placeholder="e.g. 600001"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. LOCATION */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>Location</span>
                  </h4>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Google Maps Link</label>
                    <input
                      type="text"
                      value={form.gpsLocation}
                      onChange={e => setForm(f => ({ ...f, gpsLocation: e.target.value }))}
                      placeholder="Paste Google Maps URL"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    />
                  </div>
                </div>

                {/* 4. BUSINESS SETTINGS */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>Business Settings</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Operating Status</label>
                      <select
                        value={form.status}
                        onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="on-hold">On Hold</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Outstanding Balance (₹)</label>
                      <input
                        type="number"
                        value={form.outstandingBalance}
                        onChange={e => setForm(f => ({ ...f, outstandingBalance: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Tags</label>
                      <TagInput
                        tags={form.tags}
                        onChange={newTags => setForm(f => ({ ...f, tags: newTags }))}
                        placeholder="Press Enter or Comma to add tags..."
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Remarks / Notes</label>
                      <textarea
                        rows={2}
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="General remarks/instructions..."
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. CONTACT PERSONS */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                      <span>CONTACT PERSONS</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        contactPersons: [...(f.contactPersons || []), { name: '', phone: '', email: '', designation: '' }]
                      }))}
                      className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Contact</span>
                    </button>
                  </div>
                  {(!form.contactPersons || form.contactPersons.length === 0) ? (
                    <p className="text-gray-400 italic text-[11px]">No contact persons added yet. Click Add Contact to add.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {form.contactPersons.map((cp: any, idx: number) => (
                        <div key={idx} className="p-3 bg-white border border-gray-200 rounded-xl space-y-2 relative shadow-2xs">
                          <button
                            type="button"
                            onClick={() => setForm(f => ({
                              ...f,
                              contactPersons: f.contactPersons.filter((_: any, i: number) => i !== idx)
                            }))}
                            className="absolute right-2 top-2 text-gray-400 hover:text-rose-600 cursor-pointer"
                            title="Remove Contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="grid grid-cols-2 gap-2 pr-6">
                            <input
                              type="text"
                              placeholder="Contact Name"
                              value={cp.name}
                              onChange={e => {
                                const newCP = [...(form.contactPersons || [])];
                                newCP[idx].name = e.target.value;
                                setForm(f => ({ ...f, contactPersons: newCP }));
                              }}
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-purple-600"
                            />
                            <input
                              type="text"
                              placeholder="Mobile Phone"
                              value={cp.phone}
                              onChange={e => {
                                const newCP = [...(form.contactPersons || [])];
                                newCP[idx].phone = e.target.value;
                                setForm(f => ({ ...f, contactPersons: newCP }));
                              }}
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-purple-600"
                            />
                            <input
                              type="email"
                              placeholder="Email Address"
                              value={cp.email}
                              onChange={e => {
                                const newCP = [...(form.contactPersons || [])];
                                newCP[idx].email = e.target.value;
                                setForm(f => ({ ...f, contactPersons: newCP }));
                              }}
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-purple-600"
                            />
                            <input
                              type="text"
                              placeholder="Designation / Role"
                              value={cp.designation}
                              onChange={e => {
                                const newCP = [...(form.contactPersons || [])];
                                newCP[idx].designation = e.target.value;
                                setForm(f => ({ ...f, contactPersons: newCP }));
                              }}
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-purple-600"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* C. AGENT FORM (Matches User Screenshot 100%) */}
            {activeMainTab === 'agents' && (
              <div className="space-y-4 text-xs">
                {/* 1. AGENT DETAILS */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>Agent Details</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Agent Name*</label>
                      <input
                        type="text"
                        required
                        value={form.firmName}
                        onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                        placeholder="e.g. Rajesh Kumar"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Mobile*</label>
                      <input
                        type="text"
                        required
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="e.g. 98765 43210"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Alternate Mobile</label>
                      <input
                        type="text"
                        value={form.altPhone}
                        onChange={e => setForm(f => ({ ...f, altPhone: e.target.value }))}
                        placeholder="Alternate mobile"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. ASSIGNED ROUTES */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div>
                    <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                      <span>Assigned Routes</span>
                    </h4>
                    <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                      Select the routes this agent is assigned to:
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-xl p-3 max-h-52 overflow-y-auto space-y-2.5 bg-white shadow-2xs">
                    {allRoutes.length === 0 ? (
                      <span className="text-gray-400 italic">No routes available in backend.</span>
                    ) : (
                      allRoutes.map((r: any) => {
                        const checked = form.assignedRoutes.includes(r._id);
                        return (
                          <label key={r._id} className="flex items-center gap-2.5 cursor-pointer text-xs select-none hover:bg-purple-50/30 p-1.5 rounded-lg transition-all">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                if (e.target.checked) setForm(f => ({ ...f, assignedRoutes: [...f.assignedRoutes, r._id] }));
                                else setForm(f => ({ ...f, assignedRoutes: f.assignedRoutes.filter(id => id !== r._id) }));
                              }}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900">{r.name}</span>
                              {r.assignedAgent && (
                                <span className="text-[11px] text-gray-400 font-normal">
                                  (Currently: {r.assignedAgent})
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* D. REGION / ROUTE FORM (Matches Screenshot 100%) */}
            {activeMainTab === 'regions' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>Region Details</span>
                  </h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Region Name*</label>
                        <input
                          type="text"
                          required
                          value={form.firmName}
                          onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                          placeholder="e.g. Andhra Line"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">Region Code*</label>
                        <input
                          type="text"
                          required
                          value={form.code}
                          onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                          placeholder="e.g. A"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono uppercase focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Assigned Agent</label>
                      <select
                        value={form.agentAssigned}
                        onChange={e => setForm(f => ({ ...f, agentAssigned: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      >
                        <option value="">Select Agent</option>
                        {allAgents.map((a: any) => (
                          <option key={a._id} value={a.firmName || a.contactName}>{a.firmName || a.contactName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Description</label>
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Region notes or details"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* E. CITY / MARKET FORM */}
            {activeMainTab === 'cities' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">City Name *</label>
                    <input
                      type="text"
                      required
                      value={form.firmName}
                      onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                      placeholder="e.g. Vijayawada"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Parent Region (Route) *</label>
                    <select
                      required
                      value={form.route}
                      onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    >
                      <option value="">Select Region</option>
                      {allRoutes.map((r: any) => (
                        <option key={r._id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">District</label>
                      <input
                        type="text"
                        value={form.district}
                        onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                        placeholder="e.g. Krishna"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">State</label>
                      <input
                        type="text"
                        value={form.state}
                        onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                        placeholder="Andhra Pradesh"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Assigned Agent</label>
                    <select
                      value={form.agentAssigned}
                      onChange={e => setForm(f => ({ ...f, agentAssigned: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    >
                      <option value="">Select Agent</option>
                      {allAgents.map((a: any) => (
                        <option key={a._id} value={a.firmName || a.contactName}>{a.firmName || a.contactName}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* F. TRANSPORTER FORM (Matches Screenshot 100%) */}
            {activeMainTab === 'transporters' && (
              <div className="space-y-4 text-xs">
                {/* 1. TRANSPORTER DETAILS */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>Transporter Details</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Transporter Name*</label>
                      <input
                        type="text"
                        required
                        value={form.firmName}
                        onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                        placeholder="e.g. Garuda"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Mobile Number</label>
                      <input
                        type="text"
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="e.g. 9876543210"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Email Address</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="e.g. example@mail.com"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">City</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                        placeholder="e.g. Bangalore"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. CONTACT PERSONS */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                      <span>CONTACT PERSONS</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        contactPersons: [...(f.contactPersons || []), { name: '', phone: '', email: '', designation: '' }]
                      }))}
                      className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Contact</span>
                    </button>
                  </div>
                  {(!form.contactPersons || form.contactPersons.length === 0) ? (
                    <p className="text-gray-400 italic text-[11px]">No contact persons added yet. Click Add Contact to add.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {form.contactPersons.map((cp: any, idx: number) => (
                        <div key={idx} className="p-3 bg-white border border-gray-200 rounded-xl space-y-2 relative shadow-2xs">
                          <button
                            type="button"
                            onClick={() => setForm(f => ({
                              ...f,
                              contactPersons: f.contactPersons.filter((_: any, i: number) => i !== idx)
                            }))}
                            className="absolute right-2 top-2 text-gray-400 hover:text-rose-600 cursor-pointer"
                            title="Remove Contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="grid grid-cols-2 gap-2 pr-6">
                            <input
                              type="text"
                              placeholder="Contact Name"
                              value={cp.name}
                              onChange={e => {
                                const newCP = [...(form.contactPersons || [])];
                                newCP[idx].name = e.target.value;
                                setForm(f => ({ ...f, contactPersons: newCP }));
                              }}
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-purple-600"
                            />
                            <input
                              type="text"
                              placeholder="Mobile Phone"
                              value={cp.phone}
                              onChange={e => {
                                const newCP = [...(form.contactPersons || [])];
                                newCP[idx].phone = e.target.value;
                                setForm(f => ({ ...f, contactPersons: newCP }));
                              }}
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-purple-600"
                            />
                            <input
                              type="email"
                              placeholder="Email Address"
                              value={cp.email}
                              onChange={e => {
                                const newCP = [...(form.contactPersons || [])];
                                newCP[idx].email = e.target.value;
                                setForm(f => ({ ...f, contactPersons: newCP }));
                              }}
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-purple-600"
                            />
                            <input
                              type="text"
                              placeholder="Designation / Role"
                              value={cp.designation}
                              onChange={e => {
                                const newCP = [...(form.contactPersons || [])];
                                newCP[idx].designation = e.target.value;
                                setForm(f => ({ ...f, contactPersons: newCP }));
                              }}
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-purple-600"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Status Pills */}
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-gray-700 font-bold mb-1.5 text-xs">Status</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: 'active' }))}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    form.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: 'inactive' }))}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    form.status === 'inactive' ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-2xs' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  Inactive
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: 'on-hold' }))}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    form.status === 'on-hold' ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-2xs' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  On Hold
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Save {activeMainTab.slice(0, -1).toUpperCase()}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 5. POP-UP DIALOGUE BOX MODAL FOR RECORD DETAILS */}
      {selectedDetails && (() => {
        const effectiveTab = getEffectiveTab(selectedDetails, activeMainTab);
        return (
        <Modal
          isOpen={!!selectedDetails}
          onClose={() => {
            setSelectedDetails(null);
            setRegionCitySearch('');
          }}
          maxWidth="max-w-4xl"
          hideCloseButton
        >
          <div className="space-y-3.5 p-0.5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-100 text-purple-700 rounded-2xl border border-purple-200/60 shadow-2xs">
                  {getItemIcon(effectiveTab)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">
                      {selectedDetails.firmName || selectedDetails.name || selectedDetails.contactName}
                    </h3>
                    <span className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${
                      selectedDetails.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      selectedDetails.status === 'inactive' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {selectedDetails.status || 'active'}
                    </span>
                  </div>
                  {(selectedDetails.contactName || selectedDetails.ownerName || selectedDetails.contactPersons?.[0]?.name) && (
                    <div className="text-xs text-gray-600 font-medium mt-0.5 flex items-center gap-1">
                      <span className="text-gray-400 font-normal">Contact Person:</span>
                      <span className="text-purple-700 font-bold">{selectedDetails.contactName || selectedDetails.ownerName || selectedDetails.contactPersons?.[0]?.name}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                    {effectiveTab.toUpperCase()} CODE: <span className="font-extrabold text-purple-600">{selectedDetails.code || selectedDetails._id?.slice(-6).toUpperCase()}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedDetails(null);
                  setRegionCitySearch('');
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Actions Grid Toolbar */}
            <div className="space-y-1 bg-slate-50/80 p-2.5 rounded-2xl border border-gray-200/80">
              <div className="flex items-center justify-between px-0.5 mb-1">
                <span className="text-[9.5px] font-black text-gray-400 uppercase tracking-wider">ACTIONS</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedDetails;
                    setSelectedDetails(null);
                    openModal(target);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                  <span className="text-[9px] bg-blue-700/60 text-blue-100 font-mono px-1 rounded hidden sm:inline">Alt+E</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = selectedDetails._id;
                    setSelectedDetails(null);
                    handleDeleteItem(id);
                  }}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                  <span className="text-[9px] bg-rose-700/60 text-rose-100 font-mono px-1 rounded hidden sm:inline">Alt+D</span>
                </button>
                <button
                  type="button"
                  onClick={() => showToast(`History & Visit records for ${selectedDetails.firmName || selectedDetails.name}`, 'info')}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-xl border border-gray-200 text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <History className="w-3.5 h-3.5 text-gray-500" />
                  <span>History / Visit</span>
                </button>
                <button
                  type="button"
                  onClick={() => showToast(`Opening Ledger for ${selectedDetails.firmName || selectedDetails.name}...`, 'info')}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-xl border border-gray-200 text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <BookOpen className="w-3.5 h-3.5 text-gray-500" />
                  <span>Ledger</span>
                </button>
                <button
                  type="button"
                  onClick={() => showToast(`Record Payment for ${selectedDetails.firmName || selectedDetails.name}`, 'info')}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-xl border border-gray-200 text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <CreditCard className="w-3.5 h-3.5 text-gray-500" />
                  <span>Payment</span>
                </button>
                <button
                  type="button"
                  onClick={() => showToast(`Create Quotation for ${selectedDetails.firmName || selectedDetails.name}`, 'info')}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-xl border border-gray-200 text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5 text-gray-500" />
                  <span>Quotation</span>
                </button>
                <button
                  type="button"
                  onClick={() => showToast(`Create Sale Order for ${selectedDetails.firmName || selectedDetails.name}`, 'info')}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-xl border border-gray-200 text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-gray-500" />
                  <span>Sale Order</span>
                </button>
              </div>
            </div>

            {/* Dynamic Modal Content by Active Sub-Module */}
            {(() => {
              const name = selectedDetails.firmName || selectedDetails.name || selectedDetails.contactName || '';
              const code = selectedDetails.code || selectedDetails._id?.slice(-6).toUpperCase();

              // Helper for Google Maps Link
              const fullAddr = [
                selectedDetails.doorNo,
                selectedDetails.streetName,
                selectedDetails.address1 || selectedDetails.address,
                selectedDetails.area,
                selectedDetails.city || selectedDetails.assignedMarket,
                selectedDetails.district,
                selectedDetails.state,
                selectedDetails.pincode
              ].filter(Boolean).join(', ') || `${name}, Bhavanipuram, Krishna, Andhra Pradesh`;
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}`;

              // -------------------------------------------------------------
              // 1. CUSTOMERS SUB-MODULE
              // -------------------------------------------------------------
              if (effectiveTab === 'customers') {
                const bal = Number(selectedDetails.outstandingBalance) || Number(selectedDetails.outstanding) || 0;
                return (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-blue-50/60 border border-blue-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-blue-700 font-extrabold uppercase tracking-wider">ASSIGNED REGION</span>
                        <span className="block text-xs font-extrabold text-blue-950 mt-0.5 truncate" title={selectedDetails.route || selectedDetails.assignedRegion || 'Unassigned'}>
                          {selectedDetails.route || selectedDetails.assignedRegion || 'Unassigned'}
                        </span>
                      </div>
                      <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-purple-700 font-extrabold uppercase tracking-wider">ASSIGNED CITY</span>
                        <span className="block text-xs font-extrabold text-purple-950 mt-0.5 truncate" title={selectedDetails.city || selectedDetails.assignedMarket || 'Unassigned'}>
                          {selectedDetails.city || selectedDetails.assignedMarket || 'Unassigned'}
                        </span>
                      </div>
                      <div className="bg-rose-50/60 border border-rose-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-rose-700 font-extrabold uppercase tracking-wider">OUTSTANDING BALANCE</span>
                        <span className={`block text-xs font-mono font-black mt-0.5 ${bal > 0 ? 'text-rose-950' : bal < 0 ? 'text-emerald-950' : 'text-gray-900'}`}>
                          ₹{Math.abs(bal).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3.5 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <div className="space-y-3.5">
                          {/* CARD 1: BASIC INFO */}
                          <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                  <User className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">BASIC INFORMATION</h4>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Contact Person</span>
                                <span className="font-bold text-gray-900 text-xs block truncate">{selectedDetails.contactName || selectedDetails.ownerName || selectedDetails.contactPersons?.[0]?.name || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Mobile Number</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-blue-600 text-xs">{selectedDetails.phone || selectedDetails.mobile || '—'}</span>
                                  {selectedDetails.phone && (
                                    <a href={`https://wa.me/91${selectedDetails.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp">
                                      <WhatsAppIcon />
                                    </a>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">WhatsApp Number</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-blue-600 text-xs">{selectedDetails.whatsapp || selectedDetails.phone || '—'}</span>
                                  {(selectedDetails.whatsapp || selectedDetails.phone) && (
                                    <a href={`https://wa.me/91${(selectedDetails.whatsapp || selectedDetails.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp">
                                      <WhatsAppIcon />
                                    </a>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Alt Mobile</span>
                                <span className="font-mono font-semibold text-gray-800 text-xs">{selectedDetails.altPhone || selectedDetails.altMobile || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Email ID</span>
                                <span className="font-semibold text-gray-800 text-xs truncate block">{selectedDetails.email || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">GST Number</span>
                                <span className="font-mono font-bold text-purple-600 text-xs">{selectedDetails.gstNumber || selectedDetails.gstin || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Aadhar / PAN</span>
                                <span className="font-mono font-semibold text-gray-800 text-xs">{selectedDetails.aadharNumber || selectedDetails.pan || '—'}</span>
                              </div>
                            </div>
                          </div>

                          {/* CARD 2: BUSINESS DETAILS */}
                          <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                                  <Building2 className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">BUSINESS & CREDIT DETAILS</h4>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Assigned Region</span>
                                <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 font-bold rounded-md border border-purple-200 text-xs">
                                  {selectedDetails.route || selectedDetails.assignedRegion || 'Unassigned'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Assigned City</span>
                                <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded-md border border-blue-200 text-xs">
                                  {selectedDetails.city || selectedDetails.assignedMarket || 'Unassigned'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Credit Limit</span>
                                <span className="font-mono font-bold text-purple-700 text-xs">
                                  {selectedDetails.creditLimit ? `₹${Number(selectedDetails.creditLimit).toLocaleString('en-IN')} (${selectedDetails.creditDays || 30} days)` : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Opening Balance</span>
                                <span className="font-mono font-bold text-gray-900 text-xs">₹{(selectedDetails.openingBalance || 0).toLocaleString('en-IN')}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Preferred Transport</span>
                                <span className="font-bold text-gray-900 text-xs">{selectedDetails.preferredTransport || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Assigned Agent</span>
                                <span className="font-bold text-indigo-700 text-xs">{selectedDetails.agentAssigned || selectedDetails.assignedAgent || 'Direct'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: ADDRESS INFO */}
                        <div className="space-y-3.5">
                          <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3 h-full flex flex-col justify-between">
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                                    <MapPin className="w-3.5 h-3.5" />
                                  </div>
                                  <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">ADDRESS INFORMATION</h4>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Door / Flat No.</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.doorNo || selectedDetails.flatNo || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Street Name</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.streetName || selectedDetails.street || '—'}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Address Line 1</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.address1 || selectedDetails.address || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">City / Town</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.city || selectedDetails.assignedMarket || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">District</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.district || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">State</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.state || 'Andhra Pradesh'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Pincode</span>
                                  <span className="font-mono font-bold text-gray-900 text-xs">{selectedDetails.pincode || selectedDetails.pinCode || '—'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-gray-100 mt-2">
                              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="w-full py-2 px-3.5 bg-slate-50 hover:bg-purple-50 text-purple-700 font-bold rounded-xl border border-gray-200 hover:border-purple-300 transition-all flex items-center justify-center gap-2 text-xs shadow-2xs group cursor-pointer">
                                <MapPin className="w-3.5 h-3.5 text-purple-600 group-hover:scale-110 transition-transform" />
                                <span>Search Address on Google Maps</span>
                                <ExternalLink className="w-3 h-3 text-purple-400 group-hover:text-purple-600 ml-auto" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              }

              // -------------------------------------------------------------
              // 2. VENDORS / SUPPLIERS SUB-MODULE
              // -------------------------------------------------------------
              if (effectiveTab === 'vendors') {
                const bal = Number(selectedDetails.outstandingBalance) || Number(selectedDetails.outstanding) || 0;
                const contactPersons = (selectedDetails as any).contactPersons || [];

                return (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-indigo-50/60 border border-indigo-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-indigo-700 font-extrabold uppercase tracking-wider">VENDOR TYPE</span>
                        <span className="block text-xs font-extrabold text-indigo-950 mt-0.5 truncate" title={selectedDetails.vendorType || 'General Supplier'}>
                          {selectedDetails.vendorType || 'General Supplier'}
                        </span>
                      </div>
                      <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-purple-700 font-extrabold uppercase tracking-wider">PAYMENT TERMS</span>
                        <span className="block text-xs font-bold font-mono text-purple-950 mt-0.5">
                          {selectedDetails.creditDays || 30} Days
                        </span>
                      </div>
                      <div className="bg-rose-50/60 border border-rose-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-rose-700 font-extrabold uppercase tracking-wider">OUTSTANDING PAYABLE</span>
                        <span className="block text-xs font-mono font-black text-rose-950 mt-0.5">
                          ₹{Math.abs(bal).toLocaleString('en-IN')} (To Pay)
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3.5 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <div className="space-y-3.5">
                          {/* SUPPLIER OVERVIEW */}
                          <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                                  <Factory className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">SUPPLIER OVERVIEW</h4>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Firm Name</span>
                                <span className="font-bold text-gray-900 text-xs block truncate">{name}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Contact Person / Owner</span>
                                <span className="font-bold text-gray-900 text-xs block truncate">{selectedDetails.ownerName || selectedDetails.contactName || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Phone / Mobile</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-blue-600 text-xs">{selectedDetails.phone || '—'}</span>
                                  {selectedDetails.phone && (
                                    <a href={`https://wa.me/91${selectedDetails.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp">
                                      <WhatsAppIcon />
                                    </a>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Email ID</span>
                                <span className="font-semibold text-gray-800 text-xs block truncate">{selectedDetails.email || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">GSTIN / Tax ID</span>
                                <span className="font-mono font-bold text-purple-600 text-xs">{selectedDetails.gstNumber || selectedDetails.gstin || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Aadhar / PAN</span>
                                <span className="font-mono font-semibold text-gray-800 text-xs">{selectedDetails.aadharNumber || selectedDetails.pan || '—'}</span>
                              </div>
                            </div>
                          </div>

                          {/* FINANCIAL & PAYMENT TERMS */}
                          <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                                  <CreditCard className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">FINANCIAL TERMS</h4>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Credit Period</span>
                                <span className="font-mono font-bold text-gray-900 text-xs">{selectedDetails.creditDays || 30} Days</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Credit Limit</span>
                                <span className="font-mono font-bold text-purple-700 text-xs">
                                  {selectedDetails.creditLimit ? `₹${Number(selectedDetails.creditLimit).toLocaleString('en-IN')}` : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Opening Balance</span>
                                <span className="font-mono font-bold text-gray-900 text-xs">₹{(selectedDetails.openingBalance || 0).toLocaleString('en-IN')}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Net Payable</span>
                                <span className="font-mono font-black text-rose-600 text-xs">₹{Math.abs(bal).toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: BANK & LOCATION & CONTACT PERSONS */}
                        <div className="space-y-3.5">
                          {(selectedDetails.bankName || selectedDetails.accountNo || selectedDetails.accountNumber) && (
                            <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                                    <Coins className="w-3.5 h-3.5" />
                                  </div>
                                  <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">BANK ACCOUNT DETAILS</h4>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Bank Name</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.bankName || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Branch</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.branchName || selectedDetails.branch || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Account Number</span>
                                  <span className="font-mono font-bold text-purple-700 text-xs">{selectedDetails.accountNo || selectedDetails.accountNumber || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">IFSC Code</span>
                                  <span className="font-mono font-bold text-gray-900 text-xs">{selectedDetails.ifscCode || selectedDetails.ifsc || '—'}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {(selectedDetails.address1 || selectedDetails.address || selectedDetails.city || selectedDetails.district) && (
                            <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3">
                              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                    <MapPin className="w-3.5 h-3.5" />
                                  </div>
                                  <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">LOCATION / ADDRESS</h4>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                                <div className="col-span-2">
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Factory / Office Address</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.address1 || selectedDetails.address || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">City</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.city || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">District</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.district || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">State</span>
                                  <span className="font-bold text-gray-900 text-xs">{selectedDetails.state || 'Andhra Pradesh'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Pincode</span>
                                  <span className="font-mono font-bold text-gray-900 text-xs">{selectedDetails.pincode || '—'}</span>
                                </div>
                              </div>
                              <div className="pt-2 border-t border-gray-100">
                                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="w-full py-2 px-3.5 bg-slate-50 hover:bg-indigo-50 text-indigo-700 font-bold rounded-xl border border-gray-200 hover:border-indigo-300 transition-all flex items-center justify-center gap-2 text-xs shadow-2xs group cursor-pointer">
                                  <MapPin className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                                  <span>Search Location on Google Maps</span>
                                  <ExternalLink className="w-3 h-3 text-indigo-400 group-hover:text-indigo-600 ml-auto" />
                                </a>
                              </div>
                            </div>
                          )}

                          {contactPersons.length > 0 && (
                            <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                <div className="w-6 h-6 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                                  <Users className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">CONTACT PERSONS</h4>
                              </div>
                              <div className="space-y-2">
                                {contactPersons.map((cp: any, idx: number) => (
                                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-gray-100 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-extrabold text-gray-900 text-xs">{cp.name || '—'}</span>
                                      {cp.designation && <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-md">{cp.designation}</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-[11px] text-gray-600">
                                      {cp.phone && <span className="font-mono font-semibold">{cp.phone}</span>}
                                      {cp.email && <span className="text-gray-500 truncate">{cp.email}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                );
              }

              // -------------------------------------------------------------
              // 3. AGENTS SUB-MODULE
              // -------------------------------------------------------------
              if (effectiveTab === 'agents') {
                const agentName = (name || '').toLowerCase().trim();
                const assignedRoutes = allRoutes.filter((r: any) => (r.assignedAgent || '').toLowerCase().trim() === agentName);
                const agentCusts = allCustomers.filter((c: any) => (c.agentAssigned || '').toLowerCase().trim() === agentName);

                return (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-blue-50/60 border border-blue-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-blue-700 font-extrabold uppercase tracking-wider">COMMISSION RATE</span>
                        <span className="block text-xs font-black text-blue-950 mt-0.5">
                          {selectedDetails.commissionRate || 0}%
                        </span>
                      </div>
                      <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-purple-700 font-extrabold uppercase tracking-wider">ASSIGNED REGIONS</span>
                        <span className="block text-xs font-bold text-purple-950 mt-0.5">
                          {assignedRoutes.length} Regions
                        </span>
                      </div>
                      <div 
                        onClick={() => {
                          setSelectedDetails(null);
                          setCardCustomersModal({
                            title: `Customers Handled by Agent: ${name}`,
                            subtitle: `Total ${agentCusts.length} Assigned Customer Accounts`,
                            customers: agentCusts
                          });
                          setCardCustomerSearch('');
                        }}
                        className="bg-emerald-50/60 hover:bg-emerald-100/70 border border-emerald-100 p-2.5 rounded-2xl text-center shadow-2xs cursor-pointer transition-all hover:scale-[1.01] group"
                      >
                        <span className="block text-[9px] text-emerald-700 font-extrabold uppercase tracking-wider group-hover:underline">TOTAL CUSTOMERS</span>
                        <span className="block text-xs font-black text-emerald-950 mt-0.5">
                          {agentCusts.length} Customers ↗
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3.5 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {/* AGENT PROFILE */}
                        <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                <Briefcase className="w-3.5 h-3.5" />
                              </div>
                              <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">AGENT PROFILE</h4>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Agent Name</span>
                              <span className="font-bold text-gray-900 text-xs block truncate">{name}</span>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Agent Code</span>
                              <span className="font-mono font-bold text-purple-600 text-xs">{code}</span>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Mobile Number</span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-blue-600 text-xs">{selectedDetails.phone || '—'}</span>
                                {selectedDetails.phone && (
                                  <a href={`https://wa.me/91${selectedDetails.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp">
                                    <WhatsAppIcon />
                                  </a>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Email ID</span>
                              <span className="font-semibold text-gray-800 text-xs block truncate">{selectedDetails.email || '—'}</span>
                            </div>
                          </div>
                        </div>

                        {/* COMMISSION & COVERAGE */}
                        <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                                <Percent className="w-3.5 h-3.5" />
                              </div>
                              <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">COMMISSION & COVERAGE</h4>
                            </div>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Assigned Regions / Routes</span>
                              <div className="flex flex-wrap gap-1.5">
                                {assignedRoutes.length > 0 ? assignedRoutes.map((r: any) => (
                                  <span key={r._id} className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 font-bold rounded-md text-[11px]">
                                    {r.name} ({r.code})
                                  </span>
                                )) : <span className="text-gray-400 italic text-xs">No regions assigned</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              }

              // -------------------------------------------------------------
              // 4. TRANSPORTERS SUB-MODULE
              // -------------------------------------------------------------
              if (effectiveTab === 'transporters') {
                const transName = (name || '').toLowerCase().trim();
                const transCusts = allCustomers.filter((c: any) => (c.preferredTransport || '').toLowerCase().trim() === transName);

                return (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-amber-50/60 border border-amber-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-amber-700 font-extrabold uppercase tracking-wider">FLEET TYPES</span>
                        <span className="block text-xs font-bold text-amber-950 mt-0.5 truncate" title={selectedDetails.vehicleTypes || 'Standard Truck'}>
                          {selectedDetails.vehicleTypes || 'Standard Truck'}
                        </span>
                      </div>
                      <div 
                        onClick={() => {
                          setSelectedDetails(null);
                          setCardCustomersModal({
                            title: `Customers Using Transporter: ${name}`,
                            subtitle: `Total ${transCusts.length} Active Accounts`,
                            customers: transCusts
                          });
                          setCardCustomerSearch('');
                        }}
                        className="bg-blue-50/60 hover:bg-blue-100/70 border border-blue-100 p-2.5 rounded-2xl text-center shadow-2xs cursor-pointer transition-all hover:scale-[1.01] group"
                      >
                        <span className="block text-[9px] text-blue-700 font-extrabold uppercase tracking-wider group-hover:underline">SERVICED CUSTOMERS</span>
                        <span className="block text-xs font-black text-blue-950 mt-0.5">
                          {transCusts.length} Customers ↗
                        </span>
                      </div>
                      <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-emerald-700 font-extrabold uppercase tracking-wider">STATUS</span>
                        <span className="block text-xs font-extrabold text-emerald-950 mt-0.5 uppercase">
                          {selectedDetails.status || 'Active'}
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3.5 text-xs">
                      <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                              <Truck className="w-3.5 h-3.5" />
                            </div>
                            <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">TRANSPORTER PROFILE</h4>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                          <div>
                            <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Firm Name</span>
                            <span className="font-bold text-gray-900 text-xs block truncate">{name}</span>
                          </div>
                          <div>
                            <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Contact Person</span>
                            <span className="font-bold text-gray-900 text-xs block truncate">{selectedDetails.contactName || selectedDetails.contactPersons?.[0]?.name || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Mobile Number</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-blue-600 text-xs">{selectedDetails.phone || selectedDetails.contactPersons?.[0]?.phone || '—'}</span>
                              {(selectedDetails.phone || selectedDetails.contactPersons?.[0]?.phone) && (
                                <a href={`https://wa.me/91${(selectedDetails.phone || selectedDetails.contactPersons?.[0]?.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp">
                                  <WhatsAppIcon />
                                </a>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">GSTIN Number</span>
                            <span className="font-mono font-bold text-purple-600 text-xs">{selectedDetails.gstNumber || selectedDetails.gstin || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              }

              // -------------------------------------------------------------
              // 5. REGIONS / ROUTES SUB-MODULE
              // -------------------------------------------------------------
              if (effectiveTab === 'regions') {
                const rName = name.toLowerCase().trim();
                const rCode = (selectedDetails.code || '').toLowerCase().trim();

                const citiesInRegion = allCities.filter((c: any) => {
                  const cRoute = (c.route || '').toLowerCase().trim();
                  return cRoute && (cRoute === rName || (rCode && cRoute === rCode));
                });

                const filteredRegionCities = citiesInRegion.filter((c: any) =>
                  (c.firmName || c.name || '').toLowerCase().includes(regionCitySearch.toLowerCase().trim())
                );

                const regionCityNames = new Set(
                  citiesInRegion.map((c: any) => (c.firmName || c.name || '').toLowerCase().trim())
                );

                const regionCusts = allCustomers.filter((c: any) => {
                  const cRoute = (c.route || '').toLowerCase().trim();
                  if (cRoute && (cRoute === rName || (rCode && cRoute === rCode))) return true;
                  const cCity = (c.city || '').toLowerCase().trim();
                  if (cCity && regionCityNames.has(cCity)) return true;
                  const cMarket = (c.assignedMarket || '').toLowerCase().trim();
                  if (cMarket && regionCityNames.has(cMarket)) return true;
                  return false;
                });

                return (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div 
                        onClick={() => {
                          setSelectedDetails(null);
                          setCardCustomersModal({
                            title: `Customers in ${name} Region (${citiesInRegion.length} Cities)`,
                            subtitle: `Region Code: ${selectedDetails.code || '—'} • ${regionCusts.length} Total Customers`,
                            customers: regionCusts
                          });
                          setCardCustomerSearch('');
                        }}
                        className="bg-purple-50/60 hover:bg-purple-100/70 border border-purple-100 p-2.5 rounded-2xl text-center shadow-2xs cursor-pointer transition-all hover:scale-[1.01] group"
                      >
                        <span className="block text-[9.5px] text-purple-700 font-bold uppercase tracking-wider group-hover:underline">NO OF CITIES</span>
                        <span className="block text-lg font-black text-purple-900 mt-0.5">{citiesInRegion.length} Cities ↗</span>
                      </div>
                      <div 
                        onClick={() => {
                          setSelectedDetails(null);
                          setCardCustomersModal({
                            title: `All Customers in ${name} Region`,
                            subtitle: `Region Code: ${selectedDetails.code || '—'} • ${regionCusts.length} Total Customers`,
                            customers: regionCusts
                          });
                          setCardCustomerSearch('');
                        }}
                        className="bg-blue-50/60 hover:bg-blue-100/70 border border-blue-100 p-2.5 rounded-2xl text-center shadow-2xs cursor-pointer transition-all hover:scale-[1.01] group"
                      >
                        <span className="block text-[9.5px] text-blue-700 font-bold uppercase tracking-wider group-hover:underline">TOTAL CUSTOMERS</span>
                        <span className="block text-lg font-black text-blue-900 mt-0.5">{regionCusts.length} Customers ↗</span>
                      </div>
                      <div 
                        onClick={() => {
                          const agentName = (selectedDetails.agentAssigned || selectedDetails.assignedAgent || '').toLowerCase().trim();
                          if (!agentName || agentName === 'none') {
                            showToast('No agent assigned to this region', 'info');
                            return;
                          }
                          const agentCusts = allCustomers.filter((c: any) => (c.agentAssigned || '').toLowerCase().trim() === agentName);
                          setSelectedDetails(null);
                          setCardCustomersModal({
                            title: `Customers for Agent: ${selectedDetails.agentAssigned || selectedDetails.assignedAgent}`,
                            subtitle: `Region: ${name} • ${agentCusts.length} Assigned Customers`,
                            customers: agentCusts
                          });
                          setCardCustomerSearch('');
                        }}
                        className="bg-indigo-50/60 hover:bg-indigo-100/70 border border-indigo-100 p-2.5 rounded-2xl text-center shadow-2xs cursor-pointer transition-all hover:scale-[1.01] group"
                      >
                        <span className="block text-[9.5px] text-indigo-700 font-bold uppercase tracking-wider group-hover:underline">ASSIGNED AGENT</span>
                        <span className="block text-xs font-bold text-indigo-900 mt-1 truncate">
                          {selectedDetails.agentAssigned || selectedDetails.assignedAgent || 'None'} ↗
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-3.5 text-xs">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 items-start">
                        {/* LEFT COLUMN: REGION PROFILE SUMMARY (col-span-1) */}
                        <div className="lg:col-span-1 bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3">
                          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                            <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                              <Map className="w-3.5 h-3.5" />
                            </div>
                            <h4 className="font-extrabold text-gray-800 text-xs tracking-wider uppercase">REGION PROFILE</h4>
                          </div>
                          <div className="space-y-3 text-xs">
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Region Name</span>
                              <span className="font-extrabold text-gray-900 text-sm block truncate">{name}</span>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Region Code</span>
                              <span className="font-mono font-extrabold text-purple-600 text-xs">{code}</span>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Assigned Agent</span>
                              <span className="font-bold text-indigo-700 text-xs block">{selectedDetails.agentAssigned || selectedDetails.assignedAgent || 'Unassigned'}</span>
                            </div>
                            <div>
                              <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Total Outlets</span>
                              <span className="font-extrabold text-gray-900 text-xs block">{regionCusts.length} Outlets</span>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: CITIES IN REGION (col-span-2) - MATCHING IMAGE 2 EXACTLY */}
                        <div className="lg:col-span-2 bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3.5">
                          {/* CARD HEADER */}
                          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                                <Building className="w-4 h-4" />
                              </div>
                              <h4 className="font-extrabold text-gray-800 text-xs tracking-wider uppercase">CITIES IN REGION</h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDetails(null);
                                  openModal({ partyType: 'market', route: selectedDetails.firmName || selectedDetails.name });
                                }}
                                className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 font-bold rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add City</span>
                              </button>
                              <span className="px-3 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs">
                                {citiesInRegion.length} Total
                              </span>
                            </div>
                          </div>

                          {/* SEARCH INPUT */}
                          <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={regionCitySearch}
                              onChange={(e) => setRegionCitySearch(e.target.value)}
                              placeholder="Search cities in this region..."
                              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-gray-400"
                            />
                          </div>

                          {/* CITIES GRID */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {filteredRegionCities.length > 0 ? (
                              filteredRegionCities.map((c: any) => {
                                const cityName = c.firmName || c.name || '';
                                const cNameLower = cityName.toLowerCase().trim();
                                const cityCusts = allCustomers.filter((cust: any) => {
                                  const custCity = (cust.city || cust.assignedMarket || '').toLowerCase().trim();
                                  return custCity && custCity === cNameLower;
                                });
                                const cityOut = cityCusts.reduce((sum: number, cust: any) => sum + (Number(cust.outstandingBalance) || Number(cust.outstanding) || 0), 0);

                                return (
                                  <div
                                    key={c._id}
                                    title={`Click to view customers in ${cityName}`}
                                    onClick={() => {
                                      setSelectedDetails(null);
                                      setCardCustomersModal({
                                        title: `Customers in ${cityName} (${name} Region)`,
                                        subtitle: `City Code: ${c.code || '—'} • ${cityCusts.length} Active Accounts`,
                                        customers: cityCusts
                                      });
                                      setCardCustomerSearch('');
                                    }}
                                    className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all cursor-pointer group space-y-2.5"
                                  >
                                    {/* City Header */}
                                    <div className="flex items-center justify-between">
                                      <span className="font-extrabold text-gray-900 text-sm group-hover:text-blue-600 transition-colors truncate" title={cityName}>
                                        {cityName}
                                      </span>
                                      <span className="px-2 py-0.5 text-[9.5px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                                        {c.status || 'ACTIVE'}
                                      </span>
                                    </div>

                                    {/* Sub-rows inside city card */}
                                    <div className="bg-slate-50/80 p-2.5 rounded-xl space-y-1.5 border border-slate-100 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500 text-[11px] font-semibold">Customers</span>
                                        <span className="font-extrabold text-gray-900 font-mono text-xs">{cityCusts.length}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500 text-[11px] font-semibold">Outstanding</span>
                                        <span className={`font-extrabold font-mono text-xs ${cityOut >= 100000 ? 'text-rose-600' : cityOut > 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                                          ₹{cityOut.toLocaleString('en-IN')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="col-span-2 py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-gray-200">
                                <p className="text-gray-400 font-medium text-xs">No cities found matching "{regionCitySearch}"</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              }

              // -------------------------------------------------------------
              // 6. CITIES / MARKETS SUB-MODULE
              // -------------------------------------------------------------
              if (effectiveTab === 'cities') {
                const cName = (name || '').toLowerCase().trim();
                const cityCusts = allCustomers.filter((c: any) => (c.city || c.assignedMarket || '').toLowerCase().trim() === cName);

                return (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-cyan-50/60 border border-cyan-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-cyan-700 font-extrabold uppercase tracking-wider">PARENT REGION</span>
                        <span className="block text-xs font-bold text-cyan-950 mt-0.5 truncate">
                          {selectedDetails.route || selectedDetails.assignedRegion || 'Unassigned'}
                        </span>
                      </div>
                      <div 
                        onClick={() => {
                          setSelectedDetails(null);
                          setCardCustomersModal({
                            title: `Customers in Market / City: ${name}`,
                            subtitle: `Parent Route: ${selectedDetails.route || 'Unassigned'} • ${cityCusts.length} Total Customers`,
                            customers: cityCusts
                          });
                          setCardCustomerSearch('');
                        }}
                        className="bg-blue-50/60 hover:bg-blue-100/70 border border-blue-100 p-2.5 rounded-2xl text-center shadow-2xs cursor-pointer transition-all hover:scale-[1.01] group"
                      >
                        <span className="block text-[9px] text-blue-700 font-extrabold uppercase tracking-wider group-hover:underline">TOTAL CUSTOMERS</span>
                        <span className="block text-xs font-black text-blue-950 mt-0.5">
                          {cityCusts.length} Customers ↗
                        </span>
                      </div>
                      <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[9px] text-purple-700 font-extrabold uppercase tracking-wider">DISTRICT</span>
                        <span className="block text-xs font-extrabold text-purple-950 mt-0.5 truncate">
                          {selectedDetails.district || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3.5 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <div className="space-y-3.5">
                          <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600">
                                  <Building className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">CITY / MARKET PROFILE</h4>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">City Name</span>
                                <span className="font-bold text-gray-900 text-xs block truncate">{name}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Parent Route</span>
                                <span className="font-bold text-purple-700 text-xs">{selectedDetails.route || selectedDetails.assignedRegion || 'Unassigned'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">District</span>
                                <span className="font-bold text-gray-900 text-xs">{selectedDetails.district || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">State</span>
                                <span className="font-bold text-gray-900 text-xs">{selectedDetails.state || 'Andhra Pradesh'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3.5">
                          <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                  <Users className="w-3.5 h-3.5" />
                                </div>
                                <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">CUSTOMERS IN THIS CITY</h4>
                              </div>
                            </div>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {cityCusts.length > 0 ? cityCusts.map((c: any) => (
                                <div key={c._id} className="p-2 bg-slate-50 border border-gray-200 rounded-xl flex items-center justify-between">
                                  <div>
                                    <span className="font-bold text-gray-900 block text-xs">{c.firmName}</span>
                                    <span className="text-[10px] text-gray-500">{c.contactName || c.phone}</span>
                                  </div>
                                  {c.phone && (
                                    <a href={`https://wa.me/91${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp">
                                      <WhatsAppIcon />
                                    </a>
                                  )}
                                </div>
                              )) : <span className="text-gray-400 italic text-xs">No customers recorded in this city</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              }

              return null;
            })()}
          </div>
        </Modal>
        );
      })()}

      {/* Dynamic Customer Data Modal (Triggered by clicking any card) */}
      {cardCustomersModal && (
        <div 
          className="fixed inset-0 z-[80] bg-gray-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCardCustomersModal(null);
            }
          }}
        >
          <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col w-full max-w-5xl max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-linear-to-r from-purple-50/70 via-indigo-50/40 to-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-gray-900 leading-tight">
                      {cardCustomersModal.title}
                    </h3>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 font-extrabold text-[11px] rounded-full">
                      {cardCustomersModal.customers.length} Customers
                    </span>
                  </div>
                  {cardCustomersModal.subtitle && (
                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                      {cardCustomersModal.subtitle}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCardCustomersModal(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition-all cursor-pointer border border-transparent hover:border-rose-200"
                title="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Summary Bar */}
            <div className="px-6 py-3 bg-slate-50/80 border-b border-gray-200/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search customer by firm, contact, phone, city, GST..."
                  value={cardCustomerSearch}
                  onChange={(e) => setCardCustomerSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-purple-600 shadow-2xs"
                  autoFocus
                />
                {cardCustomerSearch && (
                  <button
                    type="button"
                    onClick={() => setCardCustomerSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick aggregates */}
              {(() => {
                const totalOut = cardCustomersModal.customers.reduce((acc, c) => acc + (Number(c.outstandingBalance) || Number(c.outstanding) || 0), 0);
                const activeCount = cardCustomersModal.customers.filter(c => (c.status || 'active') === 'active').length;
                return (
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <div className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-gray-400">Active</span>
                      <span className="font-extrabold text-emerald-600">{activeCount}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-gray-400">Total Outstanding</span>
                      <span className="font-mono font-black text-rose-600">₹{totalOut.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Customer List Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {(() => {
                const query = cardCustomerSearch.toLowerCase().trim();
                const filtered = cardCustomersModal.customers.filter((c: any) => {
                  if (!query) return true;
                  const firm = (c.firmName || c.name || '').toLowerCase();
                  const contact = (c.contactName || c.ownerName || '').toLowerCase();
                  const phone = (c.phone || c.whatsapp || '').toLowerCase();
                  const city = (c.city || '').toLowerCase();
                  const district = (c.district || '').toLowerCase();
                  const agent = (c.agentAssigned || c.assignedAgent || '').toLowerCase();
                  const gst = (c.gstNumber || '').toLowerCase();
                  return (
                    firm.includes(query) ||
                    contact.includes(query) ||
                    phone.includes(query) ||
                    city.includes(query) ||
                    district.includes(query) ||
                    agent.includes(query) ||
                    gst.includes(query)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-16 text-center">
                      <div className="w-16 h-16 rounded-3xl bg-purple-50 text-purple-400 flex items-center justify-center mx-auto mb-3">
                        <Users className="w-8 h-8" />
                      </div>
                      <h4 className="font-bold text-gray-800 text-sm">No customers found</h4>
                      <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                        {cardCustomerSearch 
                          ? `No matching customers found for "${cardCustomerSearch}". Try adjusting your search term.`
                          : 'No customers are currently mapped to this selection.'}
                      </p>
                      {cardCustomerSearch && (
                        <button
                          type="button"
                          onClick={() => setCardCustomerSearch('')}
                          className="mt-3 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 font-bold text-xs hover:bg-purple-100 transition-colors"
                        >
                          Clear Search
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-600">
                        <thead className="bg-slate-50 border-b border-gray-200 text-gray-400 font-bold text-[10px] uppercase tracking-wider select-none">
                          <tr>
                            <th className="py-3 px-4 w-12 text-center">#</th>
                            <th className="py-3 px-4">Customer Firm</th>
                            <th className="py-3 px-4">Phone / WhatsApp</th>
                            <th className="py-3 px-4">City & Region</th>
                            <th className="py-3 px-4">Agent</th>
                            <th className="py-3 px-4 text-right">Outstanding</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4 text-right">Profile</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filtered.map((cust: any, idx: number) => {
                            const outBal = Number(cust.outstandingBalance) || Number(cust.outstanding) || 0;
                            return (
                              <tr
                                key={cust._id || idx}
                                onClick={() => {
                                  setCardCustomersModal(null);
                                  setSelectedDetails(cust);
                                }}
                                className="hover:bg-purple-50/50 transition-colors cursor-pointer group"
                                title="Click to view full customer details"
                              >
                                <td className="py-3 px-4 text-center font-bold text-gray-400 font-mono text-[11px]">
                                  {idx + 1}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors text-xs">
                                    {cust.firmName || cust.name || 'Unnamed Customer'}
                                  </div>
                                  {(cust.contactName || cust.ownerName || cust.contactPersons?.[0]?.name) && (
                                    <div className="text-[11px] text-gray-500 font-medium mt-0.5">
                                      {cust.contactName || cust.ownerName || cust.contactPersons?.[0]?.name}
                                    </div>
                                  )}
                                  {cust.gstNumber && (
                                    <div className="font-mono text-[10px] text-gray-400">
                                      GST: {cust.gstNumber}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-1.5 font-mono text-gray-700 font-medium">
                                    <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                                    <span>{cust.phone || cust.whatsapp || '—'}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-medium text-gray-800">
                                    {cust.city || '—'}
                                  </div>
                                  <div className="text-[10px] text-gray-400">
                                    {[cust.district, cust.route].filter(Boolean).join(' • ') || '—'}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                                    {cust.agentAssigned || cust.assignedAgent || 'Direct'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className={`font-mono font-bold text-xs ${outBal > 0 ? 'text-rose-600' : 'text-gray-700'}`}>
                                    ₹{outBal.toLocaleString('en-IN')}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                                    (cust.status || 'active') === 'active' 
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                      : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    {cust.status || 'active'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCardCustomersModal(null);
                                      setSelectedDetails(cust);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white font-bold text-[10px] transition-all cursor-pointer"
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-gray-100 flex items-center justify-between shrink-0 text-xs">
              <span className="text-gray-500 font-medium">
                Showing {cardCustomersModal.customers.length} total customer{cardCustomersModal.customers.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => setCardCustomersModal(null)}
                className="px-4 py-2 bg-gray-200/80 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition-colors cursor-pointer text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. ACTIVITY LOGS MODAL */}
      {showActivityLogModal && (
        <Modal
          isOpen={showActivityLogModal}
          onClose={() => setShowActivityLogModal(false)}
          title="Directory Activity & Audit Logs"
          maxWidth="max-w-3xl"
        >
          <div className="space-y-3 p-1 text-xs">
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search activity logs..."
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs w-full focus:outline-none focus:border-purple-500 font-medium"
              />
              <button
                type="button"
                onClick={fetchActivityLogs}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 transition-colors cursor-pointer shrink-0"
                title="Refresh Logs"
              >
                <RefreshCw className={`w-4 h-4 ${activityLogLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-2xl p-2 bg-slate-50/50 text-xs">
              {activityLogLoading ? (
                <div className="p-8 text-center text-gray-400 animate-pulse">Loading activity history...</div>
              ) : activityLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 italic">No activity logs recorded yet</div>
              ) : (
                activityLogs
                  .filter(log => !logSearch || JSON.stringify(log).toLowerCase().includes(logSearch.toLowerCase()))
                  .map((log, idx) => (
                    <div key={log._id || idx} className="py-2.5 px-3 flex items-start justify-between gap-3 hover:bg-white rounded-xl transition-colors">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase border ${
                            log.action === 'CREATE' || log.action === 'IMPORT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            log.action === 'DELETE' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {log.action || 'ACTIVITY'}
                          </span>
                          <span className="font-bold text-gray-900">{log.entityName || log.entityType || 'Directory Item'}</span>
                        </div>
                        <p className="text-gray-600 text-[11px]">{log.details || log.description || 'Record update performed'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block text-[10px] text-gray-400 font-mono">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : 'Just now'}
                        </span>
                        {log.performedBy && (
                          <span className="block text-[10px] text-purple-600 font-semibold">{log.performedBy}</span>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowActivityLogModal(false)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Keyframe Animation */}
      <style>{`
        @keyframes slideDownFade {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default BusinessDirectoryV2;
