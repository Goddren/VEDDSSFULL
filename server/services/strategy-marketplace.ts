/**
 * Strategy Marketplace packages — the deployable half of a Strategy
 * Studio listing.
 *
 * A generic Brain Marketplace listing only carries outcome rows (what
 * the seller's brain learned). A STRATEGY listing must carry more: the
 * seller's actual StrategySpec, so the buyer receives their own copy
 * of the strategy and can run it the same way — deploy it to Shadow
 * immediately, or to their own broker accounts through the normal
 * deployment flow. That spec cannot ride in the outcome snapshot
 * (buyers of a brain listing must never receive a runnable strategy by
 * accident), so it lives in this side table, keyed by listing id and
 * written by the Studio's list-brain route at listing time.
 *
 * Engine-native strategies have no spec the shadow runner can evaluate
 * (they execute through the FX engine's AI analysis), so the Studio
 * route keeps those on the legacy brain-only listing path and never
 * writes a package for them — a package here always means "a real,
 * clonable, shadow-deployable spec strategy".
 */
import { pool } from '../db';
import { createWizardStrategy, type WizardStrategy } from './wizard-spec-strategies';
import { validateStrategySpec, type StrategySpec } from './strategy-spec';

export type StrategyProofType = 'shadow' | 'live';

export interface StrategyMarketplaceProvenance {
  listingId: number;
  sellerId: number;
  sourceStrategyId: number;
  proofType: StrategyProofType;
}

export interface StrategyMarketplacePackage extends StrategyMarketplaceProvenance {
  spec: StrategySpec;
  proofStats: Record<string, any> | null;
  createdAt?: string;
}

let tableReady: Promise<void> | null = null;
export function ensureStrategyMarketplaceTable(): Promise<void> {
  return (tableReady ??= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS strategy_marketplace_packages (
      listing_id INTEGER PRIMARY KEY,
      seller_id INTEGER NOT NULL,
      source_strategy_id INTEGER NOT NULL,
      spec JSONB NOT NULL,
      proof_type TEXT NOT NULL,
      proof_stats JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  })().catch((e) => { tableReady = null; throw e; }));
}

export async function recordStrategyMarketplacePackage(pkg: StrategyMarketplacePackage): Promise<void> {
  await ensureStrategyMarketplaceTable();
  await pool.query(
    `INSERT INTO strategy_marketplace_packages (listing_id, seller_id, source_strategy_id, spec, proof_type, proof_stats)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb)
     ON CONFLICT (listing_id) DO UPDATE SET seller_id=EXCLUDED.seller_id,
       source_strategy_id=EXCLUDED.source_strategy_id, spec=EXCLUDED.spec,
       proof_type=EXCLUDED.proof_type, proof_stats=EXCLUDED.proof_stats`,
    [pkg.listingId, pkg.sellerId, pkg.sourceStrategyId, JSON.stringify(pkg.spec), pkg.proofType,
     pkg.proofStats ? JSON.stringify(pkg.proofStats) : null],
  );
}

export async function getStrategyMarketplacePackage(listingId: number): Promise<StrategyMarketplacePackage | null> {
  await ensureStrategyMarketplaceTable();
  const { rows } = await pool.query(
    `SELECT listing_id, seller_id, source_strategy_id, spec, proof_type, proof_stats, created_at
       FROM strategy_marketplace_packages WHERE listing_id=$1`,
    [listingId],
  ).catch(() => ({ rows: [] as any[] }));
  if (!rows.length) return null;
  const r = rows[0];
  return {
    listingId: Number(r.listing_id),
    sellerId: Number(r.seller_id),
    sourceStrategyId: Number(r.source_strategy_id),
    spec: r.spec,
    proofType: r.proof_type === 'live' ? 'live' : 'shadow',
    proofStats: r.proof_stats ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/**
 * The buyer's copy of a listed strategy: a deep clone of the seller's
 * spec, stamped with its marketplace provenance. The trading content
 * (indicators, entries, exits, filters, risk) is byte-for-byte the
 * seller's — that is the point of the purchase. Pure.
 */
export function cloneStrategySpecForBuyer(spec: StrategySpec, provenance: StrategyMarketplaceProvenance): StrategySpec {
  const cloned = JSON.parse(JSON.stringify(spec)) as StrategySpec;
  cloned.marketplace = {
    purchased: true,
    source: 'marketplace_strategy',
    listingId: provenance.listingId,
    sellerId: provenance.sellerId,
    sourceStrategyId: provenance.sourceStrategyId,
    proofType: provenance.proofType,
  };
  return cloned;
}

/** The buyer-owned strategy record a purchase creates. Pure — the
 *  async clone below is this record plus the insert. */
export function purchasedStrategyRecord(buyerId: number, pkg: StrategyMarketplacePackage): { userId: number; name: string; spec: StrategySpec } {
  const spec = cloneStrategySpecForBuyer(pkg.spec, pkg);
  return { userId: buyerId, name: spec.name, spec };
}

/**
 * Can this spec run on the Shadow target? Mirrors the deployment
 * route's own rules exactly: engine-native strategies have no spec
 * for the shadow runner, and a spec needs mechanical entry rules.
 */
export function strategyShadowDeployability(spec: StrategySpec | null | undefined): { ok: boolean; reason: string | null } {
  if (!spec) return { ok: false, reason: 'no strategy spec' };
  if (spec.source === 'engine') {
    return { ok: false, reason: 'Engine strategies execute through the FX engine — there is no per-strategy spec for the shadow runner to evaluate.' };
  }
  const v = validateStrategySpec(spec);
  if (!v.ok) return { ok: false, reason: v.error };
  if (!spec.entryLong?.conditions?.length && !spec.entryShort?.conditions?.length) {
    return { ok: false, reason: 'This strategy has no mechanical entry rules to run.' };
  }
  return { ok: true, reason: null };
}

/**
 * Create the buyer's own copy of a purchased strategy listing.
 * The copy is a normal wizard strategy owned by the buyer, so every
 * existing flow works on it unchanged: the Studio list, the brain,
 * backtests, EA download, and deployments — Shadow (virtual) with no
 * account, or the buyer's own MT5 / TradeLocker / DXtrade accounts.
 */
export async function clonePurchasedStrategy(buyerId: number, listingId: number): Promise<{
  strategy: WizardStrategy;
  provenance: StrategyMarketplaceProvenance;
  shadowDeployable: boolean;
  shadowDeployabilityReason: string | null;
}> {
  const pkg = await getStrategyMarketplacePackage(listingId);
  if (!pkg) throw new Error('This strategy listing has no deployable strategy package.');
  const record = purchasedStrategyRecord(buyerId, pkg);
  const deployability = strategyShadowDeployability(record.spec);
  const strategy = await createWizardStrategy(buyerId, record.spec);
  return {
    strategy,
    provenance: {
      listingId: pkg.listingId,
      sellerId: pkg.sellerId,
      sourceStrategyId: pkg.sourceStrategyId,
      proofType: pkg.proofType,
    },
    shadowDeployable: deployability.ok,
    shadowDeployabilityReason: deployability.reason,
  };
}
