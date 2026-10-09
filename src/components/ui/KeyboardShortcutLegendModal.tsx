import React, { useState, useEffect } from 'react';
import { Keyboard, X, Search, Settings, RotateCcw, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getKeyboardShortcuts,
  formatKeyDisplay,
  ShortcutItem
} from '../../utils/keyboardShortcuts';

interface KeyboardShortcutLegendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODULE_TABS = [
  'All',
  'Global',
  'Item Master',
  'Sale Orders',
  'Stock & Inventory',
  'Business Directory',
  'Purchase Batches',
  'Production',
  'Dispatch',
  'Invoices',
  'Ledgers',
  'Reports',
  'Form Navigation'
] as const;

export const KeyboardShortcutLegendModal: React.FC<KeyboardShortcutLegendModalProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const { selectedCompany } = useAuth();
  const [selectedModule, setSelectedModule] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [shortcutsMap, setShortcutsMap] = useState<Record<string, ShortcutItem>>({});

  useEffect(() => {
    if (isOpen) {
      const shortcuts = getKeyboardShortcuts(selectedCompany?._id);
      setShortcutsMap(shortcuts);
    }
  }, [isOpen, selectedCompany?._id]);

  if (!isOpen) return null;

  const shortcutsList = Object.values(shortcutsMap);

  const filteredShortcuts = shortcutsList.filter(sc => {
    const activeKey = sc.customKey || sc.defaultKey;
    const matchesModule = selectedModule === 'All' || sc.module === selectedModule;
    const matchesSearch =
      !searchQuery.trim() ||
      sc.actionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sc.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activeKey.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesModule && matchesSearch;
  });

  const handleGoToSettings = () => {
    onClose();
    navigate('/inventory-v2/settings?tab=shortcuts');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-gray-150 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-200">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>Keyboard Shortcuts & Key Allocations Legend</span>
              </h2>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Quick reference of key bindings across all ERP modules and forms
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGoToSettings}
              className="px-3.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-teal-200"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Customize Mappings</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="p-4 border-b border-gray-100 bg-white flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
          {/* Module Tabs Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
            {MODULE_TABS.map(mod => (
              <button
                key={mod}
                onClick={() => setSelectedModule(mod)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedModule === mod
                    ? 'bg-gray-900 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70 hover:text-gray-900'
                }`}
              >
                {mod}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search shortcut (e.g. Alt+N, Report)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 font-medium placeholder-gray-400"
            />
          </div>
        </div>

        {/* Shortcuts Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredShortcuts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredShortcuts.map(sc => {
                const keyStr = sc.customKey || sc.defaultKey;
                const keys = formatKeyDisplay(keyStr);
                const isCustomized = Boolean(sc.customKey && sc.customKey !== sc.defaultKey);

                return (
                  <div
                    key={sc.id}
                    className="p-3.5 rounded-2xl border border-gray-150 bg-slate-50/50 hover:bg-slate-50 hover:border-teal-200 transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-gray-200/70 text-gray-700 shrink-0">
                          {sc.module}
                        </span>
                        {sc.subCategory && (
                          <span className="text-[10px] text-gray-400 font-semibold truncate">
                            {sc.subCategory}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 mt-1 truncate">
                        {sc.actionName}
                      </h4>
                      <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                        {sc.description}
                      </p>
                    </div>

                    {/* Key Badge */}
                    <div className="flex items-center gap-1 shrink-0">
                      {keys.map((k, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span className="text-xs font-bold text-gray-400">+</span>}
                          <kbd className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border shadow-2xs transition-colors ${
                            isCustomized
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-white text-gray-800 border-gray-300'
                          }`}>
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                      {isCustomized && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 ml-1" title="Customized Key Binding" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400">
              <Keyboard className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="text-xs font-semibold">No shortcuts match your filter</p>
              <p className="text-[11px] mt-1 text-gray-400">Try clearing your search query or switching tabs</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-slate-50 flex items-center justify-between text-xs text-gray-500 font-medium shrink-0">
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-0.5 bg-white border border-gray-200 rounded-md font-mono text-[10px] font-bold text-gray-700">Tab</kbd>
            <span>Navigate fields</span>
            <span className="text-gray-300">|</span>
            <kbd className="px-2 py-0.5 bg-white border border-gray-200 rounded-md font-mono text-[10px] font-bold text-gray-700">Shift+?</kbd>
            <span>Toggle Legend</span>
          </div>

          <button
            onClick={handleGoToSettings}
            className="text-teal-700 hover:text-teal-800 font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Open Key Allocation Manager</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
