export const fmtDate = (iso: string | null | undefined, fallback = '—') => {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10) + (iso.includes('T') ? ` ${d.toISOString().slice(11, 16)} UTC` : '');
};
export const fmtKm = (km: number, digits = 0) => `${km.toLocaleString(undefined, { maximumFractionDigits: digits })} km`;
export const fmtM = (m: number | null | undefined, digits = 0) => (m == null ? '—' : `${m.toLocaleString(undefined, { maximumFractionDigits: digits })} m`);
export const fmtBytes = (n?: number) => (n == null ? '—' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(0)} KB`);
export const statusLabel: Record<string, string> = {
  planned: 'Planned',
  'in-flight': 'In flight',
  success: 'Success',
  'success-partial': 'Success (partial)',
  'failed-partial': 'Partial failure',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
