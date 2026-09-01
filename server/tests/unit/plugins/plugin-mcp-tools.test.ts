/**
 * PluginMcpToolsService — the grant-enforced MCP tool surface.
 *
 * A plugin's tools are advertised on an MCP session only when ALL of:
 *   1. the plugins kill switch is on;
 *   2. the session's client holds the plugins:use OAuth scope (or full access
 *      via a static token / null scopes);
 *   3. the plugin holds the mcp:tools grant AND reports implementing the
 *      mcpToolProvider hook (providersOf enforces both);
 *   4. the tool is declared in the plugin's manifest capabilities.mcpTools.
 * A call is dispatched back into the plugin with the acting user, so any trip
 * read the tool makes is membership-checked.
 */
import { describe, it, expect, vi } from 'vitest';
import { PluginMcpToolsService, toMcpTextResult } from '../../../src/nest/plugins/plugin-mcp-tools.service';
import type { PluginHooks } from '../../../src/nest/plugins/plugin-hooks.service';
import type { PluginRuntimeService } from '../../../src/nest/plugins/plugin-runtime.service';
import type { DatabaseService } from '../../../src/nest/database/database.service';
import type { RuntimeEnvService } from '../../../src/nest/app-config/runtime-env.service';

function makeService(over: Partial<{
  providersOf: PluginHooks['providersOf'];
  callMcpTool: PluginHooks['callMcpTool'];
  mcpToolCapabilities: PluginRuntimeService['mcpToolCapabilities'];
  grantsOf: PluginRuntimeService['grantsOf'];
}> = {}) {
  const hooks = {
    providersOf: over.providersOf ?? (() => []),
    callMcpTool: over.callMcpTool ?? (async () => ({ ok: true, data: 'x' })),
  } as unknown as PluginHooks;
  const runtime = {
    mcpToolCapabilities: over.mcpToolCapabilities ?? (() => []),
    grantsOf: over.grantsOf ?? (() => new Set()),
  } as unknown as PluginRuntimeService;
  const env = { isManaged: () => false, isDemoMode: () => false } as unknown as RuntimeEnvService;
  const dbs = {} as DatabaseService;
  const svc = new PluginMcpToolsService(hooks, runtime, env, dbs);
  return { svc, hooks };
}

describe('PluginMcpToolsService', () => {
  it('PLUGMCP-001: advertises no plugin tools without the plugins:use scope (default-deny)', () => {
    const { svc } = makeService({
      providersOf: (() => ['p1']) as PluginHooks['providersOf'],
      mcpToolCapabilities: (() => [{ name: 'flight', description: 'Flight status' }]) as PluginRuntimeService['mcpToolCapabilities'],
      grantsOf: (() => new Set(['mcp:tools'])) as PluginRuntimeService['grantsOf'],
    });
    // Scoped session WITHOUT plugins:use — nothing is advertised.
    expect(svc.mcpTools({ userId: 1, scopes: ['trips:read'], isStaticToken: false })).toEqual([]);
    // Full access (static token) still sees them.
    expect(svc.mcpTools({ userId: 1, scopes: null, isStaticToken: true }).map((t) => t.options.name)).toEqual(['plugin_p1_flight']);
    // Holding plugins:use sees them.
    expect(svc.mcpTools({ userId: 1, scopes: ['plugins:use'], isStaticToken: false }).map((t) => t.options.name)).toEqual(['plugin_p1_flight']);
  });

  it('PLUGMCP-002: a plugin without the mcp:tools grant contributes no tools', () => {
    const { svc } = makeService({
      providersOf: (() => ['p1']) as PluginHooks['providersOf'],
      mcpToolCapabilities: (() => [{ name: 'flight', description: 'Flight status' }]) as PluginRuntimeService['mcpToolCapabilities'],
      grantsOf: (() => new Set(['hook:photo-provider'])) as PluginRuntimeService['grantsOf'], // no mcp:tools
    });
    expect(svc.mcpTools({ userId: 1, scopes: ['plugins:use'], isStaticToken: false })).toEqual([]);
  });

  it('PLUGMCP-003: dispatches a tool call back into the plugin with the acting user', async () => {
    const call = vi.fn(async () => 'status OK');
    const { svc } = makeService({
      providersOf: (() => ['p1']) as PluginHooks['providersOf'],
      mcpToolCapabilities: (() => [{ name: 'flight', description: 'Flight status', inputSchema: { code: {} } }]) as PluginRuntimeService['mcpToolCapabilities'],
      grantsOf: (() => new Set(['mcp:tools'])) as PluginRuntimeService['grantsOf'],
      callMcpTool: call as unknown as PluginHooks['callMcpTool'],
    });
    const tools = svc.mcpTools({ userId: 42, scopes: ['plugins:use'], isStaticToken: false });
    expect(tools).toHaveLength(1);
    const result = await tools[0].handler({ code: 'ZRH' }, { userId: 42, scopes: ['plugins:use'], isStaticToken: false });
    expect(result).toMatchObject({ content: [{ type: 'text', text: 'status OK' }] });
    expect(call).toHaveBeenCalledWith('p1', { name: 'flight', args: { code: 'ZRH' } }, 42);
  });

  it('PLUGMCP-004: tool names are namespaced per plugin and never collide', () => {
    const { svc } = makeService({
      providersOf: (() => ['p1', 'p2']) as PluginHooks['providersOf'],
      mcpToolCapabilities: (() => [{ name: 'status', description: 'd' }]) as PluginRuntimeService['mcpToolCapabilities'],
      grantsOf: (() => new Set(['mcp:tools'])) as PluginRuntimeService['grantsOf'],
    });
    const names = svc.mcpTools({ userId: 1, scopes: ['plugins:use'], isStaticToken: false }).map((t) => t.options.name);
    expect(names).toContain('plugin_p1_status');
    expect(names).toContain('plugin_p2_status');
    expect(new Set(names).size).toBe(names.length);
  });

  it('PLUGMCP-005: toMcpTextResult shapes arbitrary plugin returns into an MCP result', () => {
    expect(toMcpTextResult('plain')).toEqual({ content: [{ type: 'text', text: 'plain' }] });
    expect(toMcpTextResult({ data: 1 })).toEqual({ content: [{ type: 'text', text: '{"data":1}' }] });
    expect(toMcpTextResult(undefined)).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(toMcpTextResult({ content: [{ type: 'text', text: 'a' }] })).toEqual({ content: [{ type: 'text', text: 'a' }] });
    expect(toMcpTextResult({ content: [{ type: 'text', text: 'a' }], isError: true })).toMatchObject({ isError: true });
  });
});