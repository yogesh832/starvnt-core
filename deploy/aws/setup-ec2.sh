#!/bin/bash
# ==============================================================================
# STARVNT - AWS EC2 / Lightsail Server Provisioning Script
# ==============================================================================
# OS Target: Ubuntu 24.04 LTS / 22.04 LTS (x86_64 or arm64 Graviton)
# Usage: sudo bash setup-ec2.sh

set -euo pipefail

echo "=========================================================="
echo " Starting StarVnt Production AWS Server Provisioning..."
echo "=========================================================="

# 1. Update system packages
echo "--> Updating system packages..."
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw git htop jq fail2ban

# 2. Configure Swap Space (Prevents OOM errors on 2GB/4GB instances)
if [ ! -f /swapfile ]; then
    echo "--> Configuring 2GB swap space for memory resilience..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | tee -a /etc/sysctl.conf
fi

# 3. Install Docker Engine & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
    echo "--> Installing Docker Engine..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
fi

# Add current user to docker group if running under sudo
if [ -n "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER"
fi

# 4. Configure Firewall (UFW)
echo "--> Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# 5. Setup Project Directory
APP_DIR="/opt/starvnt"
echo "--> Setting up application directory at ${APP_DIR}..."
mkdir -p "${APP_DIR}/deploy/aws"

# 6. Configure Systemd Auto-Restart Service
echo "--> Creating systemd auto-restart service for StarVnt..."
cat << 'EOF' > /etc/systemd/system/starvnt.service
[Unit]
Description=StarVnt Production Stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/starvnt/deploy/aws
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
ExecReload=/usr/bin/docker compose -f docker-compose.prod.yml restart
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable starvnt.service

echo "=========================================================="
echo " AWS Host Provisioning Complete!"
echo " Next Steps:"
echo " 1. Clone your repo to /opt/starvnt"
echo " 2. Copy deploy/aws/server.env.production.example to /opt/starvnt/deploy/aws/server.env and fill secrets"
echo " 3. Run: cd /opt/starvnt/deploy/aws && bash init-ssl.sh"
echo " 4. Run: systemctl start starvnt"
echo "=========================================================="
