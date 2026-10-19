import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check, X as XIcon, Pencil, Sparkles, Instagram, Twitter, Trophy } from "lucide-react";

interface SocialPost {
  id: number; kind: string; platform: "instagram" | "x"; status: string;
  caption: string | null; thread: string[] | null; period_key: string | null;
  created_at: string; reviewed_at: string | null; posted_at: string | null; error: string | null; has_image: boolean;
}

const KIND_LABEL: Record<string, string> = {
  challenge_daily: "$100K challenge", daily_update: "Daily update", weekly_recap: "Weekly recap", shadow_progress: "Shadow progress", engine_insight: "Engine insight", milestone: "Milestone",
};
const STATUS_TABS = ["draft", "approved", "posted", "skipped"] as const;

export default function SocialQueuePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("draft");
  const [editing, setEditing] = useState<number | null>(null);
  const [draftText, setDraftText] = useState("");
  const [msTitle, setMsTitle] = useState("");
  const [msDetail, setMsDetail] = useState("");

  const posts = useQuery<{ posts: SocialPost[] }>({ queryKey: [`/api/social/posts?status=${tab}`], refetchInterval: 60000 });
  const refresh = () => STATUS_TABS.forEach((s) => queryClient.invalidateQueries({ queryKey: [`/api/social/posts?status=${s}`] }));

  const review = useMutation({
    mutationFn: async (v: { id: number; action: "approve" | "skip" | "edit"; caption?: string; thread?: string[] }) =>
      (await apiRequest("POST", `/api/social/${v.id}/review`, v)).json(),
    onSuccess: (_d, v) => { toast({ title: v.action === "approve" ? "Approved" : v.action === "skip" ? "Skipped" : "Saved" }); setEditing(null); refresh(); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const generate = useMutation({
    mutationFn: async (kind: string) => (await apiRequest("POST", "/api/social/generate", { kind, force: true })).json(),
    onSuccess: (d: any) => { toast({ title: "Generate", description: d.note }); refresh(); },
    onError: (e: Error) => toast({ title: "Generate failed", description: e.message, variant: "destructive" }),
  });
  const emailNow = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/social/email-now", {})).json(),
    onSuccess: (d: any) => toast({ title: d.sent ? "Email sent" : "Not sent", description: d.note }),
    onError: (e: Error) => toast({ title: "Email failed", description: e.message, variant: "destructive" }),
  });
  const milestone = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/social/milestone", { title: msTitle, detail: msDetail })).json(),
    onSuccess: () => { toast({ title: "Milestone drafted" }); setMsTitle(""); setMsDetail(""); refresh(); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const startEdit = (p: SocialPost) => {
    setEditing(p.id);
    setDraftText(p.platform === "x" ? (p.thread || [p.caption || ""]).join("\n---\n") : p.caption || "");
  };
  const saveEdit = (p: SocialPost) => {
    if (p.platform === "x") {
      const thread = draftText.split(/\n---\n/).map((t) => t.trim()).filter(Boolean);
      review.mutate({ id: p.id, action: "edit", thread, caption: thread[0] });
    } else review.mutate({ id: p.id, action: "edit", caption: draftText });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Social Autopilot</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Drafts built from the engine's real results (percentages only). Nothing posts until you approve it — publishing to Instagram and X arrives in phase 2.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create drafts now</CardTitle>
            <CardDescription>Normally automatic: daily update + morning email every day, insight Mon, shadow progress Wed, weekly recap Sat, milestones every 6 hours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => emailNow.mutate()} disabled={emailNow.isPending} data-testid="button-email-now">Email me today's posts</Button>
              {Object.entries(KIND_LABEL).map(([k, label]) => (
                <Button key={k} size="sm" variant="outline" onClick={() => generate.mutate(k)} disabled={generate.isPending} data-testid={`button-generate-${k}`}>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />{label}
                </Button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input placeholder="Milestone title, e.g. Passed Phase 1 — 10k challenge" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} />
              <Input placeholder="Detail, e.g. +8.2% in 11 trading days" value={msDetail} onChange={(e) => setMsDetail(e.target.value)} />
              <Button onClick={() => milestone.mutate()} disabled={!msTitle || milestone.isPending}><Trophy className="w-4 h-4 mr-1.5" />Draft milestone</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2" role="tablist">
          {STATUS_TABS.map((s) => (
            <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)}
              className={`text-sm px-3 py-1.5 rounded-lg font-semibold capitalize border ${tab === s ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {s}
            </button>
          ))}
        </div>

        {posts.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !posts.data?.posts.length ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No {tab} posts.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {posts.data.posts.map((p) => (
              <Card key={p.id} className="overflow-hidden" data-testid={`social-post-${p.id}`}>
                {p.has_image && <img src={`/api/social/image/${p.id}.png`} alt={`${KIND_LABEL[p.kind] || p.kind} card`} className="w-full aspect-square object-cover bg-muted" loading="lazy" />}
                <CardContent className="pt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1">{p.platform === "x" ? <Twitter className="w-3 h-3" /> : <Instagram className="w-3 h-3" />}{p.platform === "x" ? "X thread" : "Instagram"}</Badge>
                    <Badge variant="secondary">{KIND_LABEL[p.kind] || p.kind}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(p.created_at).toLocaleString()}</span>
                  </div>
                  {editing === p.id ? (
                    <>
                      <Textarea rows={10} value={draftText} onChange={(e) => setDraftText(e.target.value)} className="text-sm" />
                      {p.platform === "x" && <p className="text-xs text-muted-foreground">Separate tweets with a line containing only ---. Each tweet max 280 characters.</p>}
                    </>
                  ) : p.platform === "x" ? (
                    <ol className="space-y-2">
                      {(p.thread || [p.caption || ""]).map((t, i) => (
                        <li key={i} className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-2"><span className="text-xs text-muted-foreground mr-1">{i + 1}/</span>{t}<span className={`block text-[10px] mt-1 ${t.length > 280 ? "text-red-500" : "text-muted-foreground"}`}>{t.length}/280</span></li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{p.caption}</p>
                  )}
                  {(p.status === "draft" || p.status === "approved") && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {editing === p.id ? (
                        <>
                          <Button size="sm" onClick={() => saveEdit(p)} disabled={review.isPending}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          {p.status === "draft" && <Button size="sm" onClick={() => review.mutate({ id: p.id, action: "approve" })} disabled={review.isPending}><Check className="w-4 h-4 mr-1" />Approve</Button>}
                          <Button size="sm" variant="outline" onClick={() => startEdit(p)}><Pencil className="w-4 h-4 mr-1" />Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: p.id, action: "skip" })} disabled={review.isPending}><XIcon className="w-4 h-4 mr-1" />Skip</Button>
                        </>
                      )}
                    </div>
                  )}
                  {p.error && <p className="text-xs text-red-500">{p.error}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
