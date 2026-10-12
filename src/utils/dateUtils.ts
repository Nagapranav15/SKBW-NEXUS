/**
 * Standard date formatting utility for SKBW ERP
 * Always formats dates into DD/MM/YYYY
 */

export function formatDateDDMMYYYY(dateInput?: string | Date | null): string {
  if (!dateInput) return '—';

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed === 'null' || trimmed === 'undefined') {
      return '—';
    }

    // Already DD/MM/YYYY or D/M/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      const parts = trimmed.split('/');
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }

    // YYYY-MM-DD or YYYY/MM/DD (ISO date format)
    const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      const year = isoMatch[1];
      const month = isoMatch[2].padStart(2, '0');
      const day = isoMatch[3].padStart(2, '0');
      return `${day}/${month}/${year}`;
    }

    // DD-MM-YYYY format
    const dmyDashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmyDashMatch) {
      const day = dmyDashMatch[1].padStart(2, '0');
      const month = dmyDashMatch[2].padStart(2, '0');
      const year = dmyDashMatch[3];
      return `${day}/${month}/${year}`;
    }
  }

  try {
    const dt = new Date(dateInput);
    if (isNaN(dt.getTime())) return String(dateInput);
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Format time from ISO date string, Date object, or time string.
 * Returns formatted 12-hour time (e.g., '10:52 AM') or '' if no valid time info exists.
 */
export function formatTime(input?: string | Date | null): string {
  if (!input) return '';

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return '';
    return input.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toUpperCase();
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed === 'null' || trimmed === 'undefined') {
      return '';
    }

    // Direct time strings like "10:30", "14:20:00", "10:30 AM", "02:15 PM"
    const timeOnlyMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (timeOnlyMatch) {
      let hours = parseInt(timeOnlyMatch[1], 10);
      const minutes = timeOnlyMatch[2];
      const modifier = timeOnlyMatch[3]?.toUpperCase();

      if (modifier) {
        return `${String(hours).padStart(2, '0')}:${minutes} ${modifier}`;
      }
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    }

    // ISO string with time component (e.g., "2026-10-10T05:22:18.228Z" or space-separated "2026-10-10 10:30:00")
    if (trimmed.includes('T') || (trimmed.includes(' ') && trimmed.includes(':'))) {
      try {
        const dt = new Date(trimmed);
        if (!isNaN(dt.getTime())) {
          return dt.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }).toUpperCase();
        }
      } catch {}
    }
  }

  return '';
}

/**
 * Helper to dynamically extract the time from an order object.
 * Checks order.time, order.createdAt, or order.orderDate.
 */
export function getOrderTime(order: any): string {
  if (!order) return '';
  if (order.orderTime) {
    const t = formatTime(order.orderTime);
    if (t) return t;
  }
  if (order.time) {
    const t = formatTime(order.time);
    if (t) return t;
  }
  if (order.createdAt) {
    const t = formatTime(order.createdAt);
    if (t) return t;
  }
  if (order.orderDate && (String(order.orderDate).includes('T') || String(order.orderDate).includes(':'))) {
    const t = formatTime(order.orderDate);
    if (t) return t;
  }
  if (order.rawOrder) {
    return getOrderTime(order.rawOrder);
  }
  return '';
}

