// The seam that lets a per-session MCP server carry tools contributed by
// installed plugins, without src/nest/mcp-transport/ gaining an edge to the
// plugin runtime — the same module-cycle reasoning plugin-event-sink.ts
// documents. Sibling of plugin-event-sink.ts; the plugins layer registers the
// source at bootstrap and clears it on shutdown.

import type { McpContext, McpDynamicTool } from './nest-mcp';

/**
 * PULL rather than push, unlike setPluginEventSink: the answer depends on the
 * session's ctx, so there is nothing a push could carry ahead of time, and
 * reading it on every attach means activating or uninstalling a plugin takes
 * effect on the next session with nothing to invalidate.
 *
 * An unset source is not an error: it means "no plugin tools", which is the
 * right answer for any app built without the plugins runtime, and for every
 * test that never registers one.
 */
export type PluginMcpToolSource = (ctx: McpContext) => readonly McpDynamicTool[];

let source: PluginMcpToolSource | null = null;

export function setPluginMcpToolSource(fn: PluginMcpToolSource | null): void {
  source = fn;
}

export function getPluginMcpToolSource(): PluginMcpToolSource | null {
  return source;
}