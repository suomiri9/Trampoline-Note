import { useState } from "react";
import { DictionarySection } from "@/components/dictionary-section";
import { PageLayout } from "@/components/page-layout";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/back-link";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

// The shared skills & drills dictionary, athlete-facing only.
// Everyone can browse/search, adopt entries, and suggest corrections.
// Admin controls (create/edit/archive/import/review/image) live on
// the separate Dictionary Admin artifact and are never shown here.
export default function DictionaryPage() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <PageLayout accent="skills">
      <PageHeader
        backLink={<BackLink to="/skills" label="The Arsenal" testId="button-back-skills" />}
        kicker="The Arsenal"
        title="The shared dictionary."
        accent="dictionary."
        subtitle="Curated skills and drills for every athlete — browse the list, add anything straight into your own library, or suggest a correction."
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
        showArchived={false}
        mode="athlete"
        formOpen={false}
        onFormOpenChange={() => {}}
      />
    </PageLayout>
  );
}
