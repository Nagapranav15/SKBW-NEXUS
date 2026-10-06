import { SalesInvoice } from '../../api/invoiceApi';

export interface DispatchDeliveryRecord {
  id: string;
  dispatchNo: string;
  dispatchDate: string;
  customerName: string;
  customerPhone?: string;
  region: string;
  city: string;
  orderNumber: string;
  itemCount: number;
  totalGbl: number;
  totalPcs: number;
  transporterName: string;
  vehicleNumber?: string;
  lrNumber?: string;
  lrDate?: string;
  packagesCount?: number;
  invoiceStatus: 'Not Invoiced' | 'Partially Invoiced' | 'Invoiced';
  invoiceNumber?: string;
  days: number;
  billToAddress?: {
    name: string;
    firmName: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
  };
  shipToAddress?: {
    name: string;
    firmName: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
  };
  items: Array<{
    itemCode: string;
    itemName: string;
    dispatchedGbl: number;
    dispatchedPcs: number;
    uom: string;
    locationName: string;
    rate: number;
    amount: number;
  }>;
}

export const INITIAL_DISPATCH_DELIVERIES: DispatchDeliveryRecord[] = [
  {
    id: 'dsp-0001',
    dispatchNo: 'DSP-0001',
    dispatchDate: '29/09/2026',
    customerName: 'A T C Marketing (Akshara)',
    customerPhone: '9966529313',
    region: 'Telangana',
    city: 'Mahabubnagar',
    orderNumber: 'SO-0001',
    itemCount: 4,
    totalGbl: 5,
    totalPcs: 1230,
    transporterName: 'Chennupati Cargo Services',
    vehicleNumber: 'TS 09 UA 4512',
    lrNumber: 'LR982144',
    lrDate: '29/09/2026',
    packagesCount: 6,
    invoiceStatus: 'Not Invoiced',
    days: 0,
    billToAddress: {
      name: 'A T C Marketing (Akshara)',
      firmName: 'A T C Marketing (Akshara)',
      address: 'Main Road',
      city: 'Mahabubnagar',
      state: 'Telangana',
      pincode: '509001',
      phone: '9966529313'
    },
    items: [
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 2, dispatchedPcs: 600, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 6200, amount: 12400 },
      { itemCode: 'FG-532', itemName: 'SP Loose Books', dispatchedGbl: 1, dispatchedPcs: 150, uom: 'GBL', locationName: 'Factory-1 / A2', rate: 5800, amount: 5800 },
      { itemCode: 'FG-005', itemName: '100P BEST FRIEND (UR)', dispatchedGbl: 1, dispatchedPcs: 300, uom: 'GBL', locationName: 'Factory-1 / B1', rate: 6100, amount: 6100 },
      { itemCode: 'FG-001', itemName: '172P BEST FRIEND (SR)', dispatchedGbl: 1, dispatchedPcs: 180, uom: 'GBL', locationName: 'Factory-2 / A1', rate: 8200, amount: 8200 }
    ]
  },
  {
    id: 'dsp-0002',
    dispatchNo: 'DSP-0002',
    dispatchDate: '28/09/2026',
    customerName: 'Ramesh Stationery',
    customerPhone: '9845123456',
    region: 'Andhra Pradesh',
    city: 'Guntur',
    orderNumber: 'SO-0002',
    itemCount: 3,
    totalGbl: 12,
    totalPcs: 3600,
    transporterName: 'Venkateswara Transport',
    vehicleNumber: 'AP 16 TX 7819',
    lrNumber: 'LR77124',
    lrDate: '28/09/2026',
    packagesCount: 14,
    invoiceStatus: 'Not Invoiced',
    days: 1,
    billToAddress: {
      name: 'Ramesh Stationery',
      firmName: 'Ramesh Stationery',
      address: 'Station Road, Brodipet',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      pincode: '522002',
      phone: '9845123456'
    },
    items: [
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 6, dispatchedPcs: 1800, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 6200, amount: 37200 },
      { itemCode: 'FG-005', itemName: '100P BEST FRIEND (UR)', dispatchedGbl: 4, dispatchedPcs: 1200, uom: 'GBL', locationName: 'Factory-1 / A2', rate: 6100, amount: 24400 },
      { itemCode: 'FG-001', itemName: '172P BEST FRIEND (SR)', dispatchedGbl: 2, dispatchedPcs: 600, uom: 'GBL', locationName: 'Factory-2 / A1', rate: 8200, amount: 16400 }
    ]
  },
  {
    id: 'dsp-0003',
    dispatchNo: 'DSP-0003',
    dispatchDate: '28/09/2026',
    customerName: 'Chaitanya Book Centre',
    customerPhone: '9988776655',
    region: 'Andhra Pradesh',
    city: 'Nellore',
    orderNumber: 'SO-0003',
    itemCount: 2,
    totalGbl: 8,
    totalPcs: 2400,
    transporterName: 'Sri Sai Transport',
    vehicleNumber: 'AP 39 AB 1234',
    lrNumber: 'LR1234567',
    lrDate: '28/09/2026',
    packagesCount: 8,
    invoiceStatus: 'Partially Invoiced',
    invoiceNumber: 'INV-260899',
    days: 1,
    billToAddress: {
      name: 'Chaitanya Book Centre',
      firmName: 'Chaitanya Book Centre',
      address: 'Main Road',
      city: 'Nellore',
      state: 'Andhra Pradesh',
      pincode: '524001',
      phone: '9988776655'
    },
    items: [
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 2, dispatchedPcs: 600, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 6200, amount: 12400 },
      { itemCode: 'FG-532', itemName: 'SP Loose Books', dispatchedGbl: 1, dispatchedPcs: 150, uom: 'GBL', locationName: 'Factory-1 / A2', rate: 5800, amount: 5800 },
      { itemCode: 'FG-005', itemName: '100P BEST FRIEND (UR)', dispatchedGbl: 1, dispatchedPcs: 300, uom: 'GBL', locationName: 'Factory-1 / B1', rate: 6100, amount: 6100 },
      { itemCode: 'FG-001', itemName: '172P BEST FRIEND (SR)', dispatchedGbl: 1, dispatchedPcs: 180, uom: 'GBL', locationName: 'Factory-2 / A1', rate: 8200, amount: 8200 }
    ]
  },
  {
    id: 'dsp-0004',
    dispatchNo: 'DSP-0004',
    dispatchDate: '27/09/2026',
    customerName: 'Sri Lakshmi Book Depot',
    customerPhone: '9440123987',
    region: 'Andhra Pradesh',
    city: 'Vijayawada',
    orderNumber: 'SO-0004',
    itemCount: 5,
    totalGbl: 20,
    totalPcs: 6000,
    transporterName: 'Chennupati Cargo Services',
    vehicleNumber: 'AP 16 CD 8821',
    lrNumber: 'LR44190',
    lrDate: '27/09/2026',
    packagesCount: 22,
    invoiceStatus: 'Not Invoiced',
    days: 2,
    billToAddress: {
      name: 'Sri Lakshmi Book Depot',
      firmName: 'Sri Lakshmi Book Depot',
      address: 'Governorpet, Besant Road',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      pincode: '520002',
      phone: '9440123987'
    },
    items: [
      { itemCode: 'FG-001', itemName: '172P BEST FRIEND (SR)', dispatchedGbl: 10, dispatchedPcs: 3000, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 8200, amount: 82000 },
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 10, dispatchedPcs: 3000, uom: 'GBL', locationName: 'Factory-1 / A2', rate: 6200, amount: 62000 }
    ]
  },
  {
    id: 'dsp-0005',
    dispatchNo: 'DSP-0005',
    dispatchDate: '26/09/2026',
    customerName: 'Sree Sai Traders',
    customerPhone: '9849201948',
    region: 'Telangana',
    city: 'Warangal',
    orderNumber: 'SO-0005',
    itemCount: 3,
    totalGbl: 15,
    totalPcs: 4500,
    transporterName: 'Deccan Transport',
    vehicleNumber: 'TS 03 TA 9112',
    lrNumber: 'LR11093',
    lrDate: '26/09/2026',
    packagesCount: 16,
    invoiceStatus: 'Not Invoiced',
    days: 3,
    billToAddress: {
      name: 'Sree Sai Traders',
      firmName: 'Sree Sai Traders',
      address: 'Main Bazaar',
      city: 'Warangal',
      state: 'Telangana',
      pincode: '506002',
      phone: '9849201948'
    },
    items: [
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 8, dispatchedPcs: 2400, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 6200, amount: 49600 },
      { itemCode: 'FG-005', itemName: '100P BEST FRIEND (UR)', dispatchedGbl: 7, dispatchedPcs: 2100, uom: 'GBL', locationName: 'Factory-2 / A1', rate: 6100, amount: 42700 }
    ]
  },
  {
    id: 'dsp-0006',
    dispatchNo: 'DSP-0006',
    dispatchDate: '25/09/2026',
    customerName: 'Vijaya Book House',
    customerPhone: '9346129845',
    region: 'AP',
    city: 'Rajahmundry',
    orderNumber: 'SO-0006',
    itemCount: 4,
    totalGbl: 10,
    totalPcs: 3000,
    transporterName: 'Shivani Transport',
    vehicleNumber: 'AP 05 QW 5501',
    lrNumber: 'LR90123',
    lrDate: '25/09/2026',
    packagesCount: 12,
    invoiceStatus: 'Partially Invoiced',
    invoiceNumber: 'INV-260894',
    days: 4,
    billToAddress: {
      name: 'Vijaya Book House',
      firmName: 'Vijaya Book House',
      address: 'Main Road, Kotipalli Bus Stand',
      city: 'Rajahmundry',
      state: 'Andhra Pradesh',
      pincode: '533101',
      phone: '9346129845'
    },
    items: [
      { itemCode: 'FG-001', itemName: '172P BEST FRIEND (SR)', dispatchedGbl: 5, dispatchedPcs: 1500, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 8200, amount: 41000 },
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 5, dispatchedPcs: 1500, uom: 'GBL', locationName: 'Factory-1 / A2', rate: 6200, amount: 31000 }
    ]
  },
  {
    id: 'dsp-0007',
    dispatchNo: 'DSP-0007',
    dispatchDate: '25/09/2026',
    customerName: 'Nellore Stationery Mart',
    customerPhone: '9848512399',
    region: 'AP',
    city: 'Nellore',
    orderNumber: 'SO-0007',
    itemCount: 6,
    totalGbl: 18,
    totalPcs: 5400,
    transporterName: 'Chennupati Cargo Services',
    vehicleNumber: 'AP 26 MN 9921',
    lrNumber: 'LR33102',
    lrDate: '25/09/2026',
    packagesCount: 20,
    invoiceStatus: 'Not Invoiced',
    days: 4,
    billToAddress: {
      name: 'Nellore Stationery Mart',
      firmName: 'Nellore Stationery Mart',
      address: 'Trunk Road',
      city: 'Nellore',
      state: 'Andhra Pradesh',
      pincode: '524001',
      phone: '9848512399'
    },
    items: [
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 10, dispatchedPcs: 3000, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 6200, amount: 62000 },
      { itemCode: 'FG-005', itemName: '100P BEST FRIEND (UR)', dispatchedGbl: 8, dispatchedPcs: 2400, uom: 'GBL', locationName: 'Factory-2 / A1', rate: 6100, amount: 48800 }
    ]
  },
  {
    id: 'dsp-0008',
    dispatchNo: 'DSP-0008',
    dispatchDate: '24/09/2026',
    customerName: 'Guntur Educational Stores',
    customerPhone: '9988223344',
    region: 'AP',
    city: 'Guntur',
    orderNumber: 'SO-0008',
    itemCount: 3,
    totalGbl: 9,
    totalPcs: 2700,
    transporterName: 'Sri Sai Transport',
    vehicleNumber: 'AP 07 TT 4561',
    lrNumber: 'LR22901',
    lrDate: '24/09/2026',
    packagesCount: 10,
    invoiceStatus: 'Not Invoiced',
    days: 5,
    billToAddress: {
      name: 'Guntur Educational Stores',
      firmName: 'Guntur Educational Stores',
      address: 'Kothapet',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      pincode: '522001',
      phone: '9988223344'
    },
    items: [
      { itemCode: 'FG-001', itemName: '172P BEST FRIEND (SR)', dispatchedGbl: 5, dispatchedPcs: 1500, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 8200, amount: 41000 },
      { itemCode: 'FG-532', itemName: 'SP Loose Books', dispatchedGbl: 4, dispatchedPcs: 1200, uom: 'GBL', locationName: 'Factory-1 / A2', rate: 5800, amount: 23200 }
    ]
  },
  {
    id: 'dsp-0009',
    dispatchNo: 'DSP-0009',
    dispatchDate: '24/09/2026',
    customerName: 'Tirupati Books & More',
    customerPhone: '9849554433',
    region: 'AP',
    city: 'Tirupati',
    orderNumber: 'SO-0009',
    itemCount: 4,
    totalGbl: 11,
    totalPcs: 3300,
    transporterName: 'Deccan Transport',
    vehicleNumber: 'AP 03 XY 8812',
    lrNumber: 'LR78104',
    lrDate: '24/09/2026',
    packagesCount: 12,
    invoiceStatus: 'Not Invoiced',
    days: 5,
    billToAddress: {
      name: 'Tirupati Books & More',
      firmName: 'Tirupati Books & More',
      address: 'Gandhi Road',
      city: 'Tirupati',
      state: 'Andhra Pradesh',
      pincode: '517501',
      phone: '9849554433'
    },
    items: [
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 6, dispatchedPcs: 1800, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 6200, amount: 37200 },
      { itemCode: 'FG-001', itemName: '172P BEST FRIEND (SR)', dispatchedGbl: 5, dispatchedPcs: 1500, uom: 'GBL', locationName: 'Factory-2 / A1', rate: 8200, amount: 41000 }
    ]
  },
  {
    id: 'dsp-0010',
    dispatchNo: 'DSP-0010',
    dispatchDate: '23/09/2026',
    customerName: 'Kadapa Book House',
    customerPhone: '9440667788',
    region: 'AP',
    city: 'Kadapa',
    orderNumber: 'SO-0010',
    itemCount: 5,
    totalGbl: 16,
    totalPcs: 4800,
    transporterName: 'Venkateswara Transport',
    vehicleNumber: 'AP 04 MN 2291',
    lrNumber: 'LR11904',
    lrDate: '23/09/2026',
    packagesCount: 18,
    invoiceStatus: 'Not Invoiced',
    days: 6,
    billToAddress: {
      name: 'Kadapa Book House',
      firmName: 'Kadapa Book House',
      address: 'Seven Roads Junction',
      city: 'Kadapa',
      state: 'Andhra Pradesh',
      pincode: '516001',
      phone: '9440667788'
    },
    items: [
      { itemCode: 'FG-002', itemName: '100P BEST FRIEND (SR)', dispatchedGbl: 8, dispatchedPcs: 2400, uom: 'GBL', locationName: 'Factory-1 / A1', rate: 6200, amount: 49600 },
      { itemCode: 'FG-005', itemName: '100P BEST FRIEND (UR)', dispatchedGbl: 8, dispatchedPcs: 2400, uom: 'GBL', locationName: 'Factory-1 / B1', rate: 6100, amount: 48800 }
    ]
  }
];

// Initial featured sample invoice matching Screenshot 2 & 3
export const INITIAL_FEATURED_INVOICE: SalesInvoice = {
  _id: 'inv-featured-260899',
  invoiceNumber: 'INV-260899',
  invoiceDate: '28/09/2026',
  dispatchId: 'dsp-0003',
  dispatchNumber: 'DSP-0003',
  dispatchDate: '28/09/2026',
  orderId: 'so-0003',
  orderNumber: 'SO-0003',
  customerName: 'Chaitanya Book Centre',
  customerPhone: '9988776655',
  region: 'Andhra Pradesh',
  city: 'Nellore',
  transporterName: 'Sri Sai Transport',
  lrNumber: 'LR1234567',
  lrDate: '28/09/2026',
  vehicleNumber: 'AP 39 AB 1234',
  numberOfPackages: 8,
  paymentTerms: '30 Days',
  dueDate: '28/10/2026',
  billTo: {
    name: 'A T C Marketing (Akshara)',
    firmName: 'Chaitanya Book Centre',
    address: 'Main Road',
    city: 'Nellore',
    state: 'Andhra Pradesh',
    pincode: '524001',
    phone: '9988776655'
  },
  shipTo: {
    name: 'Chaitanya Book Centre',
    firmName: 'Chaitanya Book Centre',
    address: 'Main Road',
    city: 'Nellore',
    state: 'Andhra Pradesh',
    pincode: '524001',
    phone: '9988776655'
  },
  sameAsBillTo: true,
  items: [
    {
      itemId: 'row-1',
      itemCode: 'FG-002',
      itemName: '100P BEST FRIEND (SR)',
      uom: 'GBL',
      pcsPerGbl: 300,
      dispatchedGbl: 2,
      dispatchedPcs: 600,
      invoiceQtyGbl: 2,
      invoiceQtyPcs: 600,
      locationName: 'Factory-1 / A1',
      locationPath: 'Factory-1 > Floor 1 > A1',
      rate: 6200,
      amount: 12400
    },
    {
      itemId: 'row-2',
      itemCode: 'FG-532',
      itemName: 'SP Loose Books',
      uom: 'GBL',
      pcsPerGbl: 150,
      dispatchedGbl: 1,
      dispatchedPcs: 150,
      invoiceQtyGbl: 1,
      invoiceQtyPcs: 150,
      locationName: 'Factory-1 / A2',
      locationPath: 'Factory-1 > Floor 1 > A2',
      rate: 5800,
      amount: 5800
    },
    {
      itemId: 'row-3',
      itemCode: 'FG-005',
      itemName: '100P BEST FRIEND (UR)',
      uom: 'GBL',
      pcsPerGbl: 300,
      dispatchedGbl: 1,
      dispatchedPcs: 300,
      invoiceQtyGbl: 1,
      invoiceQtyPcs: 300,
      locationName: 'Factory-1 / B1',
      locationPath: 'Factory-1 > Floor 1 > B1',
      rate: 6100,
      amount: 6100
    },
    {
      itemId: 'row-4',
      itemCode: 'FG-001',
      itemName: '172P BEST FRIEND (SR)',
      uom: 'GBL',
      pcsPerGbl: 180,
      dispatchedGbl: 1,
      dispatchedPcs: 180,
      invoiceQtyGbl: 1,
      invoiceQtyPcs: 180,
      locationName: 'Factory-2 / A1',
      locationPath: 'Factory-2 > A - Manufacturing > A1',
      rate: 8200,
      amount: 8200
    }
  ],
  additionalCharges: [
    { description: 'Transport Charge', type: 'Fixed', amount: 500 }
  ],
  subtotal: 32500,
  totalAdditionalCharges: 500,
  grandTotal: 33000,
  totalQtyGbl: 5,
  totalQtyPcs: 1230,
  remarks: 'Invoice for dispatch DSP-0003',
  status: 'created',
  printOptions: {
    companyHeader: true,
    itemWiseDetails: true,
    locationDetails: true,
    transporterDetails: true,
    pageNumbers: true,
    termsConditions: true
  }
};

// Second featured sample invoice
export const SECOND_FEATURED_INVOICE: SalesInvoice = {
  _id: 'inv-featured-260894',
  invoiceNumber: 'INV-260894',
  invoiceDate: '25/09/2026',
  dispatchId: 'dsp-0006',
  dispatchNumber: 'DSP-0006',
  dispatchDate: '25/09/2026',
  orderId: 'so-0006',
  orderNumber: 'SO-0006',
  customerName: 'Vijaya Book House',
  customerPhone: '9346129845',
  region: 'AP',
  city: 'Rajahmundry',
  transporterName: 'Shivani Transport',
  lrNumber: 'LR90123',
  lrDate: '25/09/2026',
  vehicleNumber: 'AP 05 QW 5501',
  numberOfPackages: 12,
  paymentTerms: '15 Days',
  dueDate: '10/10/2026',
  billTo: {
    name: 'Vijaya Book House',
    firmName: 'Vijaya Book House',
    address: 'Main Road, Kotipalli Bus Stand',
    city: 'Rajahmundry',
    state: 'Andhra Pradesh',
    pincode: '533101',
    phone: '9346129845'
  },
  shipTo: {
    name: 'Vijaya Book House',
    firmName: 'Vijaya Book House',
    address: 'Main Road, Kotipalli Bus Stand',
    city: 'Rajahmundry',
    state: 'Andhra Pradesh',
    pincode: '533101',
    phone: '9346129845'
  },
  sameAsBillTo: true,
  items: [
    {
      itemId: 'row-1',
      itemCode: 'FG-001',
      itemName: '172P BEST FRIEND (SR)',
      uom: 'GBL',
      pcsPerGbl: 300,
      dispatchedGbl: 5,
      dispatchedPcs: 1500,
      invoiceQtyGbl: 5,
      invoiceQtyPcs: 1500,
      locationName: 'Factory-1 / A1',
      locationPath: 'Factory-1 > Floor 1 > A1',
      rate: 8200,
      amount: 41000
    },
    {
      itemId: 'row-2',
      itemCode: 'FG-002',
      itemName: '100P BEST FRIEND (SR)',
      uom: 'GBL',
      pcsPerGbl: 300,
      dispatchedGbl: 5,
      dispatchedPcs: 1500,
      invoiceQtyGbl: 5,
      invoiceQtyPcs: 1500,
      locationName: 'Factory-1 / A2',
      locationPath: 'Factory-1 > Floor 1 > A2',
      rate: 6200,
      amount: 31000
    }
  ],
  additionalCharges: [
    { description: 'Transport Charge', type: 'Fixed', amount: 800 }
  ],
  subtotal: 72000,
  totalAdditionalCharges: 800,
  grandTotal: 72800,
  totalQtyGbl: 10,
  totalQtyPcs: 3000,
  remarks: 'Invoice for dispatch DSP-0006',
  status: 'created'
};
