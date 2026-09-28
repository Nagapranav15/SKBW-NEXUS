export const formatOrderNo = (raw?: string): string => {
  if (!raw) return '';
  const match = raw.match(/^(?:PR|PO)-(?:[0-9]{4}-)?([0-9]+)$/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    const padLength = Math.max(3, String(num).length);
    return `PO-${String(num).padStart(padLength, '0')}`;
  }
  return raw.replace(/^PR-/, 'PO-');
};
