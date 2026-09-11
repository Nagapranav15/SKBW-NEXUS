// src/utils/bomClipboard.ts
// System-wide reactive BOM clipboard store modeled after Makoro ERP architecture

import { useSyncExternalStore } from 'react';

export interface CopiedBomMaterialLine {
  id?: string;
  materialId?: string;
  name: string;
  qty: number | string;
  uom: string;
  inStock?: number;
  notes?: string;
}

export interface CopiedBomPayload {
  sourceSkuId?: string;
  sourceSkuCode?: string;
  sourceName: string;
  basis?: number | string; // batch yield qty / recipe makes (e.g. 1, 100)
  basisUnit?: string;
  lines: CopiedBomMaterialLine[];
  copiedAt: number;
}

const STORAGE_KEY = 'skbw_copied_bom_v1';

// In-memory singleton state initialized from localStorage
let currentClipboard: CopiedBomPayload | null = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

// Listeners set for reactive updates across components
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Error in BOM clipboard listener:', e);
    }
  });
}

// Sync across browser tabs via storage events
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      try {
        currentClipboard = event.newValue ? JSON.parse(event.newValue) : null;
        emitChange();
      } catch {
        currentClipboard = null;
        emitChange();
      }
    }
  });
}

/**
 * Copy a BOM payload to the global clipboard
 */
export function copyBom(payload: CopiedBomPayload): void {
  if (!payload || !payload.lines || payload.lines.length === 0) {
    return;
  }
  currentClipboard = {
    ...payload,
    copiedAt: Date.now()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentClipboard));
  } catch (e) {
    console.warn('Failed to persist copied BOM to localStorage:', e);
  }
  emitChange();
}

/**
 * Retrieve current copied BOM synchronously
 */
export function getCopiedBom(): CopiedBomPayload | null {
  return currentClipboard;
}

/**
 * Clear the current copied BOM
 */
export function clearCopiedBom(): void {
  currentClipboard = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear copied BOM from localStorage:', e);
  }
  emitChange();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): CopiedBomPayload | null {
  return currentClipboard;
}

function getServerSnapshot(): CopiedBomPayload | null {
  return null;
}

/**
 * React hook to reactively read the current copied BOM from anywhere in the app
 */
export function useCopiedBom(): CopiedBomPayload | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
