# Working in STARVNT

## Branch policy

The maintained branches are `main` (Vendor OS production), `vendor-dev` (Vendor OS development/staging), `customer` (Customer OS production), and `customer-dev` (Customer OS development/staging).

Use the matching development branch for daily work. Do not create additional feature branches or `codex/*` branches unless the user explicitly requests a different branch structure. Use the existing matching development worktree; detached read-only/review worktrees are acceptable without adding branches.

Preserve uncommitted changes in every worktree. Keep customer-only authentication/navigation on the customer product line and Vendor OS entry points on the vendor product line. Review shared backend changes for both products. Promote tested changes to the matching production branch when a release is requested; a development push must not be routed to production infrastructure.

See `docs/branch-workflow.md` for branch roles, initial baselines, worktree locations and archive recovery information. Staging targets in that document are intended roles, not proof that hosting has been configured.
