import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, 
  X, 
  Home, 
  Users, 
  Package, 
  ShoppingCart, 
  LogOut, 
  Building2,
  ChevronDown,
  Database,
  ArrowDownToLine,
  BarChart3,
  Warehouse,
  LayoutGrid,
  Layers,
  Store,
  Briefcase,
  Compass,
  MapPin,
  Truck,
  ArrowRightLeft,
  FileText,
  Coins,
  RefreshCw,
  Settings
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DataManager from './DataManager';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [mastersOpen, setMastersOpen] = useState(() => 
    ['/inventory-v2/skus', '/party/customers', '/party/agents', '/party/routes', '/party/markets', '/party/transporters'].includes(window.location.pathname)
  );
  const [purchaseOpen, setPurchaseOpen] = useState(() => 
    ['/inventory-v2/purchases', '/party/vendors'].includes(window.location.pathname)
  );
  const [inventoryOpen, setInventoryOpen] = useState(() => 
    ['/inventory-v2/batch-stock', '/inventory-v2/warehouse'].includes(window.location.pathname) || (window.location.pathname === '/inventory-v2/ledger' && !document.referrer.includes('purchase'))
  );
  const [conversionsOpen, setConversionsOpen] = useState(() => 
    ['/inventory/bom', '/inventory/movements', '/inventory-v2/testing-transactions'].includes(window.location.pathname)
  );
  const [productionOpen, setProductionOpen] = useState(() => 
    ['/inventory/dashboard', '/inventory/analytics'].includes(window.location.pathname)
  );
  const [salesOpen, setSalesOpen] = useState(() => 
    window.location.pathname.startsWith('/sales') && window.location.pathname !== '/sales/reports'
  );
  const [reportsOpen, setReportsOpen] = useState(() => 
    ['/sales/reports', '/inventory/reports', '/analyzer', '/transactions'].includes(window.location.pathname)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDataManager, setShowDataManager] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission, hasRole, selectedCompany } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut triggering if user is actively typing in text field
      const activeEl = document.activeElement;
      if (
        activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable
        )
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const isAltPressed = e.altKey;
      const isSimplePress = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;

      if (isAltPressed || isSimplePress) {
        switch (key) {
          case 'escape':
            setShowDataManager(false);
            break;
          case 'd':
            e.preventDefault();
            handleNavigate('/dashboard');
            break;
          case 'i':
            e.preventDefault();
            handleNavigate('/inventory-v2/skus');
            break;
          case 'c':
            e.preventDefault();
            handleNavigate('/party/customers');
            break;
          case 'v':
            e.preventDefault();
            handleNavigate('/party/vendors');
            break;
          case 'a':
            e.preventDefault();
            handleNavigate('/party/agents');
            break;
          case 'r':
            e.preventDefault();
            handleNavigate('/party/routes');
            break;
          case 'y':
            e.preventDefault();
            handleNavigate('/party/markets');
            break;
          case 't':
            e.preventDefault();
            handleNavigate('/party/transporters');
            break;
          case 'h':
            e.preventDefault();
            handleNavigate('/inventory/dashboard');
            break;
          case 'k':
            e.preventDefault();
            handleNavigate('/inventory/skus');
            break;
          case 'b':
            e.preventDefault();
            handleNavigate('/inventory/bom');
            break;
          case 'z':
            e.preventDefault();
            handleNavigate('/inventory/zones');
            break;
          case 'm':
            e.preventDefault();
            handleNavigate('/inventory/movements');
            break;
          case 'n':
            e.preventDefault();
            handleNavigate('/inventory/analytics');
            break;
          case 'p':
            e.preventDefault();
            handleNavigate('/inventory/reports');
            break;
          case 'g':
            e.preventDefault();
            setShowDataManager(true);
            break;
          case 'x':
            e.preventDefault();
            handleNavigate('/transactions');
            break;
          case 'l':
            e.preventDefault();
            handleNavigate('/analyzer');
            break;
          case 's':
            e.preventDefault();
            handleNavigate('/company-selection');
            break;
          case '1':
            if (isAltPressed) { e.preventDefault(); handleNavigate('/party/customers'); }
            break;
          case '2':
            if (isAltPressed) { e.preventDefault(); handleNavigate('/party/vendors'); }
            break;
          case '3':
            if (isAltPressed) { e.preventDefault(); handleNavigate('/party/agents'); }
            break;
          case '4':
            if (isAltPressed) { e.preventDefault(); handleNavigate('/party/routes'); }
            break;
          case '5':
            if (isAltPressed) { e.preventDefault(); handleNavigate('/party/markets'); }
            break;
          case '6':
            if (isAltPressed) { e.preventDefault(); handleNavigate('/party/transporters'); }
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, selectedCompany]);

  const handleNavigate = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const isActive = (path: string) => {
    if (path.includes('?')) {
      const [pathName, searchPart] = path.split('?');
      return location.pathname === pathName && location.search.includes(searchPart);
    }
    return location.pathname === path;
  };

  // Masters
  const mastersItems = [
    { label: 'Item Master', path: '/inventory-v2/skus', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'Customers', path: '/party/customers', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { label: 'Agents', path: '/party/agents', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { label: 'Regions', path: '/party/routes', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { label: 'Cities', path: '/party/markets', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { label: 'Transporters', path: '/party/transporters', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
  ];
  const visibleMastersItems = mastersItems.filter(item => hasPermission(item.permission));
  const hasMastersAccess = visibleMastersItems.length > 0;
  const isMastersActive = () => ['/inventory-v2/skus', '/party/customers', '/party/agents', '/party/routes', '/party/markets', '/party/transporters'].includes(location.pathname);

  // Purchase
  const purchaseItems = [
    { label: 'Purchase Batches', path: '/inventory-v2/purchases', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'Suppliers', path: '/party/vendors', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { label: 'Purchase Ledger', path: '/inventory-v2/ledger?mode=purchase', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
  ];
  const visiblePurchaseItems = purchaseItems.filter(item => hasPermission(item.permission));
  const hasPurchaseAccess = visiblePurchaseItems.length > 0;
  const isPurchaseActive = () => ['/inventory-v2/purchases', '/party/vendors'].includes(location.pathname) || (location.pathname === '/inventory-v2/ledger' && location.search.includes('mode=purchase'));

  // Inventory
  const inventoryV2Items = [
    { label: 'Batch Stock / Lots', path: '/inventory-v2/batch-stock', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'Stock Ledger', path: '/inventory-v2/ledger?mode=stock', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'Warehouse Setup', path: '/inventory-v2/warehouse', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
  ];
  const visibleInventoryV2Items = inventoryV2Items.filter(item => hasPermission(item.permission));
  const hasInventoryV2Access = visibleInventoryV2Items.length > 0;
  const isInventoryV2Active = () => ['/inventory-v2/batch-stock', '/inventory-v2/warehouse'].includes(location.pathname) || (location.pathname === '/inventory-v2/ledger' && location.search.includes('mode=stock'));

  // Conversions
  const conversionsItems = [
    { label: 'BOM & Assembly', path: '/inventory/bom', permission: ['MANAGE_INVENTORY', 'MANAGE_ITEMS'] },
    { label: 'Movements', path: '/inventory/movements', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'Transactions (Test)', path: '/inventory-v2/testing-transactions', permission: ['MANAGE_INVENTORY', 'MANAGE_ITEMS'] },
  ];
  const visibleConversionsItems = conversionsItems.filter(item => hasPermission(item.permission));
  const hasConversionsAccess = visibleConversionsItems.length > 0;
  const isConversionsActive = () => ['/inventory/bom', '/inventory/movements', '/inventory-v2/testing-transactions'].includes(location.pathname);

  // Production
  const productionItems = [
    { label: 'Mfg Dashboard', path: '/inventory/dashboard', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'Mfg Analytics', path: '/inventory/analytics', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY'] },
  ];
  const visibleProductionItems = productionItems.filter(item => hasPermission(item.permission));
  const hasProductionAccess = visibleProductionItems.length > 0;
  const isProductionActive = () => ['/inventory/dashboard', '/inventory/analytics'].includes(location.pathname);

  // Sales
  const salesItems = [
    { label: 'Quotes', path: '/sales/quotes', permission: ['MANAGE_QUOTES', 'VIEW_QUOTES', 'CREATE_QUOTES'] },
    { label: 'Sale Orders', path: '/sales/orders', permission: ['MANAGE_ORDERS', 'VIEW_ORDERS', 'CREATE_ORDERS'] },
    { label: 'Pending Orders', path: '/sales/pending', permission: ['MANAGE_ORDERS', 'VIEW_ORDERS'] },
    { label: 'Delivery Challan', path: '/sales/delivery-challan', permission: ['MANAGE_DELIVERY', 'VIEW_DELIVERY'] },
    { label: 'Digital Dispatch', path: '/sales/digital-dispatch', permission: 'MANAGE_DISPATCH' },
  ];
  const visibleSalesItems = salesItems.filter(item => hasPermission(item.permission));
  const hasSalesAccess = visibleSalesItems.length > 0;
  const isSalesActive = () => location.pathname.startsWith('/sales') && location.pathname !== '/sales/reports';

  // Reports
  const reportsItems = [
    { label: 'Sales Reports', path: '/sales/reports', permission: ['MANAGE_REPORTS', 'VIEW_REPORTS'] },
    { label: 'Mfg Reports', path: '/inventory/reports', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY'] },
    { label: 'Analyzer', path: '/analyzer', permission: ['MANAGE_REPORTS', 'VIEW_REPORTS'] },
    { label: 'Transactions', path: '/transactions', permission: ['MANAGE_REPORTS', 'VIEW_REPORTS', 'VIEW_TRANSACTIONS'] },
  ];
  const visibleReportsItems = reportsItems.filter(item => hasPermission(item.permission));
  const hasReportsAccess = visibleReportsItems.length > 0;
  const isReportsActive = () => ['/sales/reports', '/inventory/reports', '/analyzer', '/transactions'].includes(location.pathname);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'manager': return 'bg-blue-100 text-blue-700';
      case 'sales': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getPrimaryClass = (path: string) => {
    const active = isActive(path);
    return `w-full flex items-center space-x-3 px-3 py-2.5 transition-all duration-150 rounded-lg text-sm font-semibold ${
      active
        ? 'bg-blue-50/70 text-blue-600'
        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
    }`;
  };

  const getDropdownPrimaryClass = (activeCondition: boolean) => {
    return `w-full flex items-center justify-between px-3 py-2.5 transition-all duration-150 rounded-lg text-sm font-semibold ${
      activeCondition
        ? 'bg-blue-50/70 text-blue-600'
        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
    }`;
  };

  const getSubItemClass = (path: string) => {
    const active = isActive(path);
    return `w-full text-left px-4 py-2 transition-all duration-150 text-[13px] rounded-md font-semibold ${
      active
        ? 'bg-blue-50/70 text-blue-600'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`;
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 md:relative md:z-0
        ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64 md:translate-x-0 md:w-16'}
        bg-white shadow-lg transition-all duration-300 flex flex-col h-full overflow-hidden
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0 shadow-sm border border-blue-500/20">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-sm leading-tight">SKBW CORE</h2>
                  <p className="text-[11px] text-gray-500 font-medium leading-tight">Sri Krishna Binding Works</p>
                </div>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {/* Dashboard */}
          <button
            onClick={() => handleNavigate('/dashboard')}
            className={`${getPrimaryClass('/dashboard')} flex items-center justify-between`}
          >
            <div className="flex items-center space-x-3">
              <Home className={`w-5 h-5 ${isActive('/dashboard') ? 'text-blue-600' : 'text-gray-500'}`} />
              {sidebarOpen && <span className={isActive('/dashboard') ? 'text-blue-700 font-bold' : 'text-gray-700'}>Dashboard</span>}
            </div>
          </button>

          {/* Masters Dropdown */}
          {hasMastersAccess && (
            <div>
              <button
                onClick={() => setMastersOpen(!mastersOpen)}
                className={getDropdownPrimaryClass(isMastersActive() || mastersOpen)}
              >
                <div className="flex items-center space-x-3">
                  <Package className={`w-5 h-5 ${(isMastersActive() || mastersOpen) ? 'text-blue-600' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className={(isMastersActive() || mastersOpen) ? 'text-blue-700 font-bold' : 'text-gray-700'}>Masters</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${mastersOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
                )}
              </button>
              
              {mastersOpen && sidebarOpen && (
                <div className="mt-1 ml-4 pl-2 border-l border-gray-150 space-y-0.5 animate-in fade-in duration-100">
                  {visibleMastersItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={getSubItemClass(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Purchase Dropdown */}
          {hasPurchaseAccess && (
            <div>
              <button
                onClick={() => setPurchaseOpen(!purchaseOpen)}
                className={getDropdownPrimaryClass(isPurchaseActive() || purchaseOpen)}
              >
                <div className="flex items-center space-x-3">
                  <LayoutGrid className={`w-5 h-5 ${(isPurchaseActive() || purchaseOpen) ? 'text-blue-600' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className={(isPurchaseActive() || purchaseOpen) ? 'text-blue-700 font-bold' : 'text-gray-700'}>Purchase</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${purchaseOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
                )}
              </button>
              
              {purchaseOpen && sidebarOpen && (
                <div className="mt-1 ml-4 pl-2 border-l border-gray-150 space-y-0.5 animate-in fade-in duration-100">
                  {visiblePurchaseItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={getSubItemClass(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Inventory Dropdown */}
          {hasInventoryV2Access && (
            <div>
              <button
                onClick={() => setInventoryOpen(!inventoryOpen)}
                className={getDropdownPrimaryClass(isInventoryV2Active() || inventoryOpen)}
              >
                <div className="flex items-center space-x-3">
                  <Users className={`w-5 h-5 ${(isInventoryV2Active() || inventoryOpen) ? 'text-blue-600' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className={(isInventoryV2Active() || inventoryOpen) ? 'text-blue-700 font-bold' : 'text-gray-700'}>Inventory</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${inventoryOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
                )}
              </button>
              
              {inventoryOpen && sidebarOpen && (
                <div className="mt-1 ml-4 pl-2 border-l border-gray-150 space-y-0.5 animate-in fade-in duration-100">
                  {visibleInventoryV2Items.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={getSubItemClass(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Conversions Dropdown */}
          {hasConversionsAccess && (
            <div>
              <button
                onClick={() => setConversionsOpen(!conversionsOpen)}
                className={getDropdownPrimaryClass(isConversionsActive() || conversionsOpen)}
              >
                <div className="flex items-center space-x-3">
                  <RefreshCw className={`w-5 h-5 ${(isConversionsActive() || conversionsOpen) ? 'text-blue-600' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className={(isConversionsActive() || conversionsOpen) ? 'text-blue-700 font-bold' : 'text-gray-700'}>Conversions</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${conversionsOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
                )}
              </button>
              
              {conversionsOpen && sidebarOpen && (
                <div className="mt-1 ml-4 pl-2 border-l border-gray-150 space-y-0.5 animate-in fade-in duration-100">
                  {visibleConversionsItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={getSubItemClass(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Production Dropdown */}
          {hasProductionAccess && (
            <div>
              <button
                onClick={() => setProductionOpen(!productionOpen)}
                className={getDropdownPrimaryClass(isProductionActive() || productionOpen)}
              >
                <div className="flex items-center space-x-3">
                  <BarChart3 className={`w-5 h-5 ${(isProductionActive() || productionOpen) ? 'text-blue-600' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className={(isProductionActive() || productionOpen) ? 'text-blue-700 font-bold' : 'text-gray-700'}>Production</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${productionOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
                )}
              </button>
              
              {productionOpen && sidebarOpen && (
                <div className="mt-1 ml-4 pl-2 border-l border-gray-150 space-y-0.5 animate-in fade-in duration-100">
                  {visibleProductionItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={getSubItemClass(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sales Dropdown */}
          {hasSalesAccess && (
            <div>
              <button
                onClick={() => setSalesOpen(!salesOpen)}
                className={getDropdownPrimaryClass(isSalesActive() || salesOpen)}
              >
                <div className="flex items-center space-x-3">
                  <ShoppingCart className={`w-5 h-5 ${(isSalesActive() || salesOpen) ? 'text-blue-600' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className={(isSalesActive() || salesOpen) ? 'text-blue-700 font-bold' : 'text-gray-700'}>Sales</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${salesOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
                )}
              </button>

              {salesOpen && sidebarOpen && (
                <div className="mt-1 ml-4 pl-2 border-l border-gray-150 space-y-0.5 animate-in fade-in duration-100">
                  {visibleSalesItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={getSubItemClass(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reports Dropdown */}
          {hasReportsAccess && (
            <div>
              <button
                onClick={() => setReportsOpen(!reportsOpen)}
                className={getDropdownPrimaryClass(isReportsActive() || reportsOpen)}
              >
                <div className="flex items-center space-x-3">
                  <FileText className={`w-5 h-5 ${(isReportsActive() || reportsOpen) ? 'text-blue-600' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className={(isReportsActive() || reportsOpen) ? 'text-blue-700 font-bold' : 'text-gray-700'}>Reports</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${reportsOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
                )}
              </button>

              {reportsOpen && sidebarOpen && (
                <div className="mt-1 ml-4 pl-2 border-l border-gray-150 space-y-0.5 animate-in fade-in duration-100">
                  {visibleReportsItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={getSubItemClass(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings Dropdown */}
          <div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={getDropdownPrimaryClass(settingsOpen)}
            >
              <div className="flex items-center space-x-3">
                <Settings className={`w-5 h-5 ${settingsOpen ? 'text-blue-600' : 'text-gray-500'}`} />
                {sidebarOpen && <span className={settingsOpen ? 'text-blue-700 font-bold' : 'text-gray-700'}>Settings</span>}
              </div>
              {sidebarOpen && (
                <ChevronDown className={`w-4 h-4 transition-transform ${settingsOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} />
              )}
            </button>

            {settingsOpen && sidebarOpen && (
              <div className="mt-1 ml-4 pl-2 border-l border-gray-150 space-y-0.5 animate-in fade-in duration-100">
                {hasRole('admin') && (
                  <button
                    onClick={() => setShowDataManager(true)}
                    className={getSubItemClass('/data-manager')}
                  >
                    Data Manager
                  </button>
                )}
                <button
                  onClick={() => handleNavigate('/company-selection')}
                  className={getSubItemClass('/company-selection')}
                >
                  Switch Company
                </button>
                <button
                  onClick={() => handleNavigate('/inventory-v2/settings')}
                  className={getSubItemClass('/inventory-v2/settings')}
                >
                  Custom Options
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mobile Navbar trigger */}
        <div className="md:hidden flex items-center bg-white border-b border-gray-200 px-4 py-2.5 shrink-0 justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 rounded-lg hover:bg-gray-150 text-gray-700 transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-gray-900 text-sm truncate max-w-[200px]">{selectedCompany?.name || 'SKBW ERP'}</span>
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs uppercase shrink-0">
            {user?.fullName?.charAt(0) || 'A'}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-150 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Confirm Logout</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Are you sure you want to log out of your session?</p>
              </div>
            </div>
            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  logout();
                  navigate('/login');
                }}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-red-200 cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Manager Modal */}
      <DataManager 
        isOpen={showDataManager} 
        onClose={() => setShowDataManager(false)} 
      />
    </div>
  );
};

export default Layout;