import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Users, 
  Building, 
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
    tags: '',
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
        getParties({ company: selectedCompany._id, type: 'market', limit: 500, light: true }),
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
        tags: Array.isArray(item.tags) ? item.tags.join(', ') : item.tags || '',
        notes: item.notes || item.description || '',
        customerPhoto: item.customerPhoto || '',
        shopPhoto: item.shopPhoto || '',
        code: item.code || '',
        assignedRoutes: item.assignedRoutes || []
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
        tags: '',
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
    if (!selectedCompany?._id) return;

    if (!form.firmName.trim()) {
      showToast('Name / Firm Name is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (activeMainTab === 'regions') {
        const payload = {
          name: form.firmName,
          code: form.code || form.firmName.charAt(0).toUpperCase(),
          assignedAgent: form.agentAssigned,
          description: form.notes,
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

        const payload = {
          ...form,
          type: pType,
          contactName: form.ownerName || form.firmName,
          company: selectedCompany._id,
          creditLimit: Number(form.creditLimit) || 0,
          creditDays: Number(form.creditDays) || 30,
          openingBalance: Number(form.openingBalance) || 0,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
        };

        if (editingItem?._id) {
          await updateParty(editingItem._id, payload);
          showToast('Directory item updated successfully', 'success');
        } else {
          await createParty(payload);
          showToast('New Directory item created successfully', 'success');
        }
      }

      setShowModal(false);
      setEditingItem(null);
      loadDirectoryData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save directory item', 'error');
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

  // Emoji Icon helper
  const getItemIcon = () => {
    switch (activeMainTab) {
      case 'customers': return '👥';
      case 'vendors': return '🏭';
      case 'agents': return '💼';
      case 'transporters': return '🚚';
      case 'regions': return '🗺️';
      case 'cities': return '🏙️';
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
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Unified master directory for Customers, Suppliers, Agents, Transporters, Regions & Cities.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => openModal()}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add New {activeMainTab.slice(0, -1).toUpperCase()}</span>
          </button>

          <button
            onClick={() => loadDirectoryData()}
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
            <span>👥</span>
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
            <span>🏭</span>
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
            <span>💼</span>
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
            <span>🚚</span>
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
            <span>🗺️</span>
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
            <span>🏙️</span>
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
              <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="py-3 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.length === items.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(items.map(i => i._id));
                      else setSelectedIds([]);
                    }}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3 whitespace-nowrap">
                  {activeMainTab === 'regions' ? 'REGION' : activeMainTab === 'cities' ? 'CITY' : 'NAME / FIRM'}
                </th>
                {activeMainTab !== 'regions' && activeMainTab !== 'cities' && (
                  <th className="py-3 px-3 whitespace-nowrap">CONTACT / OWNER</th>
                )}
                <th className="py-3 px-3 whitespace-nowrap">MOBILE</th>
                <th className="py-3 px-3 whitespace-nowrap">CITY / DISTRICT</th>
                <th className="py-3 px-3 whitespace-nowrap">REGION</th>
                <th className="py-3 px-3 whitespace-nowrap">AGENT</th>
                {activeMainTab === 'customers' && (
                  <th className="py-3 px-3 whitespace-nowrap">CREDIT LIMIT</th>
                )}
                <th className="py-3 px-3 whitespace-nowrap">OUTSTANDING</th>
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

                      {/* NAME */}
                      <td className="py-3 px-3 font-semibold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{getItemIcon()}</span>
                          <span className="font-bold text-gray-900">{item.firmName || item.name}</span>
                        </div>
                      </td>

                      {/* CONTACT / OWNER */}
                      {activeMainTab !== 'regions' && activeMainTab !== 'cities' && (
                        <td className="py-3 px-3 text-gray-600 font-medium">
                          {item.contactName || item.ownerName || '—'}
                        </td>
                      )}

                      {/* MOBILE with WhatsApp */}
                      <td className="py-3 px-3 font-mono font-medium text-gray-700">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <span>{item.phone || '—'}</span>
                          {item.phone && item.phone.length >= 10 && (
                            <a
                              href={`https://wa.me/91${item.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Chat on WhatsApp"
                            >
                              <WhatsAppIcon />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* CITY */}
                      <td className="py-3 px-3 text-gray-600 font-medium">
                        {item.city || item.district || '—'}
                      </td>

                      {/* REGION */}
                      <td className="py-3 px-3 text-gray-600 font-medium">
                        {item.route || item.code || '—'}
                      </td>

                      {/* AGENT */}
                      <td className="py-3 px-3 text-gray-600 font-medium">
                        {item.agentAssigned || item.assignedAgent || '—'}
                      </td>

                      {/* CREDIT LIMIT */}
                      {activeMainTab === 'customers' && (
                        <td className="py-3 px-3 font-mono text-gray-700 font-semibold">
                          ₹{(item.creditLimit || 50000).toLocaleString('en-IN')}
                        </td>
                      )}

                      {/* OUTSTANDING */}
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          bal > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          ₹{Math.abs(bal).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* STATUS */}
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                          item.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {item.status || 'active'}
                        </span>
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openModal(item)}
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                            title="Edit Record"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item._id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
                      <label className="block text-gray-700 font-semibold mb-1">City</label>
                      <select
                        value={form.city}
                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      >
                        <option value="">Select City</option>
                        {allCities.map((c: any) => (
                          <option key={c._id} value={c.firmName}>{c.firmName}</option>
                        ))}
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
                      <input
                        type="text"
                        value={form.tags}
                        onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                        placeholder="Press Enter or Comma to add tags..."
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
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

            {/* B. VENDOR / SUPPLIER FORM */}
            {activeMainTab === 'vendors' && (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 text-xs">
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-gray-700 font-bold mb-1">Firm / Company Name *</label>
                      <input
                        type="text"
                        required
                        value={form.firmName}
                        onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                        placeholder="e.g. Tirupati Card Centre"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Owner Name</label>
                      <input
                        type="text"
                        value={form.ownerName}
                        onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))}
                        placeholder="e.g. Ramesh Kumar"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Vendor Type *</label>
                      <select
                        value={form.vendorType}
                        onChange={e => setForm(f => ({ ...f, vendorType: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      >
                        <option value="BOARD SUPPLIER">BOARD SUPPLIER</option>
                        <option value="PAPER SUPPLIER">PAPER SUPPLIER</option>
                        <option value="PRINTING VENDOR">PRINTING VENDOR</option>
                        <option value="ADHESIVE SUPPLIER">ADHESIVE SUPPLIER</option>
                        <option value="WIRE SUPPLIER">WIRE SUPPLIER</option>
                        <option value="RAW MATERIAL">RAW MATERIAL</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">Mobile Number *</label>
                      <input
                        type="text"
                        required
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="e.g. 9876543210"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">Town / City *</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                        placeholder="e.g. Vijayawada"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* C. AGENT FORM */}
            {activeMainTab === 'agents' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">Agent Name *</label>
                    <input
                      type="text"
                      required
                      value={form.firmName}
                      onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                      placeholder="e.g. Rajesh Kumar"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">Mobile *</label>
                    <input
                      type="text"
                      required
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="e.g. 9876543210"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2">Assigned Routes / Regions</label>
                    <div className="border border-gray-200 rounded-xl p-3 max-h-44 overflow-y-auto space-y-2 bg-white shadow-2xs">
                      {allRoutes.length === 0 ? (
                        <span className="text-gray-400 italic">No regions available in backend.</span>
                      ) : (
                        allRoutes.map((r: any) => {
                          const checked = form.assignedRoutes.includes(r.name);
                          return (
                            <label key={r._id} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-800">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => {
                                  if (e.target.checked) setForm(f => ({ ...f, assignedRoutes: [...f.assignedRoutes, r.name] }));
                                  else setForm(f => ({ ...f, assignedRoutes: f.assignedRoutes.filter(x => x !== r.name) }));
                                }}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                              <span>{r.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* D. REGION / ROUTE FORM */}
            {activeMainTab === 'regions' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">Region Name *</label>
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
                    <label className="block text-gray-700 font-semibold mb-1">Region Code</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                      placeholder="e.g. A"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono uppercase focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    />
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
                      placeholder="e.g. Nellore"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1">District</label>
                      <input
                        type="text"
                        value={form.district}
                        onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                        placeholder="e.g. Nellore"
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
                    <label className="block text-gray-700 font-semibold mb-1">Assigned Region</label>
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
                </div>
              </div>
            )}

            {/* F. TRANSPORTER FORM */}
            {activeMainTab === 'transporters' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">Transporter Firm Name *</label>
                    <input
                      type="text"
                      required
                      value={form.firmName}
                      onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))}
                      placeholder="e.g. VRL Logistics"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">Mobile *</label>
                    <input
                      type="text"
                      required
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="e.g. 9876543210"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-purple-600 bg-white shadow-2xs"
                    />
                  </div>
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
