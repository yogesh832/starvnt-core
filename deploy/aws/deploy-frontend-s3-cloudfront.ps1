# ==============================================================================
# STARVNT - Frontend Deployment to AWS S3 & CloudFront (PowerShell)
# ==============================================================================
param (
    [Parameter(Mandatory=$true)]
    [string]$S3Bucket,

    [Parameter(Mandatory=$true)]
    [string]$CloudFrontDistributionId
)

$ErrorActionPreference = "Stop"

Write-Host "--> Building StarVnt production frontend..." -ForegroundColor Cyan
Set-Location (Join-Path $PSScriptRoot "..\..\web")
npm ci
npm run build

Write-Host "--> Uploading static assets to S3 with 1-year immutable caching..." -ForegroundColor Cyan
aws s3 sync dist/assets "s3://$S3Bucket/assets" `
    --cache-control "public, max-age=31536000, immutable" `
    --delete

Write-Host "--> Uploading index.html and root files with no-cache..." -ForegroundColor Cyan
aws s3 sync dist "s3://$S3Bucket" `
    --exclude "assets/*" `
    --cache-control "no-cache, no-store, must-revalidate" `
    --delete

Write-Host "--> Invalidating CloudFront cache for instant rollout..." -ForegroundColor Cyan
aws cloudfront create-invalidation `
    --distribution-id $CloudFrontDistributionId `
    --paths "/*"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " StarVnt Frontend Deployed to AWS S3 & CloudFront!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
