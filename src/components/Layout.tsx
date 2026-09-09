import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, 
  X, 
  LayoutDashboard, 
  Users, 
  Package, 
  LogOut, 
  Building2,
  FileText,
  RefreshCw,
  Settings,
  Layers,
  BookOpen,
  ClipboardList,
  Truck,
  UserCheck,
  Factory,
  Briefcase,
  Map,
  Building,
  Receipt,
  ShoppingBag,
  Clock,
  FileCheck,
  BarChart2,
  LineChart,
  CreditCard,
  Database,
  ChevronLeft,
  ChevronRight,
  Boxes,
  Bell,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DataManager from './DataManager';
import AiCopilotWidget from './ai/AiCopilotWidget';
import ModuleActivityTrackerDrawer from './common/ModuleActivityTrackerDrawer';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [showDataManager, setShowDataManager] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showActivityTracker, setShowActivityTracker] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission, hasRole, selectedCompany } = useAuth();

  const getNavbarModuleInfo = (path: string) => {
    if (path.includes('/inventory-v2/skus')) {
      return { name: 'Item Master', title: 'Item', key: 'skus' };
    }
    if (path.includes('/stock-inventory')) {
      return { name: 'Stock Inventory', title: 'Stock & Inventory', key: 'stock' };
    }
    if (path.includes('/directory') || path.startsWith('/party/')) {
      return { name: 'Business Directory', title: 'Business Directory', key: 'directory' };
    }
    return null;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const isActive = (path: string) => {
    if (path.includes('?')) {
      const [pathName, searchPart] = path.split('?');
      return location.pathname === pathName && location.search.includes(searchPart);
    }
    return location.pathname === path;
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  // Grouped Navigation Items (Matching Makoro layout & section header vibe!)
  const navSections = [
    {
      title: 'OPERATIONS',
      items: [
        { label: 'Item Master', path: '/inventory-v2/skus', icon: Package, permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
        { label: 'Stock & Inventory', path: '/stock-inventory', icon: Layers, permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY', 'MANAGE_ITEMS', 'VIEW_ITEMS'] },
        { label: 'Batch Stock', path: '/inventory-v2/batch-stock', icon: Boxes, permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY'] },
        { label: 'Stock Ledger', path: '/inventory-v2/ledger?mode=stock', icon: BookOpen, permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY'] },
        { label: 'Warehouse Setup', path: '/inventory-v2/warehouse', icon: Building2, permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY'] },
        { label: 'BOM / Recipes', path: '/inventory-v2/conversions/bom', icon: ClipboardList, permission: ['MANAGE_INVENTORY', 'MANAGE_ITEMS'] },
        { label: 'Stock Transfers', path: '/inventory-v2/conversions/transfer', icon: RefreshCw, permission: ['MANAGE_INVENTORY', 'MANAGE_ITEMS'] },
        { label: 'Digital Dispatch', path: '/sales/digital-dispatch', icon: Truck, permission: 'MANAGE_DISPATCH' },
      ]
    },
    {
      title: 'PARTNERS & DIRECTORY',
      items: [
        { label: 'Business Directory', path: '/directory', icon: Users, permission: ['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES'] },
        { label: 'Customers', path: '/party/customers', icon: UserCheck, permission: ['MANAGE_PARTIES', 'VIEW_PARTIES'] },
        { label: 'Suppliers', path: '/party/vendors', icon: Factory, permission: ['MANAGE_PARTIES', 'VIEW_PARTIES'] },
        { label: 'Agents', path: '/party/agents', icon: Briefcase, permission: ['MANAGE_PARTIES', 'VIEW_PARTIES'] },
        { label: 'Regions', path: '/party/routes', icon: Map, permission: ['MANAGE_PARTIES', 'VIEW_PARTIES'] },
        { label: 'Cities', path: '/party/markets', icon: Building, permission: ['MANAGE_PARTIES', 'VIEW_PARTIES'] },
        { label: 'Transporters', path: '/party/transporters', icon: Truck, permission: ['MANAGE_PARTIES', 'VIEW_PARTIES'] },
      ]
    },
    {
      title: 'FINANCE & SALES',
      items: [
        { label: 'Purchase Batches', path: '/inventory-v2/purchases', icon: Receipt, permission: ['MANAGE_INVENTORY', 'VIEW_INVENTORY'] },
        { label: 'Quotations', path: '/sales/quotes', icon: FileText, permission: ['MANAGE_QUOTES', 'VIEW_QUOTES'] },
        { label: 'Sale Orders', path: '/sales/orders', icon: ShoppingBag, permission: ['MANAGE_ORDERS', 'VIEW_ORDERS'] },
        { label: 'Pending Orders', path: '/sales/pending', icon: Clock, permission: ['MANAGE_ORDERS', 'VIEW_ORDERS'] },
        { label: 'Delivery Challan', path: '/sales/delivery-challan', icon: FileCheck, permission: ['MANAGE_DELIVERY', 'VIEW_DELIVERY'] },
      ]
    },
    {
      title: 'INSIGHTS',
      items: [
        { label: 'Business Intelligence', path: '/analyzer', icon: BarChart2, permission: ['MANAGE_REPORTS', 'VIEW_REPORTS'] },
        { label: 'Sales Reports', path: '/sales/reports', icon: LineChart, permission: ['MANAGE_REPORTS', 'VIEW_REPORTS'] },
        { label: 'Transactions', path: '/transactions', icon: CreditCard, permission: ['MANAGE_REPORTS', 'VIEW_REPORTS', 'VIEW_TRANSACTIONS'] },
      ]
    }
  ];

  const renderNavItem = (item: { label: string; path?: string; icon: any; permission?: any; action?: () => void }) => {
    if (item.permission && !hasPermission(item.permission)) return null;
    const active = item.path ? isActive(item.path) : false;

    return (
      <button
        key={item.label}
        onClick={() => {
          if (item.action) item.action();
          else if (item.path) handleNavigate(item.path);
        }}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 relative group cursor-pointer ${
          active
            ? 'bg-blue-50/80 text-blue-700 font-extrabold shadow-2xs'
            : 'text-gray-600 hover:bg-gray-50/80 hover:text-gray-900 font-bold'
        }`}
        title={!sidebarOpen ? item.label : undefined}
      >
        {/* Left active border line accent matching Makoro screenshot */}
        {active && (
          <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-blue-600 rounded-r-full" />
        )}
        <div className={`flex items-center space-x-3 ${!sidebarOpen ? 'mx-auto' : ''}`}>
          <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600 stroke-[2.2]' : 'text-gray-400 group-hover:text-gray-600'}`} />
          {sidebarOpen && <span className="truncate">{item.label}</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar (Makoro Minimalist Vibe with Electric Blue Accents) */}
      <div className={`
        fixed inset-y-0 left-0 z-50 md:relative md:z-0
        ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64 md:translate-x-0 md:w-16'}
        bg-white border-r border-gray-200/80 shadow-xs transition-all duration-300 flex flex-col h-full overflow-hidden
      `}>
        {/* Brand Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            {/* Logo Avatar Badge */}
            <div className="w-9 h-9 rounded-full border border-gray-200 bg-white flex items-center justify-center font-bold text-gray-900 shrink-0 shadow-2xs">
              {selectedCompany?.logo ? (
                <img src={selectedCompany.logo} alt={selectedCompany.name} className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="text-sm font-black text-blue-600">M</span>
              )}
            </div>
            {sidebarOpen && (
              <div className="truncate">
                <h2 className="font-extrabold text-gray-900 text-xs tracking-wider uppercase truncate">
                  {selectedCompany?.name || 'SKBW CORE'}
                </h2>
                <p className="text-[10px] text-gray-400 font-semibold truncate">ERP Management System</p>
              </div>
            )}
          </div>

          {/* Collapse / Expand Toggle Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-7 h-7 rounded-full border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-500 transition-all cursor-pointer shrink-0"
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Sections Scroll area */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto custom-scrollbar">
          {/* Top Standalone Dashboard Item */}
          {renderNavItem({
            label: 'Dashboard',
            path: '/dashboard',
            icon: LayoutDashboard
          })}

          {/* Categorized Sections */}
          {navSections.map((section, idx) => {
            const visibleItems = section.items.filter(item => !item.permission || hasPermission(item.permission));
            if (visibleItems.length === 0) return null;

            return (
              <div key={idx} className="pt-2">
                {sidebarOpen ? (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {section.title}
                  </div>
                ) : (
                  <div className="my-2 border-t border-gray-100" />
                )}
                <div className="space-y-0.5">
                  {visibleItems.map(item => renderNavItem(item))}
                </div>
              </div>
            );
          })}

          {/* System Settings & Utilities */}
          <div className="pt-2">
            {sidebarOpen ? (
              <div className="px-3 pt-2 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                SYSTEM
              </div>
            ) : (
              <div className="my-2 border-t border-gray-100" />
            )}
            <div className="space-y-0.5">
              {hasRole('admin') && renderNavItem({
                label: 'Data Manager',
                icon: Database,
                action: () => setShowDataManager(true)
              })}
              {renderNavItem({
                label: 'Switch Company',
                path: '/company-selection',
                icon: Building2
              })}
              {renderNavItem({
                label: 'Settings',
                path: '/inventory-v2/settings',
                icon: Settings
              })}
            </div>
          </div>
        </nav>

        {/* Footer Logout Button */}
        <div className="p-3 border-t border-gray-100 shrink-0">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-all cursor-pointer ${
              !sidebarOpen ? 'justify-center' : ''
            }`}
            title={!sidebarOpen ? "Logout" : undefined}
          >
            <div className="flex items-center space-x-3">
              <LogOut className="w-4 h-4 shrink-0 text-rose-600" />
              {sidebarOpen && <span>Logout</span>}
            </div>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Upper Top Navbar - Applicable ONLY for Item Master, Stock Inventory, Business Directory (Matching Image 1) */}
        {(() => {
          const activeModuleInfo = getNavbarModuleInfo(location.pathname);
          if (!activeModuleInfo) return null;

          return (
            <header className="h-14 md:h-16 bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center justify-between shrink-0 z-30 shadow-2xs">
              {/* Left Side: Mobile Sidebar Toggle + Dynamic Page Title */}
              <div className="flex items-center gap-3 md:gap-4">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="md:hidden p-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
                  title="Toggle Navigation Menu"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <h1 className="text-sm md:text-base font-extrabold text-gray-900 tracking-tight">
                  {activeModuleInfo.title}
                </h1>
              </div>

              {/* Right Side: Company Selector, Bell Activity Tracker, Divider, AI Copilot Trigger */}
              <div className="flex items-center gap-2.5 md:gap-3.5">
                {/* Company / Factory Selector Pill */}
                <button
                  onClick={() => navigate('/company-selection')}
                  className="border border-gray-200 hover:border-blue-300 bg-white hover:bg-slate-50/90 rounded-xl px-3.5 py-1.5 flex items-center gap-2 text-xs font-bold text-gray-700 shadow-2xs transition-all cursor-pointer group"
                  title="Switch Active Company / Warehouse"
                >
                  <Building2 className="w-4 h-4 text-blue-600 shrink-0 group-hover:scale-105 transition-transform" />
                  <span className="truncate max-w-[130px] sm:max-w-[190px] md:max-w-[240px] text-gray-900 font-extrabold">
                    {selectedCompany?.name || 'SKBW ERP'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                </button>

                {/* Bell Icon = Module Activity Tracker Button */}
                <button
                  onClick={() => setShowActivityTracker(true)}
                  className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors relative cursor-pointer group"
                  title={`View ${activeModuleInfo.name} Activity Logs`}
                >
                  <Bell className="w-4.5 h-4.5 group-hover:scale-105 transition-transform" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
                </button>

                {/* Vertical Divider */}
                <div className="h-4.5 w-[1px] bg-gray-200/90 mx-0.5" />

                {/* AI Copilot Sparkle Icon Trigger Button */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-ai-copilot'))}
                  className="p-2 rounded-xl text-blue-600 hover:bg-blue-50 border border-blue-200/80 transition-all cursor-pointer shadow-2xs flex items-center justify-center relative group"
                  title="Open AI Copilot"
                >
                  <Sparkles className="w-4.5 h-4.5 text-blue-600 group-hover:rotate-12 transition-transform" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                </button>
              </div>
            </header>
          );
        })()}

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Module Activity Tracker Drawer (Bell Icon Triggered) */}
      {(() => {
        const activeModuleInfo = getNavbarModuleInfo(location.pathname);
        if (!activeModuleInfo) return null;
        return (
          <ModuleActivityTrackerDrawer
            isOpen={showActivityTracker}
            onClose={() => setShowActivityTracker(false)}
            moduleName={activeModuleInfo.name}
            moduleKey={activeModuleInfo.key}
          />
        );
      })()}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-150 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
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
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-rose-200 cursor-pointer"
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

      {/* Global Bottom-Right AI Assistant Widget */}
      <AiCopilotWidget />
    </div>
  );
};

export default Layout;