import React, { useState } from 'react';
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
  Truck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DataManager from './DataManager';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [salesDropdownOpen, setSalesDropdownOpen] = useState(false);
  const [masterDropdownOpen, setMasterDropdownOpen] = useState(() => {
    return window.location.pathname.startsWith('/party') || window.location.pathname.startsWith('/inventory');
  });
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(() => {
    return window.location.pathname.startsWith('/party');
  });
  const [inventoryDropdownOpen, setInventoryDropdownOpen] = useState(() => {
    return window.location.pathname.startsWith('/inventory');
  });
  const [showDataManager, setShowDataManager] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission, hasRole, selectedCompany } = useAuth();

  const handleNavigate = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard', permission: 'VIEW_DASHBOARD' },
    { icon: Package, label: 'Items', path: '/items', permission: ['MANAGE_ITEMS', 'VIEW_ITEMS'] },
  ];

  const partyItems = [
    { icon: Users, label: 'Customers', path: '/party/customers', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { icon: Store, label: 'Vendors', path: '/party/vendors', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { icon: Briefcase, label: 'Agents', path: '/party/agents', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { icon: Compass, label: 'Regions', path: '/party/routes', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { icon: MapPin, label: 'Cities', path: '/party/markets', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
    { icon: Truck, label: 'Transporters', path: '/party/transporters', permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
  ];

  const salesItems = [
    { label: 'Quotes', path: '/sales/quotes', permission: ['MANAGE_QUOTES', 'VIEW_QUOTES', 'CREATE_QUOTES'] },
    { label: 'Sale Orders', path: '/sales/orders', permission: ['MANAGE_ORDERS', 'VIEW_ORDERS', 'CREATE_ORDERS'] },
    { label: 'Pending Orders', path: '/sales/pending', permission: ['MANAGE_ORDERS', 'VIEW_ORDERS'] },
    { label: 'Delivery Challan', path: '/sales/delivery-challan', permission: ['MANAGE_DELIVERY', 'VIEW_DELIVERY'] },
    { label: 'Digital Dispatch', path: '/sales/digital-dispatch', permission: 'MANAGE_DISPATCH' },
    { label: 'Reports', path: '/sales/reports', permission: ['MANAGE_REPORTS', 'VIEW_REPORTS'] },
  ];

  const isActive = (path: string) => location.pathname === path;
  const isSalesActive = () => location.pathname.startsWith('/sales');

  // Filter menu items based on permissions
  const visibleMenuItems = menuItems.filter(item => hasPermission(item.permission));
  const visibleSalesItems = salesItems.filter(item => hasPermission(item.permission));
  const hasSalesAccess = visibleSalesItems.length > 0;

  const visiblePartyItems = partyItems.filter(item => hasPermission(item.permission));
  const hasPartyAccess = visiblePartyItems.length > 0;
  const isPartyActive = () => location.pathname.startsWith('/party');

  const inventoryItems = [
    { label: 'Dashboard', path: '/inventory/dashboard', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'SKU Master', path: '/inventory/skus', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'BOM & Assembly', path: '/inventory/bom', permission: ['MANAGE_INVENTORY', 'MANAGE_ITEMS'] },
    { label: 'Zones', path: '/inventory/zones', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'Movements', path: '/inventory/movements', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
    { label: 'Analytics', path: '/inventory/analytics', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY'] },
    { label: 'Reports', path: '/inventory/reports', permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY'] },
  ];
  const visibleInventoryItems = inventoryItems.filter(item => hasPermission(item.permission));
  const hasInventoryAccess = visibleInventoryItems.length > 0;
  const isInventoryActive = () => location.pathname.startsWith('/inventory');

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
    return `w-full flex items-center space-x-3 px-3 py-2 transition-all duration-150 ${
      active
        ? 'border-l-4 border-blue-600 bg-gradient-to-r from-blue-100 to-blue-50/30 text-blue-700 font-semibold rounded-r-lg rounded-l-none shadow-xs'
        : 'border-l-4 border-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-lg'
    }`;
  };

  const getDropdownPrimaryClass = (activeCondition: boolean) => {
    return `w-full flex items-center justify-between px-3 py-2 transition-all duration-150 ${
      activeCondition
        ? 'border-l-4 border-blue-600 bg-gradient-to-r from-blue-100 to-blue-50/30 text-blue-700 font-semibold rounded-r-lg rounded-l-none shadow-xs'
        : 'border-l-4 border-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-lg'
    }`;
  };

  const getSubItemClass = (path: string) => {
    const active = isActive(path);
    return `w-full text-left px-3 py-1.5 transition-all duration-150 text-[13px] ${
      active
        ? 'border-l-4 border-blue-500 bg-gradient-to-r from-blue-50/80 to-blue-50/10 text-blue-600 font-semibold rounded-r-lg rounded-l-none'
        : 'border-l-4 border-transparent text-gray-650 hover:bg-gray-50 hover:text-gray-900 rounded-lg'
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
        ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-0 md:translate-x-0 md:w-16'}
        bg-white shadow-lg transition-all duration-300 flex flex-col h-full
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div className="flex items-center space-x-3">
                {selectedCompany?.logo ? (
                  <img src={selectedCompany.logo} alt={selectedCompany.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <Building2 className="w-8 h-8 text-blue-600" />
                )}
                <div>
                  <h2 className="font-semibold text-gray-900 text-sm">{selectedCompany?.name || 'SKBW ERP'}</h2>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs text-gray-500">{user?.fullName}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getRoleBadgeColor(user?.role || '')}`}>
                      {user?.role?.toUpperCase()}
                    </span>
                  </div>
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
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {visibleMenuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className={getPrimaryClass(item.path)}
            >
              <item.icon className="w-5 h-5" />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}

          {/* Master Dropdown */}
          {(hasPartyAccess || hasInventoryAccess) && (
            <div className="relative">
              <button
                onClick={() => setMasterDropdownOpen(!masterDropdownOpen)}
                className={getDropdownPrimaryClass(isPartyActive() || isInventoryActive())}
              >
                <div className="flex items-center space-x-3">
                  <LayoutGrid className="w-5 h-5 text-blue-600" />
                  {sidebarOpen && <span className="text-base font-bold text-gray-955">Masters</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${masterDropdownOpen ? 'rotate-180' : ''}`} />
                )}
              </button>

              {masterDropdownOpen && sidebarOpen && (
                <div className="mt-2 ml-4 pl-2 border-l border-gray-100 space-y-3">
                  {/* Party Section */}
                  {hasPartyAccess && (
                    <div>
                      <button
                        onClick={() => setPartyDropdownOpen(!partyDropdownOpen)}
                        className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-sm font-semibold transition-colors ${
                          isPartyActive()
                            ? 'text-blue-700 bg-blue-50/40'
                            : 'text-gray-650 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5">
                          <Users className="w-3.5 h-3.5 text-gray-500" />
                          <span>Party</span>
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${partyDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {partyDropdownOpen && (
                        <div className="mt-1 ml-2 pl-2 border-l border-gray-150 space-y-0.5">
                          {visiblePartyItems.map((item) => {
                            let shortcut = '';
                            if (item.path === '/party/customers') shortcut = 'Alt+1';
                            else if (item.path === '/party/vendors') shortcut = 'Alt+2';
                            else if (item.path === '/party/agents') shortcut = 'Alt+3';
                            else if (item.path === '/party/routes') shortcut = 'Alt+4';
                            else if (item.path === '/party/markets') shortcut = 'Alt+5';
                            else if (item.path === '/party/transporters') shortcut = 'Alt+6';

                            return (
                              <button
                                key={item.path}
                                onClick={() => handleNavigate(item.path)}
                                className={`${getSubItemClass(item.path)} flex items-center justify-between gap-2 pr-2`}
                              >
                                <div className="flex items-center gap-2">
                                  <item.icon className="w-4 h-4 shrink-0" />
                                  <span>{item.label}</span>
                                </div>
                                {shortcut && sidebarOpen && (
                                  <kbd className="hidden sm:inline-block font-mono text-[9px] text-gray-400 bg-gray-100/80 border border-gray-200 px-1 rounded select-none pointer-events-none opacity-80">
                                    {shortcut}
                                  </kbd>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inventory Section */}
                  {hasInventoryAccess && (
                    <div>
                      <button
                        onClick={() => setInventoryDropdownOpen(!inventoryDropdownOpen)}
                        className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-sm font-semibold transition-colors ${
                          isInventoryActive()
                            ? 'text-blue-700 bg-blue-50/40'
                            : 'text-gray-650 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5">
                          <Package className="w-3.5 h-3.5 text-gray-500" />
                          <span>Inventory</span>
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${inventoryDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {inventoryDropdownOpen && (
                        <div className="mt-1 ml-2 pl-2 border-l border-gray-150 space-y-0.5">
                          {visibleInventoryItems.map((item) => (
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
                </div>
              )}
            </div>
          )}

          {/* Sales Dropdown */}
          {hasSalesAccess && (
            <div className="relative">
              <button
                onClick={() => setSalesDropdownOpen(!salesDropdownOpen)}
                className={getDropdownPrimaryClass(isSalesActive())}
              >
                <div className="flex items-center space-x-3">
                  <ShoppingCart className="w-5 h-5" />
                  {sidebarOpen && <span>Sales</span>}
                </div>
                {sidebarOpen && (
                  <ChevronDown className={`w-4 h-4 transition-transform ${salesDropdownOpen ? 'rotate-180' : ''}`} />
                )}
              </button>

              {salesDropdownOpen && sidebarOpen && (
                <div className="mt-2 ml-4 space-y-1">
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

          {/* Data Management - Admin only */}
          {hasRole('admin') && (
            <button
              onClick={() => setShowDataManager(true)}
              className="w-full flex items-center space-x-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Database className="w-5 h-5" />
              {sidebarOpen && <span>Data Manager</span>}
            </button>
          )}

          {/* Transactions — visible to admin, manager (view) */}
          {hasPermission(['MANAGE_REPORTS', 'VIEW_REPORTS', 'VIEW_TRANSACTIONS']) && (
            <button
              onClick={() => handleNavigate('/transactions')}
              className={getPrimaryClass('/transactions')}
            >
              <ArrowDownToLine className="w-5 h-5" />
              {sidebarOpen && <span>Transactions</span>}
            </button>
          )}

          {/* Analyzer — visible to admin, manager */}
          {hasPermission(['MANAGE_REPORTS', 'VIEW_REPORTS']) && (
            <button
              onClick={() => handleNavigate('/analyzer')}
              className={getPrimaryClass('/analyzer')}
            >
              <BarChart3 className="w-5 h-5" />
              {sidebarOpen && <span>Analyzer</span>}
            </button>
          )}

          {/* Change Company */}
          <button
            onClick={() => handleNavigate('/company-selection')}
            className="w-full flex items-center space-x-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Building2 className="w-5 h-5" />
            {sidebarOpen && <span>Switch Company</span>}
          </button>
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

      {/* Data Manager Modal */}
      <DataManager 
        isOpen={showDataManager} 
        onClose={() => setShowDataManager(false)} 
      />
    </div>
  );
};

export default Layout;