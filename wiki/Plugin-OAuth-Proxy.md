# Plugin OAuth Proxy Access

TREK can issue OAuth access tokens for individual, explicitly opted-in plugin
proxy routes. A token is bound to one plugin resource, its plugin scopes, the
user who granted access, that user's password version, its expiry, and its
revocation state.

Plugin OAuth is additive. Cookie sessions and TREK session JWTs continue to
work on authenticated plugin routes. OAuth does not bypass plugin manifest
permissions, trip membership, user permissions such as `place_edit`, addon
gates, egress policy, or checks implemented by the plugin.

## Opt a route in

Declare `auth: true` and an `oauthScope` on each route that an external OAuth
client may call:

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

`oauthScope` is either `read` or `write`. A write grant satisfies both read and
write routes; a read grant satisfies only read routes. A route without
`oauthScope` remains session-only. Public `auth: false` webhook and callback
routes cannot declare `oauthScope` and never accept OAuth access tokens.

The host authenticates the token and invokes the plugin as the granting user.
The child receives only the sanitized `req.user` object; it never receives the
bearer token, cookie, or arbitrary inbound headers.

## Resource and scopes

For a plugin id `my-plugin`, the values are:

```text
Resource:    https://trek.example/api/plugins/my-plugin
Read scope:  plugin:my-plugin:read
Write scope: plugin:my-plugin:write
```

The resource must use the configured TREK public origin and exact plugin proxy
path. MCP's `/mcp` resource accepts only MCP scopes; plugin resources accept
only matching scopes for that same plugin. They are not interchangeable.

## Configure a client

1. Enable the MCP addon and activate the plugin.
2. Open **Settings -> Integrations -> MCP -> OAuth Clients** and create a client.
3. Select only the plugin scopes the client needs. Plugin scopes are never
   added automatically by an MCP preset.
4. Configure the client with the exact plugin resource.
5. Use Authorization Code + PKCE for an interactive user, or a machine client
   where unattended client credentials are appropriate.

The relevant endpoints are:

```text
Authorization endpoint: https://trek.example/api/oauth/authorize
Token endpoint:        https://trek.example/oauth/token
```

## MyMap source sync

```text
MyMap resource:        https://trek.example/api/plugins/mymap-sync
MyMap read scope:      plugin:mymap-sync:read
MyMap write scope:     plugin:mymap-sync:write
Trips route:           https://trek.example/api/plugins/mymap-sync/source-sync/v1/trips
Preview route:         https://trek.example/api/plugins/mymap-sync/source-sync/v1/preview
Apply route:           https://trek.example/api/plugins/mymap-sync/source-sync/v1/apply
```

Set `TREK_OAUTH_RESOURCE_URL` to the exact MyMap resource. Use the read scope
for trips and preview, and the write scope for apply.

## Revocation and failures

Access and refresh tokens retain TREK's normal expiry and revocation behavior.
Revoking the OAuth client or token in Settings invalidates access. Changing the
user's password increments `password_version`, which invalidates previously
issued plugin access and refresh tokens.

- `401` means the bearer credential is missing, malformed, expired, revoked,
  bound to an old password version, or issued for another resource.
- `403` means the token is valid for the plugin resource but lacks the route's
  required scope, or another existing TREK permission gate denied the action.
