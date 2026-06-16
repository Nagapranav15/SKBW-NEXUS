import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Edit, Trash2, Download, Upload, X, Users, Building,
  Filter, Columns, MapPin, Camera, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, ExternalLink, Phone, Mail, Clock,
  AlertTriangle, RefreshCw, CheckCircle, XCircle, Pause,
  History, BookOpen, CreditCard, FileText, ShoppingCart, User, Tag,
  ArrowUpDown, ChevronUp, ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import {
  getParties, getPartyStats, createParty, updateParty,
  deleteParty as deletePartyApi, importParties as importPartiesApi
} from '../api/partyApi';
import { getRoutes, createRoute, updateRoute, deleteRoute } from '../api/routeApi';
import { getActivityLogs } from '../api/activityLogApi';

interface Party {
  _id: string;
  type: 'customer' | 'vendor' | 'agent' | 'market' | 'transporter' | 'staff' | 'employee';
  firmName: string;
  contactName: string;
  ownerName?: string;
  phone: string;
  altPhone?: string;
  email?: string;
  doorNo?: string;
  streetName?: string;
  address1?: string;
  area?: string;
  landmark?: string;
  city: string;
  district: string;
  state: string;
  pincode?: string;
  agentAssigned?: string;
  assignedMarket?: string;
  route?: string;
  creditLimit?: number;
  creditDays?: number;
  outstanding?: number;
  preferredTransport?: string;
  gpsLocation?: string;
  customerPhoto?: string;
  shopPhoto?: string;
  openingBalance?: number;
  status: 'active' | 'inactive' | 'on-hold';
  createdAt: string;
  updatedAt: string;
  customerCount?: number;
}

interface RouteItem {
  _id: string;
  name: string;
  status: 'active' | 'inactive';
  assignedAgent?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  citiesCount?: number;
  customersCount?: number;
}

interface ActivityLog {
  _id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT';
  entityType: string;
  entityName: string;
  details: string;
  performedBy: string;
  createdAt: string;
}

const PartyManagement: React.FC = () => {
  const { selectedCompany } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Determine view type from URL
  const getTypeFromPath = (): 'customer' | 'vendor' | 'agent' | 'route' | 'market' | 'transporter' => {
    const path = location.pathname;
    if (path.includes('/vendors')) return 'vendor';
    if (path.includes('/agents')) return 'agent';
    if (path.includes('/routes')) return 'route';
    if (path.includes('/markets')) return 'market';
    if (path.includes('/transporters')) return 'transporter';
    return 'customer';
  };

  const currentType = getTypeFromPath();
  const getVisualLabel = () => {
    if (currentType === 'route') return 'Region';
    if (currentType === 'market') return 'City';
    return currentType.charAt(0).toUpperCase() + currentType.slice(1);
  };
  const typeLabel = getVisualLabel();
  const typeLabelPlural = currentType === 'transporter' ? 'Transporters' : currentType === 'route' ? 'Regions' : currentType === 'market' ? 'Cities' : typeLabel + 's';

  const getPageHeaderAndSub = () => {
    if (currentType === 'route') {
      return {
        title: 'Regions Master',
        sub: 'Manage all regions from one place'
      };
    }
    if (currentType === 'market') {
      return {
        title: 'Cities Master',
        sub: 'Manage all cities from one place'
      };
    }
    return {
      title: `${typeLabel} Management`,
      sub: `Manage all ${currentType}s from one place`
    };
  };
  const pageHeader = getPageHeaderAndSub();

  // Stats State
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, onHold: 0 });

  // Main Lists
  const [parties, setParties] = useState<any[]>([]); // Dynamic: holds Routes if type is route, else Parties
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Dropdown Options (Dynamic Cross-References)
  const [allAgents, setAllAgents] = useState<Party[]>([]);
  const [allRoutes, setAllRoutes] = useState<RouteItem[]>([]);
  const [allMarkets, setAllMarkets] = useState<Party[]>([]);
  const [allTransporters, setAllTransporters] = useState<Party[]>([]);

  // Dynamic Inline Adding states
  const [allCities, setAllCities] = useState<string[]>([]);
  const [isAddingNewCity, setIsAddingNewCity] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [inlineModalType, setInlineModalType] = useState<'agent' | 'route' | 'market' | 'transporter' | null>(null);
  const [isSavingInline, setIsSavingInline] = useState(false);

  // Subform states for inline creation
  const [inlineAgentData, setInlineAgentData] = useState({ name: '', phone: '' });
  const [inlineRouteData, setInlineRouteData] = useState({ name: '', code: '', assignedAgent: '', description: '' });
  const [inlineMarketData, setInlineMarketData] = useState({
    name: '',
    city: '',
    district: '',
    route: '',
    state: 'Andhra Pradesh',
    agentAssigned: '',
    status: 'active'
  });
  const [inlineTransporterData, setInlineTransporterData] = useState({ name: '', contactName: '', phone: '', email: '', city: '' });

  // Modals & Forms
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<any | null>(null);
  const [docView, setDocView] = useState<'gst' | 'aadhar'>('gst');
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(25);
  const [total, setTotal] = useState(0);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Persisted Filters state
  const [filters, setFilters] = useState<any>({
    status: [],
    city: [],
    route: [],
    agentAssigned: [],
    customerGrade: []
  });

  // Sorting state
  const [sortField, setSortField] = useState<string>('firmName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Activity Log State
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);

  // Duplicate Detector State
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);

  // States list for select dropdowns
  const statesList = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
  ];

  // Table Columns Setup
  const getColumnsSchema = () => {
    switch (currentType) {
      case 'customer':
        return {
          firmName: 'Firm Name',
          phone: 'Mobile Number',
          city: 'City',
          district: 'District',
          agentAssigned: 'Assigned Agent',
          route: 'Route',
          customerGrade: 'Grade',
          creditLimit: 'Credit Limit',
          outstanding: 'Outstanding',
          status: 'Status'
        };
      case 'vendor':
        return {
          firmName: 'Firm Name',
          phone: 'Mobile',
          city: 'City',
          district: 'District',
          status: 'Status'
        };
      case 'agent':
        return {
          contactName: 'Agent Name',
          phone: 'Mobile',
          assignedRoutes: 'Assigned Routes',
          status: 'Status'
        };
      case 'route':
        return {
          name: 'Region / Line Name',
          assignedAgent: 'Assigned Agent',
          citiesCount: 'Cities Count',
          customersCount: 'Customers Count',
          status: 'Status'
        };
      case 'market':
        return {
          firmName: 'City Name',
          district: 'District',
          state: 'State',
          route: 'Region / Line',
          customerCount: 'Customer Count',
          status: 'Status'
        };
      case 'transporter':
        return {
          firmName: 'Transporter Name',
          contactName: 'Contact Person',
          phone: 'Mobile',
          city: 'City',
          status: 'Status'
        };
    }
  };

  const allColumns = getColumnsSchema();
  const getDefaultVisibleColumns = () => {
    const defaultCols: Record<string, boolean> = {};
    Object.keys(allColumns).forEach(key => {
      if (currentType === 'customer') {
        defaultCols[key] = ['firmName', 'phone', 'city', 'agentAssigned', 'customerGrade', 'status'].includes(key);
      } else {
        defaultCols[key] = true;
      }
    });
    return defaultCols;
  };
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(getDefaultVisibleColumns());

  // Empty forms schemas
  const getEmptyFormData = () => {
    if (currentType === 'route') {
      return {
        name: '',
        code: '',
        status: 'active',
        assignedAgent: '',
        description: ''
      };
    }
    return {
      type: currentType,
      firmName: '',
      ownerName: '',
      contactName: '',
      phone: '',
      altPhone: '',
      email: '',
      doorNo: '',
      streetName: '',
      address1: '',
      area: '',
      landmark: '',
      city: '',
      district: '',
      state: 'Andhra Pradesh',
      pincode: '',
      agentAssigned: '',
      assignedMarket: '',
      route: '',
      creditLimit: currentType === 'customer' ? 100000 : 0,
      creditDays: currentType === 'customer' ? 30 : 0,
      outstanding: 0,
      preferredTransport: '',
      gpsLocation: '',
      customerPhoto: '',
      shopPhoto: '',
      openingBalance: 0,
      status: 'active' as Party['status'],
      customerGrade: currentType === 'customer' ? 'Grade B (Regular)' : '',
      gstNumber: '',
      aadharNumber: '',
      remarks: ''
    };
  };

  const [formData, setFormData] = useState<any>(getEmptyFormData());
  // Form selected routes array (for Agent view)
  const [agentCheckedRoutes, setAgentCheckedRoutes] = useState<string[]>([]);

  // Search Debouncer
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load visible columns & filters & limit from localStorage on path change
  useEffect(() => {
    setPage(1);
    setSearchTerm('');
    setDebouncedSearch('');
    setViewingCustomer(null);
    setExpandedRouteId(null);
    setShowForm(false);
    setEditingItem(null);
    setFormData(getEmptyFormData());
    setAgentCheckedRoutes([]);
    setSelectedIds([]);

    // Reset sort field based on type
    if (currentType === 'route') {
      setSortField('name');
      setSortOrder('asc');
    } else {
      setSortField('firmName');
      setSortOrder('asc');
    }

    const savedCols = localStorage.getItem(`skbw_erp_visible_columns_${currentType}`);
    if (savedCols) {
      try {
        setVisibleColumns(JSON.parse(savedCols));
      } catch (e) {
        setVisibleColumns(getDefaultVisibleColumns());
      }
    } else {
      setVisibleColumns(getDefaultVisibleColumns());
    }

    const savedLimit = localStorage.getItem(`skbw_erp_limit_${currentType}`);
    if (savedLimit) {
      setLimit(parseInt(savedLimit, 10));
    } else {
      setLimit(25);
    }

    const savedFilters = localStorage.getItem(`skbw_erp_filters_${currentType}`);
    if (savedFilters) {
      try {
        setFilters(JSON.parse(savedFilters));
      } catch (e) {
        setFilters({
          status: [],
          city: [],
          route: [],
          agentAssigned: [],
          customerGrade: []
        });
      }
    } else {
      setFilters({
        status: [],
        city: [],
        route: [],
        agentAssigned: [],
        customerGrade: []
      });
    }
  }, [currentType]);

  // Persist limit
  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    localStorage.setItem(`skbw_erp_limit_${currentType}`, String(newLimit));
  };

  // Persist filters
  useEffect(() => {
    if (currentType) {
      localStorage.setItem(`skbw_erp_filters_${currentType}`, JSON.stringify(filters));
    }
  }, [filters, currentType]);

  // Reset selected IDs on page / search / filters change
  useEffect(() => {
    setSelectedIds([]);
  }, [page, debouncedSearch, filters]);

  const handleSort = (columnKey: string) => {
    // Map columnKey to database field name
    let field = columnKey;
    if (columnKey === 'firmName') {
      field = currentType === 'route' ? 'name' : 'firmName';
    }
    
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  // Load dynamic lists (cross references)
  const fetchDropdownOptions = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      // Fetch Agents
      const agentsRes = await getParties({ type: 'agent', limit: 1000, company: selectedCompany._id });
      setAllAgents(agentsRes.data.parties || []);

      // Fetch Routes
      const routesRes = await getRoutes(selectedCompany._id, { status: 'active' });
      setAllRoutes(routesRes.data || []);

      // Fetch Markets
      const marketsRes = await getParties({ type: 'market', limit: 1000, company: selectedCompany._id });
      setAllMarkets(marketsRes.data.parties || []);

      // Fetch Transporters
      const transportersRes = await getParties({ type: 'transporter', limit: 1000, company: selectedCompany._id });
      setAllTransporters(transportersRes.data.parties || []);

      // Fetch all parties of company to extract unique cities
      const partiesForCitiesRes = await getParties({ limit: 1000, company: selectedCompany._id });
      const partiesList = partiesForCitiesRes.data.parties || [];
      const cities = new Set<string>();
      partiesList.forEach((p: any) => {
        if (p.city && p.city.trim()) {
          cities.add(p.city.trim());
        }
      });
      setAllCities(Array.from(cities).sort());
    } catch (err) {
      console.error('Error fetching dropdown references:', err);
    }
  }, [selectedCompany]);

  // Dynamically add editing item's city to dropdown list if not present
  useEffect(() => {
    if (editingItem && editingItem.city && editingItem.city.trim()) {
      const cityTrimmed = editingItem.city.trim();
      if (!allCities.includes(cityTrimmed)) {
        setAllCities(prev => [...prev, cityTrimmed].sort());
      }
    }
  }, [editingItem, allCities]);

  const openInlineModal = (type: 'agent' | 'route' | 'market' | 'transporter') => {
    setInlineAgentData({ name: '', phone: '' });
    setInlineRouteData({ name: '', code: '', assignedAgent: '', description: '' });
    setInlineMarketData({
      name: '',
      city: '',
      district: '',
      route: '',
      state: 'Andhra Pradesh',
      agentAssigned: '',
      status: 'active'
    });
    setInlineTransporterData({ name: '', contactName: '', phone: '', email: '', city: '' });
    setInlineModalType(type);
  };

  const handleInlineSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      setIsSavingInline(true);
      if (inlineModalType === 'agent') {
        const payload = {
          type: 'agent',
          firmName: inlineAgentData.name,
          contactName: inlineAgentData.name,
          ownerName: inlineAgentData.name,
          phone: inlineAgentData.phone,
          company: selectedCompany._id
        };
        const res = await createParty(payload);
        setFormData((prev: any) => ({ ...prev, agentAssigned: res.data.firmName }));
      } else if (inlineModalType === 'route') {
        const payload = {
          name: inlineRouteData.name,
          code: inlineRouteData.code,
          assignedAgent: inlineRouteData.assignedAgent,
          description: inlineRouteData.description,
          company: selectedCompany._id
        };
        const res = await createRoute(payload);
        setFormData((prev: any) => ({ ...prev, route: res.data.name }));
      } else if (inlineModalType === 'market') {
        const payload = {
          type: 'market',
          firmName: inlineMarketData.name,
          contactName: inlineMarketData.name,
          city: inlineMarketData.name,
          district: inlineMarketData.district,
          state: inlineMarketData.state || 'Andhra Pradesh',
          route: inlineMarketData.route,
          agentAssigned: inlineMarketData.agentAssigned || '',
          status: inlineMarketData.status || 'active',
          company: selectedCompany._id
        };
        const res = await createParty(payload);
        setFormData((prev: any) => ({
          ...prev,
          city: res.data.firmName,
          assignedMarket: res.data.firmName,
          district: res.data.district || prev.district || '',
          state: res.data.state || prev.state || 'Andhra Pradesh',
          route: res.data.route || prev.route || '',
          agentAssigned: res.data.agentAssigned || prev.agentAssigned || ''
        }));
      } else if (inlineModalType === 'transporter') {
        const payload = {
          type: 'transporter',
          firmName: inlineTransporterData.name,
          contactName: inlineTransporterData.contactName || inlineTransporterData.name,
          phone: inlineTransporterData.phone,
          email: inlineTransporterData.email,
          city: inlineTransporterData.city,
          company: selectedCompany._id
        };
        const res = await createParty(payload);
        setFormData((prev: any) => ({ ...prev, preferredTransport: res.data.firmName }));
      }
      
      // Refresh dropdowns
      await fetchDropdownOptions();
      setInlineModalType(null);
    } catch (err: any) {
      console.error('Error saving inline reference:', err);
      const msg = err.response?.data?.msg || 'Error saving. Please try again.';
      alert(msg);
    } finally {
      setIsSavingInline(false);
    }
  };

  // Fetch Main Data List
  const fetchMainData = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      setLoading(true);
      if (currentType === 'route') {
        const res = await getRoutes(selectedCompany._id);
        let data = res.data || [];
        // Apply search & status filter client side for Routes (routes api returns all)
        if (debouncedSearch) {
          const searchRegex = new RegExp(debouncedSearch, 'i');
          data = data.filter((r: any) => searchRegex.test(r.name) || searchRegex.test(r.assignedAgent || ''));
        }
        if (filters.status && filters.status.length > 0) {
          data = data.filter((r: any) => filters.status.includes(r.status));
        }

        // Apply client side sorting for Routes
        const factor = sortOrder === 'asc' ? 1 : -1;
        data.sort((a: any, b: any) => {
          const valA = a[sortField] || '';
          const valB = b[sortField] || '';
          return valA.toString().localeCompare(valB.toString()) * factor;
        });

        setTotal(data.length);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        setParties(data.slice(startIndex, endIndex));
      } else {
        const params: any = { 
          type: currentType, 
          page, 
          limit,
          sortBy: sortField,
          sortOrder: sortOrder
        };
        if (debouncedSearch) params.search = debouncedSearch;
        
        if (filters.status && filters.status.length > 0) params.status = filters.status.join(',');
        if (filters.city && filters.city.length > 0) params.city = filters.city.join(',');
        if (filters.route && filters.route.length > 0) params.route = filters.route.join(',');
        if (filters.agentAssigned && filters.agentAssigned.length > 0) params.agentAssigned = filters.agentAssigned.join(',');
        if (filters.customerGrade && filters.customerGrade.length > 0) params.customerGrade = filters.customerGrade.join(',');

        params.company = selectedCompany._id;

        const res = await getParties(params);
        setParties(res.data.parties || []);
        setTotal(res.data.total || 0);
      }
    } catch (err) {
      console.error('Error loading data list:', err);
    } finally {
      setLoading(false);
    }
  }, [currentType, page, limit, debouncedSearch, filters, selectedCompany, sortField, sortOrder]);

  // Fetch Stats counts
  const fetchStatsCounts = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      if (currentType === 'route') {
        const res = await getRoutes(selectedCompany._id);
        const data = res.data || [];
        setStats({
          total: data.length,
          active: data.filter((r: any) => r.status === 'active').length,
          inactive: data.filter((r: any) => r.status === 'inactive').length,
          onHold: data.filter((r: any) => r.status === 'on-hold').length
        });
      } else {
        const res = await getPartyStats(currentType, selectedCompany._id);
        setStats(res.data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, [currentType, selectedCompany]);

  // Load everything
  useEffect(() => {
    fetchMainData();
    fetchStatsCounts();
    fetchDropdownOptions();
  }, [fetchMainData, fetchStatsCounts, fetchDropdownOptions]);

  // Load Activity Logs
  const fetchLogs = async () => {
    if (!selectedCompany) return;
    try {
      setActivityLogLoading(true);
      const res = await getActivityLogs({
        company: selectedCompany._id,
        entityType: currentType,
        limit: 100
      });
      setActivityLogs(res.data.logs || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setActivityLogLoading(false);
    }
  };

  useEffect(() => {
    if (showActivityLog) {
      fetchLogs();
    }
  }, [showActivityLog]);

  // Add/Edit Submissions
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData = { ...formData, company: selectedCompany?._id };

      // Strip immutable properties if editing to prevent database validation errors
      if (editingItem) {
        delete submitData._id;
        delete submitData.__v;
        delete submitData.createdAt;
        delete submitData.updatedAt;
      }

      // Set fallback fields
      if (currentType === 'agent') {
        submitData.contactName = formData.firmName;
        submitData.ownerName = formData.firmName;
        submitData.firmName = formData.firmName;
      }
      if (currentType === 'market') {
        submitData.contactName = formData.firmName;
      }
      if (currentType === 'transporter') {
        if (!submitData.contactName) submitData.contactName = formData.firmName;
      }

      let savedItem: any;

      if (currentType === 'route') {
        if (editingItem) {
          savedItem = await updateRoute(editingItem._id, submitData);
        } else {
          savedItem = await createRoute(submitData);
        }
      } else {
        if (editingItem) {
          savedItem = await updateParty(editingItem._id, submitData);
        } else {
          savedItem = await createParty(submitData);
        }
      }

      // If Agent, save route assignments
      if (currentType === 'agent') {
        const agentName = formData.firmName;
        for (const routeItem of allRoutes) {
          const isChecked = agentCheckedRoutes.includes(routeItem._id);
          const isCurrentlyAssigned = routeItem.assignedAgent === agentName;

          if (isChecked && !isCurrentlyAssigned) {
            await updateRoute(routeItem._id, { ...routeItem, assignedAgent: agentName });
          } else if (!isChecked && isCurrentlyAssigned) {
            await updateRoute(routeItem._id, { ...routeItem, assignedAgent: '' });
          }
        }
      }

      resetForm();
      fetchMainData();
      fetchStatsCounts();
      fetchDropdownOptions();
    } catch (err: any) {
      const msg = err.response?.data?.msg || 'Error saving. Please try again.';
      alert(msg);
    }
  };

  // Trigger Edit
  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({ ...item });
    setIsAddingNewCity(false);
    setNewCityName('');

    if (currentType === 'agent') {
      const agentName = item.firmName || item.contactName;
      // Get all route IDs currently assigned to this agent
      const assignedRouteIds = allRoutes
        .filter(r => r.assignedAgent === agentName)
        .map(r => r._id);
      setAgentCheckedRoutes(assignedRouteIds);
    }

    setShowForm(true);
  };

  // Trigger Delete
  const handleDelete = async (id: string) => {
    if (window.confirm(`Delete this ${typeLabel}?`)) {
      try {
        if (currentType === 'route') {
          await deleteRoute(id);
        } else {
          await deletePartyApi(id);
        }
        fetchMainData();
        fetchStatsCounts();
        fetchDropdownOptions();
      } catch (err) {
        console.error('Error deleting item:', err);
      }
    }
  };

  const resetForm = () => {
    setFormData(getEmptyFormData());
    setEditingItem(null);
    setShowForm(false);
    setAgentCheckedRoutes([]);
    setIsAddingNewCity(false);
    setNewCityName('');
  };

  // Selection Handlers
  const handleSelectAll = () => {
    if (selectedIds.length === parties.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(parties.map(p => p._id));
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Are you sure you want to bulk delete the ${selectedIds.length} selected ${typeLabelPlural.toLowerCase()}?`)) {
      try {
        setLoading(true);
        if (currentType === 'route') {
          await Promise.all(selectedIds.map(id => deleteRoute(id)));
        } else {
          await Promise.all(selectedIds.map(id => deletePartyApi(id)));
        }
        setSelectedIds([]);
        alert(`Successfully deleted selected entries.`);
        fetchMainData();
        fetchStatsCounts();
        fetchDropdownOptions();
      } catch (err) {
        console.error('Error during bulk delete:', err);
        alert('An error occurred during bulk delete. Some items might not have been deleted.');
        fetchMainData();
        fetchStatsCounts();
        fetchDropdownOptions();
      } finally {
        setLoading(false);
      }
    }
  };

  const handleImageUpload = (field: 'customerPhoto' | 'shopPhoto', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev: any) => ({ ...prev, [field]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // Duplicates Detector Logic
  const handleFindDuplicates = async () => {
    try {
      setLoading(true);
      let allItems: any[] = [];
      if (currentType === 'route') {
        const res = await getRoutes(selectedCompany?._id);
        allItems = res.data || [];
      } else {
        const res = await getParties({ type: currentType, limit: 100000, company: selectedCompany?._id });
        allItems = res.data.parties || [];
      }

      const groups: { field: string; value: string; items: any[] }[] = [];

      if (currentType === 'route') {
        const map = new Map<string, any[]>();
        allItems.forEach(item => {
          const name = item.name?.trim().toLowerCase();
          if (!name) return;
          if (!map.has(name)) map.set(name, []);
          map.get(name)!.push(item);
        });
        map.forEach((items, name) => {
          if (items.length > 1) {
            groups.push({ field: 'Route Name', value: items[0].name, items });
          }
        });
      } else {
        const nameMap = new Map<string, any[]>();
        const phoneMap = new Map<string, any[]>();
        const emailMap = new Map<string, any[]>();

        allItems.forEach(item => {
          const name = (item.firmName || item.contactName || item.name || '').trim().toLowerCase();
          const phone = item.phone?.trim();
          const email = item.email?.trim().toLowerCase();

          const isDummyName = !name || ['-', 'undefined', 'null', 'n/a', 'none'].includes(name.toLowerCase());
          const isDummyPhone = !phone || ['-', 'undefined', 'null', 'n/a', 'none', '0'].includes(phone.toLowerCase());
          const isDummyEmail = !email || ['-', 'undefined', 'null', 'n/a', 'none', 'example@mail.com'].includes(email.toLowerCase());

          if (!isDummyName) {
            if (!nameMap.has(name)) nameMap.set(name, []);
            nameMap.get(name)!.push(item);
          }
          if (!isDummyPhone) {
            if (!phoneMap.has(phone)) phoneMap.set(phone, []);
            phoneMap.get(phone)!.push(item);
          }
          if (!isDummyEmail) {
            if (!emailMap.has(email)) emailMap.set(email, []);
            emailMap.get(email)!.push(item);
          }
        });

        phoneMap.forEach((items, val) => {
          if (items.length > 1) groups.push({ field: 'Mobile Number', value: val, items });
        });
        emailMap.forEach((items, val) => {
          if (items.length > 1) groups.push({ field: 'Email Address', value: val, items });
        });
        nameMap.forEach((items, val) => {
          if (items.length > 1) {
            groups.push({
              field: 'Firm / Contact Name',
              value: items[0].firmName || items[0].contactName || items[0].name,
              items
            });
          }
        });
      }

      setDuplicateGroups(groups);
      setShowDuplicates(true);
    } catch (err) {
      console.error('Error finding duplicates:', err);
      alert('Error scanning for duplicates. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const deleteDuplicateItem = async (id: string) => {
    if (window.confirm('Delete this duplicate record?')) {
      try {
        if (currentType === 'route') {
          await deleteRoute(id);
        } else {
          await deletePartyApi(id);
        }
        await fetchMainData();
        await fetchStatsCounts();
        // Refresh duplicate scan
        await handleFindDuplicates();
      } catch (err) {
        console.error('Delete failed:', err);
      }
    }
  };

  // Import / Export Logic
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    let exportData: any[] = [];

    if (currentType === 'route') {
      exportData = parties.map(p => ({
        'Route Name': p.name,
        'Assigned Agent': p.assignedAgent || '-',
        'Status': p.status
      }));
    } else if (currentType === 'agent') {
      exportData = parties.map(p => {
        const routesStr = allRoutes
          .filter(r => r.assignedAgent === p.firmName)
          .map(r => r.name)
          .join(', ');
        return {
          'Agent Name': p.firmName,
          'Mobile': p.phone,
          'Assigned Routes': routesStr || '-',
          'Status': p.status
        };
      });
    } else if (currentType === 'market') {
      exportData = parties.map(p => ({
        'Market Name': p.firmName,
        'City': p.city,
        'District': p.district,
        'Route': p.route || '-',
        'Status': p.status
      }));
    } else if (currentType === 'transporter') {
      exportData = parties.map(p => ({
        'Transporter Name': p.firmName,
        'Contact Person': p.contactName,
        'Mobile': p.phone,
        'Email': p.email || '-',
        'City': p.city,
        'Status': p.status
      }));
    } else {
      // Customer or Vendor
      exportData = parties.map(p => ({
        'Firm Name': p.firmName,
        'Owner Name': p.ownerName,
        'Phone': p.phone,
        'Email': p.email,
        'City': p.city,
        'District': p.district,
        'State': p.state,
        'Pincode': p.pincode,
        'Route': p.route || '-',
        'Agent Assigned': p.agentAssigned || '-',
        'Market': p.assignedMarket || '-',
        'Credit Limit': p.creditLimit || 0,
        'Credit Days': p.creditDays || 0,
        'Opening Balance': p.openingBalance || 0,
        'Preferred Transport': p.preferredTransport || '-',
        'Status': p.status
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, typeLabelPlural);
    XLSX.writeFile(wb, `${typeLabelPlural.toLowerCase()}_export.xlsx`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws) as any[];

        // Normalize Excel headers to lowercase alphanumeric keys
        const normalizedData = rawData.map(row => {
          const norm: Record<string, any> = {};
          Object.entries(row).forEach(([k, v]) => {
            const normKey = k.trim().toLowerCase().replace(/[\s*_/-]/g, '');
            norm[normKey] = v;
          });
          return norm;
        });

        if (currentType === 'route') {
          const routesToImport = [];
          for (const item of normalizedData) {
            const rName = String(item['routename'] || item['route'] || item['name'] || '').trim();
            if (!rName) continue;
            routesToImport.push({
              name: rName,
              assignedAgent: item['assignedagent'] || item['agent'] || item['agentname'] || '',
              status: String(item['status'] || 'active').trim().toLowerCase(),
              company: selectedCompany?._id
            });
          }
          if (routesToImport.length === 0) {
            alert('No valid routes found to import.');
            return;
          }
          for (const routeData of routesToImport) {
            await createRoute(routeData);
          }
          alert(`Successfully imported ${routesToImport.length} routes.`);
        } else {
          const partiesToImport = normalizedData.map(item => {
            // Match any variant of name fields
            const name = String(
              item['firmname'] || item['companyname'] || item['firmcompanyname'] || 
              item['marketname'] || item['market'] || 
              item['agentname'] || item['agent'] || 
              item['transportername'] || item['transporter'] || 
              item['customername'] || item['customer'] || 
              item['vendorname'] || item['vendor'] || 
              item['name'] || ''
            ).trim();

            if (!name) return null;

            const phoneVal = String(
              item['mobilenumber'] || item['mobile'] || item['phone'] || 
              item['contactno'] || item['contactnumber'] || item['mobileno'] || 
              item['phoneno'] || item['phonenumber'] || item['telephoneno'] || 
              item['telephone'] || ''
            ).trim();
            
            return {
              type: currentType,
              firmName: name,
              contactName: String(item['contactperson'] || item['contactname'] || item['contact'] || name).trim(),
              ownerName: String(item['ownername'] || item['owner'] || name).trim(),
              phone: phoneVal,
              email: String(item['email'] || item['emailaddress'] || '').trim(),
              city: String(item['towncity'] || item['city'] || item['town'] || '').trim(),
              district: String(item['district'] || '').trim(),
              state: String(item['state'] || 'Tamil Nadu').trim(),
              pincode: String(item['pincode'] || '').trim(),
              route: String(item['assignedroute'] || item['route'] || '').trim(),
              agentAssigned: String(item['assignedagent'] || item['agentassigned'] || item['agent'] || '').trim(),
              assignedMarket: String(item['assignedmarket'] || item['market'] || '').trim(),
              creditLimit: parseFloat(item['creditlimit'] || item['limit'] || 0),
              creditDays: parseInt(item['creditdays'] || item['days'] || 0),
              openingBalance: parseFloat(item['openingbalance'] || item['balance'] || 0),
              preferredTransport: String(item['preferredtransporter'] || item['preferredtransport'] || item['transport'] || '').trim(),
              gstNumber: String(item['gstnumber'] || item['gst'] || item['gstin'] || '').trim(),
              aadharNumber: String(item['aadharnumber'] || item['aadhar'] || item['aadharno'] || '').trim(),
              status: String(item['status'] || 'active').trim().toLowerCase(),
              company: selectedCompany?._id
            };
          }).filter(Boolean);

          if (partiesToImport.length === 0) {
            alert(`No valid ${typeLabelPlural.toLowerCase()} found to import.`);
            return;
          }

          await importPartiesApi(partiesToImport);
          alert(`Successfully imported ${partiesToImport.length} ${typeLabelPlural.toLowerCase()}`);
        }

        fetchMainData();
        fetchStatsCounts();
        fetchDropdownOptions();
      } catch (error: any) {
        console.error('Import error details:', error);
        const errMsg = error.response?.data?.msg || error.message || 'Unknown error';
        alert(`Error importing file: ${errMsg}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleDownloadSampleCSV = () => {
    let headers: string[] = [];
    let sampleRows: string[][] = [];

    if (currentType === 'route') {
      headers = ['Route Name', 'Assigned Agent', 'Status'];
      sampleRows = [
        ['Route 1', 'Venkatesh Rao', 'active'],
        ['Route 2', 'Ramesh Kumar', 'active']
      ];
    } else if (currentType === 'agent') {
      headers = ['Agent Name', 'Mobile', 'Status'];
      sampleRows = [
        ['Venkatesh Rao', '9988776611', 'active'],
        ['Ramesh Kumar', '9440212345', 'active']
      ];
    } else if (currentType === 'market') {
      headers = ['City Name', 'District', 'State', 'Region / Line', 'Status'];
      sampleRows = [
        ['Secunderabad', 'Hyderabad', 'Telangana', 'Route 1', 'active'],
        ['Tirupati', 'Tirupati', 'Andhra Pradesh', 'Route 1', 'active']
      ];
    } else if (currentType === 'transporter') {
      headers = ['Transporter Name', 'Contact Person', 'Mobile', 'Email', 'City', 'Status'];
      sampleRows = [
        ['VRL Logistics', 'Suresh Kumar', '9876543210', 'info@vrl.com', 'Bangalore', 'active']
      ];
    } else {
      headers = [
        'Firm Name', 'Owner Name', 'Contact Person', 'Mobile Number', 'WhatsApp Number',
        'Email Address', 'Door No', 'Street Name', 'Address Line', 'Area', 'Landmark',
        'Town/City', 'District', 'State', 'Pincode', 'Assigned Route', 'Assigned Agent',
        'Assigned Market', 'Credit Limit', 'Credit Days', 'Opening Balance', 'Preferred Transporter',
        'GST Number', 'Aadhar Number', 'Status'
      ];
      sampleRows = [
        [
          currentType === 'customer' ? 'Charminar Notebook Publishers' : 'Paper Mills Supplier Ltd',
          'Mohammad Ali', 'Mohammad Ali', '9988776611', '9988776611',
          'ali@charminar.com', '12-3-45', 'Main Market Road', 'Near Bus Stand', 'Auto Nagar', 'Opp. Water Tank',
          currentType === 'customer' ? 'Secunderabad' : 'Tirupati',
          currentType === 'customer' ? 'Hyderabad' : 'Tirupati',
          currentType === 'customer' ? 'Telangana' : 'Andhra Pradesh',
          currentType === 'customer' ? '500003' : '517501',
          'Route 1', 'Venkatesh Rao',
          currentType === 'customer' ? 'Secunderabad' : 'Tirupati',
          '500000', '30', '0', 'GARUDA', '36AAAAA1111A1Z1', '123456789012', 'active'
        ]
      ];
    }

    const csvContent = [
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
    link.setAttribute('download', `sample_${currentType === 'route' ? 'regions' : currentType === 'market' ? 'cities' : currentType + 's'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getAgentRoutesBadges = (agentName: string) => {
    const routes = allRoutes.filter(r => r.assignedAgent === agentName);
    if (routes.length === 0) return <span className="text-gray-400">None</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {routes.map(r => (
          <span key={r._id} className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {r.name}
          </span>
        ))}
      </div>
    );
  };

  const totalPages = Math.ceil(total / limit);
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="flex h-full relative">
      {/* Main Content Pane */}
      <div className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${showForm || viewingCustomer ? 'mr-[520px]' : ''}`}>
        
        {/* Top Header Card */}
        <div className="mb-6">
          {/* Top Bar with Navigation Back link and user profile pill */}
          <div className="flex items-center justify-between mb-4">
            <div 
              className="flex items-center space-x-1.5 text-gray-500 hover:text-gray-900 cursor-pointer transition-colors" 
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-semibold">{typeLabelPlural}</span>
            </div>
            
            <div className="flex items-center space-x-2 text-gray-700 bg-gray-50 border border-gray-150 px-3.5 py-1.5 rounded-full text-sm font-medium shadow-xs">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
              <span>SKBW Admin</span>
            </div>
          </div>

          {/* Title & Actions Bar */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-905 tracking-tight">
                {pageHeader.title}
              </h1>
              <p className="text-sm text-gray-500 mt-1">{pageHeader.sub}</p>
            </div>
            
            <div className="flex items-center space-x-3">
              {selectedIds.length > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-red-650 hover:bg-red-750 text-white rounded-lg transition-colors font-medium shadow-sm font-semibold animate-pulse"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Selected ({selectedIds.length})</span>
                </button>
              )}
              <button
                onClick={() => setShowActivityLog(true)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs"
              >
                <Clock className="w-4 h-4 text-gray-450" />
                <span>Activity Log</span>
              </button>
              <button
                onClick={handleFindDuplicates}
                className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-medium shadow-xs"
              >
                <AlertTriangle className="w-4 h-4 text-gray-450" />
                <span>Find Duplicates</span>
              </button>
              <button
                onClick={() => { setEditingItem(null); setFormData(getEmptyFormData()); setAgentCheckedRoutes([]); setShowForm(true); }}
                className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add {currentType === 'market' ? 'City' : typeLabel}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-blue-500">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total {typeLabelPlural}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-green-500">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{stats.active}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-red-500">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Inactive</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{stats.inactive}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-yellow-500">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">On Hold</p>
            <p className="text-3xl font-bold text-yellow-600 mt-1">{stats.onHold || 0}</p>
          </div>
        </div>

        {/* Table Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search across all fields — firm name, mobile, city, email, agent..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
              />
            </div>
            
            <div className="flex items-center space-x-2 ml-4">
              <button
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showFilterPanel || Object.values(filters).some((arr: any) => arr.length > 0) ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                {Object.values(filters).some((arr: any) => arr.length > 0) && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full">
                    {Object.values(filters).filter((arr: any) => arr.length > 0).length}
                  </span>
                )}
              </button>
              <button
                className="flex items-center space-x-1.5 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                title="Sorting by Firm Name Ascending"
              >
                <Clock className="w-4 h-4 transform rotate-180" />
                <span>Sort</span>
                <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full">1</span>
              </button>
              <button
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showColumnSelector ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Columns className="w-4 h-4" />
                <span>Columns</span>
              </button>
              <button
                onClick={handleExport}
                className="flex items-center space-x-1.5 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              <button
                onClick={handleDownloadSampleCSV}
                className="flex items-center space-x-1.5 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                title="Download Sample CSV for Import"
              >
                <Download className="w-4 h-4 text-green-600" />
                <span>Sample CSV</span>
              </button>
              <label className="flex items-center space-x-1.5 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Import</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
              </label>
              <button
                onClick={() => { fetchMainData(); fetchStatsCounts(); fetchDropdownOptions(); }}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                title="Refresh Page"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Collapsible Multi-Filter Bar */}
          {showFilterPanel && (
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 md:grid-cols-5 gap-4">
              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</label>
                <div className="space-y-1 max-h-24 overflow-y-auto border border-gray-150 rounded-lg p-2 bg-gray-50/50">
                  {['active', 'inactive', 'on-hold'].map(s => {
                    const isChecked = filters.status?.includes(s);
                    return (
                      <label key={s} className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setFilters((prev: any) => ({
                              ...prev,
                              status: isChecked ? prev.status.filter((x: any) => x !== s) : [...(prev.status || []), s]
                            }));
                            setPage(1);
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 border-gray-300"
                        />
                        <span className="capitalize">{s === 'on-hold' ? 'On Hold' : s}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* City Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">City / Town</label>
                <div className="space-y-1 max-h-24 overflow-y-auto border border-gray-150 rounded-lg p-2 bg-gray-50/50">
                  {allMarkets.map(m => {
                    const isChecked = filters.city?.includes(m.firmName);
                    return (
                      <label key={m._id} className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setFilters((prev: any) => ({
                              ...prev,
                              city: isChecked ? prev.city.filter((x: any) => x !== m.firmName) : [...(prev.city || []), m.firmName]
                            }));
                            setPage(1);
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 border-gray-300"
                        />
                        <span>{m.firmName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Region / Route Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Region / Route</label>
                <div className="space-y-1 max-h-24 overflow-y-auto border border-gray-150 rounded-lg p-2 bg-gray-50/50">
                  {allRoutes.map(r => {
                    const isChecked = filters.route?.includes(r.name);
                    return (
                      <label key={r._id} className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setFilters((prev: any) => ({
                              ...prev,
                              route: isChecked ? prev.route.filter((x: any) => x !== r.name) : [...(prev.route || []), r.name]
                            }));
                            setPage(1);
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 border-gray-300"
                        />
                        <span>{r.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Agent Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Assigned Agent</label>
                <div className="space-y-1 max-h-24 overflow-y-auto border border-gray-150 rounded-lg p-2 bg-gray-50/50">
                  {allAgents.map(a => {
                    const isChecked = filters.agentAssigned?.includes(a.firmName);
                    return (
                      <label key={a._id} className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setFilters((prev: any) => ({
                              ...prev,
                              agentAssigned: isChecked ? prev.agentAssigned.filter((x: any) => x !== a.firmName) : [...(prev.agentAssigned || []), a.firmName]
                            }));
                            setPage(1);
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 border-gray-300"
                        />
                        <span>{a.firmName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Customer Grade selection */}
              {currentType === 'customer' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Grade</label>
                  <div className="space-y-1 max-h-24 overflow-y-auto border border-gray-150 rounded-lg p-2 bg-gray-50/50">
                    {['Grade A (Premium)', 'Grade B (Regular)', 'Grade C (Risk)'].map(g => {
                      const isChecked = filters.customerGrade?.includes(g);
                      return (
                        <label key={g} className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setFilters((prev: any) => ({
                                ...prev,
                                customerGrade: isChecked ? prev.customerGrade.filter((x: any) => x !== g) : [...(prev.customerGrade || []), g]
                              }));
                              setPage(1);
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 border-gray-300"
                          />
                          <span>{g.replace(/ \(.+\)/g, '')}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Columns Visibility Selector */}
          {showColumnSelector && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {Object.entries(allColumns).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      const updated = { ...visibleColumns, [key]: !visibleColumns[key] };
                      setVisibleColumns(updated);
                      localStorage.setItem(`skbw_erp_visible_columns_${currentType}`, JSON.stringify(updated));
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                      visibleColumns[key]
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Database Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={parties.length > 0 && selectedIds.length === parties.length}
                      onChange={handleSelectAll}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                    />
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-10">#</th>
                  {Object.entries(visibleColumns).map(([col, visible]) =>
                    visible && allColumns[col] && (
                      <th 
                        key={col} 
                        onClick={() => handleSort(col)}
                        className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                      >
                        <div className="flex items-center space-x-1">
                          <span>{allColumns[col]}</span>
                          <span className="text-gray-400">
                            {sortField === (col === 'firmName' && currentType === 'route' ? 'name' : col) ? (
                              sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                            )}
                          </span>
                        </div>
                      </th>
                    )
                  )}
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={20} className="px-5 py-12 text-center text-gray-400">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
                      <span>Loading records...</span>
                    </td>
                  </tr>
                ) : parties.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="px-5 py-12 text-center text-gray-400">
                      <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No records found</p>
                      <p className="text-sm mt-1">Add a new entry or import from Excel</p>
                    </td>
                  </tr>
                ) : (
                  parties.map((item, idx) => {
                    const rowNum = startItem + idx;
                    const citiesUnderRoute = currentType === 'route' ? allMarkets.filter(m => m.route === item.name) : [];
                    return (
                      <React.Fragment key={item._id}>
                        <tr
                          className="hover:bg-blue-50/20 transition-colors cursor-pointer"
                          onClick={() => {
                            if (currentType === 'customer') {
                              setViewingCustomer(item);
                            } else if (currentType === 'route') {
                              setExpandedRouteId(expandedRouteId === item._id ? null : item._id);
                            } else {
                              handleEdit(item);
                            }
                          }}
                        >
                          <td className="px-4 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(item._id)}
                              onChange={() => handleSelectRow(item._id)}
                              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                            />
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-400">{rowNum}</td>
                          {Object.entries(visibleColumns).map(([col, visible]) => {
                            if (!visible || !allColumns[col]) return null;
                            return (
                              <td key={col} className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-700 font-medium">
                                {col === 'firmName' ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-gray-955">{item.firmName || '-'}</span>
                                    {(currentType === 'customer' || currentType === 'vendor') && item.ownerName && (
                                      <span className="text-xs text-gray-455 font-normal mt-0.5">{item.ownerName}</span>
                                    )}
                                  </div>
                                ) : col === 'contactName' ? (
                                  <span className="font-semibold text-gray-950">{item.contactName || item.ownerName || '-'}</span>
                                ) : col === 'name' ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-gray-955">{item.name || '-'}</span>
                                    {currentType === 'route' && item.code && (
                                      <span className="text-xs text-gray-455 font-normal mt-0.5">{item.code}</span>
                                    )}
                                  </div>
                                ) : col === 'phone' ? (
                                  <div className="flex items-center">
                                    {item.phone ? (
                                      <a
                                        href={`tel:${item.phone.replace(/\D/g, '')}`}
                                        className="text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                                        onClick={e => e.stopPropagation()}
                                        title={`Call ${item.phone}`}
                                      >
                                        {item.phone}
                                      </a>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </div>
                                ) : col === 'route' ? (
                                  item.route ? (
                                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                                      {item.route}
                                    </span>
                                  ) : <span className="text-gray-400">-</span>
                                ) : col === 'assignedAgent' ? (
                                  item.assignedAgent ? (
                                    <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-md bg-purple-50 text-purple-700">
                                      {item.assignedAgent}
                                    </span>
                                  ) : <span className="text-gray-400">Not Assigned</span>
                                ) : col === 'assignedRoutes' ? (
                                  getAgentRoutesBadges(item.firmName || item.contactName)
                                ) : col === 'citiesCount' || col === 'customersCount' || col === 'customerCount' ? (
                                  <span className="font-medium text-gray-900">{item[col] !== undefined ? item[col] : 0}</span>
                                ) : col === 'creditLimit' ? (
                                  <span className="font-medium text-gray-950">₹{(item.creditLimit || 0).toLocaleString('en-IN')}</span>
                                ) : col === 'outstanding' ? (
                                  <span className={`font-semibold ${(item.outstanding || 0) > 0 ? 'text-red-650' : 'text-green-655'}`}>
                                    ₹{(item.outstanding || 0).toLocaleString('en-IN')}
                                  </span>
                                ) : col === 'customerGrade' ? (
                                  item.customerGrade ? (
                                    <span className={`inline-flex px-2.5 py-0.5 text-xs font-bold rounded uppercase ${
                                      item.customerGrade.includes('Grade A') ? 'bg-purple-100 text-purple-700' :
                                      item.customerGrade.includes('Grade B') ? 'bg-indigo-100 text-indigo-700' :
                                      'bg-amber-100 text-amber-700'
                                    }`}>
                                      {item.customerGrade.replace(/ \(.+\)/, '').toUpperCase()}
                                    </span>
                                  ) : <span className="text-gray-400">-</span>
                                ) : col === 'status' ? (
                                  <span className={`inline-flex px-2.5 py-0.5 text-[10px] font-bold rounded uppercase border ${
                                    item.status === 'active' ? 'bg-green-50 border-green-200 text-green-700' :
                                    item.status === 'inactive' ? 'bg-gray-50 border-gray-200 text-gray-500' :
                                    'bg-yellow-50 border-yellow-250 text-yellow-755'
                                  }`}>
                                    {item.status === 'on-hold' ? 'ON HOLD' : item.status.toUpperCase()}
                                  </span>
                                ) : (
                                  <span>{item[col] || '-'}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-5 py-3.5 whitespace-nowrap text-right text-sm" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end space-x-2 text-xs">
                              {currentType === 'customer' && (
                                <button
                                  onClick={() => setViewingCustomer(item)}
                                  className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors font-semibold shadow-xs"
                                >
                                  Profile
                                </button>
                              )}
                              <button
                                onClick={() => handleEdit(item)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 border border-gray-200 hover:border-blue-200 transition-colors font-semibold shadow-xs"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDelete(item._id)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-700 border border-red-200 hover:border-red-300 transition-colors font-semibold shadow-xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* City list expansion for regions page */}
                        {currentType === 'route' && expandedRouteId === item._id && (
                          <tr className="bg-gray-50/50" onClick={(e) => e.stopPropagation()}>
                            <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 3} className="px-8 py-4 border-t border-b border-gray-100/60">
                              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm max-w-4xl mx-auto">
                                <div className="flex items-center justify-between mb-4 border-b pb-2">
                                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center">
                                    <MapPin className="w-3.5 h-3.5 text-blue-500 mr-1.5" />
                                    Cities/Towns in {item.name} Line ({citiesUnderRoute.length})
                                  </h4>
                                  <button
                                    onClick={() => openInlineModal('market')}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add New City</span>
                                  </button>
                                </div>
                                
                                {citiesUnderRoute.length === 0 ? (
                                  <p className="text-xs text-gray-500 italic py-2">No cities mapped to this region yet.</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {citiesUnderRoute.map((city) => (
                                      <div
                                        key={city._id}
                                        className="p-3.5 border border-gray-100 rounded-lg bg-gray-50/30 flex items-center justify-between hover:border-blue-200 hover:shadow-xs transition-all"
                                      >
                                        <div>
                                          <span className="font-semibold text-gray-950 text-sm block">{city.firmName}</span>
                                          <span className="text-xs text-gray-400 font-medium">{city.district || '-'}, {city.state || '-'}</span>
                                        </div>
                                        <div className="text-right flex flex-col items-end">
                                          <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-100 mb-1">
                                            {city.customerCount || 0} Custs
                                          </span>
                                          <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                                            city.status === 'active'
                                              ? 'bg-green-50 text-green-700 border border-green-100'
                                              : 'bg-gray-100 text-gray-500'
                                          }`}>
                                            {city.status}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Dynamic Pagination Footer */}
          {currentType !== 'route' && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <div className="text-sm text-gray-500">
                Showing {startItem} to {endItem} of {total} {typeLabelPlural.toLowerCase()}
              </div>
              <div className="flex items-center space-x-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) { pageNum = i + 1; }
                  else if (page <= 3) { pageNum = i + 1; }
                  else if (page >= totalPages - 2) { pageNum = totalPages - 4 + i; }
                  else { pageNum = page - 2 + i; }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === pageNum ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 text-gray-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages || totalPages === 0} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronsRight className="w-4 h-4" />
                </button>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="ml-2 px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side Slider Form Panel */}
      {showForm && (
        <div className="fixed top-0 right-0 h-full w-[520px] bg-white shadow-2xl border-l border-gray-200 z-40 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-900">
              {editingItem ? 'Edit' : 'Add'} {typeLabel} Master
            </h2>
            <button onClick={resetForm} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Fields container */}
          <div className="flex-1 overflow-y-auto p-5">
            <form id="partyForm" onSubmit={handleSubmit} className="space-y-6">
              
              {/* 1. CUSTOMER FORM VIEW */}
              {currentType === 'customer' && (
                <>
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider border-b pb-1">Basic Information</h3>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Firm / Company Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        placeholder="e.g. Sri Krishna Binding Works"
                        value={formData.firmName || ''}
                        onChange={e => setFormData({ ...formData, firmName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Owner Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Ram Prasad"
                          value={formData.ownerName || ''}
                          onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Mobile Number <span className="text-red-500">*</span></label>
                        <input
                          type="tel"
                          placeholder="10-digit number"
                          value={formData.phone || ''}
                          onChange={e => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">WhatsApp Number</label>
                      <input
                        type="tel"
                        placeholder="Leave blank to match Mobile"
                        value={formData.whatsapp || ''}
                        onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Email ID</label>
                      <input
                        type="email"
                        placeholder="e.g. customer@gmail.com"
                        value={formData.email || ''}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">GST Number</label>
                        <input
                          type="text"
                          placeholder="e.g. 37AAAAA1111A1Z1"
                          value={formData.gstNumber || ''}
                          onChange={e => setFormData({ ...formData, gstNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Aadhar Number</label>
                        <input
                          type="text"
                          placeholder="e.g. 123456789012"
                          value={formData.aadharNumber || ''}
                          onChange={e => setFormData({ ...formData, aadharNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-4 pt-2">
                    <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider border-b pb-1">Address Information</h3>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Door Number / Dr No</label>
                        <input
                          type="text"
                          placeholder="e.g. 5-3/A"
                          value={formData.doorNo || ''}
                          onChange={e => setFormData({ ...formData, doorNo: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Street Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Press Bazar"
                          value={formData.streetName || ''}
                          onChange={e => setFormData({ ...formData, streetName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Address Line 1</label>
                      <input
                        type="text"
                        placeholder="Building, lane details..."
                        value={formData.address1 || ''}
                        onChange={e => setFormData({ ...formData, address1: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Area</label>
                        <input
                          type="text"
                          placeholder="e.g. Auto Nagar"
                          value={formData.area || ''}
                          onChange={e => setFormData({ ...formData, area: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Landmark</label>
                        <input
                          type="text"
                          placeholder="e.g. Near Water Tank"
                          value={formData.landmark || ''}
                          onChange={e => setFormData({ ...formData, landmark: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
                      <select
                        value={formData.city || ''}
                        onChange={e => {
                          if (e.target.value === 'ADD_NEW_CITY') {
                            openInlineModal('market');
                          } else {
                            // Find the selected market and automatically copy district & state
                            const selectedMarket = allMarkets.find(m => m.firmName === e.target.value);
                            setFormData({ 
                              ...formData, 
                              city: e.target.value,
                              district: selectedMarket?.district || formData.district || '',
                              state: selectedMarket?.state || formData.state || 'Andhra Pradesh'
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        required
                      >
                        <option value="">Select City</option>
                        <option value="ADD_NEW_CITY" className="text-blue-600 font-semibold text-left" style={{ color: '#2563eb' }}>+ Add New City</option>
                        {allMarkets.map(m => (
                          <option key={m._id} value={m.firmName}>{m.firmName}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Google Maps Link</label>
                      <input
                        type="text"
                        placeholder="https://maps.google.com/..."
                        value={formData.gpsLocation || ''}
                        onChange={e => setFormData({ ...formData, gpsLocation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      />
                    </div>
                  </div>

                  {/* Business & Logistics */}
                  <div className="space-y-4 pt-2">
                    <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider border-b pb-1">Business & Logistics</h3>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Region / Line <span className="text-red-500">*</span></label>
                      <select
                        value={formData.route || ''}
                        onChange={e => {
                          if (e.target.value === 'ADD_NEW_ROUTE') {
                            openInlineModal('route');
                          } else {
                            setFormData({ ...formData, route: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        required
                      >
                        <option value="">Select Region</option>
                        <option value="ADD_NEW_ROUTE" className="text-blue-600 font-semibold" style={{ color: '#2563eb' }}>+ Add New Region</option>
                        {allRoutes.map(r => (
                          <option key={r._id} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Agent</label>
                      <select
                        value={formData.agentAssigned || ''}
                        onChange={e => {
                          if (e.target.value === 'ADD_NEW_AGENT') {
                            openInlineModal('agent');
                          } else {
                            setFormData({ ...formData, agentAssigned: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      >
                        <option value="">Select Agent</option>
                        <option value="ADD_NEW_AGENT" className="text-blue-600 font-semibold" style={{ color: '#2563eb' }}>+ Add New Agent</option>
                        {allAgents.map(a => (
                          <option key={a._id} value={a.firmName}>{a.firmName}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Transport</label>
                      <select
                        value={formData.preferredTransport || ''}
                        onChange={e => {
                          if (e.target.value === 'ADD_NEW_TRANSPORTER') {
                            openInlineModal('transporter');
                          } else {
                            setFormData({ ...formData, preferredTransport: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      >
                        <option value="">Select Transporter</option>
                        <option value="ADD_NEW_TRANSPORTER" className="text-blue-600 font-semibold" style={{ color: '#2563eb' }}>+ Add New Transporter</option>
                        {allTransporters.map(t => (
                          <option key={t._id} value={t.firmName}>{t.firmName}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Credit & Grade Settings */}
                  <div className="space-y-4 pt-2">
                    <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider border-b pb-1">Credit & Grade Settings</h3>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Credit Days Limit</label>
                        <input
                          type="number"
                          placeholder="e.g. 30"
                          value={formData.creditDays}
                          onChange={e => setFormData({ ...formData, creditDays: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Credit Limit (₹)</label>
                        <input
                          type="number"
                          placeholder="e.g. 100000"
                          value={formData.creditLimit}
                          onChange={e => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Opening Outstanding Balance (₹)</label>
                      <input
                        type="number"
                        placeholder="e.g. 0"
                        value={formData.openingBalance}
                        onChange={e => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Customer Grade</label>
                        <select
                          value={formData.customerGrade || 'Grade B (Regular)'}
                          onChange={e => setFormData({ ...formData, customerGrade: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        >
                          <option value="Grade A (Premium)">Grade A (Premium)</option>
                          <option value="Grade B (Regular)">Grade B (Regular)</option>
                          <option value="Grade C (Risk)">Grade C (Risk)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Operating Status</label>
                        <select
                          value={formData.status || 'active'}
                          onChange={e => setFormData({ ...formData, status: e.target.value as Party['status'] })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="on-hold">On Hold</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Remarks / Notes</label>
                      <textarea
                        placeholder="General business remarks..."
                        value={formData.remarks || ''}
                        onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white h-20"
                      />
                    </div>
                  </div>

                  {/* Photos */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Images</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Customer Photo</label>
                        <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 relative min-h-[110px] flex flex-col items-center justify-center">
                          {formData.customerPhoto ? (
                            <>
                              <img src={formData.customerPhoto} alt="Customer" className="max-h-24 max-w-full rounded object-cover" />
                              <button type="button" onClick={() => setFormData({ ...formData, customerPhoto: '' })} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"><X className="w-3.5 h-3.5" /></button>
                            </>
                          ) : (
                            <label className="cursor-pointer flex flex-col items-center">
                              <Camera className="w-6 h-6 text-gray-400 mb-1" />
                              <span className="text-xs text-blue-600">Upload Photo</span>
                              <input type="file" accept="image/*" onChange={e => handleImageUpload('customerPhoto', e)} className="hidden" />
                            </label>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Shop / Office Photo</label>
                        <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 relative min-h-[110px] flex flex-col items-center justify-center">
                          {formData.shopPhoto ? (
                            <>
                              <img src={formData.shopPhoto} alt="Shop" className="max-h-24 max-w-full rounded object-cover" />
                              <button type="button" onClick={() => setFormData({ ...formData, shopPhoto: '' })} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"><X className="w-3.5 h-3.5" /></button>
                            </>
                          ) : (
                            <label className="cursor-pointer flex flex-col items-center">
                              <Camera className="w-6 h-6 text-gray-400 mb-1" />
                              <span className="text-xs text-blue-600">Upload Photo</span>
                              <input type="file" accept="image/*" onChange={e => handleImageUpload('shopPhoto', e)} className="hidden" />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 2. VENDOR FORM VIEW */}
              {currentType === 'vendor' && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Basic Information</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Firm / Company Name*</label>
                        <input type="text" placeholder="e.g. Tirupati Card Centre" value={formData.firmName || ''} onChange={e => setFormData({ ...formData, firmName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Owner Name*</label>
                        <input type="text" placeholder="e.g. Ramesh Kumar" value={formData.ownerName || ''} onChange={e => setFormData({ ...formData, ownerName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Mobile Number*</label>
                        <input type="tel" placeholder="e.g. 98765 43210" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                        <input type="email" placeholder="e.g. example@mail.com" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">GST Number</label>
                        <input type="text" placeholder="e.g. 37AAAAA1111A1Z1" value={formData.gstNumber || ''} onChange={e => setFormData({ ...formData, gstNumber: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Aadhar Number</label>
                        <input type="text" placeholder="e.g. 123456789012" value={formData.aadharNumber || ''} onChange={e => setFormData({ ...formData, aadharNumber: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Address Information</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Door / Plot Number</label>
                        <input type="text" placeholder="e.g. 12/A" value={formData.doorNo || ''} onChange={e => setFormData({ ...formData, doorNo: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Street Name</label>
                        <input type="text" placeholder="e.g. Gandhi Road" value={formData.streetName || ''} onChange={e => setFormData({ ...formData, streetName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Address Line</label>
                        <input type="text" placeholder="e.g. Near Bus Stand" value={formData.address1 || ''} onChange={e => setFormData({ ...formData, address1: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Area / Locality</label>
                        <input type="text" placeholder="e.g. Anna Nagar" value={formData.area || ''} onChange={e => setFormData({ ...formData, area: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Landmark</label>
                        <input type="text" placeholder="e.g. Opp. SBI Bank" value={formData.landmark || ''} onChange={e => setFormData({ ...formData, landmark: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Town / City*</label>
                        <input type="text" placeholder="e.g. Chennai" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">District*</label>
                        <input type="text" placeholder="e.g. Chennai" value={formData.district || ''} onChange={e => setFormData({ ...formData, district: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">State*</label>
                        <select value={formData.state || ''} onChange={e => setFormData({ ...formData, state: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                          <option value="">Select State</option>
                          {statesList.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Pincode*</label>
                        <input type="text" placeholder="e.g. 600001" value={formData.pincode || ''} onChange={e => setFormData({ ...formData, pincode: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Location</h3>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Google Maps Link</label>
                      <input type="text" placeholder="Paste Google Maps URL" value={formData.gpsLocation || ''} onChange={e => setFormData({ ...formData, gpsLocation: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                  </div>
                </>
              )}

              {/* 3. AGENT FORM VIEW */}
              {currentType === 'agent' && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Agent Details</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Agent Name*</label>
                        <input type="text" placeholder="e.g. Rajesh Kumar" value={formData.firmName || ''} onChange={e => setFormData({ ...formData, firmName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Mobile*</label>
                        <input type="tel" placeholder="e.g. 98765 43210" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                    </div>
                  </div>

                  {/* Assigned Routes Selectors */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Assigned Routes</h3>
                    <p className="text-xs text-gray-400 mb-3">Select the routes this agent is assigned to:</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3">
                      {allRoutes.length === 0 ? (
                        <p className="text-xs text-gray-400">No routes registered in system. Create routes first.</p>
                      ) : (
                        allRoutes.map(route => {
                          const isChecked = agentCheckedRoutes.includes(route._id);
                          return (
                            <label key={route._id} className="flex items-center space-x-3 text-sm p-1 hover:bg-gray-50 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setAgentCheckedRoutes(agentCheckedRoutes.filter(id => id !== route._id));
                                  } else {
                                    setAgentCheckedRoutes([...agentCheckedRoutes, route._id]);
                                  }
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300"
                              />
                              <div className="flex-1">
                                <span className="font-medium">{route.name}</span>
                                {route.assignedAgent && route.assignedAgent !== formData.firmName && (
                                  <span className="text-[10px] text-gray-400 ml-2">(Currently: {route.assignedAgent})</span>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* 4. ROUTE FORM VIEW */}
              {currentType === 'route' && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Route Details</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Route Name*</label>
                          <input type="text" placeholder="e.g. Andhra Line" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Route Code*</label>
                          <input type="text" placeholder="e.g. A" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Agent</label>
                        <select value={formData.assignedAgent || ''} onChange={e => setFormData({ ...formData, assignedAgent: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                          <option value="">Select Agent</option>
                          {allAgents.map(agent => (
                            <option key={agent._id} value={agent.firmName}>{agent.firmName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                        <textarea placeholder="Route notes or details" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 5. MARKET FORM VIEW */}
              {currentType === 'market' && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Market Details</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Market Name*</label>
                        <input type="text" placeholder="e.g. Anna Nagar Market" value={formData.firmName || ''} onChange={e => setFormData({ ...formData, firmName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                        <input type="text" placeholder="e.g. Chennai" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">District</label>
                        <input type="text" placeholder="e.g. Chennai" value={formData.district || ''} onChange={e => setFormData({ ...formData, district: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Route</label>
                        <select value={formData.route || ''} onChange={e => setFormData({ ...formData, route: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                          <option value="">Select Route</option>
                          {allRoutes.map(r => (
                            <option key={r._id} value={r.name}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 6. TRANSPORTER FORM VIEW */}
              {currentType === 'transporter' && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Transporter Details</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Transporter Name*</label>
                        <input type="text" placeholder="e.g. VRL Logistics" value={formData.firmName || ''} onChange={e => setFormData({ ...formData, firmName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                        <input type="text" placeholder="e.g. Suresh Kumar" value={formData.contactName || ''} onChange={e => setFormData({ ...formData, contactName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Mobile Number*</label>
                        <input type="tel" placeholder="e.g. 98765 43210" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                        <input type="email" placeholder="e.g. example@mail.com" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                        <input type="text" placeholder="e.g. Bangalore" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Status Select Buttons */}
              {currentType !== 'market' && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Status</h3>
                  <div className="flex space-x-3">
                    {['active', 'inactive', 'on-hold'].map(s => {
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setFormData({ ...formData, status: s })}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            formData.status === s
                              ? s === 'active' ? 'bg-green-50 border-green-300 text-green-700'
                                : s === 'inactive' ? 'bg-red-50 border-red-300 text-red-700'
                                : 'bg-yellow-50 border-yellow-300 text-yellow-700'
                              : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {s === 'on-hold' ? 'On Hold' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Form Actions Footer */}
          <div className="p-5 border-t border-gray-200 bg-gray-50 flex items-center space-x-3">
            <button
              type="submit"
              form="partyForm"
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
            >
              {editingItem ? 'Update' : 'Save'} {typeLabel}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Activity Log slide-out modal */}
      {showActivityLog && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowActivityLog(false)}></div>
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-md">
              <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-2xl">
                
                {/* Header */}
                <div className="bg-gray-50 px-4 py-6 sm:px-6 border-b">
                  <div className="flex items-start justify-between">
                    <h2 className="text-lg font-bold text-gray-900" id="slide-over-title">
                      {typeLabel} Activity Log
                    </h2>
                    <div className="ml-3 flex h-7 items-center">
                      <button onClick={() => setShowActivityLog(false)} className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none">
                        <X className="h-6 h-6" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Timeline content */}
                <div className="relative flex-1 py-6 px-4 sm:px-6">
                  {activityLogLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  ) : activityLogs.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No recent activity logged for {typeLabelPlural.toLowerCase()}</p>
                  ) : (
                    <div className="flow-root">
                      <ul role="list" className="-mb-8">
                        {activityLogs.map((log, logIdx) => (
                          <li key={log._id}>
                            <div className="relative pb-8">
                              {logIdx !== activityLogs.length - 1 ? (
                                <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                              ) : null}
                              <div className="relative flex space-x-3">
                                <div>
                                  <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                                    log.action === 'CREATE' ? 'bg-green-500 text-white' :
                                    log.action === 'UPDATE' ? 'bg-blue-500 text-white' :
                                    log.action === 'DELETE' ? 'bg-red-500 text-white' :
                                    'bg-purple-500 text-white'
                                  }`}>
                                    {log.action[0]}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900">{log.details}</p>
                                  <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
                                    <span>By: {log.performedBy}</span>
                                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Find Duplicates Modal */}
      {showDuplicates && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-500 bg-opacity-75">
          <div className="relative bg-white rounded-xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Find Duplicates for {typeLabelPlural}
              </h2>
              <button onClick={() => setShowDuplicates(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {duplicateGroups.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-semibold text-gray-800">No duplicates detected!</p>
                  <p className="text-sm text-gray-400 mt-1">All entries have unique keys.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">The following duplicate groups were identified. Check details and clean up if necessary:</p>
                  
                  {duplicateGroups.map((group, gIdx) => (
                    <div key={gIdx} className="border border-red-150 bg-red-50/10 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                          Duplicate by {group.field}: {group.value}
                        </span>
                        <span className="text-xs text-gray-400">{group.items.length} records</span>
                      </div>
                      
                      <div className="space-y-2">
                        {group.items.map((item) => (
                          <div key={item._id} className="flex justify-between items-center bg-white p-3 border rounded-lg text-sm">
                            <div>
                              <p className="font-semibold text-gray-950">
                                {currentType === 'route' ? item.name : (item.firmName || item.contactName)}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {currentType === 'route' ? `Agent: ${item.assignedAgent || 'None'}` : `Mobile: ${item.phone || '-'} | City: ${item.city || '-'}`}
                              </p>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => { setShowDuplicates(false); handleEdit(item); }}
                                className="px-2.5 py-1 text-xs border hover:bg-gray-50 rounded text-gray-600 font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteDuplicateItem(item._id)}
                                className="px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded font-medium"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl text-right">
              <button
                onClick={() => setShowDuplicates(false)}
                className="px-5 py-2 border rounded-lg hover:bg-gray-100 font-medium text-sm"
              >
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Dynamic Inline Creation Modal */}
      {inlineModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-500 bg-opacity-75 overflow-y-auto">
          <div className="relative bg-white rounded-xl max-w-md w-full shadow-2xl flex flex-col border border-gray-150 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 capitalize">
                Add New {inlineModalType === 'market' ? 'City' : inlineModalType === 'route' ? 'Region' : inlineModalType}
              </h2>
              <button onClick={() => setInlineModalType(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleInlineSave} className="p-6 space-y-4">
              {inlineModalType === 'agent' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Agent Name*</label>
                    <input
                      type="text"
                      placeholder="e.g. Rajesh Kumar"
                      value={inlineAgentData.name}
                      onChange={e => setInlineAgentData({ ...inlineAgentData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Mobile*</label>
                    <input
                      type="tel"
                      placeholder="e.g. 98765 43210"
                      value={inlineAgentData.phone}
                      onChange={e => setInlineAgentData({ ...inlineAgentData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                      required
                    />
                  </div>
                </>
              )}

              {inlineModalType === 'route' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Route Name*</label>
                      <input
                        type="text"
                        placeholder="e.g. Andhra Line"
                        value={inlineRouteData.name}
                        onChange={e => setInlineRouteData({ ...inlineRouteData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Route Code*</label>
                      <input
                        type="text"
                        placeholder="e.g. A"
                        value={inlineRouteData.code}
                        onChange={e => setInlineRouteData({ ...inlineRouteData, code: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Assigned Agent</label>
                    <select
                      value={inlineRouteData.assignedAgent}
                      onChange={e => setInlineRouteData({ ...inlineRouteData, assignedAgent: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors"
                    >
                      <option value="">Select Agent</option>
                      {allAgents.map(agent => (
                        <option key={agent._id} value={agent.firmName}>{agent.firmName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Description</label>
                    <textarea
                      placeholder="Route notes or details"
                      value={inlineRouteData.description}
                      onChange={e => setInlineRouteData({ ...inlineRouteData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors h-20"
                    />
                  </div>
                </>
              )}

              {inlineModalType === 'market' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">City Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g. Nellore"
                      value={inlineMarketData.name}
                      onChange={e => setInlineMarketData({ ...inlineMarketData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors animate-none"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">District</label>
                      <input
                        type="text"
                        placeholder="e.g. Nellore"
                        value={inlineMarketData.district}
                        onChange={e => setInlineMarketData({ ...inlineMarketData, district: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
                      <input
                        type="text"
                        placeholder="Andhra Pradesh"
                        value={inlineMarketData.state}
                        onChange={e => setInlineMarketData({ ...inlineMarketData, state: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Region / Line <span className="text-red-500">*</span></label>
                    <select
                      value={inlineMarketData.route}
                      onChange={e => setInlineMarketData({ ...inlineMarketData, route: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors"
                      required
                    >
                      <option value="">Select Region</option>
                      {allRoutes.map(r => (
                        <option key={r._id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Assigned Agent</label>
                    <select
                      value={inlineMarketData.agentAssigned}
                      onChange={e => setInlineMarketData({ ...inlineMarketData, agentAssigned: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors"
                    >
                      <option value="">Select Agent</option>
                      {allAgents.map(a => (
                        <option key={a._id} value={a.firmName}>{a.firmName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                    <select
                      value={inlineMarketData.status}
                      onChange={e => setInlineMarketData({ ...inlineMarketData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </>
              )}

              {inlineModalType === 'transporter' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Transporter Name*</label>
                    <input
                      type="text"
                      placeholder="e.g. VRL Logistics"
                      value={inlineTransporterData.name}
                      onChange={e => setInlineTransporterData({ ...inlineTransporterData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Contact Person</label>
                    <input
                      type="text"
                      placeholder="e.g. Suresh Kumar"
                      value={inlineTransporterData.contactName}
                      onChange={e => setInlineTransporterData({ ...inlineTransporterData, contactName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Mobile Number*</label>
                    <input
                      type="tel"
                      placeholder="e.g. 98765 43210"
                      value={inlineTransporterData.phone}
                      onChange={e => setInlineTransporterData({ ...inlineTransporterData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. info@vrl.com"
                        value={inlineTransporterData.email}
                        onChange={e => setInlineTransporterData({ ...inlineTransporterData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">City</label>
                      <input
                        type="text"
                        placeholder="e.g. Bangalore"
                        value={inlineTransporterData.city}
                        onChange={e => setInlineTransporterData({ ...inlineTransporterData, city: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Form Actions */}
              <div className="pt-4 border-t border-gray-150 flex items-center space-x-3">
                <button
                  type="submit"
                  disabled={isSavingInline}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isSavingInline ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save {inlineModalType === 'market' ? 'City' : inlineModalType === 'route' ? 'Region' : inlineModalType ? inlineModalType.charAt(0).toUpperCase() + inlineModalType.slice(1) : ''}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setInlineModalType(null)}
                  disabled={isSavingInline}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Details Right-Side Drawer */}
      {viewingCustomer && (
        <div className="fixed top-0 right-0 h-full w-[520px] bg-white shadow-2xl border-l border-gray-200 z-40 flex flex-col transition-all duration-300 animate-in slide-in-from-right">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-gray-900 truncate">
                  {viewingCustomer.firmName}
                </h2>
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full uppercase border ${
                  viewingCustomer.status === 'active' ? 'bg-green-50 border-green-200 text-green-700' :
                  viewingCustomer.status === 'inactive' ? 'bg-red-50 border-red-200 text-red-700' :
                  'bg-yellow-50 border-yellow-200 text-yellow-755'
                }`}>
                  {viewingCustomer.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono mt-1">
                Customer Code: <span className="font-semibold text-blue-600">{viewingCustomer.code || 'N/A'}</span>
              </p>
            </div>
            <button
              onClick={() => setViewingCustomer(null)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Quick Actions Grid */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    handleEdit(viewingCustomer);
                    setViewingCustomer(null);
                  }}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-lg border border-blue-200 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
                <button
                  onClick={() => alert('Customer History / Visit feature is coming soon!')}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <History className="w-4 h-4 text-gray-450" />
                  <span>History / Visit</span>
                </button>
                <button
                  onClick={() => alert('Ledger report will be generated shortly!')}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-gray-450" />
                  <span>Ledger</span>
                </button>
                <button
                  onClick={() => alert('Record Payment feature is coming soon!')}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <CreditCard className="w-4 h-4 text-gray-450" />
                  <span>Payment</span>
                </button>
                <button
                  onClick={() => {
                    setViewingCustomer(null);
                    navigate(`/sales/quotes?customerId=${viewingCustomer._id}`);
                  }}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <FileText className="w-4 h-4 text-gray-450" />
                  <span>Quotation</span>
                </button>
                <button
                  onClick={() => {
                    setViewingCustomer(null);
                    navigate(`/sales/orders?customerId=${viewingCustomer._id}`);
                  }}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4 text-gray-450" />
                  <span>Sale Order</span>
                </button>
              </div>
            </div>

            {/* Basic Info Section */}
            <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                <User className="w-4 h-4 text-gray-500" /> Basic Information
              </h3>
              <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Contact Person</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.contactName || viewingCustomer.ownerName || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Mobile Number</span>
                  <div className="flex items-center">
                    {viewingCustomer.phone ? (
                      <a
                        href={`tel:${viewingCustomer.phone.replace(/\D/g, '')}`}
                        className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                        title={`Call ${viewingCustomer.phone}`}
                      >
                        {viewingCustomer.phone}
                      </a>
                    ) : (
                      <span className="font-semibold text-gray-900">-</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Alternate Mobile</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.altPhone || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Email Address</span>
                  <span className="font-semibold text-gray-900 truncate block" title={viewingCustomer.email}>{viewingCustomer.email || '-'}</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-gray-200/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400 font-medium">Tax Details</span>
                    <div className="flex items-center space-x-3 text-xs">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="docViewRadio"
                          checked={docView === 'gst'}
                          onChange={() => setDocView('gst')}
                          className="text-blue-600 focus:ring-blue-500 w-3 h-3"
                        />
                        <span>GSTIN</span>
                      </label>
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="docViewRadio"
                          checked={docView === 'aadhar'}
                          onChange={() => setDocView('aadhar')}
                          className="text-blue-600 focus:ring-blue-500 w-3 h-3"
                        />
                        <span>Aadhar</span>
                      </label>
                    </div>
                  </div>
                  {docView === 'gst' ? (
                    <div className="bg-white px-3 py-2 border rounded-lg flex items-center justify-between">
                      <span className="text-xs font-mono text-gray-500">GSTIN</span>
                      <span className="font-mono font-bold text-gray-950 uppercase">{viewingCustomer.gstNumber || 'Not Provided'}</span>
                    </div>
                  ) : (
                    <div className="bg-white px-3 py-2 border rounded-lg flex items-center justify-between">
                      <span className="text-xs font-mono text-gray-500">Aadhar No</span>
                      <span className="font-mono font-bold text-gray-950">{viewingCustomer.aadharNumber || 'Not Provided'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Address Info Section */}
            <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-gray-500" /> Address Information
              </h3>
              <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Door / Shop No</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.doorNo || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Street Name</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.streetName || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-xs text-gray-400 font-medium">Address Line</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.address1 || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Area / Locality</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.area || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Landmark</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.landmark || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">City / Town</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.city || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">District</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.district || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">State</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.state || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Pincode</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.pincode || '-'}</span>
                </div>
                
                {/* GPS Location Button */}
                <div className="col-span-2 pt-2 border-t border-gray-200/60">
                  {viewingCustomer.gpsLocation ? (
                    <a
                      href={viewingCustomer.gpsLocation}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center space-x-2 w-full p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 text-xs font-semibold transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-blue-600" />
                      <span>Open Location on Google Maps</span>
                    </a>
                  ) : (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${viewingCustomer.firmName || ''} ${viewingCustomer.streetName || ''} ${viewingCustomer.city || ''} ${viewingCustomer.pincode || ''}`.trim()
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center space-x-2 w-full p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 text-xs font-semibold transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span>Search Address on Google Maps</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Business Info Section */}
            <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-gray-500" /> Business Details
              </h3>
              <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Assigned Route</span>
                  <span className="inline-flex px-2 py-0.5 mt-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-150">
                    {viewingCustomer.route || 'No Route'}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Assigned Agent</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.agentAssigned || 'No Agent'}</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Credit Days Limit</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.creditDays || 0} Days</span>
                </div>
                <div>
                  <span className="block text-xs text-gray-400 font-medium">Credit Limit</span>
                  <span className="font-semibold text-gray-900">₹{(viewingCustomer.creditLimit || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-xs text-gray-400 font-medium">Preferred Transport</span>
                  <span className="font-semibold text-gray-900">{viewingCustomer.preferredTransport || 'Direct Delivery'}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-xs text-gray-400 font-medium">Customer Grade</span>
                  {viewingCustomer.customerGrade ? (
                    <span className={`inline-flex px-2.5 py-0.5 text-xs font-bold rounded uppercase mt-0.5 ${
                      viewingCustomer.customerGrade.includes('Grade A') ? 'bg-purple-100 text-purple-755' :
                      viewingCustomer.customerGrade.includes('Grade B') ? 'bg-indigo-100 text-indigo-755' :
                      'bg-amber-100 text-amber-755'
                    }`}>
                      {viewingCustomer.customerGrade}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </div>
                {viewingCustomer.remarks && (
                  <div className="col-span-2">
                    <span className="block text-xs text-gray-400 font-medium">Remarks / Special Instructions</span>
                    <p className="text-xs text-gray-600 bg-white border border-gray-150 rounded-lg p-2 mt-1 leading-relaxed whitespace-pre-line font-medium">
                      {viewingCustomer.remarks}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="text-[10px] text-gray-400 text-center space-x-4">
              <span>Created: {new Date(viewingCustomer.createdAt).toLocaleString()}</span>
              <span>•</span>
              <span>Updated: {new Date(viewingCustomer.updatedAt).toLocaleString()}</span>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default PartyManagement;