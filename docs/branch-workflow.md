# STARVNT branch workflow

Updated 2026-11-02 (Asia/Calcutta).

| Branch | Purpose | Deployment target |
| --- | --- | --- |
| `main` | Vendor OS production | Vendor domain |
| `vendor-dev` | Vendor OS development | Vendor staging |
| `customer` | Customer OS production | Customer domain |
| `customer-dev` | Customer OS development | Customer staging |

Use only these four branches. Develop Vendor OS in `vendor-dev`, and Customer OS in `customer-dev`. Promote tested changes to the corresponding production branch when a release is requested. Do not create a mixed development branch or new `codex/*` feature branches.

`vendor-dev` starts from published `main` commit `8f6352204c6895e4c6b0dbe45274e450915e6fad`; `customer-dev` starts from published `customer` commit `ee2a0b8efc9b4c3464321afe138883cf791f81de`. Keep each product's authentication and navigation separate. Shared Core/backend changes must be reviewed and promoted to both product lines where needed; avoid wholesale cross-product merges that overwrite their entry points.

The table records deployment responsibilities. Branch creation does not provision staging servers, configure domains/secrets, or change existing production deployment workflows. Wire each development branch only to its corresponding staging environment when those environments are configured.

Preferred development worktrees:
- Vendor OS: `D:/starvnt-core-worktrees/vendor-dev`
- Customer OS: `D:/starvnt-core-worktrees/customer-dev`

Legacy branch history is archived locally at `D:/starvnt-branch-archive/2026-11-02/before-four-branch-layout.bundle`. Historical worktree files and uncommitted changes are preserved; retired worktrees may remain detached for recovery/reference.

