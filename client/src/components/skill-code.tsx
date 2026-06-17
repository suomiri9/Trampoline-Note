import { useSkillChipLabel } from "@/hooks/use-skill-label-mode";
import type { Skill } from "@shared/schema";

// Renders a skill's compact label: its short CODE by default, or its NAME when
// the "show skill names" preference is on (see use-skill-label-mode). Use this
// anywhere a skill is shown as a bare code chip/badge so the whole app honors
// the toggle. `fallback` is shown when the skill resolves to an empty label.
export function SkillCode({
  skill,
  allSkills,
  fallback = "",
}: {
  skill: Skill | null | undefined;
  allSkills: Skill[] | null | undefined;
  fallback?: string;
}) {
  const label = useSkillChipLabel();
  return <>{label(skill, allSkills) || fallback}</>;
}
