import { useRef, useState } from "react";
import { Database, Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { isNativeApp } from "@/lib/platform";
import { downloadBackup, exportFromServer, parseBackup, type BackupData } from "@/lib/local-api/backup";
import { replaceData } from "@/lib/local-api/store";

/**
 * Web: export everything to a file. iOS app: explain where data lives and
 * import a web export so existing notes move onto the phone.
 */
export function DataSettings() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<BackupData | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setBusy(true);
    try {
      downloadBackup(await exportFromServer());
    } catch (err) {
      toast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (err) {
      toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await replaceData(pending);
      window.location.reload();
    } catch (err) {
      setBusy(false);
      toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <section className="rounded-2xl card-3d p-5">
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Your data</h2>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-secondary/50 mt-0.5">
          <Database className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          {isNativeApp ? (
            <>
              <p className="text-sm font-medium">Saved on this iPhone</p>
              <p className="text-xs text-muted-foreground mb-3">
                Everything stays on this device and is included in your iPhone backups. You can find the
                file in the Files app under On My iPhone › Trampoline Note.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-9 rounded-lg text-sm"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                data-testid="btn-import-data"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import from a file
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Export my data</p>
              <p className="text-xs text-muted-foreground mb-3">
                Download all your notes, scores, skills and routines as a file. You can import it into the
                iPhone app.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-9 rounded-lg text-sm"
                onClick={() => void handleExport()}
                disabled={busy}
                data-testid="btn-export-data"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export
              </Button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="Replace data on this iPhone?"
        description={
          pending
            ? `This replaces everything in the app with the file's ${pending.notes.length} notes, ${pending.scores.length} scores, ${pending.skills.length} skills and ${pending.routines.length} routines.`
            : undefined
        }
        onConfirm={() => void handleImport()}
        confirmLabel="Replace"
      />
    </section>
  );
}
