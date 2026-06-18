import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Terminal, ArrowLeft, Globe, ExternalLink, Link as LinkIcon,
  Image as ImageIcon, Database, Activity, AlertCircle, FileText,
  Code2, Tag, Copy, Monitor, Loader2
} from "lucide-react";
import { useGetCrawl, getGetCrawlQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CrawlDetail() {
  const { id } = useParams();
  const crawlId = parseInt(id || "0", 10);

  const [browserSrc, setBrowserSrc] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string>("");
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserAiComment, setBrowserAiComment] = useState<string | null>(null);
  const [clickMarker, setClickMarker] = useState<{ x: number; y: number } | null>(null);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const takeLiveScreenshot = useCallback(async (crawlId: number, crawlUrl: string, currentUrl?: string) => {
    setBrowserLoading(true);
    setBrowserAiComment(null);
    setBrowserError(null);
    setClickMarker(null);
    try {
      const res = await fetch(`/api/crawls/${crawlId}/live-screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUrl: currentUrl || crawlUrl }),
      });
      const data = await res.json();
      if (data.error) { setBrowserError(data.error); return; }
      setBrowserSrc(`data:image/jpeg;base64,${data.screenshot}`);
      setBrowserUrl(data.currentUrl);
    } catch (err) {
      setBrowserError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setBrowserLoading(false);
    }
  }, []);

  const handleRemoteClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>, crawlId: number, crawlUrl: string) => {
    if (!imgRef.current || browserLoading) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    setClickMarker({ x: xPercent, y: yPercent });
    setBrowserLoading(true);
    setBrowserAiComment(null);
    setBrowserError(null);
    try {
      const res = await fetch(`/api/crawls/${crawlId}/remote-click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xPercent, yPercent, currentUrl: browserUrl || crawlUrl }),
      });
      const data = await res.json();
      if (data.error) { setBrowserError(data.error); return; }
      setBrowserSrc(`data:image/jpeg;base64,${data.screenshot}`);
      setBrowserUrl(data.currentUrl);
      setBrowserAiComment(data.aiComment || null);
      setClickMarker(null);
    } catch (err) {
      setBrowserError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setBrowserLoading(false);
    }
  }, [browserLoading, browserUrl]);

  const { data: crawl, isLoading, isError } = useGetCrawl(crawlId, {
    query: {
      enabled: !!crawlId,
      queryKey: getGetCrawlQueryKey(crawlId),
      refetchInterval: (query) =>
        query.state.data?.status === "pending" ? 2000 : false,
    },
  });

  useEffect(() => {
    if (crawl?.status === "success" && !browserSrc && !browserLoading) {
      if (crawl.hasScreenshot) {
        setBrowserSrc(`/api/crawls/${crawl.id}/screenshot`);
        setBrowserUrl(crawl.url);
      } else {
        takeLiveScreenshot(crawl.id, crawl.url);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawl?.id, crawl?.status]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
        <header className="border-b border-border/40 bg-background/95 sticky top-0 z-50">
          <div className="container mx-auto px-4 h-16 flex items-center">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-6 w-32 ml-4" />
          </div>
        </header>
        <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (isError || !crawl) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center">
        <Terminal className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-xl font-mono text-destructive mb-2 uppercase">Mission Data Corrupted</h1>
        <p className="text-muted-foreground mb-6 font-mono text-sm">Target record not found or inaccessible.</p>
        <Link href="/">
          <Button variant="outline" className="font-mono">Return to Base</Button>
        </Link>
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

  const openCloneInNewTab = () => {
    window.open(`/api/crawls/${crawl.id}/clone`, "_blank");
  };

  const copyCloneHtml = () => {
    if (crawl.clonedHtml) navigator.clipboard.writeText(crawl.clonedHtml);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="hover:bg-primary/10 hover:text-primary">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Terminal className="w-4 h-4" />
              <span className="font-mono font-bold tracking-tight text-primary">REPORT_VIEWER</span>
            </div>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            ID: #{crawl.id.toString().padStart(6, "0")}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <Card className="bg-card border-border/40 overflow-hidden relative">
            {crawl.status === "pending" && <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse" />}
            {crawl.status === "error" && <div className="absolute top-0 left-0 w-full h-1 bg-destructive" />}
            {crawl.status === "success" && <div className="absolute top-0 left-0 w-full h-1 bg-primary" />}

            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                      <Globe className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold tracking-tight break-words">{crawl.title || crawl.url}</h1>
                      <div className="flex items-center gap-2 text-muted-foreground mt-1">
                        <a
                          href={crawl.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-mono hover:text-primary transition-colors flex items-center gap-1 break-all"
                        >
                          {crawl.url} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {parsedTech.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {parsedTech.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded text-xs font-mono font-bold border"
                          style={{
                            color: techColors[t] || "#00e5ff",
                            borderColor: `${techColors[t] || "#00e5ff"}40`,
                            backgroundColor: `${techColors[t] || "#00e5ff"}10`,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4 text-xs font-mono text-muted-foreground pt-4 border-t border-border/40">
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" /> STATUS:{" "}
                      <span className={
                        crawl.status === "success" ? "text-primary" :
                        crawl.status === "error" ? "text-destructive" : "text-primary animate-pulse"
                      }>
                        {crawl.status.toUpperCase()}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3" /> DATE: {format(new Date(crawl.createdAt), "yyyy-MM-dd HH:mm:ss")}
                    </span>
                    {crawl.linksFound != null && (
                      <span className="flex items-center gap-1">
                        <LinkIcon className="w-3 h-3" /> {crawl.linksFound} LINKS
                      </span>
                    )}
                    {crawl.imagesFound != null && (
                      <span className="flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> {crawl.imagesFound} IMAGES
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {crawl.status === "error" && (
            <Card className="bg-destructive/5 border-destructive/20">
              <CardContent className="p-6 text-destructive flex items-start gap-4">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <h3 className="font-mono font-bold uppercase mb-1">Infiltration Failed</h3>
                  <p className="font-mono text-sm">{crawl.errorMessage || "Unknown error encountered during execution."}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {crawl.status === "pending" && (
            <Card className="bg-card border-border/40 border-dashed">
              <CardContent className="p-12 flex flex-col items-center justify-center text-center text-muted-foreground">
                <Terminal className="w-8 h-8 mb-4 animate-pulse text-primary" />
                <h3 className="font-mono mb-2 text-foreground">ANALYSIS IN PROGRESS</h3>
                <p className="font-mono text-sm max-w-md">The agent is extracting data, building tech profile, and generating insights + interface clone...</p>
              </CardContent>
            </Card>
          )}

          {crawl.status === "success" && (
            <Tabs defaultValue="screenshot" className="w-full">
              <TabsList className="grid grid-cols-7 mb-6 bg-card border border-border/40">
                <TabsTrigger value="screenshot" className="font-mono text-xs">
                  <Monitor className="w-3 h-3 mr-1" />Màn hình
                </TabsTrigger>
                <TabsTrigger value="summary" className="font-mono text-xs">
                  <Terminal className="w-3 h-3 mr-1" />AI Report
                </TabsTrigger>
                <TabsTrigger value="clone" className="font-mono text-xs">
                  <Monitor className="w-3 h-3 mr-1" />Clone
                </TabsTrigger>
                <TabsTrigger value="tech" className="font-mono text-xs">
                  <Code2 className="w-3 h-3 mr-1" />Tech
                </TabsTrigger>
                <TabsTrigger value="meta" className="font-mono text-xs">
                  <Tag className="w-3 h-3 mr-1" />Meta
                </TabsTrigger>
                <TabsTrigger value="links" className="font-mono text-xs">
                  <LinkIcon className="w-3 h-3 mr-1" />Links ({crawl.linksFound || 0})
                </TabsTrigger>
                <TabsTrigger value="images" className="font-mono text-xs">
                  <ImageIcon className="w-3 h-3 mr-1" />Images ({crawl.imagesFound || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="screenshot" className="mt-0">
                <Card className="bg-card border-border/40 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border/40">
                    <button
                      onClick={() => takeLiveScreenshot(crawl.id, crawl.url)}
                      disabled={browserLoading}
                      className="text-xs font-mono text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors px-2 py-1 border border-border/40 rounded"
                      title="Chụp lại từ đầu"
                    >{browserLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "↺"}</button>
                    <div className="flex-1 flex items-center gap-2 bg-background border border-border/40 rounded px-3 py-1">
                      <Globe className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      <span className="font-mono text-xs text-muted-foreground truncate">
                        {browserUrl || crawl.url}
                      </span>
                    </div>
                    <button
                      onClick={() => takeLiveScreenshot(crawl.id, crawl.url, browserUrl || crawl.url)}
                      disabled={browserLoading}
                      className="text-xs font-mono text-cyan-400/80 border border-cyan-400/30 bg-cyan-400/5 hover:bg-cyan-400/15 disabled:opacity-40 px-3 py-1 rounded shrink-0 transition-colors flex items-center gap-1.5"
                    >
                      <Monitor className="w-3 h-3" />
                      Chụp lại
                    </button>
                    <a href={crawl.url} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors" title="Mở tab mới">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <CardContent className="p-0">
                    <div className="relative select-none" style={{ background: "#0a0a0f" }}>
                      {(browserSrc || crawl.hasScreenshot) ? (
                        <div className="relative">
                          <img
                            ref={imgRef}
                            src={browserSrc ?? `/api/crawls/${crawl.id}/screenshot`}
                            alt="Browser"
                            className={`w-full block ${browserLoading ? "opacity-40" : "cursor-crosshair"}`}
                            onClick={(e) => !browserLoading && handleRemoteClick(e, crawl.id, crawl.url)}
                            draggable={false}
                          />

                          {clickMarker && (
                            <div className="absolute pointer-events-none" style={{ left: `${clickMarker.x}%`, top: `${clickMarker.y}%`, transform: "translate(-50%,-50%)" }}>
                              <span className="absolute inset-0 w-8 h-8 rounded-full border-2 border-cyan-400 animate-ping" />
                              <span className="relative block w-8 h-8 rounded-full border-2 border-cyan-400 bg-cyan-400/20" />
                            </div>
                          )}

                          {browserLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                              <div className="text-center font-mono">
                                <p className="text-cyan-400 text-sm font-semibold">Puppeteer đang xử lý...</p>
                                <p className="text-muted-foreground text-xs mt-1">Điều hướng trang & chụp màn hình</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                          <Monitor className="w-12 h-12 opacity-20" />
                          <div className="text-center font-mono">
                            <p className="text-sm">Chưa có ảnh màn hình</p>
                            <p className="text-xs opacity-60 mt-1">Crawl lại URL này để chụp màn hình ban đầu</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border/40 bg-background">
                      {browserError ? (
                        <div className="px-4 py-3 flex items-center gap-2 text-red-400 font-mono text-xs">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{browserError}</span>
                        </div>
                      ) : browserAiComment ? (
                        <div className="px-4 py-3 flex gap-3 items-start">
                          <span className="text-lg shrink-0">🤖</span>
                          <p className="font-mono text-xs text-primary/80 leading-relaxed">{browserAiComment}</p>
                        </div>
                      ) : (browserSrc || crawl.hasScreenshot) && !browserLoading ? (
                        <p className="px-4 py-3 font-mono text-xs text-muted-foreground/50 text-center">
                          Bấm vào bất kỳ đâu trên màn hình — Puppeteer sẽ click trang thật và cập nhật màn hình
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="summary">
                <Card className="bg-card border-border/40">
                  <CardHeader>
                    <CardTitle className="font-mono text-sm uppercase text-primary flex items-center gap-2">
                      <Terminal className="w-4 h-4" /> AI Intelligence Report
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-w-none">
                    {crawl.aiSummary ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-a:text-primary prose-headings:font-mono prose-headings:text-primary prose-strong:text-foreground prose-li:text-muted-foreground whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                        {crawl.aiSummary}
                      </div>
                    ) : (
                      <span className="text-muted-foreground font-mono">No summary available.</span>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="clone">
                <Card className="bg-card border-border/40">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-mono text-sm uppercase text-primary flex items-center gap-2">
                        <Monitor className="w-4 h-4" /> AI Interface Clone
                        <span className="text-xs font-normal text-cyan-400 ml-2 border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 rounded">
                          BẤM ĐỂ AI PHÂN TÍCH
                        </span>
                      </CardTitle>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={copyCloneHtml}>
                          <Copy className="w-3 h-3 mr-1" /> Copy HTML
                        </Button>
                        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={openCloneInNewTab}>
                          <ExternalLink className="w-3 h-3 mr-1" /> Open
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      Bấm vào bất kỳ phần tử nào trong clone bên dưới — AI sẽ giải thích chức năng của nó
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    {crawl.clonedHtml ? (
                      <div className="border-t border-border/40">
                        <iframe
                          src={`/api/crawls/${crawl.id}/clone`}
                          className="w-full rounded-b-lg"
                          style={{ height: "650px", border: "none" }}
                          sandbox="allow-scripts allow-same-origin allow-forms"
                          title="AI Interface Clone"
                        />
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground font-mono text-sm p-6">
                        Clone chưa được tạo.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tech">
                <Card className="bg-card border-border/40">
                  <CardHeader>
                    <CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2">
                      <Code2 className="w-4 h-4" /> Technology Stack
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {parsedTech.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {parsedTech.map((t) => (
                          <div
                            key={t}
                            className="flex items-center gap-3 p-4 rounded-lg border"
                            style={{
                              borderColor: `${techColors[t] || "#00e5ff"}30`,
                              backgroundColor: `${techColors[t] || "#00e5ff"}08`,
                            }}
                          >
                            <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: techColors[t] || "#00e5ff" }}
                            />
                            <span
                              className="font-mono text-sm font-semibold"
                              style={{ color: techColors[t] || "#00e5ff" }}
                            >
                              {t}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                        No technologies detected.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="meta">
                <Card className="bg-card border-border/40">
                  <CardHeader>
                    <CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2">
                      <Tag className="w-4 h-4" /> Meta Tags & SEO Data
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(parsedMeta).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(parsedMeta).map(([key, value]) => (
                          <div key={key} className="flex flex-col sm:flex-row gap-2 p-3 bg-background border border-border/40 rounded-md">
                            <span className="font-mono text-xs text-primary font-bold shrink-0 sm:w-48">{key}</span>
                            <span className="font-mono text-xs text-muted-foreground break-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                        No meta tags found.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="links">
                <Card className="bg-card border-border/40">
                  <CardHeader>
                    <CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2">
                      <LinkIcon className="w-4 h-4" /> Discovered Links
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {parsedLinks.length > 0 ? (
                      <div className="grid gap-2">
                        {parsedLinks.map((link, i) => (
                          <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-background border border-border/40 rounded-md">
                            <span className="text-sm font-medium truncate flex-1">{link.text || "Unnamed Link"}</span>
                            <a
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-mono text-primary truncate flex-1 hover:underline"
                            >
                              {link.href}
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground font-mono text-sm">No links extracted.</div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="images">
                <Card className="bg-card border-border/40">
                  <CardHeader>
                    <CardTitle className="font-mono text-sm uppercase text-muted-foreground flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" /> Discovered Images
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {parsedImages.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {parsedImages.map((img, i) => (
                          <div key={i} className="group relative aspect-square bg-background border border-border/40 rounded-md overflow-hidden flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-muted-foreground/30 absolute" />
                            <img
                              src={img}
                              alt={`Image ${i + 1}`}
                              className="w-full h-full object-cover relative z-10 opacity-80 group-hover:opacity-100 transition-opacity"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground font-mono text-sm">No images extracted.</div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </motion.div>
      </main>
    </div>
  );
}
