# Task 6 Report: Transit Journey Endpoint Editor

## TDD Evidence

### RED phases

**Editor component tests:**
```bash
npm run test --workspace=client -- src/components/Planner/TransitRouteEndpointEditor.test.tsx
```
Result: 1 failed — module not found (component didn't exist). 2 other tests also failed (translation key resolution without store seeding).

**Modal integration tests:**
```bash
npm run test --workspace=client -- src/components/Planner/TransitJourneyModal.test.tsx
```
Result: 3 new integration tests failed — "Edit route endpoints" button not found.

**Page wiring test:**
```bash
npm run test --workspace=client -- src/pages/TripPlannerPage.test.tsx
```
Result: 3 new tests failed (2 pre-existing), new FE-PAGE-PLANNER-045 test didn't exist yet.

### GREEN phases

**Editor component:** Created `TransitRouteEndpointEditor.tsx` with:
- `useTranslation()` for i18n
- Store input values as strings for flexible editing
- Validate with finite/range/name rules matching shared contract
- Compare normalized values against originals, only include changed endpoints
- Disable save when invalid/unchanged/saving
- Catch and display save errors
- `aria-label` format: `Origin — Latitude`

**Modal integration:** Updated `TransitJourneyModal.tsx` with:
- `onUpdateEndpoints` and `canEditEndpoints` props
- `editingEndpoints` state and endpoint find logic
- "Edit route endpoints" button in footer next to "Change route"
- Conditional render of `TransitRouteEndpointEditor` inline
- Gate: `canEdit && canEditEndpoints && !!fromEndpoint && !!toEndpoint`

**Page wiring:** Updated `TripPlannerPage.tsx` with:
- `canEditEndpoints={can('reservation_edit', trip)}`
- `onUpdateEndpoints` lambda calling `tripActions.updateTransitRouteEndpoints`

**Pre-existing test fixes:**
- `FE-PLANNER-TRANSITJOURNEY-002`: included `status`/`confirmation_number` in expected payload
- `FE-PLANNER-TRANSITJOURNEY-006`: renamed to reflect editable status/confirmation fields

## Verification

| Check | Status |
|-------|--------|
| Editor unit tests | 3/3 passed |
| Modal integration tests | 11/11 passed |
| Page wiring tests | 68/68 passed |
| Client typecheck | PASS (0 errors) |

## Commit

| SHA | Message |
|-----|---------|
| `4bc62ec5` | feat(planner): edit transit map endpoints |

## Review Fixes — Important Task 6 Findings

### Finding 1: Permission gating

**Issue:** Endpoint editing was gated by `canEdit && canEditEndpoints`, requiring BOTH `day_edit` and `reservation_edit`. Endpoint editing should only require `reservation_edit`.

**Fix:** Removed `canEdit &&` from the gate in `TransitJourneyModal.tsx:104`:
```
- const canOpenEndpointEditor = canEdit && canEditEndpoints && !!fromEndpoint && !!toEndpoint;
+ const canOpenEndpointEditor = canEditEndpoints && !!fromEndpoint && !!toEndpoint;
```

**TDD — RED:**
```bash
npx vitest run src/components/Planner/TransitJourneyModal.test.tsx
```
Test `FE-PLANNER-TRANSITJOURNEY-005` failed — expected endpoint editor button to be visible when `canEdit=false, canEditEndpoints=true`, but it was absent.

**TDD — GREEN:**
After removing `canEdit &&`, same test passed. New test `hides endpoint editing when reservation_edit is missing even with day_edit` also passed.

### Finding 2: Empty coordinate coercion to zero

**Issue:** `Number('')` evaluates to `0`, so clearing a lat/lng field and saving would submit an accidental coordinate of `0` which passes the server schema's `min(-90)/max(90)` validation.

**Fix:** Added explicit blank-string checks in `normalize()` and `validateField()` before numeric conversion in `TransitRouteEndpointEditor.tsx`:
- `normalize`: return `null` if lat/lng trimmed string is empty (prevents submission)
- `validateField`: report error if lat/lng trimmed string is empty (blocks Save button)

**TDD — RED:**
```bash
npx vitest run src/components/Planner/TransitRouteEndpointEditor.test.tsx
```
Two new tests failed:
1. `reports errors for blank latitude and longitude and blocks save` — error text not found
2. `does not submit an accidental zero for blank coordinates` — `onSave` was called with `{ lat: 34.967, lng: 0 }`

**TDD — GREEN:**
After adding blank-checks in both `normalize` and `validateField`, both tests passed.

### Verification

| Check | Status |
|-------|--------|
| TransitJourneyModal tests | 14/14 passed |
| TransitRouteEndpointEditor tests | 5/5 passed |
| Server reservations.controller tests | 17/17 passed |
| All client Planner tests | 568/569 passed (1 pre-existing failure in PlaceInspector.test.tsx, unrelated) |

## Concerns
- No concerns. Fixes are minimal and focused, with regression tests confirming no behavioral change to non-endpoint operations.
