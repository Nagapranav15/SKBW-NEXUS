import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastContainer } from './components/ui/Toast';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { Analytics } from '@vercel/analytics/react';

// Lazy loaded page components
const Login = lazy(() => import('./components/Login'));
const CompanySelection = lazy(() => import('./components/CompanySelection'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const BusinessDirectoryV2 = lazy(() => import('./components/directory_v2/BusinessDirectoryV2'));
const StockInventoryV2 = lazy(() => import('./components/stock_v2/StockInventoryV2'));
const SalesQuotes = lazy(() => import('./components/sales/SalesQuotes'));
const SalesOrders = lazy(() => import('./components/sales/SalesOrders'));
const PendingOrders = lazy(() => import('./components/sales/PendingOrders'));
const DeliveryChallan = lazy(() => import('./components/sales/DeliveryChallan'));
const SalesReports = lazy(() => import('./components/sales/SalesReports'));
const TransactionTools = lazy(() => import('./components/TransactionTools'));
const AnalyzerDashboard = lazy(() => import('./components/AnalyzerDashboard'));
const ProductionModule = lazy(() => import('./components/production/ProductionModule'));

// Inventory V2 (Beta) sub-pages
const DashboardV2 = lazy(() => import('./components/inventory_v2/DashboardV2'));
const SkuMasterV2 = lazy(() => import('./components/inventory_v2/SkuMasterV2'));
const WarehouseStructureV2 = lazy(() => import('./components/inventory_v2/WarehouseStructureV2'));
const TestingTransactionsV2 = lazy(() => import('./components/inventory_v2/TestingTransactionsV2'));
const PurchaseInvoicePage = lazy(() => import('./components/inventory_v2/purchases/PurchaseInvoicePage'));
const InventoryBalanceV2 = lazy(() => import('./components/inventory_v2/InventoryBalanceV2'));
const SettingsPage = lazy(() => import('./components/inventory_v2/SettingsPage'));

// Premium Micro-Loading Indicator
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh] w-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-3 border-blue-600/10 border-t-blue-600 rounded-full animate-spin" />
      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Loading modules...</span>
    </div>
  </div>
);

function App() {
  // Prevent mouse wheel scrolling from changing number input values globally
  useEffect(() => {
    const handleWheel = () => {
      const activeEl = document.activeElement as HTMLInputElement | null;
      if (activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'number') {
        activeEl.blur();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="min-h-screen bg-white">
          <ToastContainer />
          <Analytics />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/company-selection" element={
                <ProtectedRoute>
                  <CompanySelection />
                </ProtectedRoute>
              } />
              <Route path="/" element={
                <ProtectedRoute requireCompany>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="directory" element={<BusinessDirectoryV2 />} />
                <Route path="stock-inventory" element={<StockInventoryV2 />} />
                <Route path="party" element={<Navigate to="/directory?tab=customers" replace />} />
                <Route path="party/customers" element={<Navigate to="/directory?tab=customers" replace />} />
                <Route path="party/vendors" element={<Navigate to="/directory?tab=vendors" replace />} />
                <Route path="party/agents" element={<Navigate to="/directory?tab=agents" replace />} />
                <Route path="party/routes" element={<Navigate to="/directory?tab=regions" replace />} />
                <Route path="party/markets" element={<Navigate to="/directory?tab=cities" replace />} />
                <Route path="party/transporters" element={<Navigate to="/directory?tab=transporters" replace />} />
                <Route path="party/directory" element={<Navigate to="/directory" replace />} />
                <Route path="party/*" element={<Navigate to="/directory" replace />} />
                <Route path="items" element={<SkuMasterV2 />} />
                <Route path="sales/quotes" element={<SalesQuotes />} />
                <Route path="sales/orders" element={<SalesOrders />} />
                <Route path="sales/pending" element={<PendingOrders />} />
                <Route path="sales/delivery-challan" element={<DeliveryChallan />} />
                <Route path="sales/reports" element={<SalesReports />} />
                <Route path="production/*" element={<ProductionModule />} />
                <Route path="production" element={<ProductionModule />} />
                <Route path="transactions" element={<TransactionTools />} />
                <Route path="analyzer" element={<AnalyzerDashboard />} />

                {/* Manufacturing Inventory sub-routes */}
                <Route path="inventory-v2" element={<Navigate to="/inventory-v2/dashboard" replace />} />
                <Route path="inventory-v2/dashboard" element={<DashboardV2 />} />
                <Route path="inventory-v2/skus" element={<SkuMasterV2 />} />
                <Route path="inventory-v2/warehouse" element={<Navigate to="/stock-inventory" replace />} />
                <Route path="inventory-v2/purchases" element={<PurchaseInvoicePage />} />
                <Route path="inventory-v2/ledger" element={<Navigate to="/stock-inventory" replace />} />
                <Route path="inventory-v2/batch-stock" element={<Navigate to="/stock-inventory" replace />} />
                <Route path="inventory-v2/conversions/*" element={<Navigate to="/stock-inventory" replace />} />
                <Route path="sales/digital-dispatch" element={<Navigate to="/sales/orders" replace />} />
                <Route path="inventory-v2/testing-transactions" element={<TestingTransactionsV2 />} />
                <Route path="inventory-v2/settings" element={<SettingsPage />} />
                <Route path="inventory-v2/balances" element={<InventoryBalanceV2 />} />
              </Route>
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;