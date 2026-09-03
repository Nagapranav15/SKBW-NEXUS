import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Users, 
  Building, 
  Building2,
  Factory,
  Briefcase,
  Truck,
  Map,
  Search, 
  Plus, 
  X, 
  Eye, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Check, 
  Phone, 
  AlertTriangle,
  MapPin,
  Camera,
  Image as ImageIcon,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Modal from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { 
  getParties, 
  createParty, 
  updateParty, 
  deleteParty as deletePartyApi
} from '../../api/partyApi';
import { 
  getRoutes, 
  createRoute, 
  updateRoute, 
  deleteRoute 
} from '../../api/routeApi';

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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);

  // Lazy-Loaded Dropdown Lists (Fetched only when modal opens or on demand)
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [allRoutes, setAllRoutes] = useState<any[]>([]);
  const [allCities, setAllCities] = useState<any[]>([]);
  const [allTransporters, setAllTransporters] = useState<any[]>([]);
  const [auxLoaded, setAuxLoaded] = useState(false);

  // Modal Dialog Pop-up State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DirectoryItem | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<DirectoryItem | null>(null);
  const [regionCitySearch, setRegionCitySearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    assignedRoutes: [] as string[]
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Lazy-load auxiliary dropdown data when opening modal or on tab load
  const loadAuxiliaryData = useCallback(async () => {
    if (!selectedCompany?._id || auxLoaded) return;
    try {
      const [agRes, rtRes, mkRes, trRes] = await Promise.all([
        getParties({ company: selectedCompany._id, type: 'agent', limit: 500, light: true }),
        getRoutes(selectedCompany._id),
        getParties({ company: selectedCompany._id, type: 'market', limit: 500 }),
        getParties({ company: selectedCompany._id, type: 'transporter', limit: 500, light: true })
      ]);

      setAllAgents(agRes.data.parties || agRes.data || []);
      setAllRoutes(rtRes.data.routes || rtRes.data || []);
      setAllCities(mkRes.data.parties || mkRes.data || []);
      setAllTransporters(trRes.data.parties || trRes.data || []);
      setAuxLoaded(true);
    } catch (err) {
      console.error('Failed to load auxiliary dropdown lists:', err);
    }
  }, [selectedCompany?._id, auxLoaded]);

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
        assignedRoutes: allRoutes
          .filter((r: any) => r.assignedAgent && r.assignedAgent === (item.firmName || item.contactName))
          .map((r: any) => r._id)
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
        assignedRoutes: []
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
    } catch (err: any) {
      showToast(err.message || 'Failed to delete record', 'error');
    }
  };

  // Lucide Icon helper
  const getItemIcon = () => {
    switch (activeMainTab) {
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

        {/* Global Search Box */}
        <div className="py-2 flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeMainTab}...`}
              className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl w-44 md:w-56 focus:outline-none focus:border-purple-500 shadow-2xs font-medium"
            />
          </div>
        </div>
      </div>

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
                    <th className="py-3 px-3 whitespace-nowrap">CONTACT PERSON</th>
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
                    <th className="py-3 px-3 whitespace-nowrap">AGENT / AGENCY NAME</th>
                    <th className="py-3 px-3 whitespace-nowrap">CONTACT PERSON</th>
                    <th className="py-3 px-3 whitespace-nowrap">MOBILE / WHATSAPP</th>
                    <th className="py-3 px-3 whitespace-nowrap">EMAIL</th>
                    <th className="py-3 px-3 whitespace-nowrap">CITY & DISTRICT</th>
                  </>
                )}

                {activeMainTab === 'transporters' && (
                  <>
                    <th className="py-3 px-3 whitespace-nowrap">TRANSPORTER NAME</th>
                    <th className="py-3 px-3 whitespace-nowrap">CONTACT PERSON</th>
                    <th className="py-3 px-3 whitespace-nowrap">MOBILE / CONTACT</th>
                    <th className="py-3 px-3 whitespace-nowrap">CITY & LOCATION</th>
                    <th className="py-3 px-3 whitespace-nowrap">FLEET / VEHICLES</th>
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

                <th className="py-3 px-3 whitespace-nowrap">STATUS</th>
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
                items.map((item, index) => {
                  const isSelected = selectedIds.includes(item._id);
                  const bal = item.outstandingBalance || 0;

                  return (
                    <tr
                      key={item._id || index}
                      onClick={() => openModal(item)}
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
                              <span className="font-bold text-gray-900">{item.firmName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{item.contactName || item.ownerName || '—'}</td>
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
                              <div className="flex items-center gap-1 flex-wrap max-w-[150px]">
                                {item.tags.map((t: string, i: number) => (
                                  <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-full border border-purple-200">
                                    {t}
                                  </span>
                                ))}
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
                              <div className="flex items-center gap-1 flex-wrap max-w-[150px]">
                                {item.tags.map((t: string, i: number) => (
                                  <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-full border border-purple-200">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 font-normal text-[11px]">—</span>
                            )}
                          </td>
                        </>
                      )}

                      {/* AGENTS ROW */}
                      {activeMainTab === 'agents' && (
                        <>
                          <td className="py-3 px-3 font-semibold text-gray-900">
                            <div className="flex items-center gap-2">
                              <Briefcase className="w-4 h-4 text-purple-600 shrink-0" />
                              <span className="font-bold text-gray-900">{item.firmName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{item.contactName || '—'}</td>
                          <td className="py-3 px-3 font-mono text-gray-700">{item.phone || '—'}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{item.email || '—'}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{[item.city, item.district].filter(Boolean).join(', ') || '—'}</td>
                        </>
                      )}

                      {/* TRANSPORTERS ROW */}
                      {activeMainTab === 'transporters' && (
                        <>
                          <td className="py-3 px-3 font-semibold text-gray-900">
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-purple-600 shrink-0" />
                              <span className="font-bold text-gray-900">{item.firmName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{item.contactName || '—'}</td>
                          <td className="py-3 px-3 font-mono text-gray-700">{item.phone || '—'}</td>
                          <td className="py-3 px-3 text-gray-600 font-medium">{[item.city, item.district, item.state].filter(Boolean).join(', ') || '—'}</td>
                          <td className="py-3 px-3 font-medium text-gray-700">{item.preferredTransport || 'General Freight'}</td>
                        </>
                      )}

                      {/* REGIONS ROW (Matches User Screenshot 100%) */}
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
                              <span className="text-gray-400 italic text-xs font-medium">Not Assigned</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-900 text-xs">
                            {allCities.filter((c: any) => c.route === (item.firmName || item.name)).length}
                          </td>
                          <td className="py-3 px-3 font-bold text-gray-900 text-xs">
                            {items.filter((c: any) => c.route === (item.firmName || item.name)).length}
                          </td>
                          <td className="py-3 px-3">
                            {(() => {
                              const regionName = item.firmName || item.name || '';
                              const regionCusts = items.filter((c: any) => c.route === regionName);
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
                                  <span className="px-2 py-0.5 rounded-md bg-gray-50 text-gray-600 border border-gray-200 font-mono font-bold text-xs">
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
          <span>Showing {items.length} of {totalRecords} records</span>
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
                              contactPersons: f.contactPersons.filter((_, i) => i !== idx)
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
                        placeholder="e.g. VRL Logistics"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 bg-white shadow-2xs"
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
                              contactPersons: f.contactPersons.filter((_, i) => i !== idx)
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
      {selectedDetails && (
        <Modal
          isOpen={!!selectedDetails}
          onClose={() => {
            setSelectedDetails(null);
            setRegionCitySearch('');
          }}
          maxWidth="max-w-3xl"
          hideCloseButton
        >
          <div className="space-y-4 p-1">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl">
                  {getItemIcon()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">
                      {selectedDetails.firmName || selectedDetails.name || selectedDetails.contactName}
                    </h3>
                    <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${
                      selectedDetails.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      selectedDetails.status === 'inactive' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {selectedDetails.status || 'active'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                    {activeMainTab.toUpperCase()} CODE: <span className="font-bold text-purple-600">{selectedDetails.code || selectedDetails._id?.slice(-6).toUpperCase()}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedDetails(null);
                  setRegionCitySearch('');
                }}
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-gray-200/80">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedDetails;
                    setSelectedDetails(null);
                    openModal(target);
                  }}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = selectedDetails._id;
                    setSelectedDetails(null);
                    handleDeleteItem(id);
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 rounded-lg text-xs font-bold transition-all border border-gray-200 hover:border-rose-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
              <span className="text-[11px] text-gray-400 font-medium hidden sm:inline">Press Esc or click X to close</span>
            </div>

            {/* Modal Body Scroll Container */}
            <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-4 text-xs">
              
              {/* Dynamic Real-Time Stats Cards */}
              {(() => {
                const name = selectedDetails.firmName || selectedDetails.name || '';
                if (activeMainTab === 'regions') {
                  const assignedCitiesCount = allCities.filter((c: any) => c.route === name).length;
                  const assignedCustsCount = items.filter((c: any) => c.route === name).length;
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-purple-700 font-bold uppercase tracking-wider">No of Cities</span>
                        <span className="block text-xl font-black text-purple-900 mt-0.5">{assignedCitiesCount}</span>
                      </div>
                      <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-blue-700 font-bold uppercase tracking-wider">Total Customers</span>
                        <span className="block text-xl font-black text-blue-900 mt-0.5">{assignedCustsCount}</span>
                      </div>
                      <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-indigo-700 font-bold uppercase tracking-wider">Assigned Agent</span>
                        <span className="block text-xs font-bold text-indigo-900 mt-1.5 truncate" title={selectedDetails.agentAssigned || 'None'}>
                          {selectedDetails.agentAssigned || 'None'}
                        </span>
                      </div>
                    </div>
                  );
                }
                if (activeMainTab === 'cities') {
                  const assignedCustsCount = items.filter((c: any) => (c.city === name || c.assignedMarket === name)).length;
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-purple-700 font-bold uppercase tracking-wider">Parent Region</span>
                        <span className="block text-xs font-bold text-purple-900 mt-1.5 truncate" title={selectedDetails.route || 'None'}>
                          {selectedDetails.route || 'None'}
                        </span>
                      </div>
                      <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-blue-700 font-bold uppercase tracking-wider">Customers</span>
                        <span className="block text-xl font-black text-blue-900 mt-0.5">{assignedCustsCount}</span>
                      </div>
                      <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-indigo-700 font-bold uppercase tracking-wider">District</span>
                        <span className="block text-xs font-bold text-indigo-900 mt-1.5 truncate" title={selectedDetails.district || '—'}>
                          {selectedDetails.district || '—'}
                        </span>
                      </div>
                    </div>
                  );
                }
                if (activeMainTab === 'agents') {
                  const assignedRoutesCount = allRoutes.filter((r: any) => r.assignedAgent === name).length;
                  const assignedCitiesCount = allCities.filter((c: any) => c.agentAssigned === name).length;
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-purple-700 font-bold uppercase tracking-wider">Routes</span>
                        <span className="block text-xl font-black text-purple-900 mt-0.5">{assignedRoutesCount}</span>
                      </div>
                      <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-blue-700 font-bold uppercase tracking-wider">Cities</span>
                        <span className="block text-xl font-black text-blue-900 mt-0.5">{assignedCitiesCount}</span>
                      </div>
                      <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Phone</span>
                        <span className="block text-xs font-mono font-bold text-emerald-900 mt-1.5 truncate">{selectedDetails.phone || '—'}</span>
                      </div>
                    </div>
                  );
                }
                if (activeMainTab === 'vendors') {
                  const bal = selectedDetails.outstandingBalance || 0;
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-purple-700 font-bold uppercase tracking-wider">Category</span>
                        <span className="block text-xs font-bold text-purple-900 mt-1.5 truncate">{selectedDetails.vendorType || 'Paper Mill'}</span>
                      </div>
                      <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-blue-700 font-bold uppercase tracking-wider">Credit Days</span>
                        <span className="block text-xl font-black text-blue-900 mt-0.5">{selectedDetails.creditDays || 30}</span>
                      </div>
                      <div className={`${bal > 0 ? 'bg-rose-50/60 border-rose-100' : 'bg-emerald-50/60 border-emerald-100'} border p-3 rounded-2xl text-center shadow-2xs`}>
                        <span className={`block text-[10px] ${bal > 0 ? 'text-rose-700' : 'text-emerald-700'} font-bold uppercase tracking-wider`}>Outstanding</span>
                        <span className={`block text-xs font-mono font-black ${bal > 0 ? 'text-rose-900' : 'text-emerald-900'} mt-1.5`}>
                          ₹{Math.abs(bal).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  );
                }
                if (activeMainTab === 'customers') {
                  const bal = selectedDetails.outstandingBalance || 0;
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-purple-700 font-bold uppercase tracking-wider">Credit Limit</span>
                        <span className="block text-xs font-mono font-bold text-purple-900 mt-1.5">₹{(selectedDetails.creditLimit || 50000).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-2xl text-center shadow-2xs">
                        <span className="block text-[10px] text-blue-700 font-bold uppercase tracking-wider">Credit Days</span>
                        <span className="block text-xl font-black text-blue-900 mt-0.5">{selectedDetails.creditDays || 30}</span>
                      </div>
                      <div className={`${bal > 0 ? 'bg-rose-50/60 border-rose-100' : 'bg-emerald-50/60 border-emerald-100'} border p-3 rounded-2xl text-center shadow-2xs`}>
                        <span className={`block text-[10px] ${bal > 0 ? 'text-rose-700' : 'text-emerald-700'} font-bold uppercase tracking-wider`}>Outstanding</span>
                        <span className={`block text-xs font-mono font-black ${bal > 0 ? 'text-rose-900' : 'text-emerald-900'} mt-1.5`}>
                          ₹{Math.abs(bal).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* REGION MODULE: CITIES IN REGION AS SMALL CARDS (Exact Replica of Region Module!) */}
              {activeMainTab === 'regions' && (
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-purple-600" />
                      <span>Cities in Region</span>
                    </h4>
                    <span className="px-2.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-extrabold text-[11px]">
                      {allCities.filter((c: any) => c.route === (selectedDetails.firmName || selectedDetails.name)).length} Total
                    </span>
                  </div>

                  {/* Search Input for Cities in Region */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                    <input
                      type="text"
                      placeholder="Search cities in this region..."
                      value={regionCitySearch}
                      onChange={e => setRegionCitySearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-purple-600 bg-white shadow-2xs font-medium"
                    />
                    {regionCitySearch && (
                      <button
                        type="button"
                        onClick={() => setRegionCitySearch('')}
                        className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Small City Cards Grid (Matching Legacy Module 100%) */}
                  {(() => {
                    const regionName = selectedDetails.firmName || selectedDetails.name;
                    const regionCities = allCities.filter((c: any) => c.route === regionName);
                    const filteredCities = regionCities.filter((c: any) =>
                      (c.firmName || c.name || '').toLowerCase().includes(regionCitySearch.toLowerCase())
                    );

                    if (regionCities.length === 0) {
                      return <p className="text-gray-400 italic text-center py-6">No cities mapped to this region yet.</p>;
                    }

                    if (filteredCities.length === 0) {
                      return <p className="text-gray-400 italic text-center py-6">No matching cities found for "{regionCitySearch}".</p>;
                    }

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredCities.map((city: any) => {
                          const custCount = items.filter((item: any) => (item.city === city.firmName || item.assignedMarket === city.firmName)).length;
                          return (
                            <div
                              key={city._id}
                              className="p-3 border border-gray-200 rounded-xl bg-white hover:border-purple-300 hover:bg-purple-50/20 shadow-2xs transition-all duration-200 space-y-2 flex flex-col justify-between"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-bold text-gray-900 text-xs block truncate" title={city.firmName || city.name}>
                                  {city.firmName || city.name}
                                </span>
                                <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded shrink-0 ${
                                  city.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {city.status || 'active'}
                                </span>
                              </div>

                              <div className="space-y-1 pt-1 border-t border-gray-100">
                                <div className="flex items-center justify-between text-[11px] text-gray-500 font-semibold bg-slate-50 px-2.5 py-1 rounded-lg">
                                  <span>Customers</span>
                                  <span className="text-purple-700 font-bold">{custCount}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-gray-500 font-semibold bg-slate-50 px-2.5 py-1 rounded-lg">
                                  <span>District</span>
                                  <span className="text-gray-800 font-semibold truncate max-w-[100px]">{city.district || '—'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* General Information Card */}
              <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                  <span>Overview & Details</span>
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {selectedDetails.contactName && (
                    <div>
                      <span className="block text-gray-400 text-[10px] font-semibold uppercase">Contact Person</span>
                      <span className="font-bold text-gray-800">{selectedDetails.contactName}</span>
                    </div>
                  )}
                  {selectedDetails.ownerName && (
                    <div>
                      <span className="block text-gray-400 text-[10px] font-semibold uppercase">Owner Name</span>
                      <span className="font-bold text-gray-800">{selectedDetails.ownerName}</span>
                    </div>
                  )}
                  {selectedDetails.phone && (
                    <div>
                      <span className="block text-gray-400 text-[10px] font-semibold uppercase">Mobile Phone</span>
                      <span className="font-mono font-bold text-gray-800">{selectedDetails.phone}</span>
                    </div>
                  )}
                  {selectedDetails.email && (
                    <div>
                      <span className="block text-gray-400 text-[10px] font-semibold uppercase">Email Address</span>
                      <span className="font-semibold text-gray-800 truncate block">{selectedDetails.email}</span>
                    </div>
                  )}
                  {selectedDetails.city && (
                    <div>
                      <span className="block text-gray-400 text-[10px] font-semibold uppercase">City / Location</span>
                      <span className="font-bold text-gray-800">{selectedDetails.city}</span>
                    </div>
                  )}
                  {selectedDetails.district && (
                    <div>
                      <span className="block text-gray-400 text-[10px] font-semibold uppercase">District</span>
                      <span className="font-bold text-gray-800">{selectedDetails.district}</span>
                    </div>
                  )}
                  {selectedDetails.gstNumber && (
                    <div>
                      <span className="block text-gray-400 text-[10px] font-semibold uppercase">GSTIN</span>
                      <span className="font-mono font-bold text-purple-700">{selectedDetails.gstNumber}</span>
                    </div>
                  )}
                </div>

                {selectedDetails.notes && (
                  <div className="pt-2 border-t border-gray-200/60">
                    <span className="block text-gray-400 text-[10px] font-semibold uppercase mb-1">Remarks / Description</span>
                    <p className="text-gray-700 font-medium leading-relaxed bg-white p-3 rounded-xl border border-gray-200/80">{selectedDetails.notes}</p>
                  </div>
                )}
              </div>

              {/* Contact Persons Section */}
              {Array.isArray(selectedDetails.contactPersons) && selectedDetails.contactPersons.length > 0 && (
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-purple-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    <span>Contact Persons ({selectedDetails.contactPersons.length})</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedDetails.contactPersons.map((cp: any, idx: number) => (
                      <div key={idx} className="p-3 bg-white border border-gray-200 rounded-xl space-y-1 shadow-2xs">
                        <div className="flex items-center justify-between font-bold text-gray-900">
                          <span>{cp.name || 'Unnamed Representative'}</span>
                          <span className="text-[10px] text-purple-600 font-semibold bg-purple-50 px-2 py-0.5 rounded-md">{cp.designation || 'Contact'}</span>
                        </div>
                        <div className="space-y-0.5 text-[11px] font-mono text-gray-600 pt-1 border-t border-gray-100">
                          {cp.phone && <div>📞 {cp.phone}</div>}
                          {cp.email && <div className="truncate">✉️ {cp.email}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
