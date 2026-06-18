import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Search, Activity, Globe, Clock, Link as LinkIcon, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { useListCrawls, useStartCrawl, getListCrawlsQueryKey, useGetCrawlStats, useDeleteCrawl, getGetCrawlStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  url: z.string().url("Please enter a valid URL (e.g. https://example.com)"),
});

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: crawls, isLoading: isLoadingCrawls } = useListCrawls({ 
    query: { 
      queryKey: getListCrawlsQueryKey(),
      refetchInterval: (query) => {
        const hasPending = query.state.data?.some(c => c.status === "pending");
        return hasPending ? 2000 : false;
      }
    } 
  });
  
  const { data: stats } = useGetCrawlStats({
    query: {
      queryKey: getGetCrawlStatsQueryKey()
    }
  });

  const startCrawl = useStartCrawl();
  const deleteCrawl = useDeleteCrawl();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    startCrawl.mutate({ data: { url: values.url } }, {
      onSuccess: () => {
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListCrawlsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCrawlStatsQueryKey() });
        toast({
          title: "Infiltration initiated",
          description: "Target URL acquired. Standby for analysis.",
        });
      },
      onError: (err: { error?: string }) => {
        toast({
          title: "Error starting infiltration",
          description: err.error || "Unknown error occurred",
          variant: "destructive"
        });
      }
    });
  }

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    deleteCrawl.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCrawlsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCrawlStatsQueryKey() });
      }
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <span className="font-mono font-bold tracking-tight">AI_WEB_SCOUT</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-primary animate-pulse" />
              <span>SYSTEM ONLINE</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <Card className="bg-card border-border/40 shadow-none col-span-1 md:col-span-4">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-sm font-mono text-muted-foreground mb-1 uppercase tracking-wider">Mission Stats</h2>
                  <div className="flex gap-8">
                    <div>
                      <div className="text-2xl font-mono text-primary">{stats?.totalCrawls ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">Targets Analyzed</div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono text-primary">{stats?.uniqueDomains ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">Unique Domains</div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono text-primary">{Math.round(stats?.averageLinks ?? 0)}</div>
                      <div className="text-xs text-muted-foreground">Avg Links/Target</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="relative flex items-center">
              <Terminal className="absolute left-4 text-muted-foreground w-5 h-5" />
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input 
                        placeholder="Enter target URL for reconnaissance..." 
                        className="pl-12 h-14 bg-card border-primary/20 focus-visible:ring-primary/50 text-base font-mono rounded-r-none"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage className="absolute -bottom-6 font-mono text-xs" />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                disabled={startCrawl.isPending}
                className="h-14 px-8 rounded-l-none font-mono uppercase tracking-wider border border-primary/20"
              >
                {startCrawl.isPending ? "Deploying..." : "Execute"}
              </Button>
            </form>
          </Form>
        </div>

        <div>
          <h2 className="text-sm font-mono text-muted-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Recent Reconnaissance Operations
          </h2>
          
          <div className="space-y-3">
            {isLoadingCrawls && (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full bg-card/50" />
              ))
            )}

            {!isLoadingCrawls && crawls?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground font-mono text-sm border border-dashed border-border/40 rounded-lg">
                NO RECENT OPERATIONS FOUND
              </div>
            )}

            <AnimatePresence>
              {crawls?.map((crawl) => (
                <motion.div
                  key={crawl.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Link href={`/crawl/${crawl.id}`}>
                    <Card className="bg-card hover:bg-card/80 transition-colors cursor-pointer border-border/40 hover:border-primary/50 group overflow-hidden relative">
                      {crawl.status === "pending" && (
                         <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />
                      )}
                      {crawl.status === "error" && (
                         <div className="absolute top-0 left-0 w-1 h-full bg-destructive" />
                      )}
                      {crawl.status === "success" && (
                         <div className="absolute top-0 left-0 w-1 h-full bg-primary/40" />
                      )}
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4 truncate">
                          <div className="bg-background p-2 rounded-md border border-border">
                            <Globe className="w-5 h-5 text-primary" />
                          </div>
                          <div className="truncate">
                            <div className="font-semibold text-foreground truncate">{crawl.title || crawl.url}</div>
                            <div className="text-xs font-mono text-muted-foreground truncate max-w-md">{crawl.url}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6 shrink-0">
                          {crawl.status === "success" && (
                            <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-muted-foreground">
                              <span className="flex items-center gap-1"><LinkIcon className="w-3 h-3"/> {crawl.linksFound}</span>
                            </div>
                          )}
                          
                          <div className="text-xs font-mono text-muted-foreground hidden md:flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(crawl.createdAt), { addSuffix: true })}
                          </div>

                          <div className="w-24 flex justify-end">
                            {crawl.status === "pending" && (
                              <span className="text-xs font-mono text-primary flex items-center gap-1">
                                <Activity className="w-3 h-3 animate-spin" /> ANALYZING
                              </span>
                            )}
                            {crawl.status === "success" && (
                              <span className="text-xs font-mono text-primary flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> SUCCESS
                              </span>
                            )}
                            {crawl.status === "error" && (
                              <span className="text-xs font-mono text-destructive flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> FAILED
                              </span>
                            )}
                          </div>

                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => handleDelete(e, crawl.id)}
                            disabled={deleteCrawl.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
