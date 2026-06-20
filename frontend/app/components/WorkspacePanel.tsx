"use client";

// Google Workspace surface: the RM's own inbox + calendar, with two RM-initiated writes —
// draft a follow-up email (never sends) and add a calendar event. All on the RM's account;
// nothing touches a client. Requires sign-in with the Gmail/Calendar scopes granted.

import { useEffect, useState } from "react";
import { CalendarDays, Inbox, Mail, Plus, RefreshCw, ExternalLink } from "lucide-react";
import type { MeUser, GmailMessage, CalendarEvent } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";

function emailOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from.trim();
}
function nameOf(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : from).trim();
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(d);
}
function nextHourLocal(offsetHours = 0): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1 + offsetHours);
  // value for <input type="datetime-local"> → "YYYY-MM-DDTHH:mm" in local time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WorkspacePanel() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [inbox, setInbox] = useState<GmailMessage[] | null>(null);
  const [calErr, setCalErr] = useState<string | null>(null);
  const [inboxErr, setInboxErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // compose draft
  const [draftOpen, setDraftOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [draftMsg, setDraftMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  // add event
  const [eventOpen, setEventOpen] = useState(false);
  const [evSummary, setEvSummary] = useState("");
  const [evStart, setEvStart] = useState(nextHourLocal());
  const [evEnd, setEvEnd] = useState(nextHourLocal(1));
  const [evMsg, setEvMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  const connected = !!user?.workspace?.connected;

  useEffect(() => {
    let alive = true;
    api.me().then((u) => alive && setUser(u)).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!connected) return;
    loadCalendar();
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function loadCalendar() {
    setCalErr(null);
    try {
      setEvents((await api.calendarEvents()).events);
    } catch (e) {
      setCalErr(String(e));
    }
  }
  async function loadInbox() {
    setInboxErr(null);
    try {
      setInbox((await api.gmailInbox()).messages);
    } catch (e) {
      setInboxErr(String(e));
    }
  }

  function openDraftFor(m?: GmailMessage) {
    setDraftMsg(null);
    setTo(m ? emailOf(m.from) : "");
    setSubject(m ? `Re: ${m.subject.replace(/^Re:\s*/i, "")}` : "");
    setBodyText("");
    setDraftOpen(true);
  }

  async function createDraft() {
    setBusy(true);
    setDraftMsg(null);
    try {
      const r = await api.gmailDraft({ to, subject, body: bodyText });
      setDraftMsg({ ok: true, text: "Draft created in your Gmail.", url: r.url });
    } catch (e) {
      setDraftMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function addEvent() {
    setBusy(true);
    setEvMsg(null);
    try {
      const r = await api.addCalendarEvent({
        summary: evSummary,
        start: new Date(evStart).toISOString(),
        end: new Date(evEnd).toISOString(),
      });
      setEvMsg({ ok: true, text: "Event added to your calendar.", url: r.html_link });
      loadCalendar();
    } catch (e) {
      setEvMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  // not signed in, or signed in without the workspace scopes granted
  if (!connected) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div className="max-w-md">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">Connect Gmail &amp; Calendar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {user
              ? "Sign in again to grant inbox + calendar access — reads your inbox, drafts emails (never sends), and reads/adds calendar events on your own account."
              : "Sign in with Google to connect your inbox and calendar."}
          </p>
          <Button className="mt-4" onClick={() => (window.location.href = api.loginUrl())}>
            {user ? "Grant Gmail & Calendar access" : "Sign in with Google"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-6">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold text-ink">Workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your Gmail &amp; Calendar, in the desk. Drafts are never sent; events land on your own calendar.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* calendar */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Upcoming
              </h2>
              <span className="ml-auto flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={loadCalendar} title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={() => { setEvMsg(null); setEventOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Add event
                </Button>
              </span>
            </div>
            <div className="card space-y-2 p-4">
              {calErr ? (
                <p className="text-sm text-destructive">{calErr}</p>
              ) : !events ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing on the calendar in the next two weeks.</p>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm font-medium text-foreground">{e.summary}</p>
                      <span className="text-[11px] text-muted-foreground">{fmtDateTime(e.start)}</span>
                    </div>
                    {(e.location || e.attendees.length > 0) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.location}
                        {e.location && e.attendees.length > 0 ? " · " : ""}
                        {e.attendees.length > 0 ? `${e.attendees.length} guest${e.attendees.length > 1 ? "s" : ""}` : ""}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* inbox */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inbox</h2>
              <span className="ml-auto flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={loadInbox} title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => openDraftFor()}>
                  <Mail className="h-3.5 w-3.5" /> New draft
                </Button>
              </span>
            </div>
            <div className="card space-y-2 p-4">
              {inboxErr ? (
                <p className="text-sm text-destructive">{inboxErr}</p>
              ) : !inbox ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : inbox.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inbox is empty.</p>
              ) : (
                inbox.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      {m.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      <p className="flex-1 truncate text-sm font-medium text-foreground">{nameOf(m.from)}</p>
                      <Button variant="ghost" size="sm" onClick={() => openDraftFor(m)} title="Draft follow-up">
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="truncate text-xs font-medium text-foreground/80">{m.subject}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.snippet}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* draft compose dialog */}
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Draft email</DialogTitle>
            <DialogDescription>Creates a draft in your Gmail — it is never sent automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-to">To</Label>
              <Input id="d-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-subj">Subject</Label>
              <Input id="d-subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-body">Body</Label>
              <Textarea id="d-body" rows={6} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={createDraft} disabled={busy || !to}>{busy ? "Creating…" : "Create draft"}</Button>
              {draftMsg && (
                <span className={`text-xs ${draftMsg.ok ? "text-success" : "text-destructive"}`}>
                  {draftMsg.text}{" "}
                  {draftMsg.url && (
                    <a className="inline-flex items-center gap-0.5 text-primary hover:underline" href={draftMsg.url} target="_blank" rel="noreferrer">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* add event dialog */}
      <Dialog open={eventOpen} onOpenChange={setEventOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add calendar event</DialogTitle>
            <DialogDescription>Adds to your primary Google Calendar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-sum">Title</Label>
              <Input id="e-sum" value={evSummary} onChange={(e) => setEvSummary(e.target.value)} placeholder="Review with Hubertus Schneider" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="e-start">Start</Label>
                <Input id="e-start" type="datetime-local" value={evStart} onChange={(e) => setEvStart(e.target.value)} />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="e-end">End</Label>
                <Input id="e-end" type="datetime-local" value={evEnd} onChange={(e) => setEvEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={addEvent} disabled={busy || !evSummary}>{busy ? "Adding…" : "Add event"}</Button>
              {evMsg && (
                <span className={`text-xs ${evMsg.ok ? "text-success" : "text-destructive"}`}>
                  {evMsg.text}{" "}
                  {evMsg.url && (
                    <a className="inline-flex items-center gap-0.5 text-primary hover:underline" href={evMsg.url} target="_blank" rel="noreferrer">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
