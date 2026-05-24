import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect } from 'wouter';
import {
  CheckCircle2, Circle, Clock, DollarSign, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, Building2, CreditCard, FileText, Award,
  Landmark, ShieldCheck, Zap, BarChart3, Lock, ArrowRight, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CreditStep {
  id: string;
  phase: number;
  title: string;
  description: string;
  timeframe: string;
  cost: string;
  creditImpact: string;       // e.g. "+20 D&B pts", "Foundation", "Major"
  creditScore: number;        // 0-100 how much this moves the needle
  category: 'entity' | 'banking' | 'trade' | 'revolving' | 'installment' | 'funding';
  icon: any;
  actionItems: string[];
  resources: { label: string; url: string }[];
  adminNotes?: string;
}

// ── Step Data ──────────────────────────────────────────────────────────────────
const PHASES = [
  { id: 1, label: 'Foundation', color: '#6366f1', desc: 'Entity & identity setup' },
  { id: 2, label: 'Credibility', color: '#3b82f6', desc: 'Banking & profiles' },
  { id: 3, label: 'Trade Lines', color: '#10b981', desc: 'Vendor net-30 accounts' },
  { id: 4, label: 'Revolving', color: '#f59e0b', desc: 'Business credit cards' },
  { id: 5, label: 'Installment', color: '#ef4444', desc: 'Loans & SBA' },
  { id: 6, label: 'Major Funding', color: '#a855f7', desc: 'Lines of credit & investors' },
];

const CREDIT_STEPS: CreditStep[] = [
  // ── Phase 1: Foundation ──
  {
    id: 'llc', phase: 1, title: 'Form LLC or Corporation', icon: Building2,
    description: 'Incorporate VEDD as a legal business entity (LLC or C-Corp). This is the legal foundation for all business credit — without it, you\'re personally liable and credit reports can\'t be established.',
    timeframe: '1–2 weeks', cost: '$50–$500 (state filing fee)',
    creditImpact: 'Foundation', creditScore: 20,
    category: 'entity',
    actionItems: [
      'Choose state (Delaware or your home state)',
      'File Articles of Organization/Incorporation',
      'Create Operating Agreement',
      'Designate Registered Agent',
    ],
    resources: [
      { label: 'Delaware Division of Corporations', url: 'https://corp.delaware.gov' },
      { label: 'Stripe Atlas (easy LLC)', url: 'https://stripe.com/atlas' },
    ],
    adminNotes: 'VEDD should be a Wyoming or Delaware LLC for best protection & credibility.',
  },
  {
    id: 'ein', phase: 1, title: 'Obtain EIN from IRS', icon: FileText,
    description: 'Employer Identification Number is your business\'s SSN. Required for bank accounts, credit applications, and tax filing. Free and instant online.',
    timeframe: 'Same day (online)', cost: 'Free',
    creditImpact: 'Required for all credit', creditScore: 15,
    category: 'entity',
    actionItems: [
      'Apply at IRS.gov/EIN (takes 10 minutes)',
      'Save EIN confirmation letter as PDF',
      'Never use personal SSN for business applications after this',
    ],
    resources: [{ label: 'IRS EIN Application', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online' }],
  },
  {
    id: 'address', phase: 1, title: 'Dedicated Business Address', icon: Building2,
    description: 'Use a real business address (not a PO Box). Creditors verify addresses against databases. A virtual office or Regus address works and costs less than $100/month.',
    timeframe: '1–3 days', cost: '$49–$150/month',
    creditImpact: 'Credibility signal', creditScore: 8,
    category: 'entity',
    actionItems: [
      'Sign up for virtual office (Regus, Alliance Virtual, Opus)',
      'Update all accounts/filings with new address',
      'List on Google Business Profile',
    ],
    resources: [{ label: 'Alliance Virtual Offices', url: 'https://www.alliancevirtualoffices.com' }],
  },
  {
    id: 'phone', phase: 1, title: 'Listed Business Phone & Website', icon: Building2,
    description: 'Business must have a dedicated phone number listed on 411 (directory assistance). Lenders call 411 to verify business existence. Website should be live with professional domain.',
    timeframe: '1 week', cost: '$0–$30/month',
    creditImpact: 'Lender verification', creditScore: 7,
    category: 'entity',
    actionItems: [
      'Get dedicated VOIP number (Google Voice, RingCentral)',
      'List on 411.com and yellowpages.com',
      'Ensure veddbuild.com is live with contact page',
    ],
    resources: [{ label: 'List on 411', url: 'https://www.yellowpages.com/free-listing' }],
  },

  // ── Phase 2: Credibility ──
  {
    id: 'bank', phase: 2, title: 'Business Bank Account (6+ months)', icon: Landmark,
    description: 'Open a dedicated business checking account. Length of banking history is a major credit factor. The older the account, the more credibility. Never mix personal and business funds.',
    timeframe: 'Same day + 6 months history', cost: '$0–$25/month',
    creditImpact: '+25 bank reference score', creditScore: 20,
    category: 'banking',
    actionItems: [
      'Open at Chase, Bank of America, or local credit union',
      'Deposit minimum $1,000+ as initial balance',
      'Route all VEDD revenue through this account',
      'Keep average daily balance above $1,500',
    ],
    resources: [
      { label: 'Chase Business Complete', url: 'https://www.chase.com/business/banking/checking' },
      { label: 'Mercury (startup-friendly)', url: 'https://mercury.com' },
    ],
    adminNotes: 'Mercury is best for fintech/AI startups. No minimums, no fees.',
  },
  {
    id: 'duns', phase: 2, title: 'DUNS Number (Dun & Bradstreet)', icon: FileText,
    description: 'D&B DUNS is the most widely used business credit identifier. Required for government contracts, many vendor accounts, and most major lenders. Free but takes 30 days standard (paid for faster).',
    timeframe: '30 days (free) or 5 days ($299)', cost: 'Free or $299',
    creditImpact: 'Opens D&B credit file', creditScore: 18,
    category: 'banking',
    actionItems: [
      'Register at dnb.com/duns-number/get-a-duns-number',
      'Complete full business profile (industry, employees, revenue)',
      'Set up D&B CreditMonitor (free tier) to track your Paydex score',
    ],
    resources: [{ label: 'D&B DUNS Registration', url: 'https://www.dnb.com/duns-number/get-a-duns-number.html' }],
  },
  {
    id: 'nav', phase: 2, title: 'Nav Business Credit Profile', icon: BarChart3,
    description: 'Nav monitors all 3 business credit bureaus (D&B, Experian Business, Equifax Business). Free account shows your scores and alerts when accounts are added.',
    timeframe: '1 day', cost: 'Free (paid tiers for full reports)',
    creditImpact: 'Credit monitoring', creditScore: 5,
    category: 'banking',
    actionItems: [
      'Create account at nav.com',
      'Complete business profile 100%',
      'Enable all credit bureau monitoring',
      'Check weekly to track Paydex score growth',
    ],
    resources: [{ label: 'Nav Business Credit', url: 'https://www.nav.com' }],
  },

  // ── Phase 3: Trade Lines ──
  {
    id: 'uline', phase: 3, title: 'Uline Net-30 Account', icon: CreditCard,
    description: 'Uline is the #1 vendor used for building D&B Paydex score. Buy $50+ in supplies, pay within 30 days, they report to D&B. Do this 3 months in a row for a strong Paydex.',
    timeframe: '30–60 days to report', cost: '$50–$200 (supplies)',
    creditImpact: '+10–20 Paydex pts (each cycle)', creditScore: 15,
    category: 'trade',
    actionItems: [
      'Apply at uline.com/OrderingInfo.aspx for Net-30 terms',
      'Use EIN (not SSN) on application',
      'Buy $50–$75 in office/shipping supplies monthly',
      'Pay invoice within 30 days every month',
      'Repeat 3+ consecutive months',
    ],
    resources: [{ label: 'Uline Net-30 Application', url: 'https://www.uline.com' }],
    adminNotes: 'Uline is the single most impactful easy trade line. Do this first in Phase 3.',
  },
  {
    id: 'quill', phase: 3, title: 'Quill.com Net-30 Account', icon: CreditCard,
    description: 'Quill (Staples subsidiary) offers Net-30 terms and reports to D&B and Experian Business. Great for office supplies.',
    timeframe: '30–45 days to report', cost: '$50–$150',
    creditImpact: '+8–15 pts across bureaus', creditScore: 12,
    category: 'trade',
    actionItems: [
      'Apply at quill.com for business credit account',
      'Purchase $50+ in supplies',
      'Pay on net terms — never early (timed pay = max impact)',
    ],
    resources: [{ label: 'Quill Business Account', url: 'https://www.quill.com' }],
  },
  {
    id: 'grainger', phase: 3, title: 'Grainger Net-30 Account', icon: CreditCard,
    description: 'Grainger industrial/safety supplies. Easy approval with EIN + 6 months in business. Reports to D&B.',
    timeframe: '30–60 days to report', cost: '$50–$200',
    creditImpact: '+10 Paydex pts', creditScore: 10,
    category: 'trade',
    actionItems: [
      'Apply at grainger.com for 30-day credit terms',
      'Purchase any business-relevant item',
      'Pay on time every cycle',
    ],
    resources: [{ label: 'Grainger Credit Application', url: 'https://www.grainger.com' }],
  },
  {
    id: 'crown_office', phase: 3, title: 'Crown Office Supplies Net-30', icon: CreditCard,
    description: 'Crown Office Supplies is a beginner-friendly net-30 vendor specifically designed for new businesses building credit. No PG required. Reports to D&B, Experian Business, and Equifax Business — one of the few vendors that hits all three bureaus.',
    timeframe: '30–45 days to report', cost: '$50–$150 (supplies)',
    creditImpact: '+D&B, Experian, Equifax', creditScore: 13,
    category: 'trade',
    actionItems: [
      'Apply at crownofficeonline.com — use EIN, not SSN',
      'Purchase $50+ in office supplies (pens, paper, organizers)',
      'Pay invoice within 30 days (not early — timed pay = max impact)',
      'Repeat monthly for 3+ cycles to solidify all three bureau reports',
    ],
    resources: [{ label: 'Crown Office Supplies', url: 'https://www.crownofficeonline.com' }],
    adminNotes: 'Reports to all 3 bureaus — use early in Phase 3 for maximum coverage.',
  },
  {
    id: 'summa_office', phase: 3, title: 'Summa Office Supplies Net-30', icon: CreditCard,
    description: 'Summa Office Supplies offers net-30 terms with no personal guarantee and no minimum time in business. Reports to D&B. Great for stacking alongside Crown and Uline in the first 90 days.',
    timeframe: '30–45 days to report', cost: '$50–$100',
    creditImpact: '+D&B Paydex pts', creditScore: 10,
    category: 'trade',
    actionItems: [
      'Apply at summaofficesupplies.com with EIN',
      'Place a $50+ order for business office supplies',
      'Pay on or before day 30 — not early',
      'Stack with Crown and Uline for 3 simultaneous D&B reports',
    ],
    resources: [{ label: 'Summa Office Supplies', url: 'https://www.summaofficesupplies.com' }],
  },
  {
    id: 'shirtsy', phase: 3, title: 'Shirtsy Net-30 Account', icon: CreditCard,
    description: 'Shirtsy is a print-on-demand and promotional products vendor that offers net-30 terms to businesses. Reports to D&B. Especially relevant for VEDD merchandise, ambassador swag, or branded gear orders.',
    timeframe: '30–45 days to report', cost: '$50–$200 (branded items)',
    creditImpact: '+D&B Paydex pts', creditScore: 9,
    category: 'trade',
    actionItems: [
      'Apply for net-30 account at shirtsy.com using EIN',
      'Order branded VEDD apparel, shirts, or promotional items',
      'Keep orders business-relevant — apparel for ambassador outreach works',
      'Pay within net-30 window every cycle',
    ],
    resources: [{ label: 'Shirtsy Net-30', url: 'https://www.shirtsy.com' }],
    adminNotes: 'Doubles as a VEDD merch vendor — combine credit building with ambassador gear orders.',
  },
  {
    id: 'creative_analytics', phase: 3, title: 'Creative Analytics Net-30', icon: CreditCard,
    description: 'Creative Analytics offers net-30 terms for business analytics, marketing data, and software services. Reports to D&B. Good for tech/fintech businesses like VEDD that can justify analytics or marketing spend.',
    timeframe: '30–45 days to report', cost: '$50–$150',
    creditImpact: '+D&B Paydex pts', creditScore: 9,
    category: 'trade',
    actionItems: [
      'Apply for business credit account using EIN',
      'Purchase analytics, data, or marketing service packages',
      'Align purchases with VEDD marketing and data needs',
      'Pay on net-30 schedule every month',
    ],
    resources: [{ label: 'Creative Analytics', url: 'https://www.creativeanalytics.com' }],
  },
  {
    id: 'amazon_business', phase: 3, title: 'Amazon Business Net-30', icon: CreditCard,
    description: 'Amazon Business offers a Pay By Invoice (Net-30) option for business accounts. Reports to D&B and can be used for virtually any business purchase. High approval rate for established entities with EIN and a business bank account.',
    timeframe: '45–60 days to report', cost: '$0 account fee (purchase cost varies)',
    creditImpact: '+D&B + credibility signal', creditScore: 14,
    category: 'trade',
    actionItems: [
      'Create Amazon Business account at business.amazon.com',
      'Apply for Pay By Invoice (Net-30) — requires 60+ days in business',
      'Use EIN and business address on application',
      'Purchase office supplies, tech, or business equipment monthly',
      'Pay invoice within 30 days — Amazon reports on-time payment to D&B',
    ],
    resources: [
      { label: 'Amazon Business', url: 'https://www.amazon.com/business' },
      { label: 'Pay By Invoice Info', url: 'https://www.amazon.com/b?ie=UTF8&node=16653690011' },
    ],
    adminNotes: 'Amazon Business is the highest-value net-30 due to purchase flexibility — use it for VEDD tech/office needs.',
  },

  // ── Phase 4: Revolving ──
  {
    id: 'cc_secured', phase: 4, title: 'Secured Business Credit Card', icon: CreditCard,
    description: 'If no established business credit yet, start with a secured card (deposit-backed). Reports to business bureaus and builds history fast.',
    timeframe: '60–90 days for score impact', cost: '$200–$500 security deposit',
    creditImpact: 'Opens Experian/Equifax file', creditScore: 15,
    category: 'revolving',
    actionItems: [
      'Apply for Capital One Spark Secured or First National Bank secured',
      'Use for recurring VEDD business expenses (ads, software)',
      'Keep utilization under 30%',
      'Pay in full monthly',
    ],
    resources: [{ label: 'Capital One Spark Secured', url: 'https://www.capitalone.com/small-business/credit-cards/spark-classic' }],
  },
  {
    id: 'cc_unsecured', phase: 4, title: 'Unsecured Business Credit Cards ($5k+)', icon: CreditCard,
    description: 'After 6+ months of trade lines and banking history, apply for unsecured cards. Chase Ink, Amex Blue Business Cash, and Capital One Spark are best for startups.',
    timeframe: '6+ months from entity formation', cost: '$0–$95/year',
    creditImpact: '+30–50 pts Experian', creditScore: 20,
    category: 'revolving',
    actionItems: [
      'Check eligibility via Nav before applying (soft pull)',
      'Apply for Chase Ink Business Preferred or Amex Blue Business Cash',
      'Stack multiple cards with different bureaus over 6 months',
      'Never close old accounts',
    ],
    resources: [
      { label: 'Chase Ink Business Cards', url: 'https://creditcards.chase.com/business-credit-cards' },
      { label: 'Amex Blue Business Cash', url: 'https://www.americanexpress.com/us/credit-cards/card/blue-business-cash' },
    ],
  },

  // ── Phase 5: Installment ──
  {
    id: 'term_loan', phase: 5, title: 'Small Business Term Loan ($10k–$50k)', icon: Landmark,
    description: 'After 12 months of business banking and trade lines, apply for a term loan through an online lender. Kabbage, Fundbox, or BlueVine offer fast approvals.',
    timeframe: '12+ months in business', cost: 'Interest 8–40% APR',
    creditImpact: 'Installment history on all bureaus', creditScore: 18,
    category: 'installment',
    actionItems: [
      'Ensure 12+ months banking history',
      'Prepare P&L statement and bank statements (3 months)',
      'Apply to Kabbage/Fundbox/BlueVine first (soft pull)',
      'Use funds for VEDD marketing or tech infrastructure',
      'Pay on time every month — never late',
    ],
    resources: [
      { label: 'Kabbage by American Express', url: 'https://www.kabbage.com' },
      { label: 'Fundbox', url: 'https://fundbox.com' },
    ],
  },
  {
    id: 'sba_micro', phase: 5, title: 'SBA Microloan ($10k–$50k)', icon: Award,
    description: 'SBA Microloans through nonprofit intermediaries. Lower rates (8–13% APR), no prepayment penalty. Excellent for fintech startups.',
    timeframe: '6+ months, 90-day approval process', cost: '8–13% APR',
    creditImpact: '+35 pts all bureaus', creditScore: 20,
    category: 'installment',
    actionItems: [
      'Find local SBA Microloan intermediary at sba.gov/lendermatch',
      'Prepare business plan, financials, use-of-funds statement',
      'Submit application through intermediary (not SBA directly)',
      'Be ready for 60–90 day process',
    ],
    resources: [{ label: 'SBA Microloan Program', url: 'https://www.sba.gov/funding-programs/loans/microloans' }],
  },

  // ── Phase 6: Major Funding ──
  {
    id: 'loc', phase: 6, title: 'Business Line of Credit ($50k–$250k)', icon: TrendingUp,
    description: 'A revolving line of credit from a bank or credit union. Draw and repay as needed. Best for managing cash flow. Requires 2+ years in business and strong credit.',
    timeframe: '18–24 months after entity formation', cost: 'Interest on drawn amount only',
    creditImpact: 'Major revolving credit facility', creditScore: 25,
    category: 'funding',
    actionItems: [
      'Maintain 720+ business credit score across bureaus',
      'Approach your existing business bank first',
      'Also apply through Bluevine ($250k LOC) and Headway Capital',
      'Use for VEDD platform growth, marketing, ambassador payouts',
    ],
    resources: [
      { label: 'Bluevine Line of Credit', url: 'https://www.bluevine.com/line-of-credit' },
      { label: 'Headway Capital', url: 'https://www.headwaycapital.com' },
    ],
    adminNotes: 'Target: $100k LOC within 24 months. This funds ambassador scaling.',
  },
  {
    id: 'sba_7a', phase: 6, title: 'SBA 7(a) Loan ($150k–$5M)', icon: Landmark,
    description: 'The flagship SBA loan program. Best rates (prime + 2.75%), longest terms (up to 10 years). Ideal for VEDD expansion, hiring, or acquiring trading technology.',
    timeframe: '24+ months from entity formation', cost: 'Prime + 2.75% APR (currently ~11%)',
    creditImpact: 'Tier-1 credibility signal', creditScore: 30,
    category: 'funding',
    actionItems: [
      'Work with SBA-preferred lender (list at sba.gov)',
      'Prepare 3 years projected financials',
      'Show 2+ years revenue history',
      'Write detailed use-of-proceeds plan',
    ],
    resources: [
      { label: 'SBA 7(a) Lender Match', url: 'https://www.sba.gov/funding-programs/loans/7a-loans' },
    ],
  },
];

// ── Progress helpers ──────────────────────────────────────────────────────────
function totalImpact(completedIds: string[]): number {
  return CREDIT_STEPS.filter(s => completedIds.includes(s.id))
    .reduce((sum, s) => sum + s.creditScore, 0);
}
const MAX_SCORE = CREDIT_STEPS.reduce((s, step) => s + step.creditScore, 0);

// ── Phase card ────────────────────────────────────────────────────────────────
function PhaseCard({ phase, steps, completedIds, onToggle, isExpanded, onExpand }: {
  phase: typeof PHASES[0];
  steps: CreditStep[];
  completedIds: string[];
  onToggle: (id: string) => void;
  isExpanded: boolean;
  onExpand: () => void;
}) {
  const done = steps.filter(s => completedIds.includes(s.id)).length;
  const phasePct = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;
  const allDone = done === steps.length;

  return (
    <div className="rounded-2xl overflow-hidden border transition-all duration-200"
      style={{ borderColor: isExpanded ? phase.color : 'rgba(255,255,255,.08)', background: 'rgba(255,255,255,.02)' }}>
      {/* Phase header */}
      <button className="w-full px-5 py-4 flex items-center gap-4 text-left" onClick={onExpand}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-sm"
          style={{ background: allDone ? '#10b981' : phase.color }}>
          {allDone ? '✓' : phase.id}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-sm">{phase.label}</h3>
            <span className="text-[10px] text-gray-500">{phase.desc}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 bg-gray-800 rounded-full h-1.5 max-w-[120px]">
              <div className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${phasePct}%`, background: phase.color }} />
            </div>
            <span className="text-[10px] text-gray-500">{done}/{steps.length} complete</span>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />}
      </button>

      {/* Steps */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {steps.map(step => {
            const done = completedIds.includes(step.id);
            const Icon = step.icon;
            return (
              <div key={step.id} className="rounded-xl border transition-all duration-200"
                style={{ background: done ? 'rgba(16,185,129,.06)' : 'rgba(0,0,0,.3)', borderColor: done ? 'rgba(16,185,129,.3)' : 'rgba(255,255,255,.06)' }}>
                {/* Step header */}
                <div className="flex items-start gap-3 p-4">
                  <button onClick={() => onToggle(step.id)} className="flex-shrink-0 mt-0.5">
                    {done
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      : <Circle className="h-5 w-5 text-gray-600 hover:text-white transition-colors" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h4 className={`font-bold text-sm ${done ? 'text-emerald-400 line-through opacity-70' : 'text-white'}`}>{step.title}</h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: `${phase.color}22`, color: phase.color, border: `1px solid ${phase.color}44` }}>
                          {step.creditImpact}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{step.description}</p>

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
                      <span className="flex items-center gap-1 text-gray-500"><Clock className="h-3 w-3" />{step.timeframe}</span>
                      <span className="flex items-center gap-1 text-gray-500"><DollarSign className="h-3 w-3" />{step.cost}</span>
                      <span className="flex items-center gap-1" style={{ color: phase.color }}>
                        <BarChart3 className="h-3 w-3" />+{step.creditScore} pts
                      </span>
                    </div>

                    {/* Action items */}
                    <div className="mt-3 space-y-1.5">
                      {step.actionItems.map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <ArrowRight className="h-3 w-3 text-gray-600 mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] text-gray-400 leading-relaxed">{item}</p>
                        </div>
                      ))}
                    </div>

                    {/* Resources */}
                    {step.resources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {step.resources.map(r => (
                          <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] underline text-blue-400 hover:text-blue-300">
                            🔗 {r.label}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Admin notes */}
                    {step.adminNotes && (
                      <div className="mt-2 flex items-start gap-1.5 bg-amber-950/30 border border-amber-800/30 rounded-lg px-2.5 py-1.5">
                        <Star className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-300">{step.adminNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CreditBuilderPage() {
  const { user } = useAuth();
  const isAdmin = !!(user as any)?.isAdmin;

  const [completedIds, setCompletedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('vedd_credit_steps') || '[]'); } catch { return []; }
  });
  const [expandedPhase, setExpandedPhase] = useState<number>(1);

  if (!isAdmin) return <Redirect to="/dashboard" />;

  const toggleStep = (id: string) => {
    setCompletedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem('vedd_credit_steps', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const score = totalImpact(completedIds);
  const scorePct = Math.round((score / MAX_SCORE) * 100);
  const estimatedPaYDex = Math.min(100, Math.round(20 + scorePct * 0.8));

  const scoreTier = scorePct >= 75 ? { label: 'Excellent', color: '#10b981' }
    : scorePct >= 50 ? { label: 'Good', color: '#3b82f6' }
    : scorePct >= 25 ? { label: 'Building', color: '#f59e0b' }
    : { label: 'Starting', color: '#ef4444' };

  const nextStep = CREDIT_STEPS.find(s => !completedIds.includes(s.id));

  return (
    <div className="min-h-screen pb-12" style={{ background: 'linear-gradient(180deg,#060610 0%,#080812 100%)' }}>
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-4 w-4 text-red-400" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Admin Only</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-1">Business Credit Builder</h1>
          <p className="text-gray-400 text-sm">VEDD's step-by-step roadmap to build business credit and unlock major funding.</p>
        </div>

        {/* Progress dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {/* Overall progress */}
          <div className="sm:col-span-2 rounded-2xl p-5 flex gap-5 items-center"
            style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
            {/* Circular gauge */}
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                <circle cx="48" cy="48" r="40" fill="none" stroke="#1f2937" strokeWidth="8" />
                <circle cx="48" cy="48" r="40" fill="none" stroke={scoreTier.color} strokeWidth="8"
                  strokeLinecap="round" strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - scorePct / 100)}
                  style={{ transition: 'stroke-dashoffset 1s ease' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black" style={{ color: scoreTier.color }}>{scorePct}%</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">Overall Progress</p>
              <h2 className="text-xl font-black text-white mb-0.5">{scoreTier.label}</h2>
              <p className="text-xs text-gray-400">{completedIds.length} of {CREDIT_STEPS.length} steps complete · {score}/{MAX_SCORE} pts</p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-gray-500">Est. Paydex:</span>
                <span className="font-bold" style={{ color: scoreTier.color }}>{estimatedPaYDex}/100</span>
              </div>
            </div>
          </div>

          {/* Next step */}
          <div className="rounded-2xl p-4 flex flex-col justify-center"
            style={{ background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.2)' }}>
            <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">Next Action</p>
            {nextStep ? (
              <>
                <p className="text-sm font-bold text-white mb-1">{nextStep.title}</p>
                <p className="text-[10px] text-gray-400 mb-2 flex items-center gap-1"><Clock className="h-3 w-3" />{nextStep.timeframe}</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1"><DollarSign className="h-3 w-3" />{nextStep.cost}</p>
                <Button size="sm" className="mt-3 text-xs w-full font-bold"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#7c3aed)' }}
                  onClick={() => setExpandedPhase(nextStep.phase)}>
                  Go to Step <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </>
            ) : (
              <p className="text-sm text-emerald-400 font-bold">All steps complete! 🎉</p>
            )}
          </div>
        </div>

        {/* Phase cards */}
        <div className="space-y-4">
          {PHASES.map(phase => {
            const steps = CREDIT_STEPS.filter(s => s.phase === phase.id);
            return (
              <PhaseCard key={phase.id} phase={phase} steps={steps}
                completedIds={completedIds} onToggle={toggleStep}
                isExpanded={expandedPhase === phase.id}
                onExpand={() => setExpandedPhase(expandedPhase === phase.id ? 0 : phase.id)} />
            );
          })}
        </div>

        {/* Disclaimer */}
        <div className="mt-8 flex gap-2 bg-amber-900/20 border border-amber-700/30 rounded-xl p-4">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/70 leading-relaxed">
            This roadmap is based on standard US business credit building practices. Always consult a financial advisor before taking on debt. Interest rates, approval requirements, and lender terms change frequently. VEDD is not responsible for outcomes from following this guide.
          </p>
        </div>
      </div>
    </div>
  );
}
