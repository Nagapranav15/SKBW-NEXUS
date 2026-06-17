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

const WhatsAppIcon: React.FC = () => (
  <svg 
    className="w-4.5 h-4.5 text-green-500 hover:text-green-600 transition-colors inline-block align-middle ml-1.5 cursor-pointer shrink-0" 
    viewBox="0 0 24 24" 
    fill="currentColor"
    title="Chat on WhatsApp"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.705 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const getWhatsAppLink = (phoneNum: string) => {
  const digits = phoneNum.replace(/\D/g, '');
  const normalized = digits.length === 10 ? '91' + digits : digits;
  return `https://wa.me/${normalized}`;
};

const getRouteDisplay = (routeName: string, allRoutes: { name: string; code: string }[]) => {
  if (!routeName) return '-';
  const found = allRoutes.find(r => r.name.toLowerCase() === routeName.toLowerCase());
  return found && found.code ? found.code : routeName;
};

interface SortRule {
  field: string;
  order: 'asc' | 'desc';
}

interface FilterRule {
  join: 'and' | 'or';
  field: string;
  condition: 'equal to' | 'contains' | 'greater than' | 'less than' | 'starts with' | 'ends with';
  value: string;
}

const getColumnsSchema = (type: string): Record<string, string> => {
  switch (type) {
    case 'customer':
      return {
        firmName: 'Firm Name',
        phone: 'Mobile Number',
        city: 'City',
        district: 'District',
        agentAssigned: 'Assigned Agent',
        route: 'Region',
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
        assignedRoutes: 'Assigned Regions',
        status: 'Status'
      };
    case 'route':
      return {
        name: 'Region Code',
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
        route: 'Region',
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
    default:
      return {};
  }
};

const getDefaultVisibleColumns = (type: string): Record<string, boolean> => {
  const allCols = getColumnsSchema(type);
  const defaultCols: Record<string, boolean> = {};
  Object.keys(allCols).forEach(key => {
    if (type === 'customer') {
      defaultCols[key] = ['firmName', 'phone', 'city', 'agentAssigned', 'customerGrade', 'status'].includes(key);
    } else {
      defaultCols[key] = true;
    }
  });
  return defaultCols;
};

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

interface SearchableDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: { label: string; value: string }[];
  placeholder: string;
  addNewOption?: {
    label: string;
    onClick: () => void;
  };
  required?: boolean;
  className?: string;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder,
  addNewOption,
  required = false,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    (opt.label || "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch("");
        }}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between cursor-pointer"
      >
        <span className={selectedOption ? "text-gray-900 font-semibold" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="text-gray-400 ml-2">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {/* Hidden inputs to trigger required validity */}
      <input
        type="text"
        value={value}
        onChange={() => {}}
        required={required}
        className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
        tabIndex={-1}
      />

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-250 rounded-lg shadow-xl flex flex-col max-h-60 overflow-hidden animate-in fade-in duration-100">
          <div className="p-2 border-b border-gray-150 bg-gray-50 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border-0 p-0 text-xs focus:ring-0 focus:outline-none text-gray-900"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-gray-400 hover:text-gray-650"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
            {addNewOption && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  addNewOption.onClick();
                }}
                className="w-full text-left px-3 py-2.5 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors border-b border-gray-100 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addNewOption.label}</span>
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-450 text-center italic">
                No matches found
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-xs hover:bg-gray-100 transition-colors flex items-center justify-between ${
                    value === opt.value ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 font-medium"
                  }`}
                >
                  <span>{opt.label}</span>
                  {value === opt.value && <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [showSortSelector, setShowSortSelector] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(25);
  const [total, setTotal] = useState(0);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Filter input searches
  const [filterCitySearch, setFilterCitySearch] = useState('');
  const [filterRouteSearch, setFilterRouteSearch] = useState('');
  const [filterAgentSearch, setFilterAgentSearch] = useState('');

  // Cities search under regions
  const [citySearchText, setCitySearchText] = useState('');
  const [regionCitySearchText, setRegionCitySearchText] = useState('');

  // Custom Alert and Highlighting States
  const [customAlert, setCustomAlert] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const [customConfirm, setCustomConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number>(-1);

  const showAlert = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setCustomAlert({ message, type });
  };

  // Auto-dismiss toast notification after 3 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Close custom alert dialog on Enter or Escape keypress
  useEffect(() => {
    if (!customAlert) return;
    const handleAlertKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        setCustomAlert(null);
      }
    };
    window.addEventListener('keydown', handleAlertKeyDown);
    return () => window.removeEventListener('keydown', handleAlertKeyDown);
  }, [customAlert]);

  // Handle custom confirm keydown (Enter to confirm, Escape to cancel)
  useEffect(() => {
    if (!customConfirm) return;
    const handleConfirmKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        customConfirm.onConfirm();
        setCustomConfirm(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCustomConfirm(null);
      }
    };
    window.addEventListener('keydown', handleConfirmKeyDown);
    return () => window.removeEventListener('keydown', handleConfirmKeyDown);
  }, [customConfirm]);

  // Reset highlighted row index when parties list changes
  useEffect(() => {
    setHighlightedRowIndex(-1);
  }, [parties]);

  // Clear region city search when selected region/customer changes
  useEffect(() => {
    setRegionCitySearchText('');
  }, [viewingCustomer]);


  // City customers popup modal state
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);
  const [cityCustomers, setCityCustomers] = useState<any[]>([]);
  const [cityCustomersLoading, setCityCustomersLoading] = useState(false);
  const [cityCustomersSearchText, setCityCustomersSearchText] = useState('');

  // Lazy initialize visibleColumns from localStorage
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const type = getTypeFromPath();
    const saved = localStorage.getItem(`skbw_erp_visible_columns_${type}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return getDefaultVisibleColumns(type);
  });

  // Lazy initialize sortRules from localStorage (default to empty rule set to avoid default sort on refresh)
  const [sortRules, setSortRules] = useState<SortRule[]>(() => {
    const type = getTypeFromPath();
    const saved = localStorage.getItem(`skbw_erp_sort_rules_${type}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  // Lazy initialize filterRules from localStorage
  const [filterRules, setFilterRules] = useState<FilterRule[]>(() => {
    const type = getTypeFromPath();
    const saved = localStorage.getItem(`skbw_erp_filter_rules_${type}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  // Sorting state helpers (no longer active states, just derived or empty helpers)
  const allColumns = getColumnsSchema(currentType);

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

  // Global Keyboard Navigation (Tally-like controls)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. If custom alert or custom confirm is open, let their own listeners handle keys
      if (customAlert || customConfirm) return;

      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';

      // 2. Alt + C: Open Create Form
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setShowForm(true);
        setEditingItem(null);
        setFormData(getEmptyFormData());
        return;
      }

      // 2.5 Alt + E: Edit currently viewed customer
      if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (viewingCustomer) {
          handleEdit(viewingCustomer);
        }
        return;
      }

      // 3. Alt + D: Delete active/viewed/highlighted record
      if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (viewingCustomer) {
          handleDelete(viewingCustomer._id);
        } else if (highlightedRowIndex >= 0 && highlightedRowIndex < parties.length) {
          handleDelete(parties[highlightedRowIndex]._id);
        }
        return;
      }

      // 4. Escape: Close drawers / modals / forms
      if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedCityName) {
          setSelectedCityName(null);
        } else if (showForm) {
          resetForm();
        } else if (viewingCustomer) {
          setViewingCustomer(null);
        }
        return;
      }

      // 5. Arrow Keys & Enter on Rows (only active when not typing)
      if (!isInput) {
        if (parties.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedRowIndex(prev => {
            const nextIdx = prev + 1;
            return nextIdx < parties.length ? nextIdx : 0;
          });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedRowIndex(prev => {
            const nextIdx = prev - 1;
            return nextIdx >= 0 ? nextIdx : parties.length - 1;
          });
        } else if (e.key === 'Enter') {
          if (highlightedRowIndex >= 0 && highlightedRowIndex < parties.length) {
            e.preventDefault();
            setViewingCustomer(parties[highlightedRowIndex]);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [parties, highlightedRowIndex, viewingCustomer, showForm, selectedCityName, customAlert, customConfirm]);

  // Form Field Navigation: Enter key acts as Tab
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      
      // If typing in a textarea or pressing Enter on a submit/reset button, do normal action
      if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }
      
      e.preventDefault();
      const form = e.currentTarget;
      const focusable = Array.from(
        form.querySelectorAll('input, select, textarea, button:not([tabindex="-1"])')
      ) as HTMLElement[];
      
      const index = focusable.indexOf(target);
      if (index > -1 && index < focusable.length - 1) {
        focusable[index + 1].focus();
      }
    }
  };

  // Load visible columns & filters & limit from localStorage on path change
  useEffect(() => {
    setPage(1);
    setSearchTerm('');
    setDebouncedSearch('');
    setViewingCustomer(null);
    setExpandedRouteId(null);
    setCitySearchText('');
    setRegionCitySearchText('');
    setSelectedCityName(null);
    setHighlightedRowIndex(-1);
    setCustomAlert(null);
    setShowForm(false);
    setEditingItem(null);
    setFormData(getEmptyFormData());
    setAgentCheckedRoutes([]);
    setSelectedIds([]);
    setShowSortSelector(false);
    setShowColumnSelector(false);
    setShowFilterPanel(false);
    setFilterCitySearch('');
    setFilterRouteSearch('');
    setFilterAgentSearch('');

    // Load sorting rules from localStorage
    const savedSort = localStorage.getItem(`skbw_erp_sort_rules_${currentType}`);
    if (savedSort) {
      try {
        setSortRules(JSON.parse(savedSort));
      } catch (e) {
        setSortRules([]);
      }
    } else {
      setSortRules([]);
    }

    // Load columns
    const savedCols = localStorage.getItem(`skbw_erp_visible_columns_${currentType}`);
    if (savedCols) {
      try {
        setVisibleColumns(JSON.parse(savedCols));
      } catch (e) {
        setVisibleColumns(getDefaultVisibleColumns(currentType));
      }
    } else {
      setVisibleColumns(getDefaultVisibleColumns(currentType));
    }

    // Load limit
    const savedLimit = localStorage.getItem(`skbw_erp_limit_${currentType}`);
    if (savedLimit) {
      setLimit(parseInt(savedLimit, 10));
    } else {
      setLimit(25);
    }

    // Load filter rules
    const savedFilters = localStorage.getItem(`skbw_erp_filter_rules_${currentType}`);
    if (savedFilters) {
      try {
        setFilterRules(JSON.parse(savedFilters));
      } catch (e) {
        setFilterRules([]);
      }
    } else {
      setFilterRules([]);
    }
  }, [currentType]);

  // Autofocus first input field when form opens
  useEffect(() => {
    if (showForm) {
      const timer = setTimeout(() => {
        const form = document.getElementById('partyForm');
        if (form) {
          const firstInput = form.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])') as HTMLElement | null;
          if (firstInput) {
            firstInput.focus();
            if (firstInput instanceof HTMLInputElement && (firstInput.type === 'text' || firstInput.type === 'tel' || firstInput.type === 'email')) {
              firstInput.select();
            }
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showForm]);

  // Auto-scroll highlighted row into view during arrow-key navigation
  useEffect(() => {
    if (highlightedRowIndex >= 0) {
      const element = document.getElementById(`row-${highlightedRowIndex}`);
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [highlightedRowIndex]);

  // Persist limit
  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    localStorage.setItem(`skbw_erp_limit_${currentType}`, String(newLimit));
  };

  // Persist filters
  useEffect(() => {
    if (currentType) {
      localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify(filterRules));
    }
  }, [filterRules, currentType]);

  // Reset selected IDs on page / search / filters change
  useEffect(() => {
    setSelectedIds([]);
  }, [page, debouncedSearch, filterRules]);

  const handleSort = (columnKey: string) => {
    let field = columnKey;
    if (columnKey === 'firmName') {
      field = currentType === 'route' ? 'name' : 'firmName';
    }
    
    const existingIdx = sortRules.findIndex(r => r.field === field);
    let updatedRules: SortRule[] = [];
    if (existingIdx === 0) {
      const order = sortRules[0].order === 'asc' ? 'desc' : 'asc';
      updatedRules = [{ field, order }, ...sortRules.slice(1)];
    } else {
      const existingRule = sortRules[existingIdx];
      const order = existingRule ? existingRule.order : 'asc';
      updatedRules = [{ field, order }, ...sortRules.filter((_, idx) => idx !== existingIdx)];
    }
    setSortRules(updatedRules);
    localStorage.setItem(`skbw_erp_sort_rules_${currentType}`, JSON.stringify(updatedRules));
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

  // Fetch customers in a city and open popup modal
  const openCityCustomersPopup = async (cityName: string) => {
    setSelectedCityName(cityName);
    setCityCustomersSearchText('');
    try {
      setCityCustomersLoading(true);
      const res = await getParties({
        type: 'customer',
        city: cityName,
        company: selectedCompany?._id,
        limit: 1000
      } as any);
      setCityCustomers(res.data.parties || []);
    } catch (err) {
      console.error('Error fetching customers in city:', err);
    } finally {
      setCityCustomersLoading(false);
    }
  };

  const handleAddCustomerToCity = () => {
    if (!viewingCustomer) return;
    setEditingItem(null);
    setFormData({
      ...getEmptyFormData(),
      type: 'customer',
      city: viewingCustomer.firmName,
      district: viewingCustomer.district || '',
      state: viewingCustomer.state || 'Andhra Pradesh',
      route: viewingCustomer.route || ''
    });
    setShowForm(true);
  };

  const handleAddCustomerFromModal = () => {
    if (!selectedCityName) return;
    const cityObj = parties.find((p: any) => p.firmName === selectedCityName);
    setEditingItem(null);
    setFormData({
      ...getEmptyFormData(),
      type: 'customer',
      city: selectedCityName,
      district: cityObj?.district || '',
      state: cityObj?.state || 'Andhra Pradesh',
      route: cityObj?.route || ''
    });
    setShowForm(true);
  };

  const handleCardClick = (statusValue: string | null) => {
    if (statusValue === null) {
      const updated = filterRules.filter(r => r.field !== 'status');
      setFilterRules(updated);
      localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify(updated));
    } else {
      const existingIdx = filterRules.findIndex(r => r.field === 'status' && r.value === statusValue);
      let updated: FilterRule[] = [];
      if (existingIdx > -1) {
        updated = filterRules.filter((_, idx) => idx !== existingIdx);
      } else {
        updated = [...filterRules, { join: 'and', field: 'status', condition: 'equal to', value: statusValue }];
      }
      setFilterRules(updated);
      localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify(updated));
    }
    setPage(1);
  };

  const openInlineModal = (type: 'agent' | 'route' | 'market' | 'transporter', initialData?: any) => {
    setInlineAgentData({ name: '', phone: '' });
    setInlineRouteData({ name: '', code: '', assignedAgent: '', description: '' });
    setInlineMarketData({
      name: '',
      city: '',
      district: '',
      route: initialData?.route || '',
      state: 'Andhra Pradesh',
      agentAssigned: initialData?.agentAssigned || '',
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
      
      // Refresh dropdowns, main data list, and stats count
      await fetchDropdownOptions();
      await fetchMainData();
      await fetchStatsCounts();

      // If viewing a Region details drawer, refresh viewingCustomer in real-time
      if (currentType === 'route' && viewingCustomer) {
        const routesRes = await getRoutes(selectedCompany._id);
        const updatedRoutes = routesRes.data || [];
        const updatedRoute = updatedRoutes.find((r: any) => r._id === viewingCustomer._id);
        if (updatedRoute) {
          setViewingCustomer(updatedRoute);
        }
      }
      setInlineModalType(null);
    } catch (err: any) {
      console.error('Error saving inline reference:', err);
      const msg = err.response?.data?.msg || 'Error saving. Please try again.';
      showAlert(msg, 'error');
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
        
        if (debouncedSearch) {
          const searchRegex = new RegExp(debouncedSearch, 'i');
          data = data.filter((r: any) => searchRegex.test(r.name) || searchRegex.test(r.assignedAgent || ''));
        }

        // Apply Multi-Filter rules client-side for Routes
        if (filterRules && filterRules.length > 0) {
          filterRules.forEach((rule: any) => {
            const val = rule.value?.trim().toLowerCase();
            if (val === undefined || val === null || val === '') return;
            data = data.filter((r: any) => {
              const fieldVal = (r[rule.field] || '').toString().toLowerCase();
              if (rule.condition === 'equal to') {
                return fieldVal === val;
              } else if (rule.condition === 'contains') {
                return fieldVal.includes(val);
              } else if (rule.condition === 'greater than') {
                return Number(r[rule.field]) > Number(val);
              } else if (rule.condition === 'less than') {
                return Number(r[rule.field]) < Number(val);
              } else if (rule.condition === 'starts with') {
                return fieldVal.startsWith(val);
              } else if (rule.condition === 'ends with') {
                return fieldVal.endsWith(val);
              }
              return true;
            });
          });
        }

        // Apply client side sorting for Routes
        if (sortRules && sortRules.length > 0) {
          data.sort((a: any, b: any) => {
            for (const rule of sortRules) {
              const factor = rule.order === 'asc' ? 1 : -1;
              const valA = a[rule.field] ?? '';
              const valB = b[rule.field] ?? '';
              const cmp = valA.toString().localeCompare(valB.toString()) * factor;
              if (cmp !== 0) return cmp;
            }
            return 0;
          });
        }

        setTotal(data.length);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        setParties(data.slice(startIndex, endIndex));
      } else {
        const sortBy = sortRules.map(r => r.field).join(',');
        const sortOrder = sortRules.map(r => r.order).join(',');

        const params: any = { 
          type: currentType, 
          page, 
          limit
        };
        if (sortBy) {
          params.sortBy = sortBy;
          params.sortOrder = sortOrder;
        }
        if (debouncedSearch) params.search = debouncedSearch;
        
        if (filterRules && filterRules.length > 0) {
          params.filterRules = JSON.stringify(filterRules);
        }

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
  }, [currentType, page, limit, debouncedSearch, filterRules, selectedCompany, sortRules]);

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
      await fetchMainData();
      await fetchStatsCounts();
      await fetchDropdownOptions();

      // Refresh dynamic drawer views if currently viewing a city in drawer
      if (currentType === 'market' && viewingCustomer) {
        const updatedMarketRes = await getParties({ type: 'market', limit: 1000, company: selectedCompany?._id });
        const updatedMarkets = updatedMarketRes.data.parties || [];
        const updatedCity = updatedMarkets.find((m: any) => m._id === viewingCustomer._id);
        if (updatedCity) {
          setViewingCustomer(updatedCity);
        }
      }
      if (selectedCityName) {
        openCityCustomersPopup(selectedCityName);
      }
    } catch (err: any) {
      const msg = err.response?.data?.msg || 'Error saving. Please try again.';
      showAlert(msg, 'error');
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
    setCustomConfirm({
      message: `Delete this ${typeLabel}?`,
      onConfirm: async () => {
        try {
          if (currentType === 'route') {
            await deleteRoute(id);
          } else {
            await deletePartyApi(id);
          }
          if (viewingCustomer && viewingCustomer._id === id) {
            setViewingCustomer(null);
          }
          fetchMainData();
          fetchStatsCounts();
          fetchDropdownOptions();
          setToast({ message: `${typeLabel} deleted successfully.`, type: 'success' });
        } catch (err) {
          console.error('Error deleting item:', err);
          setToast({ message: `Failed to delete ${typeLabel.toLowerCase()}.`, type: 'error' });
        }
      }
    });
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
  const isAllOnPageSelected = parties.length > 0 && parties.every(p => selectedIds.includes(p._id));
  const isSomeOnPageSelected = parties.length > 0 && parties.some(p => selectedIds.includes(p._id)) && !isAllOnPageSelected;

  const handleSelectAll = () => {
    const allPageIds = parties.map(p => p._id);
    if (isAllOnPageSelected) {
      setSelectedIds(prev => prev.filter(id => !allPageIds.includes(id)));
    } else {
      setSelectedIds(prev => {
        const next = [...prev];
        allPageIds.forEach(id => {
          if (!next.includes(id)) {
            next.push(id);
          }
        });
        return next;
      });
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
    setCustomConfirm({
      message: `Are you sure you want to bulk delete the ${selectedIds.length} selected ${typeLabelPlural.toLowerCase()}?`,
      onConfirm: async () => {
        try {
          setLoading(true);
          if (currentType === 'route') {
            await Promise.all(selectedIds.map(id => deleteRoute(id)));
          } else {
            await Promise.all(selectedIds.map(id => deletePartyApi(id)));
          }
          setSelectedIds([]);
          setToast({ message: `Successfully deleted selected entries.`, type: 'success' });
          fetchMainData();
          fetchStatsCounts();
          fetchDropdownOptions();
        } catch (err) {
          console.error('Error during bulk delete:', err);
          setToast({ message: 'An error occurred during bulk delete.', type: 'error' });
          fetchMainData();
          fetchStatsCounts();
          fetchDropdownOptions();
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleImageUpload = (field: 'customerPhoto' | 'shopPhoto', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showAlert('Image must be less than 2MB', 'warning');
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
      showAlert('Error scanning for duplicates. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const deleteDuplicateItem = async (id: string) => {
    setCustomConfirm({
      message: 'Delete this duplicate record?',
      onConfirm: async () => {
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
          setToast({ message: `Duplicate record deleted successfully.`, type: 'success' });
        } catch (err) {
          console.error('Delete failed:', err);
          setToast({ message: `Failed to delete duplicate record.`, type: 'error' });
        }
      }
    });
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
            showAlert('No valid routes found to import.', 'warning');
            return;
          }
          for (const routeData of routesToImport) {
            await createRoute(routeData);
          }
          showAlert(`Successfully imported ${routesToImport.length} routes.`, 'success');
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
            showAlert(`No valid ${typeLabelPlural.toLowerCase()} found to import.`, 'warning');
            return;
          }

          await importPartiesApi(partiesToImport);
          showAlert(`Successfully imported ${partiesToImport.length} ${typeLabelPlural.toLowerCase()}`, 'success');
        }

        fetchMainData();
        fetchStatsCounts();
        fetchDropdownOptions();
      } catch (error: any) {
        console.error('Import error details:', error);
        const errMsg = error.response?.data?.msg || error.message || 'Unknown error';
        showAlert(`Error importing file: ${errMsg}`, 'error');
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
    if (routes.length === 0) return <span className="text-gray-400 text-xs italic">None</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {routes.map(r => (
          <span
            key={r._id}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs hover:bg-indigo-100 transition-colors cursor-default"
            title={r.name}
          >
            <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>{r.code || r.name}</span>
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
      {/* Subtle Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-xl border border-gray-800 animate-in fade-in slide-in-from-top-4 duration-200">
          {toast.type === 'success' && <CheckCircle className="w-4.5 h-4.5 text-green-400" />}
          {toast.type === 'error' && <XCircle className="w-4.5 h-4.5 text-red-400" />}
          {toast.type === 'info' && <Building className="w-4.5 h-4.5 text-blue-400" />}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white transition-colors pl-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Pane */}
      <div className={`flex-1 p-4 overflow-y-auto transition-all duration-300 ${showForm || viewingCustomer ? 'mr-[520px]' : ''}`}>
        
        {/* Top Header Card */}
        <div className="mb-4">
          {/* Top Bar with Navigation Back link and user profile pill */}
          <div className="flex items-center justify-between mb-3">
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
                  className="flex items-center space-x-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all font-semibold shadow-md active:scale-95 duration-100"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Selected ({selectedIds.length})</span>
                  <kbd className="ml-1.5 px-1.5 py-0.5 text-[10px] font-mono font-bold text-red-100 bg-red-800 rounded border border-red-700 shadow-xs select-none pointer-events-none">Alt+D</kbd>
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
                <kbd className="ml-1.5 px-1.5 py-0.5 text-[10px] font-mono font-bold text-blue-100 bg-blue-800 rounded border border-blue-700 shadow-xs select-none pointer-events-none">Alt+C</kbd>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <button
            onClick={() => handleCardClick(null)}
            className={`w-full text-left bg-white rounded-xl shadow-xs border p-3 border-l-4 border-l-blue-500 transition-all duration-200 hover:scale-[1.015] active:scale-98 focus:outline-hidden ${
              !filterRules.some((r: any) => r.field === 'status')
                ? 'ring-2 ring-blue-500 bg-blue-50/20 border-blue-200 shadow-sm'
                : 'border-gray-100 hover:border-blue-200 hover:shadow-xs'
            }`}
          >
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total {typeLabelPlural}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.total}</p>
          </button>

          <button
            onClick={() => handleCardClick('active')}
            className={`w-full text-left bg-white rounded-xl shadow-xs border p-3 border-l-4 border-l-green-500 transition-all duration-200 hover:scale-[1.015] active:scale-98 focus:outline-hidden ${
              filterRules.some((r: any) => r.field === 'status' && r.value === 'active')
                ? 'ring-2 ring-green-500 bg-green-50/20 border-green-200 shadow-sm'
                : 'border-gray-100 hover:border-green-200 hover:shadow-xs'
            }`}
          >
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active</p>
            <p className="text-2xl font-bold text-green-600 mt-0.5">{stats.active}</p>
          </button>

          <button
            onClick={() => handleCardClick('inactive')}
            className={`w-full text-left bg-white rounded-xl shadow-xs border p-3 border-l-4 border-l-red-500 transition-all duration-200 hover:scale-[1.015] active:scale-98 focus:outline-hidden ${
              filterRules.some((r: any) => r.field === 'status' && r.value === 'inactive')
                ? 'ring-2 ring-red-500 bg-red-50/20 border-red-200 shadow-sm'
                : 'border-gray-100 hover:border-red-200 hover:shadow-xs'
            }`}
          >
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Inactive</p>
            <p className="text-2xl font-bold text-red-600 mt-0.5">{stats.inactive}</p>
          </button>

          <button
            onClick={() => handleCardClick('on-hold')}
            className={`w-full text-left bg-white rounded-xl shadow-xs border p-3 border-l-4 border-l-yellow-500 transition-all duration-200 hover:scale-[1.015] active:scale-98 focus:outline-hidden ${
              filterRules.some((r: any) => r.field === 'status' && r.value === 'on-hold')
                ? 'ring-2 ring-yellow-500 bg-yellow-50/20 border-yellow-200 shadow-sm'
                : 'border-gray-100 hover:border-yellow-200 hover:shadow-xs'
            }`}
          >
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">On Hold</p>
            <p className="text-2xl font-bold text-yellow-600 mt-0.5">{stats.onHold || 0}</p>
          </button>
        </div>

        {/* Table Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-4">
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
              {/* Filters Button */}
              <button
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 ${
                  showFilterPanel || filterRules.length > 0
                    ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-755 hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4 text-blue-600" />
                <span>Filters</span>
                {filterRules.length > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                    {filterRules.length}
                  </span>
                )}
              </button>

              {/* Sort By Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSortSelector(!showSortSelector)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 ${
                    showSortSelector || sortRules.length > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-755 hover:bg-gray-50'
                  }`}
                >
                  <ArrowUpDown className="w-4 h-4 text-blue-600" />
                  <span>Sort</span>
                  {sortRules.length > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                      {sortRules.length}
                    </span>
                  )}
                </button>
                {showSortSelector && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSortSelector(false)} />
                    <div className="absolute right-0 mt-2 w-[340px] rounded-2xl shadow-xl bg-white border border-gray-150 p-4 z-20 space-y-3 animate-in fade-in slide-in-from-top-2 duration-100">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Sort Rules</span>
                        <button
                          onClick={() => {
                            setSortRules([]);
                            localStorage.setItem(`skbw_erp_sort_rules_${currentType}`, JSON.stringify([]));
                            setPage(1);
                          }}
                          className="text-xs text-red-500 hover:text-red-755 font-semibold cursor-pointer"
                        >
                          Clear all
                        </button>
                      </div>

                      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {sortRules.map((rule, idx) => (
                          <div key={idx} className="flex items-center space-x-2">
                            {/* Sort Field Selection Dropdown */}
                            <div className="relative flex-1">
                              <select
                                value={rule.field}
                                onChange={(e) => {
                                  const updated = [...sortRules];
                                  updated[idx] = { ...updated[idx], field: e.target.value };
                                  setSortRules(updated);
                                  localStorage.setItem(`skbw_erp_sort_rules_${currentType}`, JSON.stringify(updated));
                                  setPage(1);
                                }}
                                className="w-full pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
                              >
                                {Object.entries(allColumns).map(([key, label]) => {
                                  const dbField = key === 'firmName' && currentType === 'route' ? 'name' : key;
                                  return (
                                    <option key={key} value={dbField}>
                                      {label}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* Sort Order Direction Toggle Button */}
                            <button
                              onClick={() => {
                                const updated = [...sortRules];
                                updated[idx] = { ...updated[idx], order: rule.order === 'asc' ? 'desc' : 'asc' };
                                setSortRules(updated);
                                localStorage.setItem(`skbw_erp_sort_rules_${currentType}`, JSON.stringify(updated));
                                setPage(1);
                              }}
                              className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-650 transition-colors flex items-center justify-center w-8 h-8 shrink-0 cursor-pointer"
                              title="Toggle Sort Order"
                            >
                              {rule.order === 'asc' ? (
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              )}
                            </button>

                            {/* Remove Sort Rule Button */}
                            <button
                              onClick={() => {
                                const updated = sortRules.filter((_, i) => i !== idx);
                                setSortRules(updated);
                                localStorage.setItem(`skbw_erp_sort_rules_${currentType}`, JSON.stringify(updated));
                                setPage(1);
                              }}
                              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center w-8 h-8 shrink-0 cursor-pointer"
                              title="Remove Sort Rule"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => {
                          const nextField = Object.keys(allColumns).find(k => !sortRules.some(r => r.field === k)) || 'createdAt';
                          const updated = [...sortRules, { field: nextField, order: 'asc' as const }];
                          setSortRules(updated);
                          localStorage.setItem(`skbw_erp_sort_rules_${currentType}`, JSON.stringify(updated));
                          setPage(1);
                        }}
                        className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-550 hover:text-gray-755 hover:border-gray-400 hover:bg-gray-50 transition-all font-semibold text-center flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>+ Add sort rule</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Columns Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 ${
                    showColumnSelector
                      ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-755 hover:bg-gray-50'
                  }`}
                >
                  <Columns className="w-4 h-4 text-blue-600" />
                  <span>Columns</span>
                </button>
                {showColumnSelector && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowColumnSelector(false)} />
                    <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-xl bg-white border border-gray-150 p-3.5 z-20 space-y-2 animate-in fade-in slide-in-from-top-2 duration-100">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-100 mb-1.5">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Visible Columns</span>
                        <button
                          onClick={() => {
                            const reset = getDefaultVisibleColumns(currentType);
                            setVisibleColumns(reset);
                            localStorage.setItem(`skbw_erp_visible_columns_${currentType}`, JSON.stringify(reset));
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {Object.entries(allColumns).map(([key, label]) => {
                          const isVisible = !!visibleColumns[key];
                          return (
                            <label key={key} className="flex items-center space-x-2 text-xs text-gray-655 cursor-pointer hover:text-gray-905 select-none py-0.5">
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={() => {
                                  const updated = {
                                    ...visibleColumns,
                                    [key]: !isVisible
                                  };
                                  setVisibleColumns(updated);
                                  localStorage.setItem(`skbw_erp_visible_columns_${currentType}`, JSON.stringify(updated));
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 border-gray-300 cursor-pointer"
                              />
                              <span className={isVisible ? 'font-semibold text-blue-700' : ''}>{label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

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

          {/* Collapsible Multi-Filter Panel */}
          {showFilterPanel && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 animate-in slide-in-from-top-2 duration-150">
              <div className="flex justify-between items-center pb-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  Multi-Filter Builder
                </span>
                <button
                  onClick={() => {
                    setFilterRules([]);
                    localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify([]));
                    setPage(1);
                  }}
                  className="text-xs text-red-500 hover:text-red-755 font-semibold cursor-pointer bg-transparent border-0"
                >
                  Clear all
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-xs bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 w-16"></th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Field</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Condition</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Look For</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-500 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filterRules.map((rule, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-semibold text-gray-450 uppercase">
                          {idx === 0 ? '' : 'and'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={rule.field}
                            onChange={(e) => {
                              const updated = [...filterRules];
                              updated[idx] = { ...updated[idx], field: e.target.value };
                              setFilterRules(updated);
                              localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify(updated));
                              setPage(1);
                            }}
                            className="px-2 py-1 border border-gray-200 rounded bg-gray-50 text-xs w-full focus:bg-white focus:outline-none cursor-pointer"
                          >
                            {Object.entries(allColumns).map(([key, label]) => {
                              const dbField = key === 'firmName' && currentType === 'route' ? 'name' : key;
                              return (
                                <option key={key} value={dbField}>
                                  {label}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={rule.condition}
                            onChange={(e) => {
                              const updated = [...filterRules];
                              updated[idx] = { ...updated[idx], condition: e.target.value as any };
                              setFilterRules(updated);
                              localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify(updated));
                              setPage(1);
                            }}
                            className="px-2 py-1 border border-gray-200 rounded bg-gray-50 text-xs w-full focus:bg-white focus:outline-none cursor-pointer"
                          >
                            <option value="equal to">equal to</option>
                            <option value="contains">contains</option>
                            <option value="greater than">greater than</option>
                            <option value="less than">less than</option>
                            <option value="starts with">starts with</option>
                            <option value="ends with">ends with</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="Type search value..."
                            value={rule.value}
                            onChange={(e) => {
                              const updated = [...filterRules];
                              updated[idx] = { ...updated[idx], value: e.target.value };
                              setFilterRules(updated);
                              localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify(updated));
                            }}
                            onBlur={() => setPage(1)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                setPage(1);
                              }
                            }}
                            className="px-2 py-1 border border-gray-200 rounded text-xs w-full focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white placeholder-gray-400"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              const updated = filterRules.filter((_, i) => i !== idx);
                              setFilterRules(updated);
                              localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify(updated));
                              setPage(1);
                            }}
                            className="text-red-500 hover:text-red-700 transition-colors p-1 cursor-pointer bg-transparent border-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={5} className="px-3 py-2 bg-gray-50/50">
                        <button
                          onClick={() => {
                            const nextField = Object.keys(allColumns)[0] || 'firmName';
                            const updated = [...filterRules, { join: 'and' as const, field: nextField, condition: 'equal to' as const, value: '' }];
                            setFilterRules(updated);
                            localStorage.setItem(`skbw_erp_filter_rules_${currentType}`, JSON.stringify(updated));
                          }}
                          className="text-blue-650 hover:text-blue-800 font-semibold text-xs flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add filter rule
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
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
                  <th className="px-3 py-2 text-left w-10">
                    <input
                      type="checkbox"
                      checked={isAllOnPageSelected}
                      ref={el => {
                        if (el) el.indeterminate = isSomeOnPageSelected;
                      }}
                      onChange={handleSelectAll}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                    />
                  </th>
                  <th className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-10">#</th>
                  {Object.entries(visibleColumns).map(([col, visible]) =>
                    visible && allColumns[col] && (
                      <th 
                        key={col} 
                        onClick={() => handleSort(col)}
                        className="px-3.5 py-2 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100/50 transition-colors select-none"
                      >
                        <div className="flex items-center space-x-1">
                          <span>{allColumns[col]}</span>
                          <span className="text-gray-400">
                            {sortRules[0]?.field === (col === 'firmName' && currentType === 'route' ? 'name' : col) ? (
                              sortRules[0].order === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-blue-600" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 inline ml-0.5 text-gray-300 opacity-40 hover:opacity-100 transition-opacity" />
                            )}
                          </span>
                        </div>
                      </th>
                    )
                  )}
                  <th className="px-3.5 py-2 text-right text-xs font-bold text-gray-400 uppercase tracking-wider w-24">Actions</th>
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
                    const isSelectedRow = viewingCustomer && viewingCustomer._id === item._id;
                    return (
                      <React.Fragment key={item._id}>
                        <tr
                          id={`row-${idx}`}
                          className={`transition-all cursor-pointer border-l-2 ${
                            isSelectedRow 
                              ? 'bg-blue-50/80 hover:bg-blue-50 text-blue-900 font-semibold border-l-blue-600 shadow-xs' 
                              : idx === highlightedRowIndex
                                ? 'bg-blue-50/30 hover:bg-blue-50/50 text-blue-900 font-semibold border-l-blue-500 shadow-xs ring-1 ring-blue-100/50 ring-inset'
                                : 'hover:bg-gray-50 border-l-transparent text-gray-700'
                          }`}
                          onMouseEnter={() => setHighlightedRowIndex(idx)}
                          onClick={() => {
                            setViewingCustomer(item);
                            setHighlightedRowIndex(idx);
                          }}
                        >
                          <td className="px-3 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(item._id)}
                              onChange={() => handleSelectRow(item._id)}
                              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300 cursor-pointer"
                            />
                          </td>
                          <td className="px-3.5 py-2 whitespace-nowrap text-[13px] text-gray-400">{rowNum}</td>
                          {Object.entries(visibleColumns).map(([col, visible]) => {
                            if (!visible || !allColumns[col]) return null;
                            return (
                              <td key={col} className="px-3.5 py-2 whitespace-nowrap text-[13.5px] font-medium text-gray-700">
                                {col === 'firmName' ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-gray-955">{item.firmName || '-'}</span>
                                    {(currentType === 'customer' || currentType === 'vendor') && item.ownerName && (
                                      <span className="text-xs text-gray-455 font-normal mt-0.5">{item.ownerName}</span>
                                    )}
                                  </div>
                                ) : col === 'contactName' ? (
                                  <span className="font-semibold text-gray-955">{item.contactName || item.ownerName || '-'}</span>
                                ) : col === 'name' ? (
                                  <div className="flex flex-col">
                                    {currentType === 'route' ? (
                                      <>
                                        <span className="font-semibold text-gray-955">{item.code || '-'}</span>
                                        {item.name && (
                                          <span className="text-xs text-gray-455 font-normal mt-0.5">{item.name}</span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="font-semibold text-gray-955">{item.name || '-'}</span>
                                    )}
                                  </div>
                                ) : col === 'phone' ? (
                                  <div className="flex items-center space-x-1">
                                    {item.phone ? (
                                      <>
                                        <a
                                          href={`tel:${item.phone.replace(/\D/g, '')}`}
                                          className="text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                                          onClick={e => e.stopPropagation()}
                                          title={`Call ${item.phone}`}
                                        >
                                          {item.phone}
                                        </a>
                                        <a
                                          href={getWhatsAppLink(item.phone)}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={e => e.stopPropagation()}
                                          className="inline-flex items-center"
                                        >
                                          <WhatsAppIcon />
                                        </a>
                                      </>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </div>
                                ) : col === 'route' ? (
                                  item.route ? (
                                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100" title={item.route}>
                                      {getRouteDisplay(item.route, allRoutes)}
                                    </span>
                                  ) : <span className="text-gray-400">-</span>
                                ) : col === 'assignedAgent' ? (
                                  item.assignedAgent ? (
                                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded bg-purple-50 text-purple-700 border border-purple-100">
                                      {item.assignedAgent}
                                    </span>
                                  ) : <span className="text-gray-400">Not Assigned</span>
                                ) : col === 'assignedRoutes' ? (
                                  getAgentRoutesBadges(item.firmName || item.contactName)
                                ) : col === 'citiesCount' || col === 'customersCount' || col === 'customerCount' ? (
                                  <span className="font-medium text-gray-900">{item[col] !== undefined ? item[col] : 0}</span>
                                ) : col === 'creditLimit' ? (
                                  <span className="font-medium text-gray-955">₹{(item.creditLimit || 0).toLocaleString('en-IN')}</span>
                                ) : col === 'outstanding' ? (
                                  <span className={`font-semibold ${(item.outstanding || 0) > 0 ? 'text-red-650' : 'text-green-655'}`}>
                                    ₹{(item.outstanding || 0).toLocaleString('en-IN')}
                                  </span>
                                ) : col === 'customerGrade' ? (
                                  item.customerGrade ? (
                                    <span className={`inline-flex px-2 py-0.5 text-xs font-bold rounded uppercase ${
                                      item.customerGrade.includes('Grade A') ? 'bg-purple-100 text-purple-700' :
                                      item.customerGrade.includes('Grade B') ? 'bg-indigo-100 text-indigo-700' :
                                      'bg-amber-100 text-amber-700'
                                    }`}>
                                      {item.customerGrade.replace(/ \(.+\)/, '').toUpperCase()}
                                    </span>
                                  ) : <span className="text-gray-400">-</span>
                                ) : col === 'status' ? (
                                  <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded uppercase border ${
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
                          <td className="px-3.5 py-1.5 whitespace-nowrap text-right text-xs" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end space-x-1.5 text-[11px]">
                              <button
                                onClick={() => setViewingCustomer(item)}
                                className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors font-semibold shadow-xs"
                              >
                                Profile
                              </button>
                              <button
                                onClick={() => handleEdit(item)}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 border border-gray-200 hover:border-blue-200 transition-colors font-semibold shadow-xs"
                              >
                                <Edit className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDelete(item._id)}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white transition-colors font-semibold shadow-xs"
                              >
                                <Trash2 className="w-3 h-3 text-white" />
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
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 border-b pb-3">
                                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center">
                                    <MapPin className="w-3.5 h-3.5 text-blue-500 mr-1.5" />
                                    Cities/Towns in {item.name} Line ({citiesUnderRoute.length})
                                  </h4>
                                  
                                  <div className="flex items-center gap-3">
                                    {/* Search input for cities inside the region */}
                                    <div className="relative">
                                      <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                                      <input
                                        type="text"
                                        placeholder="Search city..."
                                        value={citySearchText}
                                        onChange={(e) => setCitySearchText(e.target.value)}
                                        className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors w-40"
                                      />
                                    </div>
                                    <button
                                      onClick={() => openInlineModal('market')}
                                      className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1 whitespace-nowrap bg-blue-50/50 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100 transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add New City</span>
                                    </button>
                                  </div>
                                </div>
                                
                                {citiesUnderRoute.length === 0 ? (
                                  <p className="text-xs text-gray-500 italic py-2">No cities mapped to this region yet.</p>
                                ) : (() => {
                                  const filtered = citiesUnderRoute.filter(c => 
                                    c.firmName.toLowerCase().includes(citySearchText.toLowerCase())
                                  );
                                  
                                  if (filtered.length === 0) {
                                    return <p className="text-xs text-gray-500 italic py-2">No cities matching "{citySearchText}" found.</p>;
                                  }

                                  return (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      {filtered.map((city) => (
                                        <div
                                          key={city._id}
                                          onClick={() => openCityCustomersPopup(city.firmName)}
                                          className="p-3.5 border border-gray-100 rounded-lg bg-gray-50/30 flex items-center justify-between hover:border-blue-300 hover:bg-blue-50/10 hover:shadow-xs transition-all cursor-pointer group min-w-0"
                                          title={`Click to view customers in ${city.firmName}`}
                                        >
                                          <div className="min-w-0 flex-1 mr-2">
                                            <span className="font-semibold text-gray-950 text-sm block group-hover:text-blue-600 transition-colors truncate">{city.firmName}</span>
                                            <span className="text-xs text-gray-400 mt-1 font-medium leading-normal block truncate">{city.district || '-'}, {city.state || '-'}</span>
                                          </div>
                                          <div className="text-right flex flex-col items-end">
                                            <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-100 mb-1 group-hover:bg-blue-100 group-hover:text-blue-800 transition-colors">
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
                                  );
                                })()}
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
        <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-gray-200 z-[60] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-900">
              {editingItem ? 'Edit' : 'Add'} {currentType === 'route' && !formData.type ? 'Region' : (formData.type ? (formData.type.charAt(0).toUpperCase() + formData.type.slice(1)) : typeLabel)} Master
            </h2>
            <button onClick={resetForm} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Fields container */}
          <div className="flex-1 overflow-y-auto p-5">
            <form id="partyForm" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-6">
              
              {/* 1. CUSTOMER FORM VIEW */}
              {formData.type === 'customer' && (
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

                    <div className="grid grid-cols-2 gap-3">
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
                        <label className="block text-xs font-medium text-gray-700 mb-1">Alternate Mobile</label>
                        <input
                          type="tel"
                          placeholder="Alternate number"
                          value={formData.altPhone || ''}
                          onChange={e => setFormData({ ...formData, altPhone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                      </div>
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
                      <SearchableDropdown
                        value={formData.city || ''}
                        onChange={val => {
                          const selectedMarket = allMarkets.find(m => m.firmName === val);
                          setFormData({ 
                            ...formData, 
                            city: val,
                            district: selectedMarket?.district || formData.district || '',
                            state: selectedMarket?.state || formData.state || 'Andhra Pradesh'
                          });
                        }}
                        options={allMarkets.map(m => ({ label: m.firmName, value: m.firmName }))}
                        placeholder="Select City"
                        addNewOption={{
                          label: "+ Add New City",
                          onClick: () => openInlineModal('market')
                        }}
                        required
                      />
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
                      <SearchableDropdown
                        value={formData.route || ''}
                        onChange={val => setFormData({ ...formData, route: val })}
                        options={allRoutes.map(r => ({ label: r.name, value: r.name }))}
                        placeholder="Select Region"
                        addNewOption={{
                          label: "+ Add New Region",
                          onClick: () => openInlineModal('route')
                        }}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Agent</label>
                      <SearchableDropdown
                        value={formData.agentAssigned || ''}
                        onChange={val => setFormData({ ...formData, agentAssigned: val })}
                        options={allAgents.map(a => ({ label: a.firmName, value: a.firmName }))}
                        placeholder="Select Agent"
                        addNewOption={{
                          label: "+ Add New Agent",
                          onClick: () => openInlineModal('agent')
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Transport</label>
                      <SearchableDropdown
                        value={formData.preferredTransport || ''}
                        onChange={val => setFormData({ ...formData, preferredTransport: val })}
                        options={allTransporters.map(t => ({ label: t.firmName, value: t.firmName }))}
                        placeholder="Select Transporter"
                        addNewOption={{
                          label: "+ Add New Transporter",
                          onClick: () => openInlineModal('transporter')
                        }}
                      />
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
              {formData.type === 'vendor' && (
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
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Alternate Mobile</label>
                        <input type="tel" placeholder="Alternate mobile" value={formData.altPhone || ''} onChange={e => setFormData({ ...formData, altPhone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
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
                        <SearchableDropdown
                          value={formData.state || ''}
                          onChange={val => setFormData({ ...formData, state: val })}
                          options={statesList.map(s => ({ label: s, value: s }))}
                          placeholder="Select State"
                          required
                        />
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
              {formData.type === 'agent' && (
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
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Alternate Mobile</label>
                        <input type="tel" placeholder="Alternate mobile" value={formData.altPhone || ''} onChange={e => setFormData({ ...formData, altPhone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
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

              {/* 4. REGION FORM VIEW */}
              {formData.type === 'route' && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">Region Details</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Region Name*</label>
                          <input type="text" placeholder="e.g. Andhra Line" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Region Code*</label>
                          <input type="text" placeholder="e.g. A" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Agent</label>
                        <SearchableDropdown
                          value={formData.assignedAgent || ''}
                          onChange={val => setFormData({ ...formData, assignedAgent: val })}
                          options={allAgents.map(agent => ({ label: agent.firmName, value: agent.firmName }))}
                          placeholder="Select Agent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                        <textarea placeholder="Region notes or details" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 5. CITY FORM VIEW */}
              {formData.type === 'market' && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-1">City Details</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">City Name*</label>
                        <input type="text" placeholder="e.g. Nellore" value={formData.firmName || ''} onChange={e => setFormData({ ...formData, firmName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
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
                        <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Region</label>
                        <SearchableDropdown
                          value={formData.route || ''}
                          onChange={val => setFormData({ ...formData, route: val })}
                          options={allRoutes.map(r => ({ label: r.name, value: r.name }))}
                          placeholder="Select Region"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 6. TRANSPORTER FORM VIEW */}
              {formData.type === 'transporter' && (
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
              {formData.type !== 'market' && (
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
              className="px-6 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-1.5"
            >
              Cancel
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200 shadow-xs select-none pointer-events-none">Esc</kbd>
            </button>
          </div>
        </div>
      )}

      {/* Activity Log slide-out modal */}
      {showActivityLog && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowActivityLog(false)}></div>
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
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex justify-between items-center">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl flex flex-col border border-gray-150 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 capitalize">
                Add New {inlineModalType === 'market' ? 'City' : inlineModalType === 'route' ? 'Region' : inlineModalType}
              </h2>
              <button onClick={() => setInlineModalType(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleInlineSave} onKeyDown={handleFormKeyDown} className="p-6 space-y-4">
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
                    <SearchableDropdown
                      value={inlineRouteData.assignedAgent}
                      onChange={val => setInlineRouteData({ ...inlineRouteData, assignedAgent: val })}
                      options={allAgents.map(agent => ({ label: agent.firmName, value: agent.firmName }))}
                      placeholder="Select Agent"
                    />
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
                    <SearchableDropdown
                      value={inlineMarketData.route}
                      onChange={val => setInlineMarketData({ ...inlineMarketData, route: val })}
                      options={allRoutes.map(r => ({ label: r.name, value: r.name }))}
                      placeholder="Select Region"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Assigned Agent</label>
                    <SearchableDropdown
                      value={inlineMarketData.agentAssigned}
                      onChange={val => setInlineMarketData({ ...inlineMarketData, agentAssigned: val })}
                      options={allAgents.map(a => ({ label: a.firmName, value: a.firmName }))}
                      placeholder="Select Agent"
                    />
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
      {viewingCustomer && !showForm && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-gray-200 z-40 flex flex-col transition-all duration-300 animate-in slide-in-from-right">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-gray-900 truncate">
                  {currentType === 'route' ? (viewingCustomer.code ? `${viewingCustomer.code} (${viewingCustomer.name})` : viewingCustomer.name) : (viewingCustomer.firmName || viewingCustomer.contactName)}
                </h2>
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full uppercase border ${
                  viewingCustomer.status === 'active' ? 'bg-green-50 border-green-200 text-green-700' :
                  viewingCustomer.status === 'inactive' ? 'bg-red-50 border-red-200 text-red-700' :
                  'bg-yellow-50 border-yellow-200 text-yellow-755'
                }`}>
                  {viewingCustomer.status || 'active'}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono mt-1">
                {typeLabel} Code: <span className="font-semibold text-blue-600">{viewingCustomer.code || viewingCustomer._id?.slice(-6).toUpperCase() || 'N/A'}</span>
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
                  }}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-lg border border-blue-200 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Profile</span>
                  <kbd className="ml-1 px-1.5 py-0.5 text-[9px] font-mono font-bold text-blue-500 bg-blue-100 rounded border border-blue-200 select-none pointer-events-none">Alt+E</kbd>
                </button>
                <button
                  onClick={() => handleDelete(viewingCustomer._id)}
                  className="flex items-center justify-center space-x-2 p-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                  <span>Delete</span>
                  <kbd className="ml-1 px-1.5 py-0.5 text-[9px] font-mono font-bold text-red-100 bg-red-800 rounded border border-red-700 select-none pointer-events-none">Alt+D</kbd>
                </button>
                
                {currentType === 'customer' && (
                  <>
                    <button
                      onClick={() => showAlert('Customer History / Visit feature is coming soon!', 'info')}
                      className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                    >
                      <History className="w-4 h-4 text-gray-450" />
                      <span>History / Visit</span>
                    </button>
                    <button
                      onClick={() => showAlert('Ledger report will be generated shortly!', 'info')}
                      className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                    >
                      <BookOpen className="w-4 h-4 text-gray-450" />
                      <span>Ledger</span>
                    </button>
                    <button
                      onClick={() => showAlert('Record Payment feature is coming soon!', 'info')}
                      className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                    >
                      <CreditCard className="w-4 h-4 text-gray-450" />
                      <span>Payment</span>
                    </button>
                    <button
                      onClick={() => {
                        navigate(`/sales/quotes?customerId=${viewingCustomer._id}`);
                      }}
                      className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-gray-450" />
                      <span>Quotation</span>
                    </button>
                    <button
                      onClick={() => {
                        navigate(`/sales/orders?customerId=${viewingCustomer._id}`);
                      }}
                      className="flex items-center justify-center space-x-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 transition-colors"
                    >
                      <ShoppingCart className="w-4 h-4 text-gray-450" />
                      <span>Sale Order</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 1. CUSTOMER CARD VIEW */}
            {currentType === 'customer' && (
              <>
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
                      <div className="flex items-center space-x-1.5">
                        {viewingCustomer.phone ? (
                          <>
                            <a
                              href={`tel:${viewingCustomer.phone.replace(/\D/g, '')}`}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Call ${viewingCustomer.phone}`}
                            >
                              {viewingCustomer.phone}
                            </a>
                            <a
                              href={getWhatsAppLink(viewingCustomer.phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center"
                            >
                              <WhatsAppIcon />
                            </a>
                          </>
                        ) : (
                          <span className="font-semibold text-gray-900">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Alternate Mobile</span>
                      <div className="flex items-center space-x-1.5">
                        {viewingCustomer.altPhone ? (
                          <>
                            <a
                              href={`tel:${viewingCustomer.altPhone.replace(/\D/g, '')}`}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Call ${viewingCustomer.altPhone}`}
                            >
                              {viewingCustomer.altPhone}
                            </a>
                            <a
                              href={getWhatsAppLink(viewingCustomer.altPhone)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center"
                            >
                              <WhatsAppIcon />
                            </a>
                          </>
                        ) : (
                          <span className="font-semibold text-gray-900">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Email ID</span>
                      {viewingCustomer.email ? (
                        <a
                          href={`mailto:${viewingCustomer.email}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline truncate block"
                          title={`Email ${viewingCustomer.email}`}
                        >
                          {viewingCustomer.email}
                        </a>
                      ) : (
                        <span className="font-semibold text-gray-900 block truncate">-</span>
                      )}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">GST Number</span>
                      <span className="font-semibold text-gray-900">{viewingCustomer.gstNumber || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Aadhar Number</span>
                      <span className="font-semibold text-gray-900">{viewingCustomer.aadharNumber || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Address Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-500" /> Address Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Door / Flat No.</span>
                      <span className="font-semibold text-gray-900">{viewingCustomer.doorNo || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Street Name</span>
                      <span className="font-semibold text-gray-900">{viewingCustomer.streetName || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-xs text-gray-400 font-medium">Address Line 1</span>
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

                {/* Business Details Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-gray-500" /> Business Details
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Assigned Region</span>
                      <span className="inline-flex px-2 py-0.5 mt-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-150">
                        {viewingCustomer.route || 'No Region'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Assigned Agent</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.agentAssigned || 'No Agent'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Credit Days Limit</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.creditDays || 0} Days</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Credit Limit</span>
                      <span className="font-semibold text-gray-905">₹{(viewingCustomer.creditLimit || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-xs text-gray-400 font-medium">Preferred Transport</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.preferredTransport || 'Direct Delivery'}</span>
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
                        <p className="text-xs text-gray-605 bg-white border border-gray-150 rounded-lg p-2 mt-1 leading-relaxed whitespace-pre-line font-medium">
                          {viewingCustomer.remarks}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Attached Photos */}
                {(viewingCustomer.customerPhoto || viewingCustomer.shopPhoto) && (
                  <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-gray-500" /> Attached Photos
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingCustomer.customerPhoto && (
                        <div className="space-y-1">
                          <span className="block text-xs text-gray-400 font-medium">Customer Photo</span>
                          <div className="border border-gray-200 rounded-lg p-1.5 bg-white">
                            <img src={viewingCustomer.customerPhoto} alt="Customer" className="max-h-32 mx-auto rounded object-cover" />
                          </div>
                        </div>
                      )}
                      {viewingCustomer.shopPhoto && (
                        <div className="space-y-1">
                          <span className="block text-xs text-gray-400 font-medium">Shop Photo</span>
                          <div className="border border-gray-200 rounded-lg p-1.5 bg-white">
                            <img src={viewingCustomer.shopPhoto} alt="Shop" className="max-h-32 mx-auto rounded object-cover" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 2. VENDOR CARD VIEW */}
            {currentType === 'vendor' && (
              <>
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
                      <div className="flex items-center space-x-1.5">
                        {viewingCustomer.phone ? (
                          <>
                            <a
                              href={`tel:${viewingCustomer.phone.replace(/\D/g, '')}`}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Call ${viewingCustomer.phone}`}
                            >
                              {viewingCustomer.phone}
                            </a>
                            <a
                              href={getWhatsAppLink(viewingCustomer.phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center"
                            >
                              <WhatsAppIcon />
                            </a>
                          </>
                        ) : (
                          <span className="font-semibold text-gray-900">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Alternate Mobile</span>
                      <div className="flex items-center space-x-1.5">
                        {viewingCustomer.altPhone ? (
                          <>
                            <a
                              href={`tel:${viewingCustomer.altPhone.replace(/\D/g, '')}`}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Call ${viewingCustomer.altPhone}`}
                            >
                              {viewingCustomer.altPhone}
                            </a>
                            <a
                              href={getWhatsAppLink(viewingCustomer.altPhone)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center"
                            >
                              <WhatsAppIcon />
                            </a>
                          </>
                        ) : (
                          <span className="font-semibold text-gray-900">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Email ID</span>
                      {viewingCustomer.email ? (
                        <a
                          href={`mailto:${viewingCustomer.email}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline truncate block"
                          title={`Email ${viewingCustomer.email}`}
                        >
                          {viewingCustomer.email}
                        </a>
                      ) : (
                        <span className="font-semibold text-gray-900 block truncate">-</span>
                      )}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">GST Number</span>
                      <span className="font-semibold text-gray-900">{viewingCustomer.gstNumber || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Aadhar Number</span>
                      <span className="font-semibold text-gray-900">{viewingCustomer.aadharNumber || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Address Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-500" /> Address Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Door / Flat No.</span>
                      <span className="font-semibold text-gray-900">{viewingCustomer.doorNo || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Street Name</span>
                      <span className="font-semibold text-gray-900">{viewingCustomer.streetName || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-xs text-gray-400 font-medium">Address Line 1</span>
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
                  </div>
                </div>

                {/* Business Details Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-gray-500" /> Business Details
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Opening Balance</span>
                      <span className="font-semibold text-gray-905">₹{(viewingCustomer.openingBalance || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Outstanding Balance</span>
                      <span className={`font-semibold ${(viewingCustomer.outstanding || 0) > 0 ? 'text-red-650' : 'text-green-655'}`}>
                        ₹{(viewingCustomer.outstanding || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    {viewingCustomer.remarks && (
                      <div className="col-span-2">
                        <span className="block text-xs text-gray-400 font-medium">Remarks / Instructions</span>
                        <p className="text-xs text-gray-605 bg-white border border-gray-150 rounded-lg p-2 mt-1 leading-relaxed whitespace-pre-line font-medium">
                          {viewingCustomer.remarks}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 3. AGENT CARD VIEW */}
            {currentType === 'agent' && (
              <>
                {/* Basic Info Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-gray-500" /> Basic Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Agent Name</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.firmName || viewingCustomer.contactName || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Mobile Number</span>
                      <div className="flex items-center space-x-1.5">
                        {viewingCustomer.phone ? (
                          <>
                            <a
                              href={`tel:${viewingCustomer.phone.replace(/\D/g, '')}`}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Call ${viewingCustomer.phone}`}
                            >
                              {viewingCustomer.phone}
                            </a>
                            <a
                              href={getWhatsAppLink(viewingCustomer.phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center"
                            >
                              <WhatsAppIcon />
                            </a>
                          </>
                        ) : (
                          <span className="font-semibold text-gray-905">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Alternate Mobile</span>
                      <div className="flex items-center space-x-1.5">
                        {viewingCustomer.altPhone ? (
                          <>
                            <a
                              href={`tel:${viewingCustomer.altPhone.replace(/\D/g, '')}`}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Call ${viewingCustomer.altPhone}`}
                            >
                              {viewingCustomer.altPhone}
                            </a>
                            <a
                              href={getWhatsAppLink(viewingCustomer.altPhone)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center"
                            >
                              <WhatsAppIcon />
                            </a>
                          </>
                        ) : (
                          <span className="font-semibold text-gray-905">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Email ID</span>
                      {viewingCustomer.email ? (
                        <a
                          href={`mailto:${viewingCustomer.email}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline truncate block"
                          title={`Email ${viewingCustomer.email}`}
                        >
                          {viewingCustomer.email}
                        </a>
                      ) : (
                        <span className="font-semibold text-gray-905 block truncate">-</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Assigned Routes Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-500" /> Assigned Regions
                  </h3>
                  <div className="pt-1">
                    {getAgentRoutesBadges(viewingCustomer.firmName || viewingCustomer.contactName)}
                  </div>
                </div>
              </>
            )}

            {/* 4. ROUTE (Region) CARD VIEW */}
            {currentType === 'route' && (
              <>
                {/* Basic Info Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-500" /> Region Details
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Region Name</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.name || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Region Code</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.code || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-xs text-gray-400 font-medium">Assigned Agent</span>
                      {viewingCustomer.assignedAgent ? (
                        <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-md bg-purple-50 text-purple-755 border border-purple-100 mt-1">
                          {viewingCustomer.assignedAgent}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-semibold block mt-1">Not Assigned</span>
                      )}
                    </div>
                    {viewingCustomer.description && (
                      <div className="col-span-2">
                        <span className="block text-xs text-gray-400 font-medium">Description</span>
                        <p className="text-xs text-gray-605 bg-white border border-gray-150 rounded-lg p-2 mt-1 leading-relaxed">
                      {viewingCustomer.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cities in Region Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <div className="flex justify-between items-center border-b pb-1.5">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-gray-500" /> Cities in Region
                    </h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openInlineModal('market', { route: viewingCustomer.name })}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-805 transition-colors flex items-center gap-0.5 border border-blue-250 bg-blue-50/50 hover:bg-blue-50 px-2 py-0.5 rounded-md"
                      >
                        <Plus className="w-3 h-3" /> Add City
                      </button>
                      <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                        {allMarkets.filter(m => m.route === viewingCustomer.name).length} Total
                      </span>
                    </div>
                  </div>

                  {/* Search Input for cities in this region */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                    <input
                      type="text"
                      placeholder="Search cities in this region..."
                      value={regionCitySearchText}
                      onChange={(e) => setRegionCitySearchText(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors"
                    />
                    {regionCitySearchText && (
                      <button
                        type="button"
                        onClick={() => setRegionCitySearchText('')}
                        className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-650"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-[340px] overflow-y-auto pr-1">
                    {(() => {
                      const citiesUnderRoute = [...allMarkets]
                        .filter(m => m.route === viewingCustomer.name)
                        .sort((a, b) => (a.firmName || '').localeCompare(b.firmName || ''));
                      const filteredCities = citiesUnderRoute.filter(c =>
                        (c.firmName || '').toLowerCase().includes(regionCitySearchText.toLowerCase())
                      );

                      if (citiesUnderRoute.length === 0) {
                        return <p className="text-xs text-gray-400 italic text-center py-4">No cities mapped to this region yet.</p>;
                      }

                      if (filteredCities.length === 0) {
                        return <p className="text-xs text-gray-400 italic text-center py-4">No matching cities found.</p>;
                      }

                      return (
                        <div className="grid grid-cols-2 gap-2">
                          {filteredCities.map((city) => (
                            <div
                              key={city._id}
                              onClick={() => openCityCustomersPopup(city.firmName)}
                              className="p-3 border border-gray-200 hover:border-blue-400 rounded-xl bg-white flex flex-col justify-between hover:shadow-xs hover:bg-blue-50/5 transition-all cursor-pointer group min-w-0"
                              title={`Click to view customers in ${city.firmName}`}
                            >
                              <div className="mb-2 min-w-0">
                                <span className="font-bold text-gray-955 text-sm block group-hover:text-blue-600 transition-colors truncate">
                                  {city.firmName}
                                </span>
                                <span className="text-[11px] text-gray-450 font-medium block truncate mt-1 leading-normal">
                                  {city.district || '-'}, {city.state || '-'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 shrink-0">
                                <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                                  city.status === 'active'
                                    ? 'bg-green-50 text-green-755 border border-green-150'
                                    : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {city.status || 'active'}
                                </span>
                                <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-100 group-hover:bg-blue-100 transition-colors">
                                  {city.customerCount || 0} Custs
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}

            {/* 5. CITY (Market) CARD VIEW */}
            {currentType === 'market' && (
              <>
                {/* Basic Info Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-gray-500" /> City Details
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">City Name</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.firmName || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">District</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.district || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">State</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.state || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Assigned Region</span>
                      <span className="inline-flex px-2 py-0.5 mt-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-150">
                        {viewingCustomer.route || 'No Region'}
                      </span>
                    </div>
                    {viewingCustomer.agentAssigned && (
                      <div className="col-span-2">
                        <span className="block text-xs text-gray-400 font-medium">Assigned Agent</span>
                        <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-md bg-purple-50 text-purple-755 border border-purple-100 mt-1">
                          {viewingCustomer.agentAssigned}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer Information Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-gray-500" /> Mapped Customers
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-650 font-medium">Total Customers in City:</span>
                      <span className="font-bold text-gray-909 text-lg">{viewingCustomer.customerCount || 0}</span>
                    </div>
                    <button
                      onClick={handleAddCustomerToCity}
                      className="flex items-center justify-center space-x-2 w-full p-2.5 bg-green-50 hover:bg-green-100 text-green-755 rounded-lg border border-green-200 text-xs font-semibold transition-colors"
                    >
                      <Plus className="w-4 h-4 text-green-600" />
                      <span>Add Customer to City</span>
                    </button>
                    <button
                      onClick={() => openCityCustomersPopup(viewingCustomer.firmName)}
                      className="flex items-center justify-center space-x-2 w-full p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-205 text-xs font-semibold transition-colors"
                    >
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>View Customers in {viewingCustomer.firmName}</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* 6. TRANSPORTER CARD VIEW */}
            {currentType === 'transporter' && (
              <>
                {/* Basic Info Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-gray-500" /> Transporter Details
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Transporter Name</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.firmName || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Contact Person</span>
                      <span className="font-semibold text-gray-905">{viewingCustomer.contactName || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Mobile Number</span>
                      <div className="flex items-center space-x-1.5">
                        {viewingCustomer.phone ? (
                          <>
                            <a
                              href={`tel:${viewingCustomer.phone.replace(/\D/g, '')}`}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Call ${viewingCustomer.phone}`}
                            >
                              {viewingCustomer.phone}
                            </a>
                            <a
                              href={getWhatsAppLink(viewingCustomer.phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center"
                            >
                              <WhatsAppIcon />
                            </a>
                          </>
                        ) : (
                          <span className="font-semibold text-gray-905">-</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 font-medium">Email Address</span>
                      {viewingCustomer.email ? (
                        <a
                          href={`mailto:${viewingCustomer.email}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline truncate block"
                          title={`Email ${viewingCustomer.email}`}
                        >
                          {viewingCustomer.email}
                        </a>
                      ) : (
                        <span className="font-semibold text-gray-905 block truncate">-</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Location Information Section */}
                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-500" /> Location Information
                  </h3>
                  <div className="text-sm">
                    <span className="block text-xs text-gray-400 font-medium">City / Town</span>
                    <span className="font-semibold text-gray-905">{viewingCustomer.city || '-'}</span>
                  </div>
                </div>
              </>
            )}

            {/* Timestamps */}
            <div className="text-[10px] text-gray-400 text-center space-x-4 pt-4 border-t">
              {viewingCustomer.createdAt && <span>Created: {new Date(viewingCustomer.createdAt).toLocaleString()}</span>}
              {viewingCustomer.createdAt && viewingCustomer.updatedAt && <span>•</span>}
              {viewingCustomer.updatedAt && <span>Updated: {new Date(viewingCustomer.updatedAt).toLocaleString()}</span>}
            </div>
          </div>
        </div>
      )}

      {/* City Customers Popup Modal */}
      {selectedCityName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-100">
          <div className="relative bg-white rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[85vh] border border-gray-150 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Customers in {selectedCityName}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Showing customers registered under this city</p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleAddCustomerFromModal}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Customer</span>
                </button>
                <button
                  onClick={() => setSelectedCityName(null)}
                  className="text-gray-400 hover:text-gray-650 transition-colors p-1.5 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-gray-100 bg-white">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search customer by name, phone, agent..."
                  value={cityCustomersSearchText}
                  onChange={(e) => setCityCustomersSearchText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
                />
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              {cityCustomersLoading ? (
                <div className="flex flex-col justify-center items-center h-48 text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                  <span>Loading customers...</span>
                </div>
              ) : (
                (() => {
                  const filtered = cityCustomers.filter(c => {
                    const search = cityCustomersSearchText.toLowerCase();
                    return (
                      (c.firmName || '').toLowerCase().includes(search) ||
                      (c.contactName || '').toLowerCase().includes(search) ||
                      (c.ownerName || '').toLowerCase().includes(search) ||
                      (c.phone || '').toLowerCase().includes(search) ||
                      (c.agentAssigned || '').toLowerCase().includes(search)
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12 text-gray-450">
                        <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="font-semibold text-gray-800">No customers found</p>
                        <p className="text-sm text-gray-400 mt-1">Try updating your search query or check data files.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="border border-gray-150 rounded-xl overflow-x-auto shadow-xs">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Firm Name</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Mobile Number</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Region</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Agent Assigned</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {filtered.map((cust) => (
                            <tr key={cust._id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-semibold text-gray-900 text-[13.5px] leading-tight">{cust.firmName || '-'}</span>
                                  {cust.ownerName && cust.ownerName !== cust.firmName && (
                                    <span className="text-xs text-gray-450 font-normal leading-normal">{cust.ownerName}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-[13.5px] text-gray-700">
                                {cust.phone ? (
                                  <a
                                    href={`tel:${cust.phone.replace(/\D/g, '')}`}
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                                    title={`Call ${cust.phone}`}
                                  >
                                    {cust.phone}
                                  </a>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-[13.5px] text-gray-700">
                                {cust.route ? (
                                  <span className="inline-flex px-2 py-0.5 font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    {cust.route}
                                  </span>
                                ) : (
                                  <span className="text-gray-455">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-[13.5px] text-gray-700">
                                {cust.agentAssigned ? (
                                  <span className="inline-flex px-2 py-0.5 font-semibold rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                                    {cust.agentAssigned}
                                  </span>
                                ) : (
                                  <span className="text-gray-455">None</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded uppercase border ${
                                  cust.status === 'active' ? 'bg-green-50 border-green-200 text-green-700' :
                                  cust.status === 'inactive' ? 'bg-gray-50 border-gray-200 text-gray-500' :
                                  'bg-yellow-50 border-yellow-250 text-yellow-755'
                                }`}>
                                  {cust.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl text-right">
              <button
                onClick={() => setSelectedCityName(null)}
                className="px-5 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium text-sm transition-colors shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal Popup (Keyboard/Mouse controlled) */}
      {customConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-100">
          <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-gray-150 animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto animate-bounce" />

            <div>
              <h3 className="text-base font-bold text-gray-900 uppercase tracking-wider">
                Confirm Action
              </h3>
              <p className="text-sm text-gray-600 mt-2 font-medium leading-relaxed whitespace-pre-wrap">{customConfirm.message}</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCustomConfirm(null);
                }}
                className="flex-1 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors font-semibold text-sm shadow-xs focus:ring-2 focus:ring-gray-350 focus:outline-none cursor-pointer flex items-center justify-center gap-1.5"
              >
                Cancel
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200 shadow-xs select-none pointer-events-none">Esc</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  customConfirm.onConfirm();
                  setCustomConfirm(null);
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-xs focus:ring-2 focus:ring-red-500 focus:outline-none cursor-pointer flex items-center justify-center gap-1.5"
                autoFocus
              >
                Delete
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-red-100 bg-red-800 rounded border border-red-700 shadow-xs select-none pointer-events-none">Enter</kbd>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal Popup (Tally-like enter button close) */}
      {customAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-100">
          <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-gray-150 animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            {customAlert.type === 'error' && <XCircle className="w-12 h-12 text-red-500 mx-auto" />}
            {customAlert.type === 'success' && <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />}
            {customAlert.type === 'warning' && <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />}
            {customAlert.type === 'info' && <Building className="w-12 h-12 text-blue-500 mx-auto" />}

            <div>
              <h3 className="text-base font-bold text-gray-955 uppercase tracking-wider">
                {customAlert.type === 'error' ? 'Error' : customAlert.type === 'success' ? 'Success' : customAlert.type === 'warning' ? 'Warning' : 'Notification'}
              </h3>
              <p className="text-sm text-gray-600 mt-2 font-medium leading-relaxed whitespace-pre-wrap">{customAlert.message}</p>
            </div>

            <button
              type="button"
              onClick={() => setCustomAlert(null)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-xs focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer flex items-center justify-center gap-1.5"
              autoFocus
            >
              OK
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-blue-100 bg-blue-800 rounded border border-blue-700 shadow-xs select-none pointer-events-none">Enter</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartyManagement;