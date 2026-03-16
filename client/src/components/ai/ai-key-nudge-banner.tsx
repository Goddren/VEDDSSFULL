import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Key, X, ArrowRight } from 'lucide-react';

export function AIKeyNudgeBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  const dismissKey = useMemo(
    () => (user?.id ? `byok_nudge_dismissed_${user.id}` : null),
    [user?.id]
  );

  useEffect(() => {
    if (!dismissKey) return;
    setDismissed(localStorage.getItem(dismissKey) === 'true');
  }, [dismissKey]);

  const { data } = useQuery<{ source: 'own' | 'platform'; provider: string | null }>({
    queryKey: ['/api/user-api-keys/active-source'],
    enabled: !!user && !dismissed,
  });

  if (dismissed || !data || data.source === 'own') return null;

  const handleDismiss = () => {
    if (dismissKey) localStorage.setItem(dismissKey, 'true');
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/5 p-4 flex items-center gap-4 flex-wrap">
      <div className="p-2 rounded-lg bg-amber-500/20">
        <Key className="h-5 w-5 text-amber-400" />
      </div>
      <div className="flex-1 min-w-[200px]">
        <p className="font-semibold text-sm text-amber-200">Bring Your Own AI Key</p>
        <p className="text-xs text-muted-foreground">
          Add your own OpenAI, Groq, or Claude key for unlimited AI calls at your own cost — no platform limits.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/ai-api-keys">
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
            Add My Key <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
