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

/* Theme-aware NEUTRAL palette read from CSS custom properties at runtime, so the
 * canvas tracks light/dark. Blue (`--primary`) is reserved for the RM root and the
 * active/selected node only — the sole accent; everything else is hue-neutral.
 * Read at draw time (and recomputed on `.dark` class changes) so a theme toggle
 * is picked up without a remount. */
interface Palette {
  fg: string; // --foreground
  muted: string; // --muted-foreground
  border: string; // --border
  primary: string; // --primary (the sole accent)
  card: string; // --card
  background: string; // --background
}

function readPalette(): Palette {
  // Guard against SSR / detached environments.
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      fg: "#181818",
      muted: "#717179",
      border: "#ededed",
      primary: "#0060df",
      card: "#ffffff",
      background: "#ffffff",
    };
  }
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => {
    const raw = css.getPropertyValue(name).trim();
    return raw ? `hsl(${raw})` : fallback;
  };
  return {
    fg: v("--foreground", "#181818"),
    muted: v("--muted-foreground", "#717179"),
    border: v("--border", "#ededed"),
    primary: v("--primary", "#0060df"),
    card: v("--card", "#ffffff"),
    background: v("--background", "#ffffff"),
  };
}

// Per-type accent for the React legend/detail chips. Hue-neutral by default —
// the RM root carries Wordsmith Blue (primary) as the sole accent; every other
// type is muted-foreground. Resolved from CSS tokens so it tracks the theme.
function legendColor(t: NodeType): string {
  return t === "rm" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
}

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
  recency: number; // 0..1 → opacity (1 = most recent, more present)
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
  palette: Palette; // theme-aware neutral colours, re-read on theme change
  reduceMotion: boolean; // honour prefers-reduced-motion
  settled: boolean; // true once the simulation has cooled — stops the rAF loop
  kick: (reheat?: number) => void; // restart the (gated) render loop on demand
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
      // a filter change re-lays-out the graph — reheat (unless motion is reduced)
      simRef.current.kick(simRef.current.reduceMotion ? 0.01 : 0.25);
    }
  }, [enabledTypes]);

  useEffect(() => {
    if (simRef.current) {
      simRef.current.query = query.trim().toLowerCase();
      simRef.current.kick(0); // repaint the search highlight even when settled
    }
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
      palette: readPalette(),
      reduceMotion:
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
          : false,
      settled: false,
      kick: () => {}, // replaced with the real loop-restarter below
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
    const ro = new ResizeObserver(() => {
      resize();
      // a resize clears the backing store — repaint even if the loop had settled
      if (simRef.current) kick(0);
    });
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
      kick(); // selection changes the focus highlight — repaint
    }

    // ---- force simulation tick ----
    function tick() {
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

    // Run the physics to rest synchronously, then freeze it. Used when motion is
    // reduced so the graph appears settled without a continuous animation.
    function settleNow() {
      for (let i = 0; i < 600 && sim.alpha > 0.01; i++) tick();
      sim.alpha = 0;
    }

    // Convert "hsl(H S% L%)" / hex from the palette into a colour with an alpha,
    // so opacity carries recency/dimming on an otherwise neutral stroke.
    function withAlpha(colour: string, alpha: number): string {
      const a = Math.max(0, Math.min(1, alpha));
      const hsl = colour.match(/^hsl\(([^)]+)\)$/i);
      if (hsl) return `hsla(${hsl[1]}, ${a})`;
      const hex = colour.match(/^#([0-9a-f]{6})$/i);
      if (hex) {
        const n = parseInt(hex[1], 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
      }
      return colour;
    }

    // ---- render ----
    function render() {
      tick();
      if (!ctx) return;
      // Re-read theme tokens each frame so a light/dark toggle is reflected live.
      const C = sim.palette;
      ctx.clearRect(0, 0, sim.W, sim.H);
      ctx.save();

      const focus = sim.selNode || sim.hoverNode;
      const neigh = focus ? sim.adj.get(focus.id) : null;

      // links — neutral stroke; recency/strength carried by opacity + width only
      // (no warm hue, no glow). The focused node's edges lift to the primary blue
      // as the sole accent.
      ctx.lineCap = "round";
      ctx.shadowBlur = 0;
      for (const l of sim.links) {
        const a = l.source;
        const b = l.target;
        if (!visible(a) || !visible(b)) continue;
        const pa = toScreen(a);
        const pb = toScreen(b);
        const active = focus && (a === focus || b === focus);
        const dimLink = focus && !active;

        const s = l.strength; // 0..1 → width + base presence
        const rec = l.recency; // 0..1 → opacity (more recent = more present)
        const baseA = (0.16 + 0.42 * s) * (0.4 + 0.6 * rec);
        const alpha = active
          ? Math.min(0.95, baseA + 0.4)
          : dimLink
            ? 0.06
            : baseA;

        ctx.lineWidth = (0.6 + 2.6 * s) * (active ? 1.6 : 1);
        // muted-foreground reads against both the light and dark canvas surface;
        // the opacity ramp (not hue) carries recency/strength.
        ctx.strokeStyle = active
          ? withAlpha(C.primary, alpha)
          : withAlpha(C.muted, alpha);
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

        const nodeAlpha = dim ? 0.18 : sim.query && !hit ? 0.12 : 1;
        ctx.globalAlpha = nodeAlpha;
        // Neutral by default; the RM root carries the primary blue as the sole
        // accent. Backend-supplied n.color is intentionally ignored to keep the
        // canvas hue-neutral.
        const ring = n.type === "rm" ? C.primary : C.muted;
        const av = sim.avatars.get(n.id);
        const hasFace = n.type === "rm" || n.type === "person";

        if (hasFace) {
          // ---- circular avatar (image or initials) with a neutral ring ----
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
            ctx.fillStyle = withAlpha(ring, nodeAlpha * 0.28);
            ctx.fill();
            ctx.globalAlpha = nodeAlpha;
            ctx.fillStyle = C.fg;
            ctx.font = `600 ${Math.max(8, ir * 0.95)}px ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(initials(n), p.x, p.y + 0.5);
            ctx.textBaseline = "alphabetic";
          }
          // neutral ring around the avatar
          ctx.beginPath();
          ctx.arc(p.x, p.y, ir, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1.5, r * 0.16);
          ctx.strokeStyle = ring;
          ctx.stroke();
        } else {
          // ---- plain neutral disc for non-face nodes ----
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = ring;
          ctx.fill();
          // Lucide glyph (mapped from node type) on medium / theme / interaction
          // nodes — never the raw backend emoji. Stroked in the card colour so it
          // reads against the neutral disc in both themes.
          const glyph = CANVAS_ICON[n.type];
          if (glyph && r > 6) {
            ctx.globalAlpha = nodeAlpha;
            drawCanvasIcon(ctx, glyph, p.x, p.y, r * 1.05, C.card);
          }
        }

        if (sim.query && hit) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = C.fg; // foreground ring marks a search hit
          ctx.stroke();
        }
        if (n === sim.selNode) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + (hasFace ? 2 : 0), 0, Math.PI * 2);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = C.primary; // Wordsmith Blue — active/selected ring
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
          ctx.fillStyle = C.muted; // neutral muted-foreground label
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

      // Gate the loop: keep ticking only while the simulation still has energy or
      // the user is actively interacting; otherwise let it settle and STOP rather
      // than burning a rAF every frame forever. A `kick()` re-arms it on demand.
      const busy =
        sim.dragNode !== null || sim.panning || sim.alpha > 0.01;
      if (busy) {
        sim.settled = false;
        rafRef.current = requestAnimationFrame(render);
      } else {
        sim.settled = true;
        rafRef.current = null;
      }
    }
    let lastPct = 100;

    // (Re)start the render loop if it has settled. Cheap to call on any event.
    function kick(reheat = 0) {
      if (reheat > 0) sim.alpha = Math.max(sim.alpha, reheat);
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(render);
      }
    }
    sim.kick = kick; // let React-side handlers (reset/zoom) wake the loop too

    // Honour prefers-reduced-motion: solve the layout up front and render one
    // static frame instead of animating the force settle.
    let reheat: number | undefined;
    if (sim.reduceMotion) {
      settleNow();
      rafRef.current = requestAnimationFrame(render); // single settled frame
    } else {
      rafRef.current = requestAnimationFrame(render);
      // gentle reheat so it settles nicely
      reheat = window.setTimeout(() => kick(1), 50);
    }

    // Recompute the theme palette when the documentElement class flips (light/
    // dark toggle) and repaint with the fresh tokens.
    const themeObserver = new MutationObserver(() => {
      sim.palette = readPalette();
      kick(sim.reduceMotion ? 0 : 0.02);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    // Track live changes to the motion preference.
    const motionMql =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const onMotionChange = (e: MediaQueryListEvent) => {
      sim.reduceMotion = e.matches;
      if (e.matches) settleNow();
      kick(e.matches ? 0 : 0.1);
    };
    motionMql?.addEventListener?.("change", onMotionChange);

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
      kick(); // wake the (possibly settled) loop for this interaction
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
        kick();
      } else if (sim.panning) {
        sim.view.x += e.clientX - sim.last.x;
        sim.view.y += e.clientY - sim.last.y;
        sim.last = { x: e.clientX, y: e.clientY };
        sim.dragMoved = true;
        kick();
      } else {
        const pos = localPos(e);
        const n = nodeAt(pos.x, pos.y);
        const changed = n !== sim.hoverNode;
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
        // a hover changes the focus highlight — repaint even when settled
        if (changed) kick(0.0);
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
      kick(); // settle/repaint after the gesture ends
    }

    // Zoom by a factor about a screen-space anchor (default: viewport centre).
    function zoomBy(f: number, anchor?: { x: number; y: number }) {
      const pos = anchor || { x: sim.W / 2, y: sim.H / 2 };
      const w = toWorld(pos.x, pos.y);
      sim.view.k = Math.max(0.15, Math.min(5, sim.view.k * f));
      sim.view.x = pos.x - w.x * sim.view.k;
      sim.view.y = pos.y - w.y * sim.view.k;
      kick(); // repaint at the new zoom even if the layout had settled
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
      if (reheat !== undefined) window.clearTimeout(reheat);
      ro.disconnect();
      themeObserver.disconnect();
      motionMql?.removeEventListener?.("change", onMotionChange);
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
      sim.alpha = sim.reduceMotion ? 0.01 : 1;
      sim.selNode = null;
      sim.kick(); // restart the loop if it had settled
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
    sim.kick(); // repaint at the new zoom even if the loop had settled
  }

  // type counts for the legend
  const counts: Partial<Record<NodeType, number>> = {};
  if (data) {
    for (const n of data.nodes) counts[n.type] = (counts[n.type] || 0) + 1;
  }
  const legendTypes = TYPE_ORDER.filter((t) => (counts[t] || 0) > 0);

  // one-line glance digest, built from the existing node counts.
  const people = (counts.client || 0) + (counts.person || 0);
  const digestParts = data
    ? [
        `RM + ${people} ${people === 1 ? "contact" : "contacts"}`,
        `${counts.interaction || 0} interactions`,
        `${counts.theme || 0} themes`,
      ]
    : [];

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
          {data && !loading && (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {digestParts.join(" · ")}
            </p>
          )}
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

      {/* canvas panel — neutral surface that tracks the theme (the canvas draw
          reads its colours from CSS tokens, so light/dark both read cleanly) */}
      <div
        ref={containerRef}
        className="relative h-[400px] w-full select-none bg-surface-2 sm:h-[560px]"
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
            Building the relationship graph…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-destructive">
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
                      style={{ color: legendColor(t) }}
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
          <div className="pointer-events-none absolute bottom-3 right-4 text-right text-[11px] leading-relaxed text-muted-foreground">
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
                style={{ color: legendColor(selected.type) }}
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
