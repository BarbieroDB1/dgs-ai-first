#!/usr/bin/env node
// Health check real dos MCP servers locais definidos em .mcp/mcp.json.
// Sobe cada server via stdio, faz o handshake MCP (initialize + tools/list)
// e, para o filesystem, confere se as raízes configuradas existem e têm a
// permissão declarada (rw/ro). Uso: node scripts/mcp-health-check.mjs [caminho-do-mcp.json]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = process.argv[2] || '.mcp/mcp.json';
const TIMEOUT_MS = Number(process.env.MCP_HEALTHCHECK_TIMEOUT_MS || 15000);

// Escopo esperado por server, conforme docs/runbooks/mcp-monitoramento.md.
// Usado para todo server cujo nome comece com "filesystem", onde os
// argumentos de path (após "-y" e o nome do pacote) viram raízes de acesso.
const EXPECTED_FS_SCOPE = {
  './src': 'rw',
  './specs': 'rw',
  './skills': 'rw',
  './docs/novatech': 'ro',
  './data/retrieval-corpus': 'ro',
};

function loadConfig(p) {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function sendRequest(child, msg) {
  child.stdin.write(JSON.stringify(msg) + '\n');
}

function checkServer(name, cfg) {
  return new Promise((resolve) => {
    const start = Date.now();
    let buffer = '';
    let resolved = false;
    const result = { name, ok: false, latencyMs: null, tools: [], error: null };

    let child;
    try {
      child = spawn(cfg.command, cfg.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      result.error = `falha ao iniciar processo: ${e.message}`;
      return resolve(result);
    }

    const finish = (fn) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        result.error = `timeout após ${TIMEOUT_MS}ms — server não respondeu ao handshake MCP`;
        resolve(result);
      });
    }, TIMEOUT_MS);

    let stage = 'initialize';
    let stderrTail = '';

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }

        if (msg.id === 1 && stage === 'initialize') {
          result.latencyMs = Date.now() - start;
          sendRequest(child, { jsonrpc: '2.0', method: 'notifications/initialized' });
          sendRequest(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
          stage = 'tools';
        } else if (msg.id === 2 && stage === 'tools') {
          result.ok = !msg.error;
          result.tools = (msg.result?.tools || []).map((t) => t.name);
          if (msg.error) result.error = `tools/list retornou erro: ${JSON.stringify(msg.error)}`;
          finish(() => resolve(result));
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-500);
    });

    child.on('error', (e) => {
      finish(() => {
        result.error = `erro no processo: ${e.message}`;
        resolve(result);
      });
    });

    child.on('exit', (code) => {
      finish(() => {
        if (!result.ok) {
          result.error = `processo encerrou (code ${code}) antes de responder ao handshake` +
            (stderrTail ? ` — stderr: ${stderrTail.trim().slice(0, 300)}` : '');
        }
        resolve(result);
      });
    });

    sendRequest(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'novatech-mcp-healthcheck', version: '1.0.0' },
      },
    });
  });
}

function checkFilesystemScope(cfg) {
  // Para @modelcontextprotocol/server-filesystem, os argumentos após o nome
  // do pacote são as raízes permitidas (ordem: args[0]='-y', args[1]=pacote, args[2..]=raízes).
  const roots = cfg.args.slice(2);
  return roots.map((r) => {
    const resolved = path.resolve(r);
    const exists = fs.existsSync(resolved);
    let readable = false;
    let writable = false;
    if (exists) {
      try { fs.accessSync(resolved, fs.constants.R_OK); readable = true; } catch {}
      try { fs.accessSync(resolved, fs.constants.W_OK); writable = true; } catch {}
    }
    const expected = EXPECTED_FS_SCOPE[r] ?? null;
    const actual = !exists ? 'ausente' : !readable ? 'sem leitura' : writable ? 'rw' : 'ro';
    return { path: r, resolved, exists, readable, writable, expected, actual };
  });
}

async function main() {
  let config;
  try {
    config = loadConfig(CONFIG_PATH);
  } catch (e) {
    console.error(`Não foi possível ler ${CONFIG_PATH}: ${e.message}`);
    process.exit(2);
  }

  const servers = config.mcpServers || {};
  const names = Object.keys(servers);
  if (names.length === 0) {
    console.log(`Nenhum server configurado em ${CONFIG_PATH}.`);
    process.exit(0);
  }

  console.log(`Health check de ${names.length} MCP server(s) — ${CONFIG_PATH}`);
  console.log(`(timeout por server: ${TIMEOUT_MS}ms)\n`);

  let anyFail = false;
  const report = [];

  for (const name of names) {
    const cfg = servers[name];
    process.stdout.write(`→ ${name} ... `);
    const result = await checkServer(name, cfg);
    if (result.ok) {
      console.log(`OK (${result.latencyMs}ms, ${result.tools.length} tools: ${result.tools.join(', ')})`);
    } else {
      console.log(`FALHOU — ${result.error}`);
      anyFail = true;
    }
    report.push(result);

    if (name.startsWith('filesystem')) {
      const scopes = checkFilesystemScope(cfg);
      for (const s of scopes) {
        let flag = '';
        if (!s.exists || !s.readable) { flag = '  [FALHA]'; anyFail = true; }
        else if (s.expected && s.expected !== s.actual) { flag = `  [ESPERADO ${s.expected}]`; anyFail = true; }
        console.log(`    ${s.path} -> ${s.actual}${flag}`);
      }
    }
  }

  console.log('\n' + (anyFail ? 'RESULTADO: FALHA — ver detalhes acima' : 'RESULTADO: todos os servers saudáveis'));
  process.exit(anyFail ? 1 : 0);
}

main();
