import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Save, Plus, Trash2, Search, ChevronDown, Calendar, User, Package, 
  AlertCircle, FileText, Check, Percent, X, MoreVertical, Edit2, 
  Phone, MapPin, Receipt, Truck, Copy, ExternalLink, Eye, Building2,
  Settings, Zap, Sparkles, RefreshCw
} from 'lucide-react';
import Modal from '../ui/Modal';
import { getSkusV2, getBalancesV2, SkuV2 } from '../../api/mfgApiV2';
import { getParties } from '../../api/partyApi';
import { 
  createSalesOrderV2, 
  updateSalesOrderV2, 
  getNextSalesOrderNumberV2, 
  SalesOrderV2, 
  SalesOrderItemV2, 
  OtherChargeItem 
} from '../../api/salesOrderApiV2';
import { MOCK_SALES_ORDERS_V2 } from './salesOrderSampleData';

import { showToast } from '../ui/Toast';

interface SalesOrderDrawerV2Props {
  isOpen: boolean;
  companyId: string;
  companyState?: string;
  editOrder?: SalesOrderV2 | null;
  onClose: () => void;
  onSaveSuccess: (savedOrder: SalesOrderV2) => void;
}

interface OrderItemRow {
  skuId: string;
  skuCode: string;
  itemName: string;
  description: string;
  category: string;
  uom: string;
  stockPcs?: number;
  stockGbl: number | null;
  gbl: number | string;
  pcsPerGbl: number | string;
  totalPcs: number;
  rate: number | string;
  discPercent: number | string;
  discAmount: number;
  amount: number;
}

interface AddressDetails {
  attention: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
}

// Master pool of customers ensuring ALL customers appear across the system
const BASE_CUSTOMERS = [
  { _id: 'cust-1', firmName: 'Sri Durga Venkateswara Books', ownerName: 'Venkatesh', phone: '9966259732', address: '3-1-825/25, Vinayaka Chowk', city: 'Tirupati', state: 'Andhra Pradesh', pincode: '517501', creditLimit: 40000, outstandingBalance: 12450, preferredTransport: 'Chennupati Cargo Services', lastOrderDate: '2026-09-15', group: 'A Grade' },
  { _id: 'cust-2', firmName: 'Malleswari Stationery', ownerName: 'Malleswar Rao', phone: '9246912503', address: 'Shop 14, Main Road', city: 'Nizamabad', state: 'Telangana', pincode: '503001', creditLimit: 50000, outstandingBalance: 8200, preferredTransport: 'Navata Road Transport', lastOrderDate: '2026-09-12', group: 'A Grade' },
  { _id: 'cust-3', firmName: 'Laxmi Book Center', ownerName: 'Laxmi Narayana', phone: '9988776655', address: 'Beside Bus Complex', city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '520001', creditLimit: 75000, outstandingBalance: 18430, preferredTransport: 'VRL Logistics', lastOrderDate: '2026-09-20', group: 'A Grade' },
  { _id: 'cust-4', firmName: 'Sree Venkatesh Books', ownerName: 'Venkateshwarlu', phone: '9876543210', address: 'Court Road, Trunk Road', city: 'Kadapa', state: 'Andhra Pradesh', pincode: '516001', creditLimit: 30000, outstandingBalance: 9780, preferredTransport: 'Kranti Transport', lastOrderDate: '2026-09-10', group: 'Regular' },
  { _id: 'cust-5', firmName: 'Raju Stationers', ownerName: 'Raju', phone: '9123456780', address: 'Gandhi Road', city: 'Ongole', state: 'Andhra Pradesh', pincode: '523001', creditLimit: 25000, outstandingBalance: 4860, preferredTransport: 'Navata Road Transport', lastOrderDate: '2026-09-08', group: 'Regular' },
  { _id: 'cust-6', firmName: 'Modern Books', ownerName: 'Ramesh Gupta', phone: '9988112233', address: 'Abids, Main Circle', city: 'Hyderabad', state: 'Telangana', pincode: '500001', creditLimit: 100000, outstandingBalance: 21400, preferredTransport: 'Chennupati Cargo Services', lastOrderDate: '2026-09-14', group: 'A Grade' },
  { _id: 'cust-7', firmName: 'Srinivasa Book House', ownerName: 'Srinivasulu', phone: '9012345678', address: 'Pogathota, Main Bazaar', city: 'Nellore', state: 'Andhra Pradesh', pincode: '524001', creditLimit: 35000, outstandingBalance: 7320, preferredTransport: 'Navata Road Transport', lastOrderDate: '2026-09-11', group: 'Regular' },
  { _id: 'cust-8', firmName: 'Vidyarthi Stationery', ownerName: 'Murthy', phone: '9494949494', address: 'High Road', city: 'Chittoor', state: 'Andhra Pradesh', pincode: '517001', creditLimit: 40000, outstandingBalance: 5960, preferredTransport: 'VRL Logistics', lastOrderDate: '2026-09-09', group: 'Regular' },
  { _id: 'cust-9', firmName: 'Krishna Book Depot', ownerName: 'Krishna Murthy', phone: '9988223344', address: 'Park Road, Old City', city: 'Kurnool', state: 'Andhra Pradesh', pincode: '518001', creditLimit: 45000, outstandingBalance: 11250, preferredTransport: 'Kranti Transport', lastOrderDate: '2026-09-07', group: 'Regular' },
  { _id: 'cust-10', firmName: 'Sai Balaji Stationers', ownerName: 'Balaji', phone: '9865321478', address: 'Hanamkonda Main Road', city: 'Warangal', state: 'Telangana', pincode: '506001', creditLimit: 50000, outstandingBalance: 8400, preferredTransport: 'Navata Road Transport', lastOrderDate: '2026-09-05', group: 'Regular' },
  { _id: 'cust-11', firmName: 'ABC Educational Supplies', ownerName: 'Rajesh Kumar', phone: '9876543210', address: 'MG Road, Commercial Street', city: 'Bangalore', state: 'Karnataka', pincode: '560001', creditLimit: 50000, outstandingBalance: 25000, preferredTransport: 'VRL Logistics', lastOrderDate: '2026-08-28', group: 'A Grade' },
  { _id: 'cust-12', firmName: 'XYZ School Supplies', ownerName: 'Priya Sharma', phone: '9876543212', address: 'Brigade Road, 2nd Floor', city: 'Bangalore', state: 'Karnataka', pincode: '560025', creditLimit: 40000, outstandingBalance: 15000, preferredTransport: 'Chennupati Cargo Services', lastOrderDate: '2026-08-25', group: 'Regular' },
  { _id: 'cust-13', firmName: 'Modern College Store', ownerName: 'Amit Patel', phone: '9876543214', address: 'Residency Road, Shantinagar', city: 'Bangalore', state: 'Karnataka', pincode: '560027', creditLimit: 60000, outstandingBalance: 30000, preferredTransport: 'VRL Logistics', lastOrderDate: '2026-08-30', group: 'A Grade' },
  { _id: 'cust-14', firmName: 'Kalyani Book Center', ownerName: 'Subba Rao', phone: '9848123456', address: 'Brodipet 4th Line', city: 'Guntur', state: 'Andhra Pradesh', pincode: '522002', creditLimit: 50000, outstandingBalance: 14200, preferredTransport: 'Navata Road Transport', lastOrderDate: '2026-09-01', group: 'A Grade' },
  { _id: 'cust-15', firmName: 'Sri Rama Stationery Mart', ownerName: 'Rama Rao', phone: '9440192834', address: 'Daba Gardens, Main Road', city: 'Visakhapatnam', state: 'Andhra Pradesh', pincode: '530020', creditLimit: 80000, outstandingBalance: 22000, preferredTransport: 'Chennupati Cargo Services', lastOrderDate: '2026-09-03', group: 'A Grade' },
  { _id: 'cust-16', firmName: 'Balaji Paper & Books', ownerName: 'Srinivasa Reddy', phone: '9866012398', address: 'Main Road, Kotagummam', city: 'Rajahmundry', state: 'Andhra Pradesh', pincode: '533101', creditLimit: 45000, outstandingBalance: 9500, preferredTransport: 'Navata Road Transport', lastOrderDate: '2026-08-20', group: 'Regular' },
  { _id: 'cust-17', firmName: 'Navata Stationers', ownerName: 'Narayana', phone: '9849201928', address: 'Cinema Road', city: 'Kakinada', state: 'Andhra Pradesh', pincode: '533001', creditLimit: 40000, outstandingBalance: 11000, preferredTransport: 'Navata Road Transport', lastOrderDate: '2026-08-22', group: 'Regular' },
  { _id: 'cust-18', firmName: 'Venkateswara Educational Stores', ownerName: 'Prasad', phone: '9441829304', address: 'RR Pet', city: 'Eluru', state: 'Andhra Pradesh', pincode: '534002', creditLimit: 35000, outstandingBalance: 6800, preferredTransport: 'Kranti Transport', lastOrderDate: '2026-08-24', group: 'Regular' },
  { _id: 'cust-19', firmName: 'Saraswathi Book Depot', ownerName: 'Gopal', phone: '9848901234', address: 'Tower Circle', city: 'Karimnagar', state: 'Telangana', pincode: '505001', creditLimit: 50000, outstandingBalance: 16400, preferredTransport: 'Navata Road Transport', lastOrderDate: '2026-08-18', group: 'Regular' },
  { _id: 'cust-20', firmName: 'Pragati Paper Mart', ownerName: 'Mohan Lal', phone: '9908123456', address: 'Sultan Bazaar', city: 'Hyderabad', state: 'Telangana', pincode: '500095', creditLimit: 120000, outstandingBalance: 31000, preferredTransport: 'Chennupati Cargo Services', lastOrderDate: '2026-09-04', group: 'A Grade' }
];

// Combine base customers and all sample customers from sales orders
const ALL_SYSTEM_CUSTOMERS: any[] = (() => {
  const map = new Map<string, any>();
  BASE_CUSTOMERS.forEach(c => map.set(c.firmName.toLowerCase().trim(), c));
  MOCK_SALES_ORDERS_V2.forEach(o => {
    const key = (o.customerName || '').toLowerCase().trim();
    if (key && !map.has(key)) {
      map.set(key, {
        _id: `mock-cust-${key.replace(/[^a-z0-9]/g, '-')}`,
        firmName: o.customerName,
        ownerName: o.customerName,
        phone: o.customerPhone || '9848012345',
        address: `${o.city || 'Main Road'}, ${o.region || 'Andhra Pradesh'}`,
        city: o.city || 'Tirupati',
        state: o.region || 'Andhra Pradesh',
        pincode: '517501',
        creditLimit: 50000,
        outstandingBalance: 12500,
        group: 'A Grade'
      });
    }
  });
  return Array.from(map.values());
})();

// Master Finished Goods products ensuring products are ALWAYS present in Item Master
const MASTER_PRODUCT_SKUS: SkuV2[] = [
  { _id: 'sku-p-0', skuCode: 'FG-SK-112', name: '112P COLLGE STYLE KING (MR)', category: 'Finished Goods', unit: 'Pcs', booksGbl: 120, altUnitConversion: 120, status: 'Active', brand: 'Style King', pages: 112 },
  { _id: 'sku-p-1', skuCode: 'FG-001', name: '132P Happy Days Notebook (UR) · 57x70 CM', category: 'Finished Goods', unit: 'Pcs', booksGbl: 120, altUnitConversion: 120, status: 'Active', brand: 'Happy Days', gsm: 52, pages: 132 },
  { _id: 'sku-p-2', skuCode: 'FG-002', name: '220P Classmate Longbook (SR) · 18x24 CM', category: 'Finished Goods', unit: 'Pcs', booksGbl: 80, altUnitConversion: 80, status: 'Active', brand: 'Classmate', gsm: 56, pages: 220 },
  { _id: 'sku-p-3', skuCode: 'FG-003', name: 'Hardbound Executive Diary 2026', category: 'Finished Goods', unit: 'Pcs', booksGbl: 50, altUnitConversion: 50, status: 'Active', brand: 'Navneet', gsm: 70, pages: 300 },
  { _id: 'sku-p-4', skuCode: 'FG-004', name: '192P Premium Drawing Book · A4', category: 'Finished Goods', unit: 'Pcs', booksGbl: 100, altUnitConversion: 100, status: 'Active', brand: 'Happy Days', gsm: 100, pages: 192 },
  { _id: 'sku-p-5', skuCode: 'FG-005', name: '300P Hardbound Account Register', category: 'Finished Goods', unit: 'Pcs', booksGbl: 40, altUnitConversion: 40, status: 'Active', brand: 'Classmate', pages: 300 },
  { _id: 'sku-p-6', skuCode: 'NB-A4-192', name: 'Classmate A4 Notebook 192 Pages Single Line', category: 'Notebooks', unit: 'Pcs', booksGbl: 100, altUnitConversion: 100, status: 'Active', brand: 'Classmate', pages: 192 },
  { _id: 'sku-p-7', skuCode: 'NB-LB-160', name: 'Classmate Long Book 160 Pages Ruled', category: 'Notebooks', unit: 'Pcs', booksGbl: 120, altUnitConversion: 120, status: 'Active', brand: 'Classmate', pages: 160 },
  { _id: 'sku-p-8', skuCode: 'GB-SP-64', name: 'Graph Book 64 Pages Spiral Bound', category: 'Finished Goods', unit: 'Pcs', booksGbl: 150, altUnitConversion: 150, status: 'Inactive', brand: 'SKBW Deluxe', pages: 64 },
  { _id: 'sku-p-9', skuCode: 'PR-PHY-120', name: 'Practical Record Book Physics 120 Pages', category: 'Registers', unit: 'Pcs', booksGbl: 80, altUnitConversion: 80, status: 'Active', brand: 'Happy Days', pages: 120 },
  { _id: 'sku-p-10', skuCode: 'DRY-EX-26', name: 'Executive Leather Diary 2026', category: 'Diaries', unit: 'Pcs', booksGbl: 50, altUnitConversion: 50, status: 'Inactive', brand: 'Navneet', pages: 350 },
  { _id: 'sku-p-11', skuCode: 'NB-SP-240', name: 'Deluxe College Spiral Notebook 240 Pages', category: 'Notebooks', unit: 'Pcs', booksGbl: 60, altUnitConversion: 60, status: 'Active', brand: 'Classmate', pages: 240 },
  { _id: 'sku-p-12', skuCode: 'SB-A3-32', name: 'Kids Activity Scrap Book A3 32 Pages', category: 'Drawing Books', unit: 'Pcs', booksGbl: 120, altUnitConversion: 120, status: 'Active', brand: 'Happy Days', pages: 32 }
];

// Helper to strictly ensure ONLY products itself are included (no raw materials, no semi-finished)
const isOnlyProduct = (s: SkuV2) => {
  const cat = (s.category || '').toLowerCase().trim();
  const name = (s.name || '').toLowerCase();
  const code = (s.skuCode || '').toUpperCase().trim();
  // Exclude raw materials
  if (cat.includes('raw') || cat.includes('material') || cat.includes('reel') || cat.includes('board') || code.startsWith('RM-') || code.startsWith('RM') || name.includes('wire') || name.includes('adhesive') || name.includes('glue')) {
    return false;
  }
  // Exclude semi-finished
  if (cat.includes('semi') || cat.includes('wip') || code.startsWith('SM-') || code.startsWith('SEM') || code.startsWith('SFG') || code.startsWith('SF') || name.includes('ruled cut') || name.includes('inner signature') || name.includes('book block')) {
    return false;
  }
  return true;
};

export interface PredefinedCharge {
  id: string;
  name: string;
  defaultRate: number;
  calculationType: 'per_gbl' | 'fixed';
}

export const DEFAULT_PREDEFINED_CHARGES: PredefinedCharge[] = [
  { id: 'ch-hamali', name: 'Hamali / Loading Charges', defaultRate: 5, calculationType: 'per_gbl' },
  { id: 'ch-unloading', name: 'Unloading Charges', defaultRate: 5, calculationType: 'per_gbl' },
  { id: 'ch-freight', name: 'Freight / Transport Charges', defaultRate: 15, calculationType: 'per_gbl' },
  { id: 'ch-packing', name: 'Packing & Bundling Charges', defaultRate: 10, calculationType: 'per_gbl' },
  { id: 'ch-cartage', name: 'Local Cartage / Auto', defaultRate: 250, calculationType: 'fixed' },
  { id: 'ch-delivery', name: 'Door Delivery Charges', defaultRate: 300, calculationType: 'fixed' },
  { id: 'ch-insurance', name: 'Transit Insurance', defaultRate: 100, calculationType: 'fixed' },
  { id: 'ch-handling', name: 'Handling Charges', defaultRate: 4, calculationType: 'per_gbl' }
];

// Custom WhatsApp SVG Icon
const WhatsAppIcon: React.FC<{ className?: string }> = ({ 
  className = "w-3.5 h-3.5 text-emerald-500 hover:text-emerald-600 transition-all block shrink-0" 
}) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.705 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// Clean string helper: strips null, undefined, '-', '—', 'n/a' and outer commas/hyphens
const cleanAddressVal = (val?: any): string => {
  if (!val) return '';
  const str = String(val).trim();
  if (
    str === '-' || 
    str === '—' || 
    str.toLowerCase() === 'null' || 
    str.toLowerCase() === 'undefined' || 
    str.toLowerCase() === 'n/a' || 
    str.toLowerCase() === 'na' ||
    str.toLowerCase() === 'none'
  ) {
    return '';
  }
  return str.replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();
};

export const formatCustomerStreetAddress = (c: any): string => {
  if (!c) return '';
  const door = cleanAddressVal(c.doorNo || c.flatNo);
  const street = cleanAddressVal(c.streetName || c.street);
  const addr1 = cleanAddressVal(c.address1);
  const addrLegacy = cleanAddressVal(c.address);
  const area = cleanAddressVal(c.area || c.locality);
  const landmark = cleanAddressVal(c.landmark);

  let formattedDoor = door;
  if (formattedDoor && !formattedDoor.toLowerCase().startsWith('d.no') && !formattedDoor.toLowerCase().startsWith('no.') && !formattedDoor.toLowerCase().startsWith('flat') && !formattedDoor.toLowerCase().startsWith('door')) {
    formattedDoor = `D.No: ${formattedDoor}`;
  }

  const parts = [
    formattedDoor,
    street,
    addr1,
    addrLegacy,
    area,
    landmark ? (landmark.toLowerCase().startsWith('near') || landmark.toLowerCase().startsWith('opp') ? landmark : `Near ${landmark}`) : ''
  ];

  const cleanParts: string[] = [];
  const seen = new Set<string>();
  parts.forEach(p => {
    const val = cleanAddressVal(p);
    if (!val) return;
    const lower = val.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      cleanParts.push(val);
    }
  });

  return cleanParts.join(', ');
};

export const formatCustomerFullAddress = (c: any, fallback?: string): string => {
  if (!c) {
    const fb = cleanAddressVal(fallback);
    return fb || '—';
  }
  
  const street = formatCustomerStreetAddress(c);
  const city = cleanAddressVal(c.city || c.assignedMarket);
  const district = cleanAddressVal(c.district);
  const state = cleanAddressVal(c.state);
  const pincode = cleanAddressVal(c.pincode || c.pinCode);

  const parts = [
    street,
    city,
    district && district.toLowerCase() !== city.toLowerCase() ? district : '',
    state,
    pincode
  ];

  const cleanParts: string[] = [];
  const seen = new Set<string>();
  parts.forEach(p => {
    const val = cleanAddressVal(p);
    if (!val) return;
    const lower = val.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      cleanParts.push(val);
    }
  });

  if (cleanParts.length > 0) {
    return cleanParts.join(', ');
  }

  const fb = cleanAddressVal(fallback);
  return fb || '—';
};

export const SalesOrderDrawerV2: React.FC<SalesOrderDrawerV2Props> = ({
  isOpen,
  companyId,
  companyState = 'Andhra Pradesh',
  editOrder,
  onClose,
  onSaveSuccess
}) => {
  // Core Identification
  const [orderNumber, setOrderNumber] = useState('');

  // Customer State (Blank by default when new)
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customersList, setCustomersList] = useState<any[]>(ALL_SYSTEM_CUSTOMERS);
  const [showCustomerDetailsModal, setShowCustomerDetailsModal] = useState(false);

  // Order Info State (100% BLANK BY DEFAULT WHEN NEW - NO DEFAULT VALUES)
  const [orderDate, setOrderDate] = useState<string>('');
  const [promisedDate, setPromisedDate] = useState<string>('');
  const [transporter, setTransporter] = useState<string>('');
  const [transporterList, setTransporterList] = useState<string[]>([
    'Chennupati Cargo Services',
    'VRL Logistics',
    'Navata Road Transport',
    'Kranti Transport',
    'Direct / Self Pickup'
  ]);
  const [orderType, setOrderType] = useState<'' | 'Credit' | 'Cash'>('');
  const [orderStatus, setOrderStatus] = useState<string>('');

  // Addresses State (Functional & Editable)
  const [sameAddress, setSameAddress] = useState(true);
  const [activeAddressTab, setActiveAddressTab] = useState<'bill' | 'ship'>('bill');
  const [isEditingAddress, setIsEditingAddress] = useState(false);

  const [billingAddress, setBillingAddress] = useState<AddressDetails>({
    attention: '',
    addressLine: '',
    city: '',
    state: '',
    pincode: '',
    phone: ''
  });

  const [shippingAddress, setShippingAddress] = useState<AddressDetails>({
    attention: '',
    addressLine: '',
    city: '',
    state: '',
    pincode: '',
    phone: ''
  });

  // Items State (Empty by default when new)
  const [availableSkus, setAvailableSkus] = useState<SkuV2[]>(MASTER_PRODUCT_SKUS);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [rowSearchTerms, setRowSearchTerms] = useState<{ [key: number]: string }>({});

  const [items, setItems] = useState<OrderItemRow[]>([]);

  // Other Charges & Summary State (Empty by default when new)
  const [otherCharges, setOtherCharges] = useState<OtherChargeItem[]>([]);
  const [overallDiscount, setOverallDiscount] = useState<number | string>('');
  const [internalNotes, setInternalNotes] = useState('');

  // Predefined Charges Master State (persisted in localStorage)
  const [predefinedCharges, setPredefinedCharges] = useState<PredefinedCharge[]>(() => {
    try {
      const stored = localStorage.getItem('skbw_predefined_charges_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse stored charges:', e);
    }
    return DEFAULT_PREDEFINED_CHARGES;
  });

  const [activeChargeDropdown, setActiveChargeDropdown] = useState<number | null>(null);
  const [showManageChargesModal, setShowManageChargesModal] = useState(false);
  const [showQuickPresetMenu, setShowQuickPresetMenu] = useState(false);
  const [newPresetForm, setNewPresetForm] = useState({ name: '', defaultRate: '', calculationType: 'per_gbl' as 'per_gbl' | 'fixed' });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const customerRef = useRef<HTMLDivElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
        setActiveItemDropdownIdx(null);
      }
      const target = e.target as HTMLElement;
      if (!target.closest('.charge-name-cell') && !target.closest('.charge-preset-menu')) {
        setActiveChargeDropdown(null);
        setShowQuickPresetMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch SKUs and Customers from Backend & Merge cleanly
  useEffect(() => {
    if (isOpen) {
      Promise.all([
        getSkusV2(companyId).catch(() => []),
        getSkusV2('').catch(() => []),
        companyId ? getBalancesV2(companyId).catch(() => []) : Promise.resolve([]),
        getBalancesV2('').catch(() => []),
        getParties({ limit: 10000, type: 'customer' })
          .catch(() => getParties({ company: companyId, limit: 10000, type: 'customer' }))
          .catch(() => getParties({ limit: 10000 }))
          .catch(() => ({ data: { parties: [] } })),
        getParties({ limit: 1000, type: 'transporter' })
          .catch(() => getParties({ company: companyId, limit: 1000, type: 'transporter' }))
          .catch(() => ({ data: { parties: [] } }))
      ]).then(([skus1, skus2, balances1, balances2, partiesRes, transportersRes]) => {
        // Collect raw SKUs from both endpoints
        const rawSkus: SkuV2[] = [
          ...(Array.isArray(skus1) ? skus1 : []),
          ...(Array.isArray(skus2) ? skus2 : [])
        ];

        // Deduplicate SKUs and filter strictly for Products (Finished Goods)
        const skuMap = new Map<string, SkuV2>();
        rawSkus.forEach(s => {
          if (s && !s.isDeleted && isOnlyProduct(s)) {
            const key = (s.skuCode || s.name || s._id || '').toLowerCase().trim();
            if (key && !skuMap.has(key)) {
              skuMap.set(key, s);
            }
          }
        });

        // Add master finished goods if not already present
        MASTER_PRODUCT_SKUS.forEach(m => {
          const key = (m.skuCode || m.name).toLowerCase().trim();
          if (!skuMap.has(key)) {
            skuMap.set(key, m);
          }
        });

        const finalSkus = Array.from(skuMap.values());
        setAvailableSkus(finalSkus);

        // Aggregate live balances
        const bMap = new Map<string, number>();
        const allBalances = [
          ...(Array.isArray(balances1) ? balances1 : []),
          ...(Array.isArray(balances2) ? balances2 : [])
        ];
        allBalances.forEach((b: any) => {
          const rawId = b.skuId || b.sku?._id;
          const sId = rawId ? String(rawId._id || rawId) : '';
          const qty = Number(b.onHand) || Number(b.quantity) || 0;
          if (sId) bMap.set(sId, (bMap.get(sId) || 0) + qty);
        });

        // Also fallback to SKU presentStock or openingStock if not in ledger
        finalSkus.forEach(s => {
          if (s._id && !bMap.has(s._id)) {
            const fallbackQty = Number(s.presentStock || s.openingStock || 0);
            if (fallbackQty > 0) bMap.set(s._id, fallbackQty);
          }
        });
        setStockMap(bMap);

        const backendParties: any[] = partiesRes?.data?.parties || partiesRes?.parties || partiesRes?.data || [];
        
        // Merge with all known customers so ALL customers appear in the module
        const existingFirmNames = new Set(backendParties.map(p => (p.firmName || p.name || '').toLowerCase().trim()));
        const combined = [...backendParties];
        ALL_SYSTEM_CUSTOMERS.forEach(c => {
          if (!existingFirmNames.has(c.firmName.toLowerCase().trim())) {
            combined.push(c);
          }
        });
        setCustomersList(combined);

        // Merge transporters from backend
        const backendTransporters: any[] = transportersRes?.data?.parties || transportersRes?.parties || transportersRes?.data || [];
        const tNames = backendTransporters.map((t: any) => t.firmName || t.name).filter(Boolean);
        if (tNames.length > 0) {
          setTransporterList(prev => Array.from(new Set([...prev, ...tNames])));
        }
      });

      if (!editOrder) {
        if (companyId) {
          getNextSalesOrderNumberV2(companyId).then(setOrderNumber).catch(() => setOrderNumber('SO-0004'));
        } else {
          setOrderNumber('SO-0004');
        }
      }
    }
  }, [isOpen, companyId, editOrder]);

  // Reset or Populate based on editOrder: NO DEFAULT HARDCODED VALUES FOR NEW ORDERS!
  useEffect(() => {
    if (editOrder) {
      setOrderNumber(editOrder.orderNumber || '');
      setSelectedCustomer(editOrder.customer || {
        firmName: editOrder.customerName,
        phone: editOrder.customerPhone || '',
        address: editOrder.billingAddress?.addressLine || `${editOrder.city || ''}, ${editOrder.region || ''}`,
        city: editOrder.city || '',
        state: editOrder.region || '',
        creditLimit: 40000,
        outstandingBalance: 12450
      });
      setCustomerSearch(editOrder.customerName || '');
      setOrderDate(editOrder.orderDate ? (editOrder.orderDate.includes('/') ? editOrder.orderDate.split('/').reverse().join('-') : editOrder.orderDate) : new Date().toISOString().split('T')[0]);
      setPromisedDate(editOrder.promisedDate ? (editOrder.promisedDate.includes('/') ? editOrder.promisedDate.split('/').reverse().join('-') : editOrder.promisedDate) : '');
      setTransporter(editOrder.transporter || '');
      setOrderType((editOrder as any).orderType === 'Cash' ? 'Cash' : 'Credit');
      setOrderStatus(editOrder.status || 'Confirmed');
      setInternalNotes(editOrder.internalNotes || '');

      // Populate billing & shipping addresses
      const bAddr = editOrder.billingAddress || {};
      const sAddr = editOrder.shippingAddress || {};
      setBillingAddress({
        attention: bAddr.attention || editOrder.customerName || '',
        addressLine: bAddr.addressLine || bAddr.address || '',
        city: bAddr.city || editOrder.city || '',
        state: bAddr.state || editOrder.region || '',
        pincode: bAddr.pincode || '',
        phone: bAddr.phone || editOrder.customerPhone || ''
      });
      setShippingAddress({
        attention: sAddr.attention || bAddr.attention || editOrder.customerName || '',
        addressLine: sAddr.addressLine || sAddr.address || bAddr.addressLine || '',
        city: sAddr.city || bAddr.city || editOrder.city || '',
        state: sAddr.state || bAddr.state || editOrder.region || '',
        pincode: sAddr.pincode || bAddr.pincode || '',
        phone: sAddr.phone || bAddr.phone || editOrder.customerPhone || ''
      });

      if (editOrder.items && editOrder.items.length > 0) {
        setItems(editOrder.items.map(i => ({
          skuId: typeof i.skuId === 'object' ? (i.skuId as any)?._id : (i.skuId || ''),
          skuCode: i.skuCode || '',
          itemName: i.itemName || '',
          description: (i as any).description || '',
          category: i.category || 'Finished Goods',
          uom: i.uom || 'Pcs',
          stockGbl: 10,
          gbl: i.gbl || '',
          pcsPerGbl: i.pcsPerGbl || 100,
          totalPcs: i.quantity || 0,
          rate: i.unitPrice || 0,
          discPercent: i.discountPercent || 0,
          discAmount: 0,
          amount: i.totalAmount || 0
        })));
      } else {
        setItems([getEmptyRow()]);
      }

      setOtherCharges(editOrder.otherCharges || []);
      setOverallDiscount((editOrder as any).discountPercent !== undefined ? (editOrder as any).discountPercent : ((editOrder as any).overallDiscount || ''));
    } else {
      // ── COMPLETELY BLANK VALUES FOR NEW ORDERS (NO DEFAULT VALUES) ──
      setSelectedCustomer(null);
      setCustomerSearch('');
      setOrderDate('');
      setPromisedDate('');
      setTransporter('');
      setOrderType('');
      setOrderStatus('');
      setInternalNotes('');
      setOverallDiscount('');
      setSameAddress(true);
      setIsEditingAddress(false);

      setBillingAddress({
        attention: '',
        addressLine: '',
        city: '',
        state: '',
        pincode: '',
        phone: ''
      });
      setShippingAddress({
        attention: '',
        addressLine: '',
        city: '',
        state: '',
        pincode: '',
        phone: ''
      });

      // Start with 1 blank row
      setItems([getEmptyRow()]);
      setOtherCharges([]);
      setRowSearchTerms({});
    }
  }, [editOrder, isOpen]);

  // Helper for empty item row (starts blank)
  function getEmptyRow(): OrderItemRow {
    return {
      skuId: '',
      skuCode: '',
      itemName: '',
      description: '',
      category: '',
      uom: '',
      stockPcs: 0,
      stockGbl: null,
      gbl: '',
      pcsPerGbl: '',
      totalPcs: 0,
      rate: '',
      discPercent: '',
      discAmount: 0,
      amount: 0
    };
  }

  // Handle selecting a customer from dropdown
  const handleSelectCustomer = (c: any) => {
    setSelectedCustomer(c);
    const firm = c.firmName || c.ownerName || c.contactName || '';
    setCustomerSearch(firm);
    setShowCustomerDropdown(false);

    // Build formatted complete street address without dummy dashes or empty parts
    const resolvedStreet = formatCustomerStreetAddress(c) || cleanAddressVal(c.address) || cleanAddressVal(c.address1) || cleanAddressVal(c.city) || 'Main Road';

    const cityVal = cleanAddressVal(c.city) || cleanAddressVal(c.district) || cleanAddressVal(c.assignedMarket) || '';
    const stateVal = cleanAddressVal(c.state) || 'Andhra Pradesh';
    const pincodeVal = cleanAddressVal(c.pincode || c.pinCode) || '';
    const phoneVal = cleanAddressVal(c.phone || c.mobile || c.altPhone) || '';

    const newAddr: AddressDetails = {
      attention: firm,
      addressLine: resolvedStreet,
      city: cityVal,
      state: stateVal,
      pincode: pincodeVal,
      phone: phoneVal
    };

    setBillingAddress(newAddr);
    if (sameAddress) {
      setShippingAddress(newAddr);
    }

    // Dynamic Transporter: Auto-populate if assigned earlier to that customer
    const assignedTransport = c.preferredTransport || c.transporter || c.transport || c.defaultTransport || c.transporterName || '';
    if (assignedTransport) {
      setTransporter(assignedTransport);
      setTransporterList(prev => prev.includes(assignedTransport) ? prev : [assignedTransport, ...prev]);
    }
  };

  // Keep shipping synced when sameAddress is true
  useEffect(() => {
    if (sameAddress) {
      setShippingAddress({ ...billingAddress });
    }
  }, [sameAddress, billingAddress]);

  // Handle selecting a product from Item Master dropdown
  const handleSelectProduct = (idx: number, s: SkuV2) => {
    const onHandPcs = stockMap.get(s._id) ?? Number(s.presentStock || s.openingStock || 0);
    const definedConv = Number(s.booksGbl || s.altUnitConversion || (s as any).pcsPerGbl || 0);
    const pcsPerGblVal = definedConv > 0 ? definedConv : '';
    const stockGblVal = definedConv > 0 ? Math.floor(onHandPcs / definedConv) : onHandPcs;

    setItems(prev => {
      const copy = [...prev];
      const row = { ...copy[idx] };
      row.skuId = s._id;
      row.skuCode = s.skuCode;
      row.itemName = s.name;
      row.description = '';
      row.category = s.category || 'Finished Goods';
      row.uom = s.unit || 'Pcs';
      row.stockPcs = onHandPcs;
      row.stockGbl = stockGblVal;
      row.pcsPerGbl = pcsPerGblVal;

      const gblNum = Number(row.gbl) || 0;
      const pcsPerGblNum = Number(pcsPerGblVal) || 0;
      if (gblNum > 0 && pcsPerGblNum > 0) {
        row.totalPcs = gblNum * pcsPerGblNum;
      } else if (gblNum > 0) {
        row.totalPcs = gblNum;
      } else {
        row.totalPcs = 0;
      }
      row.amount = Math.round((row.totalPcs || 0) * (Number(row.rate) || 0) * 100) / 100;

      copy[idx] = row;
      return copy;
    });

    setRowSearchTerms(prev => ({ ...prev, [idx]: s.name }));
    setActiveItemDropdownIdx(null);
  };

  // Handle Item Row Calculations dynamically
  const updateRowField = (idx: number, field: keyof OrderItemRow, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      const row = { ...copy[idx], [field]: value };

      const gblNum = Number(row.gbl) || 0;
      const pcsPerGblNum = Number(row.pcsPerGbl) || 0;
      
      let totalPcs = Number(row.totalPcs) || 0;
      if (field === 'gbl' || field === 'pcsPerGbl') {
        if (gblNum > 0 && pcsPerGblNum > 0) {
          totalPcs = gblNum * pcsPerGblNum;
        } else if (gblNum > 0) {
          totalPcs = gblNum;
        } else {
          totalPcs = 0;
        }
      }
      row.totalPcs = totalPcs;

      // Recalculate stock in GBL dynamically based on current pcsPerGbl conversion rate
      if (row.stockPcs !== undefined && row.stockPcs !== null) {
        if (pcsPerGblNum > 0) {
          row.stockGbl = Math.floor(row.stockPcs / pcsPerGblNum);
        } else {
          row.stockGbl = row.stockPcs;
        }
      }

      const rateNum = Number(row.rate) || 0;
      const gross = totalPcs * rateNum;

      row.discPercent = 0;
      row.discAmount = 0;
      row.amount = Math.round(gross * 100) / 100;

      copy[idx] = row;
      return copy;
    });
  };

  // Add Product Item
  const handleAddProduct = () => {
    setItems(prev => [...prev, getEmptyRow()]);
  };

  // Duplicate Item Row
  const handleDuplicateRow = (idx: number) => {
    setItems(prev => {
      const rowToCopy = { ...prev[idx] };
      return [...prev.slice(0, idx + 1), rowToCopy, ...prev.slice(idx + 1)];
    });
  };

  // Delete Item Row
  const handleDeleteRow = (idx: number) => {
    setItems(prev => {
      const remaining = prev.filter((_, i) => i !== idx);
      return remaining.length > 0 ? remaining : [getEmptyRow()];
    });
  };

  // Calculate Total Order GBL across all products
  const totalOrderGbl = useMemo(() => {
    return items.reduce((sum, item) => {
      const directGbl = Number(item.gbl) || 0;
      if (directGbl > 0) return sum + directGbl;
      const calcGbl = (Number(item.pcsPerGbl) > 0 && Number(item.totalPcs) > 0)
        ? Math.floor(Number(item.totalPcs) / Number(item.pcsPerGbl))
        : 0;
      return sum + calcGbl;
    }, 0);
  }, [items]);

  // Helper to save a new predefined charge into master list and localStorage
  const saveNewPredefinedCharge = (name: string, calculationType: 'per_gbl' | 'fixed' = 'per_gbl', defaultRate: number = 0) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPredefinedCharges(prev => {
      const exists = prev.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;
      const updated = [...prev, {
        id: `ch-custom-${Date.now()}`,
        name: trimmed,
        defaultRate,
        calculationType
      }];
      try {
        localStorage.setItem('skbw_predefined_charges_v2', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Dynamic Quantity Sync: QTY acts according to total GBL ordered
  useEffect(() => {
    if (totalOrderGbl >= 0) {
      setOtherCharges(prev => {
        let changed = false;
        const updated = prev.map(ch => {
          const isPerGbl = ch.chargeType === 'per_gbl' || 
            (!ch.chargeType && ch.name && (
              ch.name.toLowerCase().includes('hamali') || 
              ch.name.toLowerCase().includes('freight') || 
              ch.name.toLowerCase().includes('loading') || 
              ch.name.toLowerCase().includes('packing') ||
              ch.name.toLowerCase().includes('gbl')
            ));
          if (isPerGbl) {
            const targetQty = totalOrderGbl > 0 ? totalOrderGbl : 1;
            if (ch.quantity !== targetQty || ch.chargeType !== 'per_gbl') {
              changed = true;
              const newAmt = Math.round(targetQty * (Number(ch.rate) || 0) * 100) / 100;
              return { ...ch, chargeType: 'per_gbl', quantity: targetQty, amount: newAmt };
            }
          }
          return ch;
        });
        return changed ? updated : prev;
      });
    }
  }, [totalOrderGbl]);

  // Add Other Charge (optionally with a preset)
  const handleAddCharge = (preset?: PredefinedCharge) => {
    const p = preset || predefinedCharges[0] || { name: 'Hamali / Loading Charges', defaultRate: 5, calculationType: 'per_gbl' };
    const isPerGbl = p.calculationType === 'per_gbl';
    const qty = isPerGbl ? (totalOrderGbl > 0 ? totalOrderGbl : 1) : 1;
    const amt = Math.round(qty * (Number(p.defaultRate) || 0) * 100) / 100;

    setOtherCharges(prev => [
      ...prev,
      {
        name: p.name,
        chargeType: p.calculationType,
        quantity: qty,
        rate: p.defaultRate,
        amount: amt
      }
    ]);
    setShowQuickPresetMenu(false);
  };

  const handleSelectPresetCharge = (cIdx: number, p: PredefinedCharge) => {
    const isPerGbl = p.calculationType === 'per_gbl';
    const qty = isPerGbl ? (totalOrderGbl > 0 ? totalOrderGbl : 1) : 1;
    const amt = Math.round(qty * (Number(p.defaultRate) || 0) * 100) / 100;

    setOtherCharges(prev => {
      const copy = [...prev];
      copy[cIdx] = {
        ...copy[cIdx],
        name: p.name,
        chargeType: p.calculationType,
        quantity: qty,
        rate: p.defaultRate,
        amount: amt
      };
      return copy;
    });
    setActiveChargeDropdown(null);
  };

  const handleToggleChargeType = (cIdx: number, newType: 'per_gbl' | 'fixed') => {
    setOtherCharges(prev => {
      const copy = [...prev];
      const ch = { ...copy[cIdx], chargeType: newType };
      if (newType === 'per_gbl') {
        ch.quantity = totalOrderGbl > 0 ? totalOrderGbl : 1;
      } else {
        ch.quantity = 1;
      }
      ch.amount = Math.round((Number(ch.quantity) || 0) * (Number(ch.rate) || 0) * 100) / 100;
      copy[cIdx] = ch;
      return copy;
    });
  };

  const updateCharge = (idx: number, field: keyof OtherChargeItem, val: any) => {
    setOtherCharges(prev => {
      const copy = [...prev];
      const ch = { ...copy[idx], [field]: val };
      ch.amount = Math.round((Number(ch.quantity) || 0) * (Number(ch.rate) || 0) * 100) / 100;
      copy[idx] = ch;
      return copy;
    });
  };

  const handleDeleteCharge = (idx: number) => {
    setOtherCharges(prev => prev.filter((_, i) => i !== idx));
  };

  // Real-time Calculations
  const totals = useMemo(() => {
    const itemsTotal = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const otherChargesTotal = otherCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const subtotal = itemsTotal + otherChargesTotal;
    const discountPercent = Number(overallDiscount) || 0;
    const discountAmount = Math.round(((subtotal * discountPercent) / 100) * 100) / 100;
    const grandTotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

    return {
      itemsTotal,
      otherChargesTotal,
      subtotal,
      discountPercent,
      discountAmount,
      grandTotal
    };
  }, [items, otherCharges, overallDiscount]);

  // Filter Customers based on search (ALL customers displayed)
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customersList;
    const q = customerSearch.toLowerCase();
    return customersList.filter(c =>
      (c.firmName || c.ownerName || c.contactName || c.name || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q) ||
      (c.phone || c.mobile || '').includes(q)
    );
  }, [customersList, customerSearch]);

  // Save Order Handler (supports Confirmed or Draft)
  const handleSaveOrder = async (overrideStatus?: string) => {
    setErrorMsg('');

    if (!selectedCustomer && !customerSearch.trim()) {
      showToast('Please select or specify a Customer', 'error');
      return;
    }

    const validItems = items.filter(i => i.itemName.trim() && Number(i.totalPcs) > 0);
    if (validItems.length === 0) {
      showToast('Please enter at least one valid product with total pcs > 0', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const finalStatus = overrideStatus || orderStatus || 'Confirmed';
      const processedItems: SalesOrderItemV2[] = validItems.map(i => ({
        skuId: i.skuId || undefined,
        skuCode: i.skuCode || 'SKU-001',
        itemName: i.itemName.trim(),
        category: i.category || 'Finished Goods',
        uom: i.uom || 'Pcs',
        quantity: Number(i.totalPcs),
        gbl: Number(i.gbl) || 0,
        pcsPerGbl: Number(i.pcsPerGbl) || 1,
        unitPrice: Number(i.rate) || 0,
        discountPercent: 0,
        taxableAmount: Number(i.amount) || 0,
        gstRate: 18,
        totalAmount: Number(i.amount) || 0
      }));

      const payload: Partial<SalesOrderV2> = {
        orderNumber: orderNumber || `SO-${Date.now().toString().slice(-4)}`,
        company: companyId,
        customer: selectedCustomer?._id || undefined,
        customerName: customerSearch.trim() || selectedCustomer?.firmName || 'Customer',
        customerPhone: billingAddress.phone || selectedCustomer?.phone || selectedCustomer?.mobile || '',
        city: billingAddress.city || selectedCustomer?.city || '',
        region: billingAddress.state || selectedCustomer?.state || '',
        orderDate: orderDate || new Date().toISOString().split('T')[0],
        promisedDate,
        facility: 'Main Factory',
        transporter,
        orderType: (orderType || 'Credit') as any,
        otherCharges,
        internalNotes,
        billingAddress,
        shippingAddress: sameAddress ? billingAddress : shippingAddress,
        items: processedItems,
        subtotal: totals.subtotal,
        discountPercent: totals.discountPercent,
        discountAmount: totals.discountAmount,
        grandTotal: totals.grandTotal,
        status: finalStatus as any,
        materialsStatus: 'Ready',
        fulfillmentStatus: finalStatus === 'Draft' ? 'Pending' : 'Pending'
      };

      let saved: SalesOrderV2;
      if (editOrder?._id && !editOrder._id.startsWith('so-mock-')) {
        saved = await updateSalesOrderV2(editOrder._id, payload);
      } else {
        try {
          saved = await createSalesOrderV2(payload);
        } catch (apiErr) {
          console.warn('API error, saving locally:', apiErr);
          saved = {
            ...payload,
            _id: `so-user-${Date.now()}`
          } as SalesOrderV2;
        }
      }

      onSaveSuccess(saved);
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.msg || err.message || 'Failed to save Sales Order', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-[1360px]"
      padding="p-0"
      hideCloseButton={true}
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSaveOrder(); }} className="flex flex-col max-h-[92vh] overflow-hidden font-sans text-xs bg-slate-50/70">
        
        {/* ── MODAL HEADER (1:1 with Screenshot) ── */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs">
              <FileText className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                {editOrder ? `Edit Sales Order (${orderNumber})` : 'Create Sales Order'}
              </h2>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Create a new sales order for customer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-3xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveOrder('Draft')}
              disabled={isSaving}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 active:scale-98 text-slate-800 font-bold rounded-xl text-xs shadow-3xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Save order as Draft"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>Draft Sale Order</span>
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              <span>{isSaving ? 'Saving...' : 'Save Sales Order'}</span>
            </button>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4" ref={dropdownContainerRef}>

          {/* ── TOP SECTION: 3 WHITE CARDS (1:1 with Screenshot) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* CARD 1: Customer Details (Fixed Height) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs h-[270px] min-h-[270px] max-h-[270px] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                    <User className="w-4 h-4 text-blue-600" />
                    <span>Customer Details</span>
                  </div>
                  {selectedCustomer && (
                    <button 
                      type="button"
                      onClick={() => setShowCustomerDetailsModal(true)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>View Customer</span>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="relative" ref={customerRef}>
                  <label className="block text-[10.5px] font-bold text-gray-600 mb-1">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      placeholder="Search customer firm name..."
                      className="w-full pl-8 pr-10 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-3xs"
                    />

                    {/* DOWN ARROW REMOVED IF SOMEONE IS TYPED/SELECTED IN THIS FIELD */}
                    <div className="absolute right-2 top-2 flex items-center gap-1 text-gray-400">
                      {customerSearch ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerSearch('');
                            setSelectedCustomer(null);
                            setBillingAddress({ attention: '', addressLine: '', city: '', state: '', pincode: '', phone: '' });
                            setShippingAddress({ attention: '', addressLine: '', city: '', state: '', pincode: '', phone: '' });
                          }}
                          className="p-1 hover:text-gray-600 rounded-md cursor-pointer"
                          title="Clear customer"
                        >
                          <X className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      ) : (
                        <ChevronDown 
                          className="w-4 h-4 cursor-pointer hover:text-gray-600" 
                          onClick={() => setShowCustomerDropdown(!showCustomerDropdown)} 
                        />
                      )}
                    </div>
                  </div>

                  {/* Customer Dropdown Popover */}
                  {showCustomerDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl z-[999] max-h-60 overflow-y-auto divide-y divide-gray-50 p-1">
                      {filteredCustomers.map(c => (
                        <div
                          key={c._id || c.firmName}
                          onClick={() => handleSelectCustomer(c)}
                          className="p-2.5 hover:bg-blue-50/70 cursor-pointer rounded-lg transition-colors flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-gray-900 text-xs">{c.firmName || c.ownerName || c.contactName}</div>
                            <div className="text-[10px] text-gray-400">{c.city ? `${c.city}, ` : ''}{c.state || ''}</div>
                          </div>
                          <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                            {c.phone || c.mobile || 'Select'}
                          </span>
                        </div>
                      ))}
                      {filteredCustomers.length === 0 && (
                        <div className="p-3 text-center text-gray-400 italic">No customers found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Info Box & Financials (Fixed h-[142px]) */}
              {selectedCustomer ? (
                <div className="h-[142px] p-3 bg-blue-50/30 rounded-xl border border-blue-100/80 flex flex-col justify-between text-[11px] text-gray-600">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-1.5 text-gray-800">
                      <div className="flex items-start gap-1.5 flex-1 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <span className="line-clamp-2 leading-tight">
                          {formatCustomerFullAddress(selectedCustomer, [billingAddress.addressLine, billingAddress.city, billingAddress.state, billingAddress.pincode].filter(Boolean).join(', '))}
                        </span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setShowCustomerDetailsModal(true)}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-0.5 shrink-0"
                      >
                        <span>View Details</span>
                        <Eye className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <div className="flex items-center gap-1 font-bold text-gray-900">
                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                        <span>{billingAddress.phone || selectedCustomer.phone || selectedCustomer.mobile || '—'}</span>
                      </div>
                      {(selectedCustomer.phone || selectedCustomer.mobile || billingAddress.phone) && (
                        <a 
                          href={`https://wa.me/91${(selectedCustomer.phone || selectedCustomer.mobile || billingAddress.phone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Chat on WhatsApp"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-500 hover:scale-110" />
                        </a>
                      )}
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10px] ml-auto">
                        {selectedCustomer.status === 'inactive' ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-blue-100/70 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/90 p-1.5 rounded-lg border border-gray-100 shadow-3xs">
                      <div className="text-[9px] text-gray-500 font-bold uppercase">Credit Limit</div>
                      <div className="font-bold text-gray-900 text-xs mt-0.5">₹{(selectedCustomer.creditLimit || 0).toLocaleString('en-IN')}</div>
                    </div>
                    <div className="bg-white/90 p-1.5 rounded-lg border border-gray-100 shadow-3xs">
                      <div className="text-[9px] text-gray-500 font-bold uppercase">Outstanding</div>
                      <div className="font-bold text-rose-700 text-xs mt-0.5">₹{(selectedCustomer.outstandingBalance || selectedCustomer.outstanding || 0).toLocaleString('en-IN')}</div>
                    </div>
                    <div className="bg-white/90 p-1.5 rounded-lg border border-gray-100 shadow-3xs">
                      <div className="text-[9px] text-gray-500 font-bold uppercase">City</div>
                      <div className="font-bold text-blue-900 text-xs mt-0.5 truncate">{selectedCustomer.city || billingAddress.city || '—'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[142px] p-4 bg-gray-50/80 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center text-gray-400">
                  <User className="w-7 h-7 text-gray-300 mb-1 stroke-[1.5]" />
                  <p className="text-xs font-semibold text-gray-500">No Customer Selected</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Search and select a customer above to proceed with the sales order.</p>
                </div>
              )}
            </div>

            {/* CARD 2: Order Information (Fixed Height) */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs h-[270px] min-h-[270px] max-h-[270px] flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900 pb-1 border-b border-gray-100">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Order Information</span>
              </div>

              {/* Order Date & Delivery Date */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10.5px] font-bold text-gray-600 mb-1">
                    Order Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold text-gray-600 mb-1">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={promisedDate}
                    onChange={(e) => setPromisedDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Transporter */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-gray-600 shrink-0 w-24">
                  Transporter
                </label>
                <select
                  value={transporter}
                  onChange={(e) => setTransporter(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select Transporter</option>
                  {transporter && !transporterList.includes(transporter) && (
                    <option value={transporter}>{transporter}</option>
                  )}
                  {transporterList.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Order Type: EXACTLY 2 VALUES AS REQUESTED (Credit and Cash) */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-gray-600 shrink-0 w-24">
                  Order Type
                </label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as 'Credit' | 'Cash')}
                  className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select Order Type</option>
                  <option value="Credit">Credit</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              {/* Order Status */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-gray-600 shrink-0 w-24">
                  Order Status
                </label>
                <select
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select Status</option>
                  <option value="Confirmed">Confirmed (Active Demand)</option>
                  <option value="Draft">Draft</option>
                  <option value="In Production">In Production</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

            </div>

            {/* CARD 3: Addresses (Fixed Height - No Box Dynamic Change!) */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs h-[270px] min-h-[270px] max-h-[270px] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span>Addresses</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingAddress(!isEditingAddress)}
                    className="p-1 hover:bg-gray-100 rounded-lg text-blue-600 cursor-pointer"
                    title={isEditingAddress ? 'Done Editing' : 'Edit Address Details'}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-gray-700 py-0.5">
                  <input
                    type="checkbox"
                    checked={sameAddress}
                    onChange={(e) => setSameAddress(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Same as customer address</span>
                </label>

                {/* Switchable Address Tabs */}
                <div className="flex items-center gap-1 pt-1 pb-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveAddressTab('bill')}
                    className={`flex-1 py-1 px-2 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeAddressTab === 'bill'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200/70 shadow-3xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    Bill To Address
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveAddressTab('ship')}
                    className={`flex-1 py-1 px-2 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeAddressTab === 'ship'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200/70 shadow-3xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    Ship To Address
                  </button>
                </div>
              </div>

              {/* Dynamic Editable Address Box (Fixed h-[142px] - No Jumps!) */}
              {isEditingAddress ? (
                <div className="h-[142px] overflow-y-auto p-2.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs pr-1">
                  {activeAddressTab === 'bill' ? (
                    <>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Billing Attention / Company</label>
                        <input
                          type="text"
                          placeholder="Contact / Attention"
                          value={billingAddress.attention}
                          onChange={(e) => setBillingAddress({ ...billingAddress, attention: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Street Address</label>
                        <input
                          type="text"
                          placeholder="Street / Address Line"
                          value={billingAddress.addressLine}
                          onChange={(e) => setBillingAddress({ ...billingAddress, addressLine: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-0.5">City</label>
                          <input
                            type="text"
                            placeholder="City"
                            value={billingAddress.city}
                            onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                            className="w-full px-1.5 py-0.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-0.5">State</label>
                          <input
                            type="text"
                            placeholder="State"
                            value={billingAddress.state}
                            onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })}
                            className="w-full px-1.5 py-0.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Pincode</label>
                          <input
                            type="text"
                            placeholder="Pincode"
                            value={billingAddress.pincode}
                            onChange={(e) => setBillingAddress({ ...billingAddress, pincode: e.target.value })}
                            className="w-full px-1.5 py-0.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Contact Phone</label>
                        <input
                          type="text"
                          placeholder="Phone / Mobile"
                          value={billingAddress.phone}
                          onChange={(e) => setBillingAddress({ ...billingAddress, phone: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {sameAddress && (
                        <div className="p-1.5 bg-blue-50 border border-blue-200/80 rounded-lg text-[10px] text-blue-700 flex items-center justify-between">
                          <span>Synced with billing address</span>
                          <button
                            type="button"
                            onClick={() => setSameAddress(false)}
                            className="font-bold underline text-blue-800 hover:text-blue-900 cursor-pointer"
                          >
                            Edit Separately
                          </button>
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Shipping Attention / Consignee</label>
                        <input
                          type="text"
                          placeholder="Shipping Attention"
                          value={shippingAddress.attention}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, attention: e.target.value })}
                          disabled={sameAddress}
                          className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 disabled:opacity-60 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Street Address</label>
                        <input
                          type="text"
                          placeholder="Shipping Address Line"
                          value={shippingAddress.addressLine}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine: e.target.value })}
                          disabled={sameAddress}
                          className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 disabled:opacity-60 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-0.5">City</label>
                          <input
                            type="text"
                            placeholder="City"
                            value={shippingAddress.city}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                            disabled={sameAddress}
                            className="w-full px-1.5 py-0.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 disabled:opacity-60"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-0.5">State</label>
                          <input
                            type="text"
                            placeholder="State"
                            value={shippingAddress.state}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                            disabled={sameAddress}
                            className="w-full px-1.5 py-0.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 disabled:opacity-60"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Pincode</label>
                          <input
                            type="text"
                            placeholder="Pincode"
                            value={shippingAddress.pincode}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, pincode: e.target.value })}
                            disabled={sameAddress}
                            className="w-full px-1.5 py-0.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 disabled:opacity-60"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Contact Phone</label>
                        <input
                          type="text"
                          placeholder="Phone / Mobile"
                          value={shippingAddress.phone}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                          disabled={sameAddress}
                          className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 disabled:opacity-60 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsEditingAddress(false)}
                    className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer transition-all shadow-3xs"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="h-[142px] p-3 bg-gray-50/80 rounded-xl border border-gray-200/70 text-[11px] text-gray-700 flex flex-col justify-between">
                  {activeAddressTab === 'bill' ? (
                    <div>
                      <div className="flex items-center justify-between font-bold text-gray-900 mb-1">
                        <span className="truncate pr-1">{billingAddress.attention || selectedCustomer?.firmName || 'Customer Billing Address'}</span>
                        <button
                          type="button"
                          onClick={() => setIsEditingAddress(true)}
                          className="text-[10px] text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="text-gray-700 leading-snug line-clamp-3 text-[11px]">
                        {billingAddress.addressLine ? (
                          <>
                            <span className="font-semibold text-gray-900">{billingAddress.addressLine}</span>
                            {(billingAddress.city || billingAddress.state || billingAddress.pincode) && (
                              <span className="text-gray-600">
                                {billingAddress.city && !billingAddress.addressLine.includes(billingAddress.city) ? `, ${billingAddress.city}` : ''}
                                {billingAddress.state && !billingAddress.addressLine.includes(billingAddress.state) ? `, ${billingAddress.state}` : ''}
                                {billingAddress.pincode && !billingAddress.addressLine.includes(billingAddress.pincode) ? ` - ${billingAddress.pincode}` : ''}
                              </span>
                            )}
                          </>
                        ) : selectedCustomer ? (
                          <span className="text-gray-600 font-medium">
                            {[selectedCustomer.city, selectedCustomer.state, selectedCustomer.pincode].filter(Boolean).join(', ') || 'Address not specified'}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">No customer selected</span>
                        )}
                      </div>
                      <div className="text-gray-500 font-mono mt-1 text-[10.5px]">
                        Mobile: <span className="font-semibold text-gray-800">{billingAddress.phone || selectedCustomer?.phone || selectedCustomer?.mobile || '—'}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between font-bold text-gray-900 mb-1">
                        <span className="truncate pr-1">{shippingAddress.attention || billingAddress.attention || 'Customer Shipping Address'}</span>
                        <button
                          type="button"
                          onClick={() => setIsEditingAddress(true)}
                          className="text-[10px] text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="text-gray-700 leading-snug line-clamp-3 text-[11px]">
                        {(shippingAddress.addressLine || billingAddress.addressLine) ? (
                          <>
                            <span className="font-semibold text-gray-900">{shippingAddress.addressLine || billingAddress.addressLine}</span>
                            {(shippingAddress.city || shippingAddress.state || shippingAddress.pincode) && (
                              <span className="text-gray-600">
                                {shippingAddress.city && !(shippingAddress.addressLine || '').includes(shippingAddress.city) ? `, ${shippingAddress.city}` : ''}
                                {shippingAddress.state && !(shippingAddress.addressLine || '').includes(shippingAddress.state) ? `, ${shippingAddress.state}` : ''}
                                {shippingAddress.pincode && !(shippingAddress.addressLine || '').includes(shippingAddress.pincode) ? ` - ${shippingAddress.pincode}` : ''}
                              </span>
                            )}
                          </>
                        ) : selectedCustomer ? (
                          <span className="text-gray-600 font-medium">
                            {[selectedCustomer.city, selectedCustomer.state, selectedCustomer.pincode].filter(Boolean).join(', ') || 'Address not specified'}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">No customer selected</span>
                        )}
                      </div>
                      <div className="text-gray-500 font-mono mt-1 text-[10.5px]">
                        Mobile: <span className="font-semibold text-gray-800">{shippingAddress.phone || billingAddress.phone || selectedCustomer?.phone || selectedCustomer?.mobile || '—'}</span>
                      </div>
                      {sameAddress && (
                        <span className="text-[9.5px] text-blue-600 font-bold block mt-0.5">
                          (Synced with customer billing address)
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 italic text-right">
                    Click Edit above to alter
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ── MIDDLE SECTION: ORDER ITEMS TABLE (1:1 with Screenshot) ── */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs space-y-3 relative z-30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                <Package className="w-4 h-4 text-blue-600" />
                <span>Order Items</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddProduct}
                  className="px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Add Product</span>
                </button>
                <button
                  type="button"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Order Items Table (Compact Spacing & Dropdown in Front) */}
            <div className="overflow-visible border border-gray-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-gray-50/80 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none">
                  <tr>
                    <th className="py-2.5 px-2 text-center w-8">#</th>
                    <th className="py-2.5 px-3 min-w-[220px]">ITEM / PRODUCT <span className="text-red-500">*</span></th>
                    <th className="py-2.5 px-3 min-w-[160px]">ITEM DESCRIPTION</th>
                    <th className="py-2.5 px-2 text-center w-24">STOCK (GBL)</th>
                    <th className="py-2.5 px-2 text-center w-20">GBL <span className="text-red-500">*</span></th>
                    <th className="py-2.5 px-2 text-center w-24">PCS / GBL</th>
                    <th className="py-2.5 px-2 text-center w-24">TOTAL PCS</th>
                    <th className="py-2.5 px-2 text-right w-24">RATE (₹) <span className="text-red-500">*</span></th>
                    <th className="py-2.5 px-3 text-right w-36">FINAL TOTAL AMOUNT (₹)</th>
                    <th className="py-2.5 px-2 text-center w-20">ACTIONS</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 bg-white text-xs">
                  {items.map((row, idx) => {
                    const isDropdownActive = activeItemDropdownIdx === idx;
                    const stockVal = row.stockGbl;

                    // Filter products from Item Master matching typed search
                    const currentSearch = (rowSearchTerms[idx] !== undefined ? rowSearchTerms[idx] : row.itemName || '').toLowerCase().trim();
                    const filteredProductSkus = availableSkus.filter(s =>
                      !currentSearch ||
                      (s.name || '').toLowerCase().includes(currentSearch) ||
                      (s.skuCode || '').toLowerCase().includes(currentSearch) ||
                      (s.category || '').toLowerCase().includes(currentSearch)
                    );

                    return (
                      <tr key={idx} className={`hover:bg-blue-50/30 transition-colors relative ${isDropdownActive ? 'z-50' : ''}`}>
                        {/* # */}
                        <td className="py-2.5 px-2 text-center font-bold text-gray-500">
                          {idx + 1}
                        </td>

                        {/* Item / Product search input */}
                        <td className="py-2.5 px-3 relative">
                          <div className="relative">
                            <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-gray-400" />
                            <input
                              type="text"
                              value={rowSearchTerms[idx] !== undefined ? rowSearchTerms[idx] : row.itemName}
                              onChange={(e) => {
                                setRowSearchTerms({ ...rowSearchTerms, [idx]: e.target.value });
                                updateRowField(idx, 'itemName', e.target.value);
                                setActiveItemDropdownIdx(idx);
                              }}
                              onClick={() => setActiveItemDropdownIdx(idx)}
                              onFocus={() => setActiveItemDropdownIdx(idx)}
                              placeholder="Select product..."
                              className="w-full pl-7 pr-6 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                            />
                            {/* DOWN ARROW REMOVED IF AN ITEM IS IN THAT FIELD */}
                            <div className="absolute right-2 top-2.5 flex items-center">
                              {(row.itemName || rowSearchTerms[idx]) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateRowField(idx, 'itemName', '');
                                    updateRowField(idx, 'skuCode', '');
                                    updateRowField(idx, 'skuId', '');
                                    updateRowField(idx, 'category', '');
                                    updateRowField(idx, 'uom', '');
                                    updateRowField(idx, 'description', '');
                                    updateRowField(idx, 'stockPcs', 0);
                                    updateRowField(idx, 'stockGbl', null);
                                    updateRowField(idx, 'gbl', '');
                                    updateRowField(idx, 'pcsPerGbl', '');
                                    updateRowField(idx, 'totalPcs', 0);
                                    updateRowField(idx, 'rate', '');
                                    updateRowField(idx, 'discPercent', '');
                                    updateRowField(idx, 'discAmount', 0);
                                    updateRowField(idx, 'amount', 0);
                                    setRowSearchTerms({ ...rowSearchTerms, [idx]: '' });
                                  }}
                                  className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                                  title="Clear product"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              ) : (
                                <ChevronDown 
                                  className="w-3.5 h-3.5 text-gray-400 cursor-pointer hover:text-gray-700" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveItemDropdownIdx(isDropdownActive ? null : idx);
                                  }} 
                                />
                              )}
                            </div>
                          </div>

                          {/* SKU Dropdown: Shows ALL products from Item Master with Active/Inactive status */}
                          {isDropdownActive && (
                            <div className="absolute left-3 top-full mt-1 w-[460px] bg-white border border-gray-200 rounded-xl shadow-2xl z-[99999] max-h-64 overflow-y-auto divide-y divide-gray-100 p-1">
                              {filteredProductSkus.map(s => {
                                const isInactive = (s.status || '').toLowerCase() === 'inactive';
                                const onHandPcs = stockMap.get(s._id) ?? Number(s.presentStock || s.openingStock || 0);
                                const definedConv = Number(s.booksGbl || s.altUnitConversion || (s as any).pcsPerGbl || 0);
                                const stockGbl = definedConv > 0 ? Math.floor(onHandPcs / definedConv) : onHandPcs;

                                return (
                                  <div
                                    key={s._id}
                                    onClick={() => handleSelectProduct(idx, s)}
                                    className="p-2.5 hover:bg-blue-50/80 cursor-pointer rounded-lg text-xs flex justify-between items-center transition-colors"
                                  >
                                    <div className="flex-1 min-w-0 pr-3">
                                      <div className="font-bold text-gray-900 truncate">{s.name}</div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-gray-400 font-mono">{s.skuCode}</span>
                                        <span className="text-[10px] text-gray-300">•</span>
                                        <span className="text-[10px] text-gray-500">{s.category || 'Finished Goods'}</span>
                                        {definedConv > 0 && (
                                          <>
                                            <span className="text-[10px] text-gray-300">•</span>
                                            <span className="text-[10px] font-semibold text-indigo-600">{definedConv} Pcs/GBL</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className={`px-2 py-0.5 text-[9.5px] font-extrabold uppercase rounded-full border ${
                                        isInactive
                                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      }`}>
                                        {s.status || 'Active'}
                                      </span>
                                      <span className="text-[10.5px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                        Stock: {stockGbl} GBL {definedConv > 0 ? `(${onHandPcs} Pcs)` : ''}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                              {filteredProductSkus.length === 0 && (
                                <div className="p-3 text-center text-gray-400 italic">No products found</div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Item Description */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => updateRowField(idx, 'description', e.target.value)}
                            placeholder="Description"
                            className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-gray-200 rounded-lg text-xs text-gray-700"
                          />
                        </td>

                        {/* Stock (GBL) */}
                        <td className="py-2.5 px-2 text-center">
                          {stockVal !== null ? (
                            <span className={`font-bold font-mono text-xs ${stockVal > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {stockVal}
                            </span>
                          ) : (
                            <span className="text-gray-400 font-mono text-xs">—</span>
                          )}
                        </td>

                        {/* GBL * */}
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.gbl}
                            onChange={(e) => updateRowField(idx, 'gbl', e.target.value)}
                            className="w-14 px-1.5 py-1 text-center bg-white border border-gray-200 rounded-lg font-bold font-mono text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>

                        {/* PCS / GBL - Auto-populated from product conversion rate or freely editable */}
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="number"
                            min="1"
                            placeholder="e.g. 120"
                            value={row.pcsPerGbl}
                            onChange={(e) => updateRowField(idx, 'pcsPerGbl', e.target.value)}
                            className="w-16 px-1.5 py-1 text-center bg-white border border-gray-200 rounded-lg font-bold font-mono text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            title="Pieces per GBL conversion rate. Auto-filled if configured on product, or type custom rate."
                          />
                        </td>

                        {/* TOTAL PCS */}
                        <td className="py-2.5 px-2 text-center font-black font-mono text-gray-900">
                          {row.totalPcs > 0 ? row.totalPcs.toLocaleString('en-IN') : 0}
                        </td>

                        {/* RATE (₹) * */}
                        <td className="py-2.5 px-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={row.rate}
                            onChange={(e) => updateRowField(idx, 'rate', e.target.value)}
                            className="w-20 px-1.5 py-1 text-right bg-white border border-gray-200 rounded-lg font-bold font-mono text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>

                        {/* FINAL TOTAL AMOUNT (₹) */}
                        <td className="py-2.5 px-3 text-right font-black font-mono text-gray-900">
                          {row.amount > 0 ? `₹${row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'}
                        </td>

                        {/* ACTIONS: Duplicate & Delete */}
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDuplicateRow(idx)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                              title="Duplicate row"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(idx)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Delete row"
                            >
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

            {/* Items Total Summary right corner */}
            <div className="flex justify-end pt-1">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-gray-500">Items Total:</span>
                <span className="text-sm font-black text-gray-900 font-mono">
                  ₹{totals.itemsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* ── BOTTOM SECTION: CHARGES, NOTES & ORDER SUMMARY (1:1 with Screenshot) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* Left 8 Columns: Charges & Notes */}
            <div className="lg:col-span-8 space-y-4">

              {/* Order Charges (Optional) */}
              {/* Order Charges Section */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">Order Charges (Optional)</span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-mono text-[10.5px] font-bold border border-blue-200 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span>Total Order: {totalOrderGbl} GBL</span>
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                        Charges set to <strong className="text-emerald-700">Per GBL</strong> automatically calculate QTY based on the total {totalOrderGbl} GBL ordered.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Quick Presets Dropdown */}
                    <div className="relative charge-preset-menu">
                      <button
                        type="button"
                        onClick={() => setShowQuickPresetMenu(!showQuickPresetMenu)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100/80 text-blue-700 font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-all border border-blue-200 shadow-3xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>+ Add Preset Charge</span>
                        <ChevronDown className="w-3 h-3 text-blue-500" />
                      </button>

                      {showQuickPresetMenu && (
                        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 text-xs divide-y divide-gray-100">
                          <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Predefined Charges</span>
                            <button
                              type="button"
                              onClick={() => {
                                setShowQuickPresetMenu(false);
                                setShowManageChargesModal(true);
                              }}
                              className="text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              <Settings className="w-3 h-3" />
                              <span>Manage</span>
                            </button>
                          </div>
                          <div className="max-h-56 overflow-y-auto py-1">
                            {predefinedCharges.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleAddCharge(p)}
                                className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center justify-between group transition-colors cursor-pointer"
                              >
                                <span className="font-semibold text-gray-800 group-hover:text-blue-700">{p.name}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${p.calculationType === 'per_gbl' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600'}`}>
                                  {p.calculationType === 'per_gbl' ? `₹${p.defaultRate}/GBL` : `₹${p.defaultRate} Flat`}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddCharge()}
                      className="px-2.5 py-1 border border-gray-200 hover:border-gray-300 text-gray-700 hover:bg-gray-50 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                      <span>Custom Row</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-visible border border-gray-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-gray-50/80 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none">
                      <tr>
                        <th className="py-2 px-3 w-8 text-center">#</th>
                        <th className="py-2 px-3">CHARGE NAME</th>
                        <th className="py-2 px-3 text-center w-28">CALC MODE</th>
                        <th className="py-2 px-3 text-center w-28">QTY</th>
                        <th className="py-2 px-3 text-right w-24">RATE (₹)</th>
                        <th className="py-2 px-3 text-right w-28">AMOUNT (₹)</th>
                        <th className="py-2 px-3 text-center w-14">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {otherCharges.map((ch, cIdx) => {
                        const isPerGbl = ch.chargeType === 'per_gbl' || (!ch.chargeType && (ch.name.toLowerCase().includes('hamali') || ch.name.toLowerCase().includes('freight') || ch.name.toLowerCase().includes('loading') || ch.name.toLowerCase().includes('packing')));
                        return (
                          <tr key={cIdx} className="hover:bg-gray-50/60">
                            <td className="py-2 px-3 text-center font-bold text-gray-400">
                              {cIdx + 1}
                            </td>
                            
                            {/* Charge Name with Dropdown & Inline Creator */}
                            <td className="py-2 px-3 relative charge-name-cell">
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Select or type charge name..."
                                  value={ch.name}
                                  onFocus={() => setActiveChargeDropdown(cIdx)}
                                  onChange={(e) => {
                                    updateCharge(cIdx, 'name', e.target.value);
                                    setActiveChargeDropdown(cIdx);
                                  }}
                                  className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                />

                                {activeChargeDropdown === cIdx && (
                                  <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 text-xs divide-y divide-gray-100">
                                    <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                                      <span>Predefined Charges</span>
                                      <span 
                                        className="text-blue-600 cursor-pointer hover:underline" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveChargeDropdown(null);
                                          setShowManageChargesModal(true);
                                        }}
                                      >
                                        Manage Presets
                                      </span>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto py-1">
                                      {predefinedCharges
                                        .filter(p => !ch.name.trim() || p.name.toLowerCase().includes(ch.name.toLowerCase()))
                                        .map(p => (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => handleSelectPresetCharge(cIdx, p)}
                                            className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center justify-between group transition-colors cursor-pointer"
                                          >
                                            <span className="font-semibold text-gray-800 group-hover:text-blue-700">{p.name}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${p.calculationType === 'per_gbl' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600'}`}>
                                              {p.calculationType === 'per_gbl' ? `₹${p.defaultRate}/GBL` : `₹${p.defaultRate} Flat`}
                                            </span>
                                          </button>
                                        ))}

                                      {/* Inline Creator for new charge */}
                                      {ch.name.trim() && !predefinedCharges.some(p => p.name.toLowerCase() === ch.name.trim().toLowerCase()) && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            saveNewPredefinedCharge(ch.name.trim(), 'per_gbl', Number(ch.rate) || 5);
                                            setOtherCharges(prev => {
                                              const copy = [...prev];
                                              const targetQty = totalOrderGbl > 0 ? totalOrderGbl : 1;
                                              copy[cIdx] = {
                                                ...copy[cIdx],
                                                name: ch.name.trim(),
                                                chargeType: 'per_gbl',
                                                quantity: targetQty,
                                                rate: Number(copy[cIdx].rate) || 5,
                                                amount: Math.round(targetQty * (Number(copy[cIdx].rate) || 5) * 100) / 100
                                              };
                                              return copy;
                                            });
                                            setActiveChargeDropdown(null);
                                            showToast(`Saved "${ch.name.trim()}" to Predefined Charges`, 'success');
                                          }}
                                          className="w-full px-3 py-2 text-left bg-blue-50/70 hover:bg-blue-100/90 text-blue-700 font-bold flex items-center gap-1.5 text-xs border-t border-blue-100 cursor-pointer"
                                        >
                                          <Plus className="w-3.5 h-3.5 text-blue-600" />
                                          <span>Save & Use "{ch.name.trim()}" (Per GBL)</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Mode / Calc Type */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleChargeType(cIdx, isPerGbl ? 'fixed' : 'per_gbl')}
                                title={isPerGbl ? 'Synced with total GBL. Click to switch to Flat / Fixed' : 'Fixed fee. Click to switch to Per GBL'}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all border ${
                                  isPerGbl
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                                }`}
                              >
                                {isPerGbl ? '⚡ Per GBL' : 'Fixed'}
                              </button>
                            </td>

                            {/* QTY (auto-acts according to total GBL when Per GBL) */}
                            <td className="py-2 px-3 text-center">
                              <div className="relative inline-flex items-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={ch.quantity}
                                  onChange={(e) => updateCharge(cIdx, 'quantity', e.target.value)}
                                  className={`w-18 px-1.5 py-1 text-center bg-white border border-gray-200 rounded-lg font-mono text-gray-800 text-xs font-bold ${
                                    isPerGbl ? 'bg-emerald-50/30 border-emerald-200 text-emerald-800' : ''
                                  }`}
                                />
                                {isPerGbl && (
                                  <span className="ml-1 text-[9.5px] font-bold text-emerald-600 font-mono">GBL</span>
                                )}
                              </div>
                            </td>

                            {/* Rate */}
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={ch.rate}
                                onChange={(e) => updateCharge(cIdx, 'rate', e.target.value)}
                                className="w-20 px-1.5 py-1 text-right bg-white border border-gray-200 rounded-lg font-mono text-gray-800 text-xs font-bold"
                              />
                            </td>

                            {/* Amount */}
                            <td className="py-2 px-3 text-right font-black font-mono text-gray-900">
                              ₹{ch.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Actions */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteCharge(cIdx)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {otherCharges.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-5 text-center text-gray-400 italic">
                            No additional charges added. Click "+ Add Preset Charge" or "+ Custom Row".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes / Instructions (Optional) */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-3xs space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Notes / Instructions (Optional)</span>
                </div>
                <div className="relative">
                  <textarea
                    rows={2}
                    value={internalNotes}
                    maxLength={500}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Enter any special dispatch, packing, or delivery instructions for customer..."
                    className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="text-[10px] text-gray-400 text-right mt-0.5">
                    {internalNotes.length}/500
                  </div>
                </div>
              </div>

            </div>

            {/* Right 4 Columns: Order Summary Card */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-200/80 p-5 shadow-3xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900 pb-1">
                  <Receipt className="w-4 h-4 text-blue-600" />
                  <span>Order Summary</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Items Total</span>
                    <span className="font-mono font-bold text-gray-900">
                      ₹{totals.itemsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Other Charges</span>
                    <span className="font-mono font-bold text-gray-900">
                      ₹{totals.otherChargesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="border-t border-gray-100 my-2" />

                  <div className="flex justify-between text-gray-700 font-bold">
                    <span>Subtotal</span>
                    <span className="font-mono text-gray-900">
                      ₹{totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Discount Overall */}
                  <div className="flex items-center justify-between text-gray-600">
                    <span className="font-medium">Discount (Overall)</span>
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="0.00"
                          value={overallDiscount}
                          onChange={(e) => setOverallDiscount(e.target.value)}
                          className="w-20 pr-5 pl-2 py-0.5 text-right bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-gray-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                        <span className="absolute right-1.5 text-[10px] text-gray-400 font-bold select-none pointer-events-none">%</span>
                      </div>
                      <span className="font-mono text-xs font-semibold text-gray-600 min-w-[50px] text-right">
                        {totals.discountAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grand Total */}
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-gray-700">Grand Total</span>
                  <span className="text-2xl font-black text-blue-600 font-mono tracking-tight">
                    ₹{totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

            </div>

          </div>

        </div>

      </form>
    </Modal>

      {/* ── CUSTOMER DETAILS DIALOG MODAL (Identical with Business Directory) ── */}
      {selectedCustomer && (
        <Modal
          isOpen={showCustomerDetailsModal}
          onClose={() => setShowCustomerDetailsModal(false)}
          maxWidth="max-w-3xl"
          hideCloseButton
        >
          <div className="space-y-3.5 p-1">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-700 rounded-2xl border border-blue-200/60 shadow-2xs">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">
                      {selectedCustomer.firmName || selectedCustomer.name || selectedCustomer.contactName}
                    </h3>
                    <span className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${
                      selectedCustomer.status === 'active' || !selectedCustomer.status
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {selectedCustomer.status || 'active'}
                    </span>
                  </div>
                  {(selectedCustomer.contactName || selectedCustomer.ownerName) && (
                    <div className="text-xs text-gray-600 font-medium mt-0.5 flex items-center gap-1">
                      <span className="text-gray-400 font-normal">Contact Person:</span>
                      <span className="text-blue-700 font-bold">{selectedCustomer.contactName || selectedCustomer.ownerName}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                    CUSTOMER CODE: <span className="font-extrabold text-blue-600">{selectedCustomer.code || selectedCustomer._id?.slice(-6).toUpperCase() || 'CUST-001'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerDetailsModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-blue-50/60 border border-blue-100 p-2.5 rounded-2xl text-center shadow-2xs">
                <span className="block text-[9px] text-blue-700 font-extrabold uppercase tracking-wider">ASSIGNED REGION</span>
                <span className="block text-xs font-extrabold text-blue-950 mt-0.5 truncate">
                  {selectedCustomer.route || selectedCustomer.assignedRegion || selectedCustomer.state || 'Unassigned'}
                </span>
              </div>
              <div className="bg-blue-50/60 border border-blue-100 p-2.5 rounded-2xl text-center shadow-2xs">
                <span className="block text-[9px] text-blue-700 font-extrabold uppercase tracking-wider">ASSIGNED CITY</span>
                <span className="block text-xs font-extrabold text-blue-950 mt-0.5 truncate">
                  {selectedCustomer.city || selectedCustomer.assignedMarket || 'Unassigned'}
                </span>
              </div>
              <div className="bg-rose-50/60 border border-rose-100 p-2.5 rounded-2xl text-center shadow-2xs">
                <span className="block text-[9px] text-rose-700 font-extrabold uppercase tracking-wider">OUTSTANDING BALANCE</span>
                <span className="block text-xs font-mono font-black text-rose-950 mt-0.5">
                  ₹{Number(selectedCustomer.outstandingBalance || selectedCustomer.outstanding || 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Main Details Grid */}
            <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* BASIC INFO */}
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">BASIC INFORMATION</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Contact Person</span>
                      <span className="font-bold text-gray-900 text-xs block truncate">{selectedCustomer.contactName || selectedCustomer.ownerName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Mobile Number</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-blue-600 text-xs">{selectedCustomer.phone || selectedCustomer.mobile || '—'}</span>
                        {(selectedCustomer.phone || selectedCustomer.mobile) && (
                          <a href={`https://wa.me/91${(selectedCustomer.phone || selectedCustomer.mobile).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp">
                            <WhatsAppIcon />
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">GST Number</span>
                      <span className="font-mono font-bold text-blue-600 text-xs">{selectedCustomer.gstNumber || selectedCustomer.gstin || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Email</span>
                      <span className="font-semibold text-gray-800 text-xs truncate block">{selectedCustomer.email || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* BUSINESS & CREDIT DETAILS */}
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">BUSINESS & CREDIT</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Credit Limit</span>
                      <span className="font-mono font-bold text-blue-700 text-xs">
                        ₹{Number(selectedCustomer.creditLimit || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Credit Days</span>
                      <span className="font-mono font-bold text-gray-900 text-xs">{selectedCustomer.creditDays || 30} Days</span>
                    </div>
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Transporter</span>
                      <span className="font-bold text-gray-900 text-xs truncate block">{selectedCustomer.preferredTransport || selectedCustomer.transporter || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Assigned Agent</span>
                      <span className="font-bold text-indigo-700 text-xs">{selectedCustomer.agentAssigned || selectedCustomer.assignedAgent || 'Direct'}</span>
                    </div>
                  </div>
                </div>

                {/* ADDRESS INFO */}
                <div className="md:col-span-2 bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="font-bold text-gray-900 text-xs tracking-wider uppercase">ADDRESS INFORMATION</h4>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                    <div className="col-span-2">
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Full Address</span>
                      <span className="font-bold text-gray-900 text-xs leading-relaxed">
                        {formatCustomerFullAddress(selectedCustomer, billingAddress.addressLine)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">City</span>
                      <span className="font-bold text-gray-900 text-xs">{cleanAddressVal(selectedCustomer.city) || cleanAddressVal(billingAddress.city) || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">State & Pincode</span>
                      <span className="font-bold text-gray-900 text-xs">
                        {cleanAddressVal(selectedCustomer.state) || cleanAddressVal(billingAddress.state) || ''} {(cleanAddressVal(selectedCustomer.pincode) || cleanAddressVal(billingAddress.pincode)) ? `- ${cleanAddressVal(selectedCustomer.pincode) || cleanAddressVal(billingAddress.pincode)}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowCustomerDetailsModal(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MANAGE PREDEFINED CHARGES MODAL ── */}
      {showManageChargesModal && (
        <Modal
          isOpen={showManageChargesModal}
          onClose={() => setShowManageChargesModal(false)}
          title="Manage Predefined Charges"
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Predefined charges appear in the charge selector dropdown. Any charge set to <strong>Per GBL</strong> automatically computes quantity based on the total GBL ordered.
            </p>

            {/* List */}
            <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
              {predefinedCharges.map(p => (
                <div key={p.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-gray-50/80">
                  <div>
                    <span className="font-bold text-gray-800 block">{p.name}</span>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold mt-0.5 ${p.calculationType === 'per_gbl' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                      {p.calculationType === 'per_gbl' ? `Per GBL (₹${p.defaultRate}/GBL)` : `Fixed (₹${p.defaultRate})`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = predefinedCharges.filter(x => x.id !== p.id);
                      setPredefinedCharges(updated);
                      try { localStorage.setItem('skbw_predefined_charges_v2', JSON.stringify(updated)); } catch (e) {}
                    }}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new preset form */}
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
              <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wide">+ Add New Charge Master</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Charge Name (e.g. Loading)"
                  value={newPresetForm.name}
                  onChange={(e) => setNewPresetForm({ ...newPresetForm, name: e.target.value })}
                  className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold"
                />
                <select
                  value={newPresetForm.calculationType}
                  onChange={(e) => setNewPresetForm({ ...newPresetForm, calculationType: e.target.value as any })}
                  className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold"
                >
                  <option value="per_gbl">⚡ Per GBL</option>
                  <option value="fixed">Fixed / Flat</option>
                </select>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Rate (₹)"
                    value={newPresetForm.defaultRate}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, defaultRate: e.target.value })}
                    className="w-20 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newPresetForm.name.trim()) return;
                      saveNewPredefinedCharge(newPresetForm.name.trim(), newPresetForm.calculationType, Number(newPresetForm.defaultRate) || 0);
                      setNewPresetForm({ name: '', defaultRate: '', calculationType: 'per_gbl' });
                      showToast('New predefined charge added', 'success');
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer flex-1"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-xs">
              <button
                type="button"
                onClick={() => {
                  setPredefinedCharges(DEFAULT_PREDEFINED_CHARGES);
                  try { localStorage.setItem('skbw_predefined_charges_v2', JSON.stringify(DEFAULT_PREDEFINED_CHARGES)); } catch (e) {}
                  showToast('Reset to system default charges', 'info');
                }}
                className="text-gray-500 hover:text-gray-700 font-medium underline cursor-pointer"
              >
                Reset to Defaults
              </button>
              <button
                type="button"
                onClick={() => setShowManageChargesModal(false)}
                className="px-4 py-1.5 bg-gray-900 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default SalesOrderDrawerV2;
