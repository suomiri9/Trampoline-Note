import { useState } from "react";
import { useLocation } from "wouter";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoachChat, ClearChatButton } from "@/components/coach-chat";
import { useOnline } from "@/hooks/use-online";

// Coach chat launcher + panel. The launcher renders INLINE inside the bottom
// bar row (App.tsx Navigation), immediately to the right of the nav pill, so
// it always sits right next to the bar at every screen width. The row is
// z-[60] (above dialog z-50) so the button stays visible over popups (user
// request). Hidden on /coach (that page has the full chat) and while offline
// (the coach is live-only).
export function CoachWidget() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const isOnline = useOnline();

  if (location === "/coach" || !isOnline) return null;

  return (
    <>
      {open && (
        <div
          className="fixed right-2 sm:right-4 bottom-20 mb-safe z-[60] w-[min(94vw,380px)] pointer-events-auto"
          data-testid="panel-coach-widget"
        >
          <div className="card-3d rounded-2xl flex flex-col h-[min(65vh,540px)] shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border/50 shrink-0">
              <Bot className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span className="font-mono uppercase tracking-wider text-[11px] font-semibold">
                Coach
              </span>
              <div className="ml-auto flex items-center gap-1">
                <ClearChatButton />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setOpen(false)}
                  data-testid="button-close-coach-widget"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <CoachChat compact />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close coach chat" : "Chat with your coach"}
        className="pointer-events-auto shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-full glass-surface flex items-center justify-center text-cyan-600 dark:text-cyan-400 hover:scale-105 transition-transform shadow-lg"
        data-testid="button-coach-widget"
      >
        {open ? <X className="w-4 h-4" /> : <Bot className="w-4 h-4 sm:w-5 sm:h-5" />}
      </button>
    </>
  );
}
