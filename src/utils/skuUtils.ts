// Helper utilities for SKU formatting and manipulation

export const formatSkuName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(/(\d+)\s*GSM/gi, '$1 GSM')
    .replace(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)\s*CM/gi, '$1 x $2 CM')
    .replace(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)(?!\s*CM)/gi, '$1 x $2')
    .replace(/(\d+(?:\.\d+)?)\s*CM(?!\w)/gi, '$1 CM')
    .replace(/\s+/g, ' ')
    .trim();
};
