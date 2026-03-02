import { useState } from "react";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, GripVertical, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Routine } from "@shared/schema";
import { cn } from "@/lib/utils";

export default function RoutinesPage() {
  const { data: allItems } = useSkills();
  const skills = allItems?.filter(item => item.isDrill === 0);
  const { data: routines, createRoutine, deleteRoutine, updateRoutine, isCreating, isUpdating } = useRoutines();
  
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [name, setName] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);

  const handleAddSkill = (skillId: string) => {
    setSelectedSkillIds(prev => [...prev, parseInt(skillId)]);
  };

  const handleUpdateSkill = (index: number, skillId: string) => {
    const newIds = [...selectedSkillIds];
    newIds[index] = parseInt(skillId);
    setSelectedSkillIds(newIds);
  };

  const removeSkillAt = (index: number) => {
    setSelectedSkillIds(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!name || selectedSkillIds.length === 0) return;
    
    if (editingRoutine) {
      await updateRoutine({
        id: editingRoutine.id,
        name,
        skillIds: selectedSkillIds,
      });
      setEditingRoutine(null);
    } else {
      await createRoutine({
        name,
        skillIds: selectedSkillIds,
      });
    }
    
    setName("");
    setSelectedSkillIds([]);
  };

  const startEditing = (routine: Routine) => {
    setEditingRoutine(routine);
    setName(routine.name);
    setSelectedSkillIds(routine.skillIds);
  };

  const cancelEditing = () => {
    setEditingRoutine(null);
    setName("");
    setSelectedSkillIds([]);
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
            <CardTitle className="flex justify-between items-center text-xl font-display">
              {editingRoutine ? "Edit Routine" : "Create Routine"}
              {editingRoutine && <Button variant="ghost" size="icon" onClick={cancelEditing} className="rounded-full"><X className="h-4 w-4" /></Button>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Routine Name</label>
              <Input 
                placeholder="e.g. My First Routine" 
                value={name} 
                className="rounded-xl h-11 border-border/50"
                onChange={e => setName(e.target.value)} 
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add Skill</label>
              <Select onValueChange={handleAddSkill} key={`add-skill-${selectedSkillIds.length}`}>
                <SelectTrigger className="rounded-xl h-11 border-primary/20 bg-primary/5">
                  <SelectValue placeholder="Add skill to list..." />
                </SelectTrigger>
                <SelectContent>
                  {skills?.sort((a, b) => b.difficulty - a.difficulty).map(skill => (
                    <SelectItem key={skill.id} value={skill.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">{skill.code}</Badge>
                        <span>{skill.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
               <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Skills Sequence ({selectedSkillIds.length})</label>
               <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {selectedSkillIds.map((id, index) => {
                  const selectedSkill = skills?.find(s => s.id === id);
                  return (
                    <div key={index} className="flex items-center gap-2 group animate-in fade-in slide-in-from-left-2 duration-200">
                      <span className="text-[10px] font-mono text-muted-foreground/50 w-6 text-center">{index + 1}</span>
                      <Select onValueChange={(val) => handleUpdateSkill(index, val)} value={id.toString()}>
                        <SelectTrigger className="flex-1 rounded-lg h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {skills?.map(skill => (
                            <SelectItem key={skill.id} value={skill.id.toString()}>
                              <span className="font-mono">{skill.code}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="w-12 text-right">
                        <span className="text-[10px] font-mono font-bold text-primary/60">
                          {selectedSkill?.difficulty.toFixed(1)}
                        </span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive/50 hover:text-destructive hover:bg-destructive/5 rounded-lg"
                        onClick={() => removeSkillAt(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                {selectedSkillIds.length === 0 && (
                  <div className="py-8 text-center border-2 border-dashed rounded-xl border-muted/20">
                    <p className="text-xs text-muted-foreground italic">No skills added yet</p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border/50 flex justify-between items-center">
              <span className="text-sm font-bold text-foreground/70 uppercase tracking-tight">Total Difficulty</span>
              <span className="text-2xl font-display font-bold text-primary">
                {calculateDifficulty(selectedSkillIds)}
              </span>
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button 
                className="flex-1 h-11 rounded-xl font-bold shadow-lg shadow-primary/20" 
                onClick={handleCreate} 
                disabled={isCreating || isUpdating || !name || selectedSkillIds.length === 0}
              >
                {isCreating || isUpdating ? "Saving..." : editingRoutine ? "Update Routine" : "Save Routine"}
              </Button>
              {editingRoutine && (
                <Button variant="outline" className="h-11 rounded-xl px-6" onClick={cancelEditing}>Cancel</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-xl font-display">Saved Routines Library</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              {routines?.map((routine) => (
                <Card key={routine.id} className={cn(
                  "overflow-hidden border-border/50 transition-all hover:shadow-md", 
                  editingRoutine?.id === routine.id && "ring-2 ring-primary border-primary/50 shadow-lg shadow-primary/10"
                )}>
                  <div className="p-4 flex items-center justify-between bg-secondary/5 border-b border-border/30">
                    <div className="space-y-1">
                      <h3 className="font-bold text-base text-foreground/90">{routine.name}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] h-5 bg-background font-bold text-primary border-primary/20">
                          {routine.skillIds.length} Skills
                        </Badge>
                        <span className="text-xs font-mono font-bold text-primary/60">{calculateDifficulty(routine.skillIds)} DD</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => startEditing(routine)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/5" onClick={() => deleteRoutine(routine.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 bg-background">
                    <div className="flex flex-wrap gap-2">
                      {routine.skillIds.map((id, idx) => {
                        const skill = skills?.find(s => s.id === id);
                        return (
                          <div key={idx} className="flex items-center gap-1.5 bg-secondary/10 px-2 py-1 rounded-lg border border-border/20 group">
                            <span className="text-[9px] font-mono text-muted-foreground font-bold">{idx + 1}</span>
                            <span className="text-xs font-mono font-black text-foreground/80">{skill?.code || "???"}</span>
                            <span className="text-[9px] font-mono font-bold text-primary/40">{skill?.difficulty.toFixed(1)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              ))}
              {routines?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-3xl opacity-50">
                  <Plus className="h-10 w-10 mb-4 opacity-10" />
                  <p className="font-medium">No routines saved yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
