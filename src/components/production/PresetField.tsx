import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ChevronDown, Settings, Trash2, Plus, RotateCcw, X, Check, Search } from 'lucide-react';
import { showToast } from '../ui/Toast';

export interface PresetFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  storageKey: string;
  defaultPresets: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  helperText?: string;
}

export const PresetField: React.FC<PresetFieldProps> = ({
  label,
  value,
  onChange,
  storageKey,
  defaultPresets,
  placeholder = 'Select or enter value...',
  required = false,
  className = '',
  helperText
}) => {
  // Load presets from localStorage with persistent fallback
  const [presets, setPresets] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(Boolean);
        }
      }
      // Initialize localStorage with defaults so it persists across reloads
      if (defaultPresets && defaultPresets.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(defaultPresets));
      }
    } catch (e) {
      console.warn(`Failed to parse presets for key ${storageKey}:`, e);
    }
    return defaultPresets;
  });

  const [showDropdown, setShowDropdown] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [newPresetInput, setNewPresetInput] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync with storage events from other tabs or components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPresets(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const savePresets = (newPresetsList: string[]) => {
    setPresets(newPresetsList);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newPresetsList));
    } catch (e) {
      console.error('Failed to save presets to localStorage:', e);
    }
  };

  const handleAddPreset = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (presets.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      showToast('This preset already exists', 'info');
      return;
    }
    const updated = [trimmed, ...presets];
    savePresets(updated);
    setNewPresetInput('');
    showToast(`Added "${trimmed}" to presets`, 'success');
  };

  const handleRemovePreset = (presetToRemove: string) => {
    const updated = presets.filter(p => p !== presetToRemove);
    savePresets(updated);
    showToast(`Removed preset "${presetToRemove}"`, 'info');
  };

  const handleResetDefaults = () => {
    savePresets(defaultPresets);
    showToast('Reset to default presets', 'info');
  };

  const isCurrentValueInPresets = value.trim() && presets.some(p => p.toLowerCase() === value.trim().toLowerCase());

  const filteredPresets = presets.filter(p => 
    !filterQuery.trim() || p.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (!showDropdown) {
        setShowDropdown(true);
        setHighlightedIdx(0);
      } else if (filteredPresets.length > 0) {
        setHighlightedIdx(prev => Math.min(prev + 1, filteredPresets.length - 1));
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (showDropdown && filteredPresets.length > 0) {
        setHighlightedIdx(prev => Math.max(prev - 1, 0));
        e.preventDefault();
      }
    } else if (e.key === 'Enter') {
      if (showDropdown && filteredPresets.length > 0 && highlightedIdx >= 0 && highlightedIdx < filteredPresets.length) {
        e.preventDefault();
        onChange(filteredPresets[highlightedIdx]);
        setShowDropdown(false);
      }
    } else if (e.key === 'Escape') {
      if (showDropdown) {
        e.preventDefault();
        e.stopPropagation();
        setShowDropdown(false);
      }
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Label and Presets Trigger */}
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-semibold text-gray-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>

        <button
          type="button"
          onClick={() => {
            setFilterQuery('');
            setShowDropdown(!showDropdown);
            setHighlightedIdx(0);
          }}
          className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center space-x-1 cursor-pointer transition-colors"
          title="Press Alt+P to toggle presets"
        >
          <Sparkles className="w-3 h-3 text-blue-500" />
          <span>Presets ({presets.length})</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Main Text Input with quick dropdown toggle */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          onFocus={() => {
            if (!value) {
              setShowDropdown(true);
              setHighlightedIdx(0);
            }
          }}
          className="w-full text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-blue-500 transition-colors"
        />

        <button
          type="button"
          onClick={() => {
            setShowDropdown(!showDropdown);
            setHighlightedIdx(0);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {helperText && (
        <p className="text-[11px] text-gray-400 mt-1">{helperText}</p>
      )}

      {/* Presets Dropdown Menu */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 text-xs animate-modalPop max-h-72 flex flex-col">
          {/* Header */}
          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between border-b border-gray-100 bg-gray-50/70 shrink-0">
            <span>{label} Presets</span>
            <div className="flex items-center space-x-2">
              <span className="text-[9px] text-gray-400 font-mono hidden sm:inline">[↑/↓ to navigate, Enter to select]</span>
              <button
                type="button"
                onClick={() => {
                  setShowDropdown(false);
                  setShowManageModal(true);
                }}
                className="text-blue-600 hover:underline flex items-center gap-1 cursor-pointer font-bold lowercase first-letter:uppercase"
              >
                <Settings className="w-3 h-3" />
                <span>Manage</span>
              </button>
            </div>
          </div>

          {/* Search filter if more than 5 presets */}
          {presets.length > 5 && (
            <div className="p-2 border-b border-gray-100 bg-white shrink-0">
              <div className="relative">
                <Search className="w-3 h-3 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={e => {
                    setFilterQuery(e.target.value);
                    setHighlightedIdx(0);
                  }}
                  placeholder="Filter presets..."
                  autoFocus
                  className="w-full pl-7 pr-2 py-1 text-[11px] bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Quick "Save current text as preset" option if not in list */}
          {value.trim() && !isCurrentValueInPresets && (
            <button
              type="button"
              onClick={() => {
                handleAddPreset(value);
              }}
              className="w-full text-left px-3 py-2 bg-blue-50/60 hover:bg-blue-100/70 text-blue-700 text-xs font-bold border-b border-blue-100 flex items-center justify-between transition-colors shrink-0"
            >
              <div className="flex items-center space-x-1.5 truncate">
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Save &quot;{value}&quot; as new preset</span>
              </div>
              <span className="text-[10px] font-semibold bg-blue-200/60 px-1.5 py-0.5 rounded shrink-0">Save</span>
            </button>
          )}

          {/* List of Presets */}
          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-gray-50 custom-scrollbar">
            {filteredPresets.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-400 italic">
                No matching presets
              </div>
            ) : (
              filteredPresets.map((presetItem, pIdx) => {
                const isSelected = value.toLowerCase() === presetItem.toLowerCase();
                const isHighlighted = highlightedIdx === pIdx;
                return (
                  <button
                    key={presetItem}
                    type="button"
                    onClick={() => {
                      onChange(presetItem);
                      setShowDropdown(false);
                    }}
                    onMouseEnter={() => setHighlightedIdx(pIdx)}
                    className={`w-full text-left px-3 py-2 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      isHighlighted 
                        ? 'bg-blue-100/80 text-blue-900 font-bold border-l-2 border-blue-600'
                        : isSelected 
                          ? 'bg-blue-50/60 text-blue-700 font-semibold' 
                          : 'text-gray-800 hover:bg-blue-50'
                    }`}
                  >
                    <span className="truncate">{presetItem}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Manage Presets Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden flex flex-col animate-modalPop">
            {/* Header */}
            <div className="p-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Manage {label} Presets</h3>
                <p className="text-xs text-gray-500">Presets persist across sessions and page reloads</p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* Add form */}
              <form 
                onSubmit={e => {
                  e.preventDefault();
                  handleAddPreset(newPresetInput);
                }} 
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newPresetInput}
                  onChange={e => setNewPresetInput(e.target.value)}
                  placeholder={`New ${label.toLowerCase()} preset...`}
                  className="flex-1 text-xs text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!newPresetInput.trim()}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs cursor-pointer shrink-0 transition-colors"
                >
                  Add
                </button>
              </form>

              {/* Presets List */}
              <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                {presets.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400 italic">
                    No presets configured
                  </div>
                ) : (
                  presets.map(item => (
                    <div key={item} className="p-2.5 flex items-center justify-between hover:bg-gray-50 text-xs">
                      <span className="font-semibold text-gray-800">{item}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePreset(item)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                        title="Delete preset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Reset Defaults Button */}
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1.5 font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to default presets</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-gray-50 border-t border-gray-150 flex justify-end">
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
