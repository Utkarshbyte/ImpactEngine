import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface ServiceCheck {
  id: string;
  name: string;
  status: CheckStatus;
  latencyMs: number;
  detail: string;
  endpoint?: string;
}

interface FileCheck {
  path: string;
  exists: boolean;
  bytes: number;
  status: CheckStatus;
  detail: string;
}

const CORE_FILES = [
  'index.html',
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'metadata.json',
  'server.ts',
  '.env.example',
  'src/main.tsx',
  'src/App.tsx',
  'src/engine.ts',
  'src/index.css',
];

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 3500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkGemini(): Promise<ServiceCheck> {
  const start = Date.now();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      id: 'gemini',
      name: 'Gemini API',
      status: 'warn',
      latencyMs: Date.now() - start,
      detail: 'GEMINI_API_KEY is not configured in server secrets.',
      endpoint: 'gemini-4-hydrogen',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini request timed out (9500ms)')), 9500)
    );

    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: 'Reply with a single word: OK.',
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      timeoutPromise,
    ]);

    const reply = (response.text ?? '').trim();
    return {
      id: 'gemini',
      name: 'Gemini API',
      status: reply ? 'pass' : 'warn',
      latencyMs: Date.now() - start,
      detail: reply
        ? `Responding (${reply.slice(0, 32)})`
        : 'Connected, empty text payload returned.',
      endpoint: 'gemini-4-hydrogen',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini check failed';
    return {
      id: 'gemini',
      name: 'Gemini API',
      status: 'fail',
      latencyMs: Date.now() - start,
      detail: message.slice(0, 140),
      endpoint: 'gemini-4-hydrogen',
    };
  }
}

async function checkTinyFish(): Promise<ServiceCheck> {
  const start = Date.now();
  const baseUrl = (process.env.TINYFISH_API_URL?.trim() || 'https://agent.tinyfish.ai').replace(/\/+$/, '');
  const apiKey = process.env.TINYFISH_API_KEY?.trim();

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'ImpactEngine-SystemCheckup/1.0',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetchWithTimeout(baseUrl, { method: 'GET', headers }, 4000);
    const latencyMs = Date.now() - start;

    if (res.status === 401 || res.status === 403) {
      return {
        id: 'tinyfish',
        name: 'TinyFish Service',
        status: apiKey ? 'fail' : 'warn',
        latencyMs,
        detail: apiKey
          ? `Authentication rejected (HTTP ${res.status})`
          : `Endpoint reachable (HTTP ${res.status}); TINYFISH_API_KEY not set`,
        endpoint: baseUrl,
      };
    }

    if (res.ok || res.status === 404 || res.status === 405) {
      return {
        id: 'tinyfish',
        name: 'TinyFish Service',
        status: apiKey ? 'pass' : 'warn',
        latencyMs,
        detail: apiKey
          ? `Responding (HTTP ${res.status})`
          : `Host reachable (HTTP ${res.status}); TINYFISH_API_KEY not set`,
        endpoint: baseUrl,
      };
    }

    return {
      id: 'tinyfish',
      name: 'TinyFish Service',
      status: 'fail',
      latencyMs,
      detail: `Unexpected status HTTP ${res.status}`,
      endpoint: baseUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unreachable';
    return {
      id: 'tinyfish',
      name: 'TinyFish Service',
      status: 'fail',
      latencyMs: Date.now() - start,
      detail: `Unreachable (${message.slice(0, 100)})`,
      endpoint: baseUrl,
    };
  }
}

async function checkLocalFastApi(): Promise<ServiceCheck> {
  const start = Date.now();
  const base = (process.env.FASTAPI_URL?.trim() || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  try {
    const rootRes = await fetchWithTimeout(`${base}/`, { method: 'GET' }, 1800);
    if (!rootRes.ok) {
      return {
        id: 'fastapi',
        name: 'FastAPI Engine',
        status: 'warn',
        latencyMs: Date.now() - start,
        detail: `HTTP ${rootRes.status} from ${base}; browser fallback active`,
        endpoint: base,
      };
    }
    const presetRes = await fetchWithTimeout(`${base}/api/preset/ecommerce`, { method: 'GET' }, 1800);
    return {
      id: 'fastapi',
      name: 'FastAPI Engine',
      status: presetRes.ok ? 'pass' : 'warn',
      latencyMs: Date.now() - start,
      detail: presetRes.ok
        ? 'FastAPI root & /api/preset/ecommerce responding'
        : `FastAPI root OK; preset endpoint HTTP ${presetRes.status}`,
      endpoint: base,
    };
  } catch {
    return {
      id: 'fastapi',
      name: 'FastAPI Engine',
      status: 'warn',
      latencyMs: Date.now() - start,
      detail: 'Port 8000 offline — using built-in client cascade engine',
      endpoint: base,
    };
  }
}

async function checkGithubApi(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      'https://api.github.com/rate_limit',
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ImpactEngine-SystemCheckup/1.0',
        },
      },
      3500
    );
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return {
        id: 'github',
        name: 'GitHub Tree API',
        status: res.status === 403 ? 'warn' : 'fail',
        latencyMs,
        detail: `HTTP ${res.status}`,
        endpoint: 'https://api.github.com',
      };
    }
    const data = (await res.json()) as {
      resources?: { core?: { remaining?: number; limit?: number } };
    };
    const rem = data?.resources?.core?.remaining;
    const lim = data?.resources?.core?.limit;
    return {
      id: 'github',
      name: 'GitHub Tree API',
      status: typeof rem === 'number' && rem === 0 ? 'warn' : 'pass',
      latencyMs,
      detail:
        typeof rem === 'number' && typeof lim === 'number'
          ? `Responding (${rem}/${lim} req remaining)`
          : 'Responding',
      endpoint: 'https://api.github.com',
    };
  } catch (err) {
    return {
      id: 'github',
      name: 'GitHub Tree API',
      status: 'fail',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message.slice(0, 100) : 'Network failure',
      endpoint: 'https://api.github.com',
    };
  }
}

async function checkFile(relPath: string): Promise<FileCheck> {
  const fullPath = path.resolve(process.cwd(), relPath);
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return { path: relPath, exists: false, bytes: 0, status: 'fail', detail: 'Not a regular file' };
    }
    const content = await fs.readFile(fullPath, 'utf8');
    if (content.trim().length === 0) {
      return { path: relPath, exists: true, bytes: stat.size, status: 'warn', detail: 'File is empty' };
    }

    if (relPath.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch {
        return { path: relPath, exists: true, bytes: stat.size, status: 'fail', detail: 'Invalid JSON syntax' };
      }
    }

    if (relPath === 'index.html' && !content.includes('<div id="root"')) {
      return { path: relPath, exists: true, bytes: stat.size, status: 'warn', detail: 'Missing #root mount node' };
    }

    if (relPath === 'src/index.css' && !content.includes('@import "tailwindcss"')) {
      return { path: relPath, exists: true, bytes: stat.size, status: 'warn', detail: 'Missing Tailwind v4 import' };
    }

    return {
      path: relPath,
      exists: true,
      bytes: stat.size,
      status: 'pass',
      detail: 'Readable & verified',
    };
  } catch {
    return {
      path: relPath,
      exists: false,
      bytes: 0,
      status: 'fail',
      detail: 'File missing',
    };
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'impactengine', timestamp: new Date().toISOString() });
  });

  app.get('/api/system-checkup', async (_req, res) => {
    const start = Date.now();
    const [services, files] = await Promise.all([
      Promise.all([checkGemini(), checkTinyFish(), checkLocalFastApi(), checkGithubApi()]),
      Promise.all(CORE_FILES.map(checkFile)),
    ]);

    const serverCheck: ServiceCheck = {
      id: 'express',
      name: 'App Server (/api)',
      status: 'pass',
      latencyMs: 1,
      detail: `Express active on port ${port}`,
      endpoint: '/api/system-checkup',
    };

    const allServices = [serverCheck, ...services];
    const allItems = [...allServices, ...files];
    const passed = allItems.filter((i) => i.status === 'pass').length;
    const warned = allItems.filter((i) => i.status === 'warn').length;
    const failed = allItems.filter((i) => i.status === 'fail').length;

    res.json({
      checkedAt: new Date().toISOString(),
      totalMs: Date.now() - start,
      summary: { passed, warned, failed },
      services: allServices,
      files,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`ImpactEngine listening on http://0.0.0.0:${port}`);
  });
}

startServer();
