import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastContainer } from './components/ui/Toast';
import Login from './components/Login';
import CompanySelection from './components/CompanySelection';
import Dashboard from './components/Dashboard';
import Layout from './components/Layout';
import PartyManagement from './components/PartyManagement';
import ItemManagement from './components/ItemManagement';
import SalesQuotes from './components/sales/SalesQuotes';
import SalesOrders from './components/sales/SalesOrders';
import PendingOrders from './components/sales/PendingOrders';
import DeliveryChallan from './components/sales/DeliveryChallan';
import DigitalDispatch from './components/sales/DigitalDispatch';
import SalesReports from './components/sales/SalesReports';
import TransactionTools from './components/TransactionTools';
import AnalyzerDashboard from './components/AnalyzerDashboard';
import ProtectedRoute from './components/ProtectedRoute';

// Inventory sub-pages
import MfgDashboard from './components/inventory/MfgDashboard';
import MfgZones from './components/inventory/MfgZones';
import MfgSkus from './components/inventory/MfgSkus';
import MfgMovements from './components/inventory/MfgMovements';
import MfgBom from './components/inventory/MfgBom';
import MfgAnalytics from './components/inventory/MfgAnalytics';
import MfgReports from './components/inventory/MfgReports';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <ToastContainer />
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
              <Route path="party" element={<Navigate to="/party/customers" replace />} />
              <Route path="party/customers" element={<PartyManagement />} />
              <Route path="party/vendors" element={<PartyManagement />} />
              <Route path="party/agents" element={<PartyManagement />} />
              <Route path="party/routes" element={<PartyManagement />} />
              <Route path="party/markets" element={<PartyManagement />} />
              <Route path="party/transporters" element={<PartyManagement />} />
              <Route path="items" element={<ItemManagement />} />
              <Route path="sales/quotes" element={<SalesQuotes />} />
              <Route path="sales/orders" element={<SalesOrders />} />
              <Route path="sales/pending" element={<PendingOrders />} />
              <Route path="sales/delivery-challan" element={<DeliveryChallan />} />
              <Route path="sales/digital-dispatch" element={
                <ProtectedRoute requiredPermission="MANAGE_DISPATCH">
                  <DigitalDispatch />
                </ProtectedRoute>
              } />
              <Route path="sales/reports" element={<SalesReports />} />
              <Route path="transactions" element={<TransactionTools />} />
              <Route path="analyzer" element={<AnalyzerDashboard />} />
              {/* Inventory sub-routes */}
              <Route path="inventory" element={<Navigate to="/inventory/dashboard" replace />} />
              <Route path="inventory/dashboard" element={<MfgDashboard />} />
              <Route path="inventory/zones" element={<MfgZones />} />
              <Route path="inventory/skus" element={<MfgSkus />} />
              <Route path="inventory/movements" element={<MfgMovements />} />
              <Route path="inventory/bom" element={<MfgBom />} />
              <Route path="inventory/analytics" element={<MfgAnalytics />} />
              <Route path="inventory/reports" element={<MfgReports />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;