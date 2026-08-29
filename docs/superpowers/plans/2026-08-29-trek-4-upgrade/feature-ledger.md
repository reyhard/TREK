# TREK 4.0 Fork Upgrade — Feature Ledger (Task 00)

**Author:** opencode (task 00 subagent)
**Date:** 2026-08-29
**Status:** Complete feature ledger with evidence (Task 00 gate)
**Revised:** 2026-08-29 (review-fix pass — single-class classifications, migration-176
signature, mobile outcomes, added F26/F27)
**Re-reviewed:** 2026-08-29 (re-review remediation — ntfy credential isolation F28,
client-robustness F29/F30/F31, exact path+blob on every current-upstream comparison,
F26 definitive)
**Re-reviewed 2:** 2026-08-29 (Task 00 review remediation — F02 redaction split/decision,
f1b09e5b client deltas F32/F33, stale-geometry PRESERVE policy F07/F08, F23 accept-upstream,
F17 concrete OAuth-proxy comparison + broker hardening F34, schema-198 wording, auditable
per-family upstream-refresh log)
**Re-reviewed 3:** 2026-08-29 (Task 00 critical-finding remediation — map/route-visibility family
from `9c11cfa6`/`c4f834f9`/`5d3385bc`/`75edfe25`: route-toggle semantics F35, booking-route
endpoint visibility/bounds F36, persisted connection-ID deduplication F37; all three classified
`FORK_ONLY` with RETAIN/PORT decisions; F12 commit list completed with the reposition restore)

This ledger is the evidence-backed, one-by-one inventory of every behavior in the
`reyhard/TREK` fork that is not simply upstream `v3.4.1`. It is the mandatory
precondition for every implementation task (Tasks 01–09).

---

## 1. Frozen references and topology

| Item | Value |
| --- | --- |
| Fork | `reyhard/TREK` (origin remote) |
| Upstream | `mauriceboe/TREK` (upstream remote; GitHub rename target of `liketrek/TREK`) |
| Frozen fork tag | `fork-pre-4.0-2026-08-29` (local **annotated** tag; target verified `814ed86a2f7172905cc837d6b6488ccd6285c1fe`; not pushed) |
| Fork HEAD SHA | `814ed86a2f7172905cc837d6b6488ccd6285c1fe` |
| Fork HEAD subject | `merge: timeline mobile visual polish` (2026-08-08) |
| Common upstream ancestor/tag | `v3.4.1` = `a0994658890eae96624fb9cbe7f55867f047fea2` |
| Qualified 4.0 baseline | `v4.0.0` (annotated) → commit `a00b84b2165fe21be949d4527098cb724f9ab394` (`chore: bump version to 4.0.0`) |
| Current upstream | `upstream/main` = `33a33e7b1d113f0742ac609305cc549a4806d31b` (`chore: bump version to 4.1.1`) |
| Upstream current release | `v4.1.1` (`8dc724f1a4a8ed4f02c8a66983d54d85c74acd44` → `33a33e7b`) |

Derived counts (all re-derived at execution time):

```
git merge-base fork-pre-4.0-2026-08-29 v3.4.1   -> a0994658 (== v3.4.1)
git rev-list --count v3.4.1..fork-pre-4.0       -> 213 fork-only commits
git rev-list --count v3.4.1..v4.0.0             -> 5 (bulk was squash-merged as "v4.0.0 (#1719)")
git rev-list --count v4.0.0..upstream/main      -> 791 post-4.0 upstream commits
git rev-list --count origin/main..fork-pre-4.0  -> 42 local (unpushed) commits
```

Changed files between `v3.4.1` and the fork: **1270** (633 `server/`, 411 `client/`,
162 `shared/`, 34 `.superpowers/`, 11 `docs/`, 7 `wiki/`, plus charts/plugin-sdk).
Net diff: **+503,266 / −62,604**. The large net is dominated by the fork's upstream
3.4.x *sync* re-merges (see §7) and package-lock/i18n churn, not by fork features.

---

## 2. Method and evidence rule

Each feature is characterized using **primary evidence only**:

1. fork commits (SHAs) in `v3.4.1..fork-pre-4.0-2026-08-29`;
2. fork implementation files (data model / REST API / MCP tool / client UI);
3. fork tests (unit/integration/e2e);
4. migration state (`server/src/db/migrations.ts`);
5. equivalent artifacts at `v4.0.0` (`a00b84b2`);
6. equivalent artifacts at `upstream/main` (`33a33e7b`) with exact SHA.

Docs/`.superpowers`/`wiki` are cited only as secondary confirmation. Every
classification names a decision that a reviewer can trace to code/tests/commits.

Classification vocabulary (from spec §2) — **each row gets exactly one** of:

| Class | Meaning |
| --- | --- |
| `UPSTREAMED_V4` | v4.0.0 already implements it; drop fork implementation, keep a characterization test |
| `UPSTREAMED_CURRENT` | present only in current upstream (post-4.0); adopt the upstream commit |
| `PARTIAL` | partially upstream; port/adapt only the missing delta |
| `FORK_ONLY` | genuine fork delta; reimplement against 4.0 architecture |
| `OBSOLETE` | no longer needed / superseded; do not port |
| `COMPAT_ONLY` | keep only for external compatibility (with tests + removal path) |

Composite values (e.g. `UPSTREAMED_V4 (hardening → PARTIAL)`, `OBSOLETE/COMPAT_ONLY`)
are **not** allowed as classifications. Nuance lives in the per-feature rationale or
the explicit `Recommendation` field on each row.

---

## 3. Reference SHAs (post-4.0 upstream commits that supersede fork work)

Verified present in `upstream/main` (and **not** ancestors of `v4.0.0`):

| Upstream SHA | Subject | Supersedes fork feature |
| --- | --- | --- |
| `aa5002b2ed4b48834b61ba808636ba67692db1cc` | fix(mcp): keep transit out of the transport create enum | stored-transit editing (`update_transit_journey`) |
| `f1bbd94f2b1393eb6a08d25e38a32c9a602fa90f` | feat(mcp): booking link and end time on a reservation | reservation `url` over MCP |
| `092223c25979d0af7eead1cbcbd912ba984d79e4` | feat(mcp): plugins:use OAuth scope | dynamic `plugin:<id>:read/write` scopes |

---

## 4. Feature ledger (summary)

| ID | Feature family | Fork commits | Classification | Recommendation | Migration action |
| --- | --- | --- | --- | --- | --- |
| F01 | Per-leg connector / public-transit action | 28920cc0 … 34e658d3 (9) | `UPSTREAMED_V4` | — | Drop old connector UI; use upstream per-leg travel mode + transit planning |
| F02 | Transitous MCP search/create | 37310302 … 4b02c932 (~20) | `UPSTREAMED_V4` | **Definitive: DROP the error-redaction delta** — `e982e35b`/`efc35a90` added redaction but the upstream-3.4 sync merge `68fe32c7` reverted it at the frozen fork; frozen fork exposes `err.message` exactly like upstream (`errorResult`, transit.mcp.ts:34–38). No security/API delta; no port | Use Nest MCP transit; no hardening port expected |
| F03 | Planned-only POI filter | 45648ade, f38af78f, 455dc4f2, caea30bb, edb7464a | `UPSTREAMED_V4` | — | Drop fork implementation; retain characterization test |
| F04 | Selected-day transit geometry | 567e9c89, f667bb43, 6b58ffce, e7323cd7 | `UPSTREAMED_V4` | — | Drop fork `reservationRoutes` scoping |
| F05 | Transit connector prefill | a97e4552 | `UPSTREAMED_V4` | — | Convert to regression tests |
| F06 | Edit stored transit over MCP | 97ee89a5, 5a5ab75c, c4209c57 | `UPSTREAMED_CURRENT` | Keep dedicated tool as thin alias **only** if an agent depends on the tool name | Adopt `aa5002b2`; use generic `update_transport` |
| F07 | Transit endpoint backend replacement | 4ebbb819, 6bff6fb1, c138235b, 822ff9b4 (+UI/`e6309321`) | `UPSTREAMED_CURRENT` | **Stale-geometry policy decided: PRESERVE** — endpoint edits update stop coordinates only; the saved provider itinerary/geometry (`metadata.transit`, `route_geometry`) is retained unchanged until a new Transitous search replaces it (fork `updateTransitRouteEndpoints` and upstream `update_transport` endpoints-only semantics agree). No geometry invalidation | Use generic transport update path; port the preserve-policy as a characterization test |
| F08 | Map-side transit endpoint editor | 4bc62ec5, 6fbc3d52, 2d734584, 48356079 | `FORK_ONLY` | Desktop + mobile (reachable from mobile sidebar portal); port keeps the F07 PRESERVE policy (editor save updates pins only, never recomputes geometry/legs) | Port UI/domain onto 4.0 map/planner |
| F09 | Reservation `url` over MCP | e9a1f3e0 | `UPSTREAMED_CURRENT` | — | Adopt `f1bbd94f`; never add separate `link` field |
| F10 | Existing Cost → reservation linking | 92aee6e1, 287975b6, b3b68d0a, f8d6f8f7, 41159e73, ae1758ac, 13fbe370 | `FORK_ONLY` | — | Implement atop 4.0 Costs/Reservations |
| F11 | Multiple cost links / safe unlink | (with F10; ae1758ac) | `FORK_ONLY` | — | Preserve relationship semantics |
| F12 | POI marker reposition | ae7649bd, 019cdf55, 63936e2e, 5d3385bc, 75edfe25 | `FORK_ONLY` | Desktop + mobile (mobile inspector preserved by 63936e2e; draggable-marker restore in 75edfe25) | Port to Leaflet/GL/map state |
| F13 | Track-aware route bypass + movement totals | c4823a57 … b409eb87 (~27, merge 4ce5c739) | `FORK_ONLY` | — | Port domain onto current routing pipeline |
| F14 | Transit-distance → movement | 4dcfb114 | `FORK_ONLY` | Consume upstream transit leg data (`leg.distance` in `transit.service.ts`), do not duplicate storage | Consume upstream transit leg data |
| F15 | Timeline planner (draggable + duration + context/duration MCP + mobile) | 203cdeae … 814ed86a (~42) | `FORK_ONLY` | `duration_minutes` model already upstream — consume it, never re-add; mobile served by upstream `MPlanTimeline` | Reimplement against 4.0 planner |
| F16 | Dynamic `plugin:<id>:read/write` scopes | 3752d481, 97ee89a5 (shared) | `OBSOLETE` | Add isolated `COMPAT_ONLY` layer only if a deployed client is proven to hold legacy scopes | Prefer `plugins:use` + admin MCP grants |
| F17 | Fork plugin OAuth/runtime stack (resource proxy) | 112f656a | `OBSOLETE` | **Concrete: inbound `trekoa_` resource-proxy token auth + dynamic `plugin:<id>:read/write` gating is a bridge-era mechanism** — upstream proxy (blob `f75ae8cf…`) authenticates plugin routes only by JWT session; 4.0 plugin apps run in a sandboxed iframe on their own origin; superseded by the 4.0 proxy + `plugins:use` scope (F16). Outbound broker hardening split to F34 | Do not port; accept upstream JWT-session proxy |
| F18 | `oauth_tokens.user_password_version` | 112f656a, 8bc507ef, 4d2654b4 | `OBSOLETE` | DB compatibility is a Task 02 bridge concern, not a ported feature; do not recreate the column | Schema-176 compatibility bridge (Task 02) |
| F19 | reservation endpoints/day positions/needs_review model | (pre-3.4.1 base) | `UPSTREAMED_V4` | — | Use upstream model |
| F20 | Old MCP bootstrap/session bridge | 112f656a (touched `bootstrap.ts`/`sessionManager.ts`) | `OBSOLETE` | — | Do not port |
| F21 | Old `server/src/services/*` | (79 files present at fork) | `OBSOLETE` | — | Translate only still-required behavior to Nest |
| F22 | Old WebSocket bridge | (in services) | `OBSOLETE` | — | Use current event/broadcast path |
| F23 | Static-token deprecation-warning patch | 380b890c | `OBSOLETE` | **Definitive: DROP the fork's removal — accept upstream.** Current upstream (33a33e7b) still surfaces the deprecation on 4 surfaces (`STATIC_TOKEN_DEPRECATION_NOTICE`, `auth.mcp.ts` `token_auth_notice` prompt, `sessionManager.ts:12`, `IntegrationsTab.tsx` badge+callout). A text notice breaks no agent/tool contract; no compat requirement | Do not re-apply `380b890c`; keep upstream's notice |
| F24 | Upstream 3.4.x sync cluster | 5e1e3f0d, aa364b3f, 3ce600da, 68fe32c7 (+ Task 2–13 fixes) | `UPSTREAMED_V4` | — | Already in v3.4.1/v4.0.0; no migration action |
| F25 | Deployment env-var normalization (Task 12) | f935b1dd, 6ecbc093, 44bce05b, 3bce7b5f … | `UPSTREAMED_V4` | Env vars (`DEMO_MODE`, `BACKUP_UPLOAD_LIMIT_MB`, `OVERPASS_URL`, `OVERPASS_TIMEOUT_MS`) already declared at `v4.0.0` in charts/`.env.example`/app-config | Re-check 4.0 env inventory rather than porting |
| F26 | Live `reservation:positions` client handler + stale-visibility cleanup | 01b83434, ef79ae11 | `FORK_ONLY` | **Definitive decision: RETAIN/PORT** — server event is upstream (REST + MCP broadcast); only the client **reducer** is fork-only; upstream client ignores the event (`IGNORED_WS_EVENTS`) but the fork's live merge + stale cleanup removes a real deleted-id failure mode; desktop + mobile (store-level); Task 08 is validation only, not a classification deferral | Port the reducer case + stale cleanup onto 4.0 store |
| F27 | Plugin registry screenshot fallback | 7975d992 | `FORK_ONLY` | Backend/API only (registry browse/detail projection) | Port `?.trim() ||` fallback to 4.0 `registry.service.ts` |
| F28 | ntfy admin-token credential isolation | c8950368, f2482d31 | `FORK_ONLY` | **Security hardening** — never fall back to the admin token for a per-user ntfy send or the `/api/notifications/test-ntfy` endpoint; admin token only for admin-global sends | Port to 4.0 `channels/builtins.ts` + `notifications.controller.ts` (remove the two upstream fallbacks) |
| F29 | Client settings normalization | b8700146, f1b09e5b | `FORK_ONLY` | Desktop + mobile settings surfaces (store-level) | Port `normalizeSettings` onto 4.0 `settingsStore` (coexist with upstream `withNormalizedTileUrl`) |
| F30 | Client focus restoration + a11y utilities | b8700146, f1b09e5b | `FORK_ONLY` | Desktop + mobile (shared `Modal` used by both shells) | Port `accessibility.ts` (`respectReducedMotion`, `saveFocusForRestore`/`restoreFocus`) + `Modal` focus restore; `isRtlLanguage` already upstream — don't port |
| F31 | safeParseMetadata defensive parsing | f1b09e5b, a30a6a17 | `FORK_ONLY` | Desktop + mobile (planner/PDF/shared-trip views) | Port `safeParseMetadata`/`safeTransitMeta` and replace raw `JSON.parse` in the 4.0 equivalents of the listed sites |
| F32 | Editable transit `status` + `confirmation_number` in `TransitJourneyModal` | f1b09e5b | `FORK_ONLY` | Desktop + mobile (modal reachable from the mobile sidebar portal); backend already persists both fields via the generic reservation update | Port the two generic editable fields onto 4.0 `TransitJourneyModal` |
| F33 | Cross-day end-date display in `DayPlanSidebarTransportDetailModal` | f1b09e5b | `FORK_ONLY` | Desktop + mobile (modal opened from `DayPlanSidebar`, which renders in the mobile sidebar portal) | Port end-date extraction + `→ end date` line onto the 4.0 modal |
| F34 | Outbound plugin-OAuth broker nonce + provider-config fingerprint binding | ea08df9b | `FORK_ONLY` | **Security hardening** — bind authorize `state` to nonce + provider-config fingerprint, validate on callback (block token exchange stored under a changed config) | Port onto 4.0 `plugins/oauth/plugin-oauth.service.ts`, keeping upstream PKCE/state/TTL |
| F35 | Route-toggle semantics (routeShown/distance-unit no-OSRM-refetch) | 9c11cfa6, c4f834f9 | `FORK_ONLY` | Desktop + mobile — visibility-only toggles must not re-fetch OSRM; route hidden/shown via `enabled` return gating | Port `enabledRef` + `enabled ? route : null` gating onto 4.0 `useRouteCalculation`; keep FE-HOOK-ROUTE-022/023/024 |
| F36 | Booking-route endpoint visibility/bounds | 75edfe25 (+5d3385bc type/test reconcile) | `FORK_ONLY` | Desktop + mobile — map fit/bounds include endpoints of *visible* booking routes; `fitKey` bumps when visibleConnections change | Port `visibleReservationEndpointPoints` + bounds/fitKey integration onto 4.0 `MapView`/`MapViewGL`/`useTripPlanner` |
| F37 | Persisted connection-ID deduplication | 75edfe25 | `FORK_ONLY` | Desktop + mobile (store-level util) — `trek:visible-connections` ids never accumulate duplicates | Port `new Set` dedup in `parseStoredConnections`/`toggleConnectionId` + fork dedup tests |

---

## 5. Per-feature evidence

### F01 — Per-leg connector / public-transit action — `UPSTREAMED_V4`

- **Fork commits:** `28920cc0` (connector planning model), `919201ab` (route connector
  action menu), `9f5f50c4` (clamp menu), `6c88158e` (launch planning from POI connectors),
  `66ae2009` (prefill/place connector journeys), `fa0c1baa` (test), `8423e490` (preserve
  connector timeline placement), `f92053ed` (mobile tapping), `34e658d3` (ignore notes).
- **Fork behavior:** adds a "connector" concept (`client/src/components/Planner/transitConnector.ts`,
  `transitSearchTypes.ts`, `DayPlanSidebarRouteConnector.tsx`) to launch transit planning
  between POIs and prefill/place connector journeys on the timeline.
- **Affected:** client planner (`transitConnector.ts`, `DayPlanSidebarRouteConnector.tsx`,
  `DayPlanSidebar.tsx`), transit search types, tests `transitConnector.test.ts`.
- **v4.0 evidence:** `client/src/components/Planner/DayPlanSidebarRouteConnector.tsx` and
  per-leg travel mode + `TransitSearchPanel.tsx` exist at `v4.0.0`. Connector concept is
  upstream's own per-leg mode resolution.
- **Current upstream:** same — `upstream/main:client/src/components/Planner/DayPlanSidebarRouteConnector.tsx`
  (blob `e61dbff9…`, identical to v4.0.0) and `upstream/main:client/src/components/Planner/TransitSearchPanel.tsx`
  (blob `e08f2534…`). The fork's `transitConnector.ts`/`transitSearchTypes.ts` are absent upstream.
- **Mobile outcome:** desktop + mobile (upstream's own connector/per-leg surfaces render in
  both the desktop sidebar and the mobile sidebar portal).
- **Migration action:** drop fork connector UI; rely on upstream per-leg travel mode.
- **Tests:** fork `transitConnector.test.ts` is characterization; upstream
  `DayPlanSidebarRouteConnector` tests are the target.

### F02 — Transitous MCP search/create — `UPSTREAMED_V4`

- **Fork commits:** `37310302` (server tz conversion), `db84631e` (validate/rank itineraries),
  `1b2ea199` (normalized itinerary limits), `8997db01` (route payloads), `fc35e78a` (atomic
  persist), `75420abe` (title overrides), `3f72089f`/`743e3b39`/`55929dd7`/`b08d33ce`
  (provider usage limits + stale cleanup), `7f6144e9` (search/plan), `e982e35b` (redact
  failures), `efc35a90` (scope provider errors), `3ff6ad87` (create/replace), `ceae8146` (docs).
- **Fork behavior:** Transitous-backed MCP tools `search_transit_stops`, `search_transit_routes`,
  `create_transit_journey` plus provider usage limiting.
- **Affected:** `server/src/mcp/tools/transit.ts`, `server/src/services/transit*`, shared usage limiter.
- **v4.0 evidence:** `server/src/nest/transit/transit.mcp.ts` registers
  `search_transit_stops`, `search_transit_routes`, `create_transit_journey` (NestJS). Present at `v4.0.0`.
- **Current upstream:** same three tools — `upstream/main:server/src/nest/transit/transit.mcp.ts`
  (blob `3517b1c2…`, identical at v4.0.0 and upstream/main), `transit.controller.ts` (blob
  `7f6293f7…`), `transit.service.ts` (blob `beff0957…`). Rate limiting is upstream:
  `transit.mcp.ts:41` `rateLimit()` over the shared limiter
  (`server/src/nest/common/rate-limit.service.ts`, blob `eae58058…`, identical at
  v4.0.0/upstream-main) with identical buckets (`mcp_transit_geocode` 300, `mcp_transit_plan`
  60) and a 15-minute window; REST is limited via `transit.controller.ts:23`. The fork's
  `transitRateLimit.ts` hardening is functionally superseded.
- **Unexpected-error redaction — definitive decision (re-review finding F02):**
  - **Status: DROP (do not port).** `e982e35b` ("redact unexpected transit failures") and
    `efc35a90` ("scope transit provider errors") ARE in `v3.4.1..fork-pre-4.0` but their
    behavior does **not** survive at the frozen fork. The upstream-3.4 sync merge `68fe32c7`
    ("merge: synchronize frozen upstream TREK 3.4", 2026-07-20) re-wrote
    `server/src/mcp/tools/transit.ts` and took the upstream `errorResult(err, fallback)`
    shape, dropping the fork's `EXPECTED_TRANSIT_ERRORS` redaction. Verified: the first
    parent of `68fe32c7` (`^1`) still contains 4 `EXPECTED_TRANSIT` references; the merged
    tree (`^2`/result) has 0.
  - **Frozen fork state:** `fork-pre-4.0:server/src/mcp/tools/transit.ts` (blob `61be7217…`)
    uses `errorResult(err, fallback)` at lines 45–49 and returns `err instanceof Error ?
    err.message : fallback` — behaviourally identical to upstream `transit.mcp.ts:34–38`.
    The fork's own `tools-transit.test.ts` carries **0** redaction assertions. The only
    generic-catch redaction left at the frozen fork is `update_transit_journey`'s
    `'Failed to update transit journey.'` (line 263) — that belongs to F06, not F02.
  - **Security treatment:** no credential/secret is exposed by surfacing a Transitous
    provider/validation `Error.message`; the fork shipped without the redaction from
    2026-07-20 onward, matching upstream. Re-introducing redaction would be a NEW hardening
    beyond the fork delta and would diverge from upstream's public MCP tool contract
    (assistants rely on `err.message` for diagnostics).
  - **API treatment:** upstream `errorResult` returns the provider/validation message when
    the error is an `Error`, else the fallback — identical to the frozen fork. No API
    change; do not alter `transit.mcp.ts:34–38`.
  - **Test treatment:** no fork redaction tests exist at the frozen point to port; upstream
    transit tests (`transit.service.test.ts`, `transit-itinerary.helpers.test.ts`) are the
    target. No characterization test required for a delta that does not exist.
  - **Mobile outcome:** backend/API only.
- **Migration action:** use Nest MCP transit; no hardening port expected.
- **Tests:** upstream `transit.service.test.ts` (itinerary parsing), `transit-itinerary.helpers.test.ts`;
  fork `transitRateLimit.test.ts` is superseded by upstream `rate-limit.service.test.ts`.

### F03 — Planned-only POI filter — `UPSTREAMED_V4`

- **Fork commits:** `45648ade` (add filter), `f38af78f` (sync with markers), `455dc4f2`/`edb7464a`
  (i18n), `caea30bb` (test ID collisions).
- **Fork behavior:** a "planned / unplanned" filter in the places sidebar.
- **Affected:** `client/src/components/Planner/PlacesSidebar.tsx`, `PlacesSidebarHeader.tsx`,
  `PlacesSidebarList.tsx`, `usePlacesSidebar.ts`, `shared/src/i18n/*/places.ts`.
- **v4.0 evidence:** `v4.0.0:client/src/components/Planner/PlacesSidebarHeader.tsx` already has
  `{ id: 'unplanned' }` / `{ id: 'planned' }` filter options (lines ~89–98).
- **Current upstream:** present — `upstream/main:client/src/components/Planner/PlacesSidebarHeader.tsx`
  blob `a760588d…` (identical to v4.0.0), `unplanned`/`planned` filter options at lines 95–96.
- **Mobile outcome:** desktop + mobile (PlacesSidebar is rendered in both the desktop planner
  and the mobile sidebar portal).
- **Migration action:** drop fork implementation; retain a characterization test.

### F04 — Selected-day transit geometry — `UPSTREAMED_V4`

- **Fork commits:** `567e9c89` (scope transit routes to selected day), `f667bb43` (leaflet),
  `6b58ffce` (GL), `e7323cd7` (pass selected day to transit map).
- **Fork behavior:** only render transit geometry for the selected day.
- **Affected:** `client/src/utils/reservationRoutes.ts`, `MapView.tsx`, `MapViewGL.tsx`, `TripPlannerPage.tsx`.
- **v4.0 evidence:** `selectedDayId` present in `v4.0.0` `MapView.tsx`, `MapViewGL.tsx`,
  `PlacesSidebarList.tsx`, `PlacesSidebarRow.tsx`, `DayPlanSidebar.tsx` — selected-day transit
  visibility is upstream behavior.
- **Current upstream:** present — `upstream/main:client/src/components/Map/MapView.tsx` blob
  `c119af4a…` and `upstream/main:client/src/components/Map/MapViewGL.tsx` blob `f82c0335…`
  both carry `selectedDayId` transit scoping.
- **Mobile outcome:** desktop + mobile (selected-day transit visibility drives both map renderers
  and the mobile map).
- **Migration action:** drop fork `reservationRoutes` scoping.

### F05 — Transit connector prefill — `UPSTREAMED_V4`

- **Fork commit:** `a97e4552` (restore transit connector prefill).
- **Fork behavior:** prefill transit search when launched from a connector.
- **Affected:** `client/src/pages/TripPlannerPage.tsx`.
- **v4.0 evidence:** `TransitSearchPanel.tsx` + `DayPlanSidebarRouteConnector.tsx` present at `v4.0.0`.
- **Current upstream:** present — `upstream/main:client/src/components/Planner/TransitSearchPanel.tsx`
  blob `e08f2534…` and `upstream/main:client/src/components/Planner/DayPlanSidebarRouteConnector.tsx`
  blob `e61dbff9…` (connector identical to v4.0.0).
- **Mobile outcome:** desktop + mobile (connector-launched prefill works in the transport modal
  opened from the mobile sidebar too).
- **Migration action:** convert old fix into regression tests; verify edge cases (notes/timed neighbors).

### F06 — Edit stored transit over MCP — `UPSTREAMED_CURRENT`

- **Fork commits:** `97ee89a5` (reconcile transit tools + journey updates), `5a5ab75c`
  (unify itinerary validation/persistence), `c4209c57` (preserve generic fields on
  `update_transit_journey`, `TOOL_ANNOTATIONS_WRITE`).
- **Fork behavior:** `update_transit_journey` MCP tool edits a stored journey without a new
  provider search.
- **Affected:** `server/src/mcp/tools/transit.ts` (`update_transit_journey`), `transports.ts`.
- **v4.0 evidence:** `update_transit_journey` is **absent** at `v4.0.0` (only search/create exist).
- **Current upstream:** `update_transit_journey` still absent; stored transit is editable through
  the generic `update_transport` tool. `aa5002b2` ("keep transit out of the transport create enum")
  makes that path canonical. `update_transport` exists at `upstream/main`
  (`server/src/nest/reservations/reservations.mcp.ts`, blob `9671187c…`), accepts `endpoints[]`
  and `legs[]`, and `TRANSPORT_TYPES` includes `'transit'`.
- **Compatibility requirement:** keep `update_transit_journey` only as a thin alias if an
  existing agent genuinely depends on the tool name (spec §8.2); no duplication of persistence.
- **Migration action:** adopt `aa5002b2`; keep `update_transit_journey` only as a thin alias if an
  existing agent depends on it.
- **Tests:** characterize via fork transit tool tests; target upstream `update_transport` tests.

### F07 — Transit endpoint backend replacement — `UPSTREAMED_CURRENT`

- **Fork commits:** `4ebbb819` (contract), `6bff6fb1` (atomic route endpoint update),
  `c138235b` (REST API), `822ff9b4` (MCP tool `update_transit_route_endpoints`), `e6309321`
  (`route_geometry` + coordinate validation).
- **Fork behavior:** atomically replace a stored transit journey's endpoints (REST + MCP), with
  `route_geometry` persisted on places. `updateTransitRouteEndpoints` (fork blob
  `server/src/services/transitRouteEndpointService.ts`) updates only the `from`/`to` rows of
  `reservation_endpoints` (name/lat/lng); the tool description states it "preserves the saved
  provider itinerary, legs, timing, geometry, statistics, metadata, status, title, notes, and
  day-plan position. Does not call Transitous or create walking legs."
- **Affected:** `server/src/mcp/tools/transit.ts` (`update_transit_route_endpoints`),
  `server/src/services/transitRouteEndpointService.ts`, `reservations.controller.ts`,
  `shared/src/reservation/reservation.schema.ts` (`transitRouteEndpointsUpdateRequestSchema`),
  `places` `route_geometry` column.
- **v4.0 evidence:** `update_transit_route_endpoints` absent at `v4.0.0`; `route_geometry`
  present in 4.0 model (`v4.0.0:server/src/nest/journey/journey-domain.service.ts:815–831`,
  `db/migrations.ts:693` — `ALTER TABLE places ADD COLUMN route_geometry TEXT`, guarded).
- **Current upstream:** `update_transit_route_endpoints` absent; generic `update_transport` covers
  stored-transit endpoint replacement (`endpoints[]` replaces the full stop list; `TRANSPORT_TYPES`
  includes `'transit'`; `server/src/nest/reservations/reservations.mcp.ts` blob `9671187c…`).
  An endpoints-only `update_transport` (no `metadata`, no `legs`) leaves the stored
  `metadata.transit` (provider itinerary/geometry) untouched — the tool description documents
  that `legs[]` without `metadata` keeps `metadata.transit`, and `metadata` is only replaced
  wholesale when explicitly passed.
- **Stale-geometry policy — definitive decision (re-review finding F07/F08):**
  **PRESERVE (never invalidate, never silently re-route).** An endpoint edit updates the stop
  coordinates only; the saved provider itinerary and route geometry (`metadata.transit`, legs,
  leg distances, `route_geometry`) are retained unchanged until a new Transitous search
  replaces them. This is simultaneously (a) the frozen fork's own documented + tested
  `updateTransitRouteEndpoints` behavior and (b) upstream `update_transport`'s endpoints-only
  semantics, so the 4.0 port has no new server logic — only a characterization test proving the
  preserve-invariant. This is the explicit policy required by spec §7.3; there is no remaining
  deferral.
- **Migration action:** use generic transport update path (`update_transport`); port the
  preserve-policy as a characterization test (endpoints-only update leaves `metadata.transit`
  and legs unchanged, performs no provider search). The fork REST surface
  (`transitRouteEndpointsUpdateRequestSchema`) maps onto `update_transport`'s `endpoints[]`.
- **Tests:** fork `tools-transit.test.ts` endpoint-replacement tests + fork
  `shared/src/reservation/reservation.schema.test.ts` (schema) → re-target onto
  `update_transport`; add the preserve-invariant regression test.

### F08 — Map-side transit endpoint editor — `FORK_ONLY`

- **Fork commits:** `4bc62ec5` (edit transit map endpoints), `6fbc3d52` (client flow),
  `2d734584` (gate on `reservation_edit`; guard blank coords), `48356079` (lock rendering).
- **Fork behavior:** drag/edit a stored transit route's endpoints directly on the map; the
  editor's save goes through `updateTransitRouteEndpoints`, which applies the **F07 PRESERVE
  policy** (pins move; provider itinerary/geometry stays untouched; no provider search).
- **Affected:** `client/src/components/Planner/TransitRouteEndpointEditor.tsx`,
  `TransitJourneyModal.tsx` (fork blob `d1a82100…`), map rendering, reservation store.
- **v4.0 evidence:** no equivalent editor at `v4.0.0`. `TransitJourneyModal.tsx` at `v4.0.0`
  (blob `37cda894…`) has no endpoint-edit surface (1 endpoint mention vs fork's 22).
- **Current upstream:** same — `TransitJourneyModal.tsx` blob `37cda894…` at `upstream/main`
  (identical to v4.0.0); no editor.
- **Mobile outcome:** desktop + mobile — `TransitJourneyModal` is opened from the desktop
  sidebar *and* the mobile sidebar portal (`onOpenTransit`), so the editor must work on both.
- **Migration action:** port UI/domain onto 4.0 map/planner; backend via upstream `update_transport`
  (or the F07 characterization path), keeping the PRESERVE policy: the editor never recomputes
  geometry/legs and never triggers a provider search.
- **Tests:** fork `TransitRouteEndpointEditor.test.tsx` (map-only warning, invalid coords,
  unchanged-value block, cancel-without-save, zero-coord guard, i18n) is characterization.

### F09 — Reservation `url` over MCP — `UPSTREAMED_CURRENT`

- **Fork commit:** `e9a1f3e0` (add `url` param to create/update reservation tools).
- **Fork behavior:** persist/resurface reservation `url` through MCP create/update.
- **Affected:** `server/src/mcp/tools/reservations.ts`, `server/src/services/reservationService.ts`.
- **v4.0 evidence:** no `url` in reservation MCP at `v4.0.0`.
- **Current upstream:** `f1bbd94f` implements `url` (and `reservation_end_time`) via
  `reservationUrlSchema` in `server/src/nest/reservations/reservations.mcp.ts`
  (blob `9671187c…` at `upstream/main`).
- **Mobile outcome:** backend/API only (client already reads `url` generically).
- **Migration action:** adopt `f1bbd94f`; canonical property is `url` (never a separate `link`).
- **Tests:** upstream reservations MCP tests cover `url`; characterize fork's `url` behavior.

### F10/F11 — Existing Cost → reservation linking + safe unlink — `FORK_ONLY`

- **Fork commits:** `92aee6e1` (budget reservation link service), `287975b6` (MCP
  `link_budget_item_to_reservation`), `b3b68d0a` (scope enforcement), `f8d6f8f7` (unlink null
  scopes), `41159e73` (docs), `ae1758ac` (members/payers preserved on unlink), `13fbe370`
  (dbMock stubs).
- **Fork behavior:** link an existing Cost to an existing reservation without recreating the
  expense; unlink removes only the relationship and preserves payers/members/splits.
- **Affected:** `server/src/services/budgetService.ts`, `server/src/mcp/tools/budget.ts`
  (`link_budget_item_to_reservation`), `budget-reservation-linking.test.ts`.
- **v4.0 evidence:** `link_budget_item_to_reservation` **absent** at `v4.0.0` and `upstream/main`.
  (Upstream has `linkBudgetItemToReservation` internally on create; no standalone link tool.)
- **Current upstream:** absent — `git grep link_budget_item_to_reservation upstream/main -- server`
  = 0 hits. Internal `linkBudgetItemToReservation` present only as a private helper in
  `upstream/main:server/src/nest/budget/budget.service.ts` and used from
  `server/src/nest/reservations/reservations.mcp.ts` (blob `9671187c…`).
- **Mobile outcome:** backend/API + Budget-tab surface (desktop + mobile read the link state).
- **Migration action:** implement atop 4.0 Costs/Reservations services (spec §7.1 invariants).
- **Tests:** fork `budget-reservation-linking.test.ts` is characterization; invariants per spec §7.1.

### F12 — POI marker reposition — `FORK_ONLY`

- **Fork commits:** `ae7649bd` (reposition saved place markers), `019cdf55` (harden rollback),
  `63936e2e` (preserve mobile inspector while saving), `5d3385bc` (reconcile map types — adds
  `repositionPlaceId`/`canRepositionPlaces` to `MapViewGL` Props and `canReposition`/
  `isRepositioning`/`onStartReposition`/`onCancelReposition` to `PlaceInspectorProps`; removes
  fork-specific reposition tests), `75edfe25` (restore reposition with the map renderers'
  draggable-marker + clustering-exclusion paths and FE-COMP-MAPVIEW-021/022/023 +
  FE-COMP-MAPVIEWGL-015 tests).
- **Fork behavior:** enter reposition mode, move a saved place marker, save/cancel with rollback.
  The reposition marker is pulled out of the marker cluster and made draggable with a
  suppressed click after drag-end (MapView Leaflet `MemoMarker` drag handlers; MapViewGL
  `createMarkerElement` `repositioning` flag + `draggable` marker + `dragstart`/`dragend`).
- **Affected:** `client/src/components/Map/MapView.tsx`, `MapViewGL.tsx`, `MapView.types.ts`,
  `Planner/PlaceInspector.tsx`, `pages/tripPlanner/useTripPlanner.ts`, `useRouteCalculation.ts`.
- **v4.0 evidence:** only a trace of "reposition" in `useRouteCalculation.ts`; no reposition UI.
- **Current upstream:** only `MapViewGL.tsx` + `useRouteCalculation.ts` traces; no feature.
  Exact: `upstream/main:client/src/components/Map/MapViewGL.tsx` (blob `f82c0335…`) — the
  "reposition" hits are a marker-reposition helper (`reposition`/`repositionPins`, lines 312–355
  and 483–484), **not** a place-reposition mode; `upstream/main:client/src/hooks/useRouteCalculation.ts`
  (blob `702beaf2…`) has no reposition UI. Fork reposition files
  (`client/src/components/Map/MapView.types.ts` reposition mode) absent upstream.
- **Mobile outcome:** desktop + mobile — `63936e2e` preserved the mobile inspector during save,
  so the feature must keep working on the mobile map.
- **Migration action:** port to Leaflet/GL/map state (spec §7.2).
- **Tests:** characterize fork reposition tests; port to 4.0 renderer test harness.

### F13 — Track-aware route bypass + movement totals — `FORK_ONLY`

- **Fork commits (movement core):** `c4823a57` (share track geometry stats), `4dcfb114`
  (persist transit leg distances), `c8fcddb0` (movement contribution core), `8583f85b`
  (calculate daily totals), `41c6f7e6` (total row), `830e907d` (show totals), `4c15457a`
  (validate metrics), `ab1e913d` (expose totals).
- **Fork commits (track routing):** `5783fee7` (ordered day movement plan), `99a160e0`
  (movement connectors through OSRM), `920259e2`/`7c80902f`/`9be50eed` (route around imported
  track), `1a0567f2`/`be0282b6` (show track movement in day routes), `d96e0407` … `b409eb87`.
- **Fork behavior:** avoid double-drawing a normal route over imported track; aggregate
  walking/driving/track/transit-leg distance+duration into daily movement totals.
- **Affected:** `client/src/utils/movementStats.ts`, `getTrackMovement` helpers, planner day
  routes, `DayMovementTotalRow.tsx`, `movementStats.test.ts`.
- **v4.0 evidence:** `movementStats.ts` / `getTrackMovement` / `trackMovement` **absent** at
  `v4.0.0` and `upstream/main`.
- **Current upstream:** absent — `git cat-file -e upstream/main:client/src/utils/movementStats.ts`
  fails (no such blob) and `upstream/main:client/src/components/Planner/DayMovementTotalRow.tsx`
  also absent; `git grep -c 'getTrackMovement|trackMovement' upstream/main -- client` = 0 hits.
- **Mobile outcome:** desktop + mobile — the totals row renders in `DayPlanSidebar`, which is
  used in the mobile sidebar portal too.
- **Migration action:** port minimum pure/domain layer + UI onto 4.0 routing (spec §7.4).
- **Tests:** fork `movementStats.test.ts`, `dayMovementPlan.test.ts` are characterization.

### F14 — Transit-distance → movement — `FORK_ONLY`

- **Fork commit:** `4dcfb114` (persist transit leg distances).
- **Fork behavior:** store transit leg distance to feed movement totals.
- **v4.0 evidence:** 4.0 carries transit leg data in its own model — consume it rather than
  duplicate storage. Upstream `server/src/nest/transit/transit.service.ts` (blob `beff0957…`,
  unchanged between v4.0.0 and upstream/main) emits `leg.distance` (rounded int) and
  `leg.duration`; schema in `transit-itinerary.helpers.ts` (`distance: z.number().nonnegative().nullable()`).
- **Current upstream:** same file (blob `beff0957…`); test `transit.service.test.ts:154`
  asserts `it.legs[0].distance === 251`.
- **Mobile outcome:** backend/API only (data consumed by F13 movement totals; no standalone UI).
- **Migration action:** consume upstream transit leg data.
- **Tests:** upstream `transit.service.test.ts` proves distance is present; F13's
  `movementStats.test.ts` consumes it.

### F15 — Timeline planner — `FORK_ONLY`

- **Fork commits (duration/timing):** `9b9848fc` (planner duration/time contracts),
  `ef81e543` (derive end times from duration), `7fba69b5` (edit recommended visit duration),
  `dae87974` (translated duration copy).
- **Fork commits (draggable timeline):** `180ec7f8`, `31db17b3`, `531dad84`, `977ea654`,
  `887f32c5`, `0f66fec4`, `5002a07f`, `4525bf64`, `7c770682`, `033698e9`, `d4a6293f`.
- **Fork commits (context + duration MCP):** `74883124`, `03da534b` (`apply_recommended_durations`),
  `99101ba2`, `1f9f2b9e`, `96ad435f`, `8792672b`, `e60869d9` … merge `eb560f92`.
- **Fork commits (mobile timeline):** `68050306`, `47f11491`, `90a97198`, `73431394`, `88b79cee`,
  `20f79108` … merge `814ed86a`.
- **Fork behavior:** desktop draggable day timeline (`DayTimelinePlanner.tsx`,
  `TimelineRouteToolbar.tsx`, `dayTimelineModel.ts`), editable visit duration, MCP tool to apply
  model-recommended durations, and mobile timeline exposure.
- **Affected:** `client/src/components/Planner/DayTimelinePlanner.tsx`, `TimelineRouteToolbar.tsx`,
  `dayTimelineModel.ts`, `PlacesSidebarRow.tsx`, `server/src/mcp/tools/places.ts`
  (`apply_recommended_durations`, `update_place` `duration_minutes`), `placeService.ts`.
- **v4.0 evidence:** `duration_minutes` data model IS upstream (`v4.0.0:server/src/nest/places/places.mcp.ts`,
  `db/schema.ts`, `db/migrations.ts`). `apply_recommended_durations` and
  `DayTimelinePlanner`/`TimelineRouteToolbar`/`dayTimelineModel` are **absent** at `v4.0.0`.
  Mobile timeline `MobileMapTimeline.tsx` exists at `v3.4.1` already (upstream), so mobile timeline
  is not fork-only; the fork's desktop draggable timeline is.
- **Current upstream:** `DayTimelinePlanner`/`apply_recommended_durations` absent —
  `git cat-file -e upstream/main:client/src/components/Planner/DayTimelinePlanner.tsx` fails and
  `git grep -c apply_recommended_durations upstream/main -- server` = 0 hits. Upstream mobile
  has `upstream/main:client/src/mobile/screens/trip/plan/MPlanTimeline.tsx` (blob `e513cf90…`),
  `upstream/main:client/src/mobile/screens/trip/plan/useMPlanDragReorder.ts` (blob `604088c4…`,
  long-press drag reorder #1997), and `planTimelineModel.ts`.
- **Mobile outcome:** desktop draggable timeline = **desktop** (`DayTimelinePlanner` is desktop);
  **mobile** is served by upstream `MPlanTimeline` (already supports drag reorder). The fork's
  `68050306` mobile-sidebar "timeline" entry overlaps upstream's mobile timeline — do not rebuild it.
- **Migration action:** reimplement desktop draggable timeline + `apply_recommended_durations`
  against 4.0 planner; consume upstream `duration_minutes` rather than re-adding it.
- **Tests:** fork `DayTimelinePlanner.test.tsx` characterization for desktop; upstream
  `MPlanTimeline`/`useMPlanDragReorder` tests for mobile.

### F16 — Dynamic `plugin:<id>:read/write` OAuth scopes — `OBSOLETE`

- **Fork commits:** `3752d481` (reconcile plugin scope grammar, session lifecycle, safe
  registration), `97ee89a5` (shared), `2dad7fe9`/`ea08df9b` (OAuth broker hardening).
- **Fork behavior:** dynamic per-plugin OAuth scopes `plugin:<id>:read` / `plugin:<id>:write`
  (`server/src/services/oauthResources.ts`, `PLUGIN_SCOPE_RE = /^plugin:([a-z][a-z0-9-]{2,39}):(read|write)$/`),
  validated in `server/tests/unit/mcp/scopes.test.ts` (SCOP-PLUGIN-*).
- **Affected:** `server/src/services/oauthResources.ts`, `oauthService.ts`, `mcp/scopes.ts`,
  client `oauthScopes.ts` / `ScopeGroupPicker`.
- **v4.0 evidence:** no `plugins:use` and no dynamic plugin scopes at `v4.0.0`.
- **Current upstream:** `092223c2` adds the coarse `plugins:use` scope
  (`server/src/mcp/scopes.ts:55`, `OPT_IN_ONLY_SCOPES = ['plugins:use']`). Dynamic per-plugin
  scopes are superseded.
- **Mobile outcome:** backend/API only (OAuth consent/scope model; client `ScopeGroupPicker` is a
  settings surface on both desktop and mobile if a compat layer is added).
- **Recommendation:** prefer `plugins:use` + admin MCP-tool grants; add an isolated `COMPAT_ONLY`
  mapping layer only if a deployed client genuinely holds legacy `plugin:<id>:*` scopes (with
  tests + documented removal path, spec §8.1).
- **Migration action:** `OBSOLETE`; do not port the dynamic scope grammar as primary architecture.

### F17 — Fork plugin OAuth/runtime stack (resource proxy) — `OBSOLETE`

- **Fork commits:** `112f656a` (add OAuth plugin resource proxy), `ea08df9b` (harden OAuth
  broker, gate MCP plugin-resource listing, SDK parity).
- **Fork behavior (inbound resource proxy, F17):** a plugin route may declare
  `oauthScope?: 'read' | 'write'` in its manifest (plugin-sdk `index.ts:345`); the fork's
  `plugins-proxy.controller.ts` (blob `54333953…`) then accepts a `trekoa_` OAuth bearer
  token on that route, validates `getUserByAccessToken(oauthRaw)` with
  `info.audience === pluginResourceUri(pluginId)` (`server/src/services/oauthResources.ts`),
  and gates read/write via `isPluginScopeAllowed(info.scopes, pluginId, route.oauthScope)`
  (read satisfied by `plugin:<id>:read` *or* `write`; write only by `write`). Non-OAuth
  requests fall back to the JWT session path. The dynamic `plugin:<id>:read|write` scope
  grammar and resource URI are defined in `oauthResources.ts`.
- **Affected:** `server/src/nest/plugins/plugins-proxy.controller.ts`, `plugin-oauth.service.ts`,
  `server/src/services/oauthResources.ts`, plugin-sdk/supervisor route schema, client
  `oauthScopes.ts` / `ScopeGroupPicker` / `OAuthAuthorizePage`.
- **v4.0 evidence:** `v4.0.0:server/src/nest/plugins/plugins-proxy.controller.ts` (blob
  `f75ae8cf…`) authenticates authenticated routes **only** via JWT session
  (`extractToken` + `verifyJwtAndLoadUser`); there is **no** `trekoa_` bearer path, **no**
  `oauthScope` route declaration, and **no** `isPluginScopeAllowed`/`pluginResourceUri`
  gating. `oauthResources.ts` is absent (0 files in `server/src/services/` at v4.0.0).
- **Current upstream:** identical — `plugins-proxy.controller.ts` blob `f75ae8cf…` at
  `upstream/main` (same as v4.0.0); upstream's plugin OAuth is **outbound only**
  (`server/src/nest/plugins/oauth/plugin-oauth.service.ts`, blob `c1e658ba…`, identical at
  v4.0.0/upstream-main — host-brokered plugin-as-OAuth-client with PKCE+state; no inbound
  resource tokens). The 4.0 client model runs plugin apps in a sandboxed iframe on the
  plugin's own origin, so a plugin app talks to its own origin, not TREK's
  `/api/plugins/:id/*`.
- **Classification: `OBSOLETE`.** The inbound `trekoa_` resource-proxy token auth + dynamic
  per-plugin scope gating is a bridge-era mechanism superseded by (1) the 4.0 sandboxed-iframe
  model, (2) the already-upstream JWT-session plugin proxy, and (3) the coarse `plugins:use`
  scope + admin MCP-tool grants (F16, `092223c2`).
- **Compatibility requirement:** none by default. `trekoa_` tokens have no upstream
  equivalent. The only scenario that would force a compat layer is a deployed external client
  that (a) holds fork-issued `plugin:<id>:read/write` OAuth scopes **and** (b) calls
  `/api/plugins/:id/*` with a `trekoa_` token. That population is exactly the F16
  `COMPAT_ONLY` gate; if triggered, the compat layer must map onto the same JWT/`plugins:use`
  gates — never resurrect a parallel token type. Recorded, not deferred.
- **Tests:** fork `plugins-proxy.test.ts` OAuth-scoped proxy auth cases (valid token, audience
  check, scope gating, write-read fallthrough) characterize the mechanism. On 4.0 they
  re-target as **security regression**: the 4.0 proxy MUST reject a `trekoa_` bearer with 401
  (no broker exists to validate it) and a JWT from an unprivileged user with 401/403. The
  fork's redirect-safety (`toRelativeLocation`) and header-allowlist tests are already
  upstream (`f75ae8cf…` carries the same SAFE_* logic).
- **Mobile outcome:** backend/API only (plugin runtime/grants); any client surface follows the
  OAuth consent flow on both desktop and mobile.
- **Migration action:** do not port the inbound resource-proxy token auth; accept upstream's
  JWT-session proxy. Task 03 validates OAuth/MCP compatibility, including the F16 compat gate.

### F18 — `oauth_tokens.user_password_version` migration — `OBSOLETE`

- **Fork commits:** `112f656a` (added), `8bc507ef` (idempotent), `4d2654b4` (re-added after sync).
- **Fork behavior:** last migration slot (index 175 → schema **176**) adds
  `oauth_tokens.user_password_version` and backfills it from `users.password_version`. Binds OAuth
  tokens to password-change invalidation.
- **Affected:** `server/src/db/migrations.ts` (fork schema version = **176**).
- **v4.0 evidence:** `v4.0.0:server/src/db/migrations.ts` (blob `bc77e730…`) has **no**
  `user_password_version` migration; upstream owns its own 176–198 sequence (schema **198**,
  **not** 195 — corrected from the original draft). Upstream 3.4 = schema **175**
  (`v3.4.1:server/src/db/migrations.ts`, blob `bdf76d0b…`).
- **Current upstream:** same — `upstream/main:server/src/db/migrations.ts` (blob `f6519964…`)
  has no `user_password_version` (git grep = 0); schema **200**. 4.0 auth/revocation
  architecture (token revocation on password change via the Nest auth module) may make the
  column obsolete — leave to Task 02 bridge, not a ported feature.
- **Mobile outcome:** backend/API only (auth/token model).
- **Recommendation:** `OBSOLETE` for the column. DB compatibility is a Task 02 bridge concern
  (see `migration-verification.md`), not a ported feature. Do NOT recreate the column as a new
  migration appended after the upstream sequence (upstream 4.0 schema is **198**; upstream/main
  is **200** — spec §5.3's "post-195" refers to the old plan's wrong count and must be read as
  "post-198"; the corrected wording is: never add a column upstream never defined).
- **Migration action:** **schema-176 compatibility bridge (Task 02)** — detect the legacy fork
  signature, translate migration state, then run upstream 176–198.

### F19 — reservation endpoints / day positions / needs_review base model — `UPSTREAMED_V4`

- **Fork:** inherits pre-3.4.1 reservation/endpoint/day-position model.
- **v4.0 evidence:** upstream reservation/endpoint model present at `v4.0.0`
  (`server/src/nest/reservations/reservations.mcp.ts`, blob `dacfc790…` at v4.0.0;
  blob `9671187c…` at upstream/main). Model covers `endpoints[]`, per-day positions
  (`reservation_day_positions` table; `day_plan_position` column, `migrations.ts:527`), and
  `needs_review` (`reservations.mcp.ts:680`).
- **Current upstream:** same, blob `9671187c…` (last touched by `4f98c5ea…`).
- **Mobile outcome:** backend/API only (model drives both desktop and mobile reservation UI).
- **Migration action:** use upstream model; do not fork schema.
- **Tests:** upstream `reservations.controller.test.ts`, reservations MCP tests.

### F20/F21/F22 — Old bridge architectures — `OBSOLETE`

- **Evidence:** fork has `server/src/services/` (79 files), `server/src/mcp/` (26 files),
  old WebSocket bridge. `v4.0.0` has `server/src/services/` = **0**, `server/src/mcp/` = **7**,
  `server/src/nest/` = **519** (fork: 215). 4.0 completed the NestJS migration.
- **Migration action:** do not restore deleted services/MCP-bootstrap/session-manager/WS bridge.

### F23 — Static-token deprecation-warning patch — `OBSOLETE`

- **Fork commit:** `380b890c` (remove static-token deprecation notice).
- **Fork behavior:** removed deprecation notices attached to static MCP tokens (server
  `index.ts`/`sessionManager.ts`/`tools.ts`/`prompts.ts`/`trips.ts`) and the client
  `IntegrationsTab.tsx` "Deprecated" badge + `apiTokensDeprecated` callout.
- **v4.0 evidence:** `v4.0.0:server/src/mcp/sessionManager.ts` (blob `f71b15f3…`) still
  references deprecation. `v4.0.0:client/src/components/Settings/IntegrationsTab.tsx` (blob
  `b0aaaac3…`) still shows the "Deprecated" badge and the `apiTokensDeprecated` callout.
- **Current upstream (re-verified at `33a33e7b`):** the static-token deprecation is present on
  **four** surfaces — `upstream/main:server/src/mcp/sessionManager.ts` (blob `a0e260d8…`, line
  12 `triggers deprecation prompt`); `upstream/main:server/src/nest/mcp-transport/mcp-transport.constants.ts:76–79`
  (`STATIC_TOKEN_DEPRECATION_NOTICE` = "deprecated and will stop working in a future version");
  `upstream/main:server/src/nest/auth/auth.mcp.ts:26` (`token_auth_notice` prompt, gated on
  `ctx.isStaticToken`); `upstream/main:client/src/components/Settings/IntegrationsTab.tsx`
  (blob `28ef1e62…`, lines 351/481 "Deprecated" badge + callout).
- **Definitive decision (re-review finding F23):** **accept upstream — do not re-apply
  `380b890c`.** The deprecation notice is a deliberate upstream UX product decision; it is
  text-only, does not alter any MCP tool result, and therefore breaks no agent/tool contract —
  there is no compatibility requirement to remove it. The fork's removal is a fork-only
  divergence with no surviving rationale on 4.0. Classification `OBSOLETE` (the removal patch
  is superseded / not needed; do not port).
- **Mobile outcome:** backend/API only (token auth wording); the client badge/callout renders
  on the desktop + mobile settings surface, both of which keep upstream's wording.
- **Migration action:** keep upstream's static-token deprecation as-is; Task 03 may validate the
  wording in-place but the decision (no removal) is final and is not a Task 03 deferral.

### F24 — Upstream 3.4.x sync cluster — not fork behavior — `UPSTREAMED_V4`

- **Commits:** `5e1e3f0d` (merge integration/upstream-3.4.0), `aa364b3f` (synchronize 3.4.1),
  `68fe32c7` (frozen 3.4), `3ce600da` (integrate 3.4.1), plus Task 2–13 sync fixes
  (ntfy isolation `151d5934`, Synology TLS `e519a3f9`/`8e9ab641`, Kosovo atlas `45f02b12`,
  AirTrail hook order `e95b9897`, arrive-by `482bc3b5`, hotel morning-leg `315e6cb5`).
- **Determination:** these bring the fork base up to 3.4.1 parity. The same concepts (Synology,
  ntfy, Kosovo, airtrail, arrive-by) are all present at `v4.0.0` and `upstream/main` — they are
  upstream content, not fork deltas. Classified `UPSTREAMED_V4` (v4.0.0 already implements them).
  Note: `151d5934` here is **ntfy topic isolation** (per-user topic, upstream now has
  `resolveNtfyUrl` semantics); the fork's **admin-credential isolation** is a separate,
  fork-only behavior tracked as F28 (commits `c8950368`/`f2482d31`).
- **Mobile outcome:** n/a (upstream content, not fork UI).
- **Migration action:** none.

### F25 — Deployment env-var normalization — `UPSTREAMED_V4`

- **Commits:** `f935b1dd`, `6ecbc093`, `44bce05b`, `3bce7b5f`, `4a8a54ce`, `b7cc41e6`, etc.
- **Determination:** Task 12 deployment-doc/env normalization for 3.4.1. Verified at `v4.0.0`:
  `DEMO_MODE`, `BACKUP_UPLOAD_LIMIT_MB`, `OVERPASS_URL`, `OVERPASS_TIMEOUT_MS` are already
  declared in `charts/trek/templates/configmap.yaml`, `charts/trek/values.yaml`,
  `server/.env.example`, and `server/src/app-config/` (`env.schema.ts`, `derive.ts`). No fork
  deploy delta survives.
- **Current upstream:** same deploy surfaces present — `upstream/main:charts/trek/templates/configmap.yaml`
  (blob `d6d6e8c8…`), `charts/trek/values.yaml` (blob `4af6bd9b…`), `server/.env.example`
  (blob `ef5d3d65…`), `server/src/app-config/env.schema.ts` (blob `f2d61adb…`),
  `server/src/app-config/derive.ts` (blob `0f017f26…`). All four env vars (`DEMO_MODE`,
  `BACKUP_UPLOAD_LIMIT_MB`, `OVERPASS_URL`, `OVERPASS_TIMEOUT_MS`) verified present in all five.
- **Mobile outcome:** n/a (deployment config).
- **Recommendation:** re-verify the full 4.0 env inventory during deploy work; do not port.
- **Migration action:** none (already upstreamed).

### F26 — Live `reservation:positions` client handler + stale-visibility cleanup — `FORK_ONLY`

- **Fork commits:** `01b83434` ("Task 10: movement stats/reconciliation, live reservation events,
  trip store updates"), `ef79ae11` ("fix Task 10 reviewer findings — … day_positions preservation,
  Dexie persistence, visibility sync").
- **Fork behavior:** the client store actively applies the `reservation:positions` wire event:
  `remoteEventHandler.ts` has a `case 'reservation:positions'` (state applier, updates
  `day_plan_position` / per-day `day_positions` without erasing metadata/endpoints) and a Dexie
  writer; on `reservation:deleted` it removes the deleted id from the `trek:visible-connections:<tripId>`
  localStorage entry and dispatches `visibility:stale-connection` so the map never references a
  stale id.
- **Affected:** `client/src/store/slices/remoteEventHandler.ts` (fork blob `d8d9344e…`),
  `client/src/utils/connectionsVisibility.ts`, tests
  `client/tests/unit/remoteEventHandler/reservations.test.ts` (FE-WSEVT-RESERV-006/007/008).
- **v4.0 evidence:** `v4.0.0:client/src/store/slices/remoteEventHandler.ts` (blob `d7877ee6…`)
  has **no** `reservation:positions` case and no stale-visibility cleanup. The event name is listed
  in `v4.0.0:client/src/api/wsEventPolicy.ts:95` **inside `IGNORED_WS_EVENTS`** — the upstream
  client deliberately does not act on it (it relies on the optimistic `updatePositions` call +
  full `reservation:updated` objects).
- **Current upstream:** identical — `remoteEventHandler.ts` blob `d7877ee6…` (same as v4.0.0),
  `reservation:positions` still in `IGNORED_WS_EVENTS`, no stale-visibility cleanup.
- **Server side:** the event is upstream — `reservations.controller.ts:93` and
  `reservations.mcp.ts:547` broadcast `reservation:positions`; `reservation_day_positions` /
  `day_plan_position` model is upstream. Only the **client reducer** + stale cleanup is fork-only.
- **Mobile outcome:** desktop + mobile — this is a store-level handler shared by the desktop
  planner and the mobile shell; no per-renderer work.
- **Recommendation (definitive Task 00 decision — RETAIN/PORT):** classify `FORK_ONLY`; the
  fork's live reducer + stale-visibility cleanup **is retained and ported**. Rationale:
  (1) the server already broadcasts `reservation:positions` upstream, so acting on it is
  purely additive on the client and requires no protocol change; (2) the fork carries a
  complete characterization suite (FE-WSEVT-RESERV-006/006b/006c/007/008/010) proving the
  day_positions merge + stale-cleanup semantics, which upstream's `IGNORED_WS_EVENTS`
  behavior does not cover; (3) it removes a real failure mode — after a collaborator reorders
  a reservation, another open client holding the old id in `visible-connections` would keep
  rendering a deleted reservation until the next full `reservation:updated`/page load. The
  upstream optimistic-only path is a latency trade, not a correctness guarantee, and the fork
  treats the missing id as the bug. Task 08 validation (runtime latency/UX check of the
  ported reducer against the 4.0 store) is recorded separately in §8 and is **not** a
  classification deferral.
- **Migration action:** port the reducer case + stale-visibility cleanup onto the 4.0 store
  (`remoteEventHandler.ts` + `connectionsVisibility.ts`), and move `reservation:positions` out of
  `IGNORED_WS_EVENTS`, keeping the fork's characterization tests.
- **Tests:** fork FE-WSEVT-RESERV-006/006b/006c/007/008/010 are the retention suite.

### F27 — Plugin registry screenshot fallback — `FORK_ONLY`

- **Fork commit:** `7975d992` ("fix(plugins): prefer resolved registry screenshot over legacy guess").
- **Fork behavior:** in the registry browse and detail projections, an empty/whitespace
  `screenshotUrl` is treated as absent and falls through to the legacy `docs/screenshot.png`
  guess — `p.screenshotUrl?.trim() || rawFileUrl(...)` instead of propagating the empty value.
- **Affected:** `server/src/nest/plugins/registry/registry.service.ts` (fork blob `26042bba…`,
  lines 218–219 and 294–295), test `server/tests/integration/plugins/registry.test.ts`
  ("browse treats empty screenshotUrl as absent").
- **v4.0 evidence:** `v4.0.0:server/src/nest/plugins/registry/registry.service.ts`
  (blob `c56935ca…`) uses `p.screenshotUrl ?? ...` — an empty string stays empty (blank card).
- **Current upstream:** blob `6ca36032…` at `upstream/main` — same `??` semantics, no fallback.
- **Mobile outcome:** backend/API only (registry browse/detail JSON drives the plugin store UI on
  desktop and mobile alike).
- **Migration action:** port the `?.trim() ||` fallback to 4.0 `registry.service.ts` (both
  browse and detail) with the fork's registry test adapted.
- **Tests:** fork `registry.test.ts` "empty screenshotUrl" case is characterization.

### F28 — ntfy admin-token credential isolation — `FORK_ONLY` (security)

- **Fork commits:** `c8950368` (remove admin-token fallback from per-user ntfy sends; add
  NTFY-SVCB-005b), `f2482d31` (remove admin-token fallback from `test-ntfy` controller
  endpoint; add NTFY-CTRL-001/002/003). Both in `v3.4.1..fork-pre-4.0-2026-08-29` and not
  ancestors of `v4.0.0`/`upstream/main`.
- **Fork behavior:** a per-user ntfy send uses `userCfg?.token ?? null` — the admin token is
  **never** attached to a user-scoped destination. The `/api/notifications/test-ntfy`
  endpoint resolves `token && token !== MASKED ? token : (userCfg?.token ?? null)` — the
  masked placeholder / omitted token resolves to the user's own token or `null`, never the
  admin's. This prevents the admin ntfy credential from being sent to a server/topic chosen
  by a normal user.
- **Affected:** `server/src/services/notifications/builtins.ts` (fork blob `d30d14e7…` line
  98), `server/src/nest/notifications/notifications.controller.ts` (fork blob `23fb4c91…`
  line 97), tests `server/tests/unit/services/notificationService.test.ts`
  (NTFY-SVCB-005b, line 732) and `server/tests/unit/nest/notifications.controller.test.ts`
  (NTFY-CTRL-001/002/003).
- **v4.0 evidence:** `v4.0.0:server/src/nest/notifications/channels/builtins.ts` (blob
  `d55e13d9…`) line 95: `ntfy.sendNtfy(url, userCfg?.token ?? adminCfg.token, …)` —
  fallback **present**. `v4.0.0:server/src/nest/notifications/notifications.controller.ts`
  (blob `29c4d4a8…`) lines 105–107: `userCfg?.token ?? adminCfg.token ?? null` — fallback
  **present**.
- **Current upstream:** identical — `upstream/main` `channels/builtins.ts` (blob
  `d55e13d9…`, same as v4.0.0) line 95 still uses `userCfg?.token ?? adminCfg.token`;
  `notifications.controller.ts` (blob `29c4d4a8…`) lines 105–107 still use
  `userCfg?.token ?? adminCfg.token ?? null`. The upstream test
  `server/tests/unit/nest/notifications.controller.test.ts` only covers the saved-token
  reuse path (adminCfg with `token: null`), never the no-user-token case; upstream
  `notification-transports.test.ts` covers `resolveNtfyUrl` topic isolation (#1608) but not
  token fallback. No upstream test asserts the admin fallback.
- **Security treatment:** this is the fork's only *credential-exfiltration* hardening in the
  notification family — the admin ntfy token belongs to the admin's server and must never be
  forwarded to a per-user topic/server. Port **both** removals: `sendToUser` (keep admin
  token only in `sendGlobal`, where the destination is the admin's own topic/server) and the
  `test-ntfy` resolution. Admin-global send (`sendGlobal`) still uses `adminCfg.token` —
  unchanged.
- **API treatment:** `/api/notifications/test-ntfy` semantics change vs upstream: a user with
  no personal token and no explicit body token now gets `token: null` (no `Authorization`
  header), instead of the admin token. 400-error bodies and the MASKED placeholder behavior
  are unchanged.
- **Test treatment:** port NTFY-SVCB-005b ("no Authorization header when user has no token")
  and NTFY-CTRL-001/002/003 as security regression tests against the 4.0
  `channels/builtins.ts` + `notifications.controller.ts` (nest) surfaces.
- **Mobile outcome:** backend/API only — the settings UI (desktop + mobile) writes the same
  `ntfy_token` config; the isolation is purely in server-side send/test resolution.
- **Migration action:** `FORK_ONLY`; port the two one-line removals onto 4.0
  `channels/builtins.ts:95` and `notifications.controller.ts:105–107`, with the fork's tests
  adapted to the Nest channel registry shape.

### F29 — Client settings normalization — `FORK_ONLY`

- **Fork commits:** `b8700146` (add `normalizeSettings`), `f1b09e5b` (preserve
  `'auto'`/`'system'` dark_mode strings). Both fork-only.
- **Fork behavior:** `normalizeSettings(raw)` in `client/src/store/settingsStore.ts`
  (fork blob `282c23f7…`) coerces legacy string `dark_mode` (`'light'`/`'dark'`/`'true'`) to
  boolean while preserving `'auto'`/`'system'`; null/undefined `dark_mode` falls back to
  `DEFAULT_SETTINGS.dark_mode`; validates `temperature_unit`/`distance_unit`/`time_format`
  against whitelists; forces `blur_booking_codes` to `false` when missing. `loadSettings`
  routes incoming settings through it (SETTINGS-MIGRATE-001..008).
- **Affected:** `client/src/store/settingsStore.ts` (fork blob `282c23f7…`),
  `client/src/store/settingsStore.test.ts`.
- **v4.0 evidence:** `v4.0.0:client/src/store/settingsStore.ts` (blob `e559816b…`) has **no**
  `normalizeSettings` — `loadSettings` merges raw `data.settings` (only `withNormalizedTileUrl`
  tile-URL normalization is applied). `dark_mode` is typed `boolean | string` at v4.0.0
  (`client/src/types.ts:111`) and the server accepts `[true, false, 'light', 'dark', 'auto']`
  (`v4.0.0:server/src/nest/settings/settings.service.ts:57`).
- **Current upstream:** identical — `upstream/main:client/src/store/settingsStore.ts` blob
  `e559816b…` (same as v4.0.0), no `normalizeSettings`; `upstream/main` server
  `settings.mcp.ts:54` / `settings.service.ts:62` still accept the string dark_mode values.
  Upstream relies on the server already sending valid values; it does not defensively
  normalize a legacy/malformed row.
- **Mobile outcome:** desktop + mobile — this is store-level normalization consumed by the
  settings UI on both shells.
- **Migration action:** port `normalizeSettings` onto the 4.0 `settingsStore`, *coexisting*
  with upstream's `withNormalizedTileUrl` (tile-URL cleanup) rather than replacing it; keep
  the whitelist coercion and the `blur_booking_codes` security default.
- **Tests:** fork SETTINGS-MIGRATE-001..008 are characterization; re-target against 4.0
  `Settings` type (which already has `distance_unit?: DistanceUnit`, `blur_booking_codes?`).

### F30 — Client focus restoration + a11y utilities — `FORK_ONLY`

- **Fork commits:** `b8700146` (add `client/src/utils/accessibility.ts` with
  `respectReducedMotion`), `f1b09e5b` (add `saveFocusForRestore`/`restoreFocus`), wire into
  `client/src/components/shared/Modal.tsx` (fork blob `42d5482b…`). Also `b8700146` updated
  the OAuth scope display tests and `geo:read` i18n strings (scope-label parity with the
  fork's server scope model).
- **Fork behavior:** `Modal` saves the focused element on open and restores it (rAF) on
  close; `respectReducedMotion` reads `prefers-reduced-motion`. Tests FE-A11Y-001..010 cover
  RTL detection (via upstream `isRtlLanguage`), reduced-motion, Escape/Enter keyboard, and
  defensive transit-metadata handling.
- **Affected:** `client/src/utils/accessibility.ts` (fork blob `b4b525ab…`),
  `client/src/components/shared/Modal.tsx` (fork blob `42d5482b…`),
  `client/src/__tests__/accessibility.test.tsx`, `client/src/components/Planner/transitDisplay.test.tsx`.
- **v4.0 evidence:** `client/src/utils/accessibility.ts` **absent** at `v4.0.0`;
  `v4.0.0:client/src/components/shared/Modal.tsx` (blob `9a26a19c…`) has **no** focus
  save/restore. `isRtlLanguage` IS upstream (`v4.0.0:shared/src/i18n/languages.ts`).
- **Current upstream:** same — `upstream/main` has no `client/src/utils/accessibility.ts`;
  `upstream/main:client/src/components/shared/Modal.tsx` blob `9a26a19c…` (identical to
  v4.0.0) — no focus restore; `isRtlLanguage` present in `shared/src/i18n/languages.ts`.
- **Mobile outcome:** desktop + mobile — `Modal` is the shared dialog used by both the
  desktop planner and the mobile shell.
- **Migration action:** port `accessibility.ts` + the `Modal` focus save/restore onto 4.0.
  Do **not** port `isRtlLanguage` (already upstream). Scope-label i18n parity is part of F16
  (plugin scopes) and needs no separate migration beyond the `plugins:use` wording.
- **Tests:** fork FE-A11Y-001..010 are characterization (RTL/reduced-motion/keyboard/modal
  focus); re-target against 4.0 `Modal`.

### F31 — safeParseMetadata defensive parsing — `FORK_ONLY`

- **Fork commits:** `f1b09e5b` (add `client/src/utils/safeParseMetadata.ts` with
  `safeParseMetadata` + `safeTransitMeta`; convert `DayPlanSidebar`, `TransportModal`,
  `TransitJourneyModal`, `ReservationsPanel`, `PlaceInspector`, `ReservationModal`,
  `DayPlanSidebarTransportDetailModal`, `Modal`), `a30a6a17` (replace the remaining raw
  `JSON.parse` sites in `TripPDF.tsx`, `ReservationsPanel.tsx`, `SharedTripPage.tsx`; add
  regression tests). Both fork-only.
- **Fork behavior:** reservation/transit `metadata` (which may be a JSON *string*) is parsed
  only via `safeParseMetadata` — malformed/null/array/empty metadata returns `{}` instead of
  throwing a render-crash. `safeTransitMeta` is the canonical `meta.transit` guard (requires
  a valid `legs` array). This eliminates a whole class of render-crash vectors in public
  (unauthenticated) shared-trip views and the PDF exporter.
- **Affected:** `client/src/utils/safeParseMetadata.ts` (fork blob `1fa476b4…`),
  `client/src/components/PDF/TripPDF.tsx`, `client/src/pages/SharedTripPage.tsx`,
  `client/src/components/Planner/ReservationsPanel.tsx`, `DayPlanSidebar.tsx`,
  `DayPlanSidebarTransportDetailModal.tsx`, `PlaceInspector.tsx`, `TransitJourneyModal.tsx`,
  `TransportModal.tsx`, `ReservationModal.tsx`; tests `TripPDF.test.ts`,
  `ReservationsPanel.test.tsx`, `SharedTripPage.test.tsx`.
- **v4.0 evidence:** `client/src/utils/safeParseMetadata.ts` **absent** at `v4.0.0`;
  `v4.0.0:client/src/pages/SharedTripPage.tsx` still calls raw `JSON.parse`
  (`typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {}`,
  lines 670 and 885); `v4.0.0:client/src/components/PDF/TripPDF.tsx` uses raw `JSON.parse`
  at its reservation branch.
- **Current upstream:** same — `upstream/main` has no `safeParseMetadata.ts`; raw
  `JSON.parse` still at `upstream/main:client/src/pages/SharedTripPage.tsx:670,885` and in
  `TripPDF.tsx`/`ReservationsPanel.tsx`.
- **Mobile outcome:** desktop + mobile — these components render in the shared planner and
  the mobile shell; the shared-trip view is a public page on both.
- **Migration action:** port `safeParseMetadata`/`safeTransitMeta` and replace the raw
  `JSON.parse` sites in the 4.0 equivalents of the listed components (public shared-trip,
  PDF, reservations panel, day-plan sidebar).
- **Tests:** fork `TripPDF.test.ts`, `ReservationsPanel.test.tsx`, `SharedTripPage.test.tsx`
  (malformed string, null, array, valid metadata) are characterization; re-target onto 4.0
  component tests.

### F32 — Editable transit `status` + `confirmation_number` in `TransitJourneyModal` — `FORK_ONLY`

- **Fork commit:** `f1b09e5b` ("generic transit fields" — the same commit that introduced
  F29/F30/F31; this UI delta was missing from the earlier inventory).
- **Fork behavior:** `TransitJourneyModal` (fork blob `d1a82100…`) renders a "Generic fields:
  status + confirmation number — editable regardless of route" section when `canEdit`: a
  pending/confirmed `select` bound to `res.status` and a text input bound to
  `res.confirmation_number`. `onSave` gains `status?: string; confirmation_number?: string |
  null` and the save payload routes through `tripActions.updateReservation` →
  `reservationsApi.update` (the generic REST reservation update), not a transit-specific path.
- **Affected:** `client/src/components/Planner/TransitJourneyModal.tsx` (lines ~94–95, 171–182,
  759–805), `client/src/pages/TripPlannerPage.tsx:1830–1843` (onSave wiring), test
  `TransitJourneyModal.test.tsx` FE-PLANNER-TRANSITJOURNEY-006.
- **v4.0 evidence:** `v4.0.0:client/src/components/Planner/TransitJourneyModal.tsx` (blob
  `37cda894…`) has **no** status/confirmation_number editing surface (grep for
  `confirmation_number|confirmationNumber|status` = 0 hits beyond the base). The backend
  already supports both fields: `shared/src/reservation/reservation.schema.ts` carries
  `status`/`confirmation_number` on the reservation model and the update body
  (`reservationUpdateRequestSchema` is open), and `reservations.service.ts` persists both.
- **Current upstream:** identical — `TransitJourneyModal.tsx` blob `37cda894…` at
  `upstream/main` (same as v4.0.0); no editing surface for these generic fields on a transit
  journey.
- **Mobile outcome:** desktop + mobile — `TransitJourneyModal` is opened from the desktop
  sidebar and the mobile sidebar portal, so the two fields must render/editable on both.
- **Migration action:** port the two generic editable fields onto the 4.0 `TransitJourneyModal`,
  wiring `onSave` through 4.0 `updateReservation` (fields already accepted by the open update
  schema). No server change.
- **Tests:** fork FE-PLANNER-TRANSITJOURNEY-006 ("status and confirmation fields are
  editable") is characterization; re-target onto the 4.0 modal test.

### F33 — Cross-day end-date display in `DayPlanSidebarTransportDetailModal` — `FORK_ONLY`

- **Fork commit:** `f1b09e5b` (same commit; also missing from the earlier inventory).
- **Fork behavior:** `DayPlanSidebarTransportDetailModal` (fork blob `7ed90c36…`) extracts
  the **end date** from `reservation_end_time` (`const { date: endDate, time: endTime } =
  splitReservationDateTime(...)`) and, when it differs from the start date, appends a
  `→ <end date>, <end time>` segment to the header line — so an overnight / multi-day
  journey shows its real end date instead of a single start date with an ambiguous end time.
- **Affected:** `client/src/components/Planner/DayPlanSidebarTransportDetailModal.tsx`
  (header date/time block), opened from `DayPlanSidebar.tsx:3951`.
- **v4.0 evidence:** `v4.0.0:client/src/components/Planner/DayPlanSidebarTransportDetailModal.tsx`
  (blob `231e1e1a…`) extracts only the end **time** (`const { time: endTime } =
  splitReservationDateTime(res.reservation_end_time)`); a cross-day journey renders as one
  start date plus an end time, which can read as earlier than the start (ambiguous/wrong).
- **Current upstream:** identical — blob `231e1e1a…` at `upstream/main` (same as v4.0.0);
  upstream's `DayPlanSidebarTransportDetailModal.test.tsx` has **no** cross-day/end-date
  case.
- **Mobile outcome:** desktop + mobile — the modal is opened from `DayPlanSidebar`, which
  renders in both the desktop sidebar and the mobile sidebar portal.
- **Migration action:** port the end-date extraction and the conditional `→ end date, end time`
  line onto the 4.0 modal; keep the same-day formatting unchanged (start date, time – end time).
- **Tests:** no fork test exists for this modal; add a characterization test
  (end-date shown when `end_day_id`/`reservation_end_time` crosses midnight) re-targeted onto
  the 4.0 `DayPlanSidebarTransportDetailModal.test.tsx`.

### F34 — Outbound plugin-OAuth broker nonce + provider-config fingerprint binding — `FORK_ONLY` (security)

- **Fork commit:** `ea08df9b` (harden OAuth broker — also touches F17's gating; this broker
  hardening is split out as its own behavior).
- **Fork behavior:** `plugin-oauth.service.ts` (fork blob `a624edbc…`) mints the authorize
  `state` as `nonce(16) || configFingerprint(16) || stateRand(24)` (base64url), where
  `configFingerprint = sha256(authorizeUrl|tokenUrl|clientId)[:16]`; `completeCallback`
  validates the baked fingerprint against the **current** provider config with
  `crypto.timingSafeEqual` and fails the flow ("OAuth provider configuration changed — please
  restart the connection flow") if the admin changed the client credentials/endpoints while
  the flow was in flight — preventing a token exchange succeeding under one config and being
  stored under another. Nonce defends against state replay.
- **Affected:** `server/src/nest/plugins/plugin-oauth.service.ts` (`startConnect`,
  `completeCallback`, `validateProviderBinding`).
- **v4.0 evidence:** `v4.0.0:server/src/nest/plugins/oauth/plugin-oauth.service.ts` (blob
  `c1e658ba…`) binds state only to `plugin_id` + `user_id` (PKCE + single-use + TTL); no
  nonce and no config-fingerprint binding.
- **Current upstream:** identical — blob `c1e658ba…` at `upstream/main` (same as v4.0.0).
- **Security treatment:** this is the fork's plugin-OAuth broker hardening (admin credential
  swap mid-flow). Port it: it strengthens 4.0's existing broker without changing the public
  API surface (the `state` value is opaque to the provider and plugin).
- **Mobile outcome:** backend/API only (outbound broker; client sees only the standard OAuth
  consent flow).
- **Migration action:** port the nonce + config-fingerprint state construction and the
  callback-time fingerprint validation onto 4.0 `plugins/oauth/plugin-oauth.service.ts`,
  keeping upstream's PKCE/state/TTL and SSRF fast-fail (`assertSafeHttps`).
- **Tests:** fork plugin-oauth tests (state format, config-fingerprint mismatch rejects the
  callback) are characterization; re-target onto the 4.0 broker test.

### F35 — Route-toggle semantics (routeShown/distance-unit no-OSRM-refetch) — `FORK_ONLY`

- **Fork commits:** `9c11cfa6` (exclude distance-unit and booking-route visibility from
  route-calculation deps), `c4f834f9` (gate route return on enabled, fix DistanceUnit test
  value, add routeShown toggle tests). Linear chain, both in `v3.4.1..fork`, neither an
  ancestor of `v4.0.0`/`upstream/main`.
- **Fork behavior:** `useRouteCalculation` treats `routeShown` and `distance_unit` as
  *visibility/format-only* inputs — toggling them must not re-fetch OSRM:
  - `distanceUnit` was removed from the store subscription and from the `useCallback`/`useEffect`
    dependency arrays (`9c11cfa6`), so flipping km↔mi no longer calls `recalculateRouteWithLegs`;
  - `enabled` (the `routeShown` prop) is likewise excluded from the dep arrays, and a live
    `enabledRef` is used inside `updateRouteForDay` to avoid a stale closure (`9c11cfa6`);
  - the returned `route`/`routeSegments` are **gated on `enabled`**: `route: enabled ? route :
    null` and `routeSegments: enabled ? routeSegments : []` (`c4f834f9`) — `routeShown=false`
    hides the rendered route instantly and `routeShown=true` restores it from cached state,
    both **without** re-fetching OSRM.
- **Affected:** `client/src/hooks/useRouteCalculation.ts` (fork blob `a6677776…`; `enabledRef`
  at lines 77–78, `!enabledRef.current` guard at 117, return gating at 200–201), integration
  test `client/tests/integration/hooks/useRouteCalculation.test.ts` (FE-HOOK-ROUTE-022/023/024).
- **v4.0 evidence:** `v4.0.0:client/src/hooks/useRouteCalculation.ts` (blob `f66df234…`) keeps
  `enabled` AND `distanceUnit` in BOTH the `useCallback` deps and the effect deps (lines 274
  and 298), subscribes `distanceUnit` at line 39, and returns `route`/`routeSegments` ungated
  (line 264). Toggling `enabled` re-runs the effect → re-fetches OSRM; changing km↔mi re-runs
  the effect → re-fetches OSRM.
- **Current upstream:** same — `upstream/main:client/src/hooks/useRouteCalculation.ts` (blob
  `702beaf2…`) subscribes `distanceUnit` (line 39) and keeps `enabled`+`distanceUnit` in the
  deps (lines 274/298) with `if (!dayId || !enabled)` early-return (line 44); route returned
  ungated. No `enabledRef`, no return gating.
- **Mobile outcome:** desktop + mobile — `useRouteCalculation` is consumed by `useTripPlanner`
  (called with `routeShown` as the `enabled` arg at `client/src/pages/tripPlanner/useTripPlanner.ts:477`),
  which feeds both the desktop planner and the mobile sidebar portal; no per-renderer work.
- **Migration action:** port the `enabledRef` + return-gating (`enabled ? route : null`) onto
  4.0 `useRouteCalculation`, keeping the deps-exclusion for `enabled`/`distanceUnit` so
  visibility/format toggles never trigger an OSRM refetch. This is a client-only delta.
- **Tests:** fork FE-HOOK-ROUTE-022 (distance_unit change → no `recalculateRouteWithLegs`),
  FE-HOOK-ROUTE-023 (enabled off → route hidden, no OSRM), FE-HOOK-ROUTE-024 (enabled on →
  route restored, no OSRM) are characterization; re-target onto the 4.0 hook test.

### F36 — Booking-route endpoint visibility/bounds — `FORK_ONLY`

- **Fork commits:** `75edfe25` (include booking route endpoints in bounds; deduplicate IDs also
  here — split to F37), `5d3385bc` (reconcile booking-route visibility, map types, sidebar mock;
  type/test reconciliation only). Both fork-only.
- **Fork behavior:** the map's fit/bounds must include the endpoints of *visible* booking routes
  (the from/to stops of reservations currently shown by the route-visibility toggle), so a
  toggled-on booking route is never half-cropped off-screen:
  - `visibleReservationEndpointPoints()` added to `reservationRoutes.ts` — collects finite
    `{lat,lng}` pairs from every endpoint of reservations passing `visibleRouteReservations`
    (i.e. honoring `visibleConnectionIds` + `showTransitRoutes`);
  - `MapView` (`BoundsController`) now accepts `reservationEndpointCoords` and includes them in
    BOTH the initial fit (`fitTo([...placeCoords, ...reservationEndpointCoords])`) and the
    route-arrival re-fit;
  - `MapViewGL` includes `reservationEndpointCoords` in its initial `computeMapViewport` framing
    and in the GL `fitBounds` points;
  - `useTripPlanner` adds a `visibleConnectionsRef` effect that bumps `fitKey` whenever the
    resolved visible-connection id set changes — so toggling a booking route on/off re-fits the
    map to that route's endpoints.
- **Affected:** `client/src/utils/reservationRoutes.ts` (fork blob `29690724…`),
  `client/src/components/Map/MapView.tsx` (fork blob `b56327de…`, `BoundsController`),
  `client/src/components/Map/MapViewGL.tsx` (fork blob `10ce7fe3…`),
  `client/src/pages/tripPlanner/useTripPlanner.ts` (fork blob `cb3998cb…`, lines 366–373),
  tests `reservationRoutes.test.ts` (`visibleReservationEndpointPoints` describe block) and
  MapView/MapViewGL test files.
- **v4.0 evidence:** `v4.0.0:client/src/utils/reservationRoutes.ts` (blob `3f5cc5f2…`) has **no**
  `visibleReservationEndpointPoints` (only `visibleRouteReservations`); `v4.0.0` `MapView.tsx`
  `BoundsController` (lines 280–334) fits `places`+`routeCoords` only; `v4.0.0` `MapViewGL.tsx`
  (lines 1345–1346) fits `routeCoords`+`markerPoints` only; `v4.0.0` `useTripPlanner.ts` has no
  `visibleConnectionsRef`/fitKey-on-visibleConnections effect (only fitKey on trip/day select).
- **Current upstream:** identical — `upstream/main` `MapView.tsx` (blob `c119af4a…`),
  `MapViewGL.tsx` (blob `f82c0335…`), `useTripPlanner.ts` (blob `a7f1aa39…`); no
  `visibleReservationEndpointPoints` anywhere in upstream (`git grep` = 0 hits).
- **Mobile outcome:** desktop + mobile — both map renderers (Leaflet + GL) render in the desktop
  planner and the mobile sidebar portal; the endpoint-bounds helper is shared.
- **Migration action:** port `visibleReservationEndpointPoints` and the two fit integrations
  (initial viewport framing + bounds fitting) onto 4.0 `MapView`/`MapViewGL`, plus the
  `visibleConnections`→`fitKey` effect in 4.0 `useTripPlanner`. Client-only.
- **Tests:** fork `reservationRoutes.test.ts` `visibleReservationEndpointPoints` suite
  (returns coords for visible reservations, excludes hidden, includes transit when
  showTransitRoutes, filters non-finite coords, preserves zero coords) is characterization;
  re-target onto the 4.0 utility test.

### F37 — Persisted connection-ID deduplication — `FORK_ONLY`

- **Fork commit:** `75edfe25` (deduplicate IDs — same commit as F36; split into its own row
  because the behavior is a distinct, independently-testable invariant).
- **Fork behavior:** `parseStoredConnections` and `toggleConnectionId` in `connectionsVisibility.ts`
  dedupe the persisted id list with `[...new Set(...)]`, so the `trek:visible-connections:<tripId>`
  localStorage value never accumulates duplicate reservation ids (from legacy bare-array storage,
  from a malformed tagged object, or from toggle-race double-adds). The invariant: `ids` is always
  a unique array after any parse/toggle.
- **Affected:** `client/src/utils/connectionsVisibility.ts` (fork blob `67982a3b…`, dedupe at
  lines 37/48 in `parseStoredConnections` and lines 76–77 in `toggleConnectionId`), test
  `client/src/utils/connectionsVisibility.test.ts` ("deduplication" describe block, 4 tests).
- **v4.0 evidence:** `v4.0.0:client/src/utils/connectionsVisibility.ts` (blob `edacd326…`) has
  **no** dedup — `parseStoredConnections` returns `ids: parsed` / `ids: obj.ids` verbatim and
  `toggleConnectionId` filters/adds without a `Set`. Blob identical to v3.4.1 base.
- **Current upstream:** identical — `upstream/main:client/src/utils/connectionsVisibility.ts`
  blob `edacd326…` (same as v3.4.1/v4.0.0), no dedup.
- **Mobile outcome:** desktop + mobile — store/util-level helper shared by the planner and the
  mobile shell; no per-renderer work.
- **Migration action:** port the `new Set` deduplication into 4.0
  `parseStoredConnections`/`toggleConnectionId` with the fork's dedup tests. Client-only.
- **Tests:** fork `connectionsVisibility.test.ts` dedup block (legacy-array dedup, tagged-object
  dedup, toggle-preserves-uniqueness on add/remove, unique-add when stored already duplicate) is
  characterization; re-target onto the 4.0 utility test.

---

## 6. MCP tool/resource/scope diff (summary)

| MCP surface | fork | v4.0.0 | upstream/main |
| --- | --- | --- | --- |
| `search_transit_stops` / `search_transit_routes` / `create_transit_journey` | yes | yes | yes |
| `update_transit_journey` | yes | no | no (generic `update_transport`) |
| `update_transit_route_endpoints` | yes | no | no |
| `link_budget_item_to_reservation` | yes | no | no |
| `link_hotel_accommodation` | yes | yes | yes |
| `update_transport` / `create_transport` | yes | yes | yes |
| reservation `url` param | yes | no | yes (`f1bbd94f`) |
| `apply_recommended_durations` (places) | yes | no | no |
| `link_trip_file` | no | no | yes (upstream-only) |
| `plugins:use` scope | no | no | yes (`092223c2`) |
| `plugin:<id>:read/write` scopes | yes | no | no |
| WS `reservation:positions` (server broadcast) | yes | yes | yes |
| WS `reservation:positions` (client reducer) | yes | no (ignored) | no (ignored) |

---

## 7. Verification record

- Common ancestor confirmed: `git merge-base fork-pre-4.0-2026-08-29 v3.4.1` → `a0994658` == `v3.4.1`.
- Fork-only commits: `git rev-list --count v3.4.1..fork-pre-4.0-2026-08-29` → 213.
- `upstream` fetched with `--tags --prune`; `upstream/main` = `33a33e7b` (v4.1.1) refreshed 2026-08-29.
- v4.0.0 = `a00b84b2` (annotated tag `daad48d9`); confirmed the 4.0 baseline is the NestJS+React19
  architecture (squash `77dddd5e` "v4.0.0 (#1719)", 3357 files, `server/src/services` → 0).
- **Migration array lengths (corrected):** v3.4.1 = **175** migrations; fork = **176**
  (`user_password_version` at index 175); v4.0.0 = **198**; upstream/main = **200**.
  (Original draft's "195" for v4.0.0 was wrong — corrected to 198.)
- **Upstream migration-176 signature (spec §5.2):** v4.0.0 migration array index 175 (schema
  175→176) is "Half vacation days (#552)" → `ALTER TABLE vacay_entries ADD COLUMN fraction REAL NOT
  NULL DEFAULT 1` (guarded). Index 176 (schema 176→177) creates the `vacay_shares` table.
  The fork's index 175 is `oauth_tokens.user_password_version`. The **distinguishing signature**:
  a legacy fork-176 DB has `oauth_tokens.user_password_version` present and **no**
  `vacay_entries.fraction` column (upstream migration 176 never ran) — see `migration-verification.md`.
  Verified `vacay_shares` absent at v3.4.1/fork, present at v4.0.0/upstream-main
  (`git grep vacay_shares`); `user_password_version` absent at v4.0.0/upstream-main.
- **F26 evidence:** `git show 01b83434` / `git show ef79ae11` (both in `v3.4.1..fork`,
  absent from `v4.0.0` and `upstream/main`); `v4.0.0`/`upstream/main`
  `remoteEventHandler.ts` blob `d7877ee6…` has no `reservation:positions` case; the event name is
  in `IGNORED_WS_EVENTS` (`wsEventPolicy.ts:95`) at both.
- **F27 evidence:** `git show 7975d992` (in `v3.4.1..fork`, absent upstream); fork registry blob
  `26042bba…` uses `?.trim() ||`; v4.0.0 blob `c56935ca…` and upstream/main blob `6ca36032…` use `??`.
- **F28 evidence (re-review):** `git show c8950368` / `git show f2482d31` (in `v3.4.1..fork`,
  absent from `v4.0.0`/`upstream/main`); fork `services/notifications/builtins.ts` blob
  `d30d14e7…` line 98 `userCfg?.token ?? null`; fork controller blob `23fb4c91…` line 97
  `userCfg?.token ?? null`; v4.0.0 AND upstream-main `nest/notifications/channels/builtins.ts`
  blob `d55e13d9…` line 95 `userCfg?.token ?? adminCfg.token`; controller blob `29c4d4a8…`
  lines 105–107 `userCfg?.token ?? adminCfg.token ?? null`. Fork tests: NTFY-SVCB-005b
  (services/notificationService.test.ts:732), NTFY-CTRL-001/002/003 (nest
  notifications.controller.test.ts, blob `320c901c…`).
- **F29–F31 evidence (re-review):** `git show b8700146` / `f1b09e5b` / `a30a6a17` (all in
  `v3.4.1..fork`, absent upstream). Fork `settingsStore.ts` blob `282c23f7…` vs
  upstream/v4.0.0 blob `e559816b…` (no `normalizeSettings`); fork `accessibility.ts` blob
  `b4b525ab…` and fork `Modal.tsx` blob `42d5482b…` vs upstream/v4.0.0 `Modal.tsx` blob
  `9a26a19c…` (no focus restore); fork `safeParseMetadata.ts` blob `1fa476b4…` vs absent
  upstream (`client/src/pages/SharedTripPage.tsx:670,885` still raw `JSON.parse`). `isRtlLanguage`
  confirmed upstream (`shared/src/i18n/languages.ts`) — not fork-only.
- **F02 redaction evidence (re-review, definitive DROP):** `git show e982e35b` /
  `git show efc35a90` (both in `v3.4.1..fork`). `git show 68fe32c7^1:server/src/mcp/tools/transit.ts
  | grep -c EXPECTED_TRANSIT` → 4; `git show 68fe32c7^2:.../transit.ts | grep -c EXPECTED_TRANSIT`
  → 0; the upstream-3.4 sync merge `68fe32c7` (2026-07-20) reverted the redaction. Frozen fork
  `fork-pre-4.0:server/src/mcp/tools/transit.ts` blob `61be7217…` (45–49) uses upstream-shaped
  `errorResult` (`err instanceof Error ? err.message : fallback`); fork `tools-transit.test.ts`
  has 0 redaction assertions. Upstream `transit.mcp.ts:34–38` blob `3517b1c2…` identical at
  v4.0.0 and upstream/main.
- **F32/F33 evidence (re-review, f1b09e5b client deltas):** fork `TransitJourneyModal.tsx` blob
  `d1a82100…` (status + confirmation_number editable, lines 94–95/171–182/759–805) vs
  upstream/v4.0.0 blob `37cda894…` (no such fields; grep `confirmation_number|confirmationNumber|status`
  = 0 hits in the component); fork `DayPlanSidebarTransportDetailModal.tsx` blob `7ed90c36…`
  (end-date extraction + `→ end date, end time`) vs upstream/v4.0.0 blob `231e1e1a…` (only
  `const { time: endTime }`; no end-date display; upstream modal test has no cross-day case).
  Backend support confirmed upstream: `shared/src/reservation/reservation.schema.ts`
  `status`/`confirmation_number` + open `reservationUpdateRequestSchema` (upstream/main and
  v4.0.0), `reservations.service.ts` persists both, `PUT :id` (`reservations.controller.ts:99–112`).
  Fork test: FE-PLANNER-TRANSITJOURNEY-006.
- **F07/F08 stale-geometry evidence (re-review, PRESERVE policy):** fork
  `services/transitRouteEndpointService.ts` `updateTransitRouteEndpoints` updates only
  `reservation_endpoints` from/to rows; tool description in `mcp/tools/transit.ts:283–287`
  "preserves the saved provider itinerary, legs, timing, geometry, statistics, metadata,
  status, title, notes, and day-plan position"; upstream `update_transport`
  (`reservations.mcp.ts:773–796`, blob `9671187c…`) replaces stops via `endpoints[]` and only
  replaces `metadata` when explicitly passed ("Sending legs[] without metadata keeps the
  stored metadata (departure_airport, airtrail_ids, transit)"). `route_geometry` on places is
  upstream (v4.0.0 + upstream/main `migrations.ts:693`, `places.service.ts`,
  `journey-domain.service.ts:815–831`).
- **F17/F34 evidence (re-review):** fork `plugins-proxy.controller.ts` blob `54333953…` (lines
  115–126 `route.auth` block: `trekoa_` bearer + `audience === pluginResourceUri` +
  `isPluginScopeAllowed`) vs upstream/v4.0.0 blob `f75ae8cf…` (JWT-session only; no `trekoa_`,
  no `oauthScope`); fork
  `services/oauthResources.ts` blob `bd7a1b3e…` (dynamic `plugin:<id>:read|write` grammar) absent
  upstream; upstream `plugins/oauth/plugin-oauth.service.ts` blob `c1e658ba…` (outbound broker,
  PKCE+state, identical v4.0.0/upstream-main) vs fork `plugin-oauth.service.ts` blob `a624edbc…`
  (nonce(16)||configFingerprint(16)||stateRand(24) state + `validateProviderBinding` timing-safe
  fingerprint check).
- **F23 static-token evidence (re-review, accept upstream):** `git show 380b890c` (removal) is
  fork-only; re-verified at `upstream/main` 33a33e7b: `mcp-transport.constants.ts:76–79`
  `STATIC_TOKEN_DEPRECATION_NOTICE`, `auth.mcp.ts:26` `token_auth_notice`, `sessionManager.ts:12`,
  `IntegrationsTab.tsx:351,481`. None of these alter MCP tool results, so no agent/tool contract
  break; decision is to keep upstream's notice (no re-apply of `380b890c`).
- **F35/F36/F37 evidence (re-review 3, map/route-visibility family `9c11cfa6`→`c4f834f9`→
  `5d3385bc`→`75edfe25`):** all four are in `v3.4.1..fork` and NOT ancestors of `v4.0.0`/
  `upstream/main` (`git merge-base --is-ancestor <c> v4.0.0` and `<c> upstream/main` both NO for
  all four). 
  - F35: fork `useRouteCalculation.ts` blob `a6677776…` (`enabledRef` lines 77–78, `!enabledRef.current`
    guard line 117, return gating `route: enabled ? route : null` / `routeSegments: enabled ?
    routeSegments : []` lines 200–201, no `distanceUnit` subscription) vs v4.0.0 blob `f66df234…`
    and upstream/main blob `702beaf2…` (both keep `distanceUnit` at line 39 and `enabled`+`distanceUnit`
    in the deps at lines 274/298, return ungated at v4.0.0:264). Fork tests FE-HOOK-ROUTE-022
    (line 907), -023 (935), -024 (959) in `tests/integration/hooks/useRouteCalculation.test.ts`
    (fork blob `dc4b7788…`); upstream test has only the pre-existing FE-HOOK-ROUTE-022/023/024
    set with different meanings (single-multi-waypoint, #1597 check-in, layover) — no no-OSRM-
    refetch-on-toggle coverage.
  - F36: fork `reservationRoutes.ts` blob `29690724…` adds `visibleReservationEndpointPoints`
    (lines 25–38) vs v4.0.0/upstream blob `3f5cc5f2…` (absent); fork `MapView.tsx` blob
    `b56327de…` `BoundsController` includes `reservationEndpointCoords` (lines 310/316/325) vs
    v4.0.0 blob `cbabfd6a…` (fits places+routeCoords only, lines 325/334); fork `MapViewGL.tsx`
    blob `10ce7fe3…` includes endpoint points in `computeMapViewport` (line 358) and GL
    `fitBounds` (lines 1078–1083) vs v4.0.0 blob `4b4cf624…` (line 1345–1346, routeCoords+
    markerPoints only) and upstream/main blob `f82c0335…` (same, `git grep visibleReservationEndpointPoints
    upstream/main` = 0 hits); fork `useTripPlanner.ts` blob `cb3998cb…` has the
    `visibleConnectionsRef`→`fitKey` effect (lines 366–373) vs v4.0.0 blob `93172a5a…`/upstream
    blob `a7f1aa39…` (absent).
  - F37: fork `connectionsVisibility.ts` blob `67982a3b…` (`new Set` dedup in `parseStoredConnections`
    at lines 37/48 and `toggleConnectionId` at lines 76–77) vs v4.0.0/upstream/v3.4.1 blob
    `edacd326…` (no dedup; `ids: parsed` / `ids: obj.ids` verbatim). Fork test
    `connectionsVisibility.test.ts` blob `9c86a3fe…` "deduplication" block (4 tests) vs v4.0.0
    blob `086e25b4…` (no dedup tests).
  - F12 completion: `5d3385bc` (MapViewGL Props + PlaceInspectorProps reposition fields) and
    `75edfe25` (draggable reposition restore + FE-COMP-MAPVIEW-021/022/023 /
    FE-COMP-MAPVIEWGL-015 tests) added to F12's commit list; upstream `MapViewGL.tsx` reposition
    hits remain the marker-`reposition`/`repositionPins` helper only (not a place-reposition mode).
- **Per-row current-upstream blobs (re-review):** PlacesSidebarHeader `a760588d…`; MapView
  `c119af4a…`/MapViewGL `f82c0335…`; TransitSearchPanel `e08f2534…`/connector `e61dbff9…`;
  `link_budget_item_to_reservation` grep=0; movementStats/DayMovementTotalRow absent
  (`git cat-file -e` fails); DayTimelinePlanner absent, MPlanTimeline `e513cf90…`/
  useMPlanDragReorder `604088c4…`; nest/plugins 77 files, `oauthResources.ts` absent;
  migrations.ts blob `f6519964…` (schema 200) and `bc77e730…` (v4.0.0, 198); sessionManager
  `a0e260d8…`/`f71b15f3…` + new Nest deprecation surfaces (`auth.mcp.ts:26`,
  `mcp-transport.constants.ts:76–79`, IntegrationsTab `28ef1e62…` lines 351/481); deploy surfaces
  `d6d6e8c8…`/`4af6bd9b…`/`ef5d3d65…`/`f2d61adb…`/`0f017f26…`.
- **Upstream-refresh evidence (re-review, spec §2 + plan "refresh upstream before each feature
  family"):** every per-family evidence line above was queried against `upstream/main` after an
  auditable `git fetch upstream --prune` executed **before each family batch** (F01–F05,
  F06–F09, F10–F12, F13–F15, F16–F18, F19–F25, F26–F31, F32–F33). All 8 fetches exited 0 and
  `upstream/main` remained **`33a33e7b1d113f0742ac609305cc549a4806d31b`** ("chore: bump version
  to 4.1.1") throughout (2026-08-29T17:53:05Z–17:53:09Z; full per-batch log:
  `/tmp/opencode/trek-4-upstream-fetch-log.txt`). No fabricated per-family fetches: the log is
  the real command output, and because upstream did not move during Task 00, one verified SHA
  covers every family. The base was **not** moved: `fork-pre-4.0-2026-08-29` still resolves to
  `814ed86a2f7172905cc837d6b6488ccd6285c1fe`.
- Three spec-named upstream SHAs verified in `upstream/main` and not in `v4.0.0` (§3).

No production behavior was changed by this task; the ledger is documentation only.

---

## 8. Open items for later tasks (non-blocking for Task 00 gate)

1. ~~F07/F08 stale-geometry policy~~ — **RESOLVED in Task 00: PRESERVE** (see F07). Task 04
   validates the ported behavior only, with the preserve-invariant test.
2. F26: **decision is made (RETAIN/PORT — see F26).** Remaining work is Task 08 *validation
   only*: run the ported reducer against the 4.0 store, confirm no regression on
   optimistic `updatePositions`, and accept the live-reorder latency. Not a classification
   deferral.
3. Determine whether any deployed client holds legacy `plugin:<id>:*` scopes (F16) and/or calls
   `/api/plugins/:id/*` with a fork-issued `trekoa_` token (F17) → decides the shared
   `COMPAT_ONLY` layer. Until that population is proven, both stay `OBSOLETE` (F16) / `OBSOLETE`
   (F17) with no port.
4. ~~F23 static-token wording~~ — **RESOLVED in Task 00: accept upstream, do not re-apply
   `380b890c`** (see F23). Task 03 may validate the wording in place but the no-removal decision
   is final.
5. ~~F02 error-redaction parity check~~ — **RESOLVED in Task 00: DROP** — the redaction was
   reverted by sync merge `68fe32c7` before the frozen fork; no delta exists (see F02).
6. F34 (plugin-OAuth broker nonce + config-fingerprint) is `FORK_ONLY` and is ported in Task 03
   (OAuth/MCP compatibility) with the mismatch regression test.
7. ~~F35/F36/F37 map/route-visibility family~~ — **RESOLVED in Task 00: all three RETAIN/PORT**
   (see F35/F36/F37). Route-toggle semantics, booking-route endpoint bounds, and connection-ID
   deduplication are each classified `FORK_ONLY` with a port decision and characterization
   tests. No deferral remains; Task 08/09 validates the ported behavior at runtime only.

---

## Appendix — Mobile outcome matrix (spec §4.4)

| Feature | Mobile outcome |
| --- | --- |
| F01 connector UI | desktop + mobile (upstream) |
| F02 Transitous MCP | backend/API only |
| F03 planned filter | desktop + mobile (upstream) |
| F04 selected-day geometry | desktop + mobile (upstream) |
| F05 connector prefill | desktop + mobile (upstream) |
| F06 stored-transit MCP | backend/API only |
| F07 endpoint backend | backend/API only |
| F08 endpoint editor | desktop + mobile (fork) |
| F09 reservation url | backend/API only |
| F10/F11 cost links | backend/API + Budget-tab surface (desktop + mobile) |
| F12 reposition | desktop + mobile (fork) |
| F13 movement totals | desktop + mobile (fork) |
| F14 transit-distance | backend/API only (data for F13) |
| F15 timeline planner | desktop: fork `DayTimelinePlanner`; mobile: upstream `MPlanTimeline` |
| F16 plugin scopes | backend/API only |
| F17 plugin resource proxy | backend/API only |
| F18 password_version | backend/API only |
| F19 reservation model | backend/API only |
| F23 static-token wording | backend/API only |
| F26 reservation:positions reducer | desktop + mobile (store-level) |
| F27 registry screenshot | backend/API only |
| F28 ntfy credential isolation | backend/API only |
| F29 settings normalization | desktop + mobile (store-level) |
| F30 focus/a11y utilities | desktop + mobile (shared Modal) |
| F31 safeParseMetadata | desktop + mobile (planner/PDF/shared-trip) |
| F32 transit status/confirmation edit | desktop + mobile (TransitJourneyModal via sidebar portal) |
| F33 cross-day end-date display | desktop + mobile (DayPlanSidebar modal via sidebar portal) |
| F34 plugin-OAuth broker hardening | backend/API only |
| F35 route-toggle semantics | desktop + mobile (hook shared by desktop + mobile sidebar portal) |
| F36 booking-route endpoint bounds | desktop + mobile (both map renderers) |
| F37 connection-ID dedup | desktop + mobile (store/util-level) |