// Friendly names for the Kalshi stock-perp lane's strategy keys, shared by
// the shadow panel and the "Arm for live" section. The raw key stays
// visible in small text next to the friendly name, so nothing about which
// engine or variant produced a result is hidden — this only translates
// the shorthand.
const STRATEGY_LABELS: Record<string, string> = {
  orb: "ORB (opening range)",
  opt_orb: "Options ORB",
  opt_volume_profile: "Options volume profile",
  opt_breakout: "Options breakout",
  opt_momentum: "Options momentum",
  opt_order_flow: "Options order flow",
  fx_scalping: "FX scalping",
  fx_momentum: "FX momentum",
  fx_aggressive: "FX aggressive compound",
  fx_sniper: "FX sniper",
  fx_prop_firm_sniper: "FX prop-firm sniper",
  breakout: "Breakout",
  trend_following: "Trend following",
  structure: "Market structure",
  divergence: "Divergence",
  order_flow: "Order flow",
  volume_profile: "Volume profile",
  composite_autonomous: "Combined signals (composite)",
  funding_fade: "Funding extremes fade",
};

export function strategyLabel(key: string): string {
  const known = STRATEGY_LABELS[key];
  if (known) return known;
  // Fallback for any future key: expand the prefix and snake_case.
  const prefixed = key.replace(/^fx_/, "FX ").replace(/^opt_/, "Options ");
  const words = prefixed.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}
