import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, RefreshCw, Sparkles, Video, Download, FileText, ExternalLink, Loader2, Layers, Wrench } from "lucide-react";
import { ExplainerCarousel, type ExplainerSlide } from "@/components/content-studio/explainer-carousel";
import { useExplainerJob, JobProgress } from "@/components/content-studio/explainer-maker";

// Today's content — everything for one day of the 44-day plan in one place
// (server/services/ambassador-post-queue.ts): the four social posts, a branded
// video per post (rendered on tap), and the day's blog article. Also shown as
// the "Today" tab of Content Studio.

const LABEL: Record<string, string> = {
  tiktok: "TikTok", instagram: "Instagram", facebook_page: "Facebook Page", facebook_group: "Facebook Group",
};
// Social sizes: the default per platform plus the choices offered.
export const SIZES = [
  { value: "9:16", label: "Vertical 9:16", hint: "Reels, TikTok, Shorts, Stories" },
  { value: "4:5", label: "Portrait 4:5", hint: "Instagram & Facebook feed" },
  { value: "1:1", label: "Square 1:1", hint: "Feed posts, groups" },
  { value: "16:9", label: "Landscape 16:9", hint: "YouTube, Facebook video" },
] as const;
const DEFAULT_SIZE: Record<string, string> = { tiktok: "9:16", instagram: "9:16", facebook_page: "4:5", facebook_group: "1:1" };
const ASPECT_CLASS: Record<string, string> = { "9:16": "aspect-[9/16] max-w-[260px]", "4:5": "aspect-[4/5] max-w-[300px]", "1:1": "aspect-square max-w-[300px]", "16:9": "aspect-video max-w-full" };

interface Post {
  id: number; day_number: number; platform: string; format: string | null; hook: string | null;
  body: string; hashtags: string[] | null; visual_idea: string | null; link: string | null;
  status: string; clicks: number; video_url: string | null; video_shot: string | null; video_aspect: string | null;
}
interface QueueResponse {
  date: string; posts: Post[];
  blog: { id: number; title: string; slug: string; excerpt: string; is_published: boolean; shareUrl?: string } | null;
  stats: { totals: { days_posted: number; posts: number; clicks: number } };
}

/** Video player sized to the clip's social aspect ratio. */
export function BrandedVideo({ url, aspect }: { url: string; aspect?: string | null }) {
  return (
    <div className={`relative w-full ${ASPECT_CLASS[aspect || "9:16"] || ASPECT_CLASS["9:16"]} rounded-lg overflow-hidden bg-black`}>
      <video src={url} controls playsInline className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

function PostVideo({ post, queueKey }: { post: Post; queueKey: string }) {
  const { toast } = useToast();
  const [size, setSize] = useState(post.video_aspect || DEFAULT_SIZE[post.platform] || "9:16");
  const [jobId, setJobId] = useState<number | null>(null);
  const job = useExplainerJob(jobId, () => queryClient.invalidateQueries({ queryKey: [queueKey] }));
  const make = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/ambassador/agent/queue/${post.id}/video`, { aspect: size })).json(),
    onSuccess: (r: any) => setJobId(r.jobId),
    onError: (e: any) => toast({ title: "Video didn't start", description: String(e?.message || "").replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });
  const working = make.isPending || (!!job && (job.status === "running" || job.status === "queued"));
  return (
    <div className="rounded-lg border border-dashed p-3 space-y-2">
      {working || job?.status === "failed" ? <JobProgress job={job ?? ({ status: "running", step: "Starting", progress: 2 } as any)} /> : null}
      {post.video_url && !working ? (
        <>
          <BrandedVideo url={post.video_url} aspect={post.video_aspect} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={post.video_url} download={`vedd-day${post.day_number}-${post.platform}.mp4`}><Download className="h-4 w-4 mr-1" />Download video</a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => make.mutate()}><RefreshCw className="h-4 w-4 mr-1" />Make another</Button>
          </div>
        </>
      ) : !working && (
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Video size">
            {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label} · {s.hint}</option>)}
          </select>
          <Button size="sm" onClick={() => make.mutate()}>
            <Video className="h-4 w-4 mr-1" />Make explainer video
          </Button>
          <span className="text-xs text-muted-foreground">~30s with voiceover, about 3–6 min to make</span>
        </div>
      )}
    </div>
  );
}

export default function AmbassadorAgentPage({ embedded = false }: { embedded?: boolean }) {
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

  const copyText = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${what} copied` }); }
    catch { toast({ title: "Copy failed — select the text manually", variant: "destructive" }); }
  };
  const posts = data?.posts || [];
  const t = data?.stats?.totals;
  const blog = data?.blog;
  // Once the day's article is live, every post carries a link to it (with the ambassador's ref code).
  const articleLine = blog?.is_published && blog.shareUrl ? `Read the full lesson: ${blog.shareUrl}` : "";
  const copy = (p: Post) => copyText([p.hook, p.body, articleLine, (p.hashtags || []).join(" ")].filter(Boolean).join("\n\n"), `${LABEL[p.platform] || p.platform} post`);

  // The day's lesson as an explainer carousel.
  const [carousel, setCarousel] = useState<{ title: string; slides: ExplainerSlide[] } | null>(null);
  const makeCarousel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/content-studio/generate-carousel", {
        topic: `Day ${posts[0]?.day_number} trading lesson: ${posts[0]?.hook || ""}. Teach it step by step for newer traders; the last slide invites them to try VEDD AI.`,
        slideCount: 5, style: "explainer",
      });
      return res.json();
    },
    onSuccess: (r: any) => setCarousel({ title: r.title, slides: r.slides }),
    onError: (e: any) => toast({ title: "Carousel didn't build", description: e?.message, variant: "destructive" }),
  });
  const refCode = (posts[0]?.link || "").match(/\/r\/([^?]+)/)?.[1];

  return (
    <div className={embedded ? "space-y-4 vedd-rise" : "container max-w-3xl mx-auto px-4 py-6 pb-28 space-y-4 vedd-rise"}>
      <style>{`
        @keyframes veddRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes veddGlow { 0%,100% { opacity: .55; transform: scale(1); } 50% { opacity: .9; transform: scale(1.08); } }
        @keyframes veddShine { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        .vedd-rise > * { animation: veddRise .5s cubic-bezier(.2,.8,.2,1) both; }
        .vedd-rise > *:nth-child(2) { animation-delay: .06s } .vedd-rise > *:nth-child(3) { animation-delay: .12s }
        .vedd-rise > *:nth-child(4) { animation-delay: .18s } .vedd-rise > *:nth-child(5) { animation-delay: .24s }
        .vedd-rise > *:nth-child(n+6) { animation-delay: .3s }
        .vedd-grad-text { background: linear-gradient(90deg,#ef4444,#f97316,#8b5cf6,#ef4444); background-size: 200% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent; animation: veddShine 6s linear infinite; }
      `}</style>

      {!embedded && (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-7"
          style={{ background: "radial-gradient(120% 140% at 0% 0%, rgba(239,68,68,.22), transparent 55%), radial-gradient(120% 140% at 100% 100%, rgba(139,92,246,.25), transparent 55%), #0A0B10" }}>
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl"
            style={{ background: "#8b5cf6", animation: "veddGlow 5s ease-in-out infinite" }} />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300/90">
              <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
              {d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-white leading-[1.05]">
              Today's <span className="vedd-grad-text">content drop</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-gray-300">
              One trading lesson a day, ready to post: social posts, videos, a carousel and an article, all carrying your tracked link.
            </p>
            {posts[0] && (
              <div className="mt-4 max-w-sm">
                <div className="flex justify-between text-[11px] font-semibold text-gray-300">
                  <span>Day {posts[0].day_number} of 44</span><span>{Math.round(posts[0].day_number / 44 * 100)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, posts[0].day_number / 44 * 100)}%`, background: "linear-gradient(90deg,#ef4444,#8b5cf6)", boxShadow: "0 0 12px rgba(239,68,68,.6)" }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {t && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
          {[
            { v: t.days_posted, l: "days posted", c: "#ef4444" },
            { v: t.posts, l: "posts", c: "#f97316" },
            { v: t.clicks, l: "link clicks", c: "#8b5cf6" },
          ].map((x) => (
            <div key={x.l} className="rounded-2xl border p-3 transition-transform hover:-translate-y-0.5"
              style={{ borderColor: `${x.c}40`, background: `linear-gradient(160deg, ${x.c}1f, transparent 70%)` }}>
              <div className="text-2xl font-black" style={{ color: x.c }}>{x.v}</div>
              <div className="text-[11px] font-medium text-muted-foreground">{x.l}</div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Seller focus — pitch the builder</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Whatever today's lesson is, weave in the build-your-own loop: traders build their own strategies in the{" "}
            <span className="text-foreground font-medium">Strategy Studio</span> (volume profile, ICT, ORB, VWAP, Ichimoku and more — no code),{" "}
            <span className="text-foreground font-medium">backtest</span> them on history, then prove them in{" "}
            <span className="text-foreground font-medium">Shadow</span> mode — virtual trades on live prices that build a real record — before
            deploying live on their own broker or listing the strategy in the Brain Marketplace as{" "}
            <span className="text-foreground font-medium">"Proven in shadow."</span> Shadow results are virtual/paper — never pitch them as live earnings.
          </p>
          <Button size="sm" variant="outline" onClick={() => copyText("Got a strategy idea of your own? Build it in VEDD's Strategy Studio — volume profile, ICT, ORB, VWAP and more, no code. Backtest it on history, then prove it in Shadow mode: virtual trades on live prices that build a real record (paper results, not live earnings). If the record holds up, trade it live on your own broker — or list it in the Brain Marketplace with the 'Proven in shadow' label at a one-time price or a monthly subscription. Build it → Backtest it → Prove it in Shadow → Trade it or sell it.", "Studio + Shadow pitch")}>
            <Copy className="h-4 w-4 mr-1" />Copy the pitch
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : posts.length === 0 ? (
        <Card><CardContent className="p-6 text-center space-y-3">
          <p className="font-medium">Ready for today's lesson?</p>
          <p className="text-sm text-muted-foreground">We'll write today's TikTok, Instagram and Facebook posts and start the day's article. Videos are made when you tap.</p>
          <Button size="lg" onClick={() => generate.mutate(false)} disabled={generate.isPending}>
            {generate.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Writing today's posts… about 30 sec</> : <><Sparkles className="h-4 w-4 mr-2" />Make today's content</>}
          </Button>
        </CardContent></Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge className="border-0 text-white" style={{ background: "linear-gradient(90deg,#ef4444,#8b5cf6)" }}>Day {posts[0].day_number} of 44</Badge>
            <Button size="sm" variant="ghost" onClick={() => generate.mutate(true)} disabled={generate.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" />Rewrite posts I haven't used
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Today's article</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!blog ? <p className="text-muted-foreground"><Loader2 className="inline h-3 w-3 mr-1 animate-spin" />Being written for today's lesson. Check back in a few minutes.</p>
                : !blog.is_published ? <><p className="font-medium">{blog.title}</p><p className="text-muted-foreground">Written and waiting for VEDD to review. Once it's live you'll get a share link here.</p></>
                : <>
                  <p className="font-medium">{blog.title}</p>
                  <p className="text-muted-foreground">{blog.excerpt}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => copyText(blog.shareUrl!, "Article link")}><Copy className="h-4 w-4 mr-1" />Copy my link</Button>
                    <Button size="sm" variant="outline" asChild><a href={blog.shareUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Open</a></Button>
                  </div>
                </>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" />Today's carousel</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {carousel ? <ExplainerCarousel title={carousel.title} slides={carousel.slides} eyebrow={`Day ${posts[0].day_number} lesson`} referralCode={refCode} />
                : <Button size="sm" onClick={() => makeCarousel.mutate()} disabled={makeCarousel.isPending}>
                  {makeCarousel.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Writing slides… about 20 sec</> : <><Layers className="h-4 w-4 mr-1" />Make today's carousel</>}
                </Button>}
            </CardContent>
          </Card>

          {posts.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{LABEL[p.platform] || p.platform}{p.format ? ` · ${p.format}` : ""}</CardTitle>
                <span className="text-xs text-muted-foreground">{p.clicks} clicks</span>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.hook && <p className="font-medium">{p.hook}</p>}
                <p className="whitespace-pre-wrap text-sm">{p.body}</p>
                {articleLine && <p className="text-sm">📖 <a className="underline" href={blog!.shareUrl} target="_blank" rel="noopener noreferrer">Read the full lesson</a> <span className="text-xs text-muted-foreground">(added when you copy)</span></p>}
                {p.hashtags?.length ? <p className="text-sm text-primary">{p.hashtags.join(" ")}</p> : null}
                {p.platform === "facebook_group" && <p className="text-xs text-muted-foreground">Post by hand in groups you belong to, and follow each group's rules on promotion.</p>}
                <PostVideo post={p} queueKey={queueKey} />
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => copy(p)}><Copy className="h-4 w-4 mr-1" />Copy text</Button>
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
