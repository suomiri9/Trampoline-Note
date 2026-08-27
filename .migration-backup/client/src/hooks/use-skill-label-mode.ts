import { useEffect, useState, useCallback } from 'react';
import {
  getShowSkillNames,
  setShowSkillNames,
  subscribeShowSkillNames,
} from '@/lib/skill-label-mode';
import { skillDisplayCode, skillDisplayName } from '@/lib/training-utils';
import type { Skill } from '@shared/schema';

export function useShowSkillNames(): readonly [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => getShowSkillNames());

  useEffect(() => {
    const cb = () => setEnabled(getShowSkillNames());
    cb();
    return subscribeShowSkillNames(cb);
  }, []);

  const update = useCallback((v: boolean) => {
    setShowSkillNames(v);
  }, []);

  return [enabled, update] as const;
}

// Returns a resolver for compact skill chips: the short CODE by default, or the
// skill's NAME when the "show skill names" preference is on (falling back to the
// code when a name is missing). Use this anywhere a skill is shown as a bare
// code chip/badge so the whole app honors the toggle.
export function useSkillChipLabel(): (
  skill: Skill | null | undefined,
  allSkills: Skill[] | null | undefined,
) => string {
  const [showNames] = useShowSkillNames();
  return useCallback(
    (skill, allSkills) => {
      const code = skillDisplayCode(skill, allSkills);
      if (!showNames) return code;
      return skillDisplayName(skill, allSkills) || code;
    },
    [showNames],
  );
}
