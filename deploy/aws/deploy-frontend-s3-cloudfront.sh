#!/bin/bash
# ==============================================================================
# STARVNT - Frontend Deployment to AWS S3 & CloudFront CDN
# ==============================================================================
# Usage:
#   export S3_BUCKET="starvnt-frontend-prod"
#   export CLOUDFRONT_DISTRIBUTION_ID="E1XXXXXXXXXXXX"
#   bash deploy-frontend-s3-cloudfront.sh

set -euo pipefail

if [ -z "${S3_BUCKET:-}" ] || [ -z "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]; then
    echo "ERROR: S3_BUCKET and CLOUDFRONT_DISTRIBUTION_ID environment variables are required."
    echo "Example:"
    echo "  export S3_BUCKET=starvnt-frontend-prod"
    echo "  export CLOUDFRONT_DISTRIBUTION_ID=E1234567890ABC"
    exit 1
fi

echo "--> Building StarVnt production frontend..."
cd ../../web
npm ci
npm run build

echo "--> Syncing immutable static assets to S3 with long cache (1 year)..."
aws s3 sync dist/assets "s3://${S3_BUCKET}/assets" \
    --cache-control "public, max-age=31536000, immutable" \
    --delete

echo "--> Syncing HTML and root files with no-cache..."
aws s3 sync dist "s3://${S3_BUCKET}" \
    --exclude "assets/*" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --delete

echo "--> Invalidating CloudFront cache for instant global update..."
aws cloudfront create-invalidation \
    --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
    --paths "/*"

echo "=========================================================="
echo " Frontend successfully deployed to AWS CloudFront & S3!"
echo "=========================================================="
