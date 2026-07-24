import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Bot, Send, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface CoachMessage {
  id: number;
  role: string;
  content: string;
  createdAt: string;
}

const SUGGESTIONS = [
  "How has my training load trended lately?",
  "Am I recovering enough for my current load?",
  "How do I log a session with skills and reps?",
];

// Clear-history button with confirm dialog. Renders nothing while the chat is
// empty. Shared by the Coach page header and the floating widget header.
export function ClearChatButton() {
  const { data: messages } = useQuery<CoachMessage[]>({
    queryKey: ["/api/coach/messages"],
  });
  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/coach/messages");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/messages"] });
    },
  });

  if ((messages?.length ?? 0) === 0) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          data-testid="button-clear-chat"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your conversation with the coach.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-clear-chat-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => clearMutation.mutate()}
            data-testid="button-clear-chat-confirm"
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// The coach chat itself: message list + input. `compact` makes the list fill
// its flex parent (floating widget); otherwise it uses page-card sizing.
// Sends the current route with each message so the coach knows what page the
// athlete is looking at.
export function CoachChat({ compact = false }: { compact?: boolean }) {
  const [location] = useLocation();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  // The user's message and the coach's partial reply while a send is in
  // flight — rendered as optimistic bubbles until the history refetch lands.
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading: messagesLoading } = useQuery<CoachMessage[]>({
    queryKey: ["/api/coach/messages"],
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      setPendingUser(content);
      setStreamText("");
      const res = await fetch("/api/coach/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, page: location }),
        credentials: "include",
      });
      if (!res.ok || !res.headers.get("content-type")?.includes("text/event-stream")) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${text}`);
      }
      // Parse the SSE stream: {delta} chunks build the reply live, {done}
      // completes it, {error} aborts.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let done = false;
      while (true) {
        const { value, done: eof } = await reader.read();
        if (eof) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let payload: { delta?: string; done?: boolean; reply?: string; error?: string };
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          if (payload.error) throw new Error(`503: ${payload.error}`);
          if (payload.delta) {
            acc += payload.delta;
            setStreamText(acc);
          }
          if (payload.done) done = true;
        }
      }
      if (!done) throw new Error("503: stream ended unexpectedly");
      return { reply: acc };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/messages"] });
      setPendingUser(null);
      setStreamText("");
    },
    onError: (err: Error) => {
      setPendingUser(null);
      setStreamText("");
      toast({
        title: "The coach didn't answer",
        description: err.message.includes("503")
          ? "The AI coach is unavailable right now. Please try again in a moment."
          : "Something went wrong sending your message.",
        variant: "destructive",
      });
    },
  });

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sendMutation.isPending, streamText]);

  const send = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(content, {
      onError: () => setInput(content),
    });
  };

  const hasMessages = (messages?.length ?? 0) > 0 || (sendMutation.isPending && pendingUser != null);

  return (
    <>
      <div
        ref={scrollRef}
        className={cn(
          "px-4 pb-2 overflow-y-auto space-y-3",
          compact ? "flex-1 min-h-0" : "px-5 max-h-[50vh] min-h-[180px]",
        )}
        data-testid="list-coach-messages"
      >
        {messagesLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-3/4 rounded-xl" />
            <Skeleton className="h-10 w-2/3 rounded-xl ml-auto" />
          </div>
        ) : !hasMessages ? (
          <div className="py-6 text-center" data-testid="text-coach-empty">
            <Bot className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground mb-4">
              Ask about your training, or how to use anything in the app.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="text-[11px] font-mono px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => send(s)}
                  data-testid={`button-suggestion-${i}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages!.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              data-testid={`message-coach-${m.id}`}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary/15 text-foreground"
                    : "bg-secondary text-foreground",
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {sendMutation.isPending && pendingUser != null && (
          <div className="flex justify-end" data-testid="message-coach-pending-user">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-primary/15 text-foreground">
              {pendingUser}
            </div>
          </div>
        )}
        {sendMutation.isPending &&
          (streamText ? (
            <div className="flex justify-start" data-testid="message-coach-streaming">
              <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-secondary text-foreground">
                {streamText}
                <span className="inline-block w-2 h-4 ml-0.5 align-text-bottom bg-primary/60 animate-pulse rounded-sm" />
              </div>
            </div>
          ) : (
            <div className="flex justify-start" data-testid="indicator-coach-thinking">
              <div className="bg-secondary rounded-2xl px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking…
              </div>
            </div>
          ))}
      </div>

      <div className="p-3 border-t border-border/50 flex items-end gap-2 shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask your coach…"
          rows={1}
          className="min-h-[44px] max-h-32 resize-none"
          data-testid="input-coach-message"
        />
        <Button
          size="icon"
          className="h-[44px] w-[44px] shrink-0"
          onClick={() => send()}
          disabled={!input.trim() || sendMutation.isPending}
          data-testid="button-send-message"
        >
          {sendMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </>
  );
}
