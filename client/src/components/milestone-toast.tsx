import { toast } from "@/hooks/use-toast";
import type { Milestone } from "@/lib/milestones";
import { Trophy, Star, Sparkles } from "lucide-react";

function getIcon(type: Milestone["type"]) {
  switch (type) {
    case "session":
      return Trophy;
    case "skill-reps":
      return Star;
    case "new-skill":
      return Sparkles;
  }
}

export function showMilestoneCelebration(milestone: Milestone) {
  const Icon = getIcon(milestone.type);

  toast({
    title: (
      <span className="flex items-center gap-2" data-testid="milestone-title">
        <Icon className="h-5 w-5 text-yellow-500 shrink-0" />
        <span>{milestone.title}</span>
      </span>
    ),
    description: (
      <span data-testid="milestone-description">{milestone.description}</span>
    ),
    className:
      "border-yellow-500/50 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30",
    duration: 6000,
  });
}

export function showMilestones(milestones: Milestone[]) {
  if (milestones.length === 0) return;

  showMilestoneCelebration(milestones[0]);

  milestones.slice(1).forEach((milestone, index) => {
    setTimeout(() => {
      showMilestoneCelebration(milestone);
    }, (index + 1) * 3000);
  });
}
