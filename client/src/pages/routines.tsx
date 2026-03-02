import { useState } from "react";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function RoutinesPage() {
  const { data: skills } = useSkills();
  const { data: routines, createRoutine, deleteRoutine, isCreating } = useRoutines();
  
  const [name, setName] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<(number | null)[]>(new Array(10).fill(null));

  const handleAddSkill = (index: number, skillId: string) => {
    const newIds = [...selectedSkillIds];
    newIds[index] = parseInt(skillId);
    setSelectedSkillIds(newIds);
  };

  const handleCreate = async () => {
    if (!name || selectedSkillIds.some(id => id === null)) return;
    await createRoutine({
      name,
      skillIds: selectedSkillIds as number[],
    });
    setName("");
    setSelectedSkillIds(new Array(10).fill(null));
  };

  const calculateDifficulty = (ids: number[]) => {
    return ids.reduce((acc, id) => {
      const skill = skills?.find(s => s.id === id);
      return acc + (skill?.difficulty || 0);
    }, 0).toFixed(1);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Create Routine (10 Skills)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              placeholder="Routine Name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {selectedSkillIds.map((id, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-6">{index + 1}.</span>
                  <Select onValueChange={(val) => handleAddSkill(index, val)} value={id?.toString() || ""}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select Skill" />
                    </SelectTrigger>
                    <SelectContent>
                      {skills?.map(skill => (
                        <SelectItem key={skill.id} value={skill.id.toString()}>
                          {skill.name} ({skill.difficulty})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button 
              className="w-full" 
              onClick={handleCreate} 
              disabled={isCreating || !name || selectedSkillIds.some(id => id === null)}
            >
              Save Routine
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Saved Routines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {routines?.map((routine) => (
                <Card key={routine.id} className="overflow-hidden">
                  <div className="p-4 flex items-center justify-between bg-muted/30">
                    <div>
                      <h3 className="font-bold text-lg">{routine.name}</h3>
                      <p className="text-sm text-muted-foreground">Total Difficulty: {calculateDifficulty(routine.skillIds)}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteRoutine(routine.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="p-4 flex flex-wrap gap-2">
                    {routine.skillIds.map((id, idx) => {
                      const skill = skills?.find(s => s.id === id);
                      return (
                        <Badge key={idx} variant="outline" className="px-2 py-1">
                          {skill?.code || "???"}
                        </Badge>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
