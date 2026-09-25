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
