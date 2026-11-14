export type FailureType = 'down' | 'degraded';
export type NodeVisualState = 'normal' | 'root' | 'broken' | 'warning' | 'mitigated';

export interface GraphNode {
  id: string;
  label: string;
  tier?: string;
  protocol?: string;
  description?: string;
  criticality?: number;
  business_functions?: string[];
  base_latency_ms?: number;
  sla_ms?: number;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  dependency_type?: 'hard' | 'soft';
  propagation?: string;
  weight?: number;
}

export interface GraphData {
  id?: string;
  name?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CascadeEntry {
  id: string;
  name?: string;
  state: 'broken' | 'warning';
  hop: number;
  reason: string;
  simulated_latency_ms?: number | null;
  business_functions?: string[];
}

export interface SimulationResult {
  root_cause: string;
  failure_type: FailureType;
  blast_radius_count: number;
  broken_count: number;
  warning_count: number;
  criticality: string;
  criticality_score?: number;
  business_impact?: string[];
  cascade: CascadeEntry[];
}

const API_BASE = 'http://127.0.0.1:8000';

const PROTOCOL_BY_TYPE: Record<string, string> = {
  database: 'TCP / SQL',
  cache: 'RESP / TCP',
  gateway: 'HTTPS / REST',
  pipeline: 'Async Stream',
  frontend: 'HTTPS',
  service: 'gRPC / REST',
};

function normalizeBackendGraph(raw: any): GraphData {
  const nodes: GraphNode[] = (raw.nodes || []).map((n: any) => {
    const nodeType = String(n.type || 'service');
    const bizList: string[] = Array.isArray(n.business_functions) ? n.business_functions : [];
    return {
      id: String(n.id),
      label: String(n.name || n.label || n.id),
      tier: nodeType.toUpperCase(),
      protocol: n.protocol || PROTOCOL_BY_TYPE[nodeType.toLowerCase()] || 'REST',
      description:
        n.description ||
        (bizList.length > 0
          ? `Supports ${bizList.join(', ')} · SLA ${n.sla_ms ?? 500}ms (Crit ${n.criticality ?? 3}/5)`
          : `Service tier: ${nodeType}`),
      criticality: n.criticality ?? 3,
      business_functions: bizList,
      base_latency_ms: n.base_latency_ms ?? 30,
      sla_ms: n.sla_ms ?? 500,
      position: n.position,
    };
  });

  const edges: GraphEdge[] = (raw.edges || []).map((e: any, idx: number) => {
    const prop = String(e.propagation || e.dependency_type || 'HARD').toUpperCase();
    return {
      id: e.id || `e-${e.source}-${e.target}-${idx}`,
      source: String(e.source),
      target: String(e.target),
      dependency_type: prop === 'HARD' ? 'hard' : 'soft',
      propagation: prop,
      weight: e.weight ?? 1.0,
    };
  });

  return {
    id: raw.id || 'ecommerce-core',
    name: raw.name || 'Infrastructure Topology',
    nodes,
    edges,
  };
}

function normalizeSimulationResult(raw: any, requestedMode: FailureType): SimulationResult {
  const cascade: CascadeEntry[] = (raw.affected_nodes || []).map((n: any) => ({
    id: String(n.id),
    name: String(n.name || n.id),
    state: String(n.state).toUpperCase() === 'DOWN' ? 'broken' : 'warning',
    hop: Number(n.hop ?? 1),
    reason: String(n.reason || 'Propagated dependency impact'),
    simulated_latency_ms: n.simulated_latency_ms ?? null,
    business_functions: n.business_functions || [],
  }));

  const severity = String(raw.severity || 'MEDIUM').toUpperCase();
  const score = raw.criticality_score != null ? ` · ${raw.criticality_score}/10` : '';

  return {
    root_cause: String(raw.scenario?.node || raw.root_cause || ''),
    failure_type: requestedMode,
    blast_radius_count: Number(raw.blast_radius?.affected ?? cascade.length),
    broken_count: Number(
      raw.blast_radius?.down_count ?? cascade.filter((c) => c.state === 'broken').length
    ),
    warning_count: Number(
      raw.blast_radius?.degraded_count ?? cascade.filter((c) => c.state !== 'broken').length
    ),
    criticality: `${severity}${score}`,
    criticality_score: raw.criticality_score,
    business_impact: Array.isArray(raw.business_impact) ? raw.business_impact : [],
    cascade,
  };
}

const FALLBACK_GRAPH: GraphData = normalizeBackendGraph({
  id: 'ecommerce-core',
  name: 'E-Commerce Core Infrastructure',
  nodes: [
    { id: 'postgres', name: 'Primary Postgres DB', type: 'database', criticality: 5, base_latency_ms: 35, sla_ms: 300, business_functions: ['Persistent Storage', 'Transaction Ledger'], position: { x: 80, y: 260 } },
    { id: 'redis', name: 'Redis Session Cache', type: 'cache', criticality: 3, base_latency_ms: 5, sla_ms: 80, business_functions: ['Fast Session Lookup'], position: { x: 80, y: 80 } },
    { id: 'auth', name: 'Auth Service', type: 'service', criticality: 5, base_latency_ms: 25, sla_ms: 250, business_functions: ['User Authentication'], position: { x: 340, y: 80 } },
    { id: 'payment', name: 'Payment API', type: 'service', criticality: 5, base_latency_ms: 110, sla_ms: 1200, business_functions: ['Payment Processing', 'Revenue Collection'], position: { x: 340, y: 220 } },
    { id: 'inventory', name: 'Inventory Service', type: 'service', criticality: 4, base_latency_ms: 40, sla_ms: 350, business_functions: ['Stock Reservation'], position: { x: 340, y: 380 } },
    { id: 'checkout', name: 'Checkout Service', type: 'service', criticality: 5, base_latency_ms: 50, sla_ms: 600, business_functions: ['Customer Purchase'], position: { x: 620, y: 220 } },
    { id: 'orders', name: 'Order Service', type: 'service', criticality: 4, base_latency_ms: 45, sla_ms: 500, business_functions: ['Order Processing', 'Fulfillment Dispatch'], position: { x: 880, y: 280 } },
    { id: 'revenue', name: 'Revenue Pipeline', type: 'pipeline', criticality: 4, base_latency_ms: 90, sla_ms: 3000, business_functions: ['Revenue Generation'], position: { x: 1140, y: 200 } },
    { id: 'analytics', name: 'Analytics Engine', type: 'service', criticality: 2, base_latency_ms: 140, sla_ms: 8000, business_functions: ['Business Intelligence'], position: { x: 1140, y: 380 } },
  ],
  edges: [
    { source: 'redis', target: 'auth', propagation: 'SOFT' },
    { source: 'postgres', target: 'payment', propagation: 'HARD' },
    { source: 'postgres', target: 'inventory', propagation: 'HARD' },
    { source: 'postgres', target: 'orders', propagation: 'HARD' },
    { source: 'auth', target: 'checkout', propagation: 'HARD' },
    { source: 'payment', target: 'checkout', propagation: 'HARD' },
    { source: 'inventory', target: 'checkout', propagation: 'SOFT' },
    { source: 'checkout', target: 'orders', propagation: 'SOFT' },
    { source: 'orders', target: 'revenue', propagation: 'SOFT' },
    { source: 'orders', target: 'analytics', propagation: 'OPTIONAL' },
    { source: 'revenue', target: 'analytics', propagation: 'SOFT' },
  ],
});

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadEcommerceArchitecture(): Promise<{
  graph: GraphData;
  via: 'backend' | 'fallback';
}> {
  try {
    const res = await fetch(`${API_BASE}/graph?graph_id=ecommerce-core`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error('Backend unavailable');
    const data = await res.json();
    return { graph: normalizeBackendGraph(data), via: 'backend' };
  } catch {
    return { graph: FALLBACK_GRAPH, via: 'fallback' };
  }
}

export async function ingestGithubRepository(
  repoUrl: string
): Promise<{ graph: GraphData; source: string }> {
  const cleanUrl = repoUrl.trim().replace(/\/+$/, '');
  const match = cleanUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) {
    throw new Error('Enter a valid GitHub URL (https://github.com/owner/repo)');
  }

  const [, owner, repo] = match;
  const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
  if (!apiRes.ok) {
    throw new Error('Could not fetch public repository tree from GitHub.');
  }

  const treeData = await apiRes.json();
  const paths: string[] = (treeData.tree || [])
    .filter((item: any) => item.type === 'blob')
    .map((item: any) => String(item.path));

  const topDirs = Array.from(
    new Set(
      paths
        .filter((p) => p.includes('/'))
        .map((p) => p.split('/')[0])
        .filter((dir) => !dir.startsWith('.') && !['docs', 'tests', 'test', 'scripts'].includes(dir.toLowerCase()))
    )
  ).slice(0, 8);

  const serviceNames = topDirs.length >= 2 ? topDirs : ['api-gateway', 'core-service', 'worker', 'datastore'];
  const rawNodes = serviceNames.map((name, idx) => ({
    id: name.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
    name,
    type: idx === serviceNames.length - 1 ? 'database' : 'service',
    criticality: idx === 0 ? 5 : 4,
    base_latency_ms: 25 + idx * 10,
    sla_ms: 400 + idx * 100,
    business_functions: [`${name} Operations`],
  }));

  const rawEdges = rawNodes.slice(0, -1).map((node, idx) => ({
    source: rawNodes[idx + 1].id,
    target: node.id,
    propagation: idx % 2 === 0 ? 'HARD' : 'SOFT',
  }));

  const normalized = normalizeBackendGraph({
    id: `${owner}-${repo}`,
    name: `${owner}/${repo}`,
    nodes: rawNodes,
    edges: rawEdges,
  });

  // Persist to SQLite backend if running so /simulate works against it
  try {
    await fetch(`${API_BASE}/graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: normalized.id,
        name: normalized.name,
        nodes: normalized.nodes.map((n) => ({
          id: n.id,
          name: n.label,
          type: (n.tier || 'service').toLowerCase(),
          criticality: n.criticality || 4,
          base_latency_ms: n.base_latency_ms || 30,
          sla_ms: n.sla_ms || 500,
          business_functions: n.business_functions || [],
        })),
        edges: normalized.edges.map((e) => ({
          source: e.source,
          target: e.target,
          dependency: e.dependency_type === 'hard' ? 'critical' : 'important',
          propagation: e.dependency_type === 'hard' ? 'HARD' : 'SOFT',
        })),
      }),
    });
  } catch {
    // Offline fallback still works
  }

  return { graph: normalized, source: cleanUrl };
}

function runLocalFallbackSimulation(
  graph: GraphData,
  targetNode: string,
  failureType: FailureType,
  mitigatedNodes: string[]
): SimulationResult {
  const mitigatedSet = new Set(mitigatedNodes);
  const visited = new Map<string, CascadeEntry>();
  const queue: Array<{ id: string; state: 'broken' | 'warning'; hop: number }> = [
    { id: targetNode, state: failureType === 'down' ? 'broken' : 'warning', hop: 0 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const outgoing = graph.edges.filter((e) => e.source === curr.id);
    for (const edge of outgoing) {
      if (edge.target === targetNode || edge.propagation === 'OPTIONAL') continue;
      const isMitigated = mitigatedSet.has(curr.id) || mitigatedSet.has(edge.target);
      const isHard = edge.dependency_type === 'hard' && !isMitigated;
      const nextState: 'broken' | 'warning' =
        curr.state === 'broken' && isHard ? 'broken' : 'warning';
      const prev = visited.get(edge.target);
      if (!prev || (prev.state === 'warning' && nextState === 'broken')) {
        visited.set(edge.target, {
          id: edge.target,
          state: nextState,
          hop: curr.hop + 1,
          reason:
            nextState === 'broken'
              ? `Critical HARD dependency '${curr.id}' failed`
              : `Degraded fallback from '${curr.id}'`,
        });
        queue.push({ id: edge.target, state: nextState, hop: curr.hop + 1 });
      }
    }
  }

  const cascade = Array.from(visited.values());
  const brokenCount = cascade.filter((c) => c.state === 'broken').length;
  const warningCount = cascade.length - brokenCount;
  const severity = brokenCount >= 2 ? 'CRITICAL' : brokenCount >= 1 ? 'HIGH' : cascade.length > 0 ? 'MEDIUM' : 'LOW';

  return {
    root_cause: targetNode,
    failure_type: failureType,
    blast_radius_count: cascade.length,
    broken_count: brokenCount,
    warning_count: warningCount,
    criticality: severity,
    business_impact: [],
    cascade,
  };
}

export async function runFailureSimulation(
  graph: GraphData,
  targetNode: string,
  failureType: FailureType,
  mitigatedNodes: string[] = []
): Promise<{ simulation: SimulationResult; via: 'backend' | 'fallback' }> {
  try {
    const res = await fetch(`${API_BASE}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graph_id: graph.id || 'ecommerce-core',
        node: targetNode,
        failure: failureType === 'down' ? 'DOWN' : 'LATENCY',
        mitigated_nodes: mitigatedNodes,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('Simulation API error');
    const data = await res.json();
    return {
      simulation: normalizeSimulationResult(data, failureType),
      via: 'backend',
    };
  } catch {
    return {
      simulation: runLocalFallbackSimulation(graph, targetNode, failureType, mitigatedNodes),
      via: 'fallback',
    };
  }
}

export function getNodeStateMap(
  simulation: SimulationResult | null,
  mitigatedNodes: string[] = []
): Record<string, NodeVisualState> {
  const map: Record<string, NodeVisualState> = {};
  for (const id of mitigatedNodes) {
    map[id] = 'mitigated';
  }
  if (!simulation) return map;

  for (const item of simulation.cascade) {
    map[item.id] = item.state === 'broken' ? 'broken' : 'warning';
  }
  if (simulation.root_cause) {
    map[simulation.root_cause] = 'root';
  }
  return map;
}

export function computeGraphLayout(
  graph: GraphData,
  width = 1000,
  height = 560
): Array<GraphNode & { x: number; y: number }> {
  const nodes = graph.nodes || [];
  if (nodes.length === 0) return [];

  const padX = 110;
  const padY = 80;
  const usableW = Math.max(200, width - padX * 2);
  const usableH = Math.max(180, height - padY * 2 - 24);

  // Use explicit coordinates if present in graph data (normalized cleanly to viewport)
  const hasPositions = nodes.every((n) => n.position && typeof n.position.x === 'number');
  if (hasPositions) {
    const xs = nodes.map((n) => n.position!.x);
    const ys = nodes.map((n) => n.position!.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    return nodes.map((n) => ({
      ...n,
      x: padX + ((n.position!.x - minX) / spanX) * usableW,
      y: padY + ((n.position!.y - minY) / spanY) * usableH,
    }));
  }

  // Otherwise compute topological layers left-to-right
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  });
  (graph.edges || []).forEach((e) => {
    if (adj.has(e.source) && inDegree.has(e.target) && e.source !== e.target) {
      adj.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });

  const depth = new Map<string, number>();
  const queue = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);
  queue.forEach((id) => depth.set(id, 0));

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const d = depth.get(curr) || 0;
    for (const nxt of adj.get(curr) || []) {
      if ((depth.get(nxt) ?? -1) < d + 1 && d + 1 < nodes.length) {
        depth.set(nxt, d + 1);
        queue.push(nxt);
      }
    }
  }

  const columns = new Map<number, GraphNode[]>();
  nodes.forEach((n) => {
    const col = depth.get(n.id) ?? 0;
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(n);
  });

  const maxCol = Math.max(...Array.from(columns.keys()), 1);
  const laidOut: Array<GraphNode & { x: number; y: number }> = [];

  columns.forEach((colNodes, col) => {
    const x = padX + (col / maxCol) * usableW;
    colNodes.forEach((node, idx) => {
      const y = padY + ((idx + 1) / (colNodes.length + 1)) * usableH;
      laidOut.push({ ...node, x, y });
    });
  });

  return laidOut;
}