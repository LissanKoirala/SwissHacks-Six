"use client";

import { useEffect, useRef, useState } from "react";
import type { CrmGraph as CrmGraphData, CrmNode } from "@/lib/types";
import { api } from "@/lib/api";

/* ----------------------------------------------------------------- meta --- */

type NodeType = CrmNode["type"];

const TYPE_LABELS: Record<NodeType, string> = {
  rm: "Relationship Mgr",
  client: "Client",
  person: "Person",
  medium: "Medium",
  interaction: "Interaction",
  theme: "Theme",
};

const TYPE_COLOR: Record<NodeType, string> = {
  rm: "#e0b3ff",
  client: "#ffd166",
  person: "#4cc9f0",
  medium: "#76c893",
  interaction: "#9aa0b5",
  theme: "#f08080",
};

const TYPE_ORDER: NodeType[] = [
  "rm",
  "client",
  "person",
  "medium",
  "interaction",
  "theme",
];

/* ---- mutable simulation node (data + physics) ---- */
interface SimNode extends CrmNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  fixed?: boolean;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
}

/* All mutable simulation state lives here so the rAF loop reads it via one ref. */
interface SimState {
  nodes: SimNode[];
  links: SimLink[];
  adj: Map<string, Set<string>>;
  view: { x: number; y: number; k: number };
  alpha: number;
  hoverNode: SimNode | null;
  selNode: SimNode | null;
  dragNode: SimNode | null;
  panning: boolean;
  last: { x: number; y: number };
  dragMoved: boolean;
  query: string;
  enabled: Set<NodeType>;
  W: number;
  H: number;
  DPR: number;
  tooltip: { x: number; y: number; text: string } | null;
}

/* physics constants — ported 1:1 from build_graph.py */
const REPULSE = 5200;
const SPRING = 0.012;
const LINK_LEN = 70;
const CENTER = 0.012;
const DAMP = 0.86;

/* ----------------------------------------------------------- component --- */

export function CrmGraph({ clientId }: { clientId: string }) {
  const [data, setData] = useState<CrmGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // React-visible UI state (mirrors parts of the sim for legend / detail panel).
  const [enabledTypes, setEnabledTypes] = useState<Set<NodeType>>(
    () => new Set(TYPE_ORDER)
  );
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [query, setQuery] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<SimState | null>(null);
  const rafRef = useRef<number | null>(null);

  // Keep the live sim's filter/query in sync with React control state.
  useEffect(() => {
    if (simRef.current) {
      simRef.current.enabled = enabledTypes;
      simRef.current.alpha = Math.max(simRef.current.alpha, 0.25);
    }
  }, [enabledTypes]);

  useEffect(() => {
    if (simRef.current) simRef.current.query = query.trim().toLowerCase();
  }, [query]);

  // Fetch the graph for this client.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    setSelected(null);
    api
      .graph(clientId)
      .then((g) => alive && setData(g))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  // Build the simulation + run the render loop. Rebuilds on clientId/data change.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!data || !container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ---- size to container (not window) ----
    const initW = container.clientWidth || 800;
    const initH = container.clientHeight || 560;

    // ---- build node/link objects ----
    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: initW / 2 + (Math.random() - 0.5) * Math.min(initW, initH) * 0.8,
      y: initH / 2 + (Math.random() - 0.5) * Math.min(initW, initH) * 0.8,
      vx: 0,
      vy: 0,
      r: 4 + Math.min(14, Math.sqrt(n.degree || 1) * 2.4),
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = data.links
      .map((l) => ({ source: byId.get(l.source)!, target: byId.get(l.target)! }))
      .filter((l) => l.source && l.target);

    // adjacency for highlight + connection counts
    const adj = new Map<string, Set<string>>(
      nodes.map((n) => [n.id, new Set<string>()])
    );
    links.forEach((l) => {
      adj.get(l.source.id)!.add(l.target.id);
      adj.get(l.target.id)!.add(l.source.id);
    });

    const sim: SimState = {
      nodes,
      links,
      adj,
      view: { x: 0, y: 0, k: 1 },
      alpha: 1,
      hoverNode: null,
      selNode: null,
      dragNode: null,
      panning: false,
      last: { x: 0, y: 0 },
      dragMoved: false,
      query: query.trim().toLowerCase(),
      enabled: enabledTypes,
      W: initW,
      H: initH,
      DPR: 1,
      tooltip: null,
    };
    simRef.current = sim;

    // ---- canvas sizing against the container ----
    function resize() {
      if (!canvas || !container || !ctx) return;
      const DPR = window.devicePixelRatio || 1;
      const W = container.clientWidth || initW;
      const H = container.clientHeight || initH;
      sim.DPR = DPR;
      sim.W = W;
      sim.H = H;
      canvas.width = Math.max(1, Math.floor(W * DPR));
      canvas.height = Math.max(1, Math.floor(H * DPR));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    // ---- view transform helpers ----
    const toScreen = (p: { x: number; y: number }) => ({
      x: p.x * sim.view.k + sim.view.x,
      y: p.y * sim.view.k + sim.view.y,
    });
    const toWorld = (sx: number, sy: number) => ({
      x: (sx - sim.view.x) / sim.view.k,
      y: (sy - sim.view.y) / sim.view.k,
    });
    const visible = (n: SimNode) => sim.enabled.has(n.type);

    // pointer position relative to the canvas (container-local, not window)
    function localPos(e: { clientX: number; clientY: number }) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function nodeAt(sx: number, sy: number): SimNode | null {
      const w = toWorld(sx, sy);
      let best: SimNode | null = null;
      let bd = Infinity;
      for (const n of sim.nodes) {
        if (!visible(n)) continue;
        const dx = n.x - w.x;
        const dy = n.y - w.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < n.r + 6 / sim.view.k && d < bd) {
          bd = d;
          best = n;
        }
      }
      return best;
    }

    function selectNode(n: SimNode | null) {
      sim.selNode = n;
      setSelected(n);
    }

    // ---- force simulation tick ----
    function tick() {
      if (sim.alpha < 0.005) sim.alpha = 0.005;
      const ns = sim.nodes;
      // repulsion (O(n^2); fine for this size)
      for (let i = 0; i < ns.length; i++) {
        const a = ns[i];
        if (!visible(a)) continue;
        for (let j = i + 1; j < ns.length; j++) {
          const b = ns[j];
          if (!visible(b)) continue;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          if (d2 > 90000) continue;
          const f = REPULSE / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx * sim.alpha;
          a.vy += fy * sim.alpha;
          b.vx -= fx * sim.alpha;
          b.vy -= fy * sim.alpha;
        }
      }
      // springs
      for (const l of sim.links) {
        const a = l.source;
        const b = l.target;
        if (!visible(a) || !visible(b)) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - LINK_LEN) * SPRING;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx * sim.alpha;
        a.vy += fy * sim.alpha;
        b.vx -= fx * sim.alpha;
        b.vy -= fy * sim.alpha;
      }
      // centering + integrate
      for (const n of sim.nodes) {
        if (!visible(n)) continue;
        n.vx += (sim.W / 2 - n.x) * CENTER * sim.alpha;
        n.vy += (sim.H / 2 - n.y) * CENTER * sim.alpha;
        if (n === sim.dragNode) continue;
        n.vx *= DAMP;
        n.vy *= DAMP;
        n.x += n.vx;
        n.y += n.vy;
      }
      sim.alpha *= 0.992;
    }

    // ---- render ----
    function render() {
      tick();
      if (!ctx) return;
      ctx.clearRect(0, 0, sim.W, sim.H);
      ctx.save();

      const focus = sim.selNode || sim.hoverNode;
      const neigh = focus ? sim.adj.get(focus.id) : null;

      // links
      ctx.lineWidth = 1;
      for (const l of sim.links) {
        const a = l.source;
        const b = l.target;
        if (!visible(a) || !visible(b)) continue;
        const pa = toScreen(a);
        const pb = toScreen(b);
        const active = focus && (a === focus || b === focus);
        ctx.strokeStyle = active
          ? "rgba(122,162,247,.55)"
          : "rgba(120,130,170,.13)";
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // nodes
      for (const n of sim.nodes) {
        if (!visible(n)) continue;
        const p = toScreen(n);
        const r = n.r * Math.sqrt(sim.view.k);
        let dim = false;
        let hit = true;
        if (focus) dim = !(n === focus || (neigh && neigh.has(n.id)));
        if (sim.query) {
          hit =
            n.label.toLowerCase().includes(sim.query) ||
            (n.detail || "").toLowerCase().includes(sim.query);
        }

        ctx.globalAlpha = dim ? 0.18 : sim.query && !hit ? 0.12 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color || TYPE_COLOR[n.type] || "#888";
        ctx.fill();
        if (sim.query && hit) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#fff";
          ctx.stroke();
        }
        if (n === sim.selNode) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#fff";
          ctx.stroke();
        }

        // labels: big nodes, on focus, or zoomed in
        const showLabel =
          (n.r > 7 ||
            sim.view.k > 1.4 ||
            n === focus ||
            (neigh && neigh.has(n.id))) &&
          !dim;
        if (showLabel) {
          ctx.globalAlpha = dim ? 0.2 : 0.92;
          ctx.fillStyle = "#c0caf5";
          ctx.font = `${Math.max(
            10,
            Math.min(14, 10 * sim.view.k)
          )}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.label, p.x, p.y - r - 4);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    }
    rafRef.current = requestAnimationFrame(render);

    // gentle reheat so it settles nicely
    const reheat = window.setTimeout(() => {
      sim.alpha = 1;
    }, 50);

    // ---- pointer interaction ----
    function onMouseDown(e: MouseEvent) {
      const pos = localPos(e);
      const n = nodeAt(pos.x, pos.y);
      sim.dragMoved = false;
      if (n) {
        sim.dragNode = n;
        n.fixed = true;
      } else {
        sim.panning = true;
      }
      sim.last = { x: e.clientX, y: e.clientY };
    }

    function onMouseMove(e: MouseEvent) {
      if (sim.dragNode) {
        const pos = localPos(e);
        const w = toWorld(pos.x, pos.y);
        sim.dragNode.x = w.x;
        sim.dragNode.y = w.y;
        sim.dragNode.vx = 0;
        sim.dragNode.vy = 0;
        sim.alpha = Math.max(sim.alpha, 0.3);
        sim.dragMoved = true;
      } else if (sim.panning) {
        sim.view.x += e.clientX - sim.last.x;
        sim.view.y += e.clientY - sim.last.y;
        sim.last = { x: e.clientX, y: e.clientY };
        sim.dragMoved = true;
      } else {
        const pos = localPos(e);
        const n = nodeAt(pos.x, pos.y);
        sim.hoverNode = n;
        if (n) {
          const text =
            n.label +
            (n.type === "interaction" && n.summary ? ` — ${n.summary}` : "");
          setTooltip({ x: pos.x + 12, y: pos.y + 12, text });
          if (canvas) canvas.style.cursor = "pointer";
        } else {
          setTooltip(null);
          if (canvas) canvas.style.cursor = "grab";
        }
      }
    }

    function onMouseUp(e: MouseEvent) {
      if (sim.dragNode) {
        sim.dragNode.fixed = false;
        if (!sim.dragMoved) selectNode(sim.dragNode);
        sim.dragNode = null;
      } else if (sim.panning && !sim.dragMoved) {
        const pos = localPos(e);
        const n = nodeAt(pos.x, pos.y);
        selectNode(n || null);
      }
      sim.panning = false;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const pos = localPos(e);
      const w = toWorld(pos.x, pos.y);
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      sim.view.k = Math.max(0.15, Math.min(5, sim.view.k * f));
      sim.view.x = pos.x - w.x * sim.view.k;
      sim.view.y = pos.y - w.y * sim.view.k;
    }

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(reheat);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, clientId]);

  function toggleType(t: NodeType) {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function resetView() {
    const sim = simRef.current;
    if (sim) {
      sim.view = { x: 0, y: 0, k: 1 };
      sim.alpha = 1;
      sim.selNode = null;
    }
    setSelected(null);
    setQuery("");
  }

  // type counts for the legend
  const counts: Partial<Record<NodeType, number>> = {};
  if (data) {
    for (const n of data.nodes) counts[n.type] = (counts[n.type] || 0) + 1;
  }
  const legendTypes = TYPE_ORDER.filter((t) => (counts[t] || 0) > 0);

  /* ------------------------------------------------------------- render --- */

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            CRM knowledge graph
          </p>
          <h2 className="mt-1 text-sm font-medium leading-snug text-ink-soft">
            Client relationship web · people, channels &amp; recurring themes
          </h2>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          autoComplete="off"
          className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </header>

      {/* dark canvas panel (matches the source's Obsidian-style look) */}
      <div
        ref={containerRef}
        className="relative h-[560px] w-full select-none bg-slate-900"
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">
            Loading knowledge graph…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-rose-300">
            Could not load knowledge graph: {error}
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-grab active:cursor-grabbing"
        />

        {/* legend + reset — top-left floating panel */}
        {data && !loading && (
          <div className="pointer-events-auto absolute left-4 top-4 w-56 rounded-xl border border-slate-700/60 bg-slate-800/80 p-3 text-slate-200 shadow-pop backdrop-blur">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Node types
            </p>
            <div className="flex flex-col gap-1.5">
              {legendTypes.map((t) => (
                <label
                  key={t}
                  className="flex cursor-pointer select-none items-center gap-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={enabledTypes.has(t)}
                    onChange={() => toggleType(t)}
                    className="accent-accent"
                  />
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: TYPE_COLOR[t] }}
                  />
                  <span className="flex-1">{TYPE_LABELS[t]}</span>
                  <span className="text-[11px] text-slate-400">
                    {counts[t]}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={resetView}
              className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-700/60 px-2 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-accent hover:text-white"
            >
              Reset view
            </button>
          </div>
        )}

        {/* hint — bottom-right */}
        {data && !loading && (
          <div className="pointer-events-none absolute bottom-3 right-4 text-right text-[11px] leading-relaxed text-slate-500">
            drag node · scroll zoom · drag bg pan · click node
          </div>
        )}

        {/* detail panel — bottom-left, on selection */}
        {selected && (
          <div className="pointer-events-auto absolute bottom-4 left-4 max-h-[42%] w-80 overflow-auto rounded-xl border border-slate-700/60 bg-slate-800/90 p-4 text-slate-200 shadow-pop backdrop-blur scroll-thin">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="inline-block rounded-full bg-slate-900/70 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400"
                style={{ color: TYPE_COLOR[selected.type] }}
              >
                {TYPE_LABELS[selected.type] || selected.type}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (simRef.current) simRef.current.selNode = null;
                  setSelected(null);
                }}
                className="text-slate-400 transition-colors hover:text-white"
                aria-label="Close detail"
              >
                ×
              </button>
            </div>
            <h3 className="text-sm font-semibold text-white">
              {selected.label}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {selected.type === "interaction"
                ? [
                    selected.date,
                    selected.medium,
                    selected.contact,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : `${simRef.current?.adj.get(selected.id)?.size ?? 0} connections`}
            </p>
            {selected.detail && (
              <p className="mt-2 text-[13px] leading-relaxed text-slate-200">
                {selected.detail}
              </p>
            )}
          </div>
        )}

        {/* hover tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-20 max-w-[280px] rounded-md border border-slate-600 bg-slate-950/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-pop"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </section>
  );
}
