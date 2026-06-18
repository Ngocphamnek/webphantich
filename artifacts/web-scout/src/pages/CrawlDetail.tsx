import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Terminal, ArrowLeft, Globe, ExternalLink, Link as LinkIcon,
  Image as ImageIcon, Database, Activity, AlertCircle,
  Code2, Tag, Copy, Monitor, Loader2, MousePointerClick,
  ScrollText, ChevronDown,
} from "lucide-react";
import { useGetCrawl, getGetCrawlQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LogEntry {
  id: string;
  time: Date;
  type: "click" | "type" | "scroll" | "ai_response" | "system";
  icon: string;
  label: string;
  detail?: string;
  aiResponse?: string;
  pending?: boolean;
}

export default function CrawlDetail() {
  const { id } = useParams();
  const crawlId = parseInt(id || "0", 10);

  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const logBottomRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "time">) => {
    const newEntry: LogEntry = {
      ...entry,
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      time: new Date(),
    };
    setActivityLog((prev) => [...prev, newEntry]);
    return newEntry.id;
  }, []);

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLog]);

  // Clone iframe postMessage logging
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      const { type, action, elementTag, elementText, elementHref, elementSrc, response, eventId } = e.data;
      if (type === "scout_ready") {
        addLog({ type: "system", icon: "🟢", label: "Clone AI sẵn sàng" });
      } else if (type === "scout_action") {
        const iconMap: Record<string, string> = { click: "🖱️", type: "⌨️", scroll: "📜" };
        const labelMap: Record<string, string> = { click: "Bấm vào", type: "Nhập vào", scroll: "Cuộn trang" };
        const logEntry: LogEntry = {
          id: eventId || (Date.now() + "-" + Math.random().toString(36).slice(2, 6)),
          time: new Date(),
          type: (action as "click" | "type" | "scroll") || "click",
          icon: iconMap[action] || "▶️",
          label: `${labelMap[action] || action}: "${elementText || elementTag || "?"}"`,
          detail: elementHref ? `→ ${elementHref}` : elementSrc ? `img: ${elementSrc}` : undefined,
          pending: true,
        };
        setActivityLog((prev) => [...prev, logEntry]);
      } else if (type === "scout_response") {
        setActivityLog((prev) =>
          prev.map((e) => (e.id === eventId ? { ...e, pending: false, aiResponse: response } : e))
        );
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [addLog]);

  const { data: crawl, isLoading, isError } = useGetCrawl(crawlId, {
    query: {
      enabled: !!crawlId,
      queryKey: getGetCrawlQueryKey(crawlId),
      refetchInterval: (query) =>
        query.state.data?.status === "pending" ? 2000 : false,
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border/40 bg-background/95 sticky top-0 z-50">
          <div className="container mx-auto px-4 h-14 flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-5 w-48" />
          </div>
        </header>
        <Skeleton className="flex-1 m-0 rounded-none" style={{ minHeight: 600 }} />
      </div>
    );
  }

  if (isError || !crawl) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center">
        <Terminal className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-xl font-mono text-destructive mb-2 uppercase">Mission Data Corrupted</h1>
        <p className="text-muted-foreground mb-6 font-mono text-sm">Target record not found or inaccessible.</p>
        <Link href="/"><Button variant="outline" className="font-mono">Return to Base</Button></Link>
      </div>
    );
  }

  const parsedLinks: { href: string; text: string }[] = crawl.links ? JSON.parse(crawl.links) : [];
  const parsedImages: string[] = crawl.images ? JSON.parse(crawl.images) : [];
  const parsedMeta: Record<string, string> = crawl.metaTags ? JSON.parse(crawl.metaTags) : {};
  const parsedTech: string[] = crawl.techStack ? JSON.parse(crawl.techStack) : [];

  const techColors: Record<string, string> = {
    "React": "#61DAFB", "Vue.js": "#42b883", "Angular": "#DD0031",
    "Next.js": "#ffffff", "Nuxt.js": "#00DC82", "jQuery": "#0769AD",
    "Bootstrap": "#7952B3", "Tailwind CSS": "#38BDF8", "Svelte": "#FF3E00",
    "WordPress": "#21759B", "Shopify": "#96BF48", "Telegram Web App": "#2AABEE",
    "Vite": "#646CFF", "TypeScript": "#3178C6", "Firebase": "#FFCA28",
    "Webpack": "#8DD6F9", "Google Analytics": "#F9AB00", "GraphQL": "#E10098",
  };

  const openCloneInNewTab = () => window.open(`/api/crawls/${crawl.id}/clone`, "_blank");
  const copyCloneHtml = () => { if (crawl.clonedHtml) navigator.clipboard.writeText(crawl.clonedHtml); };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">

      {/* ── COMPACT HEADER ── */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-2 px-3 h-11">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>

          {/* Traffic-light dots */}
          <div className="flex gap-1.5 ml-1">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>

          {/* URL bar */}
          <div className="flex-1 flex items-center gap-2 bg-card border border-border/40 rounded-md px-3 h-7 min-w-0 mx-2">
            <Globe className="w-3 h-3 text-muted-foreground/50 shrink-0" />
            <span className="font-mono text-xs text-muted-foreground truncate">{crawl.url}</span>
          </div>

          <a href={crawl.url} target="_blank" rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors shrink-0">
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Status badge */}
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded border shrink-0 ${
            crawl.status === "success" ? "text-primary border-primary/30 bg-primary/5" :
            crawl.status === "error"   ? "text-destructive border-destructive/30 bg-destructive/5" :
                                         "text-primary border-primary/30 bg-primary/5 animate-pulse"
          }`}>
            {crawl.status.toUpperCase()}
          </span>

          <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 hidden sm:block">
            #{crawl.id.toString().padStart(6, "0")}
          </span>
        </div>
      </header>

      {/* ── LIVE IFRAME — full width, no padding, right below header ── */}
      {crawl.status === "success" && (
        <div className="w-full flex-1 flex flex-col">
          <iframe
            src={`/api/proxy?url=${encodeURIComponent(crawl.url)}`}
            className="w-full"
            style={{ height: "calc(100vh - 44px - 48px)", border: "none", display: "block" }}
            title={`Live: ${crawl.url}`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />

          {/* ── BOTTOM BAR with expand button ── */}
          <div className="border-t border-border/40 bg-background h-12 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground/60">
              {parsedTech.length > 0 && (
                <div className="flex gap-1.5 items-center">
                  {parsedTech.slice(0, 4).map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded text-[10px] border"
                      style={{ color: techColors[t] || "#00e5ff", borderColor: `${techColors[t] || "#00e5ff"}40`, backgroundColor: `${techColors[t] || "#00e5ff"}10` }}>
                      {t}
                    </span>
                  ))}
                  {parsedTech.length > 4 && <span className="text-muted-foreground/40">+{parsedTech.length - 4}</span>}
                </div>
              )}
              <span>{crawl.title || crawl.url}</span>
            </div>

            <button
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center gap-1.5 font-mono text-xs text-cyan-400/80 border border-cyan-400/30 bg-cyan-400/5 hover:bg-cyan-400/15 px-3 py-1.5 rounded transition-colors"
            >
              <Terminal className="w-3 h-3" />
              {showDetails ? "Ẩn phân tích" : "Xem phân tích AI"}
              <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* ── PENDING STATE ── */}
      {crawl.status === "pending" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Terminal className="w-10 h-10 animate-pulse text-primary" />
          <p className="font-mono text-sm">ANALYSIS IN PROGRESS...</p>
          <p className="font-mono text-xs max-w-sm text-center">Đang thu thập dữ liệu và xây dựng hồ sơ kỹ thuật</p>
        </div>
      )}

      {/* ── ERROR STATE ── */}
      {crawl.status === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="font-mono text-sm text-destructive uppercase">Infiltration Failed</p>
          <p className="font-mono text-xs text-muted-foreground max-w-sm text-center">{crawl.errorMessage}</p>
        </div>
      )}

      {/* ── ANALYSIS PANEL (slide in from bottom) ── */}
      <AnimatePresence>
        {showDetails && crawl.status === "success" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-border/40 overflow-hidden"
          >
            <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">

              {/* Activity log — only if there are entries */}
              {activityLog.length > 0 && (
                <Card className="bg-card border-border/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-mono text-sm uppercase text-primary flex items-center gap-2">
                      <ScrollText className="w-4 h-4" /> Nhật Ký Hoạt Động AI
                      <span className="ml-auto text-xs text-muted-foreground font-normal">{activityLog.length} sự kiện</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {activityLog.map((entry) => (
                        <div key={entry.id} className="flex gap-3 p-3 rounded-lg bg-background border border-border/40 text-xs font-mono">
                          <span className="text-base shrink-0 leading-none mt-0.5">{entry.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-foreground font-semibold">{entry.label}</span>
                              <span className="text-muted-foreground/50 shrink-0 text-[10px]">{format(entry.time, "HH:mm:ss")}</span>
                            </div>
                            {entry.detail && <p className="text-muted-foreground mt-0.5 truncate">{entry.detail}</p>}
                            {entry.pending && (
                              <div className="flex items-center gap-1.5 mt-1.5 text-cyan-400">
                                <Loader2 className="w-3 h-3 animate-spin" /><span>AI đang phân tích...</span>
                              </div>
                            )}
                            {!entry.pending && entry.aiResponse && (
                              <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded text-primary/80 leading-relaxed">
                                🤖 {entry.aiResponse}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={logBottomRef} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tabs */}
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid grid-cols-6 mb-4 bg-card border border-border/40">
                  <TabsTrigger value="summary" className="font-mono text-xs"><Terminal className="w-3 h-3 mr-1" />AI Report</TabsTrigger>
                  <TabsTrigger value="clone" className="font-mono text-xs"><Monitor className="w-3 h-3 mr-1" />Clone</TabsTrigger>
                  <TabsTrigger value="tech" className="font-mono text-xs"><Code2 className="w-3 h-3 mr-1" />Tech</TabsTrigger>
                  <TabsTrigger value="meta" className="font-mono text-xs"><Tag className="w-3 h-3 mr-1" />Meta</TabsTrigger>
                  <TabsTrigger value="links" className="font-mono text-xs"><LinkIcon className="w-3 h-3 mr-1" />Links ({crawl.linksFound || 0})</TabsTrigger>
                  <TabsTrigger value="images" className="font-mono text-xs"><ImageIcon className="w-3 h-3 mr-1" />Images ({crawl.imagesFound || 0})</TabsTrigger>
                </TabsList>

                <TabsContent value="summary">
                  <Card className="bg-card border-border/40">
                    <CardHeader><CardTitle className="font-mono text-sm uppercase text-primary flex items-center gap-2"><Terminal className="w-4 h-4" /> AI Intelligence Report</CardTitle></CardHeader>
                    <CardContent>
                      {crawl.aiSummary
                        ? <div className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed font-mono">{crawl.aiSummary}</div>
                        : <span className="text-muted-foreground font-mono">No summary available.</span>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="clone">
                  <Card className="bg-card border-border/40">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-mono text-sm uppercase text-primary flex items-center gap-2">
                          <Monitor className="w-4 h-4" /> AI Interface Clone
                          <span className="text-xs font-normal text-cyan-400 ml-2 border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 rounded">BẤM ĐỂ AI PHÂN TÍCH</span>
                        </CardTitle>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="font-mono text-xs" onClick={copyCloneHtml}><Copy className="w-3 h-3 mr-1" /> Copy HTML</Button>
                          <Button variant="outline" size="sm" className="font-mono text-xs" onClick={openCloneInNewTab}><ExternalLink className="w-3 h-3 mr-1" /> Open</Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {crawl.clonedHtml
                        ? <div className="border-t border-border/40"><iframe src={`/api/crawls/${crawl.id}/clone`} className="w-full rounded-b-lg" style={{ height: 600, border: "none" }} sandbox="allow-scripts allow-same-origin allow-forms" title="AI Clone" /></div>
                        : <div className="text-center py-8 text-muted-foreground font-mono text-sm p-6">Clone chưa được tạo.</div>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="tech">
                  <Card className="bg-card border-border/40">
                    <CardHeader><CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2"><Code2 className="w-4 h-4" /> Technology Stack</CardTitle></CardHeader>
                    <CardContent>
                      {parsedTech.length > 0
                        ? <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{parsedTech.map((t) => (
                            <div key={t} className="flex items-center gap-3 p-4 rounded-lg border" style={{ borderColor: `${techColors[t] || "#00e5ff"}30`, backgroundColor: `${techColors[t] || "#00e5ff"}08` }}>
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: techColors[t] || "#00e5ff" }} />
                              <span className="font-mono text-sm font-semibold" style={{ color: techColors[t] || "#00e5ff" }}>{t}</span>
                            </div>))}</div>
                        : <div className="text-center py-8 text-muted-foreground font-mono text-sm">No technologies detected.</div>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="meta">
                  <Card className="bg-card border-border/40">
                    <CardHeader><CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2"><Tag className="w-4 h-4" /> Meta Tags & SEO Data</CardTitle></CardHeader>
                    <CardContent>
                      {Object.keys(parsedMeta).length > 0
                        ? <div className="space-y-2">{Object.entries(parsedMeta).map(([key, value]) => (
                            <div key={key} className="flex flex-col sm:flex-row gap-2 p-3 bg-background border border-border/40 rounded-md">
                              <span className="font-mono text-xs text-primary font-bold shrink-0 sm:w-48">{key}</span>
                              <span className="font-mono text-xs text-muted-foreground break-all">{value}</span>
                            </div>))}</div>
                        : <div className="text-center py-8 text-muted-foreground font-mono text-sm">No meta tags found.</div>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="links">
                  <Card className="bg-card border-border/40">
                    <CardHeader><CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Discovered Links</CardTitle></CardHeader>
                    <CardContent>
                      {parsedLinks.length > 0
                        ? <div className="grid gap-2">{parsedLinks.map((link, i) => (
                            <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-background border border-border/40 rounded-md">
                              <span className="text-sm font-medium truncate flex-1">{link.text || "Unnamed Link"}</span>
                              <a href={link.href} target="_blank" rel="noreferrer" className="text-xs font-mono text-primary truncate flex-1 hover:underline">{link.href}</a>
                            </div>))}</div>
                        : <div className="text-center py-8 text-muted-foreground font-mono text-sm">No links extracted.</div>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="images">
                  <Card className="bg-card border-border/40">
                    <CardHeader><CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Discovered Images</CardTitle></CardHeader>
                    <CardContent>
                      {parsedImages.length > 0
                        ? <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{parsedImages.map((img, i) => (
                            <div key={i} className="group relative aspect-square bg-background border border-border/40 rounded-md overflow-hidden flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-muted-foreground/30 absolute" />
                              <img src={img} alt={`Image ${i + 1}`} className="w-full h-full object-cover relative z-10 opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" />
                            </div>))}</div>
                        : <div className="text-center py-8 text-muted-foreground font-mono text-sm">No images extracted.</div>}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
