# Automatic production deployment

Production is the `main` branch of `yogesh832/starvnt-core`. The `customer`
branch does not deploy to production.

The workflow runs the backend test suite against temporary local MongoDB and
builds the frontend. Pull requests run checks only. A passing push to `main`
uses GitHub OIDC to request temporary AWS credentials and invokes the
`StarvntDeployMain` Systems Manager document on the existing Mumbai instance
`i-050ba337d9d81dd2c`.

The role is limited to that document and instance. Its trust policy matches
this repository's actual immutable GitHub subject IDs and `refs/heads/main`.
No AWS access key or SSH private key is stored in GitHub. The server retains
its production environment, uploads and Caddy certificate volumes.

The deployment installs an exact Git SHA, checks health, and returns failure
to GitHub if deployment or public smoke checks fail. GitHub serializes
production runs. `/deployment.json` on the frontend identifies its revision.

## One-time AWS setup

The AWS account owner must authorize the GitHub OIDC provider and scoped
deployment role, an SSM instance role/profile on the production EC2 instance,
and the restricted deployment document. The SSM agent must be online.

The JSON files in this directory define the installed trust, deployment
permission and command document. The instance profile has only agent messaging,
association status and the document access needed for deployment, without
Parameter Store or database access. The one-time bootstrap installs
`deploy-main` in `/opt/starvnt/bin` and records the existing Compose and
environment paths in `/opt/starvnt/deploy-settings.json`.

`deploy-main` downloads the exact tested commit from this public repository.
It builds backend and frontend images before replacing services, reuses the
existing Compose project, environment files and certificate volumes, and
restores the previous images and Caddy configuration if health checks fail.
Container replacement on this single server can cause a short interruption.
No database migration runs during deployment.

## Routine use

Push approved code to `main`, then open the repository's **Actions** tab and
the **Test and deploy main to AWS** run. Both `checks` and `deploy` must be
green. A passing build alone does not prove that production was deployed.

`app.starvnt.com` serves the backend. Public privacy paths and their static
assets must be routed to the frontend so the published policy URL also works.
`vendor.starvnt.com` serves the frontend and proxies API requests to the backend.
The separate partner domain is outside this deployment's scope.

## Recovery

GitHub Actions reports deployment errors with the SSM command ID. Inspect that
command in Systems Manager Run Command. The server keeps the prior image IDs
and Caddy file under `/opt/starvnt/deploy-state/<commit>-<timestamp>/`.
The active image override is `/opt/starvnt/deploy-state/active.yml`; include it
when using Compose manually:

```sh
sudo docker compose -p starvnt-production -f /opt/starvnt/compose.yaml \
  -f /opt/starvnt/deploy-state/active.yml ps
```

To redeploy an earlier reviewed release, revert the desired code on `main` and
push the revert. This runs the same checks and publishes a new revision.
