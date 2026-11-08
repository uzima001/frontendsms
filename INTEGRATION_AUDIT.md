# TECHNICAL INTEGRATION AUDIT: SMS GATEWAY PLATFORM

**Date of Audit:** November 8, 2026  
**Audited System:** SMS Gateway Platform (Web Dashboard, Central Backend API, Database, WebSocket Engine)  
**Companion Target:** Independent Android SMS Gateway Agent (Kotlin / OkHttp)  
**Status:** Audit Completed — Baseline Architecture Analyzed

---

## EXECUTIVE SUMMARY

A comprehensive technical audit was conducted on the existing SMS Gateway codebase. The platform is designed as a centralized multi-tenant SMS management system operating on a unified full-stack architecture (Express backend + native `ws` WebSocket server + React 19/Vite frontend). 

The existing backend is **fundamentally compatible** with an external Android application using standard HTTP REST and OkHttp native WebSockets. It does **not** rely on proprietary client libraries such as Socket.IO, Firebase Realtime Database, or vendor push locks.

However, several production considerations, payload field alignments, network resilience mechanisms (such as Android OS Doze mode wakeups), and error-code standardizations must be addressed before connecting an independently developed Kotlin Android APK.

---

## 1. CURRENT FRONTEND TECHNOLOGY & PROJECT STRUCTURE

### Technology Stack
- **Framework:** React 19 (`react` 19.0.1, `react-dom` 19.0.1)
- **Bundler / Dev Server:** Vite 8.3.0 mounted into Express server (`server.ts`) via `vite.middlewares` in dev mode
- **Language:** TypeScript 7.0.2 with strict types
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite` 4.3.3, `@import "tailwindcss";`, `@custom-variant dark`)
- **Icons:** `lucide-react` 0.546.0
- **Animation & Visual Feedback:** `motion` 12.23.24, `canvas-confetti`
- **QR Code Rendering:** `qrcode` 1.5.4 (renders directly to HTML5 `<canvas>`)
- **Typography:** Plus Jakarta Sans (UI display & body) + JetBrains Mono (data tables, timestamps, phone numbers)

### Project Structure
```
/
├── index.html                 # HTML shell, viewport, Google Fonts preconnect
├── package.json               # Full-stack dependencies & scripts ("dev": "tsx server.ts")
├── tsconfig.json              # ES2022, bundler module resolution, path aliases
├── vite.config.ts             # Tailwind plugin, React plugin, alias config
├── src/
│   ├── main.tsx               # React DOM root entry
│   ├── index.css              # Global styles, Tailwind v4 imports, typography
│   ├── App.tsx                # Central state orchestrator, tab navigation, WS event dispatcher
│   ├── types/
│   │   └── index.ts           # Shared TypeScript interfaces (User, Device, SmsMessage, etc.)
│   ├── services/
│   │   └── api.ts             # REST client wrapper for /api/v1/*
│   ├── hooks/
│   │   └── useGatewaySocket.ts# WebSocket hook for wss://<host>/user/connect
│   └── components/
│       ├── Navigation.tsx     # Sidebar with live connection indicator and unread counters
│       ├── TopBar.tsx         # Top navigation conforming to Top Bar Contract
│       ├── OverviewView.tsx   # KPI cards, SVG hourly volume chart, telemetry feed
│       ├── DevicesView.tsx    # Device cards, SIM status, WhatsApp Web-style QR pairing modal
│       ├── InboxView.tsx      # Dual-pane conversational SMS client (search, thread, quick reply)
│       ├── SendSmsView.tsx    # Single SMS composer with GSM-7 vs Unicode segment calculator
│       ├── CampaignsView.tsx  # Bulk campaign manager & 4-step campaign creation wizard
│       ├── ContactsView.tsx   # Contact directory, group assignment, opt-out suppression
│       ├── AiSettingsView.tsx # Gemini AI auto-reply editor & prompt sandbox
│       ├── SimulatorView.tsx  # Virtual Android Agent simulator & WebSocket frame inspector
│       └── ApiDocsView.tsx    # Interactive REST endpoint explorer & Kotlin OkHttp guide
```

---

## 2. BACKEND TECHNOLOGY & ARCHITECTURE

### Technology Stack
- **Runtime:** Node.js v22.x
- **Server Framework:** Express 4.21.2 (`server.ts`)
- **WebSocket Server:** Native `ws` 8.18.3 (`server/websocket/wsManager.ts`)
- **Runtime Transpiler:** `tsx` 4.21.0
- **Security & Cryptography:** Node.js native `crypto`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`
- **AI Processing:** `@google/genai` 2.4.0 (`server/services/aiService.ts` using `gemini-3.8-flash`)

### Architectural Pattern
```
                           Client Requests
                                  |
                +-----------------+-----------------+
                |                                   |
         HTTP REST (/api/v1/*)           WebSocket Upgrades
                |                                   |
          Express Router             +--------------+--------------+
                |                    |                             |
      [server/routes/api.ts]   /device/connect               /user/connect
                |             (Android Gateway Agent)     (Web Dashboard Client)
       +--------+-------+            |                             |
       |                |            +--------------+--------------+
       v                v                           |
 Queue Service     AI Service                       v
(queueService.ts) (aiService.ts)          [server/websocket/wsManager.ts]
       |                |                           |
       +--------+-------+                           |
                |                                   |
                +-----------------+-----------------+
                                  |
                                  v
                      Persistence Repository
                     [server/db/database.ts]
                                  |
                     +------------+------------+
                     |                         |
              Disk Persistence            Prisma DDL
            (.data/gateway_db.json)  (prisma/schema.prisma)
```

- **Separation of Concerns:** 
  - `server.ts` bootstraps HTTP, attaches WebSocket upgrade handlers, and serves Vite in dev.
  - `server/routes/api.ts` handles REST endpoints with standardized JSON envelopes (`{ success, data, message }`).
  - `server/websocket/wsManager.ts` acts as the real-time hub, maintaining separate registries for Android devices and browser dashboards.
  - `server/services/queueService.ts` implements persistent queuing, dispatch, retry backoff, and campaign rate limiting.
  - `server/services/aiService.ts` executes server-side Gemini 3.8 Flash model generation, enforcing anti-loop cooldowns and opt-out recognition.

---

## 3. DATABASE TECHNOLOGY & SCHEMA AUDIT

### Implementation
- **Current Runtime Persistence:** A multi-tenant, transactional file-backed persistence engine located in `server/db/database.ts`. Data is serialized atomically to `.data/gateway_db.json` across server restarts and seeded with realistic demo data on initialization.
- **Production PostgreSQL Definition:** A fully indexed PostgreSQL relational schema defined in `prisma/schema.prisma` and mirrored in `prisma/migrations/20261108_init/migration.sql`.

### Complete Table / Entity Inventory

| Entity Name | Primary Key | Key Foreign Keys | Purpose |
|---|---|---|---|
| `users` | `id` (string/uuid) | — | User accounts, auth hashes, verification timestamps |
| `devices` | `id` (string/uuid) | `user_id -> users.id` | Android phones, models, OS versions, SIM slots, batteries |
| `pairing_sessions` | `id` (string/uuid) | `user_id -> users.id` | WhatsApp Web-style pairing secrets, 120s TTL, consumed states |
| `device_credentials` | `id` (string/uuid) | `device_id -> devices.id` | SHA-256 token hashes, credential versions, revocation timestamps |
| `sms_messages` | `id` (string/uuid) | `user_id`, `device_id` | Core SMS ledger (direction, sender, recipient, status, sim slot) |
| `sms_commands` | `id` (string/uuid) | `device_id`, `message_id` | Outbound dispatch commands (`SMS_SEND_COMMAND`), retry counters |
| `contacts` | `id` (string/uuid) | `user_id`, `group_id` | Normalized contact directory, consent status, opt-out timestamps |
| `contact_groups` | `id` (string/uuid) | `user_id` | Organization segments (e.g. VIP Retail Clients) |
| `campaigns` | `id` (string/uuid) | `user_id`, `device_id` | Bulk SMS campaign records, templates, counters, rate limits |
| `campaign_recipients` | `id` (string/uuid) | `campaign_id` | Individual recipient dispatches, status, rendered message IDs |
| `ai_settings` | `id` (string/uuid) | `user_id` (unique) | System instructions, model selection, limits, cooldowns |
| `ai_conversations` | `id` (string/uuid) | `user_id`, `device_id` | Anti-loop counters tracking automated replies per sender |
| `ai_automation_logs` | `id` (string/uuid) | `user_id`, `device_id` | Audit trails of incoming texts, generated responses, latency |
| `device_events` | `id` (string/uuid) | `user_id`, `device_id` | Raw telemetry event history |
| `audit_logs` | `id` (string/uuid) | `user_id` | Critical user and system actions |

---

## 4. EXISTING API ENDPOINTS

All endpoints use the `/api/v1/` route prefix and return standardized JSON.

### Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Creates user, returns session and sets HTTP-only cookie.
- `POST /api/v1/auth/login` — Authenticates email/password, issues session.
- `POST /api/v1/auth/logout` — Clears session cookie.
- `GET /api/v1/auth/me` — Returns current authenticated user profile.
- `POST /api/v1/auth/forgot-password` — Password reset trigger.
- `POST /api/v1/auth/reset-password` — Completes password reset.

### QR Pairing (`/api/v1/pairing`)
- `POST /api/v1/pairing/initiate` — Generates 120s pairing session with SHA-256 secret hash; returns QR payload.
- `POST /api/v1/pairing/confirm` — Android app posts scanned session ID + secret + device hardware details; creates device and issues `device_token`.
- `GET /api/v1/pairing/:id/status` — Returns `PENDING`, `CONFIRMED`, or `EXPIRED`.
- `POST /api/v1/pairing/:id/cancel` — Cancels a pending pairing attempt.

### Device Management (`/api/v1/devices`)
- `GET /api/v1/devices` — Lists user's paired Android devices.
- `GET /api/v1/devices/:id` — Retrieves detailed device info, SIM slots, and battery.
- `PATCH /api/v1/devices/:id` — Renames device.
- `POST /api/v1/devices/:id/disconnect` — Remotely closes WebSocket and sets status to `DISCONNECTED`.
- `POST /api/v1/devices/:id/revoke` — Permanently revokes authorization and terminates connection.

### SMS Core (`/api/v1/sms`)
- `POST /api/v1/sms/inbound` — Ingestion endpoint for inbound SMS forwarded by Android devices. Deduplicates via `event_id`, triggers AI auto-reply, and broadcasts via WebSocket.
- `POST /api/v1/sms/send` — Dispatches outbound SMS to BullMQ/in-memory queue; pushes `SMS_SEND_COMMAND` over WebSocket.
- `GET /api/v1/sms` — Filterable message list (by device, direction, status, search text).
- `GET /api/v1/sms/:id` — Retrieves single message.
- `GET /api/v1/sms/conversations` — Grouped threads by phone number with unread counts and last snippet.
- `GET /api/v1/sms/conversations/:phone_number` — Full conversational thread history.
- `POST /api/v1/sms/:id/retry` — Requeues failed SMS message.

### Campaigns (`/api/v1/campaigns`)
- `POST /api/v1/campaigns` — Creates campaign with template, recipients, rate limit.
- `GET /api/v1/campaigns` — Lists user campaigns.
- `GET /api/v1/campaigns/:id` — Detailed campaign progress and recipient list.
- `POST /api/v1/campaigns/:id/start` — Starts queue worker for campaign.
- `POST /api/v1/campaigns/:id/pause` — Pauses campaign timer.
- `POST /api/v1/campaigns/:id/resume` — Resumes paused campaign.
- `POST /api/v1/campaigns/:id/cancel` — Cancels remaining queued messages.

### Contacts & Groups (`/api/v1/contacts`, `/api/v1/contact-groups`)
- `GET /api/v1/contacts` & `POST /api/v1/contacts` — Contact directory CRUD with phone normalization.
- `PATCH /api/v1/contacts/:id` & `DELETE /api/v1/contacts/:id` — Contact edits.
- `POST /api/v1/contacts/import` — Batch CSV contact import.
- `GET /api/v1/contact-groups` & `POST /api/v1/contact-groups` — Contact segments.

### AI Auto-Reply (`/api/v1/ai`)
- `GET /api/v1/ai/settings` — Returns user's AI instructions, limits, and cooldown settings.
- `PUT /api/v1/ai/settings` — Updates AI settings.
- `POST /api/v1/ai/test` — Interactive sandbox endpoint executing Gemini prompt without sending physical SMS.
- `GET /api/v1/ai/logs` — Audit log of automated responses and generation latencies.

### Analytics & Diagnostics (`/api/v1/analytics`, `/api/v1/dev`, `/api/v1/openapi.json`)
- `GET /api/v1/analytics/overview` — Dashboard summary metrics and hourly charts.
- `GET /api/v1/dev/events` — Live stream of recent WebSocket frames.
- `POST /api/v1/dev/simulate-agent` — Virtual agent simulation controls for testing.
- `GET /api/v1/openapi.json` — Machine-readable OpenAPI 3.0 specification.

---

## 5. AUTHENTICATION IMPLEMENTATION AUDIT

The platform enforces a dual-boundary authentication model:

### Web Dashboard Authentication
- Uses secure HTTP-only cookies (`session_token`) or `Authorization: Bearer <session_token>`.
- Verified on all `/api/v1/*` protected routes via `requireAuth` middleware.
- Resolves the authenticated user ID and enforces strict multi-tenant tenant isolation.

### Android Device Authentication
- Distinct from user authentication; Android never receives or stores the user's password.
- QR pairing issues a high-entropy `device_token` (24 bytes hex).
- Stored as a SHA-256 hash in `device_credentials`.
- Provided during WebSocket handshake via:
  - Header: `Authorization: Bearer <device_token>`
  - Query parameter: `?token=<device_token>` (for clients that cannot set headers during handshake).
- Verified in `server/websocket/wsManager.ts` during HTTP Upgrade. Anonymous connections are rejected with `401 Unauthorized`. Revoked devices are rejected with `403 Forbidden`.

---

## 6. WEBSOCKET IMPLEMENTATION AUDIT

### Endpoints
1. `wss://<host>/device/connect` — Dedicated to Android Gateway Agents.
2. `wss://<host>/user/connect` — Dedicated to Web Dashboard clients.

### Engine Architecture
- Built on Node.js native `ws.WebSocketServer({ noServer: true })`.
- Handles connection upgrades centrally on the Express HTTP server.
- Maintains active in-memory connection registries:
  - `activeDevices: Map<deviceId, AuthenticatedDeviceSocket>`
  - `activeUsers: Map<userId, Set<AuthenticatedUserSocket>>`
- Automated Heartbeat Sweep:
  - Every 20 seconds, sends `PING` envelopes to all connected devices.
  - Checks `lastPing` timestamp; if a device has not responded within 65 seconds, closes socket and updates DB status to `DISCONNECTED`.
  - Android responds with `DEVICE_HEARTBEAT` or `PONG`.

### Supported Event Types

| Event Name | Direction | Payload Summary |
|---|---|---|
| `SMS_SEND_COMMAND` | Backend $\to$ Android | `command_id`, `message_id`, `recipient`, `message_body`, `subscription_id`, `idempotency_key` |
| `PING` / `PONG` | Bidirectional | Connection keep-alive handshake |
| `DEVICE_DISCONNECT` | Backend $\to$ Android | Orders the device to terminate its session |
| `DEVICE_CONNECTED` | Android $\to$ Backend / Backend $\to$ User | Broadcasts device online status |
| `DEVICE_HEARTBEAT` | Android $\to$ Backend | Battery level, charging state, SIM slots signal |
| `COMMAND_ACKNOWLEDGED`| Android $\to$ Backend | Confirms message accepted into phone's local queue |
| `SMS_SENT` | Android $\to$ Backend | Confirms Android `SmsManager` submitted SMS to cellular radio |
| `SMS_DELIVERED` | Android $\to$ Backend | Carrier delivery report received |
| `SMS_FAILED` | Android $\to$ Backend | Error code and failure description |
| `SMS_RECEIVED` | Android $\to$ Backend | Inbound SMS intercepted from cellular network |
| `DEVICE_STATUS` | Android $\to$ Backend | Gateway state transitions (`IDLE`, `SENDING`, `MAINTENANCE`) |

---

## 7. QR PAIRING IMPLEMENTATION AUDIT

1. **Session Generation:** Web client triggers `POST /api/v1/pairing/initiate`. Backend generates a unique session ID and a cryptographically random one-time pairing secret, storing its SHA-256 hash with a strict 120-second expiration.
2. **QR Display:** Frontend receives the JSON payload:
   ```json
   {
     "pairing_session_id": "pair_...",
     "pairing_secret": "sec_...",
     "api_url": "https://api.yourdomain.com/api/v1",
     "ws_url": "wss://api.yourdomain.com/device/connect",
     "expires_at": "ISO-8601"
   }
   ```
   Renders cleanly on a canvas with a live countdown timer.
3. **Confirmation Handshake:** Android app scans the QR code, extracts the payload, and sends `POST /api/v1/pairing/confirm` containing its device model, Android version, app version, and SIM slots.
4. **Token Generation & Binding:** Backend matches the secret hash, marks the session consumed, registers the device under the initiating user's account, creates a persistent device credential, and returns `device_token`.
5. **Real-time UI Transition:** Backend immediately broadcasts `DEVICE_CONNECTED` to the user's WebSocket, triggering confetti and transitioning the UI to connected state without requiring page reload.

---

## 8. DEVICE MANAGEMENT AUDIT

The backend provides complete device lifecycle controls:
- **Telemetry Storage:** Tracks device model, platform, Android OS version, app version, connection status, gateway operational status, carrier name, battery level, charging status, and last heartbeat timestamp.
- **SIM Slot Array:** Explicitly tracks dual-SIM devices with slot index (0, 1), telephony subscription ID, carrier name, and signal level (0–4).
- **Remote Disconnection:** Dispatches `DEVICE_DISCONNECT` event, terminates WebSocket connection, and marks device status `DISCONNECTED`.
- **Permanent Revocation:** Disconnects socket, sets `revoked_at` timestamp, and invalidates credential in `device_credentials`. Subsequent connection attempts are rejected.

---

## 9. SMS SENDING & RECEIVING IMPLEMENTATION AUDIT

### Outbound SMS Flow
1. User posts SMS via web composer (`POST /api/v1/sms/send`).
2. Server validates ownership, checks suppression lists, and records message with status `QUEUED`.
3. `queueService` evaluates whether the assigned Android device is active in `activeDevices`.
4. If online, sends `SMS_SEND_COMMAND` over WebSocket and marks status `DISPATCHED`.
5. Android app sends `COMMAND_ACKNOWLEDGED` $\to$ status remains `DISPATCHED`.
6. Android `SmsManager` reports submission $\to$ Android sends `SMS_SENT` $\to$ status becomes `SENT`.
7. Cellular network returns delivery report $\to$ Android sends `SMS_DELIVERED` $\to$ status becomes `DELIVERED`.
8. If device is offline, message remains safely `QUEUED`. As soon as device connects, `queueService.onDeviceConnected` automatically drains pending commands.

### Inbound SMS Flow
1. Android device receives SMS via `Telephony.Sms.Intents.SMS_RECEIVED_ACTION`.
2. Device forwards SMS to backend via WebSocket (`SMS_RECEIVED`) or REST (`POST /api/v1/sms/inbound`).
3. Server checks `event_id` to guarantee idempotent deduplication.
4. Stores message as `INBOUND` with status `DELIVERED`.
5. Broadcasts `SMS_RECEIVED` to the user's dashboard WebSocket.
6. Invokes `aiService.handleInboundSms` to check for auto-reply rules and opt-out keywords (`STOP`, `UNSUBSCRIBE`, `SITAKI`).

---

## 10. EXTERNAL ANDROID GATEWAY AGENT SUPPORT AUDIT

### Is the current architecture compatible with an external Android application?
**YES.** The backend architecture is natively built to communicate with an external Android application.

### Why it is compatible:
1. Standard WebSocket Protocol: The device endpoint (`/device/connect`) uses RFC 6455 WebSockets, which is the exact protocol implemented by OkHttp's `WebSocketListener`.
2. Standard JSON Envelopes: All commands and reports use standard UTF-8 JSON envelopes with explicit event names, timestamps, and UUIDs.
3. Standard REST Ingestion: Dual inbound ingestion paths (REST fallback `POST /api/v1/sms/inbound` or live WebSocket `SMS_RECEIVED`) accommodate unreliable mobile networks.
4. Decoupled Token Authentication: Devices authenticate using an independent Bearer token; the Android app has zero dependency on web browser session cookies.

---

## 11. IDENTIFIED GAPS & EXACT INTEGRATION REQUIREMENTS

To ensure seamless integration with the independently developed Android SMS Gateway Agent, the following specific technical alignments must be addressed:

| Gap / Area | Existing Implementation | Android App Integration Requirement | Action Needed |
|---|---|---|---|
| **1. Dual-SIM Telephony ID** | Uses `subscription_id` (integer) and `sim_slot` (0 or 1). | Android `SubscriptionManager.getActiveSubscriptionInfoList()` provides integer `subscriptionId`. | Verify that the Android agent passes both `subscription_id` and `sim_slot` in pairing and heartbeat payloads. |
| **2. Android Doze Mode / Background Sleep** | Relies on persistent TCP WebSocket connection with 20s PING. | When Android enters deep Doze mode, the OS may freeze WebSocket sockets unless running as a foreground service with a persistent notification. | Android application must use a Foreground Service (`android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE`) with a permanent notification and `WAKE_LOCK`. |
| **3. Multipart / Concatenated SMS** | Backend computes segments (GSM-7 160 chars vs UCS-2 70 chars). | Long messages (>160 chars) sent via `SmsManager.sendMultipartTextMessage()` generate multiple delivery intents. | Android agent must collect delivery parts and emit a single `SMS_DELIVERED` event once all parts arrive, or emit delivery status per message ID. |
| **4. Error Code Standardization** | Backend recognizes `GATEWAY_ERROR`, `SIM_BUSY`, `RESULT_ERROR_GENERIC_FAILURE`. | Android returns Android SDK constants: `RESULT_ERROR_GENERIC_FAILURE` (1), `RESULT_ERROR_RADIO_OFF` (2), `RESULT_ERROR_NULL_PDU` (3), `RESULT_ERROR_NO_SERVICE` (4), `RESULT_ERROR_LIMIT_EXCEEDED` (5). | Map standard Android `SmsManager` integer and string error codes into uniform backend error descriptions. |
| **5. TLS / SSL Certificate in Development** | Dev server runs on `http://localhost:3000` / `ws://localhost:3000`. | Android 9+ (API 28+) blocks cleartext HTTP/WS traffic by default unless `android:usesCleartextTraffic="true"` or a network security config is provided. | Android app must enable cleartext traffic for local LAN IP testing (e.g. `http://192.168.x.x:3000`), or connect via secure HTTPS/WSS tunnel (`ngrok`, Cloud Run, or VPS). |

---

## 12. CONCLUSION & RECOMMENDATIONS

The existing platform is architecturally sound and ready to interface with the companion Android application. The REST APIs, database schema, and WebSocket event channels adhere to the specifications defined in the system prompt.

No architectural restructuring is required. The generated contract documents below (`API_CONTRACT.md`, `openapi.yaml`, `WEBSOCKET_EVENTS.md`, `DATABASE_SCHEMA.md`) represent the definitive interface standard for the Android engineering team.
