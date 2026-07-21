# Upstream 3.4.1 — Conflict Ledger

Merge of `a0994658890eae96624fb9cbe7f55867f047fea2` into `integration/upstream-3.4.1`.

| # | Path | Class | Fork behavior to preserve | Upstream 3.4.1 intent | Resolution | Owning task |
|---|---|---|---|---|---|---|
| 1 | `client/src/components/Journey/JourneyDetailPageGalleryView.tsx` | semantic overlap | Provider label ternary handles `immich`/`synology` | Rename `synology` → `synologyphotos` label | Keep fork ternary, accept upstream label grammar | Task 07 (Synology) |
| 2 | `client/src/components/Planner/AirTrailImportModal.tsx` | independent composition | Chain-flight grouping via `sectionItems` useMemo — renders chain once at first leg position | Remove chain grouping, flatten all flights | Keep fork chain grouping | Task 03 (AirTrail) |
| 3 | `client/src/components/Planner/TransitSearchPanel.tsx` | semantic overlap | `cleanStop` name sanitization on itineraries | Add `arriveBy` descending sort (#1479) | Keep both — sanitize then sort | Task 02 (transit) |
| 4 | `client/src/pages/JourneyDetailPage.test.tsx` | textual / semantic overlap | Test fixture data using `synology` provider + `syn-456` asset ID | Test fixture using `synologyphotos` + `456_cachekey` | Keep fork test structure, accept upstream provider rename | Task 07 (Synology) |
| 5 | `server/src/services/memories/helpersService.ts` | semantic overlap | `pipeAsset` signature without `fetchOptions`; separate imports | Add `SafeFetchOptions` param, `pipeline`/`Readable`/`Response` imports | Keep fork structure, add `fetchOptions` param; deduplicate imports | Task 05 (memories helpers) |
| 6 | `server/src/services/memories/synologyService.ts` | semantic overlap | `fetchSynologyThumbnailBytes` without `rejectUnauthorized`; `streamSynologyAsset` simple pipeAsset call | Add `rejectUnauthorized: !synology_skip_ssl` option, error logging | Port upstream SSL option + error logging | Task 07 (Synology) |
| 7 | `server/tests/unit/services/notifications.test.ts` | textual | Mock declaration before imports | Add missing imports after mock | Accept both — keep mock and add imports | Task 06 (notifications) |
