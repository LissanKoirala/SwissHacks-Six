"use client";

// Sign-in + morning-briefing settings, in the sidebar footer.
// Logged-out: a "Sign in with Google" button (identity only). Logged-in: the RM's name +
// a dialog to set their phone / send hour / toggle, plus a "send me a test now" trigger.
// Degrades gracefully when Google or Twilio isn't configured (clear inline hints).

import { useEffect, useState } from "react";
import { LogOut, Bell } from "lucide-react";
import type { MeUser, SendTestResult } from "@/lib/types";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Avatar({ user }: { user: MeUser }) {
  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (user.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.picture} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-subtle text-[11px] font-semibold text-primary">
      {initials}
    </span>
  );
}

export function AccountMenu() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [config, setConfig] = useState<{ google_enabled: boolean; twilio_enabled: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [hour, setHour] = useState(9);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendTestResult | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.me().then((u) => alive && applyUser(u)).catch(() => {});
    api.authConfig().then((c) => alive && setConfig(c)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function applyUser(u: MeUser | null) {
    setUser(u);
    if (u) {
      setPhone(u.phone_e164 ?? "");
      setHour(u.briefing_hour ?? 9);
      setEnabled(u.briefing_enabled ?? false);
    }
  }

  async function save() {
    setSaving(true);
    setSavedNote(null);
    try {
      const r = await api.updateBriefing({
        phone_e164: phone.trim() || null,
        briefing_hour: hour,
        briefing_enabled: enabled,
      });
      setUser((u) => (u ? { ...u, ...r } : u));
      setSavedNote("Saved.");
    } catch (e) {
      setSavedNote(`Could not save: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setSending(true);
    setResult(null);
    try {
      // persist current settings first so the test uses the latest phone
      await save();
      setResult(await api.sendTestBriefing());
    } catch (e) {
      setResult({ ok: false, text: "", sent: false, error: String(e) });
    } finally {
      setSending(false);
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    setOpen(false);
  }

  // --- logged out ---------------------------------------------------------
  if (!user) {
    const ready = config?.google_enabled ?? false;
    return (
      <div className="border-t border-sidebar-border px-3 py-2.5">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!ready}
          title={ready ? "Sign in with Google" : "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env"}
          onClick={() => {
            window.location.href = api.loginUrl();
          }}
        >
          <GoogleGlyph />
          {ready ? "Sign in with Google" : "Sign-in (configure Google)"}
        </Button>
      </div>
    );
  }

  // --- logged in ----------------------------------------------------------
  return (
    <>
      <div className="flex items-center gap-2 border-t border-sidebar-border px-3 py-2.5">
        <Avatar user={user} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{user.name || user.email}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Bell className="h-3 w-3" />
            {user.briefing_enabled ? `Briefing · ${String(user.briefing_hour).padStart(2, "0")}:00` : "Set up briefing"}
          </button>
        </div>
        <button
          type="button"
          onClick={logout}
          title="Sign out"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Morning briefing</DialogTitle>
            <DialogDescription>
              An SMS digest of your desk, sent each morning. Advisory only — it goes to you, the RM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile number (E.164)</Label>
              <Input
                id="phone"
                placeholder="+41 79 123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hour">Send at</Label>
                <Input
                  id="hour"
                  type="number"
                  min={0}
                  max={23}
                  className="w-24"
                  value={hour}
                  onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                />
              </div>
              <label className="mb-2 flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Send daily at {String(hour).padStart(2, "0")}:00 (Europe/Zurich)
              </label>
            </div>

            {config && !config.twilio_enabled && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-[11px] text-warning ring-1 ring-inset ring-warning/20">
                Twilio isn’t configured yet — you can preview the briefing text, but the SMS won’t
                send until TWILIO_* creds are set.
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={saving} size="sm">
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button onClick={sendTest} disabled={sending} variant="outline" size="sm">
                {sending ? "Sending…" : "Send me a test now"}
              </Button>
              {savedNote && <span className="text-[11px] text-muted-foreground">{savedNote}</span>}
            </div>

            {result && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {result.sent
                    ? `Sent ✓ — can take up to a minute to arrive${result.sid ? ` · ${result.sid}` : ""}`
                    : result.status === "no_phone"
                    ? "Add a phone number to receive it"
                    : `Not sent — ${result.error ?? result.status ?? "unknown"}`}
                </p>
                {result.text && (
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground">
                    {result.text}
                  </pre>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
