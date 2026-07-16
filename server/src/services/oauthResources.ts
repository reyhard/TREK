import { getMcpSafeUrl } from './notifications';

export type PluginOAuthAccess = 'read' | 'write';

const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{2,39}$/;
const PLUGIN_SCOPE_RE = /^plugin:([a-z][a-z0-9-]{2,39}):(read|write)$/;

export function pluginResourceUri(pluginId: string): string {
  if (!PLUGIN_ID_RE.test(pluginId)) throw new Error(`invalid plugin id: ${pluginId}`);
  return `${getMcpSafeUrl().replace(/\/+$/, '')}/api/plugins/${pluginId}`;
}

export function pluginScope(pluginId: string, access: PluginOAuthAccess): string {
  if (!PLUGIN_ID_RE.test(pluginId)) throw new Error(`invalid plugin id: ${pluginId}`);
  return `plugin:${pluginId}:${access}`;
}

export function parsePluginScope(scope: string): { pluginId: string; access: PluginOAuthAccess } | null {
  const match = PLUGIN_SCOPE_RE.exec(scope);
  return match ? { pluginId: match[1], access: match[2] as PluginOAuthAccess } : null;
}

export function parsePluginResource(resource: string): { pluginId: string } | null {
  let expectedOrigin: string;
  let parsed: URL;
  try {
    expectedOrigin = new URL(getMcpSafeUrl()).origin;
    parsed = new URL(resource);
  } catch {
    return null;
  }
  if (parsed.origin !== expectedOrigin || parsed.search || parsed.hash) return null;
  const parts = parsed.pathname.replace(/\/+$/, '').split('/');
  if (parts.length !== 4 || parts[1] !== 'api' || parts[2] !== 'plugins' || !PLUGIN_ID_RE.test(parts[3])) return null;
  const canonical = pluginResourceUri(parts[3]);
  if (resource !== canonical && resource !== `${canonical}/`) return null;
  return { pluginId: parts[3] };
}

export function isPluginScopeAllowed(scopes: string[], pluginId: string, access: PluginOAuthAccess): boolean {
  return (
    scopes.includes(pluginScope(pluginId, access)) ||
    (access === 'read' && scopes.includes(pluginScope(pluginId, 'write')))
  );
}

export function isPluginScope(scope: string): boolean {
  return parsePluginScope(scope) !== null;
}
