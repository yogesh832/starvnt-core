# STARVNT branch responsibilities

Established 2026-11-02 (Asia/Calcutta).

| Branch | Role | External sign-in/navigation |
| --- | --- | --- |
| `codex/development` | Shared development baseline created from customer commit `4ccb4d9` | Customer and Vendor OS |
| `customer` | Customer OS product branch | Customer only |
| `main` | Existing production/Vendor OS branch | Existing production behavior; unchanged by this separation |

Customer OS continues to use shared backend/vendor catalogue, quotation, agreement, booking and payment services. Removing Vendor OS entry points does not delete vendor records or remove backend vendor permissions. Internal staff authentication remains separate.

Customer web entry ignores vendor role query parameters, accepts only customer return destinations, and normalizes saved vendor sessions through the existing switch-surface API before rendering a customer identity. Mobile uses the same customer-only policy, removes vendor workspace switching and vendor-only navigation destinations, and ignores vendor push destinations. Existing phones need a new app build to receive source changes.

Develop shared features in `codex/development`, then review and cherry-pick the relevant commits into the appropriate product branch. Do not wholesale merge Customer OS routing/auth restrictions into main or overwrite the mixed development surface. Shared backend changes can be promoted independently. Existing main deployment rules remain unchanged; creation of the development branch does not deploy it.

The mixed development branch is an exact source baseline, not an automatic synchronization of later commits from either product branch.
