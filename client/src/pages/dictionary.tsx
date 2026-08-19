import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DictionarySection } from "@/components/dictionary-section";
import { PageLayout } from "@/components/page-layout";
import { PageHeader, primaryActionClass, headerActionClass } from "@/components/page-header";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Archive, ArchiveRestore, Search } from "lucide-react";

// The shared skills & drills dictionary, on its own page under The Arsenal.
// Everyone can browse/search and adopt entries; the owner additionally gets
// the archived toggle, the entry editor, and the suggestion review queue
// (all re-checked server-side).
export default function DictionaryPage() {
  const { user } = useAuth();
  const isAdminUser = !!user?.isAdmin;
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);

  return (
    <PageLayout accent="skills">
      <PageHeader
        backLink={<BackLink to="/skills" label="The Arsenal" testId="button-back-skills" />}
        kicker="The Arsenal"
        title="The shared dictionary."
        accent="dictionary."
        subtitle="Curated skills and drills for every athlete — browse the list, add anything straight into your own library, or suggest a correction."
        actions={
          isAdminUser ? (
            <>
              <Button
                variant={showArchived ? "default" : "outline"}
                size="sm"
                onClick={() => setShowArchived((v) => !v)}
                className={cn(headerActionClass, "shrink-0", !showArchived && "text-muted-foreground hover:text-foreground")}
                data-testid="button-toggle-archived"
              >
                {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </Button>
              <Button
                className={cn(primaryActionClass, "shrink-0")}
                onClick={() => setShowForm((v) => !v)}
                data-testid="button-add-skill"
              >
                <Plus className="w-5 h-5" /> Add Entry
              </Button>
            </>
          ) : undefined
        }
      />
      <div
        className="sticky z-20 full-bleed-bar py-2 bg-background/90 backdrop-blur-md border-b border-white/[0.08] mb-4"
        style={{ top: "var(--page-header-h, 96px)" }}
      >
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-9 pl-8 rounded-xl text-xs font-mono"
            data-testid="input-library-search"
          />
        </div>
      </div>
      <DictionarySection
        searchQuery={searchQuery}
        showArchived={showArchived}
        isAdmin={isAdminUser}
        formOpen={showForm}
        onFormOpenChange={setShowForm}
      />
    </PageLayout>
  );
}
