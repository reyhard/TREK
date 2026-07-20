# Task 11 Report — Remaining Client UI, Settings, Public Views, Accessibility, and Localization

**Status:** DONE
**Completed:** 2026-07-20
**Commit:** `b8700146`

## Summary

Reconciled remaining client conflicts: OAuth scope display (geo:read transit reference, places:read transit exclusion, plugin scope grouping), backward-compatible settings normalization with migration tests, transit/reservation presentation hardening with defensive metadata handling, accessibility utilities (reduced-motion, RTL, keyboard operation), and locale parity updates across all 23 supported languages.

## Commits

- `b8700146` — fix(client): reconcile remaining client UI, settings migration, transit display, a11y, and locale parity

## Test Summary

- OAuth scope display tests: 34 passed (11 new FE-OAUTH-SCOPES-023–032 + existing)
- Settings store migration tests: 13 passed (11 new SETTINGS-MIGRATE-001–011 + existing)
- Transit display tests: 16 passed (all new FE-TRANSDISPLAY-001–015)
- Accessibility tests: 10 passed (all new FE-A11Y-001–010)
- DayPlanSidebar integration tests: 183 passed (unchanged, confirming transit defensive handling)
- Client typecheck: 0 errors
- Client build: PASS

## Concerns

None.

## Handoff

Task 12 consumes the complete client with up-to-date OAuth scope display, normalized settings with backward-compatible parsing, defensive transit metadata handling, accessibility utilities, and locale parity across all 23 languages.

## Review Blocker Fix (Raw JSON.parse → safeParseMetadata)

**Commit:** (pending)

Replaced 4 remaining raw `JSON.parse` metadata sites with the shared `safeParseMetadata` utility, eliminating render-crash vectors from malformed reservation metadata across public views and PDF export.

### Source Changes (3 files, 4 sites)

| File | Site | Before | After |
|------|------|--------|-------|
| `SharedTripPage.tsx:528` | Day plan transport item | `typeof r.metadata === 'string' ? JSON.parse(r.metadata \|\| '{}') : r.metadata \|\| {}` | `safeParseMetadata(r as any)` |
| `SharedTripPage.tsx:742` | Bookings tab reservation | `typeof r.metadata === 'string' ? JSON.parse(r.metadata \|\| '{}') : r.metadata \|\| {}` | `safeParseMetadata(r as any)` |
| `TripPDF.tsx:245` | PDF reservation rendering | `typeof r.metadata === 'string' ? JSON.parse(r.metadata \|\| '{}') : (r.metadata \|\| {})` | `safeParseMetadata(r as any)` |
| `ReservationsPanel.tsx:535` | TransitJourneyCard | inline try/catch JSON.parse | `safeParseMetadata(r as any)` |

### Regression Tests (5 new)

| Test ID | File | Coverage |
|---------|------|----------|
| FE-PAGE-SHARED-021 | SharedTripPage.test.tsx | Bookings tab: malformed string, null, array, valid metadata — all render without crash |
| FE-PAGE-SHARED-022 | SharedTripPage.test.tsx | Plan tab: page renders with malformed reservation data present |
| FE-COMP-TRIPPDF-023 | TripPDF.test.ts | PDF export: malformed string, null, array, string-only metadata — all render without crash; valid metadata intact |
| FE-PLANNER-RESP-046 | ReservationsPanel.test.tsx | TransitJourneyCard: malformed JSON metadata → graceful fallback |
| FE-PLANNER-RESP-047 | ReservationsPanel.test.tsx | TransitJourneyCard: null metadata → graceful fallback |

### Verification

- Typecheck: 0 errors
- Focused tests: 102 passed (across all 3 test files)

## Report path

`.superpowers/sdd/task-11-report.md`
