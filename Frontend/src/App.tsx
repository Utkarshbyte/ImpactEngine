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
  Flame,
  FolderGit2,
  GitBranch,
  Layers,
  LayoutGrid,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react';
import {
  checkBackendHealth,
  computeGraphLayout,
  getNodeStateMap,
  ingestGithubRepository,
  loadEcommerceArchitecture,
  runFailureSimulation,
  type FailureType,
  type GraphData,
  type NodeVisualState,
  type SimulationResult,
} from './engine';

type TabId = 'overview' | 'topology' | 'simulate' | 'impact';

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'topology', label: 'Topology', icon: Network },
  { id: 'simulate', label: 'Simulate', icon: Flame },
  { id: 'impact', label: 'Impact', icon: Activity },
];

const EASE_SMOOTH = [0.16, 1, 0.3, 1] as const;

interface TopologyCanvasProps {
  graph: GraphData;
  simulation: SimulationResult | null;
  selectedNodeId: string | null;
  mitigatedNodes?: string[];
  onSelectNode: (id: string) => void;
  compact?: boolean;
}

function TopologyCanvas({
  graph,
  simulation,
  selectedNodeId,
  mitigatedNodes = [],
  onSelectNode,
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
    () => getNodeStateMap(simulation, mitigatedNodes),
    [simulation, mitigatedNodes]
  );

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [graph]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-node-hit="true"]')) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }
    setPan({
      x: Math.max(-320, Math.min(320, dragRef.current.origX + dx)),
      y: Math.max(-220, Math.min(220, dragRef.current.origY + dy)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }
    }
  };

  const palette: Record<NodeVisualState, { stroke: string; fill: string; core: string }> = {
    normal: { stroke: '#38BDF8', fill: '#0F2438', core: '#38BDF8' },
    root: { stroke: '#F43F5E', fill: '#3B1220', core: '#FB7185' },
    broken: { stroke: '#FB7185', fill: '#331420', core: '#F43F5E' },
    warning: { stroke: '#F59E0B', fill: '#332410', core: '#FBBF24' },
    mitigated: { stroke: '#34D399', fill: '#0E2E26', core: '#34D399' },
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0B111B]">
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
            <circle cx="1.5" cy="1.5" r="1" fill="#334155" opacity="0.45" />
          </pattern>
          <marker id="ie-arrow-muted" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
            <path d="M0 0 L7 3.5 L0 7 z" fill="#475569" />
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
              (srcState === 'root' || srcState === 'broken' || srcState === 'warning') &&
              (tgtState === 'warning' || tgtState === 'broken');
            const isSelectedLink = selectedNodeId === edge.source || selectedNodeId === edge.target;

            const stroke = isBrokenLink
              ? '#F43F5E'
              : isWarnLink
                ? '#F59E0B'
                : isSelectedLink
                  ? '#38BDF8'
                  : '#334155';

            const marker = isBrokenLink
              ? 'url(#ie-arrow-impact)'
              : isWarnLink
                ? 'url(#ie-arrow-warn)'
                : 'url(#ie-arrow-muted)';

            return (
              <line
                key={`${edge.source}-${edge.target}-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={isSelectedLink || isBrokenLink || isWarnLink ? 2 : 1.4}
                strokeDasharray={edge.dependency_type === 'soft' ? '5 5' : undefined}
                opacity={isBrokenLink || isWarnLink || isSelectedLink ? 0.92 : 0.65}
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
                {/* Minimum 44px+ touch hit target */}
                <circle cx={node.x} cy={node.y} r={32} fill="transparent" />

                {isSelected && (
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={25}
                    fill="none"
                    stroke="#BAE6FD"
                    strokeWidth={1.5}
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
                  stroke={isSelected ? '#E0F2FE' : colors.stroke}
                  strokeWidth={isSelected ? 2.4 : 1.75}
                />

                <circle cx={node.x} cy={node.y} r={5.5} fill={colors.core} />

                <rect
                  x={node.x - pillW / 2}
                  y={node.y + 24}
                  width={pillW}
                  height={23}
                  rx={6}
                  fill="#090D14"
                  fillOpacity={0.92}
                  stroke={isSelected ? '#38BDF8' : '#1E293B'}
                  strokeWidth={1}
                />

                <text
                  x={node.x}
                  y={node.y + 39}
                  textAnchor="middle"
                  fill={isSelected ? '#F8FAFC' : '#CBD5E1'}
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

      {/* Bottom-left minimal legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[#090D14]/85 px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur-sm border border-slate-800/70">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          Nominal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Failed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Degraded
        </span>
        {!compact && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-slate-500">
            <span className="inline-block w-3 border-t border-dashed border-slate-400" />
            Soft fallback
          </span>
        )}
      </div>

      {/* Bottom-right touch-friendly zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-slate-800/80 bg-[#0F1622]/90 p-1 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(2))))}
          aria-label="Zoom out"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white active:scale-95"
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
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2, Number((z + 0.2).toFixed(2))))}
          aria-label="Zoom in"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simTarget, setSimTarget] = useState<string>('');
  const [simMode, setSimMode] = useState<FailureType>('down');
  const [mitigatedNodes, setMitigatedNodes] = useState<string[]>([]);

  const [impactFilter, setImpactFilter] = useState<'all' | 'broken' | 'warning'>('all');

  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
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

  const applyNewGraph = useCallback((nextGraph: GraphData, label: string) => {
    setGraph(nextGraph);
    setSourceLabel(label);
    const firstId = nextGraph.nodes[0]?.id ?? null;
    setSelectedNodeId(firstId);
    setSimTarget(firstId ?? '');
    setMitigatedNodes([]);
    setSimulation(null);
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

  const handleRunSimulation = useCallback(async () => {
    if (!graph || !simTarget) return;
    setIsSimulating(true);
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

  const stats = useMemo(() => {
    const nodeCount = graph?.nodes.length ?? 0;
    const edgeCount = graph?.edges.length ?? 0;
    const affected = simulation?.blast_radius_count ?? 0;
    const broken = simulation?.broken_count ?? 0;
    const warning = simulation?.warning_count ?? 0;
    const pct = nodeCount > 0 && simulation ? ((affected / nodeCount) * 100).toFixed(1) : '0.0';
    return { nodeCount, edgeCount, affected, broken, warning, pct };
  }, [graph, simulation]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graph, selectedNodeId]
  );

  const selectedRelations = useMemo(() => {
    if (!graph || !selectedNodeId) return { inbound: [] as string[], outbound: [] as string[] };
    const inbound = graph.edges.filter((e) => e.target === selectedNodeId).map((e) => e.source);
    const outbound = graph.edges.filter((e) => e.source === selectedNodeId).map((e) => e.target);
    return { inbound, outbound };
  }, [graph, selectedNodeId]);

  const filteredCascade = useMemo(() => {
    if (!simulation) return [];
    if (impactFilter === 'all') return simulation.cascade;
    if (impactFilter === 'broken') return simulation.cascade.filter((c) => c.state === 'broken');
    return simulation.cascade.filter((c) => c.state !== 'broken');
  }, [simulation, impactFilter]);

  const toggleMitigation = (nodeId: string) => {
    setMitigatedNodes((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#090D14] text-slate-100">
        {/* Top Bar Contract: Brand — Single-Line Tabs — 1 Primary Action */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-8 border-b border-slate-800/80 bg-[#090D14]/95 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="flex min-h-[44px] items-center gap-2.5 whitespace-nowrap shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-lg"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
              <Layers className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-slate-50">
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
                  className={`relative flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="desktop-nav-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-slate-800/80 border border-slate-700/70"
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
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <FolderGit2 className="h-4 w-4" />
            <span>{graph ? 'Change Source' : 'Load Source'}</span>
          </motion.button>
        </header>

        {/* Main Viewport — Strictly zero scrollbars */}
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
                <div className="grid shrink-0 grid-cols-2 lg:grid-cols-4 rounded-2xl border border-slate-800/80 bg-[#0F1622] divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
                  <div className="px-4 py-3.5 sm:px-5">
                    <div className="text-xs font-medium text-slate-400">Services indexed</div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-50">
                      {stats.nodeCount}
                    </div>
                  </div>
                  <div className="px-4 py-3.5 sm:px-5 border-l border-slate-800/80 lg:border-l-0">
                    <div className="text-xs font-medium text-slate-400">Dependencies</div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-50">
                      {stats.edgeCount}
                    </div>
                  </div>
                  <div className="px-4 py-3.5 sm:px-5">
                    <div className="text-xs font-medium text-slate-400">Simulation</div>
                    <div className="mt-1 font-display text-xl sm:text-2xl font-semibold text-slate-50">
                      {simulation ? 'Complete' : 'Standby'}
                    </div>
                  </div>
                  <div className="px-4 py-3.5 sm:px-5 border-l border-slate-800/80 lg:border-l-0">
                    <div className="text-xs font-medium text-slate-400">Blast radius</div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-50">
                      {simulation ? `${stats.affected} (${stats.pct}%)` : '—'}
                    </div>
                  </div>
                </div>

                {/* Primary 2-Column Split */}
                <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1.65fr_1fr]">
                  {!graph ? (
                    <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-[#0F1622]/60 p-6 text-center">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-400">
                        <Network className="h-6 w-6" />
                      </div>
                      <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-50 text-balance">
                        Map service dependencies and test failure cascades
                      </h1>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                        Load the built-in E-Commerce service mesh or analyze any public GitHub repository to explore upstream and downstream impact.
                      </p>
                      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={handleLoadDemo}
                          disabled={isLoadingSource}
                          className="flex min-h-[46px] items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60"
                        >
                          <Zap className="h-4 w-4" />
                          <span>{isLoadingSource ? 'Loading…' : 'Load E-Commerce Demo'}</span>
                        </motion.button>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setSourceSheetOpen(true)}
                          className="flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
                        >
                          <GitBranch className="h-4 w-4" />
                          <span>Connect GitHub Repo</span>
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-0 flex-col gap-3">
                      <div className="flex shrink-0 items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                          <span className="font-medium text-slate-200 truncate">{sourceLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{stats.nodeCount} nodes</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('topology')}
                          className="flex min-h-[36px] items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0"
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
                          compact
                        />
                      </div>
                    </div>
                  )}

                  {/* Workflow Guide Panel */}
                  <div className="hidden lg:flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-800/80 bg-[#0F1622] p-6">
                    <div>
                      <h2 className="font-display text-base font-semibold text-slate-100">
                        Analysis Workflow
                      </h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Modeled dependency analysis with zero impact on live systems.
                      </p>

                      <div className="mt-5 divide-y divide-slate-800/80">
                        <button
                          type="button"
                          onClick={() => setSourceSheetOpen(true)}
                          className="group flex w-full min-h-[60px] items-center justify-between py-3.5 text-left transition-colors"
                        >
                          <div>
                            <div className="text-xs font-medium text-sky-400">01. Discover</div>
                            <div className="mt-0.5 text-sm font-medium text-slate-200 group-hover:text-white">
                              Index repository or demo mesh
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('topology')}
                          className="group flex w-full min-h-[60px] items-center justify-between py-3.5 text-left transition-colors"
                        >
                          <div>
                            <div className="text-xs font-medium text-sky-400">02. Explore</div>
                            <div className="mt-0.5 text-sm font-medium text-slate-200 group-hover:text-white">
                              Inspect upstream & downstream links
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('simulate')}
                          className="group flex w-full min-h-[60px] items-center justify-between py-3.5 text-left transition-colors"
                        >
                          <div>
                            <div className="text-xs font-medium text-sky-400">03. Simulate</div>
                            <div className="mt-0.5 text-sm font-medium text-slate-200 group-hover:text-white">
                              Test outages, latency & circuit breakers
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800/80">
                      {graph ? (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setActiveTab('simulate')}
                          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-white"
                        >
                          <Flame className="h-4 w-4" />
                          <span>Run Failure Simulation</span>
                        </motion.button>
                      ) : (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={handleLoadDemo}
                          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
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
                  <EmptyWorkspace onOpenSource={() => setSourceSheetOpen(true)} onLoadDemo={handleLoadDemo} />
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
                      />
                    </div>

                    {/* Touch-friendly Service Inspector */}
                    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800/80 bg-[#0F1622] p-4 sm:p-5">
                      <div className="flex shrink-0 items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate-400">Service Inspector</span>
                        <select
                          aria-label="Select service component"
                          value={selectedNodeId ?? ''}
                          onChange={(e) => {
                            setSelectedNodeId(e.target.value);
                            setSimTarget(e.target.value);
                          }}
                          className="min-h-[44px] max-w-[200px] rounded-xl border border-slate-700/80 bg-slate-900 px-3 text-sm font-medium text-slate-100 focus:border-sky-400 focus:outline-none"
                        >
                          {graph.nodes.map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedNode && (
                        <div className="mt-4 flex flex-1 min-h-0 flex-col justify-between overflow-y-auto no-scrollbar touch-pan">
                          <div>
                            <h2 className="font-display text-xl font-semibold text-slate-50">
                              {selectedNode.label}
                            </h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="font-mono text-slate-300">{selectedNode.id}</span>
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
                              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                                {selectedNode.description}
                              </p>
                            )}

                            <div className="mt-5 grid grid-cols-2 divide-x divide-slate-800/80 rounded-xl border border-slate-800/80 bg-[#0B111B]">
                              <div className="px-4 py-3">
                                <div className="text-xs text-slate-400">Upstream deps</div>
                                <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-slate-100">
                                  {selectedRelations.inbound.length}
                                </div>
                              </div>
                              <div className="px-4 py-3">
                                <div className="text-xs text-slate-400">Downstream consumers</div>
                                <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-slate-100">
                                  {selectedRelations.outbound.length}
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 space-y-4">
                              <div>
                                <div className="text-xs font-medium text-slate-400 mb-2">
                                  Upstream providers
                                </div>
                                {selectedRelations.inbound.length === 0 ? (
                                  <div className="text-xs text-slate-500">No upstream providers</div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedRelations.inbound.map((id) => (
                                      <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedNodeId(id)}
                                        className="min-h-[38px] rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 font-mono text-xs text-slate-200 transition-colors hover:border-sky-500/60 hover:text-white active:scale-95"
                                      >
                                        {id}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="text-xs font-medium text-slate-400 mb-2">
                                  Downstream dependents
                                </div>
                                {selectedRelations.outbound.length === 0 ? (
                                  <div className="text-xs text-slate-500">No downstream dependents</div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedRelations.outbound.map((id) => (
                                      <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedNodeId(id)}
                                        className="min-h-[38px] rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 font-mono text-xs text-slate-200 transition-colors hover:border-sky-500/60 hover:text-white active:scale-95"
                                      >
                                        {id}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 pt-4 border-t border-slate-800/80">
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => {
                                setSimTarget(selectedNode.id);
                                setActiveTab('simulate');
                              }}
                              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-sky-500/15 border border-sky-500/30 px-4 py-2.5 text-sm font-medium text-sky-300 transition-colors hover:bg-sky-500/25"
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
                  <EmptyWorkspace onOpenSource={() => setSourceSheetOpen(true)} onLoadDemo={handleLoadDemo} />
                ) : (
                  <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
                    {/* Chaos Controls */}
                    <div className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-slate-800/80 bg-[#0F1622] p-4 sm:p-5 overflow-y-auto no-scrollbar touch-pan">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="font-display text-base font-semibold text-slate-100">
                            Failure Parameters
                          </h2>
                          {simulation && (
                            <button
                              type="button"
                              onClick={() => setSimulation(null)}
                              className="min-h-[36px] px-2 text-xs font-medium text-slate-400 hover:text-slate-200"
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        <div>
                          <label htmlFor="sim-target" className="block text-xs font-medium text-slate-400 mb-1.5">
                            Target service
                          </label>
                          <select
                            id="sim-target"
                            value={simTarget}
                            onChange={(e) => {
                              setSimTarget(e.target.value);
                              setSelectedNodeId(e.target.value);
                              setMitigatedNodes((prev) => prev.filter((id) => id !== e.target.value));
                            }}
                            className="min-h-[46px] w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 text-sm font-medium text-slate-100 focus:border-sky-400 focus:outline-none"
                          >
                            {graph.nodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.label} ({n.id})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <span className="block text-xs font-medium text-slate-400 mb-1.5">
                            Failure mode
                          </span>
                          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#090D14] p-1 border border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => setSimMode('down')}
                              className={`min-h-[42px] rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                simMode === 'down'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Hard Crash
                            </button>
                            <button
                              type="button"
                              onClick={() => setSimMode('degraded')}
                              className={`min-h-[42px] rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                simMode === 'degraded'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Latency Spike
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-slate-400">
                              Protected services (circuit breakers)
                            </span>
                            {mitigatedNodes.length > 0 && (
                              <span className="font-mono text-xs text-emerald-400 tabular-nums">
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
                                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                                        : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200'
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

                      <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2.5">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={handleRunSimulation}
                          disabled={isSimulating || !simTarget}
                          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60"
                        >
                          <Flame className="h-4 w-4" />
                          <span>{isSimulating ? 'Simulating…' : 'Run Simulation'}</span>
                        </motion.button>

                        {simulation && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('impact')}
                            className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-slate-800 bg-[#0B111B] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-700"
                          >
                            <span>
                              {simulation.blast_radius_count} services impacted · {simulation.criticality}
                            </span>
                            <ArrowRight className="h-4 w-4 text-sky-400" />
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
                  <EmptyWorkspace onOpenSource={() => setSourceSheetOpen(true)} onLoadDemo={handleLoadDemo} />
                ) : !simulation ? (
                  <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-[#0F1622]/60 p-6 text-center">
                    <AlertTriangle className="h-7 w-7 text-amber-400 mb-3" />
                    <h2 className="font-display text-xl font-semibold text-slate-100">
                      Run a failure simulation first
                    </h2>
                    <p className="mt-1.5 max-w-md text-sm text-slate-400">
                      Choose a target component in the Simulate tab to calculate cascading blast radius and mitigation impact.
                    </p>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setActiveTab('simulate')}
                      className="mt-5 flex min-h-[46px] items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
                    >
                      <Flame className="h-4 w-4" />
                      <span>Open Failure Simulator</span>
                    </motion.button>
                  </div>
                ) : (
                  <>
                    {/* Impact Summary Strip */}
                    <div className="grid shrink-0 grid-cols-2 lg:grid-cols-4 rounded-2xl border border-slate-800/80 bg-[#0F1622] divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
                      <div className="px-4 py-3 sm:px-5">
                        <div className="text-xs text-slate-400">Blast radius</div>
                        <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-50">
                          {stats.affected}{' '}
                          <span className="text-sm font-normal text-slate-400">({stats.pct}%)</span>
                        </div>
                      </div>
                      <div className="px-4 py-3 sm:px-5 border-l border-slate-800/80 lg:border-l-0">
                        <div className="text-xs text-slate-400">Hard failures</div>
                        <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-rose-400">
                          {stats.broken}
                        </div>
                      </div>
                      <div className="px-4 py-3 sm:px-5">
                        <div className="text-xs text-slate-400">Degraded</div>
                        <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-400">
                          {stats.warning}
                        </div>
                      </div>
                      <div className="px-4 py-3 sm:px-5 border-l border-slate-800/80 lg:border-l-0 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-400">Root cause</div>
                          <div className="mt-1 truncate font-mono text-sm font-semibold text-slate-100">
                            {simulation.root_cause}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleExportReport}
                          aria-label="Download impact report"
                          className="flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 active:scale-95"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Disrupted Business Capabilities Strip */}
                    {simulation.business_impact && simulation.business_impact.length > 0 && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-slate-800/80 bg-[#0F1622] px-4 py-2.5 sm:px-5">
                        <span className="text-xs font-medium text-slate-400">
                          Disrupted business capabilities:
                        </span>
                        {simulation.business_impact.map((fn) => (
                          <span
                            key={fn}
                            className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300"
                          >
                            {fn}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Split View: Graph & Cascade Breakdown */}
                    <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
                      <div className="hidden sm:block min-h-0 h-full">
                        <TopologyCanvas
                          graph={graph}
                          simulation={simulation}
                          selectedNodeId={selectedNodeId}
                          mitigatedNodes={mitigatedNodes}
                          onSelectNode={(id) => setSelectedNodeId(id)}
                          compact
                        />
                      </div>

                      <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800/80 bg-[#0F1622] p-4 sm:p-5">
                        <div className="flex shrink-0 items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                          <div>
                            <h2 className="font-display text-base font-semibold text-slate-100">
                              Cascade Breakdown
                            </h2>
                            <div className="text-xs text-slate-400">
                              {simulation.criticality} · {simulation.failure_type === 'down' ? 'Hard crash' : 'Latency spike'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 rounded-xl bg-[#090D14] p-1 border border-slate-800/80">
                            {(['all', 'broken', 'warning'] as const).map((filterKey) => (
                              <button
                                key={filterKey}
                                type="button"
                                onClick={() => setImpactFilter(filterKey)}
                                className={`min-h-[34px] rounded-lg px-2.5 text-xs font-medium capitalize transition-colors ${
                                  impactFilter === filterKey
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {filterKey === 'warning' ? 'Degraded' : filterKey}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="mt-2 flex-1 min-h-0 overflow-y-auto no-scrollbar touch-pan divide-y divide-slate-800/70">
                          {filteredCascade.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500 py-8">
                              No downstream services affected under this filter.
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
                                  className="flex w-full min-h-[58px] items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-slate-800/30 rounded-lg px-2"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                                      <span className="font-mono truncate">{entry.id}</span>
                                      <span aria-hidden="true" className="text-slate-600">·</span>
                                      <span className={isBroken ? 'text-xs text-rose-400' : 'text-xs text-amber-400'}>
                                        {isBroken ? 'Broken' : 'Degraded'}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 truncate text-xs text-slate-400">
                                      {entry.reason}
                                    </div>
                                  </div>
                                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">
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
          className="fixed bottom-0 left-0 right-0 z-30 grid h-16 grid-cols-4 border-t border-slate-800/80 bg-[#090D14]/95 backdrop-blur-md md:hidden"
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
                  isActive ? 'text-sky-400' : 'text-slate-400'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobile-nav-indicator"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute top-0 h-0.5 w-10 rounded-full bg-sky-400"
                  />
                )}
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* Touch-friendly Source Ingestion Bottom Sheet / Modal */}
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
                className="w-full max-w-lg rounded-t-3xl border border-slate-800 bg-[#0F1622] p-5 sm:rounded-2xl sm:p-6"
              >
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700 sm:hidden" />

                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-50">
                      Architecture Source
                    </h2>
                    <p className="text-xs text-slate-400">
                      Analyze a GitHub repository or load the sample service mesh.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSourceSheetOpen(false)}
                    aria-label="Close source sheet"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleAnalyzeRepo} className="mt-5 space-y-3">
                  <label htmlFor="repo-input" className="block text-xs font-medium text-slate-300">
                    GitHub repository URL
                  </label>
                  <input
                    id="repo-input"
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/organization/repository"
                    className="min-h-[48px] w-full rounded-xl border border-slate-700/80 bg-[#090D14] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />

                  {sourceError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
                      {sourceError}
                    </div>
                  )}

                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoadingSource}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60"
                  >
                    <GitBranch className="h-4 w-4" />
                    <span>{isLoadingSource ? 'Analyzing repository…' : 'Analyze Repository'}</span>
                  </motion.button>
                </form>

                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-800" />
                  <span className="text-xs text-slate-500">or</span>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLoadDemo}
                  disabled={isLoadingSource}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-60"
                >
                  <Zap className="h-4 w-4 text-sky-400" />
                  <span>Load E-Commerce Demo</span>
                </motion.button>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={handleCheckBackend}
                    className="inline-flex min-h-[38px] items-center gap-1.5 text-slate-300 hover:text-white"
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
              <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/95 px-4 py-2.5 text-xs font-medium text-slate-100 shadow-lg backdrop-blur-md whitespace-nowrap">
                <Check className="h-3.5 w-3.5 text-sky-400" />
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
  onOpenSource,
  onLoadDemo,
}: {
  onOpenSource: () => void;
  onLoadDemo: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-[#0F1622]/60 p-6 text-center">
      <Network className="h-7 w-7 text-sky-400 mb-3" />
      <h2 className="font-display text-xl font-semibold text-slate-100">No architecture loaded</h2>
      <p className="mt-1.5 max-w-md text-sm text-slate-400">
        Load the sample E-Commerce topology or analyze a GitHub repository to unlock this view.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onLoadDemo}
          className="flex min-h-[46px] items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
        >
          <Zap className="h-4 w-4" />
          <span>Load Demo</span>
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onOpenSource}
          className="flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          <GitBranch className="h-4 w-4" />
          <span>GitHub URL</span>
        </motion.button>
      </div>
    </div>
  );
}