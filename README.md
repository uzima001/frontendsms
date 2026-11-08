# SMS Gateway Platform

A centralized multi-tenant SMS Gateway SaaS platform allowing users to manage physical Android SIM cards remotely through a web browser.

The platform coordinates with the companion **Android SMS Gateway Agent** application via standard authenticated WebSockets, enabling real-time inbound SMS ingestion, reliable queue dispatch, bulk campaigns, and Gemini-powered AI auto-replies.

---

## Architecture Overview

```
                  WEB BROWSER
                       |
                       | HTTPS & WSS (/user/connect)
                       v
             CENTRAL BACKEND SERVER
            (Node.js / Express / ws)
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
   PostgreSQL     Redis Queue     AI Engine
  (Data Store)     (BullMQ)    (Gemini 3.8 Flash)
        |              |
        +-------+------+
                |
                | WSS (/device/connect)
                v
      ANDROID GATEWAY AGENT
                |
                v
         PHYSICAL SIM CARD
                |
                v
      MOBILE CELLULAR NETWORK
```

---

## Key Features

1. **WhatsApp Web-style QR Device Pairing:**
   - Single-use cryptographically random pairing secrets with 2-minute expiration.
   - Immediate pairing state broadcast to browser upon Android confirmation.
2. **Native WebSocket Infrastructure:**
   - Standard OkHttp WebSocket client compatibility at `/device/connect`.
   - Real-time user updates at `/user/connect`.
   - Heartbeat sweeps and disconnect detection.
3. **SMS Queue & Telephony Dispatch:**
   - Non-loss queue worker surviving device disconnects and restarts.
   - Status tracking: `QUEUED` -> `DISPATCHED` -> `SENT` -> `DELIVERED`.
4. **AI Auto-Reply Engine:**
   - Automated replies using Google Gemini API (`gemini-3.8-flash`).
   - Anti-loop safeguards, maximum reply quotas, stop-word opt-out detection.
   - Interactive prompt sandbox for testing prior to live dispatch.
5. **Bulk SMS Campaigns:**
   - CSV recipient import, variable substitution (`{{name}}`), per-device rate limiting, pause/resume/cancel controls.
6. **Built-in Android Agent Protocol Debugger & Simulator:**
   - Interactive virtual device emulator allowing cross-functional teams to test the full lifecycle without hardware.

---

## Quickstart (Development)

```bash
# 1. Install dependencies
npm install

# 2. Run dev server (Express backend + WebSocket + Vite frontend on port 3000)
npm run dev

# 3. Open in browser
http://localhost:3000
```

Default demo administrator:
- Email: `admin@smsgateway.io`
- Password: `Password123!`

---

## Production Deployment (Linux VPS with Docker Compose)

### 1. Prerequisites
- Ubuntu 22.04 / 24.04 LTS VPS
- Docker 24+ & Docker Compose v2+
- Domain DNS pointing to VPS IP

### 2. Setup
```bash
git clone <repo-url> /opt/sms-gateway
cd /opt/sms-gateway

# Configure environment variables
cp .env.example .env
nano .env

# Place SSL certificates in infrastructure/nginx/ssl/
mkdir -p infrastructure/nginx/ssl
# Copy fullchain.pem and privkey.pem into infrastructure/nginx/ssl/
```

### 3. Launch Services
```bash
docker compose up -d --build
```

### 4. Database Migrations
```bash
# Run Prisma migrations inside container
docker compose exec sms-gateway-app npx prisma migrate deploy
```

---

## Database Backup and Restore

### Backup PostgreSQL
```bash
docker compose exec -t postgres pg_dump -U gateway_user sms_gateway_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore PostgreSQL
```bash
cat backup_file.sql | docker compose exec -T postgres psql -U gateway_user -d sms_gateway_db
```

---

## Log Inspection

```bash
# View app logs
docker compose logs -f sms-gateway-app

# View WebSocket and Nginx logs
docker compose logs -f nginx

# Check container health
docker compose ps
```

---

## API Contract & Android Integration

For complete WebSocket envelopes and OkHttp Kotlin client snippets, see [API_CONTRACT.md](./API_CONTRACT.md) or inspect `/api/v1/openapi.json`.
