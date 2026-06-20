"""The kanban board store + the Front Door pipeline (ingest → triage → execute).

State model mirrors RM Capture (agents/capture.py): the task list is the single source of truth,
written through to `data/tasks.json` (git-ignored) and replayed on boot so RM sign-offs, moves and
agent drafts survive a restart. On a FRESH world (no tasks file) we bootstrap the board by scanning
the seed inbox and the news/risk watch, so the demo opens on a populated, already-worked board.

Golden rules held here: the agent proposes (creates + drafts), the RM disposes (sign-off / move /
dismiss). Nothing here sends an email or places a trade.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from .config import DATA_DIR
from .graph.store import World
from .models import EmailMessage, Provenance, Task, TaskArtifact

TASKS_PATH = DATA_DIR / "tasks.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _next_id(world: World) -> str:
    return f"task-{len(world.tasks) + 1:04d}"


# --- persistence (write-through, like captures) -----------------------------

def _save(world: World) -> None:
    try:
        TASKS_PATH.parent.mkdir(parents=True, exist_ok=True)
        TASKS_PATH.write_text(json.dumps(
            {"tasks": [t.model_dump() for t in world.tasks],
             "inbox": [e.model_dump() for e in world.inbox]},
            ensure_ascii=False, indent=2,
        ))
    except Exception:
        pass  # persistence is best-effort; never break a request


def _load(world: World) -> bool:
    """Load persisted tasks/inbox into the world. Returns True if a non-empty file was applied."""
    try:
        raw = json.loads(TASKS_PATH.read_text())
    except FileNotFoundError:
        return False
    except Exception:
        return False
    tasks = raw.get("tasks", []) if isinstance(raw, dict) else []
    inbox = raw.get("inbox", []) if isinstance(raw, dict) else []
    applied = 0
    for t in tasks:
        try:
            world.tasks.append(Task(**t))
            applied += 1
        except Exception:
            continue
    for e in inbox:
        try:
            world.inbox.append(EmailMessage(**e))
        except Exception:
            continue
    return applied > 0


# --- CRUD -------------------------------------------------------------------

def add_task(world: World, *, title: str, detail: str = "", client_id=None,
             kind: str = "general", priority: str = "medium", source: str = "manual",
             dedup_key=None, origin: Provenance | None = None, persist: bool = True) -> Task:
    if dedup_key:
        for t in world.tasks:
            if t.dedup_key == dedup_key:
                return t  # idempotent
    task = Task(
        id=_next_id(world), client_id=client_id, title=title, detail=detail,
        kind=kind, source=source, status="backlog", priority=priority,
        created_at=_now(), updated_at=_now(), dedup_key=dedup_key, origin=origin,
    )
    world.tasks.append(task)
    if persist:
        _save(world)
    return task


def update_task(world: World, task_id: str, **changes) -> Task | None:
    task = world.task_by_id(task_id)
    if task is None:
        return None
    for k, v in changes.items():
        if v is not None and hasattr(task, k):
            setattr(task, k, v)
    task.updated_at = _now()
    _save(world)
    return task


def run_task(world: World, task_id: str) -> Task | None:
    """(Re)run the agent on a task."""
    task = world.task_by_id(task_id)
    if task is None:
        return None
    from .agents.task_executor import execute_task
    execute_task(world, task)
    _save(world)
    return task


def signoff_task(world: World, task_id: str, *, rm_name: str = "", edited_body=None) -> Task | None:
    """The RM confirm gate: approve the agent's draft → done. Optionally accept an RM hand-edit of
    the deliverable body first. Advisory only — sign-off records approval; it does not send/trade."""
    task = world.task_by_id(task_id)
    if task is None:
        return None
    if edited_body is not None and task.artifact is not None:
        task.artifact.body = edited_body
        if task.artifact.draft_email is not None:
            task.artifact.draft_email.body = edited_body
    task.status = "done"
    task.signed_off_by = rm_name or "RM"
    task.activity.append(f"Signed off by {task.signed_off_by}.")
    task.updated_at = _now()
    _save(world)
    return task


def list_tasks(world: World, *, client_id=None, status=None) -> list[Task]:
    out = world.tasks
    if client_id:
        out = [t for t in out if t.client_id == client_id]
    if status:
        out = [t for t in out if t.status == status]
    return list(out)


# --- the Front Door pipeline ------------------------------------------------

def _ensure_identity(msg: EmailMessage) -> None:
    """Fill id + provenance for a hand-dropped email (POST /ingest/email) that carries neither.
    id is content-derived so re-sending the same email is idempotent (no duplicate task)."""
    if not msg.id:
        import hashlib
        digest = hashlib.sha1(
            f"{msg.from_email}|{msg.subject}|{msg.body}".encode("utf-8")
        ).hexdigest()[:12]
        msg.id = f"sent:{digest}"
    if msg.provenance is None:
        excerpt = (msg.subject or msg.body or "").strip()[:160]
        msg.provenance = Provenance(
            source_type="crm_log", source_id=f"email:{msg.id}",
            excerpt=excerpt, timestamp=msg.received_at or _now(),
        )



def ingest_email(world: World, *, raw_email: EmailMessage | None = None, execute: bool = True,
                 use_llm: bool = True) -> list[Task]:
    """Scan the inbox (or triage one dropped-in email) → route → extract tasks → execute.
    Idempotent per email via dedup keys. Returns the tasks created this run."""
    from .agents.email_triage import extract_tasks, route_email
    from .ingestion.email import fetch_inbox

    emails = [raw_email] if raw_email is not None else fetch_inbox()
    created: list[Task] = []
    seen_inbox = {e.id for e in world.inbox}
    for msg in emails:
        if msg is None:
            continue
        _ensure_identity(msg)  # a hand-dropped email carries no id/provenance — synthesise them
        msg.client_id = route_email(world, msg)
        if msg.id not in seen_inbox:
            world.inbox.append(msg)
            seen_inbox.add(msg.id)
        drafts = extract_tasks(world, msg, use_llm=use_llm)
        for i, d in enumerate(drafts):
            dedup = f"email:{msg.id}:{i}"
            if dedup in world.task_dedup_keys():
                continue
            task = add_task(
                world, title=d["title"], detail=d["detail"], client_id=msg.client_id,
                kind=d["kind"], priority=d["priority"], source="email",
                dedup_key=dedup, origin=msg.provenance, persist=False,
            )
            if execute:
                from .agents.task_executor import execute_task
                execute_task(world, task)
            created.append(task)
    _save(world)
    return created


def ingest_news(world: World, *, execute: bool = True) -> list[Task]:
    """Run the selective news/risk watch → create + execute tasks on material signals only."""
    from .agents.news_watch import scan

    created: list[Task] = []
    existing = world.task_dedup_keys()
    for d in scan(world):
        if d["dedup_key"] in existing:
            continue
        task = add_task(
            world, title=d["title"], detail=d["detail"], client_id=d["client_id"],
            kind=d["kind"], priority=d["priority"], source="news",
            dedup_key=d["dedup_key"], origin=d.get("origin"), persist=False,
        )
        existing.add(d["dedup_key"])
        if execute:
            from .agents.task_executor import execute_task
            execute_task(world, task)
        created.append(task)
    _save(world)
    return created


def bootstrap(world: World) -> None:
    """Wire the board on boot. Replay persisted state if present; otherwise populate a fresh board
    from the seed inbox + news watch so the demo opens already-worked. Guarded — a failure here
    must never crash app start (the rest of the workbench still works)."""
    try:
        if _load(world):
            return  # persisted board is the source of truth once it exists
        # Fresh world: deterministic bootstrap. Skip LLM polish so first boot is fast + offline.
        ingest_email(world, execute=True, use_llm=False)
        ingest_news(world, execute=True)
    except Exception:
        pass
