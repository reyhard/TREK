/**
 * Advertises plugin-published tools on every MCP session, and dispatches the
 * calls back into the plugin that published them.
 *
 * The tool set is decided per session by the plugins:use scope (the client
 * must hold it, or hold full access via a static token) AND the mcp:tools
 * grant (the admin must have granted the plugin the ability to publish). The
 * two-sided check — the plugin must declare the tool in its manifest
 * (mcpToolCapabilities) AND report implementing the mcpToolProvider hook
 * (providersOf) — is the same auditability rule callPlugin uses for exports.
 *
 * This service owns the process-level source (plugin-mcp-tools.ts) rather than
 * PluginRuntimeService because it needs PluginHooks, which injects
 * PluginRuntimeService: owning it there would be a cycle.
 */
import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RuntimeEnvService } from '../app-config/runtime-env.service';
import { isDemoUserId } from '../common/demo-write';
import { pluginsEnabled } from './kill-switch';
import { PluginHooks, type HookMcpToolCall } from './plugin-hooks.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { setPluginMcpToolSource } from '../../plugin-mcp-tools';
import type { McpContext, McpDynamicTool, McpTextResult } from '../../nest-mcp';
import { demoDenied, errorResult } from '../../nest-mcp';

const HOOK = 'mcpToolProvider';

/** Ceiling on the number of tools one plugin may advertise. */
const MCP_TOOLS_MAX = 8;

/** A plugin-local tool name is advertised namespaced to avoid collisions. */
function mcpToolName(pluginId: string, name: string): string {
  return `plugin_${pluginId}_${name}`;
}

@Injectable()
export class PluginMcpToolsService implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    private readonly hooks: PluginHooks,
    private readonly runtime: PluginRuntimeService,
    private readonly env: RuntimeEnvService,
    private readonly dbs: DatabaseService,
  ) {}

  onApplicationBootstrap(): void {
    setPluginMcpToolSource((ctx) => this.mcpTools(ctx));
  }

  onModuleDestroy(): void {
    setPluginMcpToolSource(null);
  }

  /**
   * Every plugin tool this session may see. Synchronous, and never throws: a
   * per-plugin failure should cost that plugin's tools and nothing else.
   */
  mcpTools(ctx: McpContext): McpDynamicTool[] {
    if (!pluginsEnabled()) return [];
    // The coarse scope is the client-side gate: a scoped session must hold
    // plugins:use; null scopes (static token) = full access.
    if (ctx.scopes !== null && !ctx.scopes.includes('plugins:use')) return [];
    const out: McpDynamicTool[] = [];
    for (const id of this.hooks.providersOf(HOOK)) {
      let tools: McpDynamicTool[];
      try {
        tools = this.toolsOf(id);
      } catch {
        // One plugin's bad row contributes nothing; the others still advertise.
        continue;
      }
      out.push(...tools);
    }
    return out;
  }

  /**
   * One plugin's advertised tools: declared in the signed manifest AND the
   * plugin holding the mcp:tools grant (providersOf enforces the hook + grant).
   */
  private toolsOf(pluginId: string): McpDynamicTool[] {
    const declared = this.runtime.mcpToolCapabilities(pluginId);
    if (!declared.length) return [];
    const grants = this.runtime.grantsOf(pluginId);
    if (!grants.has('mcp:tools')) return [];
    const out: McpDynamicTool[] = [];
    for (const tool of declared.slice(0, MCP_TOOLS_MAX)) {
      out.push({
        options: {
          name: mcpToolName(pluginId, tool.name),
          ...(tool.title ? { title: tool.title } : {}),
          description: tool.description,
          inputSchema: tool.inputSchema as never,
          annotations: tool.annotations as never,
          access: { group: 'plugins', mode: 'use' },
        },
        owner: this,
        handler: (args, ctx) => this.invokeTool(pluginId, tool.name, args, ctx),
      });
    }
    return out;
  }

  /** Run one tool and shape whatever comes back into an MCP result. */
  private async invokeTool(pluginId: string, name: string, args: unknown, ctx: McpContext): Promise<McpTextResult> {
    if (!pluginsEnabled()) return errorResult('Plugins are disabled on this server.');
    if (isDemoUserId(this.env, this.dbs, ctx.userId)) return demoDenied();
    try {
      const raw = await this.hooks.callMcpTool(pluginId, { name, args: (args ?? {}) as Record<string, unknown> } satisfies HookMcpToolCall, ctx.userId);
      return toMcpTextResult(raw);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return errorResult(`Plugin "${pluginId}" could not run "${name}": ${message.slice(0, 300)}`);
    }
  }
}

/** True for a value already shaped like an MCP result the SDK would accept. */
function isTextResult(v: unknown): v is McpTextResult {
  return typeof v === 'object' && v !== null && Array.isArray((v as { content?: unknown }).content);
}

/** Whatever the plugin returned, as a result the SDK and every client accept. */
export function toMcpTextResult(raw: unknown): McpTextResult {
  const flagged = isTextResult(raw) && raw.isError === true;
  const errorFlag = flagged ? { isError: true as const } : {};
  if (isTextResult(raw)) {
    const blocks = raw.content
      .filter((c): c is { type: 'text'; text: string } => !!c && (c as { type?: unknown }).type === 'text')
      .map((c) => ({ type: 'text' as const, text: String(c.text ?? '') }));
    if (blocks.length) return { content: blocks, ...errorFlag };
  }
  if (typeof raw === 'string') return { content: [{ type: 'text', text: raw }], ...errorFlag };
  if (raw === undefined) return { content: [{ type: 'text', text: 'ok' }], ...errorFlag };
  return { content: [{ type: 'text', text: JSON.stringify(raw) }], ...errorFlag };
}