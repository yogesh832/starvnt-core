#!/bin/bash
# ==============================================================================
# STARVNT - Let's Encrypt SSL Bootstrap Script
# ==============================================================================
# Obtains real SSL certificates for StarVnt domains and subdomains

set -euo pipefail

DOMAINS=("starvnt.com" "www.starvnt.com" "admin.starvnt.com" "vendor.starvnt.com" "partner.starvnt.com" "api.starvnt.com")
EMAIL="admin@starvnt.com" # Change to your tech alert email
RSA_KEY_SIZE=4096
DATA_PATH="./certbot_data"
STAGING=0 # Set to 1 for testing to avoid rate limits

echo "--> Initializing SSL certificate provisioning for StarVnt..."

if [ ! -e "$DATA_PATH/conf/live/${DOMAINS[0]}/cert.pem" ]; then
    echo "--> Creating dummy certificate for ${DOMAINS[0]} to allow initial Nginx boot..."
    path="/etc/letsencrypt/live/${DOMAINS[0]}"
    mkdir -p "$DATA_PATH/conf/live/${DOMAINS[0]}"
    docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
      openssl req -x509 -nodes -newkey rsa:$RSA_KEY_SIZE -days 1\
        -keyout '$path/privkey.pem' \
        -out '$path/fullchain.pem' \
        -subj '/CN=localhost'" certbot
fi

echo "--> Starting Nginx container..."
docker compose -f docker-compose.prod.yml up --force-recreate -d nginx-proxy

echo "--> Removing dummy certificate..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${DOMAINS[0]} && \
  rm -Rf /etc/letsencrypt/archive/${DOMAINS[0]} && \
  rm -Rf /etc/letsencrypt/renewal/${DOMAINS[0]}.conf" certbot

echo "--> Requesting real Let's Encrypt certificates for domains..."
domain_args=""
for domain in "${DOMAINS[@]}"; do
    domain_args="$domain_args -d $domain"
done

staging_arg=""
if [ $STAGING != "0" ]; then staging_arg="--staging"; fi

docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $domain_args \
    --email $EMAIL \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot

echo "--> Reloading Nginx with new certificates..."
docker compose -f docker-compose.prod.yml exec nginx-proxy nginx -s reload

echo "=========================================================="
echo " SSL Certificates Successfully Configured & Active!"
echo "=========================================================="
