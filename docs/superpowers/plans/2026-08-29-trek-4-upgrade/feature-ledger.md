# TREK 4.0 Fork Upgrade — Feature Ledger (Task 00)

**Author:** opencode (task 00 subagent)
**Date:** 2026-08-29
**Status:** Complete feature ledger with evidence (Task 00 gate)
**Revised:** 2026-08-29 (review-fix pass — single-class classifications, migration-176
signature, mobile outcomes, added F26/F27)

This ledger is the evidence-backed, one-by-one inventory of every behavior in the
`reyhard/TREK` fork that is not simply upstream `v3.4.1`. It is the mandatory
precondition for every implementation task (Tasks 01–09).

---

## 1. Frozen references and topology

| Item | Value |
| --- | --- |
| Fork | `reyhard/TREK` (origin remote) |
| Upstream | `mauriceboe/TREK` (upstream remote; GitHub rename target of `liketrek/TREK`) |
| Frozen fork tag | `fork-pre-4.0-2026-08-29` (lightweight, points at commit) |
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
| F02 | Transitous MCP search/create | 37310302 … 4b02c932 (~20) | `UPSTREAMED_V4` | Fork's usage-limiter hardening is duplicated by upstream `RateLimitService` (identical buckets 300/60, 15-min window, MCP + REST); verify nothing else is missing | Use Nest MCP transit; no hardening port expected |
| F03 | Planned-only POI filter | 45648ade, f38af78f, 455dc4f2, caea30bb, edb7464a | `UPSTREAMED_V4` | — | Drop fork implementation; retain characterization test |
| F04 | Selected-day transit geometry | 567e9c89, f667bb43, 6b58ffce, e7323cd7 | `UPSTREAMED_V4` | — | Drop fork `reservationRoutes` scoping |
| F05 | Transit connector prefill | a97e4552 | `UPSTREAMED_V4` | — | Convert to regression tests |
| F06 | Edit stored transit over MCP | 97ee89a5, 5a5ab75c, c4209c57 | `UPSTREAMED_CURRENT` | Keep dedicated tool as thin alias **only** if an agent depends on the tool name | Adopt `aa5002b2`; use generic `update_transport` |
| F07 | Transit endpoint backend replacement | 4ebbb819, 6bff6fb1, c138235b, 822ff9b4 (+UI/`e6309321`) | `UPSTREAMED_CURRENT` | Manual-geometry semantics (`route_geometry` on places) is the only candidate `PARTIAL` delta — characterize before porting | Use generic transport update path |
| F08 | Map-side transit endpoint editor | 4bc62ec5, 6fbc3d52, 2d734584, 48356079 | `FORK_ONLY` | Desktop + mobile (reachable from mobile sidebar portal) | Port UI/domain onto 4.0 map/planner |
| F09 | Reservation `url` over MCP | e9a1f3e0 | `UPSTREAMED_CURRENT` | — | Adopt `f1bbd94f`; never add separate `link` field |
| F10 | Existing Cost → reservation linking | 92aee6e1, 287975b6, b3b68d0a, f8d6f8f7, 41159e73, ae1758ac, 13fbe370 | `FORK_ONLY` | — | Implement atop 4.0 Costs/Reservations |
| F11 | Multiple cost links / safe unlink | (with F10; ae1758ac) | `FORK_ONLY` | — | Preserve relationship semantics |
| F12 | POI marker reposition | ae7649bd, 019cdf55, 63936e2e | `FORK_ONLY` | Desktop + mobile (mobile inspector preserved by 63936e2e) | Port to Leaflet/GL/map state |
| F13 | Track-aware route bypass + movement totals | c4823a57 … b409eb87 (~27, merge 4ce5c739) | `FORK_ONLY` | — | Port domain onto current routing pipeline |
| F14 | Transit-distance → movement | 4dcfb114 | `FORK_ONLY` | Consume upstream transit leg data (`leg.distance` in `transit.service.ts`), do not duplicate storage | Consume upstream transit leg data |
| F15 | Timeline planner (draggable + duration + context/duration MCP + mobile) | 203cdeae … 814ed86a (~42) | `FORK_ONLY` | `duration_minutes` model already upstream — consume it, never re-add; mobile served by upstream `MPlanTimeline` | Reimplement against 4.0 planner |
| F16 | Dynamic `plugin:<id>:read/write` scopes | 3752d481, 97ee89a5 (shared) | `OBSOLETE` | Add isolated `COMPAT_ONLY` layer only if a deployed client is proven to hold legacy scopes | Prefer `plugins:use` + admin MCP grants |
| F17 | Fork plugin OAuth/runtime stack (resource proxy) | 112f656a | `PARTIAL` | Delta audit only; never wholesale port the 3.4 bridge | Delta audit only |
| F18 | `oauth_tokens.user_password_version` | 112f656a, 8bc507ef, 4d2654b4 | `OBSOLETE` | DB compatibility is a Task 02 bridge concern, not a ported feature; do not recreate the column | Schema-176 compatibility bridge (Task 02) |
| F19 | reservation endpoints/day positions/needs_review model | (pre-3.4.1 base) | `UPSTREAMED_V4` | — | Use upstream model |
| F20 | Old MCP bootstrap/session bridge | 112f656a (touched `bootstrap.ts`/`sessionManager.ts`) | `OBSOLETE` | — | Do not port |
| F21 | Old `server/src/services/*` | (79 files present at fork) | `OBSOLETE` | — | Translate only still-required behavior to Nest |
| F22 | Old WebSocket bridge | (in services) | `OBSOLETE` | — | Use current event/broadcast path |
| F23 | Static-token deprecation-warning patch | 380b890c | `PARTIAL` | Inspect upstream wording in Task 03; patch only if still wrong | Inspect upstream wording first |
| F24 | Upstream 3.4.x sync cluster | 5e1e3f0d, aa364b3f, 3ce600da, 68fe32c7 (+ Task 2–13 fixes) | `UPSTREAMED_V4` | — | Already in v3.4.1/v4.0.0; no migration action |
| F25 | Deployment env-var normalization (Task 12) | f935b1dd, 6ecbc093, 44bce05b, 3bce7b5f … | `UPSTREAMED_V4` | Env vars (`DEMO_MODE`, `BACKUP_UPLOAD_LIMIT_MB`, `OVERPASS_URL`, `OVERPASS_TIMEOUT_MS`) already declared at `v4.0.0` in charts/`.env.example`/app-config | Re-check 4.0 env inventory rather than porting |
| F26 | Live `reservation:positions` client handler + stale-visibility cleanup | 01b83434, ef79ae11 | `FORK_ONLY` | Server event is upstream (REST + MCP broadcast); only the client **reducer** is fork-only — upstream client deliberately ignores the event (`IGNORED_WS_EVENTS`); desktop + mobile (store-level) | Port the reducer case + stale cleanup onto 4.0 store |
| F27 | Plugin registry screenshot fallback | 7975d992 | `FORK_ONLY` | Backend/API only (registry browse/detail projection) | Port `?.trim() ||` fallback to 4.0 `registry.service.ts` |

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
- **Current upstream:** same files present at `upstream/main` (33a33e7b).
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
  `create_transit_journey` plus provider usage limiting and error redaction.
- **Affected:** `server/src/mcp/tools/transit.ts`, `server/src/services/transit*`, shared usage limiter.
- **v4.0 evidence:** `server/src/nest/transit/transit.mcp.ts` registers
  `search_transit_stops`, `search_transit_routes`, `create_transit_journey` (NestJS). Present at `v4.0.0`.
- **Current upstream:** same three tools at `upstream/main`. Rate limiting is upstream:
  `server/src/nest/transit/transit.mcp.ts:41` `rateLimit()` over `RateLimitService` with
  identical buckets (`mcp_transit_geocode` 300, `mcp_transit_plan` 60) and a 15-minute
  window; REST is limited via `transit.controller.ts:23`. The fork's `transitRateLimit.ts`
  hardening is functionally superseded.
- **Recommendation:** the "hardening → PARTIAL" hedge in the original draft was withdrawn:
  upstream implements the same usage limiting. Verify nothing else (e.g. error-redaction
  wording) differs before closing F02.
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
- **Current upstream:** present at `upstream/main`.
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
- **Current upstream:** present.
- **Mobile outcome:** desktop + mobile (selected-day transit visibility drives both map renderers
  and the mobile map).
- **Migration action:** drop fork `reservationRoutes` scoping.

### F05 — Transit connector prefill — `UPSTREAMED_V4`

- **Fork commit:** `a97e4552` (restore transit connector prefill).
- **Fork behavior:** prefill transit search when launched from a connector.
- **Affected:** `client/src/pages/TripPlannerPage.tsx`.
- **v4.0 evidence:** `TransitSearchPanel.tsx` + `DayPlanSidebarRouteConnector.tsx` present at `v4.0.0`.
- **Current upstream:** present.
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
  `route_geometry` persisted on places.
- **Affected:** `server/src/mcp/tools/transit.ts` (`update_transit_route_endpoints`),
  reservation service, `places` `route_geometry` column.
- **v4.0 evidence:** `update_transit_route_endpoints` absent at `v4.0.0`; `route_geometry`
  present in 4.0 model (`v4.0.0:server/src/nest/journey/journey-domain.service.ts`, `db/schema.ts`).
- **Current upstream:** `update_transit_route_endpoints` absent; generic `update_transport` covers
  stored-transit endpoint replacement (`endpoints[]` replaces the full stop list; `TRANSPORT_TYPES`
  includes `'transit'`). Manual geometry is `PARTIAL` — reuse upstream geometry representation.
- **Recommendation:** single class `UPSTREAMED_CURRENT`. The only candidate `PARTIAL` delta is
  the manual-geometry semantics (what happens to `route_geometry`/`leg distance` when endpoints
  change) — decide one explicit policy (spec §7.3) rather than leaving stale geometry.
- **Migration action:** use generic transport update path; port only proven missing geometry semantics.
- **Tests:** fork `transit.test.ts` endpoint-replacement tests → re-target onto `update_transport`.

### F08 — Map-side transit endpoint editor — `FORK_ONLY`

- **Fork commits:** `4bc62ec5` (edit transit map endpoints), `6fbc3d52` (client flow),
  `2d734584` (gate on `reservation_edit`; guard blank coords), `48356079` (lock rendering).
- **Fork behavior:** drag/edit a stored transit route's endpoints directly on the map.
- **Affected:** `client/src/components/Planner/TransitRouteEndpointEditor.tsx`,
  `TransitJourneyModal.tsx` (fork blob `d1a82100…`), map rendering, reservation store.
- **v4.0 evidence:** no equivalent editor at `v4.0.0`. `TransitJourneyModal.tsx` at `v4.0.0`
  (blob `37cda894…`) has no endpoint-edit surface (1 endpoint mention vs fork's 22).
- **Current upstream:** same — `TransitJourneyModal.tsx` blob `37cda894…` at `upstream/main`
  (identical to v4.0.0); no editor.
- **Mobile outcome:** desktop + mobile — `TransitJourneyModal` is opened from the desktop
  sidebar *and* the mobile sidebar portal (`onOpenTransit`), so the editor must work on both.
- **Migration action:** port UI/domain onto 4.0 map/planner; backend via upstream `update_transport`.
- **Tests:** fork `TransitRouteEndpointEditor.test.tsx` is characterization.

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
- **Current upstream:** absent.
- **Mobile outcome:** backend/API + Budget-tab surface (desktop + mobile read the link state).
- **Migration action:** implement atop 4.0 Costs/Reservations services (spec §7.1 invariants).
- **Tests:** fork `budget-reservation-linking.test.ts` is characterization; invariants per spec §7.1.

### F12 — POI marker reposition — `FORK_ONLY`

- **Fork commits:** `ae7649bd` (reposition saved place markers), `019cdf55` (harden rollback),
  `63936e2e` (preserve mobile inspector while saving).
- **Fork behavior:** enter reposition mode, move a saved place marker, save/cancel with rollback.
- **Affected:** `client/src/components/Map/MapView.tsx`, `MapViewGL.tsx`, `MapView.types.ts`,
  `Planner/PlaceInspector.tsx`, `pages/tripPlanner/useTripPlanner.ts`, `useRouteCalculation.ts`.
- **v4.0 evidence:** only a trace of "reposition" in `useRouteCalculation.ts`; no reposition UI.
- **Current upstream:** only `MapViewGL.tsx` + `useRouteCalculation.ts` traces; no feature.
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
- **Current upstream:** absent.
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
- **Current upstream:** `DayTimelinePlanner`/`apply_recommended_durations` absent. Upstream mobile
  has `client/src/mobile/screens/trip/plan/MPlanTimeline.tsx` (+ `useMPlanDragReorder.ts`, long-press
  drag reorder #1997, `planTimelineModel.ts`).
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

### F17 — Fork plugin OAuth/runtime stack (resource proxy) — `PARTIAL`

- **Fork commit:** `112f656a` (add OAuth plugin resource proxy).
- **Fork behavior:** resource-proxy plumbing so a plugin's OAuth provider can proxy resources
  through the host (client `oauthScopes.ts`, `ScopeGroupPicker`, `OAuthAuthorizePage`,
  `server/src/bootstrap.ts`, plugin-sdk).
- **Affected:** `client/src/api/oauthScopes.ts`, `components/OAuth/ScopeGroupPicker.tsx`,
  `pages/OAuthAuthorizePage.tsx`, `server/src/bootstrap.ts`, `plugin-sdk/src/index.ts`.
- **v4.0 evidence:** 4.0 has its own plugin runtime (Nest `server/src/nest/plugins/*`, 519 nest files)
  that is more complete; fork's bridge-era proxy is superseded.
- **Current upstream:** current plugin stack (plugin-contributed MCP tools etc.) supersedes.
- **Mobile outcome:** backend/API only (plugin runtime/grants); any client surface follows the
  OAuth consent flow on both desktop and mobile.
- **Migration action:** delta audit only; never wholesale port the 3.4 bridge.

### F18 — `oauth_tokens.user_password_version` migration — `OBSOLETE`

- **Fork commits:** `112f656a` (added), `8bc507ef` (idempotent), `4d2654b4` (re-added after sync).
- **Fork behavior:** last migration slot (index 175 → schema **176**) adds
  `oauth_tokens.user_password_version` and backfills it from `users.password_version`. Binds OAuth
  tokens to password-change invalidation.
- **Affected:** `server/src/db/migrations.ts` (fork schema version = **176**).
- **v4.0 evidence:** `v4.0.0:server/src/db/migrations.ts` has **no** `user_password_version`
  migration; upstream owns its own 176–198 sequence (schema **198**, **not** 195 — corrected
  from the original draft). Upstream 3.4 = schema **175**.
- **Current upstream:** same; 4.0 auth/revocation architecture may make the column obsolete.
- **Mobile outcome:** backend/API only (auth/token model).
- **Recommendation:** `OBSOLETE` for the column. DB compatibility is a Task 02 bridge concern
  (see `migration-verification.md`), not a ported feature. Do NOT recreate the column as a new
  post-195 migration (spec §5.3).
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

### F23 — Static-token deprecation-warning patch — `PARTIAL`

- **Fork commit:** `380b890c` (remove static-token deprecation notice).
- **Fork behavior:** removed deprecation notices attached to static MCP tokens.
- **Affected:** `server/src/mcp/index.ts`, `sessionManager.ts`, `tools.ts`, `prompts.ts`, `trips.ts`.
- **v4.0 evidence:** `sessionManager.ts` still references deprecation at `v4.0.0`/`upstream/main`.
- **Mobile outcome:** backend/API only (token auth wording).
- **Recommendation:** inspect current upstream wording in Task 03; patch only if still wrong.
- **Migration action:** inspect current upstream wording first; patch only if still wrong.

### F24 — Upstream 3.4.x sync cluster — not fork behavior — `UPSTREAMED_V4`

- **Commits:** `5e1e3f0d` (merge integration/upstream-3.4.0), `aa364b3f` (synchronize 3.4.1),
  `68fe32c7` (frozen 3.4), `3ce600da` (integrate 3.4.1), plus Task 2–13 sync fixes
  (ntfy isolation `151d5934`, Synology TLS `e519a3f9`/`8e9ab641`, Kosovo atlas `45f02b12`,
  AirTrail hook order `e95b9897`, arrive-by `482bc3b5`, hotel morning-leg `315e6cb5`).
- **Determination:** these bring the fork base up to 3.4.1 parity. The same concepts (Synology,
  ntfy, Kosovo, airtrail, arrive-by) are all present at `v4.0.0` and `upstream/main` — they are
  upstream content, not fork deltas. Classified `UPSTREAMED_V4` (v4.0.0 already implements them).
- **Mobile outcome:** n/a (upstream content, not fork UI).
- **Migration action:** none.

### F25 — Deployment env-var normalization — `UPSTREAMED_V4`

- **Commits:** `f935b1dd`, `6ecbc093`, `44bce05b`, `3bce7b5f`, `4a8a54ce`, `b7cc41e6`, etc.
- **Determination:** Task 12 deployment-doc/env normalization for 3.4.1. Verified at `v4.0.0`:
  `DEMO_MODE`, `BACKUP_UPLOAD_LIMIT_MB`, `OVERPASS_URL`, `OVERPASS_TIMEOUT_MS` are already
  declared in `charts/trek/templates/configmap.yaml`, `charts/trek/values.yaml`,
  `server/.env.example`, and `server/src/app-config/` (`env.schema.ts`, `derive.ts`). No fork
  deploy delta survives.
- **Current upstream:** same deploy surfaces present.
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
- **Migration action:** port the reducer case + stale-visibility cleanup onto the 4.0 store
  (`remoteEventHandler.ts` + `connectionsVisibility.ts`), and move `reservation:positions` out of
  `IGNORED_WS_EVENTS` with a characterization test. Alternatively, if the product accepts
  upstream's optimistic-only behavior, mark `OBSOLETE` after confirming collaborator reorder
  latency is acceptable — decide in Task 08.
- **Tests:** fork FE-WSEVT-RESERV-006/007/008 are characterization.

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
- Three spec-named upstream SHAs verified in `upstream/main` and not in `v4.0.0` (§3).

No production behavior was changed by this task; the ledger is documentation only.

---

## 8. Open items for later tasks (non-blocking for Task 00 gate)

1. F07/F08: pick one explicit stale-geometry policy when transit endpoints change (spec §7.3).
2. F26: confirm in Task 08 whether the fork's live `reservation:positions` reducer is retained
   (port) or upstream's optimistic-only behavior is accepted (mark `OBSOLETE`). This is the only
   deliberately deferred classification, and it is a client-latency product decision, not an
   evidence gap.
3. Determine whether any deployed client holds legacy `plugin:<id>:*` scopes (F16) → decides the
   `COMPAT_ONLY` layer.
4. Static-token wording check (F23).
5. F02 error-redaction wording parity check (only candidate F02 delta).

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