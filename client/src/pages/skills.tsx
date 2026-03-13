import { useState } from "react";
import { useSkills } from "@/hooks/use-skills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Pencil, X, Target } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSkillSchema, type Skill } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function SkillsPage() {
  const { data: allItems, createSkill, deleteSkill, updateSkill, isCreating, isUpdating } = useSkills();
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  
  // For Connection building
  const [connName, setConnName] = useState("");
  const [connCode, setConnCode] = useState("");
  const [connSkillIds, setConnSkillIds] = useState<number[]>([]);

  const skills = allItems?.filter(item => item.isDrill === 0);
  const drills = allItems?.filter(item => item.isDrill === 1);
  const frequentConnections = allItems?.filter(item => item.isDrill === 2);

  const skillForm = useForm({
    resolver: zodResolver(insertSkillSchema),
    defaultValues: {
      name: "",
      code: "",
      difficulty: 0,
      isDrill: 0,
    }
  });

  const drillForm = useForm({
    resolver: zodResolver(insertSkillSchema),
    defaultValues: {
      name: "",
      code: "",
      difficulty: 0,
      isDrill: 1,
    }
  });

  const onSkillSubmit = async (values: any) => {
    if (editingSkill) {
      await updateSkill({ id: editingSkill.id, ...values });
      setEditingSkill(null);
    } else {
      await createSkill({ ...values, isDrill: 0 });
    }
    skillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 0 });
  };

  const onDrillSubmit = async (values: any) => {
    if (editingSkill) {
      await updateSkill({ id: editingSkill.id, ...values });
      setEditingSkill(null);
    } else {
      await createSkill({ ...values, isDrill: 1 });
    }
    drillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 1 });
  };

  const onConnectionSubmit = async () => {
    if (!connName || !connCode || connSkillIds.length === 0) return;
    
    const totalDifficulty = connSkillIds.reduce((acc, id) => {
      const s = skills?.find(sk => sk.id === id);
      return acc + (s?.difficulty || 0);
    }, 0);

    const payload = {
      name: connName.endsWith(" (FC)") ? connName : `${connName} (FC)`,
      code: connCode,
      difficulty: totalDifficulty,
      isDrill: 2,
      skillIds: connSkillIds
    };

    if (editingSkill) {
      await updateSkill({ id: editingSkill.id, ...payload });
      setEditingSkill(null);
    } else {
      await createSkill(payload);
    }
    
    setConnName("");
    setConnCode("");
    setConnSkillIds([]);
  };

  const startEditing = (skill: Skill) => {
    setEditingSkill(skill);
    if (skill.isDrill === 2) {
      setConnName(skill.name);
      setConnCode(skill.code);
      setConnSkillIds(skill.skillIds || []);
    } else if (skill.isDrill === 1) {
      drillForm.reset({
        name: skill.name,
        code: skill.code,
        difficulty: skill.difficulty,
        isDrill: skill.isDrill,
      });
    } else {
      skillForm.reset({
        name: skill.name,
        code: skill.code,
        difficulty: skill.difficulty,
        isDrill: skill.isDrill,
      });
    }
  };

  const cancelEditing = () => {
    const isDrill = editingSkill?.isDrill;
    setEditingSkill(null);
    if (isDrill === 2) {
      setConnName("");
      setConnCode("");
      setConnSkillIds([]);
    } else if (isDrill === 1) {
      drillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 1 });
    } else {
      skillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 0 });
    }
  };

  const addSkillToConn = (idStr: string) => {
    setConnSkillIds(prev => [...prev, parseInt(idStr)]);
  };

  const removeSkillFromConn = (idx: number) => {
    setConnSkillIds(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-2xl shrink-0">
          <Target className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Skills</h1>
          <p className="text-muted-foreground text-sm">Manage your skills, drills, and frequent connections.</p>
        </div>
      </div>
      <Tabs defaultValue="skills" className="space-y-8" onValueChange={() => cancelEditing()}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="drills">Drills</TabsTrigger>
          <TabsTrigger value="connections">
            <span className="hidden sm:inline">Frequent Connections</span>
            <span className="sm:hidden">Connections</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  {editingSkill ? "Edit Skill" : "Add New Skill"}
                  {editingSkill && <Button variant="ghost" size="icon" onClick={cancelEditing}><X className="h-4 w-4" /></Button>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...skillForm}>
                  <form onSubmit={skillForm.handleSubmit(onSkillSubmit)} className="space-y-4">
                    <FormField control={skillForm.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Back Tuck" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={skillForm.control} name="code" render={({ field }) => (
                      <FormItem><FormLabel>Code</FormLabel><FormControl><Input {...field} placeholder="BT" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={skillForm.control} name="difficulty" render={({ field }) => (
                      <FormItem><FormLabel>Difficulty</FormLabel><FormControl><Input type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1" disabled={isCreating || isUpdating}>
                        {editingSkill ? "Update Skill" : "Add Skill"}
                      </Button>
                      {editingSkill && <Button type="button" variant="outline" onClick={cancelEditing}>Cancel</Button>}
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Skills Library</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Difficulty</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {skills?.map((skill) => (
                      <TableRow key={skill.id} className={editingSkill?.id === skill.id ? "bg-muted/50" : ""}>
                        <TableCell className="font-medium">{skill.name}</TableCell>
                        <TableCell>{skill.code}</TableCell>
                        <TableCell>{skill.difficulty.toFixed(1)}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="icon" onClick={() => startEditing(skill)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteSkill(skill.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="drills" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  {editingSkill ? "Edit Drill" : "Add New Drill"}
                  {editingSkill && <Button variant="ghost" size="icon" onClick={cancelEditing}><X className="h-4 w-4" /></Button>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...drillForm}>
                  <form onSubmit={drillForm.handleSubmit(onDrillSubmit)} className="space-y-4">
                    <FormField control={drillForm.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Tuck Jump" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={drillForm.control} name="code" render={({ field }) => (
                      <FormItem><FormLabel>Code</FormLabel><FormControl><Input {...field} placeholder="TJ" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={drillForm.control} name="difficulty" render={({ field }) => (
                      <FormItem><FormLabel>Difficulty</FormLabel><FormControl><Input type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1" disabled={isCreating || isUpdating}>
                        {editingSkill ? "Update Drill" : "Add Drill"}
                      </Button>
                      {editingSkill && <Button type="button" variant="outline" onClick={cancelEditing}>Cancel</Button>}
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Drills Library</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Difficulty</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {drills?.map((drill) => (
                      <TableRow key={drill.id} className={editingSkill?.id === drill.id ? "bg-muted/50" : ""}>
                        <TableCell className="font-medium">{drill.name}</TableCell>
                        <TableCell>{drill.code}</TableCell>
                        <TableCell>{drill.difficulty.toFixed(1)}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="icon" onClick={() => startEditing(drill)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteSkill(drill.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="connections" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  {editingSkill ? "Edit Connection" : "Add New Connection"}
                  {editingSkill && <Button variant="ghost" size="icon" onClick={cancelEditing}><X className="h-4 w-4" /></Button>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Connection Name</label>
                    <Input value={connName} onChange={e => setConnName(e.target.value)} placeholder="e.g. Barani + Back Tuck" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Combined Code</label>
                    <Input value={connCode} onChange={e => setConnCode(e.target.value)} placeholder="e.g. Ba+BT" />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Build Sequence</label>
                    <Select onValueChange={addSkillToConn}>
                      <SelectTrigger><SelectValue placeholder="Add skill to sequence..." /></SelectTrigger>
                      <SelectContent>
                        {skills?.sort((a,b) => b.difficulty - a.difficulty).map(s => (
                          <SelectItem key={s.id} value={s.id.toString()}>
                            <span className="font-mono mr-2">{s.code}</span> {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-h-[100px] border rounded-lg p-2 bg-muted/30 flex flex-wrap gap-2 items-start">
                    {connSkillIds.map((id, idx) => {
                      const s = skills?.find(sk => sk.id === id);
                      return (
                        <Badge key={idx} variant="secondary" className="pr-1 gap-1">
                          {s?.code}
                          <button onClick={() => removeSkillFromConn(idx)}><X className="h-3 w-3" /></button>
                        </Badge>
                      );
                    })}
                    {connSkillIds.length === 0 && <span className="text-xs text-muted-foreground p-2">No skills added yet</span>}
                  </div>

                  <div className="pt-2 flex justify-between items-center">
                    <span className="text-sm font-medium">Total DD:</span>
                    <span className="font-bold text-primary">
                      {connSkillIds.reduce((acc, id) => acc + (skills?.find(s => s.id === id)?.difficulty || 0), 0).toFixed(1)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={onConnectionSubmit} disabled={isCreating || isUpdating || !connName || !connCode || connSkillIds.length === 0}>
                      {editingSkill ? "Update Connection" : "Save Connection"}
                    </Button>
                    {editingSkill && <Button variant="outline" onClick={cancelEditing}>Cancel</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Connections Library</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Sequence</TableHead><TableHead>DD</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {frequentConnections?.map((conn) => (
                      <TableRow key={conn.id} className={editingSkill?.id === conn.id ? "bg-muted/50" : ""}>
                        <TableCell className="font-medium">{conn.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {conn.skillIds?.map((sid, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] px-1">{skills?.find(s => s.id === sid)?.code || "?"}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{conn.difficulty.toFixed(1)}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="icon" onClick={() => startEditing(conn)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteSkill(conn.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
