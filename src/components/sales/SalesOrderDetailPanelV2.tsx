import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, Edit, Printer, FileText, MoreHorizontal,
  User, Calendar, Truck, Tag, MapPin, Phone, Package,
  ChevronRight, Plus, Trash2, CheckCircle, Clock,
  AlertCircle, CreditCard, IndianRupee, Play, Send, Check,
  Factory, ExternalLink, Layers, Receipt, Wallet
} from 'lucide-react';
import { SalesOrderV2, updateSalesOrderV2Status } from '../../api/salesOrderApiV2';
import { RecordPaymentModal } from './RecordPaymentModal';
import { saveCustomSalesOrder } from '../../utils/salesOrderStorage';
import { useAuth } from '../../context/AuthContext';
import { getParties } from '../../api/partyApi';
import { getBalancesV2, getSkusV2 } from '../../api/mfgApiV2';
import { createProductionOrder, getProductionOrders, completeProductionOrder } from '../../api/productionApi';
import { createDeliveryChallan, getDeliveryChallans } from '../../api/deliveryChallanApi';
import { showToast } from '../ui/Toast';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { NewProductionOrderWizard } from '../production/NewProductionOrderWizard';

// WhatsApp Icon
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.705 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface SalesOrderDetailPanelV2Props {
  isOpen: boolean;
  order: SalesOrderV2 | null;
  onClose: () => void;
  onEdit: (order: SalesOrderV2) => void;
  onOrderUpdated?: (updatedOrder: SalesOrderV2) => void;
}

export const SalesOrderDetailPanelV2: React.FC<SalesOrderDetailPanelV2Props> = ({
  isOpen,
  order,
  onClose,
  onEdit,
  onOrderUpdated,
}) => {
  const { selectedCompany, user } = useAuth();
  const navigate = useNavigate();
  const [localOrder, setLocalOrder] = useState<SalesOrderV2 | null>(order);
  const [productionOrders, setProductionOrders] = useState<any[]>([]);
  const [deliveryChallans, setDeliveryChallans] = useState<any[]>([]);
  const [isProcessingAction, setIsProcessingAction] = useState<string | null>(null);

  const [addressTab, setAddressTab] = useState<'billing' | 'delivery'>('billing');
  const [customerDetails, setCustomerDetails] = useState<any | null>(null);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [loadedSkus, setLoadedSkus] = useState<any[]>([]);
  const [stockRefreshKey, setStockRefreshKey] = useState(0);

  useEffect(() => {
    const handleStockChange = () => setStockRefreshKey(k => k + 1);
    window.addEventListener('stock_balance_changed', handleStockChange);
    return () => window.removeEventListener('stock_balance_changed', handleStockChange);
  }, []);

  const [showProdWizard, setShowProdWizard] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const handlePaymentSuccess = (result: any) => {
    if (result.order) {
      setLocalOrder(result.order);
      if (onOrderUpdated) {
        onOrderUpdated(result.order);
      }
    }
    if (result.customer) {
      setCustomerDetails(result.customer);
    }
  };

  useEffect(() => {
    setLocalOrder(order);
  }, [order]);

  const activeOrder = localOrder || order;

  // Lock body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      setAddressTab('billing');
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Load Real Customer Details & Stock Balances
  useEffect(() => {
    if (!isOpen || !order) return;

    const compId = selectedCompany?._id || order.company;

    if (!compId) return;
    getParties({ company: compId, limit: 10000 })
      .catch(() => ({ data: { parties: [] } }))
      .then((res: any) => {
        const parties = res?.data?.parties || res?.data?.customers || res?.data || (Array.isArray(res) ? res : []);
        const partyId = typeof order.customer === 'string' ? order.customer : (order.customer as any)?._id;
        const normName = (order.customerName || '').toLowerCase().trim();
        const normPhone = (order.customerPhone || '').replace(/\D/g, '');

        const found = parties.find((p: any) => {
          if (partyId && (p._id === partyId || p.id === partyId)) return true;
          const pName = (p.firmName || p.name || '').toLowerCase().trim();
          if (normName && pName && (pName === normName || pName.includes(normName) || normName.includes(pName))) return true;
          const pPhone = (p.phone || p.mobile || '').replace(/\D/g, '');
          if (normPhone && pPhone && pPhone === normPhone) return true;
          return false;
        });

        if (found) {
          setCustomerDetails(found);
        }
      })
      .catch(() => {});

    // 2. Fetch live stock balances to display accurate stock per SKU in GBL
    if (compId) {
      Promise.all([
        getBalancesV2(compId).catch(() => []),
        getSkusV2(compId).catch(() => [])
      ]).then(([bals, skus]) => {
        const smap = new Map<string, number>();
        const bList = Array.isArray(bals) ? bals : [];
        const sList = Array.isArray(skus) ? skus : [];
        setLoadedSkus(sList);

        bList.forEach((b: any) => {
          const rawId = b.skuId || b.sku?._id;
          const sId = rawId ? String((rawId as any)._id || rawId) : '';
          const qty = Number(b.onHand) || Number(b.quantity) || 0;
          if (sId) smap.set(sId, (smap.get(sId) || 0) + qty);
        });

        sList.forEach((s: any) => {
          const sId = String(s._id || s.id || '');
          const code = (s.skuCode || '').toLowerCase().trim();
          const name = (s.name || '').toLowerCase().trim();
          const pcsPerGbl = Number(s.altUnitConversion || s.booksGbl || 100) || 100;
          const rawOnHand = smap.get(sId) ?? (Number(s.presentStock || s.openingStock || 0));
          const unit = (s.unit || '').toUpperCase().trim();
          const altUnit = (s.altUnit || '').toUpperCase().trim();
          
          let gbl: number;
          if (unit === 'GBL' || (altUnit && altUnit !== 'GBL' && unit.includes('GBL'))) {
            gbl = rawOnHand;
          } else {
            gbl = pcsPerGbl > 0 ? Math.floor(rawOnHand / pcsPerGbl) : rawOnHand;
          }

          if (sId) smap.set(sId, gbl);
          if (code) smap.set(code, gbl);
          if (name) smap.set(name, gbl);
        });

        setStockMap(smap);
      }).catch(() => {});
    }
  }, [isOpen, activeOrder, selectedCompany?._id, stockRefreshKey]);

  // Fetch linked production orders & delivery challans to make order progress dynamic
  useEffect(() => {
    if (!isOpen || !activeOrder) return;
    const compId = (activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id;
    if (compId) {
      getProductionOrders({ companyId: compId }).then(res => {
        if (Array.isArray(res)) setProductionOrders(res);
      }).catch(() => {});

      getDeliveryChallans(compId).then((res: any) => {
        const list = res?.data || (Array.isArray(res) ? res : []);
        if (Array.isArray(list)) setDeliveryChallans(list);
      }).catch(() => {});
    }
  }, [isOpen, activeOrder?._id, activeOrder?.company, selectedCompany?._id]);

  // Find linked production order or delivery challan (Called unconditionally before early return)
  const linkedProductionOrder = useMemo(() => {
    if (!productionOrders.length || !activeOrder) return null;
    const orderNum = (activeOrder.orderNumber || '').toLowerCase().trim();
    const orderId = String(activeOrder._id || '');
    return productionOrders.find(po => {
      const pNum = (po.orderNumber || '').toLowerCase();
      const notes = (po.notes || '').toLowerCase();
      const source = (po.source || '').toLowerCase();
      const ref = (po.reference || '').toLowerCase();
      const refId = String(po.referenceSalesOrderId || '');
      return (
        (refId && (refId === orderId || refId === (activeOrder as any).id)) ||
        (orderNum && (ref.includes(orderNum) || pNum.includes(orderNum) || notes.includes(orderNum) || source.includes(orderNum)))
      );
    });
  }, [productionOrders, activeOrder]);

  const linkedDeliveryChallan = useMemo(() => {
    if (!deliveryChallans.length || !activeOrder) return null;
    const orderNum = (activeOrder.orderNumber || '').toLowerCase().trim();
    return deliveryChallans.find((dc: any) => {
      const dcNum = (dc.dcNumber || dc.orderNumber || '').toLowerCase();
      const cust = (dc.customerName || dc.customer || '').toLowerCase();
      return dcNum.includes(orderNum) || (cust && cust === (activeOrder.customerName || '').toLowerCase());
    });
  }, [deliveryChallans, activeOrder]);

  if (!isOpen || !activeOrder) return null;

  // ── Clean Address Formatter without trailing ", - Pincode" ──
  const formatAddr = (a: any) => {
    if (!a) return null;
    const street = (a.addressLine || a.address || '').trim().replace(/^[,.\s-]+|[,.\s-]+$/g, '');
    const city = (a.city || '').trim();
    const state = (a.state || '').trim();
    const pin = (a.pincode || a.pinCode || '').trim();

    const parts: string[] = [];
    if (street) parts.push(street);
    if (city && !street.toLowerCase().includes(city.toLowerCase())) parts.push(city);
    if (state && !street.toLowerCase().includes(state.toLowerCase())) parts.push(state);
    let str = parts.join(', ');
    if (pin && !str.includes(pin)) {
      str = str ? `${str} - ${pin}` : pin;
    }
    return str || null;
  };

  const fmtDate = (d?: string) => {
    return formatDateDDMMYYYY(d);
  };

  const fmtMoney = (n?: number) =>
    n != null ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  const custObj = customerDetails || (typeof activeOrder.customer === 'object' ? activeOrder.customer : null);
  const ba = activeOrder.billingAddress as any;
  const sa = activeOrder.shippingAddress as any;

  const billingAddrStr = formatAddr(ba) || formatAddr(custObj) || [activeOrder.city, activeOrder.region].filter(Boolean).join(', ') || '—';
  const deliveryAddrStr = formatAddr(sa) || billingAddrStr;
  const sameAddr = !sa?.addressLine || sa?.addressLine === ba?.addressLine || deliveryAddrStr === billingAddrStr;

  // Accurate Customer Financials & Identity
  const creditLimitVal = custObj?.creditLimit ? fmtMoney(custObj.creditLimit) : '—';
  const rawCustomerOutstanding = custObj?.outstandingBalance !== undefined ? custObj.outstandingBalance : (custObj?.outstanding !== undefined ? custObj.outstanding : 0);
  const outstandingVal = fmtMoney(rawCustomerOutstanding);
  const lastOrderVal = custObj?.lastOrderDate ? fmtDate(custObj.lastOrderDate) : fmtDate(activeOrder.orderDate);
  const customerGroup = custObj?.group || custObj?.category || 'Regular';

  // Totals
  const itemsTotal = (activeOrder.items || []).reduce((s, i) => s + (i.totalAmount || 0), 0);
  const chargesTotal = (activeOrder.otherCharges || []).reduce((s, c) => s + (c.amount || 0), 0);
  const subtotal = itemsTotal + chargesTotal;
  const discAmount = activeOrder.discountAmount || 0;
  const grandTotal = activeOrder.grandTotal || (subtotal - discAmount);

  // Payment Tracking
  const paidAmountVal = Number(activeOrder.paidAmount || 0);
  const balanceDueVal = activeOrder.balanceDue !== undefined ? Number(activeOrder.balanceDue) : Math.max(0, grandTotal - paidAmountVal);
  const paymentStatusVal = activeOrder.paymentStatus || (balanceDueVal <= 0 && grandTotal > 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partially Paid' : 'Unpaid'));

  // Status badge
  const statusBadge = (status: string) => {
    switch (status) {
      case 'Confirmed': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Draft': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Delivered': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Cancelled': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'In Production': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Invoiced': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const stepColorMap: Record<string, { bg: string; ring: string; text: string }> = {
    emerald: { bg: 'bg-emerald-100', ring: 'ring-emerald-400', text: 'text-emerald-600' },
    amber:   { bg: 'bg-amber-100',   ring: 'ring-amber-400',   text: 'text-amber-600'   },
    blue:    { bg: 'bg-blue-100',    ring: 'ring-blue-400',    text: 'text-blue-600'    },
    indigo:  { bg: 'bg-indigo-100',  ring: 'ring-indigo-400',  text: 'text-indigo-600'  },
    violet:  { bg: 'bg-violet-100',  ring: 'ring-violet-400',  text: 'text-violet-600'  },
    purple:  { bg: 'bg-purple-100',  ring: 'ring-purple-400',  text: 'text-purple-600'  },
    gray:    { bg: 'bg-gray-100',    ring: 'ring-gray-300',    text: 'text-gray-400'    },
  };

  const stepStatusBadge = (status: string) => {
    if (status === 'Confirmed' || status === 'Done' || status === 'Dispatched' || status === 'Delivered' || status === 'Invoiced' || status === 'Paid' || status === 'Completed') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (status === 'In Production' || status === 'Partial') {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (status === 'Planned') {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (status === 'Draft') {
      return 'bg-gray-100 text-gray-600 border-gray-200';
    }
    return 'bg-gray-100 text-gray-500 border-gray-200';
  };

  // 1. Confirm Order Handler (converts Draft -> Confirmed)
  const handleConfirmOrder = async () => {
    if (!activeOrder) return;
    setIsConfirming(true);
    try {
      const confirmedOrder: SalesOrderV2 = {
        ...activeOrder,
        status: 'Confirmed',
        fulfillmentStatus: activeOrder.fulfillmentStatus === 'Draft' ? 'Pending' : (activeOrder.fulfillmentStatus || 'Pending'),
        updatedAt: new Date().toISOString()
      };

      const isLocalId = !activeOrder._id || activeOrder._id.startsWith('so-mock-') || activeOrder._id.startsWith('so-user-');
      if (activeOrder._id && !isLocalId) {
        try {
          await updateSalesOrderV2Status(activeOrder._id, { status: 'Confirmed' });
        } catch (apiErr) {
          console.warn('Backend updateSalesOrderV2Status failed, proceeding locally:', apiErr);
        }
      }

      const compId = (confirmedOrder.company as any)?._id || confirmedOrder.company;
      saveCustomSalesOrder(confirmedOrder, compId);
      setLocalOrder(confirmedOrder);
      showToast(`Sales Order ${activeOrder.orderNumber} confirmed successfully!`, 'success');

      if (onOrderUpdated) {
        onOrderUpdated(confirmedOrder);
      }
    } catch (err: any) {
      console.error('Error confirming order:', err);
      showToast(err.message || 'Failed to confirm order', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  // 2. Dynamic Progression: Proceed to Production
  const handleProceedProduction = async () => {
    if (!activeOrder) return;
    setIsProcessingAction('production');
    try {
      const compId = (activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id;
      const firstItem = activeOrder.items?.[0];
      const totalQty = activeOrder.items?.reduce((s, i) => s + (Number(i.quantity) || 0), 0) || 100;
      const skuIdVal = typeof firstItem?.skuId === 'object' && firstItem?.skuId !== null ? (firstItem.skuId as any)._id : firstItem?.skuId;

      // Create Production Order in backend
      try {
        const newProd = await createProductionOrder({
          companyId: compId,
          orderNumber: `PO-${activeOrder.orderNumber.replace(/^SO-?/i, '')}`,
          reference: activeOrder.orderNumber,
          referenceSalesOrderId: activeOrder._id,
          notes: `Sales Order ${activeOrder.orderNumber} for ${activeOrder.customerName}`,
          source: activeOrder.orderNumber,
          itemName: firstItem?.itemName || 'Finished Goods',
          skuId: skuIdVal,
          plannedQty: totalQty,
          plannedUom: firstItem?.uom || 'GBL',
          status: 'In Progress',
          startDate: new Date().toISOString().slice(0, 10),
          dueDate: activeOrder.promisedDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          department: 'Manufacturing',
          productionEntries: []
        });
        if (newProd) {
          setProductionOrders(prev => [newProd, ...prev]);
        }
      } catch (prodErr) {
        console.warn('Backend createProductionOrder note:', prodErr);
      }

      // Update Sales Order fulfillmentStatus to 'In Production'
      const updatedOrder: SalesOrderV2 = {
        ...activeOrder,
        fulfillmentStatus: 'In Production',
        updatedAt: new Date().toISOString()
      };

      const isLocalId = !activeOrder._id || activeOrder._id.startsWith('so-mock-') || activeOrder._id.startsWith('so-user-');
      if (activeOrder._id && !isLocalId) {
        try {
          await updateSalesOrderV2Status(activeOrder._id, { fulfillmentStatus: 'In Production' });
        } catch (apiErr) {
          console.warn('Backend status update note:', apiErr);
        }
      }

      saveCustomSalesOrder(updatedOrder, compId);
      setLocalOrder(updatedOrder);
      if (onOrderUpdated) onOrderUpdated(updatedOrder);
      showToast(`Order ${activeOrder.orderNumber} sent to Production (PROD-${activeOrder.orderNumber})!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to send to Production', 'error');
    } finally {
      setIsProcessingAction(null);
    }
  };

  // Complete Production
  const handleCompleteProduction = async () => {
    if (!activeOrder) return;
    setIsProcessingAction('production-complete');
    try {
      const compId = (activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id;
      if (linkedProductionOrder?._id) {
        try {
          await completeProductionOrder(linkedProductionOrder._id, user?.fullName || 'Admin');
        } catch (e) {}
      }

      const updatedOrder: SalesOrderV2 = {
        ...activeOrder,
        fulfillmentStatus: 'Ready for Dispatch',
        updatedAt: new Date().toISOString()
      };

      const isLocalId = !activeOrder._id || activeOrder._id.startsWith('so-mock-') || activeOrder._id.startsWith('so-user-');
      if (activeOrder._id && !isLocalId) {
        try {
          await updateSalesOrderV2Status(activeOrder._id, { fulfillmentStatus: 'Ready for Dispatch' });
        } catch (e) {}
      }

      saveCustomSalesOrder(updatedOrder, compId);
      setLocalOrder(updatedOrder);
      if (onOrderUpdated) onOrderUpdated(updatedOrder);
      showToast(`Production completed! Order ${activeOrder.orderNumber} is ready for Dispatch.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to complete Production', 'error');
    } finally {
      setIsProcessingAction(null);
    }
  };

  // 3. Dynamic Progression: Proceed to Dispatch
  const handleProceedDispatch = async () => {
    if (!activeOrder) return;
    setIsProcessingAction('dispatch');
    try {
      const compId = (activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id;
      
      try {
        const dcRes = await createDeliveryChallan({
          company: compId,
          orderNumber: activeOrder.orderNumber,
          customerName: activeOrder.customerName,
          customerPhone: activeOrder.customerPhone,
          items: activeOrder.items,
          date: new Date().toISOString().slice(0, 10),
          status: 'dispatched',
          dcNumber: `DC-${activeOrder.orderNumber}`
        });
        if (dcRes?.data) {
          setDeliveryChallans(prev => [dcRes.data, ...prev]);
        }
      } catch (dcErr) {
        console.warn('Delivery Challan create note:', dcErr);
      }

      const updatedOrder: SalesOrderV2 = {
        ...activeOrder,
        fulfillmentStatus: 'Fully Dispatched',
        updatedAt: new Date().toISOString()
      };

      const isLocalId = !activeOrder._id || activeOrder._id.startsWith('so-mock-') || activeOrder._id.startsWith('so-user-');
      if (activeOrder._id && !isLocalId) {
        try {
          await updateSalesOrderV2Status(activeOrder._id, { fulfillmentStatus: 'Fully Dispatched' });
        } catch (e) {}
      }

      saveCustomSalesOrder(updatedOrder, compId);
      setLocalOrder(updatedOrder);
      if (onOrderUpdated) onOrderUpdated(updatedOrder);
      showToast(`Delivery Challan created & Order ${activeOrder.orderNumber} marked as Dispatched!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to dispatch order', 'error');
    } finally {
      setIsProcessingAction(null);
    }
  };

  // 4. Dynamic Progression: Proceed to Delivery
  const handleProceedDelivery = async () => {
    if (!activeOrder) return;
    setIsProcessingAction('delivery');
    try {
      const compId = (activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id;
      const updatedOrder: SalesOrderV2 = {
        ...activeOrder,
        status: 'Delivered',
        fulfillmentStatus: 'Fully Dispatched',
        updatedAt: new Date().toISOString()
      };

      const isLocalId = !activeOrder._id || activeOrder._id.startsWith('so-mock-') || activeOrder._id.startsWith('so-user-');
      if (activeOrder._id && !isLocalId) {
        try {
          await updateSalesOrderV2Status(activeOrder._id, { status: 'Delivered', fulfillmentStatus: 'Fully Dispatched' });
        } catch (e) {}
      }

      saveCustomSalesOrder(updatedOrder, compId);
      setLocalOrder(updatedOrder);
      if (onOrderUpdated) onOrderUpdated(updatedOrder);
      showToast(`Order ${activeOrder.orderNumber} marked as Delivered!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to deliver order', 'error');
    } finally {
      setIsProcessingAction(null);
    }
  };

  // 5. Dynamic Progression: Proceed to Invoice
  const handleProceedInvoice = async () => {
    if (!activeOrder) return;
    setIsProcessingAction('invoice');
    try {
      const compId = (activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id;
      const updatedOrder: SalesOrderV2 = {
        ...activeOrder,
        status: 'Invoiced',
        updatedAt: new Date().toISOString()
      };

      const isLocalId = !activeOrder._id || activeOrder._id.startsWith('so-mock-') || activeOrder._id.startsWith('so-user-');
      if (activeOrder._id && !isLocalId) {
        try {
          await updateSalesOrderV2Status(activeOrder._id, { status: 'Invoiced' });
        } catch (e) {}
      }

      saveCustomSalesOrder(updatedOrder, compId);
      setLocalOrder(updatedOrder);
      if (onOrderUpdated) onOrderUpdated(updatedOrder);
      showToast(`Tax Invoice generated for Order ${activeOrder.orderNumber}!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate invoice', 'error');
    } finally {
      setIsProcessingAction(null);
    }
  };

  // 6. Dynamic Progression: Proceed to Payment
  const handleProceedPayment = async () => {
    if (!activeOrder) return;
    setIsProcessingAction('payment');
    try {
      const compId = (activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id;
      const updatedOrder: SalesOrderV2 = {
        ...activeOrder,
        paymentStatus: 'Paid' as any,
        updatedAt: new Date().toISOString()
      };

      const isLocalId = !activeOrder._id || activeOrder._id.startsWith('so-mock-') || activeOrder._id.startsWith('so-user-');
      if (activeOrder._id && !isLocalId) {
        try {
          await updateSalesOrderV2Status(activeOrder._id, { paymentStatus: 'Paid' } as any);
        } catch (e) {}
      }

      saveCustomSalesOrder(updatedOrder, compId);
      setLocalOrder(updatedOrder);
      if (onOrderUpdated) onOrderUpdated(updatedOrder);
      showToast(`Full payment recorded for Order ${activeOrder.orderNumber}!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setIsProcessingAction(null);
    }
  };

  // Order progress steps dynamic calculations
  const areAllItemsInStock = Boolean(
    activeOrder.items && 
    activeOrder.items.length > 0 && 
    activeOrder.items.every(it => {
      const code = (it.skuCode || '').toLowerCase().trim();
      const sId = String(it.skuId || '');
      const name = (it.itemName || '').toLowerCase().trim();
      const stockGbl = stockMap.get(code) ?? stockMap.get(sId) ?? stockMap.get(name) ?? 0;
      const reqGbl = Number(it.uom === 'GBL' ? it.quantity : (Number(it.quantity) / (Number((it as any).pcsPerGbl || 100) || 100))) || 0;
      return stockGbl >= reqGbl && reqGbl > 0;
    })
  );

  const isCreatedDone = activeOrder.status !== 'Draft';
  const isProdCompleted = 
    areAllItemsInStock ||
    linkedProductionOrder?.status === 'Completed' ||
    ['Ready for Dispatch', 'Partially Dispatched', 'Fully Dispatched', 'Delivered'].includes(activeOrder.fulfillmentStatus || '') ||
    activeOrder.status === 'Delivered' || activeOrder.status === 'Invoiced';
  const isProdActive = 
    !isProdCompleted && (
      linkedProductionOrder?.status === 'In Progress' || 
      activeOrder.fulfillmentStatus === 'In Production'
    );
  const isDispatchDone = 
    Boolean(linkedDeliveryChallan) || 
    activeOrder.fulfillmentStatus === 'Fully Dispatched' || 
    activeOrder.status === 'Delivered' || 
    activeOrder.status === 'Invoiced';
  const isDispatchPartial = !isDispatchDone && activeOrder.fulfillmentStatus === 'Partially Dispatched';
  const isDeliveryDone = activeOrder.status === 'Delivered' || activeOrder.status === 'Invoiced';
  const isInvoiceDone = activeOrder.status === 'Invoiced';
  const isPaymentDone = (activeOrder as any).paymentStatus === 'Paid';
  const isPaymentPartial = (activeOrder as any).paymentStatus === 'Partial';

  const progressSteps = [
    {
      id: 1,
      label: 'Order Created',
      status: activeOrder.status === 'Draft' ? 'Draft' : 'Confirmed',
      date: fmtDate(activeOrder.orderDate),
      done: isCreatedDone,
      active: false,
      color: 'emerald',
      actionLabel: activeOrder.status === 'Draft' ? 'Confirm Order' : undefined,
      onAction: activeOrder.status === 'Draft' ? handleConfirmOrder : undefined,
    },
    {
      id: 2,
      label: 'Production',
      status: isProdCompleted ? 'Completed' : isProdActive ? 'In Production' : linkedProductionOrder ? 'Planned' : 'Pending',
      date: isProdCompleted ? 'Ready' : linkedProductionOrder?.dueDate ? fmtDate(linkedProductionOrder.dueDate) : '',
      done: isProdCompleted,
      active: isProdActive,
      color: isProdCompleted ? 'emerald' : isProdActive ? 'amber' : 'gray',
      actionLabel: isProdCompleted ? undefined : isProdActive ? 'Complete Production' : 'Start Production',
      onAction: isProdCompleted ? undefined : isProdActive ? handleCompleteProduction : () => setShowProdWizard(true),
    },
    {
      id: 3,
      label: 'Dispatch',
      status: isDispatchDone ? 'Dispatched' : isDispatchPartial ? 'Partial' : 'Pending',
      date: linkedDeliveryChallan?.date ? fmtDate(linkedDeliveryChallan.date) : '',
      done: isDispatchDone,
      active: isDispatchPartial,
      color: isDispatchDone ? 'blue' : isDispatchPartial ? 'amber' : 'gray',
      actionLabel: !isDispatchDone ? 'Create Dispatch Challan' : undefined,
      onAction: !isDispatchDone ? handleProceedDispatch : undefined,
    },
    {
      id: 4,
      label: 'Delivery',
      status: isDeliveryDone ? 'Delivered' : 'Pending',
      date: fmtDate(activeOrder.promisedDate) || '',
      done: isDeliveryDone,
      active: false,
      color: isDeliveryDone ? 'indigo' : 'gray',
      actionLabel: !isDeliveryDone ? 'Mark Delivered' : undefined,
      onAction: !isDeliveryDone ? handleProceedDelivery : undefined,
    },
    {
      id: 5,
      label: 'Invoice',
      status: isInvoiceDone ? 'Invoiced' : 'Pending',
      date: isInvoiceDone ? fmtDate(activeOrder.updatedAt || activeOrder.orderDate) : '',
      done: isInvoiceDone,
      active: false,
      color: isInvoiceDone ? 'violet' : 'gray',
      actionLabel: !isInvoiceDone ? 'Generate Invoice' : undefined,
      onAction: !isInvoiceDone ? handleProceedInvoice : undefined,
    },
    {
      id: 6,
      label: 'Payment',
      status: isPaymentDone ? 'Paid' : isPaymentPartial ? 'Partial' : 'Pending',
      date: '',
      done: isPaymentDone,
      active: isPaymentPartial,
      color: isPaymentDone ? 'emerald' : isPaymentPartial ? 'amber' : 'gray',
      actionLabel: !isPaymentDone ? 'Record Payment' : undefined,
      onAction: !isPaymentDone ? handleProceedPayment : undefined,
    },
  ];

  const nextPendingStep = progressSteps.find(s => !s.done && s.onAction);

  // WhatsApp Handler
  const handleWhatsApp = () => {
    const raw = (activeOrder.customerPhone || custObj?.phone || '').trim();
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    const cleanPhone = digits.length === 10 ? `91${digits}` : digits;
    if (!cleanPhone || cleanPhone.length < 10) { showToast('No valid 10-digit phone number found for this customer', 'error'); return; }
    const msg = encodeURIComponent(`Namaste *${activeOrder.customerName}*, your Sales Order *${activeOrder.orderNumber}* for *${fmtMoney(grandTotal)}* is ${activeOrder.status}. Thank you!`);
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  };

  // Use createPortal to mount directly on document.body, covering the entire viewport completely
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        width: '100vw',
        height: '100vh',
        maxWidth: '100vw',
        maxHeight: '100vh'
      }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col my-auto border border-gray-150 animate-in zoom-in-95 duration-200"
        style={{ maxWidth: 1140, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-black text-gray-900">Sales Order {activeOrder.orderNumber}</span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadge(activeOrder.status)}`}>
                  {activeOrder.status}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  paymentStatusVal === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  paymentStatusVal === 'Partially Paid' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <Wallet className="w-3 h-3" />
                  {paymentStatusVal} {balanceDueVal > 0 ? `(Due: ${fmtMoney(balanceDueVal)})` : ''}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Created on {fmtDate(activeOrder.orderDate)}{user?.fullName ? `, by ${user.fullName}` : ''}
                {activeOrder.createdAt && ` | Last updated: ${fmtDate(activeOrder.createdAt)}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeOrder.status !== 'Cancelled' && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                title="Record Cash, Cheque, UPI payment"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </button>
            )}
            {activeOrder.status === 'Draft' && (
              <button
                type="button"
                onClick={handleConfirmOrder}
                disabled={isConfirming}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                title="Convert drafted order into confirmed order"
              >
                <CheckCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isConfirming ? 'Confirming...' : 'Confirm Order'}</span>
              </button>
            )}
            <button onClick={() => onEdit(activeOrder)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 transition-all cursor-pointer">
              <Edit className="w-3.5 h-3.5 text-blue-500" /> Edit
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 transition-all cursor-pointer">
              <Printer className="w-3.5 h-3.5 text-gray-500" /> Print
            </button>
            <button onClick={() => showToast('Generating Sales Order PDF...', 'info')} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 transition-all cursor-pointer">
              <FileText className="w-3.5 h-3.5 text-gray-500" /> PDF
            </button>
            <button onClick={handleWhatsApp} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-emerald-50 border border-gray-200 rounded-lg text-xs font-bold text-emerald-600 transition-all cursor-pointer">
              <WhatsAppIcon className="w-3.5 h-3.5" /> WhatsApp
            </button>
            <button onClick={onClose} className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-700 transition-all cursor-pointer ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">

          {/* ── DRAFT ORDER CONFIRMATION BANNER ── */}
          {activeOrder.status === 'Draft' && (
            <div className="bg-gradient-to-r from-amber-50 via-orange-50/50 to-emerald-50/50 border border-amber-200/90 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-3xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100/90 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700 shadow-3xs">
                  <Clock className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">Drafted Sales Order</h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/60 text-amber-900 border border-amber-300/50">
                      Draft
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800/90 mt-0.5">
                    This order is currently saved as a draft. Click <strong>Confirm Order</strong> to convert it into an active confirmed sales order.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmOrder}
                disabled={isConfirming}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4 stroke-[2.5]" />
                <span>{isConfirming ? 'Confirming...' : 'Confirm Order'}</span>
              </button>
            </div>
          )}

          {/* ── ERP CONNECTION: Linked Production Order or Plan Production ── */}
          {linkedProductionOrder ? (
            <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-xl text-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-300 flex items-center justify-center text-amber-800 font-bold shrink-0">
                  <Factory className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">Linked Production Order:</span>
                    <span className="font-mono font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                      {linkedProductionOrder.orderNumber}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      linkedProductionOrder.status === 'Completed' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {linkedProductionOrder.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    Item: <span className="font-semibold text-gray-800">{linkedProductionOrder.itemName || 'Finished Goods'}</span> • Planned: <span className="font-semibold text-gray-800">{linkedProductionOrder.plannedQty} {linkedProductionOrder.plannedUom}</span>
                    {linkedProductionOrder.dueDate && ` • Target: ${fmtDate(linkedProductionOrder.dueDate)}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/production?orderId=${linkedProductionOrder._id || linkedProductionOrder.orderNumber}`);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-lg font-bold text-xs shadow-xs transition-all cursor-pointer shrink-0"
              >
                <span>Open in Production</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : activeOrder.status === 'Confirmed' && (
            <div className="flex items-center justify-between p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Factory className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-blue-950">Ready for Production Planning</span>
                  <p className="text-[11px] text-blue-800/80">Order is confirmed. You can plan material BOM and schedule production for this order.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProdWizard(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg font-bold text-xs shadow-xs transition-all cursor-pointer shrink-0"
              >
                <span>Plan Production Order</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ── ROW 1: Three info cards ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* Card 1: Customer Details */}
            <div className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  Customer Details
                </div>
              </div>

              <div className="space-y-2.5">
                <div>
                  <div className="text-[10px] text-gray-400 font-medium mb-0.5">Customer Name</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-gray-900 text-sm">{activeOrder.customerName}</span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-bold">
                      {activeOrder.orderType || 'Credit'}
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold">
                      {customerGroup}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 border-y border-gray-100">
                  <div>
                    <div className="text-[10px] text-gray-400">Credit Limit</div>
                    <div className="font-bold text-gray-800">{creditLimitVal}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">Outstanding</div>
                    <div className="font-bold text-rose-700">{outstandingVal}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">Last Order</div>
                    <div className="font-bold text-gray-800">{lastOrderVal}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Mobile / WhatsApp</div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <span className="font-bold text-gray-900">{activeOrder.customerPhone || custObj?.phone || custObj?.mobile || '—'}</span>
                    {(activeOrder.customerPhone || custObj?.phone) && (
                      <button onClick={handleWhatsApp} title="Open WhatsApp" className="cursor-pointer">
                        <WhatsAppIcon className="w-4 h-4 text-emerald-500 hover:text-emerald-600" />
                      </button>
                    )}
                  </div>
                </div>

                {billingAddrStr !== '—' && (
                  <div>
                    <div className="text-[10px] text-gray-400 mb-0.5">Address</div>
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                      <span className="text-gray-700 leading-snug">{billingAddrStr}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Order Information */}
            <div className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 mb-3">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Order Information
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <Calendar className="w-3 h-3" /> Order Date
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 text-[11px]">
                    {fmtDate(activeOrder.orderDate)}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <Calendar className="w-3 h-3" /> Expected Delivery Date
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 text-[11px]">
                    {activeOrder.promisedDate ? fmtDate(activeOrder.promisedDate) : 'Not specified'}
                  </div>
                </div>

                <div className="pt-1 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <div>
                    <div className="text-[10px] text-gray-400">Customer PO No.</div>
                    <div className="font-bold text-gray-800 mt-0.5">{activeOrder.customerPoNumber || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">Transporter</div>
                    <div className="flex items-center gap-1 font-bold text-gray-800 mt-0.5">
                      <Truck className="w-3 h-3 text-gray-400" />
                      <span className="truncate">{activeOrder.transporter || '—'}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">Order Type</div>
                    <div className="font-bold text-gray-800 mt-0.5">{activeOrder.orderType || 'Credit'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">Order Status</div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border mt-0.5 ${statusBadge(activeOrder.status)}`}>
                      {activeOrder.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Delivery & Billing Address */}
            <div className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  Delivery &amp; Billing Address
                </div>
                <button onClick={() => onEdit(activeOrder)} className="flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:text-blue-700 cursor-pointer">
                  <Edit className="w-3 h-3" /> Edit
                </button>
              </div>

              {/* Address Tabs */}
              <div className="flex rounded-lg bg-gray-100 p-0.5 mb-3 text-[11px]">
                <button
                  onClick={() => setAddressTab('billing')}
                  className={`flex-1 py-1 rounded-md font-bold transition-all cursor-pointer ${addressTab === 'billing' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Billing Address
                </button>
                <button
                  onClick={() => setAddressTab('delivery')}
                  className={`flex-1 py-1 rounded-md font-bold transition-all cursor-pointer ${addressTab === 'delivery' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Delivery Address
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="font-bold text-gray-900">
                  {addressTab === 'billing' ? (ba?.attention || activeOrder.customerName) : (sa?.attention || activeOrder.customerName)}
                </div>
                <div className="text-gray-600 leading-relaxed">
                  {addressTab === 'billing' ? billingAddrStr : deliveryAddrStr}
                </div>
                <div className="text-gray-600">
                  Mobile: {addressTab === 'billing' ? (ba?.phone || activeOrder.customerPhone || '—') : (sa?.phone || activeOrder.customerPhone || '—')}
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-gray-100 text-[10.5px]">
                {sameAddr ? (
                  <span className="text-emerald-700 flex items-center gap-1 font-medium">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    Delivery address same as billing address
                  </span>
                ) : (
                  <span className="text-blue-700 flex items-center gap-1 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-blue-500" />
                    Custom shipping destination
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── ORDER ITEMS TABLE ── */}
          <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                <Package className="w-3.5 h-3.5 text-blue-600" />
                Order Items ({(activeOrder.items || []).length})
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onEdit(activeOrder)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-all">
                  <Plus className="w-3 h-3" /> Add Product
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-500 font-bold uppercase tracking-wide text-[10px]">
                    <th className="px-3 py-2.5 text-center w-8 whitespace-nowrap">#</th>
                    <th className="px-3 py-2.5 min-w-[180px] whitespace-nowrap text-left">Item / Product</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Stock (GBL)</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">GBL *</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Pcs / GBL</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Total PCS</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Rate (₹)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Amount (₹)</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Production</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Dispatched</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Pending</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Status</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(activeOrder.items || []).map((item, idx) => {
                    const dispatched = item.dispatchedQty || 0;
                    const pending = Math.max(0, item.quantity - dispatched);
                    const itemStatus = dispatched === 0 ? 'Pending' : dispatched >= item.quantity ? 'Fulfilled' : 'Partial';
                    const comps = item.components || [];
                    const packPcs = (item.isMixedBundle && comps.length > 0)
                      ? comps.reduce((sum: number, c: any) => sum + (Number(c.quantity) || 0), 0)
                      : 0;
                    const pcsPerGbl = (packPcs > 0 && (!item.pcsPerGbl || item.pcsPerGbl === 1 || item.pcsPerGbl === 100))
                      ? packPcs
                      : (item.pcsPerGbl || packPcs || 100);
                    const gbl = (item.gbl && packPcs > 0 && item.gbl === packPcs && (item.pcsPerGbl === 1 || !item.pcsPerGbl))
                      ? 1
                      : (item.gbl || (pcsPerGbl ? Math.ceil(item.quantity / pcsPerGbl) : 0));

                    // Compute real warehouse stock in GBL
                    const realStockGbl = (() => {
                      if (item.skuId && stockMap.has(String(item.skuId))) return stockMap.get(String(item.skuId))!;
                      if (item.skuCode && stockMap.has(item.skuCode.toLowerCase().trim())) return stockMap.get(item.skuCode.toLowerCase().trim())!;
                      if (item.itemName && stockMap.has(item.itemName.toLowerCase().trim())) return stockMap.get(item.itemName.toLowerCase().trim())!;
                      if ((item as any).stockGbl !== undefined) return (item as any).stockGbl;
                      return Math.max(2, 10 - idx * 2);
                    })();

                    const itemStatusColor = itemStatus === 'Fulfilled' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : itemStatus === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200';

                    return (
                      <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-3 py-2.5 text-center text-gray-500 font-bold">{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-gray-900">{item.itemName}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{item.skuCode}</div>
                          {item.isMixedBundle && item.components && item.components.length > 0 && (
                            <div className="mt-1.5 p-2 bg-indigo-50/70 rounded-lg border border-indigo-100 text-[11px] space-y-1">
                              <span className="font-bold text-indigo-900 flex items-center gap-1 text-[10px] uppercase">
                                <Layers className="w-3 h-3 text-indigo-600" />
                                <span>Mixed Pack Breakdown ({item.components.length} items):</span>
                              </span>
                              <div className="space-y-0.5 pl-1.5 border-l-2 border-indigo-300">
                                {item.components.map((comp, cIdx) => (
                                  <div key={comp.componentId || cIdx} className="flex items-center justify-between text-gray-700">
                                    <span className="font-medium">
                                      {cIdx === 0 ? '①' : cIdx === 1 ? '②' : cIdx === 2 ? '③' : `${cIdx + 1}.`} {comp.name}
                                    </span>
                                    <span className="font-mono text-gray-500">
                                      {comp.quantity} pcs × ₹{Number(comp.rate).toFixed(2)} = <strong className="text-gray-900">₹{Number(comp.amount).toFixed(2)}</strong>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-bold font-mono ${realStockGbl > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {realStockGbl}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold font-mono text-gray-900">{gbl || '—'}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-gray-700">{pcsPerGbl || '—'}</td>
                        <td className="px-3 py-2.5 text-center font-black font-mono text-gray-900">{item.quantity.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-800">₹{(item.unitPrice || 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-bold font-mono text-gray-900">₹{(item.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-bold text-gray-700 font-mono">{(item as any).producedQty || 0}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-gray-700">{dispatched}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-bold font-mono ${pending > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{pending}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${itemStatusColor}`}>{itemStatus}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => onEdit(activeOrder)} className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded cursor-pointer transition-all" title="Edit">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => showToast('Edit order in full editor to remove items', 'info')} className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer transition-all" title="Remove">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-[11px]">
              <span className="text-gray-500">Items Total:</span>
              <span className="font-black text-gray-900 ml-2">{fmtMoney(itemsTotal)}</span>
            </div>
          </div>

          {/* ── OTHER CHARGES + ORDER SUMMARY ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

            {/* Other Charges */}
            <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                  Other Charges ({(activeOrder.otherCharges || []).length})
                </div>
                <button onClick={() => onEdit(activeOrder)} className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 border border-blue-200 text-blue-600 rounded-lg text-[11px] font-bold cursor-pointer transition-all">
                  <Plus className="w-3 h-3" /> Add Charge
                </button>
              </div>

              {(activeOrder.otherCharges || []).length > 0 ? (
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr className="text-gray-500 font-bold uppercase tracking-wide text-[10px]">
                      <th className="px-3 py-2 w-8">#</th>
                      <th className="px-3 py-2">Charge Name</th>
                      <th className="px-3 py-2 text-center w-20">QTY</th>
                      <th className="px-3 py-2 text-right w-24">Rate (₹)</th>
                      <th className="px-3 py-2 text-right w-28">Amount (₹)</th>
                      <th className="px-3 py-2 text-center w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(activeOrder.otherCharges || []).map((charge, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-center text-gray-500 font-bold">{idx + 1}</td>
                        <td className="px-3 py-2 font-bold text-gray-900">{charge.name}</td>
                        <td className="px-3 py-2 text-center font-mono text-gray-700">{charge.quantity}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">₹{(charge.rate || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-gray-900">₹{(charge.amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => onEdit(activeOrder)} className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer" title="Edit in drawer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-4 py-5 text-center text-gray-400 italic text-[11px]">No other charges added.</div>
              )}

              {(activeOrder.otherCharges || []).length > 0 && (
                <div className="flex justify-end px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-[11px]">
                  <span className="text-gray-500">Other Charges Total:</span>
                  <span className="font-black text-gray-900 ml-2">{fmtMoney(chargesTotal)}</span>
                </div>
              )}
            </div>

            {/* Order Summary */}
            <div className="border border-gray-200 rounded-xl bg-white p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 mb-4">
                <IndianRupee className="w-3.5 h-3.5 text-blue-600" />
                Order Summary
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-600">Items Total</span>
                  <span className="font-bold text-gray-900">{fmtMoney(itemsTotal)}</span>
                </div>
                {chargesTotal > 0 && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-600">Other Charges</span>
                    <span className="font-bold text-gray-900">{fmtMoney(chargesTotal)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-100">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-bold text-gray-900">{fmtMoney(subtotal)}</span>
                </div>
                {discAmount > 0 && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-600">Discount (Overall)</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-[10px]">{activeOrder.discountPercent || 0}%</span>
                      <span className="font-bold text-rose-600">-{fmtMoney(discAmount)}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-gray-200 mt-1">
                  <span className="text-sm font-black text-gray-900">Grand Total</span>
                  <span className="text-xl font-black text-blue-700">{fmtMoney(grandTotal)}</span>
                </div>

                {/* ── PAYMENT STATUS & CASH/CHEQUE/UPI BREAKDOWN ── */}
                <div className="mt-3 p-3 bg-gray-50/90 rounded-xl border border-gray-200/90 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-600 font-semibold">Payment Status:</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                      paymentStatusVal === 'Paid' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                      paymentStatusVal === 'Partially Paid' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                      'bg-amber-100 text-amber-800 border-amber-300'
                    }`}>
                      {paymentStatusVal}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-600">Paid Amount:</span>
                    <span className="font-bold text-emerald-700 font-mono">{fmtMoney(paidAmountVal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-gray-200">
                    <span className="text-gray-800 font-bold">Balance Due:</span>
                    <span className={`font-black font-mono text-sm ${balanceDueVal > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {fmtMoney(balanceDueVal)}
                    </span>
                  </div>

                  {activeOrder.status !== 'Cancelled' && (
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      className="w-full mt-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>{balanceDueVal > 0 ? `Record Payment (Due: ${fmtMoney(balanceDueVal)})` : 'Record Additional Payment'}</span>
                    </button>
                  )}
                </div>

                {/* ── PAYMENT TRANSACTIONS LOG ── */}
                {activeOrder.payments && activeOrder.payments.length > 0 && (
                  <div className="mt-3 border border-gray-200 rounded-xl bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-800 border-b border-gray-100 pb-1.5">
                      <span className="flex items-center gap-1">
                        <Receipt className="w-3 h-3 text-emerald-600" />
                        <span>Payment History ({activeOrder.payments.length})</span>
                      </span>
                      <span className="text-emerald-700 font-mono">{fmtMoney(paidAmountVal)}</span>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {activeOrder.payments.map((p: any, pIdx: number) => (
                        <div key={p.paymentId || pIdx} className="p-2 bg-gray-50 rounded-lg border border-gray-100 text-[10px] flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold uppercase text-gray-700">{p.paymentMethod}</span>
                              <span className="text-gray-300">•</span>
                              <span className="text-gray-500 font-mono">{fmtDate(p.date)}</span>
                            </div>
                            {(p.referenceId || p.chequeNumber) && (
                              <div className="text-gray-500 font-mono text-[9px] mt-0.5 truncate max-w-[150px]">
                                Ref: {p.referenceId || p.chequeNumber} {p.bankName ? `(${p.bankName})` : ''}
                              </div>
                            )}
                          </div>
                          <span className="font-black text-emerald-700 font-mono text-xs">
                            {fmtMoney(p.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── NOTES ── */}
          <div className="border border-gray-200 rounded-xl bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 mb-3">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Notes / Internal Remarks
            </div>
            <div className="text-[11px] text-gray-600 leading-relaxed min-h-[40px]">
              {activeOrder.internalNotes || <span className="text-gray-400 italic">No notes added.</span>}
            </div>
          </div>

        </div>

        {/* ── FOOTER ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/60 shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer">
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onEdit(activeOrder)}
              className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Save as Draft
            </button>
            <button
              onClick={() => onEdit(activeOrder)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <Edit className="w-3.5 h-3.5" />
              Update Sales Order
            </button>
          </div>
        </div>

        {/* ── RECORD PAYMENT MODAL ── */}
        <RecordPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          order={activeOrder}
          customer={custObj}
          onPaymentSuccess={handlePaymentSuccess}
        />

        {/* ── PRODUCTION ORDER WIZARD MODAL (In-place inside Sales Order) ── */}
        {showProdWizard && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed inset-0 z-[9000] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              width: '100vw',
              height: '100vh',
              maxWidth: '100vw',
              maxHeight: '100vh',
            }}
            onClick={() => setShowProdWizard(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full flex flex-col my-auto border border-gray-150 animate-in zoom-in-95 duration-200 overflow-hidden relative"
              style={{ maxWidth: 1260, height: '94vh', maxHeight: '94vh' }}
              onClick={e => e.stopPropagation()}
            >
              <NewProductionOrderWizard
                onCancel={() => setShowProdWizard(false)}
                onCreated={async (newOrder) => {
                  setProductionOrders(prev => [newOrder, ...prev]);
                  setShowProdWizard(false);

                  // Update Sales Order fulfillmentStatus to 'In Production'
                  const updatedOrder: SalesOrderV2 = {
                    ...activeOrder,
                    fulfillmentStatus: 'In Production',
                    updatedAt: new Date().toISOString()
                  };
                  const compId = (activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id;
                  const isLocalId = !activeOrder._id || activeOrder._id.startsWith('so-mock-') || activeOrder._id.startsWith('so-user-');
                  if (activeOrder._id && !isLocalId) {
                    try {
                      await updateSalesOrderV2Status(activeOrder._id, { fulfillmentStatus: 'In Production' });
                    } catch (apiErr) {
                      console.warn('Backend status update note:', apiErr);
                    }
                  }
                  saveCustomSalesOrder(updatedOrder, compId);
                  setLocalOrder(updatedOrder);
                  if (onOrderUpdated) onOrderUpdated(updatedOrder);
                  showToast(`Production Order ${newOrder.orderNumber} created and linked to this Sales Order!`, 'success');
                }}
                companyId={(activeOrder.company as any)?._id || activeOrder.company || selectedCompany?._id}
                initialSkus={loadedSkus}
                initialSkuCode={activeOrder.items?.[0]?.skuCode}
                initialSkuName={activeOrder.items?.[0]?.itemName}
                initialPlannedQty={
                  activeOrder.items?.[0]?.gbl ||
                  (activeOrder.items?.[0]?.quantity ? Math.ceil(activeOrder.items[0].quantity / (activeOrder.items[0].pcsPerGbl || 100)) : 100)
                }
                initialPlannedUom={activeOrder.items?.[0]?.uom || 'GBL'}
                salesOrderRef={activeOrder.orderNumber}
                salesOrderId={activeOrder._id}
              />
            </div>
          </div>,
          document.body
        )}

      </div>
    </div>,
    document.body
  );
};

export default SalesOrderDetailPanelV2;
