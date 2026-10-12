import React, { useState, useEffect } from 'react';
import { X, Printer, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getParties } from '../../api/partyApi';
import {
  formatDcDate,
  printDeliveryChallan,
  DcPrintItem
} from '../../utils/printDeliveryChallan';

export interface ViewDeliveryChallanModalProps {
  isOpen: boolean;
  onClose: () => void;
  challan: any;
  onRevert?: (challan: any) => void;
}

export const ViewDeliveryChallanModal: React.FC<ViewDeliveryChallanModalProps> = ({
  isOpen,
  onClose,
  challan,
  onRevert
}) => {
  const { selectedCompany } = useAuth();
  const [customer, setCustomer] = useState<any | null>(null);

  // Fetch full customer details (address, pincode, city, phone) if available
  useEffect(() => {
    if (!isOpen || !challan) return;
    if (challan.customer && typeof challan.customer === 'object') {
      setCustomer(challan.customer);
      return;
    }

    const cName = challan.customerName;
    const compId = selectedCompany?._id;
    if (cName && compId) {
      getParties({ company: compId, search: cName, limit: 5 })
        .then(res => {
          const list = res.data?.parties || res.data || [];
          const match = list.find((p: any) => 
            (p.firmName || '').toLowerCase().trim() === cName.toLowerCase().trim() ||
            cName.toLowerCase().includes((p.firmName || '').toLowerCase().trim()) ||
            (p.firmName || '').toLowerCase().includes(cName.toLowerCase().trim())
          );
          if (match) setCustomer(match);
        })
        .catch(() => {});
    }
  }, [isOpen, challan, selectedCompany]);

  if (!isOpen || !challan) return null;

  // 1. Company Information (Dynamic according to selectedCompany)
  const companyName = (selectedCompany?.name || 'SRI KRISHNA BINDING WORKS').toUpperCase();
  const companyAddress = (selectedCompany?.address || '4TH CROSS ROAD , R R NAGAR , VIJAYAWADA - 520001').toUpperCase();
  const companyPhone = selectedCompany?.phone || selectedCompany?.mobile || selectedCompany?.contact || '9848047649';

  // 2. Consignee Details (Dynamic according to customer/challan)
  const custName = (customer?.firmName || challan.customerName || 'CUSTOMER').toUpperCase();
  const addr1 = (
    customer?.address1 ||
    customer?.area ||
    customer?.address ||
    challan.customerAddress ||
    challan.shippingAddress?.address ||
    ''
  ).toUpperCase();
  const city = customer?.city || challan.city || challan.shippingAddress?.city || '';
  const pincode = customer?.pincode || challan.pincode || challan.shippingAddress?.pincode || '';
  const cityPinLine = [city, pincode].filter(Boolean).join(' - ').toUpperCase();
  const custPhone = customer?.phone || customer?.mobile || customer?.whatsapp || challan.customerPhone || challan.phone || '';

  // 3. Metadata
  const dcNumber = challan.dcNumber ? String(challan.dcNumber).replace(/^DO-0*/, '') || challan.dcNumber : '—';
  const orderNumber = challan.orderNumber ? String(challan.orderNumber).replace(/^SO-0*/, '') || challan.orderNumber : '—';
  const dcDate = formatDcDate(challan.date || challan.createdAt || new Date());

  // 4. Transporter
  const transporter = (
    challan.transporterName ||
    challan.transporter ||
    customer?.preferredTransport ||
    challan.transport ||
    '—'
  ).toUpperCase().replace(/\s+/g, '');

  // 5. Items and Totals
  const items: DcPrintItem[] = Array.isArray(challan.items) ? challan.items : [];
  let totalGblSum = 0;

  const calculatedItems = items.map((it: any) => {
    let qtyGbl = 0;
    if (it.gbl !== undefined && it.gbl !== null) {
      qtyGbl = Number(it.gbl) || 0;
    } else if (it.deliveredGbl !== undefined && it.deliveredGbl !== null) {
      qtyGbl = Number(it.deliveredGbl) || 0;
    } else if (String(it.uom || '').toUpperCase() === 'GBL') {
      qtyGbl = Number(it.deliveredQty ?? it.quantity ?? 0);
    } else if (it.pcsPerGbl && Number(it.pcsPerGbl) > 0) {
      qtyGbl = Math.ceil(Number(it.deliveredQty ?? it.quantity ?? 0) / Number(it.pcsPerGbl));
    } else {
      qtyGbl = Number(it.deliveredQty ?? it.quantity ?? 0);
    }
    totalGblSum += qtyGbl;

    const subText = (it.coverPacking || it.description || it.remarks || it.notes || '').toUpperCase();
    return {
      ...it,
      qtyGbl,
      subText
    };
  });

  const handlePrint = () => {
    printDeliveryChallan(challan, selectedCompany, customer);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-gray-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-left"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Action Bar */}
        <div className="px-6 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-gray-500">Delivery Challan</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
              {challan.dcNumber || 'DC-001'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRevert && (
              <button
                onClick={() => onRevert(challan)}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95"
                title="Revert Delivery Challan & Restore Stock"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                <span>Revert Challan</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95"
              title="Print Delivery Challan"
            >
              <Printer className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>Print Challan</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Challan Sheet Preview (Exact template matching user reference) */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-100/60 flex justify-center">
          <div className="bg-white border border-gray-200/90 shadow-sm rounded-lg w-full max-w-[760px] p-6 text-gray-900 font-sans">
            
            {/* ── 1. HEADER ── */}
            <div className="flex justify-between items-start mb-2">
              <div>
                <h1 className="text-xl font-black text-[#0b2545] uppercase tracking-tight leading-snug">
                  {companyName}
                </h1>
                <p className="text-[11px] font-bold text-slate-800 uppercase mt-0.5 tracking-wide">
                  {companyAddress}
                </p>
                <p className="text-[11.5px] font-semibold text-slate-600 mt-0.5">
                  Contact : {companyPhone}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <div className="w-[72px] h-[48px] bg-[#e0f2fe] rounded-md flex items-center justify-center text-3xl font-black text-[#0b2545] tracking-widest shadow-2xs">
                  DC
                </div>
                <span className="text-[10px] text-slate-400 mt-1">Page 1 of 1</span>
              </div>
            </div>

            {/* ── 2. TITLE BANNER ── */}
            <div className="w-full bg-[#e8f1fc] border border-[#cbd5e1] rounded py-1.5 text-center my-2.5">
              <h2 className="text-lg font-extrabold text-[#0b2545] tracking-wide">
                Delivery Challan
              </h2>
            </div>

            {/* ── 3. CONSIGNEE & METADATA CARD ── */}
            <div className="flex border border-[#cbd5e1] rounded mb-3 bg-white overflow-hidden">
              {/* Left Column: Consignee */}
              <div className="flex-[1.6] p-2.5 border-r border-[#cbd5e1] space-y-0.5 text-xs">
                <div className="text-[10.5px] text-slate-500 font-medium">Consignee / Deliver To</div>
                <div className="text-[12.5px] font-black text-slate-900 uppercase leading-snug">
                  {custName}
                </div>
                {addr1 && <div className="text-[11px] font-semibold text-slate-800 uppercase">{addr1}</div>}
                {cityPinLine && <div className="text-[11px] font-semibold text-slate-800 uppercase">{cityPinLine}</div>}
                {custPhone && <div className="text-[11px] font-semibold text-slate-800">Phone : {custPhone}</div>}
              </div>

              {/* Right Column: DC Metadata */}
              <div className="flex-1 p-2.5 flex flex-col justify-center space-y-1.5 text-xs">
                <div className="flex">
                  <span className="w-20 font-semibold text-slate-700">DC No.</span>
                  <span className="w-4 font-semibold text-slate-700 text-center">:</span>
                  <span className="font-bold text-slate-900 flex-1">{dcNumber}</span>
                </div>
                <div className="flex">
                  <span className="w-20 font-semibold text-slate-700">Date</span>
                  <span className="w-4 font-semibold text-slate-700 text-center">:</span>
                  <span className="font-bold text-slate-900 flex-1">{dcDate}</span>
                </div>
                <div className="flex">
                  <span className="w-20 font-semibold text-slate-700">Order No.</span>
                  <span className="w-4 font-semibold text-slate-700 text-center">:</span>
                  <span className="font-bold text-slate-900 flex-1">{orderNumber}</span>
                </div>
              </div>
            </div>

            {/* ── 4. ITEMS TABLE ── */}
            <div className="border border-[#cbd5e1] rounded overflow-hidden mb-3">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#e8f1fc] text-[#0b2545] border-b border-[#cbd5e1]">
                    <th className="py-1.5 px-2 font-black border-r border-[#cbd5e1] text-center w-[7%]">S.No.</th>
                    <th className="py-1.5 px-3 font-black border-r border-[#cbd5e1] text-center w-[78%]">Item Name</th>
                    <th className="py-1.5 px-2 font-black text-center w-[15%]">Qty (GBL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cbd5e1]">
                  {calculatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-400 italic">
                        No items in this delivery challan
                      </td>
                    </tr>
                  ) : (
                    calculatedItems.map((it, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-1.5 px-2 text-center font-bold text-slate-700 border-r border-[#cbd5e1]">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 px-3 border-r border-[#cbd5e1]">
                          <div className="font-bold text-slate-900 uppercase">
                            {it.itemName || it.skuCode || 'ITEM'}
                          </div>
                          {it.subText && (
                            <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">
                              {it.subText}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center font-black text-slate-900">
                          {it.qtyGbl}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ── 5. BOTTOM TOTAL BAR ── */}
            <div className="bg-[#e8f1fc] border border-[#cbd5e1] rounded px-4 py-2 flex items-center justify-between text-xs font-black text-[#0b2545]">
              <div className="uppercase tracking-wide">
                Transporter : &nbsp;{transporter}
              </div>
              <div className="flex items-center gap-8">
                <span className="tracking-wider">TOTAL</span>
                <span className="text-[13px]">{totalGblSum} GBL</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewDeliveryChallanModal;
