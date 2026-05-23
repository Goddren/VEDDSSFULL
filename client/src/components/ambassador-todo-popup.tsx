import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, Plus, Trash2,
  ClipboardList, X, RefreshCw, Flame, Megaphone, Users,
  TrendingUp, Zap, Star, AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ── Task definitions ──────────────────────────────────────────────────────────

type TaskFrequency = 'daily' | 'weekly' | 'pinned';
type TaskCategory = 'content' | 'community' | 'recruitment' | 'platform' | 'admin';

interface TaskTemplate {
  id: string;
  label: string;
  detail?: string;
  category: TaskCategory;
  frequency: TaskFrequency;
  adminOnly?: boolean;
  priority?: 'high' | 'normal';
}

const TASK_TEMPLATES: TaskTemplate[] = [
  // ── Daily content ──────────────────────────────────────────────────────────
  { id: 'd_post_1', label: 'Post 1 piece of VEDD content today', detail: 'Instagram Reel, TikTok, or X thread — keep the algorithm warm', category: 'content', frequency: 'daily', priority: 'high' },
  { id: 'd_story',  label: 'Post a Story/Status update', detail: 'Quick update, poll, or behind-the-scenes of your trading day', category: 'content', frequency: 'daily' },
  { id: 'd_engage', label: 'Reply to 3+ comments/DMs', detail: 'Engagement beats posting — respond, build relationships', category: 'community', frequency: 'daily' },
  { id: 'd_dm',     label: 'DM 5 warm prospects about VEDD', detail: 'People who liked/commented on trading content recently', category: 'recruitment', frequency: 'daily', priority: 'high' },
  { id: 'd_trade',  label: 'Share a trade result or chart setup', detail: 'Win or loss — authenticity builds trust faster than perfection', category: 'content', frequency: 'daily' },

  // ── Weekly content ─────────────────────────────────────────────────────────
  { id: 'w_weekly_analysis', label: 'Share VEDD weekly market analysis post', detail: 'Use the weekly plan from the SS AI Engine as your content hook', category: 'content', frequency: 'weekly', priority: 'high' },
  { id: 'w_testimonial',     label: 'Post 1 student/user testimonial', detail: 'Screenshot a DM or result from someone you helped', category: 'content', frequency: 'weekly', priority: 'high' },
  { id: 'w_feature',         label: 'Highlight a VEDD feature in a post/Reel', detail: 'AI second opinion, live engine, position calculator — pick one', category: 'platform', frequency: 'weekly' },
  { id: 'w_education',       label: 'Post an educational piece (ICT/SMC/Risk)', detail: 'Position yourself as the expert — then tie it back to VEDD', category: 'content', frequency: 'weekly' },
  { id: 'w_community',       label: 'Host or join a community trading discussion', detail: 'Spaces on X, IG Live, or Discord — show up live', category: 'community', frequency: 'weekly' },
  { id: 'w_recruit',         label: 'Follow up with 10+ prospects from last week', detail: 'Check your DMs — people who asked questions need a nudge', category: 'recruitment', frequency: 'weekly' },
  { id: 'w_referral_check',  label: 'Check your referral stats and celebrate wins', detail: 'Post your referral progress publicly — social proof recruits others', category: 'platform', frequency: 'weekly' },

  // ── Pinned (always-on reminders) ──────────────────────────────────────────
  { id: 'p_link_in_bio', label: 'Ensure your VEDD referral link is in your bio', detail: 'Every profile, every platform — 24/7 passive recruitment', category: 'platform', frequency: 'pinned' },
  { id: 'p_content_plan', label: 'Plan next week\'s content before Sunday night', detail: 'Content calendar prevents dead air — batch-create when inspired', category: 'content', frequency: 'pinned' },
  { id: 'p_lead_page',   label: 'Keep your VEDD lead page updated', detail: 'Add recent wins and testimonials — your page sells while you sleep', category: 'platform', frequency: 'pinned' },

  // ── Admin-only ─────────────────────────────────────────────────────────────
  { id: 'a_review_amb',   label: 'Review new ambassador applications', category: 'admin', frequency: 'daily', adminOnly: true, priority: 'high' },
  { id: 'a_push_update',  label: 'Announce any platform updates to ambassadors', detail: 'New features need internal comms before public push', category: 'admin', frequency: 'weekly', adminOnly: true, priority: 'high' },
  { id: 'a_metrics',      label: 'Review platform metrics & growth KPIs', category: 'admin', frequency: 'weekly', adminOnly: true },
  { id: 'a_content_brief', label: 'Send weekly content brief to ambassador team', detail: 'What to post this week, which features to highlight, any campaigns', category: 'admin', frequency: 'weekly', adminOnly: true, priority: 'high' },
  { id: 'a_pool_check',   label: 'Check VEDD pool distribution & token status', category: 'admin', frequency: 'weekly', adminOnly: true },
];

const CATEGORY_META: Record<TaskCategory, { label: string; color: string; icon: any }> = {
  content:     { label: 'Content',     color: 'text-purple-400',  icon: Megaphone },
  community:   { label: 'Community',   color: 'text-blue-400',    icon: Users },
  recruitment: { label: 'Recruitment', color: 'text-amber-400',   icon: TrendingUp },
  platform:    { label: 'Platform',    color: 'text-cyan-400',    icon: Zap },
  admin:       { label: 'Admin',       color: 'text-red-400',     icon: AlertCircle },
};

// ── Persistence helpers ───────────────────────────────────────────────────────

function getTodayKey()  { return new Date().toISOString().slice(0, 10); }
function getWeekKey()   { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); const mon = new Date(d.setDate(diff)); return `week_${mon.toISOString().slice(0, 10)}`; }

function loadChecked(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('vedd_amb_todo') || '{}';
    return JSON.parse(raw) as Record<string, boolean>;
  } catch { return {}; }
}

function saveChecked(data: Record<string, boolean>) {
  try { localStorage.setItem('vedd_amb_todo', JSON.stringify(data)); } catch {}
}

function loadCustomTasks(): { id: string; label: string; category: TaskCategory; frequency: TaskFrequency }[] {
  try {
    const raw = localStorage.getItem('vedd_amb_custom') || '[]';
    return JSON.parse(raw);
  } catch { return []; }
}

function saveCustomTasks(tasks: any[]) {
  try { localStorage.setItem('vedd_amb_custom', JSON.stringify(tasks)); } catch {}
}

// ── Main component ────────────────────────────────────────────────────────────

export function AmbassadorTodoPopup() {
  const { user } = useAuth();
  const isAmbassador = (user as any)?.isAmbassador;
  const isAdmin      = (user as any)?.isAdmin;

  // Only show for ambassadors and admins
  if (!isAmbassador && !isAdmin) return null;

  return <TodoPopupInner isAdmin={!!isAdmin} />;
}

function TodoPopupInner({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen]         = useState(false);
  const [checked, setChecked]   = useState<Record<string, boolean>>(loadChecked);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [customTasks, setCustomTasks] = useState(loadCustomTasks);
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [addingTask, setAddingTask]     = useState(false);
  const [filter, setFilter]    = useState<'all' | 'daily' | 'weekly' | 'pinned'>('all');

  // Build keyed task IDs for storage
  const todayKey = getTodayKey();
  const weekKey  = getWeekKey();

  const makeKey = (task: { id: string; frequency: TaskFrequency }) => {
    if (task.frequency === 'daily')  return `${task.id}_${todayKey}`;
    if (task.frequency === 'weekly') return `${task.id}_${weekKey}`;
    return task.id; // pinned — never auto-resets
  };

  const allTasks = [
    ...TASK_TEMPLATES.filter(t => isAdmin ? true : !t.adminOnly),
    ...customTasks.map(t => ({ ...t, detail: undefined, adminOnly: false as const, priority: 'normal' as const })),
  ];

  const filteredTasks = allTasks.filter(t => filter === 'all' || t.frequency === filter);

  const doneCount  = filteredTasks.filter(t => checked[makeKey(t)]).length;
  const totalCount = filteredTasks.length;
  const pending    = totalCount - doneCount;

  const toggle = useCallback((task: typeof allTasks[0]) => {
    const key = makeKey(task);
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveChecked(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, weekKey]);

  const addCustomTask = () => {
    if (!newTaskLabel.trim()) return;
    const task = { id: `custom_${Date.now()}`, label: newTaskLabel.trim(), category: 'content' as TaskCategory, frequency: 'daily' as TaskFrequency };
    const updated = [...customTasks, task];
    setCustomTasks(updated);
    saveCustomTasks(updated);
    setNewTaskLabel('');
    setAddingTask(false);
  };

  const removeCustomTask = (id: string) => {
    const updated = customTasks.filter(t => t.id !== id);
    setCustomTasks(updated);
    saveCustomTasks(updated);
  };

  const clearCompleted = () => {
    const next = { ...checked };
    filteredTasks.filter(t => checked[makeKey(t)]).forEach(t => { delete next[makeKey(t)]; });
    setChecked(next);
    saveChecked(next);
  };

  // Group by category
  const categories = Array.from(new Set(filteredTasks.map(t => t.category))) as TaskCategory[];

  const completionPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <>
      {/* ── Floating trigger button ── */}
      <div className="fixed bottom-24 left-4 z-40 flex flex-col items-start gap-1">
        <motion.button
          onClick={() => setOpen(v => !v)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative flex items-center gap-2 px-3 py-2 rounded-2xl shadow-2xl font-semibold text-sm transition-all"
          style={{
            background: pending > 0
              ? 'linear-gradient(135deg, #7c3aed 0%, #dc2626 100%)'
              : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
            color: 'white',
            boxShadow: pending > 0 ? '0 0 20px rgba(124,58,237,0.4)' : '0 0 20px rgba(22,163,74,0.4)',
          }}
        >
          <ClipboardList className="w-4 h-4" />
          <span className="hidden sm:inline">VEDD Tasks</span>
          {pending > 0 ? (
            <span className="bg-white/30 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pending}
            </span>
          ) : (
            <CheckCircle2 className="w-4 h-4 text-white/80" />
          )}
        </motion.button>
        {/* Progress bar under button */}
        {totalCount > 0 && (
          <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden" style={{ minWidth: 80 }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%`, background: completionPct === 100 ? '#16a34a' : '#7c3aed' }}
            />
          </div>
        )}
      </div>

      {/* ── Panel ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => setOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: -360, opacity: 0 }}
              animate={{ x: 0,    opacity: 1 }}
              exit={{   x: -360, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[340px] max-w-[92vw] flex flex-col"
              style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #0a0a14 100%)', borderRight: '1px solid rgba(124,58,237,0.3)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-purple-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #dc2626)' }}>
                    <ClipboardList className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">VEDD Push List</p>
                    <p className="text-purple-400/60 text-[10px]">
                      {doneCount}/{totalCount} done · {completionPct}% complete
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {doneCount > 0 && (
                    <button onClick={clearCompleted} className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
                      <RefreshCw className="w-3 h-3" /> Clear done
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-white/5">
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${completionPct}%`, background: completionPct === 100 ? '#16a34a' : 'linear-gradient(90deg, #7c3aed, #dc2626)' }}
                />
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 p-3 border-b border-purple-500/10">
                {(['all', 'daily', 'weekly', 'pinned'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all ${
                      filter === f
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {categories.map(cat => {
                  const catTasks = filteredTasks.filter(t => t.category === cat);
                  if (!catTasks.length) return null;
                  const catMeta = CATEGORY_META[cat];
                  const CatIcon = catMeta.icon;
                  const isCollapsed = collapsed[cat];
                  const catDone = catTasks.filter(t => checked[makeKey(t)]).length;

                  return (
                    <div key={cat} className="rounded-xl border border-white/5 overflow-hidden">
                      {/* Category header */}
                      <button
                        onClick={() => setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))}
                        className="w-full flex items-center justify-between px-3 py-2 bg-white/3 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <CatIcon className={`w-3.5 h-3.5 ${catMeta.color}`} />
                          <span className={`text-xs font-bold ${catMeta.color}`}>{catMeta.label}</span>
                          <span className="text-[10px] text-gray-600">{catDone}/{catTasks.length}</span>
                        </div>
                        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-600" />}
                      </button>

                      {!isCollapsed && (
                        <div className="divide-y divide-white/3">
                          {catTasks.map(task => {
                            const key  = makeKey(task);
                            const done = !!checked[key];
                            const isCustom = task.id.startsWith('custom_');
                            return (
                              <div
                                key={task.id}
                                className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer group transition-colors ${done ? 'opacity-50' : 'hover:bg-white/3'}`}
                                onClick={() => toggle(task)}
                              >
                                <div className="mt-0.5 flex-shrink-0">
                                  {done
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    : <Circle className={`w-4 h-4 ${(task as any).priority === 'high' ? 'text-amber-400' : 'text-gray-600'} group-hover:text-gray-400 transition-colors`} />
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium leading-snug ${done ? 'line-through text-gray-500' : 'text-white'}`}>
                                    {(task as any).priority === 'high' && !done && (
                                      <span className="text-amber-400 mr-1">⚡</span>
                                    )}
                                    {task.label}
                                  </p>
                                  {(task as any).detail && !done && (
                                    <p className="text-[10px] text-gray-600 mt-0.5 leading-snug">{(task as any).detail}</p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <Badge className={`text-[9px] border-0 py-0 ${
                                      task.frequency === 'daily'  ? 'bg-blue-500/15 text-blue-400' :
                                      task.frequency === 'weekly' ? 'bg-purple-500/15 text-purple-400' :
                                      'bg-gray-500/15 text-gray-400'
                                    }`}>
                                      {task.frequency}
                                    </Badge>
                                  </div>
                                </div>
                                {isCustom && (
                                  <button
                                    onClick={e => { e.stopPropagation(); removeCustomTask(task.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Completion message */}
                {completionPct === 100 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-center space-y-1"
                  >
                    <div className="text-2xl">🔥</div>
                    <p className="text-emerald-400 font-bold text-sm">All tasks done!</p>
                    <p className="text-gray-500 text-xs">You're pushing VEDD forward. Word is bond.</p>
                  </motion.div>
                )}
              </div>

              {/* Add custom task */}
              <div className="p-3 border-t border-purple-500/20">
                <AnimatePresence>
                  {addingTask ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="flex gap-2 mb-2"
                    >
                      <input
                        autoFocus
                        value={newTaskLabel}
                        onChange={e => setNewTaskLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addCustomTask(); if (e.key === 'Escape') setAddingTask(false); }}
                        placeholder="Add a custom task…"
                        className="flex-1 bg-white/5 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                      />
                      <button onClick={addCustomTask} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors">Add</button>
                      <button onClick={() => setAddingTask(false)} className="px-2 py-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"><X className="w-4 h-4" /></button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <button
                  onClick={() => setAddingTask(v => !v)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-purple-500/30 text-purple-400/60 hover:text-purple-400 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add custom task
                </button>
                <p className="text-[9px] text-gray-700 text-center mt-2">Daily tasks reset midnight · Weekly tasks reset Monday</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
