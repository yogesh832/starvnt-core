# StarVnt AWS Production Deployment Runbook

This runbook is the definitive step-by-step guide to standing up **StarVnt** (Admin, Vendor, Customer portals, Backend API, and Aura+ AI chatbot) on AWS from scratch within a monthly budget of **₹5,000 – ₹13,000**.

---

## 1. Architecture Summary

* **Frontend**: React + Vite SPA with subdomain-based routing:
  * Customer App: `starvnt.com` / `customers.starvnt.com`
  * Vendor OS: `vendor.starvnt.com` / `partner.starvnt.com`
  * Admin Console: `admin.starvnt.com`
* **Backend API**: Node.js 22 + Express unified backend on `api.starvnt.com`
* **Database**: MongoDB Atlas on AWS Mumbai (`ap-south-1`) with dual-domain database isolation:
  * `starvnt_external` (Customers, Vendors, Bookings)
  * `starvnt_admin` (Admin Users, RBAC permissions, Audit logs)
* **AI Chatbot**: Aura+ engine running on Google Gemini 2.5 Flash / AWS Bedrock Haiku.

---

## 2. Step 1: Claiming AWS Credits & Region Configuration

1. **Target Region**: Always select **`ap-south-1` (Asia Pacific - Mumbai)**.
   * Lowest latency (<20ms) for users across India.
   * Complies with Indian data localization regulations.
2. **Apply for AWS Activate Founders Credits ($1,000 to $5,000)**:
   * URL: [https://aws.amazon.com/activate/](https://aws.amazon.com/activate/)
   * Submit company URL (`starvnt.com`) and basic pitch.
   * Approvals take 3–7 business days and offset hosting costs to **₹0** for 6–12 months.
3. **Configure AWS Billing Alert**:
   * Navigate to AWS Billing Console -> Budgets.
   * Set alert at **$60 (₹5,000)** and **$120 (₹10,000)** with email notification.

---

## 3. Step 2: Database Setup (MongoDB Atlas on AWS Mumbai)

1. Sign up / Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Create a cluster:
   * **Cloud Provider**: AWS
   * **Region**: `ap-south-1` (Mumbai)
   * **Tier**: M0 (Free tier initially) or M2 Shared ($9/month) for production SLA.
3. Network Access:
   * Whitelist your AWS EC2 Elastic IP address (or `0.0.0.0/0` temporarily with strong passwords).
4. Database Access:
   * Create two distinct database users for maximum isolation:
     * `starvnt_app_user` with readWrite access to `starvnt_external`.
     * `starvnt_admin_user` with readWrite access to `starvnt_admin`.
5. Copy both connection strings (`mongodb+srv://...`).

---

## 4. Step 3: Launching the AWS Compute Instance

You can choose either **AWS Lightsail** (simplest, fixed pricing) or **Amazon EC2** (standard cloud-native):

### Option A: AWS Lightsail (Recommended for Starter Tier: ₹1,680/mo | $20/mo)
1. Go to AWS Lightsail Console -> "Create instance".
2. Location: Mumbai (`ap-south-1`).
3. Platform: Linux/Unix -> OS Only -> **Ubuntu 24.04 LTS**.
4. Instance Plan: **$20/mo (4 GB RAM, 2 vCPUs, 80 GB SSD, 3 TB transfer)**.
5. Name: `starvnt-production`.
6. Attach a **Static IP** (Networking tab -> Create static IP).
7. Firewall rules: Allow ports **22 (SSH)**, **80 (HTTP)**, and **443 (HTTPS)**.

### Option B: Amazon EC2 (Growth Tier: ₹2,500/mo | $30/mo)
1. Go to EC2 Console -> "Launch Instance".
2. AMI: **Ubuntu Server 24.04 LTS**.
3. Architecture: **64-bit (Arm)** for Graviton instances (`t4g.small` or `t4g.medium`).
4. Instance Type: `t4g.medium` (4GB RAM, 2 vCPU).
5. Storage: 50 GB `gp3`.
6. Allocate and associate an **Elastic IP**.
7. Security Group inbound rules:
   * Port 22 (SSH) - Restrict to your IP
   * Port 80 (HTTP) - Anywhere (`0.0.0.0/0`)
   * Port 443 (HTTPS) - Anywhere (`0.0.0.0/0`)

---

## 5. Step 4: DNS & Subdomain Configuration

In your DNS provider (Route 53, GoDaddy, Hostinger, or Cloudflare), create **A Records** pointing to your AWS Static / Elastic IP:

| Type | Name / Host | Value / Target | Purpose |
| :--- | :--- | :--- | :--- |
| **A** | `@` (or `starvnt.com`) | `<AWS_STATIC_IP>` | Main Customer Portal & Landing |
| **A** | `www` | `<AWS_STATIC_IP>` | Redirect / Alternative customer domain |
| **A** | `admin` | `<AWS_STATIC_IP>` | Internal Admin Portal |
| **A** | `vendor` | `<AWS_STATIC_IP>` | Vendor OS Business Console |
| **A** | `partner` | `<AWS_STATIC_IP>` | Vendor OS alternative alias |
| **A** | `api` | `<AWS_STATIC_IP>` | Backend API & WebSocket Endpoint |

*(TTL: 300 seconds for quick propagation).*

---

## 6. Step 5: Server Provisioning & Application Deployment

Connect to your AWS instance via SSH:
```bash
ssh -i your-key.pem ubuntu@<AWS_STATIC_IP>
```

### 1. Run Automated Host Provisioning
```bash
# Clone the repository
sudo git clone https://github.com/your-org/starvnt-core.git /opt/starvnt
cd /opt/starvnt/deploy/aws

# Execute automated host setup (installs Docker, Compose, swapfile, UFW firewall)
sudo bash setup-ec2.sh
```

### 2. Configure Production Secrets
```bash
# Copy production env template
cp /opt/starvnt/deploy/aws/server.env.production.example /opt/starvnt/deploy/aws/server.env

# Edit with real MongoDB URIs, JWT secrets, Gemini API key, Razorpay keys:
nano /opt/starvnt/deploy/aws/server.env
```

*(Tip: Generate secure 64-character hex keys using `openssl rand -hex 32` for `JWT_EXTERNAL_SECRET`, `JWT_ADMIN_SECRET`, and `INTERNAL_API_KEY`).*

### 3. Initialize Let's Encrypt SSL Certificates
Ensure your DNS records have propagated to the server IP, then run:
```bash
cd /opt/starvnt/deploy/aws
sudo bash init-ssl.sh
```

### 4. Seed the Super Admin
Run the bootstrap seed inside the running container to create the initial administrative account:
```bash
docker compose -f docker-compose.prod.yml exec starvnt-server npm run seed
```

### 5. Verify Health Endpoint
```bash
curl -I https://api.starvnt.com/api/health
```
Expected response:
```http
HTTP/2 200
content-type: application/json; charset=utf-8
{"status":"ok","uptime":...}
```

---

## 7. Step 6: Aura+ AI Chatbot & Services Verification

1. **Customer Chat Test**:
   * Open `https://starvnt.com/customer` in your browser.
   * Send a test message: *"Plan a 200-guest wedding in Mumbai for December."*
   * Verify that Aura+ responds with streaming suggestions and category breakdowns.
2. **Vendor Portal Test**:
   * Navigate to `https://vendor.starvnt.com`.
   * Register or log in with vendor credentials.
   * Check portfolio image uploads and calendar availability.
3. **Admin Console Test**:
   * Navigate to `https://admin.starvnt.com/admin/login`.
   * Log in using your `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`.
   * Verify RBAC roles, audit logs, and vendor verification modules.

---

## 8. Ongoing Maintenance & Zero-Downtime Updates

To deploy new code updates in the future, simply run the one-command deployment script:
```bash
cd /opt/starvnt/deploy/aws
sudo bash deploy.sh
```
This script automatically:
1. Pulls the latest git commits from `main`.
2. Builds the new production containers.
3. Performs a zero-downtime rolling restart.
4. Validates container health checks.
5. Cleans up old docker images to conserve disk space.
