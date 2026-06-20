"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  MessageSquare,
  Minus,
  Plus,
  RotateCcw,
  Tag,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CrmGraph as CrmGraphData, CrmNode } from "@/lib/types";
import { api } from "@/lib/api";

/* ----------------------------------------------------------------- meta --- */

type NodeType = CrmNode["type"];

const TYPE_LABELS: Record<NodeType, string> = {
  rm: "Relationship Manager",
  client: "Client",
  person: "Person",
  medium: "Channel",
  interaction: "Interaction",
  theme: "Theme",
};

// Wordsmith-Blue-led canvas palette (the dark surface keeps its own fills; these
// stay legible on the near-black canvas). Blue leads the relationship core
// (RM/client); distinct semantic categories take the brand accents — teal for
// channels, purple for themes — with neutral greys for structural nodes.
const TYPE_COLOR: Record<NodeType, string> = {
  rm: "#2f7ce6", // Wordsmith Blue (primary, dark)
  client: "#5b9bf0", // lighter Wordsmith Blue — the focal client
  person: "#9a9aa2", // neutral grey
  medium: "#1aa899", // teal accent — channels (distinct category)
  interaction: "#6e6e76", // neutral grey
  theme: "#9d4dff", // purple accent — recurring themes (distinct category)
};

// Per-type Lucide glyph for the legend chips (replaces emoji entirely).
const TYPE_ICON: Record<NodeType, LucideIcon> = {
  rm: Users,
  client: User,
  person: User,
  medium: MessageSquare,
  interaction: Activity,
  theme: Tag,
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
  strength: number; // 0..1 → line width + alpha
  recency: number; // 0..1 → warmth/glow (1 = most recent)
}

/* Loaded avatar bitmap + its load state, keyed by node id. */
interface Avatar {
  img: HTMLImageElement;
  ready: boolean;
  failed: boolean;
}

/* All mutable simulation state lives here so the rAF loop reads it via one ref. */
interface SimState {
  nodes: SimNode[];
  links: SimLink[];
  adj: Map<string, Set<string>>;
  avatars: Map<string, Avatar>;
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

/* Coloured ring around each circular avatar, per node type. */
function initials(n: SimNode): string {
  const base = (n.first_name || n.label || "").trim();
  if (!base) return "?";
  const words = base.split(/\s+/);
  return (
    words.length > 1
      ? words[0][0] + words[words.length - 1][0]
      : base.slice(0, 2)
  ).toUpperCase();
}

/* ---- canvas-drawable Lucide glyphs (24×24 viewBox, stroked) ----
 * Raw SVG path strings lifted from lucide-react so the same icons can be
 * stroked onto the 2D canvas — no emoji. Drawn centred + scaled per node. */
const CANVAS_ICON: Partial<Record<NodeType, string[]>> = {
  // MessageSquare
  medium: [
    "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
  ],
  // Activity
  interaction: [
    "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
  ],
  // Tag (path only — the decorative dot is dropped for canvas clarity)
  theme: [
    "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",
  ],
};

/* Stroke a cached Path2D glyph centred at (cx, cy), scaled so the 24px viewBox
 * fits within `size`. Colour comes from the caller (dark-canvas-legible). */
const PATH_CACHE = new Map<string, Path2D>();
function path2d(d: string): Path2D {
  let p = PATH_CACHE.get(d);
  if (!p) {
    p = new Path2D(d);
    PATH_CACHE.set(d, p);
  }
  return p;
}
function drawCanvasIcon(
  ctx: CanvasRenderingContext2D,
  paths: string[],
  cx: number,
  cy: number,
  size: number,
  stroke: string
) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  for (const d of paths) ctx.stroke(path2d(d));
  ctx.restore();
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
  const [zoomPct, setZoomPct] = useState(100); // live zoom-% badge

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<SimState | null>(null);
  const rafRef = useRef<number | null>(null);
  const visibleRef = useRef(true); // true while this tab is on-screen

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

  // Track whether this graph tab is on-screen so the keyboard zoom only hijacks
  // Ctrl/Cmd +/- when the user is actually looking at the graph.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting && entry.intersectionRatio > 0;
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [data]);

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
      .map((l) => ({
        source: byId.get(l.source)!,
        target: byId.get(l.target)!,
        strength: typeof l.strength === "number" ? l.strength : 0.85,
        recency: typeof l.recency === "number" ? l.recency : 0.85,
      }))
      .filter((l) => l.source && l.target);

    // ---- preload circular avatars (person / rm) ----
    const avatars = new Map<string, Avatar>();
    for (const n of nodes) {
      if (!n.avatar) continue;
      const img = new Image();
      const rec: Avatar = { img, ready: false, failed: false };
      img.onload = () => {
        rec.ready = true;
        sim.alpha = Math.max(sim.alpha, 0.05); // nudge a repaint
      };
      img.onerror = () => {
        rec.failed = true;
      };
      img.src = n.avatar;
      avatars.set(n.id, rec);
    }

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
      avatars,
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

      // links — width + alpha from strength, warmth/glow from recency.
      ctx.lineCap = "round";
      for (const l of sim.links) {
        const a = l.source;
        const b = l.target;
        if (!visible(a) || !visible(b)) continue;
        const pa = toScreen(a);
        const pb = toScreen(b);
        const active = focus && (a === focus || b === focus);
        const dimLink = focus && !active;

        const s = l.strength; // 0..1
        const rec = l.recency; // 0..1 (1 = most recent → warmer)
        // recent contact warms cool slate (210°) toward warm amber (38°)
        const hue = 210 - 172 * rec;
        const sat = 24 + 56 * rec;
        const baseA = (0.16 + 0.5 * s) * (0.45 + 0.55 * rec);
        const alpha = active ? Math.min(0.95, baseA + 0.4) : dimLink ? 0.06 : baseA;

        ctx.lineWidth = (0.6 + 2.6 * s) * (active ? 1.6 : 1);
        // warm recent edges glow softly
        if (rec > 0.6 && !dimLink) {
          ctx.shadowColor = `hsla(${hue}, ${sat}%, 62%, ${0.5 * rec})`;
          ctx.shadowBlur = 6 * rec * Math.sqrt(sim.view.k);
        } else {
          ctx.shadowBlur = 0;
        }
        // Active edges (touching the focused node) lead on Wordsmith Blue so the
        // selection reads as the primary accent; idle edges keep the recency
        // warmth ramp as an ambient cue.
        ctx.strokeStyle = active
          ? `hsla(215, 79%, 62%, ${alpha})`
          : `hsla(${hue}, ${sat}%, ${56 + 12 * rec}%, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

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

        const nodeAlpha = dim ? 0.18 : sim.query && !hit ? 0.12 : 1;
        ctx.globalAlpha = nodeAlpha;
        const ring = n.color || TYPE_COLOR[n.type] || "#888";
        const av = sim.avatars.get(n.id);
        const hasFace = n.type === "rm" || n.type === "person";

        if (hasFace) {
          // ---- circular avatar (image or initials) with a coloured ring ----
          const ir = r * 0.92; // inner photo radius, leaving room for the ring
          if (av && av.ready) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, ir, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            // cover-fit the (square) photo into the circle
            const s2 = ir * 2;
            ctx.drawImage(av.img, p.x - ir, p.y - ir, s2, s2);
            ctx.restore();
          } else {
            // initials fallback (loading or missing/failed image)
            ctx.beginPath();
            ctx.arc(p.x, p.y, ir, 0, Math.PI * 2);
            ctx.fillStyle = ring;
            ctx.globalAlpha = nodeAlpha * 0.28;
            ctx.fill();
            ctx.globalAlpha = nodeAlpha;
            ctx.fillStyle = "#16140f";
            ctx.font = `600 ${Math.max(8, ir * 0.95)}px ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(initials(n), p.x, p.y + 0.5);
            ctx.textBaseline = "alphabetic";
          }
          // coloured ring around the avatar
          ctx.beginPath();
          ctx.arc(p.x, p.y, ir, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1.5, r * 0.16);
          ctx.strokeStyle = ring;
          ctx.stroke();
        } else {
          // ---- plain coloured disc for non-face nodes ----
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = ring;
          ctx.fill();
          // Lucide glyph (mapped from node type) on medium / theme / interaction
          // nodes — never the raw backend emoji.
          const glyph = CANVAS_ICON[n.type];
          if (glyph && r > 6) {
            ctx.globalAlpha = nodeAlpha;
            drawCanvasIcon(ctx, glyph, p.x, p.y, r * 1.05, "#16140f");
          }
        }

        if (sim.query && hit) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#ece9e2"; // warm paper foreground (dark)
          ctx.stroke();
        }
        if (n === sim.selNode) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + (hasFace ? 2 : 0), 0, Math.PI * 2);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#2f7ce6"; // Wordsmith Blue — active/selected ring
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
          ctx.fillStyle = "#d8d3c8"; // warm paper, slightly muted
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

      // keep the live zoom badge in sync (only push to React on change)
      const pct = Math.round(sim.view.k * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        setZoomPct(pct);
      }

      rafRef.current = requestAnimationFrame(render);
    }
    let lastPct = 100;
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

    // Zoom by a factor about a screen-space anchor (default: viewport centre).
    function zoomBy(f: number, anchor?: { x: number; y: number }) {
      const pos = anchor || { x: sim.W / 2, y: sim.H / 2 };
      const w = toWorld(pos.x, pos.y);
      sim.view.k = Math.max(0.15, Math.min(5, sim.view.k * f));
      sim.view.x = pos.x - w.x * sim.view.k;
      sim.view.y = pos.y - w.y * sim.view.k;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, localPos(e));
    }

    // Ctrl/Cmd + '='/'+' zoom in, '-'/'_' zoom out. Only intercept the browser's
    // native zoom while THIS graph tab is actually visible on screen.
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (!visibleRef.current) return;
      const k = e.key;
      if (k === "=" || k === "+") {
        e.preventDefault();
        zoomBy(1.18);
      } else if (k === "-" || k === "_") {
        e.preventDefault();
        zoomBy(1 / 1.18);
      }
    }

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown, { passive: false });

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(reheat);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
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

  // Zoom from the badge buttons (about the viewport centre), same clamp as wheel/keys.
  function zoomCentre(f: number) {
    const sim = simRef.current;
    if (!sim) return;
    const cx = sim.W / 2;
    const cy = sim.H / 2;
    const wx = (cx - sim.view.x) / sim.view.k;
    const wy = (cy - sim.view.y) / sim.view.k;
    sim.view.k = Math.max(0.15, Math.min(5, sim.view.k * f));
    sim.view.x = cx - wx * sim.view.k;
    sim.view.y = cy - wy * sim.view.k;
    sim.alpha = Math.max(sim.alpha, 0.05);
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            CRM Knowledge Graph
          </p>
          <h2 className="mt-1 text-sm text-foreground">
            People, channels and <span className="hl">recurring themes</span> for
            this client
          </h2>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          autoComplete="off"
          className="w-48 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </header>

      {/* dark canvas panel (intrinsic 3D-style surface, dark in both themes) */}
      <div
        ref={containerRef}
        className="relative h-[560px] w-full select-none bg-[#14110b]"
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-[#9c9488]">
            Building the relationship graph…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-[#d65c52]">
            Could not load the knowledge graph: {error}
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-grab active:cursor-grabbing"
        />

        {/* zoom controls + live % badge — top-right floating */}
        {data && !loading && (
          <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-1 rounded-md border border-border bg-popover/90 px-1.5 py-1 text-popover-foreground backdrop-blur-[2px]">
            <button
              type="button"
              onClick={() => zoomCentre(1 / 1.18)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Zoom out"
              title="Zoom out (Ctrl/⌘ −)"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span
              className="min-w-[3.25rem] text-center text-xs font-medium tabular-nums text-foreground"
              aria-live="polite"
              title="Current zoom level"
            >
              {zoomPct}%
            </span>
            <button
              type="button"
              onClick={() => zoomCentre(1.18)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Zoom in"
              title="Zoom in (Ctrl/⌘ +)"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* legend + reset — top-left floating panel */}
        {data && !loading && (
          <div className="pointer-events-auto absolute left-4 top-4 w-56 rounded-md border border-border bg-popover/90 p-3 text-popover-foreground backdrop-blur-[2px]">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground">
              Node Types
            </p>
            <div className="flex flex-col gap-1.5">
              {legendTypes.map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <label
                    key={t}
                    className="flex cursor-pointer select-none items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={enabledTypes.has(t)}
                      onChange={() => toggleType(t)}
                      className="accent-primary"
                    />
                    <Icon
                      className="h-3.5 w-3.5 flex-none"
                      style={{ color: TYPE_COLOR[t] }}
                      aria-hidden
                    />
                    <span className="flex-1 text-foreground">
                      {TYPE_LABELS[t]}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {counts[t]}
                    </span>
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              onClick={resetView}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset view
            </button>
          </div>
        )}

        {/* hint — bottom-right */}
        {data && !loading && (
          <div className="pointer-events-none absolute bottom-3 right-4 text-right text-[11px] leading-relaxed text-[#7a7468]">
            Drag a node · scroll or Ctrl ± to zoom · drag the background to pan ·
            click to inspect
          </div>
        )}

        {/* detail panel — bottom-left, on selection */}
        {selected && (
          <div className="scroll-thin pointer-events-auto absolute bottom-4 left-4 max-h-[42%] w-80 overflow-auto rounded-md border border-border bg-popover/95 p-4 text-popover-foreground backdrop-blur-[2px]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide"
                style={{ color: TYPE_COLOR[selected.type] }}
              >
                {(() => {
                  const Icon = TYPE_ICON[selected.type];
                  return <Icon className="h-3.5 w-3.5" aria-hidden />;
                })()}
                {TYPE_LABELS[selected.type] || selected.type}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (simRef.current) simRef.current.selNode = null;
                  setSelected(null);
                }}
                className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close detail"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {selected.label}
            </h3>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {selected.type === "interaction"
                ? [selected.date, selected.medium, selected.contact]
                    .filter(Boolean)
                    .join(" · ")
                : `${simRef.current?.adj.get(selected.id)?.size ?? 0} connections`}
            </p>
            {selected.detail && (
              <p className="mt-2 text-[13px] leading-relaxed text-foreground">
                {selected.detail}
              </p>
            )}
          </div>
        )}

        {/* hover tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-20 max-w-[280px] rounded-md border border-border bg-popover/95 px-2.5 py-1.5 text-xs text-popover-foreground"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </section>
  );
}
