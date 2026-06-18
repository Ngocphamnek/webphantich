import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Terminal, ArrowLeft, Globe, ExternalLink, Link as LinkIcon,
  Image as ImageIcon, Activity, AlertCircle,
  Code2, Tag, Copy, Monitor, Loader2, MousePointerClick,
  ScrollText, ChevronDown, X, ChevronRight,
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
  action: "click" | "type" | "scroll" | "system";
  icon: string;
  label: string;
  detail?: string;
  aiResponse?: string;
  pending?: boolean;
}

const ACTION_ICON: Record<string, string> = { click: "🖱️", type: "⌨️", scroll: "📜", system: "🔧" };
const ACTION_LABEL: Record<string, string> = { click: "Bấm", type: "Gõ", scroll: "Cuộn", system: "Hệ thống" };

export default function CrawlDetail() {
  const { id } = useParams();
  const crawlId = parseInt(id || "0", 10);

  const [log, setLog] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logOpen) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log, logOpen]);

  // Call AI for an interaction event
  const callAI = useCallback(async (entryId: string, crawlId: number, payload: {
    elementTag: string; elementText: string; elementHref?: string | null;
    elementSrc?: string | null; pageUrl?: string; pageTitle?: string;
  }) => {
    try {
      const res = await fetch(`/api/crawls/${crawlId}/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setLog(prev => prev.map(e => e.id === entryId
        ? { ...e, pending: false, aiResponse: data.response || "AI không có nhận xét." }
        : e));
    } catch {
      setLog(prev => prev.map(e => e.id === entryId
        ? { ...e, pending: false, aiResponse: "⚠ Không thể kết nối AI." }
        : e));
    }
  }, []);

  // Listen to postMessage from proxy iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      const { type, action, elementTag, elementText, elementHref, elementSrc, pageUrl, pageTitle, eventId } = e.data;

      if (type === "scout_ready") {
        const entry: LogEntry = {
          id: eventId || ("ready-" + Date.now()),
          time: new Date(),
          action: "system",
          icon: "🟢",
          label: "Trang đã tải xong",
          detail: pageTitle || pageUrl || "",
        };
        setLog(prev => [...prev, entry]);
        setLogOpen(true);
        return;
      }

      if (type === "scout_action") {
        const entry: LogEntry = {
          id: eventId || (Date.now() + "-x"),
          time: new Date(),
          action: (action as "click" | "type" | "scroll") || "click",
          icon: ACTION_ICON[action] || "▶️",
          label: `${ACTION_LABEL[action] || action}: "${elementText || elementTag}"`,
          detail: elementHref
            ? `→ ${elementHref}`
            : pageUrl ? `📄 ${pageUrl}` : undefined,
          pending: action !== "scroll",
        };
        setLog(prev => [...prev, entry]);
        setLogOpen(true);

        // Only ask AI for click and type (not scroll — too frequent)
        if (action === "click" || action === "type") {
          callAI(entry.id, crawlId, {
            elementTag, elementText, elementHref, elementSrc, pageUrl, pageTitle,
          });
        } else {
          // For scroll just mark as done immediately
          setLog(prev => prev.map(e => e.id === entry.id ? { ...e, pending: false } : e));
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [crawlId, callAI]);

  const { data: crawl, isLoading, isError } = useGetCrawl(crawlId, {
    query: {
      enabled: !!crawlId,
      queryKey: getGetCrawlQueryKey(crawlId),
      refetchInterval: (query) => query.state.data?.status === "pending" ? 2000 : false,
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border/40 h-11 flex items-center px-4 gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-5 w-64 flex-1" />
        </header>
        <Skeleton className="flex-1" style={{ minHeight: 600 }} />
      </div>
    );
  }

  if (isError || !crawl) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center">
        <Terminal className="w-12 h-12 text-destructive mb-4" />
        <p className="font-mono text-destructive mb-6">Record not found.</p>
        <Link href="/"><Button variant="outline" className="font-mono">← Back</Button></Link>
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

  const pendingCount = log.filter(e => e.pending).length;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col" style={{ overflow: "hidden" }}>

      {/* ── COMPACT BROWSER HEADER ── */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-2 px-3 h-11">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <div className="flex-1 flex items-center gap-2 bg-card border border-border/40 rounded-md px-3 h-7 min-w-0 mx-2">
            <Globe className="w-3 h-3 text-muted-foreground/50 shrink-0" />
            <span className="font-mono text-xs text-muted-foreground truncate">{crawl.url}</span>
          </div>
          <a href={crawl.url} target="_blank" rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors shrink-0">
            <ExternalLink className="w-4 h-4" />
          </a>
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded border shrink-0 ${
            crawl.status === "success" ? "text-primary border-primary/30 bg-primary/5" :
            crawl.status === "error"   ? "text-destructive border-destructive/30 bg-destructive/5" :
                                         "text-primary border-primary/30 bg-primary/5 animate-pulse"
          }`}>{crawl.status.toUpperCase()}</span>
          <span className="font-mono text-[10px] text-muted-foreground/40 shrink-0 hidden sm:block">
            #{crawl.id.toString().padStart(6, "0")}
          </span>
        </div>
      </header>

      {/* ── MAIN AREA: iframe + floating log ── */}
      {crawl.status === "success" && (
        <div className="flex-1 flex flex-col relative" style={{ height: "calc(100vh - 44px)" }}>

          {/* Live iframe */}
          <iframe
            src={`/api/proxy?url=${encodeURIComponent(crawl.url)}`}
            className="w-full flex-1"
            style={{ height: "calc(100% - 48px)", border: "none", display: "block" }}
            title={`Live: ${crawl.url}`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />

          {/* Bottom bar */}
          <div className="border-t border-border/40 bg-background h-12 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground/60 min-w-0">
              {parsedTech.slice(0, 5).map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded text-[10px] border shrink-0"
                  style={{ color: techColors[t] || "#00e5ff", borderColor: `${techColors[t] || "#00e5ff"}40`, backgroundColor: `${techColors[t] || "#00e5ff"}10` }}>
                  {t}
                </span>
              ))}
              {parsedTech.length > 5 && <span className="text-muted-foreground/40 shrink-0">+{parsedTech.length - 5}</span>}
              <span className="truncate hidden sm:block ml-1">{crawl.title}</span>
            </div>
            <button
              onClick={() => setShowDetails(v => !v)}
              className="flex items-center gap-1.5 font-mono text-xs text-cyan-400/80 border border-cyan-400/30 bg-cyan-400/5 hover:bg-cyan-400/15 px-3 py-1.5 rounded transition-colors shrink-0">
              <Terminal className="w-3 h-3" />
              {showDetails ? "Ẩn phân tích" : "Phân tích AI"}
              <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* ── FLOATING AI ACTIVITY LOG (right side) ── */}
          <AnimatePresence>
            {logOpen && (
              <motion.div
                initial={{ x: 360, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 360, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute right-0 top-0 bottom-12 w-80 bg-background/95 backdrop-blur border-l border-border/40 flex flex-col z-40 shadow-2xl"
              >
                {/* Log header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 shrink-0">
                  <ScrollText className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-mono text-xs font-bold text-primary uppercase flex-1">Nhật Ký AI</span>
                  {pendingCount > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-400/20 text-cyan-400 border border-cyan-400/30 animate-pulse">
                      {pendingCount} đang xử lý
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-muted-foreground/50">{log.length} sự kiện</span>
                  <button onClick={() => setLogOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Log entries */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  <AnimatePresence initial={false}>
                    {log.map((entry) => (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-lg bg-card border border-border/40 p-2.5 text-xs font-mono"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm shrink-0 leading-none mt-0.5">{entry.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-foreground font-semibold leading-snug break-words">{entry.label}</span>
                              <span className="text-muted-foreground/40 shrink-0 text-[9px] mt-0.5">{format(entry.time, "HH:mm:ss")}</span>
                            </div>
                            {entry.detail && (
                              <p className="text-muted-foreground/60 mt-0.5 truncate text-[10px]">{entry.detail}</p>
                            )}
                            {entry.pending && (
                              <div className="flex items-center gap-1.5 mt-1.5 text-cyan-400">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                <span className="text-[10px]">AI đang phân tích...</span>
                              </div>
                            )}
                            {!entry.pending && entry.aiResponse && (
                              <div className="mt-1.5 p-1.5 bg-primary/5 border border-primary/20 rounded text-primary/80 leading-relaxed text-[10px]">
                                🤖 {entry.aiResponse}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div ref={logEndRef} />
                </div>

                {/* Clear button */}
                {log.length > 0 && (
                  <div className="border-t border-border/40 p-2 shrink-0">
                    <button onClick={() => setLog([])}
                      className="w-full text-center font-mono text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1">
                      Xóa nhật ký
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tab to reopen log when closed */}
          {!logOpen && (
            <button
              onClick={() => setLogOpen(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-40 bg-background border border-border/40 border-r-0 rounded-l-lg px-2 py-3 flex flex-col items-center gap-1.5 hover:bg-card transition-colors"
            >
              <ScrollText className="w-3.5 h-3.5 text-primary" />
              {log.length > 0 && (
                <span className="font-mono text-[9px] text-cyan-400 font-bold">{log.length}</span>
              )}
              <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
            </button>
          )}
        </div>
      )}

      {crawl.status === "pending" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Terminal className="w-10 h-10 animate-pulse text-primary" />
          <p className="font-mono text-sm">ANALYSIS IN PROGRESS...</p>
        </div>
      )}

      {crawl.status === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="font-mono text-sm text-destructive uppercase">Infiltration Failed</p>
          <p className="font-mono text-xs text-muted-foreground max-w-sm text-center">{crawl.errorMessage}</p>
        </div>
      )}

      {/* ── ANALYSIS PANEL (slide up from bottom) ── */}
      <AnimatePresence>
        {showDetails && crawl.status === "success" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="border-t border-border/40 overflow-hidden shrink-0"
            style={{ maxHeight: "60vh", overflowY: "auto" }}
          >
            <div className="container mx-auto px-4 py-6 max-w-5xl">
              <Tabs defaultValue="summary">
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
                          <Button variant="outline" size="sm" className="font-mono text-xs"
                            onClick={() => crawl.clonedHtml && navigator.clipboard.writeText(crawl.clonedHtml)}>
                            <Copy className="w-3 h-3 mr-1" /> Copy HTML
                          </Button>
                          <Button variant="outline" size="sm" className="font-mono text-xs"
                            onClick={() => window.open(`/api/crawls/${crawl.id}/clone`, "_blank")}>
                            <ExternalLink className="w-3 h-3 mr-1" /> Open
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {crawl.clonedHtml
                        ? <div className="border-t border-border/40">
                            <iframe src={`/api/crawls/${crawl.id}/clone`} className="w-full rounded-b-lg"
                              style={{ height: 500, border: "none" }} sandbox="allow-scripts allow-same-origin allow-forms" title="AI Clone" />
                          </div>
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
                            <div key={t} className="flex items-center gap-3 p-4 rounded-lg border"
                              style={{ borderColor: `${techColors[t] || "#00e5ff"}30`, backgroundColor: `${techColors[t] || "#00e5ff"}08` }}>
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: techColors[t] || "#00e5ff" }} />
                              <span className="font-mono text-sm font-semibold" style={{ color: techColors[t] || "#00e5ff" }}>{t}</span>
                            </div>))}</div>
                        : <div className="text-center py-8 text-muted-foreground font-mono text-sm">No technologies detected.</div>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="meta">
                  <Card className="bg-card border-border/40">
                    <CardHeader><CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2"><Tag className="w-4 h-4" /> Meta Tags</CardTitle></CardHeader>
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
