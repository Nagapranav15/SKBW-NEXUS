// Exact Makoro ERP-styled Copy & Paste BOM icon buttons with dark floating tooltips
// Matches media_1789142185429.png and media_1789142375229.png

import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';
import { copyBom, useCopiedBom, CopiedBomPayload } from '../../utils/bomClipboard';

// Makoro-exact Paste Icon (clipboard with right-pointing arrow)
export const MakoroPasteIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 4h2a2 2 0 0 1 2 2v2.5" />
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5" />
    <path d="M10 14h10" />
    <path d="m17 11 3 3-3 3" />
  </svg>
);

interface BomCopyPasteControlsProps {
  getCopyPayload: () => CopiedBomPayload | null;
  onPaste: (copiedBom: CopiedBomPayload, mode: 'merge' | 'replace') => void;
  compact?: boolean;
  sourceLabel?: string;
  existingCount?: number;
  onToast?: (msg: string, type: 'success' | 'info' | 'error') => void;
  className?: string;
}

export const BomCopyPasteControls: React.FC<BomCopyPasteControlsProps> = ({
  getCopyPayload,
  onPaste,
  sourceLabel,
  existingCount = 0,
  onToast,
  className = ''
}) => {
  const copiedBom = useCopiedBom();
  const [copiedRecently, setCopiedRecently] = useState(false);
  const [showPasteOptions, setShowPasteOptions] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close paste options dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPasteOptions(false);
      }
    };
    if (showPasteOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPasteOptions]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const payload = getCopyPayload();
    if (!payload || !payload.lines || payload.lines.length === 0) {
      if (onToast) {
        onToast('No BOM materials defined to copy', 'error');
      }
      return;
    }

    copyBom(payload);
    setCopiedRecently(true);
    setTimeout(() => setCopiedRecently(false), 2000);

    const displayName = payload.sourceName || sourceLabel || 'Product';
    if (onToast) {
      onToast(`BOM copied from "${displayName}" (${payload.lines.length} items). Ready to paste on another product!`, 'success');
    }
  };

  const handlePasteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!copiedBom || copiedBom.lines.length === 0) return;

    // If destination already has materials, offer choices (Merge or Replace)
    if (existingCount > 0) {
      setShowPasteOptions(prev => !prev);
    } else {
      executePaste('replace');
    }
  };

  const executePaste = (mode: 'merge' | 'replace') => {
    if (!copiedBom) return;
    setShowPasteOptions(false);
    onPaste(copiedBom, mode);

    if (onToast) {
      const modeText = mode === 'replace' ? 'Replaced with' : 'Merged';
      onToast(`${modeText} BOM from "${copiedBom.sourceName}" (${copiedBom.lines.length} materials)!`, 'success');
    }
  };

  const currentPayload = getCopyPayload();
  const hasItemsToCopy = !!(currentPayload && currentPayload.lines && currentPayload.lines.length > 0);
  const canPaste = !!(copiedBom && copiedBom.lines && copiedBom.lines.length > 0);

  const safeSourceName = copiedBom?.sourceName 
    ? (copiedBom.sourceName.length > 26 ? copiedBom.sourceName.slice(0, 24) + '...' : copiedBom.sourceName) 
    : 'Product';

  const copyTooltipText = hasItemsToCopy
    ? 'Copy this BOM to paste on another product'
    : 'No BOM materials defined to copy';

  const pasteTooltipText = canPaste
    ? `Paste BOM from "${safeSourceName}"`
    : 'Copy a BOM on another product first';

  return (
    <div className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      {/* ── COPY BUTTON ── */}
      <div className="relative group">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!hasItemsToCopy}
          aria-label="Copy BOM"
          className={`h-8 w-8 rounded-md border flex items-center justify-center transition-all cursor-pointer select-none ${
            copiedRecently
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-2xs'
              : hasItemsToCopy
              ? 'border-[#0B6B63]/40 bg-white text-[#0B6B63] hover:border-[#0B6B63] hover:bg-emerald-50/20 hover:text-[#064E3B] shadow-2xs'
              : 'border-gray-200 bg-white text-gray-300 opacity-40 cursor-not-allowed'
          }`}
        >
          {copiedRecently ? (
            <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in-50 duration-200" />
          ) : (
            <Copy className="w-4 h-4 text-[#0B6B63] group-hover:text-[#064E3B]" />
          )}
        </button>

        {/* Floating Dark Tooltip matching Makoro Screenshot media_1789142375229.png */}
        {!showPasteOptions && (
          <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover:block z-50 whitespace-nowrap">
            <div className="bg-[#323842] text-white text-[12px] font-normal px-3 py-1.5 rounded-lg shadow-xl leading-tight">
              {copiedRecently ? 'Copied to clipboard!' : copyTooltipText}
            </div>
          </div>
        )}
      </div>

      {/* ── PASTE BUTTON ── */}
      <div className="relative group" ref={menuRef}>
        <button
          type="button"
          onClick={handlePasteClick}
          disabled={!canPaste}
          aria-label="Paste BOM"
          className={`h-8 w-8 rounded-md border flex items-center justify-center transition-all cursor-pointer select-none ${
            canPaste
              ? 'border-gray-200 bg-white text-[#0B6B63] hover:border-[#0B6B63]/60 hover:bg-emerald-50/20 hover:text-[#064E3B] shadow-2xs'
              : 'border-gray-200 bg-white text-gray-300 opacity-40 cursor-not-allowed'
          }`}
        >
          <MakoroPasteIcon className={`w-4 h-4 ${canPaste ? 'text-[#0B6B63] group-hover:text-[#064E3B]' : 'text-gray-300'}`} />
        </button>

        {/* Floating Dark Tooltip matching Makoro Screenshot media_1789142375229.png */}
        {!showPasteOptions && (
          <div className="pointer-events-none absolute top-full right-0 mt-1.5 hidden group-hover:block z-50 whitespace-nowrap">
            <div className="bg-[#323842] text-white text-[12px] font-normal px-3 py-1.5 rounded-lg shadow-xl leading-tight">
              {pasteTooltipText}
            </div>
          </div>
        )}

        {/* Dropdown Options if target already has existing materials (anchored right-0 to prevent overlapping + Add Item / Save buttons) */}
        {showPasteOptions && canPaste && (
          <div className="absolute top-full right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 z-50 animate-in fade-in-50 slide-in-from-top-1 duration-150 text-left">
            <div className="px-2.5 py-1.5 border-b border-gray-100 mb-1">
              <p className="text-[11px] font-bold text-gray-800 truncate" title={copiedBom?.sourceName}>
                Source: {copiedBom?.sourceName}
              </p>
              <p className="text-[10px] text-gray-400">
                {copiedBom?.lines.length} materials ready to paste
              </p>
            </div>

            <button
              type="button"
              onClick={() => executePaste('merge')}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-emerald-50 text-xs text-gray-700 hover:text-emerald-800 transition-colors flex flex-col gap-0.5 cursor-pointer"
            >
              <span className="font-bold text-[11px] flex items-center justify-between">
                <span>Smart Merge</span>
                <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-100/60 px-1.5 py-0.2 rounded">Recommended</span>
              </span>
              <span className="text-[10px] text-gray-400">
                Keep existing items, append non-duplicate materials
              </span>
            </button>

            <button
              type="button"
              onClick={() => executePaste('replace')}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-rose-50 text-xs text-gray-700 hover:text-rose-800 transition-colors flex flex-col gap-0.5 cursor-pointer"
            >
              <span className="font-bold text-[11px] text-rose-700">Replace All Materials</span>
              <span className="text-[10px] text-gray-400">
                Overwrite current materials with copied BOM
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BomCopyPasteControls;

