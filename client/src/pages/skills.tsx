import { useState } from "react";
import { useSkills } from "@/hooks/use-skills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Pencil, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSkillSchema, type Skill } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SkillsPage() {
  const { data: allItems, createSkill, deleteSkill, updateSkill, isCreating, isUpdating } = useSkills();
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  
  const skills = allItems?.filter(item => item.isDrill === 0);
  const drills = allItems?.filter(item => item.isDrill === 1);

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

  const startEditing = (skill: Skill) => {
    setEditingSkill(skill);
    const form = skill.isDrill === 1 ? drillForm : skillForm;
    form.reset({
      name: skill.name,
      code: skill.code,
      difficulty: skill.difficulty,
      isDrill: skill.isDrill,
    });
  };

  const cancelEditing = () => {
    const isDrill = editingSkill?.isDrill;
    setEditingSkill(null);
    if (isDrill === 1) {
      drillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 1 });
    } else {
      skillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 0 });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Tabs defaultValue="skills" className="space-y-8" onValueChange={() => cancelEditing()}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="drills">Drills</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
