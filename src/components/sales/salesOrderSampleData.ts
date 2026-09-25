import { SalesOrderV2 } from '../../api/salesOrderApiV2';

// 10 exact rows from the UI screenshot
export const INITIAL_FEATURED_ORDERS: SalesOrderV2[] = [
  {
    _id: 'so-mock-0003',
    orderNumber: 'SO-0003',
    company: 'default',
    customerId: 'cust-1',
    customerName: 'Sri Durga Venkateswara Books',
    customerPhone: '9966259732',
    city: 'Tirupati',
    region: 'Andhra Pradesh',
    agent: 'Ravi Teja',
    orderDate: '24/09/2026',
    promisedDate: '08/10/2026',
    subtotal: 5330,
    grandTotal: 6289.40,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'Pending',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'NB-A4-192',
        itemName: 'Classmate A4 Notebook 192 Pages Single Line',
        quantity: 120,
        unitPrice: 42.50,
        totalAmount: 5100,
        uom: 'Pcs'
      },
      {
        skuCode: 'PEN-BL-01',
        itemName: 'Ballpoint Pens Blue 0.7mm Box',
        quantity: 10,
        unitPrice: 118.94,
        totalAmount: 1189.40,
        uom: 'Box'
      }
    ]
  },
  {
    _id: 'so-mock-0002',
    orderNumber: 'SO-0002',
    company: 'default',
    customerId: 'cust-2',
    customerName: 'Malleswari Stationery',
    customerPhone: '9246912503',
    city: 'Nizamabad',
    region: 'Telangana',
    agent: 'Venkat Rao',
    orderDate: '23/09/2026',
    promisedDate: '06/10/2026',
    subtotal: 10385.59,
    grandTotal: 12255.00,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'Partially Dispatched',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'REG-LNG-240',
        itemName: 'Standard Long Notebook 240 Pages Ruled',
        quantity: 250,
        unitPrice: 49.02,
        totalAmount: 12255,
        uom: 'Pcs'
      }
    ]
  },
  {
    _id: 'so-mock-0001',
    orderNumber: 'SO-0001',
    company: 'default',
    customerId: 'cust-3',
    customerName: 'Laxmi Book Center',
    customerPhone: '9988776655',
    city: 'Vijayawada',
    region: 'Andhra Pradesh',
    agent: 'Suresh Reddy',
    orderDate: '22/09/2026',
    promisedDate: '02/10/2026',
    subtotal: 15618.64,
    grandTotal: 18430.00,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'Fully Dispatched',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'DRW-BK-A3',
        itemName: 'Premium Drawing Book A3 40 Pages Cartridge Paper',
        quantity: 340,
        unitPrice: 54.20,
        totalAmount: 18430,
        uom: 'Pcs'
      }
    ]
  },
  {
    _id: 'so-mock-0004',
    orderNumber: 'SO-0004',
    company: 'default',
    customerId: 'cust-4',
    customerName: 'Sree Venkatesh Books',
    customerPhone: '9876543210',
    city: 'Kadapa',
    region: 'Andhra Pradesh',
    agent: 'Ravi Teja',
    orderDate: '20/09/2026',
    promisedDate: '05/10/2026',
    subtotal: 8288.14,
    grandTotal: 9780.00,
    materialsStatus: 'Shortfall',
    fulfillmentStatus: 'Pending',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'NB-A5-120',
        itemName: 'Softbound Small Notebook 120 Pages Four Line',
        quantity: 300,
        unitPrice: 32.60,
        totalAmount: 9780,
        uom: 'Pcs'
      }
    ]
  },
  {
    _id: 'so-mock-0005',
    orderNumber: 'SO-0005',
    company: 'default',
    customerId: 'cust-5',
    customerName: 'Raju Stationers',
    customerPhone: '9123456780',
    city: 'Ongole',
    region: 'Andhra Pradesh',
    agent: 'Suresh Reddy',
    orderDate: '19/09/2026',
    promisedDate: '28/09/2026',
    subtotal: 4118.64,
    grandTotal: 4860.00,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'Pending',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'GRA-BK-A4',
        itemName: 'Graph Notebook 1mm Grid 64 Pages',
        quantity: 180,
        unitPrice: 27.00,
        totalAmount: 4860,
        uom: 'Pcs'
      }
    ]
  },
  {
    _id: 'so-mock-0006',
    orderNumber: 'SO-0006',
    company: 'default',
    customerId: 'cust-6',
    customerName: 'Modern Books',
    customerPhone: '9988112233',
    city: 'Hyderabad',
    region: 'Telangana',
    agent: 'K. Srinivas',
    orderDate: '17/09/2026',
    promisedDate: '30/09/2026',
    subtotal: 18135.59,
    grandTotal: 21400.00,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'In Production',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'NB-DLX-A4',
        itemName: 'Deluxe Hardbound Register 320 Pages Ledger Paper',
        quantity: 190,
        unitPrice: 112.63,
        totalAmount: 21400,
        uom: 'Pcs'
      }
    ]
  },
  {
    _id: 'so-mock-0007',
    orderNumber: 'SO-0007',
    company: 'default',
    customerId: 'cust-7',
    customerName: 'Srinivasa Book House',
    customerPhone: '9012345678',
    city: 'Nellore',
    region: 'Andhra Pradesh',
    agent: 'Suresh Reddy',
    orderDate: '16/09/2026',
    promisedDate: '27/09/2026',
    subtotal: 6203.39,
    grandTotal: 7320.00,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'Partially Dispatched',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'EXAM-PAD-A4',
        itemName: 'Hard Cardboard Exam Writing Pad A4',
        quantity: 120,
        unitPrice: 61.00,
        totalAmount: 7320,
        uom: 'Pcs'
      }
    ]
  },
  {
    _id: 'so-mock-0008',
    orderNumber: 'SO-0008',
    company: 'default',
    customerId: 'cust-8',
    customerName: 'Vidyarthi Stationery',
    customerPhone: '9494949494',
    city: 'Chittoor',
    region: 'Andhra Pradesh',
    agent: 'Ravi Teja',
    orderDate: '14/09/2026',
    promisedDate: '26/09/2026',
    subtotal: 5050.85,
    grandTotal: 5960.00,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'Fully Dispatched',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'NB-A4-SQ',
        itemName: 'Square Ruled Math Practice Notebook 120 Pages',
        quantity: 160,
        unitPrice: 37.25,
        totalAmount: 5960,
        uom: 'Pcs'
      }
    ]
  },
  {
    _id: 'so-mock-0009',
    orderNumber: 'SO-0009',
    company: 'default',
    customerId: 'cust-9',
    customerName: 'Krishna Book Depot',
    customerPhone: '9988223344',
    city: 'Kurnool',
    region: 'Andhra Pradesh',
    agent: 'Ravi Teja',
    orderDate: '12/09/2026',
    promisedDate: '25/09/2026',
    subtotal: 9533.90,
    grandTotal: 11250.00,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'Pending',
    status: 'Draft',
    items: [
      {
        skuCode: 'NOTE-POCKET-01',
        itemName: 'Pocket Diary Hardbound Spiral Ruled',
        quantity: 250,
        unitPrice: 45.00,
        totalAmount: 11250,
        uom: 'Pcs'
      }
    ]
  },
  {
    _id: 'so-mock-0010',
    orderNumber: 'SO-0010',
    company: 'default',
    customerId: 'cust-10',
    customerName: 'Sai Balaji Stationers',
    customerPhone: '9865321478',
    city: 'Warangal',
    region: 'Telangana',
    agent: 'Venkat Rao',
    orderDate: '10/09/2026',
    promisedDate: '22/09/2026',
    subtotal: 7118.64,
    grandTotal: 8400.00,
    materialsStatus: 'Ready',
    fulfillmentStatus: 'In Production',
    status: 'Confirmed',
    items: [
      {
        skuCode: 'CLR-DRW-A4',
        itemName: 'Colouring Drawing Book 32 Pages Cartridge Paper',
        quantity: 200,
        unitPrice: 42.00,
        totalAmount: 8400,
        uom: 'Pcs'
      }
    ]
  }
];

// Generate exactly 124 records matching the screenshot dashboard metrics:
// Total Orders = 124
// Total Amount = ₹12,48,320
// Pending Orders = 46 (37%)
// Partially Dispatched = 28 (23%)
// Fully Dispatched = 42 (34%)
// Draft Orders = 8 (6%)
export const generateFullDashboardOrders = (): SalesOrderV2[] => {
  const result: SalesOrderV2[] = [...INITIAL_FEATURED_ORDERS];
  
  // Featured list already has:
  // Pending: 4 (SO-0003, SO-0004, SO-0005, SO-0009)
  // Partially Dispatched: 2 (SO-0002, SO-0007)
  // Fully Dispatched: 2 (SO-0001, SO-0008)
  // In Production (part of Confirmed/Pending or Partially): 2 (SO-0006, SO-0010)
  // Draft: 1 (SO-0009)
  // Featured 10 sum: 6289.4 + 12255 + 18430 + 9780 + 4860 + 21400 + 7320 + 5960 + 11250 + 8400 = 1,05,944.40
  // Target sum = 12,48,320
  // Remaining sum = 12,48,320 - 105,944.40 = 1,142,375.60 across 114 orders (average ~10,020.83 per order)

  // Targets for remaining 114 orders:
  // Pending target = 46. Featured pending = 4 => Need 42 more Pending
  // Partially Dispatched target = 28. Featured = 2 => Need 26 more Partially Dispatched
  // Fully Dispatched target = 42. Featured = 2 => Need 40 more Fully Dispatched
  // Draft target = 8. Featured draft = 1 (SO-0009) => Need 7 more Draft
  // Total to add = 42 + 26 + 40 + 6 (In Production/others) = 114

  const customerPool = [
    { name: 'Kalyani Book Center', phone: '9848123456', city: 'Guntur', region: 'Andhra Pradesh', agent: 'Suresh Reddy' },
    { name: 'Sri Rama Stationery Mart', phone: '9440192834', city: 'Visakhapatnam', region: 'Andhra Pradesh', agent: 'Suresh Reddy' },
    { name: 'Balaji Paper & Books', phone: '9866012398', city: 'Rajahmundry', region: 'Andhra Pradesh', agent: 'Suresh Reddy' },
    { name: 'Navata Stationers', phone: '9849201928', city: 'Kakinada', region: 'Andhra Pradesh', agent: 'Suresh Reddy' },
    { name: 'Venkateswara Educational Stores', phone: '9441829304', city: 'Eluru', region: 'Andhra Pradesh', agent: 'Suresh Reddy' },
    { name: 'Sri Lakshmi Ganapathi Books', phone: '9966102938', city: 'Anantapur', region: 'Andhra Pradesh', agent: 'Ravi Teja' },
    { name: 'Saraswathi Book Depot', phone: '9848901234', city: 'Karimnagar', region: 'Telangana', agent: 'Venkat Rao' },
    { name: 'Kakatiya Stationery Emporium', phone: '9955123409', city: 'Khammam', region: 'Telangana', agent: 'Venkat Rao' },
    { name: 'Palamoor Stationers', phone: '9848567890', city: 'Mahbubnagar', region: 'Telangana', agent: 'K. Srinivas' },
    { name: 'Nalgonda Book World', phone: '9885123980', city: 'Nalgonda', region: 'Telangana', agent: 'K. Srinivas' },
    { name: 'Pragati Paper Mart', phone: '9908123456', city: 'Hyderabad', region: 'Telangana', agent: 'K. Srinivas' },
    { name: 'Charminar Book Depot', phone: '9849012389', city: 'Hyderabad', region: 'Telangana', agent: 'K. Srinivas' },
    { name: 'Deccan Stationery Supplies', phone: '9866234567', city: 'Secunderabad', region: 'Telangana', agent: 'K. Srinivas' },
    { name: 'Adilabad Educational Mart', phone: '9440890123', city: 'Adilabad', region: 'Telangana', agent: 'Venkat Rao' },
    { name: 'Tirumala Paper Traders', phone: '9988345612', city: 'Tirupati', region: 'Andhra Pradesh', agent: 'Ravi Teja' }
  ];

  const statusConfigs: { fulfillmentStatus: string; status: string; count: number }[] = [
    { fulfillmentStatus: 'Pending', status: 'Confirmed', count: 42 },
    { fulfillmentStatus: 'Partially Dispatched', status: 'Confirmed', count: 26 },
    { fulfillmentStatus: 'Fully Dispatched', status: 'Confirmed', count: 40 },
    { fulfillmentStatus: 'Pending', status: 'Draft', count: 6 } // + SO-0009 draft = 7 drafts, + 1 draft pending = 8 total drafts!
  ];

  let orderSeq = 11;
  const targetRemainingSum = 1248320 - 105944.40;
  const countRemaining = 114;
  const baseAvg = targetRemainingSum / countRemaining;

  // We distribute with natural variation around baseAvg and ensure the exact sum
  let runningSum = 0;
  const generated: SalesOrderV2[] = [];

  for (const cfg of statusConfigs) {
    for (let i = 0; i < cfg.count; i++) {
      const isLast = generated.length === countRemaining - 1;
      const cust = customerPool[(orderSeq + i) % customerPool.length];
      
      const day = String(Math.max(1, 28 - Math.floor(orderSeq / 4.5))).padStart(2, '0');
      const orderDate = `${day}/09/2026`;
      const promisedDay = String(Math.min(30, Number(day) + 12)).padStart(2, '0');
      const promisedDate = `${promisedDay}/10/2026`;

      let amount: number;
      if (isLast) {
        amount = Math.round((targetRemainingSum - runningSum) * 100) / 100;
      } else {
        // Natural distribution variance between 0.6x and 1.45x of average
        const multiplier = 0.65 + ((orderSeq * 17) % 80) / 100;
        amount = Math.round(baseAvg * multiplier * 100) / 100;
      }
      runningSum += amount;

      const soNum = `SO-${String(orderSeq).padStart(4, '0')}`;
      generated.push({
        _id: `so-mock-${orderSeq}`,
        orderNumber: soNum,
        company: 'default',
        customerId: `cust-gen-${orderSeq}`,
        customerName: cust.name,
        customerPhone: cust.phone,
        city: cust.city,
        region: cust.region,
        agent: cust.agent,
        orderDate,
        promisedDate,
        subtotal: Math.round(amount * 0.847 * 100) / 100,
        grandTotal: amount,
        materialsStatus: ((orderSeq % 7 === 0) ? 'Shortfall' : 'Ready') as any,
        fulfillmentStatus: cfg.fulfillmentStatus as any,
        status: cfg.status as any,
        items: [
          {
            skuCode: `SKU-NB-${100 + (orderSeq % 20)}`,
            itemName: `Standard School Notebooks Batch ${orderSeq}`,
            quantity: Math.max(50, (orderSeq * 25) % 400),
            unitPrice: Math.round((amount / Math.max(50, (orderSeq * 25) % 400)) * 100) / 100,
            totalAmount: amount,
            uom: 'Pcs'
          }
        ]
      });

      orderSeq++;
    }
  }

  result.push(...generated);
  return result;
};

export const MOCK_SALES_ORDERS_V2: SalesOrderV2[] = generateFullDashboardOrders();
