import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSalesOrdersV2, SalesOrderV2, updateSalesOrderV2Status } from '../../api/salesOrderApiV2';
import { saveCustomSalesOrder } from '../../utils/salesOrderStorage';
import { generateFullDashboardOrders } from './salesOrderSampleData';
import { PendingOrdersProductionView } from './PendingOrdersProductionView';
import SalesOrderDetailPanelV2 from './SalesOrderDetailPanelV2';
import SalesOrderDrawerV2 from './SalesOrderDrawerV2';
import PrintOrderEstimationModal from './PrintOrderEstimationModal';
import SalesOrderSuccessModal from './SalesOrderSuccessModal';
import { showToast } from '../ui/Toast';

const PendingOrders: React.FC = () => {
  const { selectedCompany } = useAuth();
  const [orders, setOrders] = useState<SalesOrderV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<SalesOrderV2 | null>(null);
  const [editingOrder, setEditingOrder] = useState<SalesOrderV2 | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [printEstimationOrder, setPrintEstimationOrder] = useState<SalesOrderV2 | null>(null);
  const [successOrder, setSuccessOrder] = useState<SalesOrderV2 | null>(null);

  const handleConfirmDraftOrder = async (order: SalesOrderV2) => {
    try {
      const confirmedOrder: SalesOrderV2 = {
        ...order,
        status: 'Confirmed',
        fulfillmentStatus: order.fulfillmentStatus === 'Draft' ? 'Pending' : (order.fulfillmentStatus || 'Pending'),
        updatedAt: new Date().toISOString()
      };

      const isLocalId = !order._id || order._id.startsWith('so-mock-') || order._id.startsWith('so-user-');
      if (order._id && !isLocalId) {
        try {
          await updateSalesOrderV2Status(order._id, { status: 'Confirmed' });
        } catch (apiErr) {
          console.warn('API updateSalesOrderV2Status failed, confirming locally:', apiErr);
        }
      }

      saveCustomSalesOrder(confirmedOrder);
      setOrders(prev => {
        const idx = prev.findIndex(o => o._id === confirmedOrder._id || o.orderNumber === confirmedOrder.orderNumber);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = confirmedOrder;
          return copy;
        }
        return [confirmedOrder, ...prev];
      });

      showToast(`Sales Order ${order.orderNumber} confirmed successfully!`, 'success');
      setSuccessOrder(confirmedOrder);
    } catch (err: any) {
      console.error(err);
      showToast('Failed to confirm order', 'error');
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await getSalesOrdersV2(selectedCompany?._id, { limit: 1000 }).catch(() => null);
      if (res && res.data && res.data.length > 0) {
        setOrders(res.data);
      } else {
        setOrders(generateFullDashboardOrders());
      }
    } catch {
      setOrders(generateFullDashboardOrders());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [selectedCompany?._id]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* ── HEADER ── */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Pending Sales Orders (Production View)</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Tally-style Sales Orders Outstandings & Material Requirement Planning (Statements of Inventory)
        </p>
      </div>

      {/* ── TALLY PRODUCTION VIEW ── */}
      <PendingOrdersProductionView
        orders={orders}
        onViewOrder={(order) => setSelectedOrderDetail(order)}
        onEditOrder={(order) => {
          setEditingOrder(order);
          setShowDrawer(true);
        }}
        onRefresh={fetchOrders}
      />

      {/* ── MODALS ── */}
      <SalesOrderDetailPanelV2
        isOpen={Boolean(selectedOrderDetail)}
        order={selectedOrderDetail}
        onClose={() => setSelectedOrderDetail(null)}
        onEdit={(order) => {
          setSelectedOrderDetail(null);
          setEditingOrder(order);
          setShowDrawer(true);
        }}
      />

      <SalesOrderDrawerV2
        isOpen={showDrawer}
        companyId={selectedCompany?._id || ''}
        editOrder={editingOrder}
        onClose={() => setShowDrawer(false)}
        onSaveSuccess={(saved) => {
          setShowDrawer(false);
          setOrders(prev => {
            const idx = prev.findIndex(o => o._id === saved._id || o.orderNumber === saved.orderNumber);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = saved;
              return copy;
            }
            return [saved, ...prev];
          });
          setSuccessOrder(saved);
        }}
      />

      {successOrder && (
        <SalesOrderSuccessModal
          order={successOrder}
          onClose={() => setSuccessOrder(null)}
          onViewOrder={(ord) => {
            setSuccessOrder(null);
            setSelectedOrderDetail(ord);
          }}
          onConfirmOrder={handleConfirmDraftOrder}
          onPrintOrder={(ord) => {
            setPrintEstimationOrder(ord);
          }}
          onCreateNew={() => {
            setSuccessOrder(null);
            setEditingOrder(null);
            setShowDrawer(true);
          }}
          onGoToOrders={() => setSuccessOrder(null)}
        />
      )}

      {printEstimationOrder && (
        <PrintOrderEstimationModal
          order={printEstimationOrder}
          onClose={() => setPrintEstimationOrder(null)}
        />
      )}
    </div>
  );
};

export default PendingOrders;