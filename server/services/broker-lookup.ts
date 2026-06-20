// ─── TradeLocker server-ID → broker display-name ────────────────────────────
// TradeLocker identifies brokers by a short server string (e.g. "FE2024").
// This maps known IDs to human-readable names shown on the dashboard.
// Add new entries as prop firms adopt TradeLocker.

const SERVER_BROKER_MAP: Record<string, string> = {
  // Atlas
  'FE2024':      'Atlas',
  'FE2025':      'Atlas',
  'ATLAS':       'Atlas',
  'ATLAS2024':   'Atlas',
  'ATLAS2025':   'Atlas',
  // FTUK
  'FTUK':        'FTUK',
  'FTUK2024':    'FTUK',
  'FTUK2025':    'FTUK',
  // Funded Peaks
  'FP2024':      'Funded Peaks',
  'FP2025':      'Funded Peaks',
  // The Funded Trader
  'TFT':         'The Funded Trader',
  'TFT2024':     'The Funded Trader',
  // E8 Funding
  'E8':          'E8 Funding',
  'E8FUNDING':   'E8 Funding',
  // Blue Guardian
  'BG':          'Blue Guardian',
  'BLUEGUARD':   'Blue Guardian',
  // TradeLocker demo/live generic
  'DEMO':        'Demo Account',
  'LIVE':        'Live Account',
};

/**
 * Derive a human-readable broker name from a TradeLocker serverId.
 * Falls back to the serverId itself if no mapping is found.
 */
export function brokerNameFromServerId(serverId: string | null | undefined): string {
  if (!serverId) return 'TradeLocker';
  const key = serverId.toUpperCase().trim();
  return SERVER_BROKER_MAP[key] ?? serverId;
}
