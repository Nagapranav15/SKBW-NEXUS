import React, { useState } from 'react';
import { LayoutDashboard, MapPin, Package, ArrowRightLeft, FileText, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Sub-pages
import InventoryDashboard from './InventoryDashboard';
import InventoryZones from '../InventoryManagement';
import SkuStockPage from './SkuStockPage';
import MovementsPage from './MovementsPage';
import ReportsPage from './ReportsPage';

type TabId = 'dashboard' | 'zones' | 'skus' | 'movements' | 'reports';

const tabs: { id: TabId; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'zones', label: 'Zones', icon: MapPin },
  { id: 'skus', label: 'SKU Master', icon: Package },
  { id: 'movements', label: 'Movements', icon: ArrowRightLeft },
  { id: 'reports', label: 'Reports', icon: FileText },
];

const InventoryModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const { hasPermission } = useAuth();

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <InventoryDashboard />;
      case 'zones': return <InventoryZones />;
      case 'skus': return <SkuStockPage />;
      case 'movements': return <MovementsPage />;
      case 'reports': return <ReportsPage />;
      default: return <InventoryDashboard />;
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">InventoryPro</h3>
              <p className="text-xs text-gray-500">Manufacturing</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6">
          {renderTab()}
        </div>
      </div>
    </div>
  );
};

export default InventoryModule;
