// Public privacy policy page (no login required) — linked from the WHOOP
// developer app's OAuth consent screen, which requires a privacy policy URL.

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "What this app is",
    body: [
      "Trampoline Training Log is a personal training diary for trampoline athletes. You create an account with an email address and password and log your own training sessions, skills, routines and competition scores.",
    ],
  },
  {
    title: "What we store",
    body: [
      "Your account details: email address, display name and a securely hashed password (we never store your password in plain text).",
      "The training content you enter: notes, skills, drills, routines, scores and related settings.",
      "Session cookies that keep you signed in.",
    ],
  },
  {
    title: "WHOOP data",
    body: [
      "If you choose to connect your WHOOP account, you sign in on WHOOP's own website — this app never sees your WHOOP password.",
      "With your permission, the app reads your WHOOP recovery, sleep, cycle (strain), workout and profile data to show charts on your personal dashboard. Access is read-only: the app never writes anything to your WHOOP account.",
      "The secure access tokens WHOOP issues are stored server-side, linked only to your account, and are never shared with other users or third parties. WHOOP chart data is only held in short-lived server memory (a few minutes) to reduce repeated requests — it is not saved to the database.",
      "You can disconnect WHOOP at any time with the Disconnect button on the WHOOP page, which deletes the stored tokens. You can also revoke this app's access from your WHOOP account settings.",
    ],
  },
  {
    title: "What we don't do",
    body: [
      "We do not sell, rent or share your personal data or your WHOOP data with anyone.",
      "We do not use your data for advertising or profiling.",
      "Your data is visible only to you when signed in to your own account.",
    ],
  },
  {
    title: "Email",
    body: [
      "We only send email when you request it — for example a password-reset link. No marketing email.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can edit or delete the content you have logged at any time from within the app.",
      "You can disconnect WHOOP at any time as described above.",
      "If you want your account and all associated data removed, contact the app operator and it will be deleted.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-[100svh] bg-mesh px-5 py-10 flex justify-center">
      <div className="w-full max-w-2xl">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1" data-testid="text-privacy-eyebrow">
          Trampoline Training Log
        </p>
        <h1 className="text-2xl font-bold mb-2" data-testid="text-privacy-title">
          Privacy Policy
        </h1>
        <p className="text-xs font-mono text-muted-foreground mb-8" data-testid="text-privacy-updated">
          Last updated: 24 July 2026
        </p>

        {SECTIONS.map((s) => (
          <section key={s.title} className="mb-6">
            <h2 className="font-semibold mb-2">{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-2">
                {p}
              </p>
            ))}
          </section>
        ))}

        <p className="text-xs font-mono text-muted-foreground/70 mt-10">
          Questions? Contact the app operator.
        </p>
      </div>
    </div>
  );
}
