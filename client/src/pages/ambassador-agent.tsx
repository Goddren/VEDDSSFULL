import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, RefreshCw, Sparkles } from "lucide-react";

// Ambassador agent — daily post queue built from the 44-day plan
// (server/services/ambassador-post-queue.ts). Copy, post, mark posted.

const LABEL: Record<string, string> = {
  tiktok: "TikTok", instagram: "Instagram", facebook_page: "Facebook Page", facebook_group: "Facebook Group",
};

interface Post {
  id: number; day_number: number; platform: string; format: string | null; hook: string | null;
  body: string; hashtags: string[] | null; visual_idea: string | null; link: string | null;
  status: string; clicks: number;
}
interface QueueResponse {
  date: string; posts: Post[];
  stats: { totals: { days_posted: number; posts: number; clicks: number }; byPlatform: { platform: string; posted: number; clicks: number }[] };
}

export default function AmbassadorAgentPage() {
  const { toast } = useToast();
  // The ambassador's local date, so "today" doesn't roll over at UTC midnight.
  const d = new Date();
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const queueKey = `/api/ambassador/agent/queue?date=${localDate}`;
  const { data, isLoading } = useQuery<QueueResponse>({ queryKey: [queueKey] });

  const generate = useMutation({
    mutationFn: async (regenerate: boolean) => (await apiRequest("POST", "/api/ambassador/agent/queue/generate", { regenerate, date: localDate })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queueKey] }),
    onError: (e: any) => toast({ title: "Couldn't build today's posts", description: e?.message, variant: "destructive" }),
  });
  const posted = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => apiRequest("POST", `/api/ambassador/agent/queue/${id}/posted`, { posted: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queueKey] }),
  });

  const copy = async (p: Post) => {
    const tags = (p.hashtags || []).join(" ");
    const text = [p.hook, p.body, tags].filter(Boolean).join("\n\n");
    try { await navigator.clipboard.writeText(text); toast({ title: `${LABEL[p.platform] || p.platform} post copied` }); }
    catch { toast({ title: "Copy failed — select the text manually", variant: "destructive" }); }
  };

  const posts = data?.posts || [];
  const t = data?.stats?.totals;

  return (
    <div className="container max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Today's posts</h1>
        <p className="text-sm text-muted-foreground">
          Your agent turns each day of the 44-day plan into ready-to-post copy with your tracked link. Copy it, post it, mark it posted.
        </p>
      </div>

      {t && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Card><CardContent className="p-3"><div className="text-xl font-semibold">{t.days_posted}</div><div className="text-xs text-muted-foreground">days posted</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xl font-semibold">{t.posts}</div><div className="text-xs text-muted-foreground">posts</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xl font-semibold">{t.clicks}</div><div className="text-xs text-muted-foreground">link clicks</div></CardContent></Card>
        </div>
      )}

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : posts.length === 0 ? (
        <Card><CardContent className="p-6 text-center space-y-3">
          <p className="text-sm">No posts for today yet.</p>
          <Button onClick={() => generate.mutate(false)} disabled={generate.isPending}>
            <Sparkles className="h-4 w-4 mr-2" />{generate.isPending ? "Writing today's posts…" : "Build today's posts"}
          </Button>
        </CardContent></Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Badge variant="secondary">Day {posts[0].day_number} of 44</Badge>
            <Button size="sm" variant="ghost" onClick={() => generate.mutate(true)} disabled={generate.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" />Rewrite unposted
            </Button>
          </div>
          {posts.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{LABEL[p.platform] || p.platform}{p.format ? ` · ${p.format}` : ""}</CardTitle>
                <span className="text-xs text-muted-foreground">{p.clicks} clicks</span>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.hook && <p className="font-medium">{p.hook}</p>}
                <p className="whitespace-pre-wrap text-sm">{p.body}</p>
                {p.hashtags?.length ? <p className="text-sm text-primary">{p.hashtags.join(" ")}</p> : null}
                {p.visual_idea && <p className="text-xs text-muted-foreground">Visual: {p.visual_idea}</p>}
                {p.platform === "facebook_group" && <p className="text-xs text-muted-foreground">Post by hand in groups you belong to, and follow each group's rules on promotion.</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => copy(p)}><Copy className="h-4 w-4 mr-1" />Copy</Button>
                  <Button size="sm" variant={p.status === "posted" ? "secondary" : "outline"}
                    onClick={() => posted.mutate({ id: p.id, value: p.status !== "posted" })}>
                    <Check className="h-4 w-4 mr-1" />{p.status === "posted" ? "Posted" : "Mark posted"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
