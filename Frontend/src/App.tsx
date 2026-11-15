/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  FileCode2,
  Flame,
  FolderGit2,
  GitBranch,
  Layers,
  LayoutGrid,
  Minus,
  Network,
  Play,
  Plus,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Square,
  X,
  Zap,
} from 'lucide-react';
import {
  checkBackendHealth,
  computeGraphLayout,
  computeSpofRisks,
  getNodeStateMap,
  ingestGithubRepository,
  loadEcommerceArchitecture,
  parseCustomManifest,
  runFailureSimulation,
  type DependencyType,
  type FailureType,
  type GraphData,
  type NodeVisualState,
  type SimulationResult,
} from './engine';

type TabId = 'overview' | 'topology' | 'simulate' | 'impact';
type ThemeId = 'espresso' | 'carbon' | 'paper';
type SourceTabId = 'github' | 'manifest';

interface ThemePalette {
  id: ThemeId;
  label: string;
  swatch: string;
  isDark: boolean;
  accentBg: string;
  accentBgHover: string;
  accentText: string;
  accentSoft: string;
  accentBorder: string;
  accentInk: string;
  dotColor: string;
  edgeMuted: string;
  edgeActive: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  normalNode: { stroke: string; fill: string; core: string };
  selectRing: string;
}

const THEMES: Record<ThemeId, ThemePalette> = {
  espresso: {
    id: 'espresso',
    label: 'Espresso',
    swatch: '#FB923C',
    isDark: true,
    accentBg: 'bg-orange-400',
    accentBgHover: 'hover:bg-orange-300',
    accentText: 'text-stone-950',
    accentSoft: 'bg-orange-400/12',
    accentBorder: 'border-orange-400/35',
    accentInk: 'text-orange-300',
    dotColor: '#7C6F66',
    edgeMuted: '#4A3E37',
    edgeActive: '#FB923C',
    pillBg: '#120E0C',
    pillBorder: '#352B25',
    pillText: '#E7DDD6',
    normalNode: { stroke: '#D6C7BC', fill: '#211A16', core: '#FB923C' },
    selectRing: '#FED7AA',
  },
  carbon: {
    id: 'carbon',
    label: 'Carbon',
    swatch: '#A3E635',
    isDark: true,
    accentBg: 'bg-lime-400',
    accentBgHover: 'hover:bg-lime-300',
    accentText: 'text-zinc-950',
    accentSoft: 'bg-lime-400/12',
    accentBorder: 'border-lime-400/35',
    accentInk: 'text-lime-300',
    dotColor: '#52525B',
    edgeMuted: '#3F3F46',
    edgeActive: '#A3E635',
    pillBg: '#0D0D10',
    pillBorder: '#27272A',
    pillText: '#E4E4E7',
    normalNode: { stroke: '#D4D4D8', fill: '#18181B', core: '#A3E635' },
    selectRing: '#D9F99D',
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    swatch: '#18181B',
    isDark: false,
    accentBg: 'bg-zinc-900',
    accentBgHover: 'hover:bg-zinc-800',
    accentText: 'text-stone-50',
    accentSoft: 'bg-zinc-900/8',
    accentBorder: 'border-zinc-900/20',
    accentInk: 'text-zinc-900',
    dotColor: '#A1A1AA',
    edgeMuted: '#D4D4D8',
    edgeActive: '#18181B',
    pillBg: '#FFFFFF',
    pillBorder: '#D4D4D8',
    pillText: '#18181B',
    normalNode: { stroke: '#3F3F46', fill: '#FFFFFF', core: '#18181B' },
    selectRing: '#18181B',
  },
};

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'topology', label: 'Topology', icon: Network },
  { id: 'simulate', label: 'Simulate', icon: Flame },
  { id: 'impact', label: 'Impact', icon: Activity },
];

const EASE_SMOOTH = [0.16, 1, 0.3, 1] as const;

function readInitialTheme(): ThemeId {
  try {
    const saved = localStorage.getItem('impactengine_theme');
    if (saved === 'espresso' || saved === 'carbon' || saved === 'paper') return saved;
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return 'espresso';
}

interface TopologyCanvasProps {
  graph: GraphData;
  simulation: SimulationResult | null;
  selectedNodeId: string | null;
  mitigatedNodes?: string[];
  visibleHop?: number | null;
  onSelectNode: (id: string) => void;
  theme: ThemePalette;
  onChangeTheme?: (id: ThemeId) => void;
  compact?: boolean;
}

function TopologyCanvas({
  graph,
  simulation,
  selectedNodeId,
  mitigatedNodes = [],
  visibleHop = null,
  onSelectNode,
  theme,
  onChangeTheme,
  compact = false,
}: TopologyCanvasProps) {
  const positioned = useMemo(() => computeGraphLayout(graph, 1000, 560), [graph]);
  const posById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of positioned) {
      map.set(node.id, { x: node.x, y: node.y });
    }
    return map;
  }, [positioned]);

  const stateMap = useMemo(
    () => getNodeStateMap(simulation, mitigatedNodes, visibleHop),
    [simulation, mitigatedNodes, visibleHop]
  );

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [graph]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-node-hit="true"]')) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture failures
    }

    if (pointersRef.current.size === 1) {
      panStartRef.current = { x: e.clientX, y: e.clientY, origX: pan.x, origY: pan.y };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values()) as Array<{ x: number; y: number }>;
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      pinchStartRef.current = { dist, zoom };
      panStartRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values()) as Array<{ x: number; y: number }>;
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const ratio = dist / pinchStartRef.current.dist;
      setZoom(Math.max(0.6, Math.min(2.2, Number((pinchStartRef.current.zoom * ratio).toFixed(2)))));
    } else if (pointersRef.current.size === 1 && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({
        x: Math.max(-320, Math.min(320, panStartRef.current.origX + dx)),
        y: Math.max(-220, Math.min(220, panStartRef.current.origY + dy)),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0] as { x: number; y: number };
      panStartRef.current = { x: remaining.x, y: remaining.y, origX: pan.x, origY: pan.y };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 0) {
      panStartRef.current = null;
      pinchStartRef.current = null;
    }
  };

  const palette: Record<NodeVisualState, { stroke: string; fill: string; core: string }> = {
    normal: theme.normalNode,
    root: { stroke: '#F43F5E', fill: theme.isDark ? '#3B1220' : '#FFE4E6', core: '#F43F5E' },
    broken: { stroke: '#FB7185', fill: theme.isDark ? '#331420' : '#FFF1F2', core: '#E11D48' },
    warning: { stroke: '#F59E0B', fill: theme.isDark ? '#332410' : '#FEF3C7', core: '#D97706' },
    mitigated: { stroke: '#10B981', fill: theme.isDark ? '#0E2E26' : '#D1FAE5', core: '#059669' },
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface-alt)] transition-colors duration-200">
      <svg
        viewBox="0 0 1000 560"
        className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="img"
        aria-label="Service dependency topology"
      >
        <defs>
          <pattern id="ie-grid-dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill={theme.dotColor} opacity="0.4" />
          </pattern>
          <marker id="ie-arrow-muted" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
            <path d="M0 0 L7 3.5 L0 7 z" fill={theme.edgeMuted} />
          </marker>
          <marker id="ie-arrow-active" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
            <path d="M0 0 L7 3.5 L0 7 z" fill={theme.edgeActive} />
          </marker>
          <marker id="ie-arrow-impact" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
            <path d="M0 0 L7 3.5 L0 7 z" fill="#F43F5E" />
          </marker>
          <marker id="ie-arrow-warn" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
            <path d="M0 0 L7 3.5 L0 7 z" fill="#F59E0B" />
          </marker>
        </defs>

        <rect width="1000" height="560" fill="url(#ie-grid-dots)" />

        <g transform={`translate(${500 + pan.x}, ${280 + pan.y}) scale(${zoom}) translate(-500, -280)`}>
          {graph.edges.map((edge, index) => {
            const a = posById.get(edge.source);
            const b = posById.get(edge.target);
            if (!a || !b || edge.source === edge.target) return null;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const offset = 24;
            const x1 = a.x + (dx / dist) * offset;
            const y1 = a.y + (dy / dist) * offset;
            const x2 = b.x - (dx / dist) * (offset + 4);
            const y2 = b.y - (dy / dist) * (offset + 4);

            const srcState = stateMap[edge.source];
            const tgtState = stateMap[edge.target];
            const isBrokenLink =
              (srcState === 'broken' || srcState === 'root') &&
              (tgtState === 'broken' || tgtState === 'root');
            const isWarnLink =
              !isBrokenLink &&
              ((srcState === 'warning' && (tgtState === 'root' || tgtState === 'broken' || tgtState === 'warning')) ||
                (srcState === 'mitigated' && (tgtState === 'root' || tgtState === 'broken')));
            const isSelectedLink = selectedNodeId === edge.source || selectedNodeId === edge.target;

            const stroke = isBrokenLink
              ? '#F43F5E'
              : isWarnLink
                ? '#F59E0B'
                : isSelectedLink
                  ? theme.edgeActive
                  : theme.edgeMuted;

            const marker = isBrokenLink
              ? 'url(#ie-arrow-impact)'
              : isWarnLink
                ? 'url(#ie-arrow-warn)'
                : isSelectedLink
                  ? 'url(#ie-arrow-active)'
                  : 'url(#ie-arrow-muted)';

            return (
              <line
                key={`${edge.source}-${edge.target}-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={isSelectedLink || isBrokenLink ? 2 : 1.4}
                strokeDasharray={edge.dependency_type === 'soft' ? '5 5' : undefined}
                opacity={isBrokenLink || isSelectedLink ? 0.92 : 0.72}
                markerEnd={marker}
              />
            );
          })}

          {positioned.map((node) => {
            const visualState = stateMap[node.id] || 'normal';
            const colors = palette[visualState];
            const isSelected = selectedNodeId === node.id;
            const displayLabel = node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label;
            const pillW = Math.min(168, Math.max(78, displayLabel.length * 7.2 + 22));

            return (
              <g
                key={node.id}
                data-node-hit="true"
                onClick={() => onSelectNode(node.id)}
                className="cursor-pointer"
              >
                <circle cx={node.x} cy={node.y} r={32} fill="transparent" />

                {isSelected && (
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={25}
                    fill="none"
                    stroke={theme.selectRing}
                    strokeWidth={1.6}
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 0.85 }}
                    transition={{ duration: 0.18, ease: EASE_SMOOTH }}
                  />
                )}

                {visualState === 'root' && (
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={28}
                    fill="none"
                    stroke="#F43F5E"
                    strokeWidth={1.5}
                    initial={{ scale: 0.85, opacity: 0.7 }}
                    animate={{ scale: 1.25, opacity: 0 }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}

                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? 19 : 16}
                  fill={colors.fill}
                  stroke={isSelected ? theme.selectRing : colors.stroke}
                  strokeWidth={isSelected ? 2.4 : 1.75}
                />

                <circle cx={node.x} cy={node.y} r={5.5} fill={colors.core} />

                <rect
                  x={node.x - pillW / 2}
                  y={node.y + 24}
                  width={pillW}
                  height={23}
                  rx={6}
                  fill={theme.pillBg}
                  fillOpacity={0.94}
                  stroke={isSelected ? theme.edgeActive : theme.pillBorder}
                  strokeWidth={1}
                />

                <text
                  x={node.x}
                  y={node.y + 39}
                  textAnchor="middle"
                  fill={theme.pillText}
                  fontSize="11.5"
                  fontWeight={isSelected ? '600' : '500'}
                  fontFamily="DM Sans, sans-serif"
                >
                  {displayLabel}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Top-right compact theme selector */}
      {onChangeTheme && (
        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/90 p-1 backdrop-blur-md">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const item = THEMES[id];
            const active = theme.id === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeTheme(id)}
                className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full border border-black/20"
                  style={{ backgroundColor: item.swatch }}
                />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom-left minimal legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]/90 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] backdrop-blur-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.normalNode.core }} />
          Nominal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Failed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Degraded
        </span>
        {!compact && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[var(--text-muted)]">
            <span className="inline-block w-3 border-t border-dashed border-current" />
            Soft fallback
          </span>
        )}
        {graph.nodes.length > 24 && (
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            Showing 24 of {graph.nodes.length}
          </span>
        )}
      </div>

      {/* Bottom-right touch-friendly zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/90 p-1 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(2))))}
          aria-label="Zoom out"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] active:scale-95"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Reset view"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(2))))}
          aria-label="Zoom in"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [themeId, setThemeId] = useState<ThemeId>(readInitialTheme);
  const theme = THEMES[themeId];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
    document.documentElement.classList.toggle('dark', theme.isDark);
    try {
      localStorage.setItem('impactengine_theme', themeId);
    } catch {
      // Ignore storage write failures
    }
  }, [themeId, theme.isDark]);

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeSearch, setNodeSearch] = useState('');

  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simTarget, setSimTarget] = useState<string>('');
  const [simMode, setSimMode] = useState<FailureType>('down');
  const [mitigatedNodes, setMitigatedNodes] = useState<string[]>([]);

  const [impactFilter, setImpactFilter] = useState<'all' | 'broken' | 'warning'>('all');
  const [impactMobileView, setImpactMobileView] = useState<'list' | 'map'>('list');
  const [visibleHop, setVisibleHop] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTabId>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [manifestText, setManifestText] = useState('');
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'online' | 'offline'>('idle');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // Escape closes Source & Surface sheet
  useEffect(() => {
    if (!sourceSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSourceSheetOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sourceSheetOpen]);

  // Hop-by-hop playback interval
  const maxCascadeHop = useMemo(() => {
    if (!simulation || simulation.cascade.length === 0) return 0;
    return Math.max(...simulation.cascade.map((c) => c.hop));
  }, [simulation]);

  useEffect(() => {
    if (!isReplaying || !simulation) return;
    const timer = setInterval(() => {
      setVisibleHop((prev) => {
        const next = prev === null ? 0 : prev + 1;
        if (next > maxCascadeHop) {
          setIsReplaying(false);
          return null;
        }
        return next;
      });
    }, 650);
    return () => clearInterval(timer);
  }, [isReplaying, simulation, maxCascadeHop]);

  const applyNewGraph = useCallback((nextGraph: GraphData, label: string) => {
    setGraph(nextGraph);
    setSourceLabel(label);
    const firstId = nextGraph.nodes[0]?.id ?? null;
    setSelectedNodeId(firstId);
    setSimTarget(firstId ?? '');
    setNodeSearch('');
    setMitigatedNodes([]);
    setSimulation(null);
    setVisibleHop(null);
    setIsReplaying(false);
    setSourceError(null);
    setSourceSheetOpen(false);
  }, []);

  const handleLoadDemo = useCallback(async () => {
    setIsLoadingSource(true);
    setSourceError(null);
    try {
      const { graph: demoGraph, via } = await loadEcommerceArchitecture();
      applyNewGraph(demoGraph, 'E-Commerce Architecture');
      showToast(via === 'backend' ? 'Loaded demo from FastAPI' : 'E-Commerce architecture ready');
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Unable to load demo.');
    } finally {
      setIsLoadingSource(false);
    }
  }, [applyNewGraph, showToast]);

  const handleAnalyzeRepo = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoadingSource(true);
      setSourceError(null);
      try {
        const { graph: repoGraph, source } = await ingestGithubRepository(repoUrl);
        applyNewGraph(repoGraph, source.replace('https://github.com/', ''));
        showToast('Repository topology indexed');
      } catch (err) {
        setSourceError(err instanceof Error ? err.message : 'Repository analysis failed.');
      } finally {
        setIsLoadingSource(false);
      }
    },
    [repoUrl, applyNewGraph, showToast]
  );

  const handleImportManifest = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSourceError(null);
      try {
        const { graph: parsedGraph, source } = parseCustomManifest(manifestText);
        applyNewGraph(parsedGraph, source);
        showToast(`Loaded ${source}`);
      } catch (err) {
        setSourceError(err instanceof Error ? err.message : 'Could not parse manifest.');
      }
    },
    [manifestText, applyNewGraph, showToast]
  );

  const handleRunSimulation = useCallback(async () => {
    if (!graph || !simTarget) return;
    setIsSimulating(true);
    setVisibleHop(null);
    setIsReplaying(false);
    try {
      const { simulation: result } = await runFailureSimulation(graph, simTarget, simMode, mitigatedNodes);
      setSimulation(result);
      setSelectedNodeId(simTarget);
      showToast(`Simulated ${simMode === 'down' ? 'crash' : 'latency'} on ${simTarget}`);
    } finally {
      setIsSimulating(false);
    }
  }, [graph, simTarget, simMode, mitigatedNodes, showToast]);

  const handleCheckBackend = useCallback(async () => {
    const ok = await checkBackendHealth();
    setBackendStatus(ok ? 'online' : 'offline');
  }, []);

  const handleExportReport = useCallback(() => {
    if (!graph || !simulation) return;
    const payload = {
      source: sourceLabel,
      exported_at: new Date().toISOString(),
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      simulation,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impactengine-${simulation.root_cause}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Impact dossier downloaded');
  }, [graph, simulation, sourceLabel, showToast]);

  const spofRisks = useMemo(() => (graph ? computeSpofRisks(graph, 3) : []), [graph]);

  const stats = useMemo(() => {
    const nodeCount = graph?.nodes.length ?? 0;
    const edgeCount = graph?.edges.length ?? 0;
    const affected = simulation?.blast_radius_count ?? 0;
    const broken = simulation?.broken_count ?? 0;
    const warning = simulation?.warning_count ?? 0;
    const pct = nodeCount > 0 && simulation ? ((affected / nodeCount) * 100).toFixed(1) : '0.0';
    return { nodeCount, edgeCount, affected, broken, warning, pct };
  }, [graph, simulation]);

  const filteredNodes = useMemo(() => {
    if (!graph) return [];
    const q = nodeSearch.trim().toLowerCase();
    if (!q) return graph.nodes;
    return graph.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    );
  }, [graph, nodeSearch]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graph, selectedNodeId]
  );

  const selectedRelations = useMemo(() => {
    if (!graph || !selectedNodeId) {
      return {
        inbound: [] as Array<{ id: string; type: DependencyType }>,
        outbound: [] as Array<{ id: string; type: DependencyType }>,
      };
    }
    const inbound = graph.edges
      .filter((e) => e.target === selectedNodeId)
      .map((e) => ({ id: e.source, type: (e.dependency_type === 'soft' ? 'soft' : 'hard') as DependencyType }));
    const outbound = graph.edges
      .filter((e) => e.source === selectedNodeId)
      .map((e) => ({ id: e.target, type: (e.dependency_type === 'soft' ? 'soft' : 'hard') as DependencyType }));
    return { inbound, outbound };
  }, [graph, selectedNodeId]);

  const filteredCascade = useMemo(() => {
    if (!simulation) return [];
    return simulation.cascade.filter((c) => {
      if (typeof visibleHop === 'number' && c.hop > visibleHop) return false;
      if (impactFilter === 'broken') return c.state === 'broken';
      if (impactFilter === 'warning') return c.state !== 'broken';
      return true;
    });
  }, [simulation, impactFilter, visibleHop]);

  const toggleMitigation = (nodeId: string) => {
    setMitigatedNodes((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="flex h-dvh w-screen flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors duration-200"
        style={{ backgroundImage: 'var(--bg-atmosphere)' }}
      >
        {/* Top Bar Contract: Brand — Single-Line Tabs — 1 Primary Action */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-8 border-b border-[var(--border-hairline)] px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="flex min-h-[44px] items-center gap-2.5 whitespace-nowrap shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded-lg"
          >
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${theme.accentBorder} ${theme.accentSoft} ${theme.accentInk}`}>
              <Layers className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              ImpactEngine
            </span>
          </button>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-1.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${
                    isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="desktop-nav-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)]"
                    />
                  )}
                  <Icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => setSourceSheetOpen(true)}
            className={`flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText}`}
          >
            <FolderGit2 className="h-4 w-4" />
            <span>{graph ? 'Change Source' : 'Load Source'}</span>
          </motion.button>
        </header>

        {/* Main Viewport — Zero scrollbars */}
        <main className="relative flex-1 min-h-0 overflow-hidden px-4 py-4 pb-20 sm:px-6 md:pb-5 lg:px-8">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.section
                key="overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: EASE_SMOOTH }}
                className="flex h-full min-h-0 flex-col gap-4"
              >
                {/* Compact KPI Strip */}
                <div className="grid shrink-0 grid-cols-2 lg:grid-cols-4 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-hairline)]">
                  <div className="px-4 py-3.5 sm:px-5">
                    <div className="text-xs font-medium text-[var(--text-muted)]">Services indexed</div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                      {stats.nodeCount}
                    </div>
                  </div>
                  <div className="px-4 py-3.5 sm:px-5 border-l border-[var(--border-hairline)] lg:border-l-0">
                    <div className="text-xs font-medium text-[var(--text-muted)]">Dependencies</div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                      {stats.edgeCount}
                    </div>
                  </div>
                  <div className="px-4 py-3.5 sm:px-5">
                    <div className="text-xs font-medium text-[var(--text-muted)]">Simulation</div>
                    <div className="mt-1 font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                      {simulation ? 'Complete' : 'Standby'}
                    </div>
                  </div>
                  <div className="px-4 py-3.5 sm:px-5 border-l border-[var(--border-hairline)] lg:border-l-0">
                    <div className="text-xs font-medium text-[var(--text-muted)]">Blast radius</div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                      {simulation ? `${stats.affected} (${stats.pct}%)` : '—'}
                    </div>
                  </div>
                </div>

                {/* Primary 2-Column Split */}
                <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1.65fr_1fr]">
                  {!graph ? (
                    <div className="relative flex h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)]/70 p-6 text-center">
                      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1">
                        {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                          const item = THEMES[id];
                          const active = themeId === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setThemeId(id)}
                              className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors ${
                                active
                                  ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full border border-black/20"
                                style={{ backgroundColor: item.swatch }}
                              />
                              <span className="hidden sm:inline">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${theme.accentBorder} ${theme.accentSoft} ${theme.accentInk}`}>
                        <Network className="h-6 w-6" />
                      </div>
                      <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)] text-balance">
                        Map service dependencies and test failure cascades
                      </h1>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
                        Load the built-in E-Commerce service mesh, connect a public GitHub repo, or paste a Docker/package manifest.
                      </p>
                      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={handleLoadDemo}
                          disabled={isLoadingSource}
                          className={`flex min-h-[46px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText}`}
                        >
                          <Zap className="h-4 w-4" />
                          <span>{isLoadingSource ? 'Loading…' : 'Load E-Commerce Demo'}</span>
                        </motion.button>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setSourceSheetOpen(true)}
                          className="flex min-h-[46px] items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-opacity hover:opacity-90"
                        >
                          <GitBranch className="h-4 w-4" />
                          <span>Repo or Manifest</span>
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-0 flex-col gap-3">
                      <div className="flex shrink-0 items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] truncate">
                          <span className="font-medium text-[var(--text-primary)] truncate">{sourceLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{stats.nodeCount} nodes</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('topology')}
                          className={`flex min-h-[36px] items-center gap-1 text-xs font-medium whitespace-nowrap shrink-0 ${theme.accentInk}`}
                        >
                          <span>Inspect Mesh</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 min-h-0">
                        <TopologyCanvas
                          graph={graph}
                          simulation={simulation}
                          selectedNodeId={selectedNodeId}
                          mitigatedNodes={mitigatedNodes}
                          onSelectNode={(id) => {
                            setSelectedNodeId(id);
                            setSimTarget(id);
                          }}
                          theme={theme}
                          onChangeTheme={setThemeId}
                          compact
                        />
                      </div>
                    </div>
                  )}

                  {/* Workflow & Highest-Risk SPOF Panel */}
                  <div className="hidden lg:flex h-full min-h-0 flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                    {!graph ? (
                      <div>
                        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                          Analysis Workflow
                        </h2>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          Modeled dependency analysis with zero impact on live systems.
                        </p>

                        <div className="mt-5 divide-y divide-[var(--border-hairline)]">
                          <button
                            type="button"
                            onClick={() => setSourceSheetOpen(true)}
                            className="group flex w-full min-h-[60px] items-center justify-between py-3.5 text-left transition-colors"
                          >
                            <div>
                              <div className={`text-xs font-medium ${theme.accentInk}`}>01. Discover</div>
                              <div className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                                Index repository, manifest, or demo
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveTab('topology')}
                            className="group flex w-full min-h-[60px] items-center justify-between py-3.5 text-left transition-colors"
                          >
                            <div>
                              <div className={`text-xs font-medium ${theme.accentInk}`}>02. Explore</div>
                              <div className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                                Inspect hard & soft dependencies
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveTab('simulate')}
                            className="group flex w-full min-h-[60px] items-center justify-between py-3.5 text-left transition-colors"
                          >
                            <div>
                              <div className={`text-xs font-medium ${theme.accentInk}`}>03. Simulate</div>
                              <div className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                                Test outages & circuit-breaker ROI
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-1 min-h-0 flex-col">
                        <div className="flex items-center justify-between">
                          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                            Single Points of Failure
                          </h2>
                          <span className="text-xs text-[var(--text-muted)]">Worst-case blast</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          Tap any critical service below to pre-load it in the failure simulator.
                        </p>

                        <div className="mt-4 divide-y divide-[var(--border-hairline)] overflow-y-auto no-scrollbar touch-pan">
                          {spofRisks.map((risk, idx) => (
                            <button
                              key={risk.id}
                              type="button"
                              onClick={() => {
                                setSelectedNodeId(risk.id);
                                setSimTarget(risk.id);
                                setActiveTab('simulate');
                              }}
                              className="group flex w-full min-h-[58px] items-center justify-between py-3 text-left transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                  <span className={`font-mono text-xs ${theme.accentInk}`}>0{idx + 1}</span>
                                  <span className="truncate">{risk.label}</span>
                                </div>
                                <div className="mt-0.5 font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                                  {risk.blastCount} impacted ({risk.pct}%) · {risk.brokenCount} broken
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-[var(--border-hairline)]">
                      {graph ? (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            if (spofRisks[0]) {
                              setSimTarget(spofRisks[0].id);
                              setSelectedNodeId(spofRisks[0].id);
                            }
                            setActiveTab('simulate');
                          }}
                          className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText}`}
                        >
                          <Flame className="h-4 w-4" />
                          <span>Simulate Highest-Risk Node</span>
                        </motion.button>
                      ) : (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={handleLoadDemo}
                          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--bg-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-opacity hover:opacity-90"
                        >
                          <span>Try Demo Architecture</span>
                          <ArrowRight className="h-4 w-4" />
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}

            {activeTab === 'topology' && (
              <motion.section
                key="topology"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: EASE_SMOOTH }}
                className="h-full min-h-0"
              >
                {!graph ? (
                  <EmptyWorkspace
                    theme={theme}
                    onOpenSource={() => setSourceSheetOpen(true)}
                    onLoadDemo={handleLoadDemo}
                  />
                ) : (
                  <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1.8fr_1fr]">
                    <div className="min-h-[260px] h-full">
                      <TopologyCanvas
                        graph={graph}
                        simulation={simulation}
                        selectedNodeId={selectedNodeId}
                        mitigatedNodes={mitigatedNodes}
                        onSelectNode={(id) => {
                          setSelectedNodeId(id);
                          setSimTarget(id);
                        }}
                        theme={theme}
                        onChangeTheme={setThemeId}
                      />
                    </div>

                    {/* Touch-friendly Service Inspector */}
                    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5">
                      <div className="flex shrink-0 items-center justify-between gap-3">
                        <span className="text-xs font-medium text-[var(--text-muted)]">Service Inspector</span>
                        <select
                          aria-label="Select service component"
                          value={selectedNodeId ?? ''}
                          onChange={(e) => {
                            setSelectedNodeId(e.target.value);
                            setSimTarget(e.target.value);
                          }}
                          className="min-h-[44px] max-w-[200px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 text-sm font-medium text-[var(--text-primary)] focus:outline-none"
                        >
                          {(filteredNodes.length > 0 ? filteredNodes : graph.nodes).map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {graph.nodes.length > 8 && (
                        <div className="relative mt-2.5 shrink-0">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                          <input
                            type="search"
                            value={nodeSearch}
                            onChange={(e) => {
                              const next = e.target.value;
                              setNodeSearch(next);
                              const match = graph.nodes.find(
                                (n) =>
                                  n.label.toLowerCase().includes(next.toLowerCase()) ||
                                  n.id.toLowerCase().includes(next.toLowerCase())
                              );
                              if (match) setSelectedNodeId(match.id);
                            }}
                            placeholder="Filter services…"
                            className="min-h-[40px] w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-alt)] pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                          />
                        </div>
                      )}

                      {selectedNode && (
                        <div className="mt-4 flex flex-1 min-h-0 flex-col justify-between overflow-y-auto no-scrollbar touch-pan">
                          <div>
                            <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
                              {selectedNode.label}
                            </h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                              <span className="font-mono text-[var(--text-primary)]">{selectedNode.id}</span>
                              {selectedNode.tier && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{selectedNode.tier}</span>
                                </>
                              )}
                              {selectedNode.protocol && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{selectedNode.protocol}</span>
                                </>
                              )}
                            </div>

                            {selectedNode.description && (
                              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                                {selectedNode.description}
                              </p>
                            )}

                            <div className="mt-5 grid grid-cols-2 divide-x divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-alt)]">
                              <div className="px-4 py-3">
                                <div className="text-xs text-[var(--text-muted)]">Incoming callers</div>
                                <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-[var(--text-primary)]">
                                  {selectedRelations.inbound.length}
                                </div>
                              </div>
                              <div className="px-4 py-3">
                                <div className="text-xs text-[var(--text-muted)]">Outgoing deps</div>
                                <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-[var(--text-primary)]">
                                  {selectedRelations.outbound.length}
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 space-y-4">
                              <div>
                                <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                                  Upstream callers
                                </div>
                                {selectedRelations.inbound.length === 0 ? (
                                  <div className="text-xs text-[var(--text-muted)]">No recorded callers</div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedRelations.inbound.map((rel) => (
                                      <button
                                        key={`${rel.id}-${rel.type}`}
                                        type="button"
                                        onClick={() => setSelectedNodeId(rel.id)}
                                        className="min-h-[38px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] transition-opacity hover:opacity-85 active:scale-95"
                                      >
                                        <span>{rel.id}</span>
                                        <span className="mx-1.5 text-[var(--text-muted)]">·</span>
                                        <span className={rel.type === 'hard' ? 'text-rose-400' : 'text-amber-400'}>
                                          {rel.type}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                                  Downstream dependencies
                                </div>
                                {selectedRelations.outbound.length === 0 ? (
                                  <div className="text-xs text-[var(--text-muted)]">No recorded dependencies</div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedRelations.outbound.map((rel) => (
                                      <button
                                        key={`${rel.id}-${rel.type}`}
                                        type="button"
                                        onClick={() => setSelectedNodeId(rel.id)}
                                        className="min-h-[38px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] transition-opacity hover:opacity-85 active:scale-95"
                                      >
                                        <span>{rel.id}</span>
                                        <span className="mx-1.5 text-[var(--text-muted)]">·</span>
                                        <span className={rel.type === 'hard' ? 'text-rose-400' : 'text-amber-400'}>
                                          {rel.type}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 pt-4 border-t border-[var(--border-hairline)]">
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => {
                                setSimTarget(selectedNode.id);
                                setActiveTab('simulate');
                              }}
                              className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 ${theme.accentSoft} ${theme.accentBorder} ${theme.accentInk}`}
                            >
                              <Flame className="h-4 w-4" />
                              <span>Simulate failure on {selectedNode.label}</span>
                            </motion.button>
                          </div>
                        </div>
                      )}
                    </aside>
                  </div>
                )}
              </motion.section>
            )}

            {activeTab === 'simulate' && (
              <motion.section
                key="simulate"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: EASE_SMOOTH }}
                className="h-full min-h-0"
              >
                {!graph ? (
                  <EmptyWorkspace
                    theme={theme}
                    onOpenSource={() => setSourceSheetOpen(true)}
                    onLoadDemo={handleLoadDemo}
                  />
                ) : (
                  <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
                    {/* Chaos Controls */}
                    <div className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5 overflow-y-auto no-scrollbar touch-pan">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                            Failure Parameters
                          </h2>
                          {simulation && (
                            <button
                              type="button"
                              onClick={() => {
                                setSimulation(null);
                                setVisibleHop(null);
                                setIsReplaying(false);
                              }}
                              className="min-h-[36px] px-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label htmlFor="sim-target" className="text-xs font-medium text-[var(--text-muted)]">
                              Target service
                            </label>
                            {spofRisks[0] && spofRisks[0].id !== simTarget && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSimTarget(spofRisks[0].id);
                                  setSelectedNodeId(spofRisks[0].id);
                                  setMitigatedNodes((prev) => prev.filter((id) => id !== spofRisks[0].id));
                                }}
                                className={`text-[11px] font-medium ${theme.accentInk}`}
                              >
                                Highest risk: {spofRisks[0].label}
                              </button>
                            )}
                          </div>
                          <select
                            id="sim-target"
                            value={simTarget}
                            onChange={(e) => {
                              setSimTarget(e.target.value);
                              setSelectedNodeId(e.target.value);
                              setMitigatedNodes((prev) => prev.filter((id) => id !== e.target.value));
                            }}
                            className="min-h-[46px] w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 text-sm font-medium text-[var(--text-primary)] focus:outline-none"
                          >
                            {graph.nodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.label} ({n.id})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <span className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                            Failure mode
                          </span>
                          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--bg-surface-alt)] p-1 border border-[var(--border-hairline)]">
                            <button
                              type="button"
                              onClick={() => setSimMode('down')}
                              className={`min-h-[42px] rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                simMode === 'down'
                                  ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40'
                                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              Hard Crash
                            </button>
                            <button
                              type="button"
                              onClick={() => setSimMode('degraded')}
                              className={`min-h-[42px] rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                simMode === 'degraded'
                                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40'
                                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              Latency Spike
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-[var(--text-muted)]">
                              Protected services (circuit breakers)
                            </span>
                            {mitigatedNodes.length > 0 && (
                              <span className="font-mono text-xs text-emerald-500 tabular-nums">
                                {mitigatedNodes.length} active
                              </span>
                            )}
                          </div>
                          <div className="max-h-[140px] overflow-y-auto no-scrollbar touch-pan flex flex-wrap gap-1.5 py-1">
                            {graph.nodes
                              .filter((n) => n.id !== simTarget)
                              .map((node) => {
                                const active = mitigatedNodes.includes(node.id);
                                return (
                                  <button
                                    key={node.id}
                                    type="button"
                                    onClick={() => toggleMitigation(node.id)}
                                    className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors active:scale-95 ${
                                      active
                                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                                        : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                    }`}
                                  >
                                    <Shield className="h-3 w-3" />
                                    <span>{node.label}</span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-[var(--border-hairline)] space-y-2.5">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={handleRunSimulation}
                          disabled={isSimulating || !simTarget}
                          className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText}`}
                        >
                          <Flame className="h-4 w-4" />
                          <span>{isSimulating ? 'Simulating…' : 'Run Simulation'}</span>
                        </motion.button>

                        {simulation && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('impact')}
                            className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-alt)] px-4 py-2 text-xs font-medium text-[var(--text-primary)]"
                          >
                            <span className="truncate">
                              {simulation.blast_radius_count} impacted
                              {typeof simulation.saved_count === 'number' && simulation.saved_count > 0
                                ? ` · ${simulation.saved_count} saved`
                                : ` · ${simulation.criticality}`}
                            </span>
                            <ArrowRight className={`h-4 w-4 shrink-0 ${theme.accentInk}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Live Blast Radius Canvas */}
                    <div className="min-h-[240px] h-full">
                      <TopologyCanvas
                        graph={graph}
                        simulation={simulation}
                        selectedNodeId={selectedNodeId}
                        mitigatedNodes={mitigatedNodes}
                        onSelectNode={(id) => {
                          setSelectedNodeId(id);
                          setSimTarget(id);
                        }}
                        theme={theme}
                        onChangeTheme={setThemeId}
                      />
                    </div>
                  </div>
                )}
              </motion.section>
            )}

            {activeTab === 'impact' && (
              <motion.section
                key="impact"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: EASE_SMOOTH }}
                className="flex h-full min-h-0 flex-col gap-4"
              >
                {!graph ? (
                  <EmptyWorkspace
                    theme={theme}
                    onOpenSource={() => setSourceSheetOpen(true)}
                    onLoadDemo={handleLoadDemo}
                  />
                ) : !simulation ? (
                  <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)]/70 p-6 text-center">
                    <AlertTriangle className="h-7 w-7 text-amber-500 mb-3" />
                    <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
                      Run a failure simulation first
                    </h2>
                    <p className="mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">
                      Choose a target component in the Simulate tab to calculate cascading blast radius and mitigation impact.
                    </p>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setActiveTab('simulate')}
                      className={`mt-5 flex min-h-[46px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText}`}
                    >
                      <Flame className="h-4 w-4" />
                      <span>Open Failure Simulator</span>
                    </motion.button>
                  </div>
                ) : (
                  <>
                    {/* Impact Summary Strip */}
                    <div className="grid shrink-0 grid-cols-2 lg:grid-cols-4 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-hairline)]">
                      <div className="px-4 py-3 sm:px-5">
                        <div className="text-xs text-[var(--text-muted)]">Blast radius</div>
                        <div className="mt-1 flex items-baseline gap-2 font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                          <span>{stats.affected}</span>
                          <span className="text-xs font-normal text-[var(--text-muted)]">({stats.pct}%)</span>
                          {typeof simulation.saved_count === 'number' && simulation.saved_count > 0 && (
                            <span className="text-xs font-medium text-emerald-500">
                              {simulation.saved_count} saved
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="px-4 py-3 sm:px-5 border-l border-[var(--border-hairline)] lg:border-l-0">
                        <div className="text-xs text-[var(--text-muted)]">Hard failures</div>
                        <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-rose-500">
                          {stats.broken}
                        </div>
                      </div>
                      <div className="px-4 py-3 sm:px-5">
                        <div className="text-xs text-[var(--text-muted)]">Degraded</div>
                        <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-500">
                          {stats.warning}
                        </div>
                      </div>
                      <div className="px-4 py-3 sm:px-5 border-l border-[var(--border-hairline)] lg:border-l-0 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-[var(--text-muted)]">Root cause</div>
                          <div className="mt-1 truncate font-mono text-sm font-semibold text-[var(--text-primary)]">
                            {simulation.root_cause}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleExportReport}
                          aria-label="Download impact report"
                          className="flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:opacity-85 active:scale-95"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile List / Map Switcher */}
                    <div className="flex sm:hidden shrink-0 items-center justify-between gap-2">
                      <div className="grid grid-cols-2 flex-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1">
                        <button
                          type="button"
                          onClick={() => setImpactMobileView('list')}
                          className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                            impactMobileView === 'list'
                              ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          Cascade List
                        </button>
                        <button
                          type="button"
                          onClick={() => setImpactMobileView('map')}
                          className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                            impactMobileView === 'map'
                              ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          Blast Map
                        </button>
                      </div>
                    </div>

                    {/* Split View: Graph & Cascade Breakdown */}
                    <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 sm:grid-cols-[1.2fr_1fr]">
                      <div className={`${impactMobileView === 'map' ? 'block' : 'hidden'} sm:block min-h-0 h-full`}>
                        <TopologyCanvas
                          graph={graph}
                          simulation={simulation}
                          selectedNodeId={selectedNodeId}
                          mitigatedNodes={mitigatedNodes}
                          visibleHop={visibleHop}
                          onSelectNode={(id) => setSelectedNodeId(id)}
                          theme={theme}
                          onChangeTheme={setThemeId}
                          compact
                        />
                      </div>

                      <div className={`${impactMobileView === 'list' ? 'flex' : 'hidden'} sm:flex h-full min-h-0 flex-col rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5`}>
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-hairline)]">
                          <div>
                            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                              Cascade Breakdown
                            </h2>
                            <div className="text-xs text-[var(--text-secondary)]">
                              {simulation.criticality} · {simulation.failure_type === 'down' ? 'Hard crash' : 'Latency spike'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-alt)] p-1 border border-[var(--border-hairline)]">
                            {(['all', 'broken', 'warning'] as const).map((filterKey) => (
                              <button
                                key={filterKey}
                                type="button"
                                onClick={() => setImpactFilter(filterKey)}
                                className={`min-h-[34px] rounded-lg px-2.5 text-xs font-medium capitalize transition-colors ${
                                  impactFilter === filterKey
                                    ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                {filterKey === 'warning' ? 'Degraded' : filterKey}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Hop-by-hop cascade playback bar */}
                        {maxCascadeHop > 0 && (
                          <div className="mt-2.5 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-alt)] px-2.5 py-1.5">
                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsReplaying(false);
                                  setVisibleHop(null);
                                }}
                                className={`min-h-[32px] rounded-lg px-2.5 text-[11px] font-medium whitespace-nowrap ${
                                  visibleHop === null
                                    ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                All hops
                              </button>
                              {Array.from({ length: maxCascadeHop + 1 }, (_, h) => (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => {
                                    setIsReplaying(false);
                                    setVisibleHop(h);
                                  }}
                                  className={`min-h-[32px] rounded-lg px-2 font-mono text-[11px] whitespace-nowrap ${
                                    visibleHop === h
                                      ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                  }`}
                                >
                                  H{h}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (isReplaying) {
                                  setIsReplaying(false);
                                } else {
                                  setVisibleHop(0);
                                  setIsReplaying(true);
                                }
                              }}
                              className={`flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium ${theme.accentSoft} ${theme.accentInk}`}
                            >
                              {isReplaying ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                              <span>{isReplaying ? 'Stop' : 'Replay'}</span>
                            </button>
                          </div>
                        )}

                        <div className="mt-2 flex-1 min-h-0 overflow-y-auto no-scrollbar touch-pan divide-y divide-[var(--border-hairline)]">
                          {filteredCascade.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)] py-8">
                              {visibleHop === 0
                                ? `Hop 0: ${simulation.root_cause} failed. Advance hops to view cascade.`
                                : 'No downstream services affected under this filter.'}
                            </div>
                          ) : (
                            filteredCascade.map((entry) => {
                              const isBroken = entry.state === 'broken';
                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedNodeId(entry.id);
                                    setActiveTab('topology');
                                  }}
                                  className="flex w-full min-h-[58px] items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]/50 rounded-lg px-2"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                      <span className="font-mono truncate">{entry.id}</span>
                                      <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
                                      <span className={isBroken ? 'text-xs text-rose-500' : 'text-xs text-amber-500'}>
                                        {isBroken ? 'Broken' : 'Degraded'}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                                      {entry.reason}
                                    </div>
                                  </div>
                                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                                    Hop {entry.hop}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </main>

        {/* Mobile / Touch Bottom Dock (< md, compact 64px height) */}
        <nav
          aria-label="Mobile navigation"
          className="fixed bottom-0 left-0 right-0 z-30 grid h-16 grid-cols-4 border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/95 backdrop-blur-md md:hidden"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex min-h-[48px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  isActive ? theme.accentInk : 'text-[var(--text-muted)]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobile-nav-indicator"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute top-0 h-0.5 w-10 rounded-full"
                    style={{ backgroundColor: theme.swatch }}
                  />
                )}
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* Touch-friendly Source & Background Bottom Sheet / Modal */}
        <AnimatePresence>
          {sourceSheetOpen && (
            <motion.div
              key="source-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setSourceSheetOpen(false)}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
            >
              <motion.div
                key="source-sheet"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE_SMOOTH }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-t-3xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:rounded-2xl sm:p-6"
              >
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--border-hairline)] sm:hidden" />

                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                      Source & Surface
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Analyze a repo, paste a manifest, or switch background theme.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSourceSheetOpen(false)}
                    aria-label="Close source sheet"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Background selector */}
                <div className="mt-4">
                  <span className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                    Background theme
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                      const item = THEMES[id];
                      const active = themeId === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setThemeId(id)}
                          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${
                            active
                              ? `${theme.accentBorder} ${theme.accentSoft} text-[var(--text-primary)]`
                              : 'border-[var(--border-hairline)] bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <span
                            className="h-3 w-3 rounded-full border border-black/20"
                            style={{ backgroundColor: item.swatch }}
                          />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Source input mode switcher */}
                <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-alt)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSourceTab('github');
                      setSourceError(null);
                    }}
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                      sourceTab === 'github'
                        ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    GitHub URL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceTab('manifest');
                      setSourceError(null);
                    }}
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                      sourceTab === 'manifest'
                        ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Paste Manifest
                  </button>
                </div>

                {sourceTab === 'github' ? (
                  <form onSubmit={handleAnalyzeRepo} className="mt-4 space-y-3">
                    <label htmlFor="repo-input" className="block text-xs font-medium text-[var(--text-secondary)]">
                      GitHub repository URL
                    </label>
                    <input
                      id="repo-input"
                      type="url"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/organization/repository"
                      className="min-h-[48px] w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-alt)] px-3.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                    />

                    {sourceError && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-500">
                        {sourceError}
                      </div>
                    )}

                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.98 }}
                      disabled={isLoadingSource}
                      className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText}`}
                    >
                      <GitBranch className="h-4 w-4" />
                      <span>{isLoadingSource ? 'Analyzing repository…' : 'Analyze Repository'}</span>
                    </motion.button>
                  </form>
                ) : (
                  <form onSubmit={handleImportManifest} className="mt-4 space-y-3">
                    <label htmlFor="manifest-input" className="block text-xs font-medium text-[var(--text-secondary)]">
                      docker-compose.yml, package.json, or exported JSON
                    </label>
                    <textarea
                      id="manifest-input"
                      rows={4}
                      value={manifestText}
                      onChange={(e) => setManifestText(e.target.value)}
                      placeholder={'services:\n  api:\n    depends_on:\n      - postgres\n  postgres: {}'}
                      className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-alt)] p-3 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                    />

                    {sourceError && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-500">
                        {sourceError}
                      </div>
                    )}

                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.98 }}
                      className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText}`}
                    >
                      <FileCode2 className="h-4 w-4" />
                      <span>Parse Manifest</span>
                    </motion.button>
                  </form>
                )}

                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-[var(--border-hairline)]" />
                  <span className="text-xs text-[var(--text-muted)]">or</span>
                  <div className="h-px flex-1 bg-[var(--border-hairline)]" />
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLoadDemo}
                  disabled={isLoadingSource}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 text-sm font-medium text-[var(--text-primary)] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Zap className={`h-4 w-4 ${theme.accentInk}`} />
                  <span>Load E-Commerce Demo</span>
                </motion.button>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
                  <button
                    type="button"
                    onClick={handleCheckBackend}
                    className="inline-flex min-h-[38px] items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>Check local FastAPI (port 8000)</span>
                  </button>
                  <span>
                    {backendStatus === 'online'
                      ? 'Connected'
                      : backendStatus === 'offline'
                        ? 'Using built-in engine'
                        : 'Auto fallback ready'}
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Minimal Floating Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key="toast"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.18, ease: EASE_SMOOTH }}
              className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 md:bottom-6"
            >
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-medium text-[var(--text-primary)] shadow-lg backdrop-blur-md whitespace-nowrap">
                <Check className={`h-3.5 w-3.5 ${theme.accentInk}`} />
                <span>{toast}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function EmptyWorkspace({
  theme,
  onOpenSource,
  onLoadDemo,
}: {
  theme: ThemePalette;
  onOpenSource: () => void;
  onLoadDemo: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)]/70 p-6 text-center">
      <Network className={`h-7 w-7 mb-3 ${theme.accentInk}`} />
      <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">No architecture loaded</h2>
      <p className="mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">
        Load the sample E-Commerce topology, analyze a GitHub repo, or paste a manifest to unlock this view.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onLoadDemo}
          className={`flex min-h-[46px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${theme.accentBg} ${theme.accentBgHover} ${theme.accentText}`}
        >
          <Zap className="h-4 w-4" />
          <span>Load Demo</span>
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onOpenSource}
          className="flex min-h-[46px] items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)]"
        >
          <GitBranch className="h-4 w-4" />
          <span>Repo or Manifest</span>
        </motion.button>
      </div>
    </div>
  );
}
