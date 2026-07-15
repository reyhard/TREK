# TREK OAuth Plugin Proxy Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an external OAuth client to call explicitly opted-in authenticated plugin proxy routes with a token bound to the exact plugin resource, plugin route scope, user password version, expiry, and revocation state, without changing existing TREK session authentication or plugin capability enforcement.

**Architecture:** Add one reusable resource/scope module that defines canonical plugin resource URIs (`<safe-app-url>/api/plugins/<pluginId>`) and the `plugin:<pluginId>:read|write` scope grammar. Plugin route declarations opt in with `oauthScope: 'read' | 'write'`; the isolated child reports that metadata to the supervisor, and the proxy accepts an OAuth access token only on those routes. OAuth tokens retain the existing opaque `trekoa_` format and database revocation flow, gain a password-version snapshot, and are checked for exact audience and route scope before the existing `runtime.invoke(..., actingUserId)` path runs.

**Tech Stack:** NestJS 11, Express, TypeScript 6, SQLite/better-sqlite3 migrations, Vitest, React 19 client, vanilla JavaScript MyMap plugin, and Python Authorization Code + PKCE companion client.

## Global Constraints

- Do not add npm or Python dependencies; this repository remains dependency-free beyond its existing manifests.
- Do not accept `/mcp`-audienced tokens, arbitrary `trekoa_` strings, session JWTs as OAuth tokens, OAuth tokens for a different plugin, expired tokens, revoked tokens, or tokens with a stale user password version.
- A plugin route is OAuth-addressable only when it declares `auth: true` and `oauthScope: 'read' | 'write'`; `auth: false` webhook/callback routes remain public routes and never accept OAuth access tokens.
- Keep the existing session behavior: cookie sessions and valid TREK JWTs continue to authorize authenticated plugin routes, including routes with OAuth metadata; the OAuth path is additive for external Bearer clients.
- Keep existing CookieAuthGuard, CSRF, CORS, response-header, inbound-header, redirect, and body-forwarding behavior unchanged unless a test explicitly covers the new OAuth branch.
- The canonical plugin resource is exactly `${getMcpSafeUrl().replace(/\/+$/, '')}/api/plugins/${pluginId}` with no query, fragment, or alternate host; trailing-slash normalization is allowed only at OAuth request validation boundaries.
- The canonical plugin scopes are exactly `plugin:<pluginId>:read` and `plugin:<pluginId>:write`; `write` grants access to both `read` and `write` routes, while `read` grants access only to `read` routes.
- OAuth authorization and client-credentials validation must reject plugin scopes paired with the MCP resource and reject MCP scopes paired with a plugin resource.
- Manifest permissions remain the capability boundary. OAuth route scopes are coarse transport authorization and must never bypass `db:*`, `place_edit`, membership, addon, egress, or plugin-owned authorization checks.
- The host must bind both session and OAuth invocations to the authenticated user through the existing `runtime.invoke(..., actingUserId)` argument; the child receives only the existing sanitized `req.user` view.
- OAuth client UI and consent UI must render plugin scopes without assuming every scope exists in the static MCP scope map.
- Every implementation task follows TDD: write the failing test, run the focused test and record the expected failure, implement the smallest change, run the focused test and record the expected pass, then run the task regression set.
- Future implementation commits must be small and focused; the current task is plan authoring only and creates no implementation commit.

---

## File Map

Create:

- `/opt/trek/TREK/server/src/services/oauthResources.ts` - Canonical plugin resource URI, plugin scope construction/parsing, and resource/scope compatibility helpers shared by OAuth validation and the proxy.
- `/opt/trek/TREK/wiki/Plugin-OAuth-Proxy.md` - Operator and plugin-author documentation for route opt-in, OAuth client setup, resource indicators, scope behavior, revocation, and MyMap configuration.

Modify:

- `/opt/trek/TREK/server/src/mcp/scopes.ts` - Accept syntactically valid plugin scopes while retaining the existing MCP scope set and labels.
- `/opt/trek/TREK/server/src/services/oauthService.ts` - Store/check `user_password_version`, validate plugin resources and scope compatibility, and expose the exact OAuth token information needed by the proxy.
- `/opt/trek/TREK/server/src/db/migrations.ts` - Add the additive `oauth_tokens.user_password_version` migration and backfill existing rows from `users.password_version`.
- `/opt/trek/TREK/server/src/nest/plugins/runtime/plugin-sdk.ts` - Add `oauthScope` to the in-repo plugin route contract.
- `/opt/trek/TREK/plugin-sdk/src/index.ts` - Add the published SDK route contract field.
- `/opt/trek/TREK/server/src/nest/plugins/runtime/plugin-host-entry.ts` - Report `oauthScope` from child route declarations.
- `/opt/trek/TREK/server/src/nest/plugins/supervisor/plugin-supervisor.ts` - Validate and retain only safe route metadata received from the child.
- `/opt/trek/TREK/server/src/nest/plugins/plugin-runtime.service.ts` - Expose active plugin OAuth resource metadata for the settings UI and consent/client configuration.
- `/opt/trek/TREK/server/src/nest/plugins/plugins-proxy.controller.ts` - Add the OAuth Bearer branch while preserving the existing session branch and all existing response/request filtering.
- `/opt/trek/TREK/server/src/nest/oauth/oauth-api.controller.ts` - Add the authenticated plugin-resource listing endpoint.
- `/opt/trek/TREK/server/src/nest/oauth/oauth-public.controller.ts` - Validate plugin resource indicators and plugin scopes for client-credentials issuance.
- `/opt/trek/TREK/client/src/api/oauthScopes.ts` - Add dynamic plugin-scope parsing and display metadata.
- `/opt/trek/TREK/client/src/api/client.ts` - Add the plugin-resource API method and response types.
- `/opt/trek/TREK/client/src/components/OAuth/ScopeGroupPicker.tsx` - Include active plugin scopes in OAuth client creation without breaking MCP scope grouping.
- `/opt/trek/TREK/client/src/components/Settings/IntegrationsTab.tsx` - Load active plugin scopes and include them in OAuth client presets and selection state.
- `/opt/trek/TREK/client/src/pages/oauthAuthorize/useOAuthAuthorize.ts` - Group dynamic plugin scopes on the consent page.
- `/opt/trek/TREK/client/src/pages/OAuthAuthorizePage.tsx` - Render safe labels/descriptions for dynamic plugin scopes.
- `/opt/trek/TREK/wiki/Plugin-Development.md` - Link to and summarize the route-level OAuth opt-in contract.
- `/opt/trek/TREK/wiki/MCP-Setup.md` - Clarify that MCP resources/scopes are not valid for plugin proxy resources and link to plugin OAuth setup.
- `/opt/trek/data/plugins/mymap-sync/server/source-sync/routes.js` - Annotate MyMap read and write route declarations with plugin OAuth scopes.
- `/opt/trek/data/plugins/mymap-sync/README.md` - Document the MyMap plugin resource and required OAuth scopes.
- `/opt/MyMap/tools/trek_poi_sync/trek_oauth.py` - Send and persist the RFC 8707 plugin resource indicator while preserving current MCP-client behavior when no resource is configured.
- `/opt/MyMap/tools/trek_poi_sync/cli.py` - Configure `TREK_OAUTH_RESOURCE_URL` for the MyMap sync client and pass it to the OAuth client.
- `/opt/MyMap/tools/trek_poi_sync/companion_service.py` - Validate/load the plugin resource URL for the companion service OAuth client.
- `/opt/MyMap/config/trek-poi-sync.example.json` - Document the plugin scope/resource configuration alongside existing sync settings.

Tests:

- `/opt/trek/TREK/server/tests/unit/services/oauthService.test.ts` - Token password-version, plugin resource, plugin scope, and authorization/client-credentials tests.
- `/opt/trek/TREK/server/tests/unit/plugins/plugins-proxy.test.ts` - OAuth proxy authentication, audience, route-scope, token-prefix, and session-regression tests.
- `/opt/trek/TREK/server/tests/unit/plugins/manifest.test.ts` - Route metadata contract tests for rejecting OAuth metadata on public routes.
- `/opt/trek/TREK/server/tests/unit/nest/oauth.controller.test.ts` - Plugin resource API/controller tests.
- `/opt/trek/TREK/server/tests/unit/db/migration-hygiene.test.ts` - Verify the new migration is additive and ordered.
- `/opt/trek/TREK/plugin-sdk/test/sdk.test.ts` - Published SDK route metadata type/runtime declaration tests.
- `/opt/trek/TREK/client/src/pages/OAuthAuthorizePage.test.tsx` - Dynamic plugin-scope consent rendering tests.
- `/opt/MyMap/tests/test_kml_trek_sync.py` - OAuth resource parameter, token-state binding, refresh, and scope compatibility tests.
- `/opt/MyMap/tests/test_trek_companion.py` - Companion configuration and plugin-resource propagation tests.
- `/opt/trek/data/plugins/mymap-sync/test/source-sync/routes.test.js` - MyMap route declarations expose the intended read/write OAuth metadata.

## Design Decisions

### Resource and Scope Contract

Use a resource URI, not only a scope, as the plugin boundary:

```text
resource = https://trek.example/api/plugins/mymap-sync
read     = plugin:mymap-sync:read
write    = plugin:mymap-sync:write
```

The authorization server accepts a plugin resource only when:

1. The URL is derived from the server's `getMcpSafeUrl()` origin.
2. The path is exactly `/api/plugins/<valid-plugin-id>`.
3. The plugin id exists in the installed `plugins` table.
4. The requested scopes are only `plugin:<same-plugin-id>:read|write`.
5. The requested scope list is non-empty and intersects the OAuth client's `allowed_scopes`.

The MCP resource accepts only the existing MCP scopes. A plugin resource and an MCP resource are never interchangeable. A token with a plugin audience and a plugin scope is still rejected if the plugin is inactive or the route is not declared; the proxy checks liveness and route declaration before token verification.

### Token Verification Order

For an OAuth-enabled route, the proxy must use this order:

```text
1. Match the active plugin route.
2. If the route has no oauthScope, use the unchanged session path.
3. If Authorization is Bearer trekoa_..., verify it with getUserByAccessToken().
4. Reject missing, malformed, expired, revoked, stale-password-version, or wrong-audience tokens with 401.
5. Require plugin:<pluginId>:<route.oauthScope>; write also satisfies read. Missing scope is 403.
6. Invoke the plugin with the OAuth user id as actingUserId.
```

A valid cookie session or TREK JWT continues to use `extractToken()` and `verifyJwtAndLoadUser()` and does not need an OAuth scope. The OAuth branch is selected only for a `trekoa_` Bearer header on a route explicitly declaring `oauthScope`. A `trekoa_` value on a route without OAuth metadata is not passed to the OAuth verifier and therefore cannot broaden existing route access.

### Password-Version Binding

Add `oauth_tokens.user_password_version INTEGER NOT NULL DEFAULT 0`. At issue time, read the current `users.password_version` and store it with the token row. On access-token lookup, join the user row and reject when the stored token snapshot differs from the current user value. On refresh, reject and audit a refresh token whose stored snapshot differs before issuing a new pair. Existing rows are backfilled from the current user version, so the migration is non-destructive and existing tokens remain valid until a password reset, explicit revocation, expiry, or client rotation.

### Capability and Activity Preservation

The proxy continues to call:

```ts
this.runtime.invoke(pluginId, 'invoke.route', params, user?.id)
```

The OAuth branch changes only how `user` is authenticated. The child still receives `{ id, username, isAdmin }`, never the bearer token, cookie, or authorization header. The host capability RPC still sees the same `actingUserId`, so manifest permissions, trip membership, `place_edit`, addon checks, egress policy, capability audit rows, and plugin activity behavior remain authoritative.

## Implementation Tasks

### Task 1: Add Canonical Plugin Resources and Dynamic Scope Grammar

**Files:**
- Create: `/opt/trek/TREK/server/src/services/oauthResources.ts`
- Modify: `/opt/trek/TREK/server/src/mcp/scopes.ts`
- Test: `/opt/trek/TREK/server/tests/unit/services/oauthService.test.ts`

**Interfaces:**
- Produces `pluginResourceUri(pluginId: string): string`.
- Produces `pluginScope(pluginId: string, access: 'read' | 'write'): string`.
- Produces `parsePluginScope(scope: string): { pluginId: string; access: 'read' | 'write' } | null`.
- Produces `parsePluginResource(resource: string): { pluginId: string } | null`.
- Produces `isPluginScopeAllowed(scopes: string[], pluginId: string, access: 'read' | 'write'): boolean`.
- Extends `validateScopes()` so it accepts existing MCP scopes and only the exact plugin scope grammar.

- [ ] **Step 1: Write the failing tests**

Add tests to `server/tests/unit/services/oauthService.test.ts` for the pure helpers through their public imports:

```ts
it('builds one canonical resource and two plugin scopes', () => {
  expect(pluginResourceUri('mymap-sync')).toBe('http://localhost:3001/api/plugins/mymap-sync');
  expect(pluginScope('mymap-sync', 'read')).toBe('plugin:mymap-sync:read');
  expect(pluginScope('mymap-sync', 'write')).toBe('plugin:mymap-sync:write');
});

it.each([
  ['plugin:mymap-sync:read', { pluginId: 'mymap-sync', access: 'read' }],
  ['plugin:mymap-sync:write', { pluginId: 'mymap-sync', access: 'write' }],
])('parses a valid plugin scope %s', (value, expected) => {
  expect(parsePluginScope(value)).toEqual(expected);
});

it.each([
  'plugin:mymap-sync:delete',
  'plugin:Other:read',
  'plugin:mymap_sync:read',
  'plugin:mymap-sync:read:extra',
  'plugin:mymap-sync',
])('rejects invalid plugin scope %s', (value) => {
  expect(parsePluginScope(value)).toBeNull();
  expect(validateScopes([value]).valid).toBe(false);
});

it('requires exact resource and lets write satisfy read only for the same plugin', () => {
  expect(parsePluginResource('http://localhost:3001/api/plugins/mymap-sync/')).toEqual({ pluginId: 'mymap-sync' });
  expect(parsePluginResource('http://localhost:3001/api/plugins/mymap-sync?x=1')).toBeNull();
  expect(isPluginScopeAllowed(['plugin:mymap-sync:write'], 'mymap-sync', 'read')).toBe(true);
  expect(isPluginScopeAllowed(['plugin:other:write'], 'mymap-sync', 'read')).toBe(false);
});
```

Import `pluginResourceUri`, `pluginScope`, `parsePluginScope`, `parsePluginResource`, and `isPluginScopeAllowed` from `src/services/oauthResources`, and import `validateScopes` from `src/mcp/scopes`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm run test --workspace=server -- tests/unit/services/oauthService.test.ts
```

Expected: FAIL because `src/services/oauthResources.ts` and the dynamic-scope branch do not exist.

- [ ] **Step 3: Implement the minimal helpers**

Create `oauthResources.ts` with this shape:

```ts
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
  try {
    expectedOrigin = new URL(getMcpSafeUrl()).origin;
  } catch {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(resource);
  } catch {
    return null;
  }
  if (parsed.origin !== expectedOrigin || parsed.search || parsed.hash) return null;
  const parts = parsed.pathname.replace(/\/+$/, '').split('/');
  if (parts.length !== 4 || parts[1] !== 'api' || parts[2] !== 'plugins' || !PLUGIN_ID_RE.test(parts[3])) return null;
  if (resource !== pluginResourceUri(parts[3]) && resource !== `${pluginResourceUri(parts[3])}/`) return null;
  return { pluginId: parts[3] };
}

export function isPluginScopeAllowed(scopes: string[], pluginId: string, access: PluginOAuthAccess): boolean {
  return scopes.includes(pluginScope(pluginId, access))
    || (access === 'read' && scopes.includes(pluginScope(pluginId, 'write')));
}

export function isPluginScope(scope: string): boolean {
  return parsePluginScope(scope) !== null;
}
```

Update `validateScopes()` in `server/src/mcp/scopes.ts` to use `isPluginScope(s)` in addition to `ALL_SCOPES.includes(s as Scope)`. Keep `Scope`, `ALL_SCOPES`, and all existing MCP labels unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
npm run test --workspace=server -- tests/unit/services/oauthService.test.ts
```

Expected: PASS for the new helper tests and the existing OAuth service tests.

- [ ] **Step 5: Run type checking**

Run:

```bash
npm run typecheck --workspace=server
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit the focused contract change**

Future implementation command:

```bash
git add server/src/services/oauthResources.ts server/src/mcp/scopes.ts server/tests/unit/services/oauthService.test.ts
git commit -m "feat: add plugin OAuth resource scopes"
```

### Task 2: Bind OAuth Tokens to Password Version and Validate Resource Compatibility

**Files:**
- Modify: `/opt/trek/TREK/server/src/db/migrations.ts`
- Modify: `/opt/trek/TREK/server/src/services/oauthService.ts`
- Test: `/opt/trek/TREK/server/tests/unit/services/oauthService.test.ts`
- Test: `/opt/trek/TREK/server/tests/unit/db/migration-hygiene.test.ts`

**Interfaces:**
- `OAuthTokenInfo` continues to return `user`, `scopes`, `clientId`, and `audience`.
- `getUserByAccessToken(rawToken: string): OAuthTokenInfo | null` rejects stale password versions.
- `validateOAuthResourceAndScopes(resource: string, scopes: string[]): { valid: boolean; error?: string }` validates MCP/plugin pairing and installed plugin identity.
- `issueTokens()` and `issueClientCredentialsToken()` persist the issuing user's current `password_version`.

- [ ] **Step 1: Write the failing tests**

Extend `oauthService.test.ts` with these cases. Use the existing `createUser(testDb)` factory and update the user row directly to simulate a password reset:

```ts
it('stores the issuing password version and rejects access after a password reset', () => {
  const { user } = createUser(testDb);
  const tokens = issueTokens('client-1', user.id, ['plugin:mymap-sync:read'], null, 'http://localhost:3001/api/plugins/mymap-sync');
  const row = testDb.prepare('SELECT user_password_version FROM oauth_tokens').get() as { user_password_version: number };
  expect(row.user_password_version).toBe(0);
  expect(getUserByAccessToken(tokens.access_token)).not.toBeNull();
  testDb.prepare('UPDATE users SET password_version = 1 WHERE id = ?').run(user.id);
  expect(getUserByAccessToken(tokens.access_token)).toBeNull();
});

it('accepts an installed plugin resource with matching plugin scopes', () => {
  testDb.prepare("INSERT INTO plugins (id, name, version, status) VALUES ('mymap-sync', 'MyMap Sync', '1.0.0', 'active')").run();
  expect(validateOAuthResourceAndScopes(
    'http://localhost:3001/api/plugins/mymap-sync',
    ['plugin:mymap-sync:read', 'plugin:mymap-sync:write'],
  )).toEqual({ valid: true });
});

it.each([
  ['http://localhost:3001/mcp', ['plugin:mymap-sync:read']],
  ['http://localhost:3001/api/plugins/mymap-sync', ['trips:read']],
  ['http://localhost:3001/api/plugins/other', ['plugin:mymap-sync:read']],
])('rejects incompatible resource/scope pair %s', (resource, scopes) => {
  expect(validateOAuthResourceAndScopes(resource, scopes).valid).toBe(false);
});

it('rejects a refresh token after the user password version changes', () => {
  const { user } = createUser(testDb);
  const client = makeClient(user.id, { scopes: ['plugin:mymap-sync:read'] });
  const tokens = issueTokens(client.client!.client_id as string, user.id, ['plugin:mymap-sync:read'], null, 'http://localhost:3001/api/plugins/mymap-sync');
  testDb.prepare('UPDATE users SET password_version = 1 WHERE id = ?').run(user.id);
  const result = refreshTokens(tokens.refresh_token, client.client!.client_id as string, client.client!.client_secret as string);
  expect(result.error).toBe('invalid_grant');
});
```

Seed the installed-plugin case with the complete insert required by the current schema:

```ts
testDb.prepare("INSERT INTO plugins (id, name, version, status) VALUES ('mymap-sync', 'MyMap Sync', '1.0.0', 'active')").run();
```

Use that row for every `validateOAuthResourceAndScopes()` test that expects an installed plugin; do not bypass the migration-created `plugins` table.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm run test --workspace=server -- tests/unit/services/oauthService.test.ts tests/unit/db/migration-hygiene.test.ts
```

Expected: FAIL because `oauth_tokens.user_password_version`, resource validation, and refresh password checks are absent.

- [ ] **Step 3: Add the additive migration**

Append one migration function at the end of the existing ordered `migrations: Migration[]` list in `server/src/db/migrations.ts`:

```ts
// Bind OAuth tokens to the user's password-version invalidation gate.
() => {
  db.exec('ALTER TABLE oauth_tokens ADD COLUMN user_password_version INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    UPDATE oauth_tokens
    SET user_password_version = COALESCE(
      (SELECT password_version FROM users WHERE users.id = oauth_tokens.user_id),
      0
    )
  `);
},
```

The migration number is the next array position; do not invent a per-migration `id` field. The existing `schema_version` ledger makes the function run once. Do not edit the base schema or delete/recreate `oauth_tokens`. The backfill must leave rows for deleted/missing users at `0`.

- [ ] **Step 4: Persist and verify password versions**

In `oauthService.ts`:

1. Add `user_password_version: number` to `OAuthTokenRow`.
2. Add a private helper:

```ts
function currentPasswordVersion(userId: number): number {
  const row = db.prepare('SELECT password_version FROM users WHERE id = ?').get(userId) as { password_version?: number } | undefined;
  return typeof row?.password_version === 'number' ? row.password_version : 0;
}
```

3. Add `user_password_version` to both token insert statements and pass `currentPasswordVersion(userId)`.
4. Select `ot.user_password_version` and `u.password_version` in `getUserByAccessToken()`, rejecting when the values differ before returning `OAuthTokenInfo`.
5. Select the token password version and current user password version in `refreshTokens()`, returning `{ error: 'invalid_grant', status: 400 }` and writing `oauth.token.invalidated_password_version` when they differ. Do not issue a replacement token.
6. Add `validateOAuthResourceAndScopes()` using `getMcpSafeUrl()`, `parsePluginResource()`, `parsePluginScope()`, `pluginResourceUri()`, and `validateScopes()`. For a plugin resource, require an installed `plugins.id` row, every scope must parse as the same plugin id, and no MCP scope may be present. For the MCP resource, reject plugin scopes and preserve the existing MCP scope validation.
7. Call this validator from authorization-request validation after scope intersection and from the client-credentials branch before `issueClientCredentialsToken()`.
8. Keep `refreshTokens()` inheriting the original `row.audience`; never allow the refresh request body to change token audience.

The validator must return stable OAuth-facing errors such as `invalid_target` and `invalid_scope`; do not expose database or exception text.

- [ ] **Step 5: Run focused tests and migration checks**

Run:

```bash
npm run test --workspace=server -- tests/unit/services/oauthService.test.ts tests/unit/db/migration-hygiene.test.ts
```

Expected: PASS, including the existing MCP OAuth tests and the new migration/password/resource cases.

- [ ] **Step 6: Run full server unit tests**

Run:

```bash
npm run test:unit --workspace=server
```

Expected: PASS. Any fixture failure must be fixed in the test fixture or migration compatibility code without weakening password-version validation.

- [ ] **Step 7: Commit the token and migration change**

Future implementation command:

```bash
git add server/src/db/migrations.ts server/src/services/oauthService.ts server/tests/unit/services/oauthService.test.ts server/tests/unit/db/migration-hygiene.test.ts
git commit -m "feat: bind OAuth tokens to user password versions"
```

### Task 3: Propagate OAuth Route Metadata Through the Plugin Runtime

**Files:**
- Modify: `/opt/trek/TREK/server/src/nest/plugins/runtime/plugin-sdk.ts`
- Modify: `/opt/trek/TREK/plugin-sdk/src/index.ts`
- Modify: `/opt/trek/TREK/server/src/nest/plugins/runtime/plugin-host-entry.ts`
- Modify: `/opt/trek/TREK/server/src/nest/plugins/supervisor/plugin-supervisor.ts`
- Modify: `/opt/trek/TREK/server/src/nest/plugins/plugin-runtime.service.ts`
- Test: `/opt/trek/TREK/plugin-sdk/test/sdk.test.ts`
- Test: `/opt/trek/TREK/server/tests/unit/plugins/plugins-proxy.test.ts`

**Interfaces:**
- `PluginRoute` gains `oauthScope?: 'read' | 'write'`.
- `PluginRouteInfo` gains `oauthScope?: 'read' | 'write'`.
- Child `loaded` event route payload includes `oauthScope` only when valid.
- `PluginRuntimeService.oauthResources(): Array<{ pluginId: string; resource: string; scopes: string[]; routes: Array<{ method: string; path: string; access: 'read' | 'write' }> }>` exposes active route metadata for the UI.

- [ ] **Step 1: Write the failing SDK and runtime tests**

In `plugin-sdk/test/sdk.test.ts`, add the route definition assertion using the existing `definePlugin` test helpers:

```ts
it('accepts an explicit OAuth route scope without changing the handler contract', () => {
  const definition = definePlugin({
    routes: [{
      method: 'GET',
      path: '/status',
      auth: true,
      oauthScope: 'read',
      handler: async () => ({ status: 200, body: { ok: true } }),
    }],
  });
  expect(definition.routes?.[0].oauthScope).toBe('read');
});
```

In `server/tests/unit/plugins/plugins-proxy.test.ts`, update the runtime route fixture to include `oauthScope: 'read'` in one test-only route and assert `runtime.oauthResources()` returns only declared metadata when the runtime method is present. The proxy behavior itself is covered in Task 4.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npm run test --workspace=server -- tests/unit/plugins/plugins-proxy.test.ts
npm test --workspace=plugin-sdk -- test/sdk.test.ts
```

Expected: FAIL because the route interfaces and runtime metadata propagation do not contain `oauthScope`.

- [ ] **Step 3: Add the route contract and child propagation**

Add the exact optional property to both route interfaces:

```ts
oauthScope?: 'read' | 'write';
```

Change the child route projection in `plugin-host-entry.ts` to:

```ts
const routes = (def.routes ?? []).map((r, i) => ({
  i,
  method: r.method,
  path: r.path,
  auth: r.auth !== false,
  ...(r.oauthScope ? { oauthScope: r.oauthScope } : {}),
}));
```

Do not forward arbitrary route properties from the child.

- [ ] **Step 4: Validate metadata at the supervisor boundary**

In `plugin-supervisor.ts`, retain the route metadata shape and add a local type guard:

```ts
function isPluginRouteInfo(value: unknown): value is PluginRouteInfo {
  if (!value || typeof value !== 'object') return false;
  const route = value as Record<string, unknown>;
  if (!Number.isSafeInteger(route.i) || typeof route.method !== 'string' || typeof route.path !== 'string' || typeof route.auth !== 'boolean') return false;
  if (route.oauthScope !== undefined && route.oauthScope !== 'read' && route.oauthScope !== 'write') return false;
  if (route.oauthScope !== undefined && route.auth === false) return false;
  return true;
}
```

When processing `loaded`, set `sup.routes` to the array of `d.routes` values that pass this guard. A malformed route is omitted, not converted into an OAuth route. Preserve the existing route index from the child; do not re-index after filtering because the child handler uses the original route index.

- [ ] **Step 5: Expose active resource metadata**

Add this method to `PluginRuntimeService`:

```ts
oauthResources(): Array<{
  pluginId: string;
  resource: string;
  scopes: string[];
  routes: Array<{ method: string; path: string; access: 'read' | 'write' }>;
}> {
  return this.supervisor.activeIds().flatMap((pluginId) => {
    const routes = this.supervisor.routesOf(pluginId)
      .filter((route) => route.oauthScope)
      .map((route) => ({ method: route.method, path: route.path, access: route.oauthScope! }));
    if (routes.length === 0) return [];
    const scopes = [...new Set(routes.flatMap((route) => [
      pluginScope(pluginId, route.access),
      ...(route.access === 'read' ? [] : [pluginScope(pluginId, 'read')]),
    ]))];
    return [{ pluginId, resource: pluginResourceUri(pluginId), scopes, routes }];
  });
}
```

Import the shared helper functions from `services/oauthResources.ts`. The method lists only active plugins and only routes that explicitly opt in. It must not expose plugin settings, secrets, granted manifest permissions, or inactive plugin metadata.

- [ ] **Step 6: Run focused tests and type checking**

Run:

```bash
npm run test --workspace=server -- tests/unit/plugins/plugins-proxy.test.ts
npm test --workspace=plugin-sdk -- test/sdk.test.ts
npm run typecheck --workspace=server
```

Expected: PASS.

- [ ] **Step 7: Commit the runtime contract change**

Future implementation command:

```bash
git add server/src/nest/plugins/runtime/plugin-sdk.ts plugin-sdk/src/index.ts server/src/nest/plugins/runtime/plugin-host-entry.ts server/src/nest/plugins/supervisor/plugin-supervisor.ts server/src/nest/plugins/plugin-runtime.service.ts plugin-sdk/test/sdk.test.ts server/tests/unit/plugins/plugins-proxy.test.ts
git commit -m "feat: propagate plugin OAuth route metadata"
```

### Task 4: Add the OAuth Proxy Authentication Branch

**Files:**
- Modify: `/opt/trek/TREK/server/src/nest/plugins/plugins-proxy.controller.ts`
- Test: `/opt/trek/TREK/server/tests/unit/plugins/plugins-proxy.test.ts`

**Interfaces:**
- Consumes `PluginRouteInfo.oauthScope`, `getUserByAccessToken()`, `pluginResourceUri()`, and `isPluginScopeAllowed()`.
- Produces the same sanitized child request and response contract as the existing session path.
- Produces 401 for invalid OAuth credentials/audience and 403 for a missing route scope.

- [ ] **Step 1: Write failing OAuth proxy tests**

Extend the existing hoisted mocks:

```ts
const { pluginsEnabledMock, extractTokenMock, verifyMock, oauthTokenMock } = vi.hoisted(() => ({
  pluginsEnabledMock: vi.fn(() => true),
  extractTokenMock: vi.fn(() => 'tok'),
  verifyMock: vi.fn(() => ({ id: 5, username: 'ada', is_admin: false })),
  oauthTokenMock: vi.fn(() => ({
    user: { id: 9, username: 'oauth-user', email: 'oauth@example.com', role: 'user' },
    scopes: ['plugin:mymap-sync:read'],
    clientId: 'client-1',
    audience: 'http://localhost:3001/api/plugins/mymap-sync',
  })),
}));
vi.mock('../../../src/services/oauthService', () => ({ getUserByAccessToken: oauthTokenMock }));
vi.mock('../../../src/services/oauthResources', () => ({
  pluginResourceUri: (id: string) => `http://localhost:3001/api/plugins/${id}`,
  isPluginScopeAllowed: (scopes: string[], id: string, access: 'read' | 'write') => scopes.includes(`plugin:${id}:${access}`) || (access === 'read' && scopes.includes(`plugin:${id}:write`)),
}));
```

Use a request helper that includes `headers: { authorization: 'Bearer trekoa_access' }` and add these tests:

```ts
it('authorizes an OAuth read route and binds the OAuth user to invoke', async () => {
  const runtime = makeRuntime({ routesOf: vi.fn(() => [{ i: 3, method: 'GET', path: '/status', auth: true, oauthScope: 'read' }]) } as never);
  const res = fakeRes();
  await new PluginsProxyController(runtime).proxy('mymap-sync', fakeReq('GET', '/status', { headers: { authorization: 'Bearer trekoa_access' } }), res as never);
  expect(res.statusCode).toBe(200);
  expect(runtime.invoke).toHaveBeenCalledWith('mymap-sync', 'invoke.route', expect.objectContaining({ routeId: 3, req: expect.objectContaining({ user: { id: 9, username: 'oauth-user', isAdmin: false } }) }), 9);
});

it('rejects an OAuth token with the MCP audience', async () => {
  oauthTokenMock.mockReturnValue({ user: { id: 9, username: 'oauth-user' }, scopes: ['places:read'], clientId: 'mcp', audience: 'http://localhost:3001/mcp' });
  const runtime = makeRuntime({ routesOf: vi.fn(() => [{ i: 0, method: 'GET', path: '/status', auth: true, oauthScope: 'read' }]) } as never);
  const res = fakeRes();
  await new PluginsProxyController(runtime).proxy('mymap-sync', fakeReq('GET', '/status', { headers: { authorization: 'Bearer trekoa_access' } }), res as never);
  expect(res.statusCode).toBe(401);
  expect(runtime.invoke).not.toHaveBeenCalled();
});

it('rejects a token for another plugin', async () => {
  oauthTokenMock.mockReturnValue({ user: { id: 9, username: 'oauth-user' }, scopes: ['plugin:other:read'], clientId: 'other', audience: 'http://localhost:3001/api/plugins/other' });
  const runtime = makeRuntime({ routesOf: vi.fn(() => [{ i: 0, method: 'GET', path: '/status', auth: true, oauthScope: 'read' }]) } as never);
  const res = fakeRes();
  await new PluginsProxyController(runtime).proxy('mymap-sync', fakeReq('GET', '/status', { headers: { authorization: 'Bearer trekoa_access' } }), res as never);
  expect(res.statusCode).toBe(401);
});

it('returns 403 when an OAuth token lacks the route scope', async () => {
  oauthTokenMock.mockReturnValue({ user: { id: 9, username: 'oauth-user' }, scopes: ['plugin:mymap-sync:read'], clientId: 'client-1', audience: 'http://localhost:3001/api/plugins/mymap-sync' });
  const runtime = makeRuntime({ routesOf: vi.fn(() => [{ i: 0, method: 'POST', path: '/apply', auth: true, oauthScope: 'write' }]) } as never);
  const res = fakeRes();
  await new PluginsProxyController(runtime).proxy('mymap-sync', fakeReq('POST', '/apply', { headers: { authorization: 'Bearer trekoa_access' } }), res as never);
  expect(res.statusCode).toBe(403);
  expect(runtime.invoke).not.toHaveBeenCalled();
});

it.each(['trekoa_fake', 'trek_static_token', 'Bearer not-a-token'])('does not accept token confusion input %s', async (token) => {
  oauthTokenMock.mockReturnValue(null);
  verifyMock.mockReturnValue(null as never);
  const runtime = makeRuntime({ routesOf: vi.fn(() => [{ i: 0, method: 'GET', path: '/status', auth: true, oauthScope: 'read' }]) } as never);
  const res = fakeRes();
  await new PluginsProxyController(runtime).proxy('mymap-sync', fakeReq('GET', '/status', { headers: { authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } }), res as never);
  expect(res.statusCode).toBe(401);
});

it('keeps a valid session cookie compatible with an OAuth-enabled route', async () => {
  const runtime = makeRuntime({ routesOf: vi.fn(() => [{ i: 0, method: 'GET', path: '/status', auth: true, oauthScope: 'read' }]) } as never);
  const res = fakeRes();
  await new PluginsProxyController(runtime).proxy('mymap-sync', fakeReq('GET', '/status', { cookies: { trek_session: 'session' } }), res as never);
  expect(res.statusCode).toBe(200);
  expect(verifyMock).toHaveBeenCalledWith('tok');
  expect(oauthTokenMock).not.toHaveBeenCalled();
});

it('does not enable OAuth on a route without oauthScope', async () => {
  const runtime = makeRuntime({ routesOf: vi.fn(() => [{ i: 0, method: 'GET', path: '/status', auth: true }]) } as never);
  const res = fakeRes();
  await new PluginsProxyController(runtime).proxy('mymap-sync', fakeReq('GET', '/status', { headers: { authorization: 'Bearer trekoa_access' } }), res as never);
  expect(res.statusCode).toBe(401);
  expect(oauthTokenMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused proxy test to verify it fails**

Run:

```bash
npm run test --workspace=server -- tests/unit/plugins/plugins-proxy.test.ts
```

Expected: FAIL because the proxy currently sends `trekoa_` values through JWT verification and has no audience/scope branch.

- [ ] **Step 3: Implement a narrow OAuth branch in the proxy**

Import `getUserByAccessToken`, `pluginResourceUri`, and `isPluginScopeAllowed`. Add a local header parser that does not inspect cookies:

```ts
function bearerHeader(req: Request): string | null {
  const raw = req.headers.authorization;
  if (typeof raw !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(raw);
  return match?.[1] ?? null;
}
```

Replace only the current `if (route.auth) { ... }` body with this logic:

```ts
if (route.auth) {
  const oauthRaw = route.oauthScope ? bearerHeader(req) : null;
  const isOAuthBearer = !!oauthRaw && oauthRaw.startsWith('trekoa_');
  if (isOAuthBearer) {
    const info = getUserByAccessToken(oauthRaw!);
    if (!info || info.audience !== pluginResourceUri(pluginId)) {
      res.status(401).json({ error: 'Invalid or expired token', code: 'AUTH_REQUIRED' });
      return;
    }
    if (!isPluginScopeAllowed(info.scopes, pluginId, route.oauthScope!)) {
      res.status(403).json({ error: 'OAuth scope required', code: 'OAUTH_SCOPE_REQUIRED' });
      return;
    }
    user = { id: info.user.id, username: info.user.username, is_admin: info.user.role === 'admin' };
  } else {
    const token = extractToken(req);
    const loaded = token ? verifyJwtAndLoadUser(token) : null;
    if (!loaded) {
      res.status(401).json({ error: 'Access token required', code: 'AUTH_REQUIRED' });
      return;
    }
    user = loaded;
  }
}
```

Keep the existing public-route branch, sanitized headers, raw-body handling, response headers, safe redirects, and `runtime.invoke()` call unchanged. The `oauthRaw` branch must not forward `Authorization` or any other inbound headers to the child.

- [ ] **Step 4: Run proxy tests and type checking**

Run:

```bash
npm run test --workspace=server -- tests/unit/plugins/plugins-proxy.test.ts
npm run typecheck --workspace=server
```

Expected: PASS, including all existing webhook/session/header/redirect tests and the new OAuth cases.

- [ ] **Step 5: Commit the proxy change**

Future implementation command:

```bash
git add server/src/nest/plugins/plugins-proxy.controller.ts server/tests/unit/plugins/plugins-proxy.test.ts
git commit -m "feat: authorize opted-in plugin routes with OAuth"
```

### Task 5: Expose Active Plugin Resources to OAuth Client Configuration

**Files:**
- Modify: `/opt/trek/TREK/server/src/nest/oauth/oauth-api.controller.ts`
- Modify: `/opt/trek/TREK/client/src/api/client.ts`
- Modify: `/opt/trek/TREK/client/src/api/oauthScopes.ts`
- Modify: `/opt/trek/TREK/client/src/components/OAuth/ScopeGroupPicker.tsx`
- Modify: `/opt/trek/TREK/client/src/components/Settings/IntegrationsTab.tsx`
- Test: `/opt/trek/TREK/server/tests/unit/nest/oauth.controller.test.ts`
- Test: `/opt/trek/TREK/client/src/pages/OAuthAuthorizePage.test.tsx`

**Interfaces:**
- `GET /api/oauth/plugin-resources` returns `{ resources: PluginOAuthResourceInfo[] }` under the existing MCP addon gate and authenticated API guard.
- `oauthApi.pluginResources()` returns the same typed payload.
- `getScopeDisplay(scope, t)` handles both static MCP scopes and `plugin:<id>:read|write` values.

- [ ] **Step 1: Write the failing server controller test**

Add a mocked runtime to `server/tests/unit/nest/oauth.controller.test.ts` and assert:

```ts
it('lists only active OAuth-enabled plugin resources', () => {
  const runtime = {
    oauthResources: vi.fn(() => [{
      pluginId: 'mymap-sync',
      resource: 'http://localhost:3001/api/plugins/mymap-sync',
      scopes: ['plugin:mymap-sync:read', 'plugin:mymap-sync:write'],
      routes: [{ method: 'GET', path: '/source-sync/v1/trips', access: 'read' }],
    }]),
  };
  const controller = new OauthApiController(oauthServiceMock as never, rateLimitMock as never, runtime as never);
  expect(controller.listPluginResources()).toEqual({ resources: runtime.oauthResources() });
});
```

Add client-side assertions that `getScopeDisplay('plugin:mymap-sync:write', t)` produces the plugin name/operation text and that static MCP scopes retain their translation keys.

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
npm run test --workspace=server -- tests/unit/nest/oauth.controller.test.ts
npm test --workspace=client -- src/pages/OAuthAuthorizePage.test.tsx
```

Expected: FAIL because the endpoint, controller dependency, and dynamic display helpers do not exist.

- [ ] **Step 3: Add the authenticated resource endpoint**

Inject `PluginRuntimeService` into `OauthApiController` and add:

```ts
@Get('plugin-resources')
@UseGuards(JwtAuthGuard)
listPluginResources() {
  this.requireMcp403();
  return { resources: this.runtime.oauthResources() };
}
```

Keep it under `/api/oauth`, not `/oauth`, because it is a settings/client-configuration API and must retain the existing session/Bearer read guard. The endpoint returns no secrets and no inactive plugin rows.

- [ ] **Step 4: Add client API and dynamic display helpers**

Add the response type and API method in `client/src/api/client.ts`:

```ts
export interface OAuthPluginResource {
  pluginId: string;
  resource: string;
  scopes: string[];
  routes: Array<{ method: string; path: string; access: 'read' | 'write' }>;
}

// inside oauthApi
pluginResources: () => apiClient.get('/oauth/plugin-resources').then(r => r.data as { resources: OAuthPluginResource[] }),
```

In `oauthScopes.ts`, add:

```ts
const PLUGIN_SCOPE_RE = /^plugin:([a-z][a-z0-9-]{2,39}):(read|write)$/;

export function pluginScopeParts(scope: string): { pluginId: string; access: 'read' | 'write' } | null {
  const match = PLUGIN_SCOPE_RE.exec(scope);
  return match ? { pluginId: match[1], access: match[2] as 'read' | 'write' } : null;
}

export function getScopeDisplay(scope: string, t: (key: string) => string): ScopeInfo {
  const staticKeys = SCOPE_GROUPS[scope];
  if (staticKeys) return { label: t(staticKeys.labelKey), description: t(staticKeys.descriptionKey), group: t(staticKeys.groupKey) };
  const plugin = pluginScopeParts(scope);
  if (plugin) {
    const operation = plugin.access === 'write' ? 'read and write' : 'read';
    return { label: `${plugin.pluginId} plugin access`, description: `Allow this client to ${operation} the ${plugin.pluginId} plugin proxy`, group: `Plugin: ${plugin.pluginId}` };
  }
  return { label: scope, description: 'Unrecognized scope', group: 'Other' };
}
```

The implementation may use existing translation keys for static scopes. Dynamic plugin ids are data, not translation keys; render them as text after the server has validated the scope grammar.

- [ ] **Step 5: Load and merge plugin scopes in the settings UI**

In `IntegrationsTab.tsx`, load `oauthApi.pluginResources()` whenever `mcpEnabled` is true, flatten the returned `resources[].scopes`, and pass the resulting `availableScopes` to `ScopeGroupPicker`. Keep `ALL_SCOPES` as the base list so existing presets remain deterministic:

```ts
const [oauthPluginResources, setOauthPluginResources] = useState<OAuthPluginResource[]>([]);
const availableOAuthScopes = [...new Set([
  ...ALL_SCOPES,
  ...oauthPluginResources.flatMap(resource => resource.scopes),
])];

useEffect(() => {
  if (!mcpEnabled) return;
  oauthApi.pluginResources().then(d => setOauthPluginResources(d.resources || [])).catch(() => setOauthPluginResources([]));
}, [mcpEnabled]);
```

Update each preset's base scope list to remain the current MCP `ALL_SCOPES` behavior; do not silently grant plugin scopes to existing presets. The user explicitly selects plugin scopes in the picker. `ScopeGroupPicker` must accept `availableScopes?: string[]`, use `getScopeDisplay()` to group/render them, and preserve selected values that came from an existing client even when the plugin is currently inactive.

- [ ] **Step 6: Run focused tests, client type checking, and server tests**

Run:

```bash
npm run test --workspace=server -- tests/unit/nest/oauth.controller.test.ts
npm test --workspace=client -- src/pages/OAuthAuthorizePage.test.tsx
npm run build --workspace=client
npm run typecheck --workspace=server
```

Expected: PASS. The client build must not emit a static-scope indexing error for dynamic plugin scope strings.

- [ ] **Step 7: Commit the resource configuration change**

Future implementation command:

```bash
git add server/src/nest/oauth/oauth-api.controller.ts client/src/api/client.ts client/src/api/oauthScopes.ts client/src/components/OAuth/ScopeGroupPicker.tsx client/src/components/Settings/IntegrationsTab.tsx server/tests/unit/nest/oauth.controller.test.ts client/src/pages/OAuthAuthorizePage.test.tsx
git commit -m "feat: expose plugin OAuth resources to clients"
```

### Task 6: Render Plugin Scopes Correctly on OAuth Consent

**Files:**
- Modify: `/opt/trek/TREK/client/src/pages/oauthAuthorize/useOAuthAuthorize.ts`
- Modify: `/opt/trek/TREK/client/src/pages/OAuthAuthorizePage.tsx`
- Test: `/opt/trek/TREK/client/src/pages/OAuthAuthorizePage.test.tsx`

**Interfaces:**
- `useOAuthAuthorize()` returns `scopesByGroup` containing both static and plugin scopes.
- Consent selection continues to submit the exact selected scope strings to `oauthApi.authorize()`.
- Unknown/invalid scope display never becomes an authorization grant; the server remains authoritative.

- [ ] **Step 1: Write the failing consent test**

Add a page test with a mocked validation response containing:

```ts
scopes: ['plugin:mymap-sync:read', 'plugin:mymap-sync:write']
```

Assert the rendered consent page contains `mymap-sync plugin access`, `read`, and `read and write`, and that pressing approve sends the original exact scope strings rather than translated labels.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test --workspace=client -- src/pages/OAuthAuthorizePage.test.tsx
```

Expected: FAIL because dynamic scopes currently fall into `Other` and render their raw scope string without operation descriptions.

- [ ] **Step 3: Use the shared display helper in the consent state machine and page**

In `useOAuthAuthorize.ts`, import `getScopeDisplay` and group each requested scope by `getScopeDisplay(s, t).group`. Return the existing `scopesByGroup` shape so selection logic is unchanged.

In `OAuthAuthorizePage.tsx`, replace both `SCOPE_GROUPS[s]` display lookups with:

```ts
const display = getScopeDisplay(s, t);
```

Render `display.label` and `display.description`; keep `s` as the checkbox key and the value sent to `submitConsent()`. Remove the now-unneeded direct `SCOPE_GROUPS` import if no other code uses it.

- [ ] **Step 4: Run the client test and build**

Run:

```bash
npm test --workspace=client -- src/pages/OAuthAuthorizePage.test.tsx
npm run build --workspace=client
```

Expected: PASS.

- [ ] **Step 5: Commit the consent UI change**

Future implementation command:

```bash
git add client/src/pages/oauthAuthorize/useOAuthAuthorize.ts client/src/pages/OAuthAuthorizePage.tsx client/src/pages/OAuthAuthorizePage.test.tsx
git commit -m "feat: show plugin OAuth scopes on consent"
```

### Task 7: Annotate MyMap Routes and Configure the Companion OAuth Resource

**Files:**
- Modify: `/opt/trek/data/plugins/mymap-sync/server/source-sync/routes.js`
- Modify: `/opt/trek/data/plugins/mymap-sync/README.md`
- Test: `/opt/trek/data/plugins/mymap-sync/test/source-sync/routes.test.js`
- Modify: `/opt/MyMap/tools/trek_poi_sync/trek_oauth.py`
- Modify: `/opt/MyMap/tools/trek_poi_sync/cli.py`
- Modify: `/opt/MyMap/tools/trek_poi_sync/companion_service.py`
- Modify: `/opt/MyMap/config/trek-poi-sync.example.json`
- Test: `/opt/MyMap/tests/test_kml_trek_sync.py`
- Test: `/opt/MyMap/tests/test_trek_companion.py`

**Interfaces:**
- MyMap resource: `https://<trek-host>/api/plugins/mymap-sync`.
- MyMap scopes: `plugin:mymap-sync:read` for trips/preview and `plugin:mymap-sync:write` for apply.
- MyMap environment variable: `TREK_OAUTH_RESOURCE_URL`.
- Existing `TrekOAuthClient` callers that do not pass a resource continue using the current MCP default behavior.

- [ ] **Step 1: Write the failing MyMap route metadata tests**

In `data/plugins/mymap-sync/test/source-sync/routes.test.js`, assert the exported route array contains:

```js
expect(routes.map(({ method, path, oauthScope }) => ({ method, path, oauthScope }))).toEqual([
  { method: 'GET', path: '/source-sync/v1/trips', oauthScope: 'read' },
  { method: 'POST', path: '/source-sync/v1/preview', oauthScope: 'read' },
  { method: 'POST', path: '/source-sync/v1/apply', oauthScope: 'write' }
]);
```

In `test_kml_trek_sync.py`, add a constructor test that an OAuth client configured with `resource='https://trek.example/api/plugins/mymap-sync'` places `resource` in the authorization URL and in both authorization-code and refresh-token form fields.

In `test_trek_companion.py`, add a config test that `TREK_OAUTH_RESOURCE_URL` is required when OAuth URLs/credentials are configured and is passed to the created `TrekOAuthClient`.

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
node --test /opt/trek/data/plugins/mymap-sync/test/source-sync/routes.test.js
.venv/bin/python -m pytest /opt/MyMap/tests/test_kml_trek_sync.py /opt/MyMap/tests/test_trek_companion.py -q
```

Expected: FAIL because routes lack `oauthScope`, the Python client does not accept a resource, and companion configuration does not load the resource environment variable.

- [ ] **Step 3: Annotate the MyMap plugin routes**

Change only the route declarations in `source-sync/routes.js`:

```js
return [
  { ...createTripListRoute(), oauthScope: 'read' },
  { method: 'POST', path: '/source-sync/v1/preview', auth: true, oauthScope: 'read', handler: previewHandler },
  { method: 'POST', path: '/source-sync/v1/apply', auth: true, oauthScope: 'write', handler: applyHandler }
];
```

Do not remove `requireSourceSyncAccess`, the preview ownership binding, the apply confirmation requirement, the `place_edit` check, the trip membership check, or any input/output sanitization. Update the MyMap README with:

```text
Resource: ${TREK_OAUTH_RESOURCE_URL}
Read scope: plugin:mymap-sync:read
Write scope: plugin:mymap-sync:write
Routes:
GET  /api/plugins/mymap-sync/source-sync/v1/trips
POST /api/plugins/mymap-sync/source-sync/v1/preview
POST /api/plugins/mymap-sync/source-sync/v1/apply
```

- [ ] **Step 4: Add an optional resource indicator to the Python OAuth client**

Change `TrekOAuthClient.__init__` to accept `resource: str | None = None`. Validate it with the existing endpoint policy when non-null. Add the resource only to OAuth requests when configured:

```py
def _resource_fields(self) -> dict[str, str]:
    return {"resource": self.resource} if self.resource else {}
```

Use `**self._resource_fields()` in the dictionaries passed to `authorization_url()`, `exchange_code()`, and `refresh_access_token()`. Store `resource` in token state when configured and require a stored resource to equal the configured resource on read. For a client constructed without `resource`, preserve the current token-state schema acceptance and request payloads.

The client must never infer a resource from an arbitrary request path. The configured URL is the explicit trust boundary and is validated as HTTPS or localhost through the existing `validate_endpoint_url()`.

- [ ] **Step 5: Configure CLI and companion service**

In `cli.py`, pass:

```py
resource=os.environ["TREK_OAUTH_RESOURCE_URL"],
```

to `_oauth_client()` after validating that the environment value exists when OAuth is enabled. In `CompanionConfig`, add:

```py
```

Load `TREK_OAUTH_RESOURCE_URL`, validate it with `validate_endpoint_url()`, and require it alongside `TREK_OAUTH_AUTHORIZE_URL`, `TREK_OAUTH_TOKEN_URL`, `TREK_OAUTH_CLIENT_ID`, and `TREK_OAUTH_CLIENT_SECRET` in `_oauth_from_environment()`. Pass it to `TrekOAuthClient(resource=config.oauth_resource_url)`.

Add this to `config/trek-poi-sync.example.json` as an operator-facing comment-free JSON key because the file is JSON:

```json
"oauth_resource_url": "https://trek.example/api/plugins/mymap-sync"
```

The environment variable remains the runtime source of truth; the example JSON documents the corresponding value and must not be read as a secret-bearing config.

- [ ] **Step 6: Run MyMap/plugin tests and verify token-state isolation**

Run:

```bash
node --test /opt/trek/data/plugins/mymap-sync/test/source-sync/routes.test.js
.venv/bin/python -m pytest /opt/MyMap/tests/test_kml_trek_sync.py /opt/MyMap/tests/test_trek_companion.py -q
```

Expected: PASS. Include cases for mismatched stored resource, a missing resource in a plugin-configured token file, refresh propagation, and the existing no-resource MCP client behavior.

- [ ] **Step 7: Commit the companion integration change**

Future implementation commands, run separately in their repositories:

```bash
cd /opt/trek && git add data/plugins/mymap-sync/server/source-sync/routes.js data/plugins/mymap-sync/README.md data/plugins/mymap-sync/test/source-sync/routes.test.js && git commit -m "feat: opt MyMap sync routes into OAuth"
cd /opt/MyMap && GIT_DIR=/opt/MyMap/.git-repo git add tools/trek_poi_sync/trek_oauth.py tools/trek_poi_sync/cli.py tools/trek_poi_sync/companion_service.py config/trek-poi-sync.example.json tests/test_kml_trek_sync.py tests/test_trek_companion.py && GIT_DIR=/opt/MyMap/.git-repo git commit -m "feat: bind MyMap sync OAuth to plugin resource"
```

### Task 8: Add OAuth Controller and End-to-End Regression Coverage

**Files:**
- Modify: `/opt/trek/TREK/server/src/nest/oauth/oauth-public.controller.ts`
- Modify: `/opt/trek/TREK/server/tests/e2e/oauth.e2e.test.ts`
- Modify: `/opt/trek/TREK/server/tests/integration/oauth.test.ts`
- Modify: `/opt/trek/TREK/server/tests/unit/services/oauthService.test.ts`

**Interfaces:**
- Client-credentials requests accept `resource=https://trek.example/api/plugins/mymap-sync` only with matching `plugin:mymap-sync:*` scopes.
- Authorization-code requests carry the validated plugin resource into `pending.resource`, token issuance, and `oauth_tokens.audience`.
- Refresh preserves the plugin audience and scopes without trusting a new resource parameter.

- [ ] **Step 1: Write failing OAuth flow tests**

Add integration/e2e coverage for this sequence:

```text
1. Install/seed active mymap-sync plugin metadata and an OAuth client allowed plugin:mymap-sync:read/write.
2. Validate an authorization request with the plugin resource and plugin scopes.
3. Approve through the existing cookie-authenticated consent endpoint.
4. Exchange the code with PKCE and assert response scope/audience-backed DB row.
5. Call GET /api/plugins/mymap-sync/source-sync/v1/trips with Bearer trekoa_... and assert success.
6. Call POST /api/plugins/mymap-sync/source-sync/v1/apply with the read-only token and assert 403 before child invocation.
7. Revoke the token/session and assert the same GET returns 401.
8. Increment users.password_version and assert the same token returns 401.
9. Call the same proxy route with an MCP-audienced token and assert 401.
```

Add client-credentials cases for valid plugin resource, wrong resource, MCP scope with plugin resource, plugin scope with MCP resource, and a plugin scope for an unknown plugin.

- [ ] **Step 2: Run focused integration tests to verify they fail**

Run:

```bash
npm run test:integration --workspace=server -- tests/integration/oauth.test.ts
npm run test:e2e --workspace=server -- tests/e2e/oauth.e2e.test.ts
```

Expected: FAIL because the public controller still accepts only MCP resource validation and the proxy flow is not yet covered end to end.

- [ ] **Step 3: Validate client-credentials resources in the public controller**

In `oauth-public.controller.ts`, normalize the submitted `resource` exactly as existing MCP code does for trailing slashes, default it to the MCP resource when absent, and call `this.oauth.validateOAuthResourceAndScopes(audience, grantedScopes)` before issuing the token. Return:

```ts
res.status(400).json({
  error: validation.error === 'invalid_scope' ? 'invalid_scope' : 'invalid_target',
  error_description: validation.error === 'invalid_scope'
    ? 'Requested scopes are not valid for this resource'
    : 'Requested resource is not a valid TREK resource',
});
```

Do not echo arbitrary resource URLs or token values. Keep existing client authentication, addon gating, rate limiting, `Cache-Control: no-store`, audit actions, and client-credentials restrictions intact.

- [ ] **Step 4: Verify authorization-code audience and refresh behavior**

Ensure `validateAuthorizeRequest()` passes the plugin resource to `createAuthCode()`, `oauth-public.controller.ts` passes `pending.resource` to `issueTokens()`, and the refresh path calls `issueTokens(..., row.audience ?? null)` without reading a replacement request resource. Add assertions that the plugin audience is stored exactly and survives refresh.

- [ ] **Step 5: Run full OAuth and plugin regression tests**

Run:

```bash
npm run test --workspace=server -- tests/unit/services/oauthService.test.ts tests/unit/plugins/plugins-proxy.test.ts tests/unit/nest/oauth.controller.test.ts tests/integration/oauth.test.ts tests/e2e/oauth.e2e.test.ts
npm run typecheck --workspace=server
```

Expected: PASS. Specifically verify that MCP authorization still accepts MCP scopes, public webhook routes still skip authentication, valid session-cookie plugin requests still work, and all invalid OAuth combinations fail closed.

- [ ] **Step 6: Commit the end-to-end hardening**

Future implementation command:

```bash
git add server/src/nest/oauth/oauth-public.controller.ts server/tests/e2e/oauth.e2e.test.ts server/tests/integration/oauth.test.ts server/tests/unit/services/oauthService.test.ts
git commit -m "test: cover plugin OAuth resource enforcement"
```

### Task 9: Document Operations, Migration, and Security Guarantees

**Files:**
- Create: `/opt/trek/TREK/wiki/Plugin-OAuth-Proxy.md`
- Modify: `/opt/trek/TREK/wiki/Plugin-Development.md`
- Modify: `/opt/trek/TREK/wiki/MCP-Setup.md`
- Modify: `/opt/trek/data/plugins/mymap-sync/README.md`

**Interfaces:**
- Documentation defines the exact route declaration, resource URI, scope values, client setup, token behavior, and verification commands used by Tasks 1-8.

- [ ] **Step 1: Write documentation checks**

Use the exact shell assertions in Step 4 for documentation verification; do not add a new documentation dependency or test framework.

- [ ] **Step 2: Document plugin author configuration**

In `Plugin-OAuth-Proxy.md`, include this complete declaration:

```ts
export default definePlugin({
  routes: [
    {
      method: 'GET',
      path: '/v1/items',
      auth: true,
      oauthScope: 'read',
      handler: async (req, ctx) => ({ status: 200, body: await ctx.trips.listMine() }),
    },
    {
      method: 'POST',
      path: '/v1/items',
      auth: true,
      oauthScope: 'write',
      handler: async (req, ctx) => ({ status: 200, body: await ctx.trips.update(Number((req.body as { tripId: number }).tripId), req.body as Record<string, unknown>) }),
    },
  ],
});
```

Explain that `auth:false` routes cannot have `oauthScope`, that session requests remain valid, that write implies read, and that route scopes do not replace manifest permissions or plugin-owned authorization.

- [ ] **Step 3: Document operator/client setup and MyMap values**

Document these exact URLs:

```text
Authorization endpoint: https://trek.example/api/oauth/authorize
Token endpoint:        https://trek.example/oauth/token
MyMap resource:        https://trek.example/api/plugins/mymap-sync
MyMap read scope:      plugin:mymap-sync:read
MyMap write scope:     plugin:mymap-sync:write
Trips route:           https://trek.example/api/plugins/mymap-sync/source-sync/v1/trips
Preview route:         https://trek.example/api/plugins/mymap-sync/source-sync/v1/preview
Apply route:           https://trek.example/api/plugins/mymap-sync/source-sync/v1/apply
```

Document the settings UI flow: enable MCP, activate the plugin, create an OAuth client, select only the needed plugin scopes, set `TREK_OAUTH_RESOURCE_URL` to the exact resource, and use Authorization Code + PKCE. Document token revocation through Settings, password reset invalidation through `password_version`, and the 401/403 distinction.

- [ ] **Step 4: Run documentation and final verification commands**

Run:

```bash
test -s /opt/trek/TREK/docs/superpowers/plans/2026-07-15-trek-oauth-plugin-proxy.md
rg -n "oauthScope|plugin:mymap-sync:read|plugin:mymap-sync:write|TREK_OAUTH_RESOURCE_URL|/api/plugins/mymap-sync" /opt/trek/TREK/wiki /opt/trek/data/plugins/mymap-sync /opt/MyMap/tools/trek_poi_sync /opt/MyMap/config
npm run test --workspace=server
npm run typecheck --workspace=server
npm run build --workspace=client
npm test --workspace=plugin-sdk
node --test /opt/trek/data/plugins/mymap-sync/test/source-sync/routes.test.js
.venv/bin/python -m pytest /opt/MyMap/tests/test_kml_trek_sync.py /opt/MyMap/tests/test_trek_companion.py -q
```

Expected:

- The plan file is non-empty.
- `rg` finds the documented route metadata, scope names, resource environment variable, and MyMap proxy paths.
- Server unit/integration/e2e tests pass.
- Server typecheck passes.
- Client build passes.
- Published plugin SDK tests pass.
- MyMap route tests pass.
- MyMap OAuth/companion tests pass.

- [ ] **Step 5: Commit documentation separately**

Future implementation command:

```bash
git add wiki/Plugin-OAuth-Proxy.md wiki/Plugin-Development.md wiki/MCP-Setup.md data/plugins/mymap-sync/README.md
git commit -m "docs: document plugin OAuth proxy access"
```

## Final Acceptance Checklist

- [ ] A route with `auth: true` and no `oauthScope` still accepts the same session cookie/JWT inputs and rejects OAuth tokens.
- [ ] A route with `auth: false` still skips authentication and receives only the existing safe inbound headers/raw body.
- [ ] A route with `oauthScope: 'read'` accepts only a valid session or a valid `trekoa_` token with exact plugin audience and read/write plugin scope.
- [ ] A route with `oauthScope: 'write'` rejects a read-only token with 403 before child invocation.
- [ ] A token with an MCP audience, another plugin audience, null audience, wrong plugin scope, revoked row, expired row, stale password version, or invalid raw value is rejected.
- [ ] Authorization-code and client-credentials flows validate resource/scope compatibility; refresh preserves the original audience and scope set.
- [ ] `oauth_tokens.user_password_version` is migrated additively and existing rows are backfilled.
- [ ] OAuth user identity reaches `runtime.invoke()` as the acting user and the child never receives bearer/cookie headers.
- [ ] Plugin manifest permissions, trip membership, `place_edit`, plugin audit rows, and plugin activity remain enforced through the existing host path.
- [ ] The UI lists active plugin scopes without granting them automatically to existing MCP presets and renders them safely on the consent page.
- [ ] MyMap sends `resource=https://<trek-host>/api/plugins/mymap-sync`, uses `plugin:mymap-sync:read` and `plugin:mymap-sync:write`, and persists token state bound to that resource.
- [ ] No implementation file outside the task file is modified during plan authoring, and no commit is created for this plan-writing task.
