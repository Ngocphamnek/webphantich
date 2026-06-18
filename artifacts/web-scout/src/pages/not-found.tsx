import { Link } from "wouter";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center font-mono">
      <Terminal className="w-16 h-16 text-primary mb-6 opacity-40" />
      <h1 className="text-6xl font-bold text-primary mb-2">404</h1>
      <p className="text-muted-foreground mb-8 text-sm uppercase tracking-wider">PAGE NOT FOUND</p>
      <Link href="/">
        <Button variant="outline" className="font-mono">Return to Base</Button>
      </Link>
    </div>
  );
}
