export interface ShortcutItem {
  id: string;
  module: 'Global' | 'Item Master' | 'Stock & Inventory' | 'Business Directory' | 'Purchase Batches' | 'Sale Orders' | 'Production' | 'Dispatch' | 'Invoices' | 'Ledgers' | 'Reports' | 'Form Navigation';
  subCategory?: string; // e.g. 'Tabs', 'Actions', 'Form Controls'
  actionName: string;
  description: string;
  defaultKey: string;
  customKey?: string;
  isSystem?: boolean; // e.g., Tab/Arrow navigation
}

export const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export const DEFAULT_KEYBOARD_SHORTCUTS: Record<string, ShortcutItem> = {
  // --- Global Navigation ---
  'nav_dashboard': {
    id: 'nav_dashboard',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Dashboard',
    description: 'Quickly open the Executive Dashboard overview',
    defaultKey: 'Alt+1'
  },
  'nav_items': {
    id: 'nav_items',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Item Master',
    description: 'Navigate to Item Master & Raw Materials catalog',
    defaultKey: 'Alt+2'
  },
  'nav_stock': {
    id: 'nav_stock',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Stock & Inventory',
    description: 'Open real-time stock balances & valuation',
    defaultKey: 'Alt+3'
  },
  'nav_directory': {
    id: 'nav_directory',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Business Directory',
    description: 'Open Customer, Supplier & Party master directory',
    defaultKey: 'Alt+4'
  },
  'nav_purchases': {
    id: 'nav_purchases',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Purchase Batches',
    description: 'Navigate to Purchase Invoices & Stock Inward',
    defaultKey: 'Alt+5'
  },
  'nav_orders': {
    id: 'nav_orders',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Sale Orders',
    description: 'Open Sales Order list & pending approvals',
    defaultKey: 'Alt+6'
  },
  'nav_production': {
    id: 'nav_production',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Production',
    description: 'Open Production planning, job cards & reels',
    defaultKey: 'Alt+7'
  },
  'nav_dispatch': {
    id: 'nav_dispatch',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Dispatch',
    description: 'Open Dispatch notes & delivery slips',
    defaultKey: 'Alt+8'
  },
  'nav_invoices': {
    id: 'nav_invoices',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Invoices',
    description: 'Open Sales Invoices & GST billing',
    defaultKey: 'Alt+9'
  },
  'nav_ledgers': {
    id: 'nav_ledgers',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Ledgers',
    description: 'Open Financial Party & Account Ledgers',
    defaultKey: 'Alt+L'
  },
  'nav_reports': {
    id: 'nav_reports',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Reports',
    description: 'Open Multi-Module Analytics & Financial Reports',
    defaultKey: 'Alt+R'
  },
  'nav_settings': {
    id: 'nav_settings',
    module: 'Global',
    subCategory: 'Navigation',
    actionName: 'Go to Settings',
    description: 'Open System Settings & Keyboard Shortcuts',
    defaultKey: 'Alt+S'
  },
  'open_shortcuts_legend': {
    id: 'open_shortcuts_legend',
    module: 'Global',
    subCategory: 'Help',
    actionName: 'Show Keyboard Shortcuts Legend',
    description: 'Toggle the interactive keyboard shortcuts modal',
    defaultKey: 'Shift+?'
  },

  // --- Item Master ---
  'items_tab_raw': {
    id: 'items_tab_raw',
    module: 'Item Master',
    subCategory: 'Tabs',
    actionName: 'Raw Materials Tab',
    description: 'Switch tab to Raw Material catalog',
    defaultKey: 'Alt+1'
  },
  'items_tab_paper': {
    id: 'items_tab_paper',
    module: 'Item Master',
    subCategory: 'Tabs',
    actionName: 'Paper Reels/Sheets Tab',
    description: 'Switch tab to Paper stock items',
    defaultKey: 'Alt+2'
  },
  'items_tab_chemical': {
    id: 'items_tab_chemical',
    module: 'Item Master',
    subCategory: 'Tabs',
    actionName: 'Chemicals & Inks Tab',
    description: 'Switch tab to Chemicals & Consumables',
    defaultKey: 'Alt+3'
  },
  'items_tab_semi': {
    id: 'items_tab_semi',
    module: 'Item Master',
    subCategory: 'Tabs',
    actionName: 'Semi-Finished Goods Tab',
    description: 'Switch tab to Semi-Finished / WIP items',
    defaultKey: 'Alt+4'
  },
  'items_tab_finished': {
    id: 'items_tab_finished',
    module: 'Item Master',
    subCategory: 'Tabs',
    actionName: 'Finished Goods Tab',
    description: 'Switch tab to Manufactured Finished Notebooks',
    defaultKey: 'Alt+5'
  },
  'items_new_item': {
    id: 'items_new_item',
    module: 'Item Master',
    subCategory: 'Actions',
    actionName: 'Create New Item',
    description: 'Open new item creation form drawer',
    defaultKey: 'Alt+N'
  },
  'items_search_focus': {
    id: 'items_search_focus',
    module: 'Item Master',
    subCategory: 'Actions',
    actionName: 'Focus Search Bar',
    description: 'Focus key query search input',
    defaultKey: 'Alt+F'
  },

  // --- Sale Orders ---
  'orders_new_order': {
    id: 'orders_new_order',
    module: 'Sale Orders',
    subCategory: 'Actions',
    actionName: 'Create Sale Order',
    description: 'Open Sale Order Creation drawer form',
    defaultKey: 'Alt+N'
  },
  'orders_tab_all': {
    id: 'orders_tab_all',
    module: 'Sale Orders',
    subCategory: 'Tabs',
    actionName: 'All Orders Tab',
    description: 'Switch view to All Sale Orders',
    defaultKey: 'Alt+1'
  },
  'orders_tab_draft': {
    id: 'orders_tab_draft',
    module: 'Sale Orders',
    subCategory: 'Tabs',
    actionName: 'Draft Orders Tab',
    description: 'Filter orders by Draft status',
    defaultKey: 'Alt+2'
  },
  'orders_tab_pending': {
    id: 'orders_tab_pending',
    module: 'Sale Orders',
    subCategory: 'Tabs',
    actionName: 'Pending Orders Tab',
    description: 'Filter orders pending production & dispatch',
    defaultKey: 'Alt+3'
  },
  'orders_tab_completed': {
    id: 'orders_tab_completed',
    module: 'Sale Orders',
    subCategory: 'Tabs',
    actionName: 'Completed Orders Tab',
    description: 'Filter fulfilled & delivered orders',
    defaultKey: 'Alt+4'
  },
  'orders_export_excel': {
    id: 'orders_export_excel',
    module: 'Sale Orders',
    subCategory: 'Actions',
    actionName: 'Export Orders to Excel',
    description: 'Export displayed sale order list to .xlsx',
    defaultKey: 'Alt+E'
  },

  // --- Business Directory ---
  'directory_new_party': {
    id: 'directory_new_party',
    module: 'Business Directory',
    subCategory: 'Actions',
    actionName: 'Add New Party',
    description: 'Create new Customer or Vendor entry',
    defaultKey: 'Alt+A'
  },
  'directory_search_focus': {
    id: 'directory_search_focus',
    module: 'Business Directory',
    subCategory: 'Actions',
    actionName: 'Search Directory',
    description: 'Focus contact name or phone search input',
    defaultKey: 'Alt+F'
  },
  'directory_duplicates': {
    id: 'directory_duplicates',
    module: 'Business Directory',
    subCategory: 'Actions',
    actionName: 'Find Duplicate Parties',
    description: 'Run automated duplicate contact checker',
    defaultKey: 'Alt+D'
  },

  // --- Purchase Batches ---
  'purchases_new_batch': {
    id: 'purchases_new_batch',
    module: 'Purchase Batches',
    subCategory: 'Actions',
    actionName: 'New Purchase Invoice',
    description: 'Record stock purchase & inward batch entry',
    defaultKey: 'Alt+P'
  },
  'purchases_export': {
    id: 'purchases_export',
    module: 'Purchase Batches',
    subCategory: 'Actions',
    actionName: 'Export Purchase Log',
    description: 'Download purchase log summary to Excel',
    defaultKey: 'Alt+E'
  },

  // --- Production ---
  'production_new_order': {
    id: 'production_new_order',
    module: 'Production',
    subCategory: 'Actions',
    actionName: 'New Production Order',
    description: 'Launch Job Card / Production Batch wizard',
    defaultKey: 'Alt+N'
  },
  'production_presets': {
    id: 'production_presets',
    module: 'Production',
    subCategory: 'Actions',
    actionName: 'Department & Cost Presets',
    description: 'Toggle predefined overheads & department allocations',
    defaultKey: 'Alt+D'
  },

  // --- Dispatch ---
  'dispatch_new_entry': {
    id: 'dispatch_new_entry',
    module: 'Dispatch',
    subCategory: 'Actions',
    actionName: 'Create Dispatch Entry',
    description: 'Generate new delivery challan / dispatch note',
    defaultKey: 'Alt+D'
  },
  'dispatch_print_slip': {
    id: 'dispatch_print_slip',
    module: 'Dispatch',
    subCategory: 'Actions',
    actionName: 'Print Dispatch Slip',
    description: 'Print selected packing slip or gate pass',
    defaultKey: 'Alt+P'
  },

  // --- Invoices ---
  'invoices_new_invoice': {
    id: 'invoices_new_invoice',
    module: 'Invoices',
    subCategory: 'Actions',
    actionName: 'Create Sales Invoice',
    description: 'Generate GST Sales Invoice from Order or Dispatch',
    defaultKey: 'Alt+I'
  },

  // --- Reports Module ---
  'reports_tab_executive': {
    id: 'reports_tab_executive',
    module: 'Reports',
    subCategory: 'Tabs',
    actionName: 'Executive Dashboard Report',
    description: 'Switch to overall KPI analytics overview',
    defaultKey: 'Alt+1'
  },
  'reports_tab_sales': {
    id: 'reports_tab_sales',
    module: 'Reports',
    subCategory: 'Tabs',
    actionName: 'Sales & Orders Report',
    description: 'Switch to customer sales & product order analytics',
    defaultKey: 'Alt+2'
  },
  'reports_tab_purchases': {
    id: 'reports_tab_purchases',
    module: 'Reports',
    subCategory: 'Tabs',
    actionName: 'Purchase & Vendor Report',
    description: 'Switch to vendor purchase & cost analysis',
    defaultKey: 'Alt+3'
  },
  'reports_tab_inventory': {
    id: 'reports_tab_inventory',
    module: 'Reports',
    subCategory: 'Tabs',
    actionName: 'Stock & Valuation Report',
    description: 'Switch to item stock movement & inventory valuation',
    defaultKey: 'Alt+4'
  },
  'reports_tab_production': {
    id: 'reports_tab_production',
    module: 'Reports',
    subCategory: 'Tabs',
    actionName: 'Production & Efficiency Report',
    description: 'Switch to job card batch yield & wastage analysis',
    defaultKey: 'Alt+5'
  },
  'reports_tab_dispatch': {
    id: 'reports_tab_dispatch',
    module: 'Reports',
    subCategory: 'Tabs',
    actionName: 'Dispatch & Logistics Report',
    description: 'Switch to delivery challan & transport analytics',
    defaultKey: 'Alt+6'
  },
  'reports_tab_financial': {
    id: 'reports_tab_financial',
    module: 'Reports',
    subCategory: 'Tabs',
    actionName: 'Financial Ledgers Report',
    description: 'Switch to outstanding receivables & ledger summaries',
    defaultKey: 'Alt+7'
  },
  'reports_export_excel': {
    id: 'reports_export_excel',
    module: 'Reports',
    subCategory: 'Actions',
    actionName: 'Export Report Data',
    description: 'Export active report view to Excel spreadsheet',
    defaultKey: 'Alt+E'
  },

  // --- Form & General Navigation ---
  'form_next_field': {
    id: 'form_next_field',
    module: 'Form Navigation',
    subCategory: 'Controls',
    actionName: 'Shift Focus to Next Field',
    description: 'Move focus forward across form inputs',
    defaultKey: 'Tab',
    isSystem: true
  },
  'form_prev_field': {
    id: 'form_prev_field',
    module: 'Form Navigation',
    subCategory: 'Controls',
    actionName: 'Shift Focus to Previous Field',
    description: 'Move focus backward across form inputs',
    defaultKey: 'Shift+Tab',
    isSystem: true
  },
  'form_dropdown_nav': {
    id: 'form_dropdown_nav',
    module: 'Form Navigation',
    subCategory: 'Controls',
    actionName: 'Navigate Dropdown & Select Option',
    description: 'Use Up/Down arrows to highlight option and Press Enter to select',
    defaultKey: 'ArrowDown / ArrowUp / Enter',
    isSystem: true
  },
  'modal_close_esc': {
    id: 'modal_close_esc',
    module: 'Form Navigation',
    subCategory: 'Controls',
    actionName: 'Close Modal or Drawer',
    description: 'Dismiss open popups, search modals, or side drawers',
    defaultKey: 'Escape',
    isSystem: true
  }
};

const STORAGE_KEY_PREFIX = 'skbw_keyboard_shortcuts_';

export function getKeyboardShortcuts(companyId?: string): Record<string, ShortcutItem> {
  const key = STORAGE_KEY_PREFIX + (companyId || 'default');
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_KEYBOARD_SHORTCUTS };
    const saved = JSON.parse(raw);
    return { ...DEFAULT_KEYBOARD_SHORTCUTS, ...saved };
  } catch (err) {
    console.error('Failed to parse keyboard shortcuts from localStorage:', err);
    return { ...DEFAULT_KEYBOARD_SHORTCUTS };
  }
}

export function saveKeyboardShortcuts(shortcuts: Record<string, ShortcutItem>, companyId?: string): void {
  const key = STORAGE_KEY_PREFIX + (companyId || 'default');
  try {
    localStorage.setItem(key, JSON.stringify(shortcuts));
    window.dispatchEvent(new CustomEvent('skbw_shortcuts_updated', { detail: { companyId } }));
  } catch (err) {
    console.error('Failed to save keyboard shortcuts to localStorage:', err);
  }
}

export function resetKeyboardShortcuts(companyId?: string): Record<string, ShortcutItem> {
  const key = STORAGE_KEY_PREFIX + (companyId || 'default');
  try {
    localStorage.removeItem(key);
    window.dispatchEvent(new CustomEvent('skbw_shortcuts_updated', { detail: { companyId } }));
  } catch (err) {
    console.error('Failed to reset keyboard shortcuts:', err);
  }
  return { ...DEFAULT_KEYBOARD_SHORTCUTS };
}

export function normalizeKeyString(keyStr: string): string {
  if (!keyStr) return '';
  if (keyStr.includes(' / ')) return keyStr.trim().toLowerCase();

  const parts = keyStr.split('+').map(p => p.trim().toLowerCase());
  const modifiers: string[] = [];
  if (parts.includes('alt') || parts.includes('option')) modifiers.push('alt');
  if (parts.includes('ctrl') || parts.includes('control') || parts.includes('cmd') || parts.includes('meta')) modifiers.push('ctrl');
  if (parts.includes('shift')) modifiers.push('shift');

  const main = parts.find(p => !['alt', 'option', 'ctrl', 'control', 'shift', 'cmd', 'meta'].includes(p)) || '';
  return [...modifiers.sort(), main].join('+');
}

export function findShortcutConflict(
  shortcuts: Record<string, ShortcutItem>,
  targetShortcutId: string,
  newKey: string
): ShortcutItem | null {
  const targetNorm = normalizeKeyString(newKey);
  if (!targetNorm) return null;

  for (const sc of Object.values(shortcuts)) {
    if (sc.id === targetShortcutId) continue;
    const currentKey = sc.customKey || sc.defaultKey;
    if (normalizeKeyString(currentKey) === targetNorm) {
      return sc;
    }
  }

  return null;
}

export function formatKeyDisplay(keyStr: string): string[] {
  if (!keyStr) return [];
  if (keyStr.includes(' / ')) {
    return [keyStr];
  }
  return keyStr.split('+').map(k => {
    const clean = k.trim();
    if (isMac) {
      if (clean.toLowerCase() === 'alt') return '⌥ Option';
      if (clean.toLowerCase() === 'ctrl' || clean.toLowerCase() === 'cmd') return '⌘ Cmd';
      if (clean.toLowerCase() === 'shift') return '⇧ Shift';
    }
    return clean;
  });
}

export function matchShortcut(e: KeyboardEvent, shortcutKey: string): boolean {
  if (!shortcutKey || shortcutKey.includes('/')) return false;

  const parts = shortcutKey.split('+').map(p => p.trim().toLowerCase());
  const needsAlt = parts.includes('alt') || parts.includes('option');
  const needsCtrl = parts.includes('ctrl') || parts.includes('control') || parts.includes('cmd') || parts.includes('meta');
  const needsShift = parts.includes('shift');

  // On Mac, Option triggers e.altKey. Command triggers e.metaKey, Ctrl triggers e.ctrlKey.
  if (needsAlt !== e.altKey) return false;
  if (needsShift !== e.shiftKey) return false;

  // Cross-platform Ctrl/Cmd matching: on Mac, e.metaKey or e.ctrlKey satisfies Ctrl/Cmd requirement
  if (needsCtrl) {
    const hasControlModifier = e.ctrlKey || (isMac && e.metaKey);
    if (!hasControlModifier) return false;
  } else {
    if (e.ctrlKey || (isMac && e.metaKey)) return false;
  }

  const mainKey = parts.find(p => !['alt', 'option', 'ctrl', 'control', 'shift', 'cmd', 'meta'].includes(p));
  if (!mainKey) return false;

  const eventKey = e.key.toLowerCase();
  const eventCode = e.code.toLowerCase();

  return eventKey === mainKey || eventCode === `key${mainKey}` || eventCode === mainKey;
}
