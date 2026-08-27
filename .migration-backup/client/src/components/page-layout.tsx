import type { ReactNode } from "react";
import { pageAccentStyle, type PageAccentName } from "@/lib/page-accent";

interface PageLayoutProps {
  children: ReactNode;
  /**
   * Page identity color, keyed to the nav icon colors (see lib/page-accent.ts).
   * Sets `--page-accent` / `--page-accent-2` for everything inside, including
   * the PageHeader glow, kicker and gradient headline. Omit = primary blue.
   */
  accent?: PageAccentName;
}

export function PageLayout({ children, accent }: PageLayoutProps) {
  return (
    <div
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-[350px]"
      style={pageAccentStyle(accent)}
    >
      {children}
    </div>
  );
}
