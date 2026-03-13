import { useState } from "react";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, GripVertical, Pencil, X, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Routine } from "@shared/schema";
import { cn } from "@/lib/utils";

export default function RoutinesPage() {
  const { data: allItems } = useSkills();
  const skills = allItems?.filter(item => item.isDrill === 0);
  const { data: routines, createRoutine, deleteRoutine, updateRoutine, isCreating, isUpdating } = useRoutines();
  
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [name, setName] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<(number | null)[]>(new Array(10).fill(null));

  const handleAddSkill = (index: number, skillId: string) => {
    const newIds = [...selectedSkillIds];
    newIds[index] = parseInt(skillId);
    setSelectedSkillIds(newIds);
  };

  const handleCreate = async () => {
    if (!name || selectedSkillIds.some(id => id === null)) return;
    
    if (editingRoutine) {
      await updateRoutine({
        id: editingRoutine.id,
        name,
        skillIds: selectedSkillIds as number[],
      });
      setEditingRoutine(null);
    } else {
      await createRoutine({
        name,
        skillIds: selectedSkillIds as number[],
      });
    }
    
    setName("");
    setSelectedSkillIds(new Array(10).fill(null));
  };

  const startEditing = (routine: Routine) => {
    setEditingRoutine(routine);
    setName(routine.name);
    setSelectedSkillIds(routine.skillIds);
  };

  const cancelEditing = () => {
    setEditingRoutine(null);
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
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800/30 rounded-2xl shrink-0">
          <Layers className="w-6 h-6 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Routines</h1>
          <p className="text-muted-foreground text-sm">Build and manage your competition routines.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              {editingRoutine ? "Edit Routine" : "Create Routine (10 Skills)"}
              {editingRoutine && <Button variant="ghost" size="icon" onClick={cancelEditing}><X className="h-4 w-4" /></Button>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              placeholder="Routine Name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {selectedSkillIds.map((id, index) => {
                const selectedSkill = skills?.find(s => s.id === id);
                return (
                  <div key={index} className="flex items-center gap-2 group">
                    <span className="text-xs font-mono text-muted-foreground w-6">{index + 1}.</span>
                    <Select onValueChange={(val) => handleAddSkill(index, val)} value={id?.toString() || ""}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Skill Code" />
                      </SelectTrigger>
                      <SelectContent>
                        {skills?.sort((a, b) => b.difficulty - a.difficulty).map(skill => (
                          <SelectItem key={skill.id} value={skill.id.toString()}>
                            <span className="font-mono">{skill.code}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="w-16 flex justify-end">
                      {selectedSkill ? (
                        <Badge variant="outline" className="font-mono bg-secondary/50">
                          {selectedSkill.difficulty.toFixed(1)}
                        </Badge>
                      ) : (
                        <div className="w-8 h-4 bg-muted/20 rounded-full" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-4 border-t flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Total Difficulty</span>
              <span className="text-2xl font-bold text-primary">
                {calculateDifficulty(selectedSkillIds.filter((id): id is number => id !== null))}
              </span>
            </div>
            <div className="flex gap-2">
              <Button 
                className="flex-1 h-11" 
                onClick={handleCreate} 
                disabled={isCreating || isUpdating || !name || selectedSkillIds.some(id => id === null)}
              >
                {isCreating || isUpdating ? "Saving..." : editingRoutine ? "Update Routine" : "Save Routine"}
              </Button>
              {editingRoutine && (
                <Button variant="outline" className="h-11" onClick={cancelEditing}>Cancel</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Saved Routines</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {routines?.map((routine) => (
                <Card key={routine.id} className={cn("overflow-hidden", editingRoutine?.id === routine.id && "ring-2 ring-primary")}>
                  <div className="p-4 flex items-center justify-between bg-muted/30">
                    <div>
                      <h3 className="font-bold text-lg">{routine.name}</h3>
                      <p className="text-sm text-muted-foreground">Total Difficulty: {calculateDifficulty(routine.skillIds)}</p>
                    </div>
                    <div className="space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => startEditing(routine)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteRoutine(routine.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 flex flex-wrap gap-4">
                    {routine.skillIds.map((id, idx) => {
                      const skill = skills?.find(s => s.id === id);
                      return (
                        <div key={idx} className="flex flex-col items-center gap-1">
                          <Badge variant="outline" className="px-2 py-1 font-mono">
                            {skill?.code || "???"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {skill?.difficulty.toFixed(1) || "0.0"}
                          </span>
                        </div>
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
