export type DependencyType = 'hard' | 'soft';
export type FailureType = 'down' | 'degraded';
export type NodeVisualState = 'normal' | 'root' | 'broken' | 'warning' | 'mitigated';

export interface GraphNode {
  id: string;
  label: string;
  tier?: string;
  protocol?: string;
  criticality?: string;
  description?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  dependency_type?: DependencyType;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CascadeEntry {
  id: string;
  state: 'broken' | 'warning' | 'degraded';
  hop: number;
  reason: string;
}

export interface SimulationResult {
  root_cause: string;
  failure_type: FailureType;
  criticality: string;
  blast_radius_count: number;
  broken_count: number;
  warning_count: number;
  mitigated_nodes?: string[];
  baseline_blast_count?: number;
  saved_count?: number;
  cascade: CascadeEntry[];
}

export interface SpofRisk {
  id: string;
  label: string;
  blastCount: number;
  brokenCount: number;
  pct: number;
}

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ServiceCheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  latencyMs: number;
  detail: string;
  endpoint?: string;
}

export interface FileCheckResult {
  path: string;
  exists: boolean;
  bytes: number;
  status: CheckStatus;
  detail: string;
}

export interface SystemCheckupReport {
  checkedAt: string;
  totalMs: number;
  summary: {
    passed: number;
    warned: number;
    failed: number;
  };
  services: ServiceCheckResult[];
  files: FileCheckResult[];
}

export const DEFAULT_API_BASE = 'http://127.0.0.1:8000';

export const ECOMMERCE_PRESET: GraphData = {
  nodes: [
    { id: 'edge-cdn', label: 'Edge CDN', tier: 'Edge', protocol: 'HTTPS', criticality: 'High', description: 'Global edge routing and TLS termination.' },
    { id: 'api-gateway', label: 'API Gateway', tier: 'Ingress', protocol: 'HTTP/2', criticality: 'Critical', description: 'Primary request router, rate limiter, and JWT verifier.' },
    { id: 'auth-service', label: 'Auth Service', tier: 'Core', protocol: 'gRPC', criticality: 'Critical', description: 'Session issuance, OAuth validation, and RBAC claims.' },
    { id: 'catalog-api', label: 'Catalog API', tier: 'Domain', protocol: 'REST', criticality: 'High', description: 'Product metadata, pricing tiers, and SKU availability.' },
    { id: 'search-index', label: 'Search Index', tier: 'Data', protocol: 'HTTP', criticality: 'Medium', description: 'Full-text and faceted product search engine.' },
    { id: 'cart-service', label: 'Cart Service', tier: 'Domain', protocol: 'gRPC', criticality: 'High', description: 'Ephemeral shopping cart state and promo evaluation.' },
    { id: 'checkout-api', label: 'Checkout API', tier: 'Domain', protocol: 'gRPC', criticality: 'Critical', description: 'Orchestrates order validation, tax, and payment capture.' },
    { id: 'payment-gw', label: 'Payment Gateway', tier: 'External', protocol: 'HTTPS', criticality: 'Critical', description: 'External card processor and tokenization bridge.' },
    { id: 'inventory-db', label: 'Inventory DB', tier: 'Data', protocol: 'PostgreSQL', criticality: 'Critical', description: 'ACID stock ledger and reservation locks.' },
    { id: 'order-queue', label: 'Order Queue', tier: 'Async', protocol: 'AMQP', criticality: 'High', description: 'Durable fulfillment event stream.' },
    { id: 'notify-worker', label: 'Notify Worker', tier: 'Async', protocol: 'SMTP/Push', criticality: 'Low', description: 'Transactional receipts and shipment alerts.' },
    { id: 'analytics-sink', label: 'Analytics Sink', tier: 'Telemetry', protocol: 'Kafka', criticality: 'Low', description: 'Clickstream and conversion event warehouse.' },
  ],
  edges: [
    { source: 'edge-cdn', target: 'api-gateway', dependency_type: 'hard' },
    { source: 'api-gateway', target: 'auth-service', dependency_type: 'hard' },
    { source: 'api-gateway', target: 'catalog-api', dependency_type: 'hard' },
    { source: 'api-gateway', target: 'cart-service', dependency_type: 'hard' },
    { source: 'api-gateway', target: 'checkout-api', dependency_type: 'hard' },
    { source: 'catalog-api', target: 'search-index', dependency_type: 'soft' },
    { source: 'catalog-api', target: 'inventory-db', dependency_type: 'hard' },
    { source: 'cart-service', target: 'catalog-api', dependency_type: 'hard' },
    { source: 'cart-service', target: 'auth-service', dependency_type: 'soft' },
    { source: 'checkout-api', target: 'auth-service', dependency_type: 'hard' },
    { source: 'checkout-api', target: 'cart-service', dependency_type: 'hard' },
    { source: 'checkout-api', target: 'inventory-db', dependency_type: 'hard' },
    { source: 'checkout-api', target: 'payment-gw', dependency_type: 'hard' },
    { source: 'checkout-api', target: 'order-queue', dependency_type: 'hard' },
    { source: 'notify-worker', target: 'order-queue', dependency_type: 'hard' },
    { source: 'analytics-sink', target: 'order-queue', dependency_type: 'soft' },
    { source: 'analytics-sink', target: 'api-gateway', dependency_type: 'soft' },
  ],
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 2200): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkBackendHealth(apiBase = DEFAULT_API_BASE): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${apiBase}/`, { method: 'GET' }, 1800);
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadEcommerceArchitecture(
  apiBase = DEFAULT_API_BASE
): Promise<{ graph: GraphData; via: 'backend' | 'local' }> {
  try {
    const res = await fetchWithTimeout(`${apiBase}/api/preset/ecommerce`, { method: 'GET' }, 1800);
    if (res.ok) {
      const json = await res.json();
      if (json?.graph_data?.nodes?.length) {
        return { graph: json.graph_data as GraphData, via: 'backend' };
      }
    }
  } catch {
    // Fallback to embedded architecture model when FastAPI is offline.
  }
  return { graph: ECOMMERCE_PRESET, via: 'local' };
}

export function validateGithubUrl(raw: string): { owner: string; repo: string; normalized: string } | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return null;
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    return { owner, repo, normalized: `https://github.com/${owner}/${repo}` };
  } catch {
    return null;
  }
}

export async function ingestGithubRepository(
  url: string,
  apiBase = DEFAULT_API_BASE
): Promise<{ graph: GraphData; source: string; via: 'backend' | 'github' }> {
  const parsed = validateGithubUrl(url);
  if (!parsed) {
    throw new Error('Enter a valid GitHub URL such as https://github.com/organization/repository');
  }

  try {
    const res = await fetchWithTimeout(
      `${apiBase}/api/ingest`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url: parsed.normalized }),
      },
      6000
    );
    if (res.ok) {
      const json = await res.json();
      if (json?.graph_data?.nodes?.length) {
        return { graph: json.graph_data as GraphData, source: parsed.normalized, via: 'backend' };
      }
    }
  } catch {
    // Fall back to direct GitHub tree structural inference
  }

  const ghRes = await fetchWithTimeout(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/HEAD?recursive=1`,
    { method: 'GET', headers: { Accept: 'application/vnd.github+json' } },
    8000
  );

  if (!ghRes.ok) {
    if (ghRes.status === 404) {
      throw new Error(`Repository ${parsed.owner}/${parsed.repo} was not found or is private.`);
    }
    throw new Error(`Could not inspect repository (${ghRes.status}).`);
  }

  const treeJson = await ghRes.json();
  const entries: Array<{ path: string; type: string }> = Array.isArray(treeJson?.tree) ? treeJson.tree : [];

  const ignored = new Set(['node_modules', '.git', '.github', 'dist', 'build', 'coverage', '__pycache__', '.venv', 'docs', 'tests', 'test']);
  const moduleBuckets = new Map<string, number>();

  for (const item of entries) {
    if (!item.path) continue;
    const segs = item.path.split('/');
    const top = segs[0];
    if (!top || ignored.has(top.toLowerCase()) || top.startsWith('.')) continue;

    if (segs.length >= 2 && (top === 'src' || top === 'app' || top === 'services' || top === 'packages' || top === 'apps' || top === 'cmd' || top === 'internal')) {
      const sub = `${top}/${segs[1].replace(/\.[a-z0-9]+$/i, '')}`;
      moduleBuckets.set(sub, (moduleBuckets.get(sub) ?? 0) + 1);
    } else if (item.type === 'tree' && segs.length === 1) {
      moduleBuckets.set(top, (moduleBuckets.get(top) ?? 0) + 1);
    } else if (segs.length === 1 && /\.(ts|tsx|py|go|rs|java|js)$/.test(top)) {
      const clean = top.replace(/\.[a-z0-9]+$/i, '');
      moduleBuckets.set(clean, (moduleBuckets.get(clean) ?? 0) + 1);
    }
  }

  const ranked = Array.from(moduleBuckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([name, fileCount]) => ({
      id: name.toLowerCase().replace(/[^a-z0-9/_-]+/g, '-'),
      label: name.split('/').pop() || name,
      tier: name.includes('/') ? name.split('/')[0] : 'root',
      description: `${fileCount} indexed files under ${name}`,
    }));

  if (ranked.length < 2) {
    throw new Error('No distinct service or module folders were discovered in that repository.');
  }

  const edges: GraphEdge[] = [];
  const rootNode =
    ranked.find((n) => /^(main|index|app|server|api|gateway|core|src)$/.test(n.label.toLowerCase())) || ranked[0];

  for (const node of ranked) {
    if (node.id === rootNode.id) continue;
    const isSoft = /(test|doc|util|helper|metric|log|telemetry|analytics|ui|style)/.test(node.id);
    edges.push({
      source: rootNode.id,
      target: node.id,
      dependency_type: isSoft ? 'soft' : 'hard',
    });
  }

  for (let i = 1; i < ranked.length - 1; i += 2) {
    const a = ranked[i];
    const b = ranked[i + 1];
    if (a.id !== rootNode.id && b.id !== rootNode.id) {
      edges.push({
        source: a.id,
        target: b.id,
        dependency_type: i % 4 === 1 ? 'hard' : 'soft',
      });
    }
  }

  return {
    graph: { nodes: ranked, edges },
    source: parsed.normalized,
    via: 'github',
  };
}

export function simulateGraphCascade(
  graph: GraphData,
  failedNode: string,
  failureType: FailureType,
  mitigatedNodes: string[]
): SimulationResult {
  const mitigatedSet = new Set(mitigatedNodes);
  const incomingCallers = new Map<string, Array<{ caller: string; type: DependencyType }>>();
  for (const node of graph.nodes) {
    incomingCallers.set(node.id, []);
  }
  for (const edge of graph.edges) {
    const list = incomingCallers.get(edge.target);
    if (list) {
      list.push({ caller: edge.source, type: edge.dependency_type === 'soft' ? 'soft' : 'hard' });
    }
  }

  const visited = new Map<string, CascadeEntry>();
  const queue: Array<{ id: string; hop: number; parentState: 'broken' | 'degraded' }> = [
    { id: failedNode, hop: 0, parentState: failureType === 'down' ? 'broken' : 'degraded' },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const callers = incomingCallers.get(current.id) || [];

    for (const { caller, type } of callers) {
      if (caller === failedNode) continue;

      const isMitigated = mitigatedSet.has(caller);
      let nextState: 'broken' | 'warning';
      let reason: string;

      if (isMitigated) {
        nextState = 'warning';
        reason = `Circuit breaker mitigated impact from ${current.id}`;
      } else if (type === 'soft') {
        nextState = 'warning';
        reason = `Soft dependency degraded via ${current.id}`;
      } else if (current.parentState === 'broken') {
        nextState = 'broken';
        reason = `Hard dependency unreachable: ${current.id}`;
      } else {
        nextState = 'warning';
        reason = `Latency spike propagated from ${current.id}`;
      }

      const prev = visited.get(caller);
      if (!prev || (prev.state !== 'broken' && nextState === 'broken')) {
        visited.set(caller, {
          id: caller,
          state: nextState,
          hop: current.hop + 1,
          reason,
        });

        if (!isMitigated && type === 'hard') {
          queue.push({
            id: caller,
            hop: current.hop + 1,
            parentState: nextState === 'broken' ? 'broken' : 'degraded',
          });
        }
      }
    }
  }

  const cascade = Array.from(visited.values()).sort((a, b) => a.hop - b.hop || a.id.localeCompare(b.id));
  const brokenCount = cascade.filter((c) => c.state === 'broken').length + (failureType === 'down' ? 1 : 0);
  const warningCount = cascade.filter((c) => c.state !== 'broken').length + (failureType === 'degraded' ? 1 : 0);
  const blastCount = cascade.length + 1;
  const ratio = graph.nodes.length > 0 ? blastCount / graph.nodes.length : 0;

  const criticality =
    ratio >= 0.55 ? 'CRITICAL IMPACT' : ratio >= 0.3 ? 'HIGH IMPACT' : ratio >= 0.15 ? 'MODERATE IMPACT' : 'CONTAINED';

  return {
    root_cause: failedNode,
    failure_type: failureType,
    criticality,
    blast_radius_count: blastCount,
    broken_count: brokenCount,
    warning_count: warningCount,
    mitigated_nodes: mitigatedNodes,
    cascade,
  };
}

export async function runFailureSimulation(
  graph: GraphData,
  failedNode: string,
  failureType: FailureType,
  mitigatedNodes: string[],
  apiBase = DEFAULT_API_BASE
): Promise<{ simulation: SimulationResult; via: 'backend' | 'local' }> {
  const baseline =
    mitigatedNodes.length > 0 ? simulateGraphCascade(graph, failedNode, failureType, []) : null;

  try {
    const res = await fetchWithTimeout(
      `${apiBase}/api/simulate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graph_data: graph,
          failed_node: failedNode,
          failure_type: failureType,
          mitigated_nodes: mitigatedNodes,
        }),
      },
      3000
    );
    if (res.ok) {
      const json = await res.json();
      if (json?.simulation) {
        const sim = json.simulation as SimulationResult;
        if (baseline) {
          sim.baseline_blast_count = baseline.blast_radius_count;
          sim.saved_count = Math.max(0, baseline.broken_count - sim.broken_count);
        }
        return { simulation: sim, via: 'backend' };
      }
    }
  } catch {
    // Fall back to local graph cascade propagation engine
  }

  const simulation = simulateGraphCascade(graph, failedNode, failureType, mitigatedNodes);
  if (baseline) {
    simulation.baseline_blast_count = baseline.blast_radius_count;
    simulation.saved_count = Math.max(0, baseline.broken_count - simulation.broken_count);
  }
  return { simulation, via: 'local' };
}

export function computeSpofRisks(graph: GraphData, limit = 3): SpofRisk[] {
  if (!graph.nodes.length) return [];
  const total = graph.nodes.length;
  return graph.nodes
    .map((node) => {
      const sim = simulateGraphCascade(graph, node.id, 'down', []);
      return {
        id: node.id,
        label: node.label,
        blastCount: sim.blast_radius_count,
        brokenCount: sim.broken_count,
        pct: Math.round((sim.blast_radius_count / total) * 100),
      };
    })
    .sort((a, b) => b.brokenCount - a.brokenCount || b.blastCount - a.blastCount)
    .slice(0, limit);
}

export function parseCustomManifest(rawText: string): { graph: GraphData; source: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Paste a JSON graph, package.json, or docker-compose.yml manifest.');
  }

  if (trimmed.startsWith('{')) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid JSON syntax.');
    }

    const candidate = (parsed.graph_data as Record<string, unknown> | undefined) ?? parsed;
    if (Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)) {
      const nodes: GraphNode[] = candidate.nodes
        .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object' && 'id' in n))
        .map((n) => ({
          id: String(n.id),
          label: String(n.label || n.id),
          tier: n.tier ? String(n.tier) : undefined,
          protocol: n.protocol ? String(n.protocol) : undefined,
          description: n.description ? String(n.description) : undefined,
        }));
      const idSet = new Set(nodes.map((n) => n.id));
      const edges: GraphEdge[] = candidate.edges
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object' && 'source' in e && 'target' in e))
        .filter((e) => idSet.has(String(e.source)) && idSet.has(String(e.target)))
        .map((e) => ({
          source: String(e.source),
          target: String(e.target),
          dependency_type: e.dependency_type === 'soft' ? 'soft' : 'hard',
        }));

      if (nodes.length < 2) {
        throw new Error('Graph JSON must contain at least 2 nodes.');
      }
      return { graph: { nodes, edges }, source: String(parsed.source || 'Custom JSON Graph') };
    }

    if (parsed.dependencies || parsed.devDependencies || parsed.peerDependencies) {
      const rootId = String(parsed.name || 'app-root').toLowerCase().replace(/[^a-z0-9/_-]+/g, '-');
      const deps = Object.keys((parsed.dependencies as Record<string, unknown>) || {});
      const devDeps = Object.keys((parsed.devDependencies as Record<string, unknown>) || {});
      const nodes: GraphNode[] = [
        { id: rootId, label: String(parsed.name || 'Application'), tier: 'Root', protocol: 'npm' },
      ];
      const edges: GraphEdge[] = [];

      for (const dep of deps.slice(0, 14)) {
        const depId = dep.replace(/^@/, '').replace(/\//g, '-');
        nodes.push({ id: depId, label: dep, tier: 'Runtime', protocol: 'npm' });
        edges.push({ source: rootId, target: depId, dependency_type: 'hard' });
      }
      for (const devDep of devDeps.slice(0, Math.max(0, 18 - nodes.length))) {
        const depId = devDep.replace(/^@/, '').replace(/\//g, '-');
        if (!nodes.some((n) => n.id === depId)) {
          nodes.push({ id: depId, label: devDep, tier: 'Build', protocol: 'npm' });
          edges.push({ source: rootId, target: depId, dependency_type: 'soft' });
        }
      }

      if (nodes.length < 2) {
        throw new Error('No dependencies found in package.json.');
      }
      return { graph: { nodes, edges }, source: `${String(parsed.name || 'package.json')}` };
    }

    throw new Error('JSON must include { nodes, edges } or package.json dependencies.');
  }

  // Minimal docker-compose.yml parser for services & depends_on
  const lines = trimmed.split(/\r?\n/);
  const serviceNames: string[] = [];
  const depsByService = new Map<string, string[]>();
  let inServices = false;
  let servicesIndent = -1;
  let currentService: string | null = null;
  let serviceIndent = -1;
  let inDependsOn = false;
  let dependsIndent = -1;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.search(/\S/);
    const content = rawLine.trim();

    if (/^services:\s*$/.test(content)) {
      inServices = true;
      servicesIndent = indent;
      currentService = null;
      inDependsOn = false;
      continue;
    }

    if (inServices && indent <= servicesIndent && /^[a-z0-9_-]+:/i.test(content)) {
      inServices = false;
      currentService = null;
      inDependsOn = false;
      continue;
    }

    if (!inServices) continue;

    if (serviceIndent === -1 || indent === serviceIndent) {
      const match = content.match(/^([a-zA-Z0-9._-]+):\s*$/);
      if (match) {
        serviceIndent = indent;
        currentService = match[1];
        serviceNames.push(currentService);
        depsByService.set(currentService, []);
        inDependsOn = false;
        continue;
      }
    }

    if (currentService && indent > serviceIndent) {
      if (inDependsOn && indent <= dependsIndent) {
        inDependsOn = false;
      }
      if (/^depends_on:\s*$/.test(content)) {
        inDependsOn = true;
        dependsIndent = indent;
        continue;
      }
      const inlineDepends = content.match(/^depends_on:\s*\[([^\]]+)\]/);
      if (inlineDepends) {
        const items = inlineDepends[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        depsByService.get(currentService)?.push(...items);
        continue;
      }
      if (inDependsOn) {
        const listItem = content.match(/^-\s*([a-zA-Z0-9._-]+)/);
        const mapItem = content.match(/^([a-zA-Z0-9._-]+):\s*/);
        if (listItem) {
          depsByService.get(currentService)?.push(listItem[1]);
        } else if (mapItem) {
          depsByService.get(currentService)?.push(mapItem[1]);
        }
      }
    }
  }

  if (serviceNames.length < 2) {
    throw new Error('Could not detect at least 2 services. Paste JSON, package.json, or docker-compose.yml.');
  }

  const nodes: GraphNode[] = serviceNames.map((name) => ({
    id: name,
    label: name,
    tier: 'Container',
    protocol: 'Docker',
  }));
  const idSet = new Set(serviceNames);
  const edges: GraphEdge[] = [];
  for (const [svc, deps] of depsByService.entries()) {
    for (const dep of deps) {
      if (idSet.has(dep) && svc !== dep) {
        edges.push({ source: svc, target: dep, dependency_type: 'hard' });
      }
    }
  }

  return { graph: { nodes, edges }, source: 'docker-compose.yml' };
}

export function computeGraphLayout(graph: GraphData, width = 1000, height = 560): PositionedNode[] {
  const nodes = graph.nodes.slice(0, 24);
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{ ...nodes[0], x: width / 2, y: height / 2 }];
  }

  const idSet = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target);

  const inDegree = new Map<string, number>();
  const outMap = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outMap.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    outMap.get(e.source)?.push(e.target);
  }

  // BFS topological tier assignment for clean left-to-right flow initialization
  const depth = new Map<string, number>();
  const roots = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const queue = roots.length > 0 ? [...roots] : [nodes[0].id];
  for (const r of queue) depth.set(r, 0);

  let idx = 0;
  while (idx < queue.length) {
    const curr = queue[idx++];
    const d = depth.get(curr) ?? 0;
    for (const nxt of outMap.get(curr) ?? []) {
      if (!depth.has(nxt) && d < 6) {
        depth.set(nxt, d + 1);
        queue.push(nxt);
      }
    }
  }
  for (const n of nodes) {
    if (!depth.has(n.id)) depth.set(n.id, 1);
  }

  const maxDepth = Math.max(1, ...Array.from(depth.values()));
  const byLayer = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const arr = byLayer.get(d) ?? [];
    arr.push(n);
    byLayer.set(d, arr);
  }

  const coords = new Map<string, { x: number; y: number }>();
  const padX = 115;
  const padY = 84;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  for (const [layerIdx, layerNodes] of byLayer.entries()) {
    const x = padX + (layerIdx / maxDepth) * usableW;
    layerNodes.forEach((n, i) => {
      const yOffset = layerIdx % 2 === 1 ? 18 : -18;
      const y =
        layerNodes.length === 1
          ? height / 2
          : padY + (i / (layerNodes.length - 1)) * usableH + yOffset * 0.4;
      coords.set(n.id, { x, y });
    });
  }

  // Gentle force-relaxation pass to guarantee minimum spacing & prevent label overlap
  const minDistX = 138;
  const minDistY = 82;
  for (let iter = 0; iter < 45; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = coords.get(nodes[i].id)!;
        const b = coords.get(nodes[j].id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minDistX - Math.abs(dx);
        const overlapY = minDistY - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const pushY = (dy >= 0 ? 1 : -1) * overlapY * 0.24;
          const pushX = (dx >= 0 ? 1 : -1) * overlapX * 0.14;
          a.x = Math.max(padX, Math.min(width - padX, a.x - pushX));
          b.x = Math.max(padX, Math.min(width - padX, b.x + pushX));
          a.y = Math.max(padY, Math.min(height - padY, a.y - pushY));
          b.y = Math.max(padY, Math.min(height - padY, b.y + pushY));
        }
      }
    }
  }

  return nodes.map((n) => {
    const c = coords.get(n.id)!;
    return { ...n, x: Math.round(c.x), y: Math.round(c.y) };
  });
}

export function getNodeStateMap(
  simulation: SimulationResult | null,
  mitigatedNodes: string[] = [],
  maxHop?: number | null
): Record<string, NodeVisualState> {
  const map: Record<string, NodeVisualState> = {};
  for (const id of mitigatedNodes) {
    map[id] = 'mitigated';
  }
  if (!simulation) return map;
  for (const entry of simulation.cascade) {
    if (typeof maxHop === 'number' && entry.hop > maxHop) continue;
    map[entry.id] = entry.state === 'broken' ? 'broken' : 'warning';
  }
  if (simulation.root_cause) {
    map[simulation.root_cause] = 'root';
  }
  return map;
}

export async function runSystemCheckup(apiBase = DEFAULT_API_BASE): Promise<SystemCheckupReport> {
  const started = performance.now();

  const clientEngineStart = performance.now();
  const selfTest = simulateGraphCascade(ECOMMERCE_PRESET, 'auth-service', 'down', []);
  const clientEngineCheck: ServiceCheckResult = {
    id: 'client-engine',
    name: 'Client Cascade Engine',
    status: selfTest.blast_radius_count > 1 ? 'pass' : 'fail',
    latencyMs: Math.max(1, Math.round(performance.now() - clientEngineStart)),
    detail:
      selfTest.blast_radius_count > 1
        ? `BFS engine verified (${selfTest.blast_radius_count}/${ECOMMERCE_PRESET.nodes.length} nodes reached)`
        : 'Cascade self-test failed',
    endpoint: 'browser://engine',
  };

  let storageCheck: ServiceCheckResult;
  const storageStart = performance.now();
  try {
    const key = '__impactengine_probe__';
    localStorage.setItem(key, '1');
    const val = localStorage.getItem(key);
    localStorage.removeItem(key);
    storageCheck = {
      id: 'storage',
      name: 'Browser Storage',
      status: val === '1' ? 'pass' : 'warn',
      latencyMs: Math.max(1, Math.round(performance.now() - storageStart)),
      detail: val === '1' ? 'localStorage read/write OK' : 'Unexpected storage readback',
      endpoint: 'browser://localStorage',
    };
  } catch {
    storageCheck = {
      id: 'storage',
      name: 'Browser Storage',
      status: 'warn',
      latencyMs: Math.max(1, Math.round(performance.now() - storageStart)),
      detail: 'localStorage restricted in current browser context',
      endpoint: 'browser://localStorage',
    };
  }

  let serverReport: SystemCheckupReport | null = null;
  try {
    const res = await fetchWithTimeout('/api/system-checkup', { method: 'GET' }, 12000);
    if (res.ok) {
      const json = (await res.json()) as SystemCheckupReport;
      if (Array.isArray(json?.services) && Array.isArray(json?.files)) {
        serverReport = json;
      }
    }
  } catch {
    // Handled cleanly below when Express /api/system-checkup is unreachable
  }

  // Browser-origin probe for user's local FastAPI when server is remote or Express unavailable
  let browserFastApiOnline = false;
  const fastApiStart = performance.now();
  try {
    browserFastApiOnline = await checkBackendHealth(apiBase);
  } catch {
    browserFastApiOnline = false;
  }
  const fastApiLatency = Math.max(1, Math.round(performance.now() - fastApiStart));

  if (serverReport) {
    const services = serverReport.services.map((svc) => {
      if (svc.id === 'fastapi' && svc.status !== 'pass' && browserFastApiOnline) {
        return {
          ...svc,
          status: 'pass' as CheckStatus,
          latencyMs: fastApiLatency,
          detail: 'Local FastAPI (port 8000) reachable from browser',
        };
      }
      return svc;
    });
    services.push(clientEngineCheck, storageCheck);

    const allItems = [...services, ...serverReport.files];
    return {
      checkedAt: serverReport.checkedAt,
      totalMs: Math.max(serverReport.totalMs, Math.round(performance.now() - started)),
      summary: {
        passed: allItems.filter((i) => i.status === 'pass').length,
        warned: allItems.filter((i) => i.status === 'warn').length,
        failed: allItems.filter((i) => i.status === 'fail').length,
      },
      services,
      files: serverReport.files,
    };
  }

  // Fallback when running plain Vite dev server without server.ts
  let githubCheck: ServiceCheckResult;
  const ghStart = performance.now();
  try {
    const res = await fetchWithTimeout('https://api.github.com/rate_limit', { method: 'GET' }, 3500);
    githubCheck = {
      id: 'github',
      name: 'GitHub Tree API',
      status: res.ok ? 'pass' : 'warn',
      latencyMs: Math.max(1, Math.round(performance.now() - ghStart)),
      detail: res.ok ? 'Responding directly from browser' : `HTTP ${res.status}`,
      endpoint: 'https://api.github.com',
    };
  } catch {
    githubCheck = {
      id: 'github',
      name: 'GitHub Tree API',
      status: 'fail',
      latencyMs: Math.max(1, Math.round(performance.now() - ghStart)),
      detail: 'Network error reaching GitHub API',
      endpoint: 'https://api.github.com',
    };
  }

  const services: ServiceCheckResult[] = [
    {
      id: 'express',
      name: 'App Server (/api)',
      status: 'fail',
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
      detail: 'Backend server.ts not running — start via `npm run dev` (tsx server.ts)',
      endpoint: '/api/system-checkup',
    },
    {
      id: 'gemini',
      name: 'Gemini API',
      status: 'warn',
      latencyMs: 0,
      detail: 'Requires server.ts backend route to probe GEMINI_API_KEY',
      endpoint: 'gemini-4-hydrogen',
    },
    {
      id: 'tinyfish',
      name: 'TinyFish Service',
      status: 'warn',
      latencyMs: 0,
      detail: 'Requires server.ts backend route to probe TinyFish endpoint',
      endpoint: 'https://agent.tinyfish.ai',
    },
    {
      id: 'fastapi',
      name: 'FastAPI Engine',
      status: browserFastApiOnline ? 'pass' : 'warn',
      latencyMs: fastApiLatency,
      detail: browserFastApiOnline
        ? 'Port 8000 responding from browser'
        : 'Port 8000 offline — using built-in client cascade engine',
      endpoint: apiBase,
    },
    githubCheck,
    clientEngineCheck,
    storageCheck,
  ];

  return {
    checkedAt: new Date().toISOString(),
    totalMs: Math.round(performance.now() - started),
    summary: {
      passed: services.filter((s) => s.status === 'pass').length,
      warned: services.filter((s) => s.status === 'warn').length,
      failed: services.filter((s) => s.status === 'fail').length,
    },
    services,
    files: [],
  };
}
