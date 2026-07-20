# Task 11 — Remaining Client UI, Settings, Public Views, Accessibility, and Localization

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-11-remaining-client-ui-and-localization.md`

## Objective

Reconcile the remaining client conflicts around OAuth consent, settings persistence, reservation and transit presentation, responsive behavior, public views, accessibility, and locale parity without reintroducing duplicate business logic.

## Scope

- Reconcile OAuth scope display and integrations UI against the final server scope model.
- Centralize backward-compatible settings parsing and persistence.
- Keep automated `transit` and manual `train` presentation distinct while rendering optional metadata defensively.
- Retain upstream responsive, touch, viewport, accessibility, RTL, reduced-motion, and public-view behavior.
- Update every supported locale and the relevant focused tests.

## Required Behavior

- Use one shared OAuth scope parser/display helper; group plugin scopes by plugin ID and distinguish read/write access.
- Render malformed or unknown scopes safely and deduplicate repeated scopes.
- Load old persisted settings shapes safely with conservative invalid-value fallbacks.
- Preserve generic reservation fields and plugin contributions for both manual and automated reservations.
- Survive missing or malformed geometry and optional transit metadata without crashing.
- Preserve keyboard operation, focus restoration, touch-drag guards, RTL direction, reduced motion, and private-control boundaries on public pages.
- Maintain exact locale interpolation placeholders and strict key parity.
- Consume Task 10’s canonical totals and reservation state; do not derive totals from labels or duplicate event normalization.

## Verification

```bash
npm --prefix client run typecheck
npm --prefix client test -- --run
npm --prefix client run build
```

## Handoff

Task 12 can package and document the finalized UI and configuration. Task 13 uses the complete client suite and E2E flows.
