# TREK 4.0 Fork Upgrade — Upstream Adoptions

**Status:** placeholder — populated by Task 01 ("Clean 4.0 base + upstream-adoption set").

Records every post-4.0 upstream commit adopted onto the `trek-4-upgrade` branch, by exact
SHA, with the fork feature it supersedes and the characterization test that proves it.

Reference SHAs identified during Task 00 (do not adopt until re-verified against current
upstream in the task that needs them):

| Upstream SHA | Subject | Supersedes | Notes |
| --- | --- | --- | --- |
| `aa5002b2ed4b48834b61ba808636ba67692db1cc` | fix(mcp): keep transit out of the transport create enum | F06 stored-transit edit | re-verify before adoption |
| `f1bbd94f2b1393eb6a08d25e38a32c9a602fa90f` | feat(mcp): booking link and end time on a reservation | F09 reservation url | re-verify before adoption |
| `092223c25979d0af7eead1cbcbd912ba984d79e4` | feat(mcp): plugins:use OAuth scope | F16 plugin scopes | re-verify before adoption |

No upstream commits have been adopted yet (Task 00 makes no code changes).
