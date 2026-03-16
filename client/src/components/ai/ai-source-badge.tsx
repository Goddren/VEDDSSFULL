import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { Key, Cpu } from 'lucide-react';
import { Link } from 'wouter';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  google: 'Gemini',
  groq: 'Groq',
  mistral: 'Mistral',
};

export function AISourceBadge() {
  const { user } = useAuth();

  const { data } = useQuery<{ source: 'own' | 'platform'; provider: string | null }>({
    queryKey: ['/api/user-api-keys/active-source'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  if (!data) return null;

  const isOwn = data.source === 'own';
  const label = isOwn
    ? `Your Key: ${PROVIDER_NAMES[data.provider || ''] || data.provider}`
    : 'Platform AI';

  const tooltipText = isOwn
    ? `AI requests route through your ${PROVIDER_NAMES[data.provider || ''] || data.provider} key — no platform limits apply.`
    : 'AI requests use the shared platform key. Add your own key for unlimited personal usage.';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/ai-api-keys">
            <Badge
              variant="outline"
              className={`cursor-pointer text-xs gap-1.5 px-2.5 py-1 transition-colors ${
                isOwn
                  ? 'border-green-500/40 text-green-400 hover:bg-green-500/10'
                  : 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10'
              }`}
            >
              {isOwn ? <Key className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
              {label}
            </Badge>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-center">
          <p className="text-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
