import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@workspace/rebound/components/ui/button';
import { Input } from '@workspace/rebound/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@workspace/rebound/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/rebound/components/ui/select';
import { Textarea } from '@workspace/rebound/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@workspace/rebound/components/ui/dialog';
import { Separator } from '@workspace/rebound/components/ui/separator';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@workspace/rebound/components/ui/toggle-group';
import type { DictionaryEntry } from '@workspace/api-client-react';

const NUMERIC_SHAPES = [
  { value: 'none', symbol: '—', label: 'No shape' },
  { value: 'o', symbol: 'o', label: 'Tuck' },
  { value: '<', symbol: '<', label: 'Pike' },
  { value: '/', symbol: '/', label: 'Straight' },
] as const;

type NumericShape = (typeof NUMERIC_SHAPES)[number]['value'];

export function splitNumericShape(value: string | null | undefined): {
  numeric: string | null;
  numericShape: NumericShape;
} {
  if (!value) return { numeric: null, numericShape: 'none' };
  const suffix = value.slice(-1);
  if (suffix === 'o' || suffix === '<' || suffix === '/') {
    return { numeric: value.slice(0, -1) || null, numericShape: suffix };
  }
  return { numeric: value, numericShape: 'none' };
}

export function combineNumericShape(
  numeric: string | null | undefined,
  numericShape: NumericShape,
): string | null {
  const base = numeric?.trim();
  if (!base) return null;
  return numericShape === 'none' ? base : `${base}${numericShape}`;
}

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  shortName: z.string().min(1, 'Short name is required'),
  numeric: z.string().nullable().optional(),
  numericShape: z.enum(['none', 'o', '<', '/']),
  isDrill: z.enum(['0', '1']),
  difficulty: z.coerce.number().min(0).max(30),
  description: z.string().nullable().optional(),
  archived: z.enum(['0', '1']),
  sortOrder: z.coerce.number().nullable().optional(),
});

export type EntryFormValues = z.infer<typeof formSchema>;

interface EntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: DictionaryEntry | null;
  onSubmit: (values: EntryFormValues) => void;
  isPending: boolean;
}

export function EntryForm({ open, onOpenChange, entry, onSubmit, isPending }: EntryFormProps) {
  const isEdit = !!entry;

  const form = useForm<EntryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      shortName: '',
      numeric: null,
      numericShape: 'none',
      isDrill: '0',
      difficulty: 5,
      description: null,
      archived: '0',
      sortOrder: null,
    },
  });

  useEffect(() => {
    if (open && entry) {
      const numericParts = splitNumericShape(entry.numeric);
      form.reset({
        name: entry.name,
        shortName: entry.shortName,
        numeric: numericParts.numeric,
        numericShape: numericParts.numericShape,
        isDrill: entry.isDrill === 1 ? '1' : '0',
        difficulty: entry.difficulty,
        description: entry.description ?? null,
        archived: entry.archived === 1 ? '1' : '0',
        sortOrder: entry.sortOrder ?? null,
      });
    } else if (open && !entry) {
      form.reset({
        name: '',
        shortName: '',
        numeric: null,
        numericShape: 'none',
        isDrill: '0',
        difficulty: 5,
        description: null,
        archived: '0',
        sortOrder: null,
      });
    }
  }, [open, entry, form]);

  function handleSubmit(values: EntryFormValues) {
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Entry' : 'New Dictionary Entry'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Full skill name" {...field} data-testid="input-entry-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shortName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. BF" {...field} data-testid="input-entry-short-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numeric"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Numeric Code</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          placeholder="e.g. 40"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          data-testid="input-entry-numeric"
                        />
                      </FormControl>
                      <FormField
                        control={form.control}
                        name="numericShape"
                        render={({ field: shapeField }) => (
                          <FormControl>
                            <ToggleGroup
                              type="single"
                              variant="outline"
                              value={shapeField.value}
                              onValueChange={(value) => {
                                if (value) shapeField.onChange(value);
                              }}
                              aria-label="Numeric code shape"
                              className="shrink-0"
                            >
                              {NUMERIC_SHAPES.map((shape) => (
                                <ToggleGroupItem
                                  key={shape.value}
                                  value={shape.value}
                                  aria-label={shape.label}
                                  title={shape.label}
                                  className="size-10 px-0 text-base"
                                  data-testid={`button-numeric-shape-${shape.value}`}
                                >
                                  {shape.symbol}
                                </ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                          </FormControl>
                        )}
                      />
                    </div>
                    <FormDescription>
                      Optional FIG numeric code and shape: tuck (o), pike (&lt;), or straight (/)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="isDrill"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-entry-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">Skill</SelectItem>
                        <SelectItem value="1">Drill</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Difficulty (0–30)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        step={0.1}
                        {...field}
                        data-testid="input-entry-difficulty"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional description of this skill or drill"
                      className="resize-none"
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      data-testid="textarea-entry-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Optional"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        data-testid="input-entry-sort-order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="archived"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-entry-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">Active</SelectItem>
                        <SelectItem value="1">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-entry">
                {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Entry'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
