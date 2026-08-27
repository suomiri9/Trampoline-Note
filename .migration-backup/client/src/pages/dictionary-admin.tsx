import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DictionarySection } from "@/components/dictionary-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { pageAccentStyle } from "@/lib/page-accent";
import { Plus, Archive, ArchiveRestore, Search, BookOpen, ShieldOff } from "lucide-react";
import { primaryActionClass, headerActionClass } from "@/components/page-header";

// Hidden owner workspace for curating the shared skills & drills dictionary.
// Not linked from any athlete nav. Performs an explicit isAdmin gate; the
// server also enforces every mutation server-side.
export default function DictionaryAdminPage() {
  const { user, isLoading } = useAuth();
  const isAdmin = !!user?.isAdmin;

  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Loading state — keep the shell while auth resolves.
  if (isLoading) {
    return (
      <div
        className="min-h-[100dvh] flex items-center justify-center"
        data-testid="loading-admin-gate"
      >
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Access-denied state for non-admins.
  if (!isAdmin) {
    return (
      <div
        className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center"
        data-testid="access-denied-admin"
        style={pageAccentStyle("skills")}
      >
        <div className="w-14 h-14 rounded-2xl border border-border/60 bg-white/[0.03] flex items-center justify-center">
          <ShieldOff className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold tracking-tight">Access restricted</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            This workspace is only available to the app owner. Sign in with the owner account to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    // No PageLayout wrapper — this page has no bottom nav so we manage our
    // own padding. Uses the same max-width and horizontal spacing as PageLayout.
    <div
      className="min-h-[100dvh] bg-mesh"
      style={pageAccentStyle("skills")}
      data-testid="page-dictionary-admin"
    >
      {/* Workspace header — fixed, not scrolled away */}
      <header className="sticky top-0 z-30 full-bleed-bar border-b border-white/[0.08] bg-background/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          {/* Identity */}
          <div className="flex items-center gap-2 mr-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[hsl(var(--page-accent)/0.12)] border border-[hsl(var(--page-accent)/0.2)] flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-[hsl(var(--page-accent)/0.85)]" />
            </div>
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--page-accent)/0.7)] leading-none">Owner workspace</p>
              <p className="text-sm font-semibold leading-tight">Dictionary admin</p>
            </div>
          </div>

          {/* Search — grows to fill available space */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entries..."
              className="h-9 pl-8 rounded-xl text-xs font-mono"
              data-testid="input-admin-search"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
              className={cn(
                headerActionClass,
                "shrink-0",
                !showArchived && "text-muted-foreground hover:text-foreground",
              )}
              data-testid="button-toggle-archived"
            >
              {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              <span className="hidden sm:inline">{showArchived ? "Active" : "Archived"}</span>
            </Button>
            <Button
              className={cn(primaryActionClass, "shrink-0")}
              onClick={() => setFormOpen((v) => !v)}
              data-testid="button-add-skill"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add entry</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Page body */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Status strip */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--page-accent)/0.6)]">
            {showArchived ? "Archived entries" : "Active entries"}
          </span>
        </div>

        <DictionarySection
          searchQuery={searchQuery}
          showArchived={showArchived}
          mode="admin"
          formOpen={formOpen}
          onFormOpenChange={setFormOpen}
        />
      </main>
    </div>
  );
}
