"use client";

// Per-client Workspace: the RM's own Gmail + Calendar, scoped to ONE client by their email
// address (set via WORKSPACE_TEST_BASE plus-addressing, or CLIENT_EMAIL_<ID>). Reads this
// client's correspondence + meetings and drafts to them — drafts are NEVER sent (golden rule).

import { useEffect, useState } from "react";
import { CalendarDays, Inbox, Mail, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
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

export function ClientWorkspace({
  clientId,
  clientName,
  contextBody = "",
}: {
  clientId: string;
  clientName: string;
  contextBody?: string;
}) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [messages, setMessages] = useState<GmailMessage[] | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [inboxErr, setInboxErr] = useState<string | null>(null);
  const [calErr, setCalErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftOpen, setDraftOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [draftMsg, setDraftMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  const connected = !!user?.workspace?.connected;

  useEffect(() => {
    let alive = true;
    api.me().then((u) => alive && setUser(u)).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!connected) return;
    loadInbox();
    loadCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, clientId]);

  async function loadInbox() {
    setInboxErr(null);
    try {
      const r = await api.clientInbox(clientId);
      setEmail(r.email);
      setMessages(r.messages);
    } catch (e) {
      setInboxErr(String(e));
    }
  }
  async function loadCalendar() {
    setCalErr(null);
    try {
      const r = await api.clientCalendar(clientId);
      setEmail(r.email);
      setEvents(r.events);
    } catch (e) {
      setCalErr(String(e));
    }
  }

  function openDraft() {
    setSubject(`Following up — ${clientName.split(" ").slice(-1)[0]}`);
    setBodyText(contextBody || "");
    setDraftMsg(null);
    setDraftOpen(true);
  }

  async function submitDraft() {
    setBusy(true);
    setDraftMsg(null);
    try {
      const r = await api.clientDraft(clientId, { subject, body: bodyText });
      setDraftMsg({ ok: true, text: "Draft saved to Gmail (not sent).", url: r.url });
    } catch (e) {
      setDraftMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="grid h-40 place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!connected) {
    return (
      <div className="card grid place-items-center px-8 py-12 text-center">
        <div className="max-w-md">
          <Mail className="mx-auto h-7 w-7 text-muted-foreground" />
          <h3 className="mt-3 text-base font-semibold text-foreground">Connect Gmail &amp; Calendar</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {user
              ? `Grant inbox + calendar access to see ${clientName}'s emails and meetings, and draft to them (never sends).`
              : "Sign in with Google to read this client's correspondence and meetings."}
          </p>
          <Button className="mt-4" onClick={() => (window.location.href = api.loginUrl())}>
            {user ? "Grant Gmail & Calendar access" : "Sign in with Google"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Filtering your Gmail &amp; Calendar to{" "}
          <span className="font-mono text-foreground">{email || "this client"}</span>.
          Drafts are saved, never sent.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadInbox(); loadCalendar(); }}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={openDraft}>
            <Mail className="mr-1 h-3.5 w-3.5" /> Draft email to {clientName.split(" ")[0]}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* emails with this client */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Correspondence
            </h3>
          </div>
          {inboxErr ? (
            <div className="card p-4 text-sm text-destructive">{inboxErr}</div>
          ) : !messages ? (
            <div className="card grid h-24 place-items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="card p-4 text-sm text-muted-foreground">
              No emails to or from this client yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => (
                <li key={m.id} className="card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {nameOf(m.from)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{m.date}</span>
                  </div>
                  <p className="truncate text-sm text-foreground">{m.subject}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{m.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* meetings with this client */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Upcoming meetings
            </h3>
          </div>
          {calErr ? (
            <div className="card p-4 text-sm text-destructive">{calErr}</div>
          ) : !events ? (
            <div className="card grid h-24 place-items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="card p-4 text-sm text-muted-foreground">
              No upcoming meetings with this client in the next fortnight.
            </div>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="card flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{e.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(e.start)}
                      {e.location ? ` · ${e.location}` : ""}
                    </p>
                  </div>
                  {e.html_link && (
                    <a
                      href={e.html_link}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Draft email to {clientName}</DialogTitle>
            <DialogDescription>
              Saved to your Gmail drafts — never sent. To:{" "}
              <span className="font-mono">{email}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cw-subject">Subject</Label>
              <Input id="cw-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cw-body">Message</Label>
              <Textarea
                id="cw-body"
                rows={9}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Write the note… (prefilled from the dialogue suggestion when available)"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={submitDraft} disabled={busy} size="sm">
                {busy ? "Saving…" : "Save draft"}
              </Button>
              {draftMsg && (
                <span className={`text-[11px] ${draftMsg.ok ? "text-muted-foreground" : "text-destructive"}`}>
                  {draftMsg.text}{" "}
                  {draftMsg.url && (
                    <a href={draftMsg.url} target="_blank" rel="noreferrer" className="underline">
                      open in Gmail
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
