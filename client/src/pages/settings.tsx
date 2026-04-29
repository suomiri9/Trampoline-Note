import { useState } from "react";
import { Settings as SettingsIcon, LogOut, Loader2, Mail, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export default function SettingsPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const [showSignOutAlert, setShowSignOutAlert] = useState(false);

  const displayName =
    user?.displayName ??
    (user?.firstName ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : "My Account");

  return (
    <PageLayout>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800/40 rounded-2xl shrink-0 icon-3d">
          <SettingsIcon className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your account.</p>
        </div>
      </div>

      <main className="space-y-6 max-w-2xl">
        <section className="rounded-2xl card-3d p-5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Account</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-secondary/50">
                <UserIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Name</p>
                <p className="text-sm font-medium truncate" data-testid="text-settings-name">{displayName}</p>
              </div>
            </div>
            {user?.email && (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-secondary/50">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email</p>
                  <p className="text-sm font-medium truncate" data-testid="text-settings-email">{user.email}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl card-3d p-5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Session</h2>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-11 rounded-xl text-sm text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={() => setShowSignOutAlert(true)}
            disabled={isLoggingOut}
            data-testid="btn-sign-out"
          >
            {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Sign out
          </Button>
        </section>
      </main>

      <ConfirmDialog
        open={showSignOutAlert}
        onOpenChange={setShowSignOutAlert}
        title="Sign out?"
        description="Are you sure you want to sign out of your account?"
        onConfirm={() => logout()}
        confirmLabel="Sign out"
      />
    </PageLayout>
  );
}
