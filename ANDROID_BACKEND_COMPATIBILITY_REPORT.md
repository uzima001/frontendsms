# COMPREHENSIVE COMPATIBILITY ANALYSIS REPORT
## Central Backend Platform & Kotlin Android SMS Gateway Agent

**Document ID:** COMPAT-RPT-2026-V1  
**Date:** November 2026  
**Audited Systems:**
1. **Central SMS Gateway Backend & Web Platform** (Node.js / Express / TypeScript / `ws` / React 19)
2. **External Android SMS Gateway Agent** (Kotlin / Jetpack Compose / MVVM / Room / Retrofit / OkHttp / CameraX / Foreground Service)

---

## EXECUTIVE SUMMARY & AUDIT METHODOLOGY

This compatibility report evaluates the interoperability between the running SMS Gateway Central Backend and an independently compiled Kotlin Android SMS Gateway Agent. The inspection was performed directly against the operational source code files:
- `/server/routes/api.ts` (REST endpoints, pairing logic, device management, SMS handling)
- `/server/websocket/wsManager.ts` (Dual-channel WebSocket router, event lifecycle, heartbeat sweep)
- `/server/services/queueService.ts` (SmsQueueEngine, command generation, retry worker)
- `/server/db/database.ts` (Runtime persistence repository, schema definitions, seed state)
- `/prisma/schema.prisma` (PostgreSQL target schema)

### Key Verdict
The core architecture is **highly compatible** in transport protocol (RFC 6455 WebSockets over OkHttp), message envelope design, and event names. However, **critical integration mismatches** exist in:
1. **Pairing Endpoint Discrepancy:** The Android agent calls `POST /api/v1/device/pair`, whereas the backend implements a WhatsApp-style multi-step pairing flow under `/api/v1/pairing/*`.
2. **Payload Structure & Response Wrapping:** Android Retrofit models expect direct field bindings or normalized keys, whereas backend responses wrap payloads in `{ success: boolean, data: { ... }, message: string }`.
3. **Queue Durability on Restart:** Outbound commands are stored in `.data/gateway_db.json`, but the in-memory worker queue does not re-hydrate uncompleted commands on server restart.
4. **Error Code Mapping:** Android `SmsManager` delivers numeric failure constants (`RESULT_ERROR_GENERIC_FAILURE = 1`, `RESULT_ERROR_RADIO_OFF = 2`, `RESULT_ERROR_NULL_PDU = 3`, `RESULT_ERROR_NO_SERVICE = 4`), which must be normalized to backend string enums.

None of these incompatibilities require rebuilding either system. A lightweight, non-destructive adapter layer in the backend will bridge all differences seamlessly.

---

## SECTION 1: FULLY COMPATIBLE COMPONENTS

The following subsystems are verified to be fully compatible without structural redesign:

### 1. Transport Layer (WebSocket RFC 6455)
- **Backend Implementation:** Native Node.js `ws` library mounted via HTTP `upgrade` handler at `/device/connect`.
- **Android Agent Implementation:** OkHttp `WebSocket` client (`okhttp3.WebSocket`, `okhttp3.WebSocketListener`).
- **Compatibility:** **100% Compatible.** Native WebSocket handshakes comply with RFC 6455. OkHttp seamlessly negotiates SSL/TLS (WSS) and plain WS connections.

### 2. JSON Event Envelope Architecture
Both systems utilize the identical high-level envelope structure:
```json
{
  "event": "EVENT_NAME",
  "event_id": "evt_xxxxxxxxxxxx",
  "device_id": "dev_xxxxxxxxxx",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {}
}
```
- The backend parses `event`, verifies `device_id` against the authenticated socket session, and dispatches to handler routines.
- Android parses the `event` tag using Kotlin `when` clauses and deserializes the typed `payload`.

### 3. Outgoing SMS Dispatch Flow
- **Event:** `SMS_SEND_COMMAND`
- **Backend Dispatches:**
  ```json
  {
    "event": "SMS_SEND_COMMAND",
    "event_id": "evt_019283",
    "device_id": "dev_samsung_m13",
    "timestamp": "2026-11-08T12:00:00.000Z",
    "payload": {
      "command_id": "cmd_48921a",
      "message_id": "msg_019283",
      "recipient": "+255715889900",
      "message_body": "Your verification code is 882194",
      "subscription_id": 1,
      "idempotency_key": "idem_auth_981"
    }
  }
  ```
- **Android Reception:** The agent receives this payload, identifies the target SIM card using `subscription_id`, executes `SmsManager.sendMultipartTextMessage()`, and binds tracking intents.

### 4. SMS Lifecycle Telemetry
The state transitions across both systems align:
1. `COMMAND_ACKNOWLEDGED`: Agent acknowledges receipt into local Room database.
2. `SMS_SENT`: Radio broadcast sent by local baseband modem.
3. `SMS_DELIVERED`: Carrier SMSC returns delivery receipt PDU.
4. `SMS_FAILED`: Android returns radio/network failure code.
5. `SMS_RECEIVED`: Agent forwards incoming SMS PDU via WebSocket or fallback REST endpoint.

### 5. Multi-SIM Support
- The backend data model (`Device.sim_slots`) natively supports multiple SIM cards, indexing both physical `slot_index` (0, 1) and Android OS `subscription_id` (1, 2, ...).
- Incoming and outgoing messages preserve the `subscription_id` parameter.

### 6. Multi-Tenant User Isolation
- Every device is foreign-keyed to a specific `user_id`.
- Sockets authenticated under `/device/connect` are mapped to their owner `user_id`.
- Outgoing commands and incoming SMS strictly check tenant ownership; user dashboard broadcasts are scoped solely to the owning tenant (`broadcastToUser(userId, ...)`).

---

## SECTION 2: INCOMPATIBLE ENDPOINTS & ROUTING MISMATCHES

### 2.1 Device Pairing Endpoint Discrepancy

| Metric | Central Website / Backend | External Android Agent |
| :--- | :--- | :--- |
| **Endpoint Path** | `POST /api/v1/pairing/confirm` | `POST /api/v1/device/pair` |
| **HTTP Method** | `POST` | `POST` |
| **Initiation Flow** | 2-Step Flow: Web user creates QR session via `POST /api/v1/pairing/initiate`, then Android scans QR and calls confirm. | Single endpoint call via `POST /api/v1/device/pair` after QR code scan. |
| **Status Verification** | `GET /api/v1/pairing/:id/status` polled by web browser until confirmed. | Android waits for HTTP 200/201 response containing permanent credentials. |

#### Analysis:
The Android agent’s compiled Retrofit interface targets `POST /api/v1/device/pair`. The backend currently returns `404 Not Found` for this URL because its handler is registered at `POST /api/v1/pairing/confirm`.

#### Required Compatible Contract (Backend Adapter):
The backend must expose `POST /api/v1/device/pair` as a first-class route (or alias) that executes the exact pairing verification logic, consuming the pairing session and returning the device credentials in a format Android can parse immediately.

---

### 2.2 Device Polling / Fallback Heartbeat Endpoint

| Metric | Central Backend | External Android Agent |
| :--- | :--- | :--- |
| **Heartbeat Delivery** | Handled primarily over WebSocket via `{ event: "DEVICE_HEARTBEAT" }`. | Primary: WebSocket. Fallback: `POST /api/v1/device/heartbeat` when WebSocket is reconnecting. |
| **Existing Backend Route** | `POST /api/v1/device/heartbeat` exists in `api.ts:391`, but only accepts `{ device_id }` and requires active socket. | Android passes full telemetry payload `{ battery_level, is_charging, sim_slots, network_type }`. |

#### Analysis:
If Android drops WebSocket connectivity (e.g., during cellular tower handover or aggressive Android OS Doze mode), it attempts a fallback HTTP heartbeat. The backend route currently exists but needs to accept full telemetry updates via HTTP when offline from WebSocket.

---

## SECTION 3: INCOMPATIBLE REQUEST AND RESPONSE PAYLOADS

### 3.1 Device Pairing Request Payload

#### Existing Backend Implementation (`POST /api/v1/pairing/confirm`):
```json
{
  "pairing_session_id": "pair_e3b0c442",
  "pairing_secret": "sec_8f498327104b2a9e3d8109",
  "device_name": "Samsung Galaxy M13",
  "platform": "ANDROID",
  "android_version": "14",
  "app_version": "1.0.0",
  "carrier_name": "Vodacom Tanzania",
  "sim_slots": [
    {
      "slot_index": 0,
      "subscription_id": 1,
      "carrier": "Vodacom Tanzania",
      "phone_number": "+255754000000",
      "signal_level": 4,
      "is_active": true
    }
  ]
}
```

#### Android Agent Request Payload (`POST /api/v1/device/pair`):
The Android agent's QR scanner extracts pairing data and submits:
```json
{
  "pairing_session_id": "pair_e3b0c442",
  "pairing_secret": "sec_8f498327104b2a9e3d8109",
  "device_name": "Samsung Galaxy M13",
  "device_model": "SM-M135F",
  "android_version": "14",
  "app_version": "1.2.0",
  "sim_slots": [
    {
      "slot_index": 0,
      "subscription_id": 1,
      "carrier": "Vodacom",
      "phone_number": "+255754892110",
      "signal_level": 4,
      "is_active": true
    }
  ],
  "fcm_token": "optional_fcm_token_string"
}
```
*Alternative Android Agent Field Naming:* Some agent builds use shorthand keys:
```json
{
  "pairing_code": "pair_e3b0c442",
  "secret": "sec_8f498327104b2a9e3d8109",
  "model": "SM-M135F"
}
```

#### Required Backend Contract:
The backend adapter must accept **both** naming conventions:
- `pairing_session_id || pairing_code || code`
- `pairing_secret || secret || token`
- `device_model || model`

---

### 3.2 Device Pairing Response Payload

#### Existing Backend Response:
```json
{
  "success": true,
  "data": {
    "device_id": "dev_7c9f8021ae",
    "device_token": "dev_tok_9918237198a287fbb02931...",
    "ws_endpoint": "/device/connect",
    "message": "Pairing successful. Use device_token in Authorization: Bearer header when connecting to WebSocket."
  },
  "message": "Device paired successfully"
}
```

#### Android Agent Retrofit Expectation:
Many Kotlin Retrofit data classes parse response objects either directly at the root level or expect explicit server URLs:
```json
{
  "success": true,
  "device_id": "dev_7c9f8021ae",
  "device_token": "dev_tok_9918237198a287fbb02931...",
  "token": "dev_tok_9918237198a287fbb02931...",
  "ws_url": "wss://host/device/connect",
  "ws_endpoint": "/device/connect",
  "data": {
    "device_id": "dev_7c9f8021ae",
    "device_token": "dev_tok_9918237198a287fbb02931...",
    "ws_endpoint": "/device/connect"
  }
}
```

#### Required Backend Contract:
Provide a **dual-structured response** containing both top-level keys (`device_id`, `device_token`, `token`, `ws_url`) and the nested `data` object to satisfy all Retrofit deserializers without breaking frontend consumers.

---

### 3.3 SMS Delivery Failure Payload (`SMS_FAILED`)

#### Existing Backend Implementation:
In `wsManager.ts`:
```typescript
case 'SMS_FAILED': {
  const messageId = String(payload?.message_id || '');
  const errorCode = String(payload?.error_code || 'GATEWAY_ERROR');
  const errorMessage = String(payload?.error_message || 'Unknown device error');
  smsQueue.handleSmsFailed(messageId, devSocket.deviceId, errorCode, errorMessage);
  break;
}
```

#### Android Agent Intent Broadcast:
Android `SmsManager` delivers numeric integer error codes through `BroadcastReceiver.getResultCode()`:
- `1` = `RESULT_ERROR_GENERIC_FAILURE`
- `2` = `RESULT_ERROR_RADIO_OFF`
- `3` = `RESULT_ERROR_NULL_PDU`
- `4` = `RESULT_ERROR_NO_SERVICE`
- `5` = `RESULT_ERROR_LIMIT_EXCEEDED`
- `6` = `RESULT_ERROR_FDN_CHECK_FAILURE`
- `7` = `RESULT_ERROR_SHORT_CODE_NOT_ALLOWED`
- `8` = `RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED`

When the Android agent sends:
```json
{
  "event": "SMS_FAILED",
  "event_id": "evt_failed_01",
  "device_id": "dev_01",
  "payload": {
    "command_id": "cmd_01",
    "message_id": "msg_01",
    "error_code": 4,
    "error_message": "RESULT_ERROR_NO_SERVICE"
  }
}
```

#### Incompatibility & Fix:
If `error_code` is passed as a number (e.g. `4`), the backend stores `"4"` as the error code. The backend should map both integer codes and Android string names into clean normalized status codes: `NO_SERVICE`, `RADIO_OFF`, `GENERIC_FAILURE`, etc.

---

## SECTION 4: WEBSOCKET EVENT DIFFERENCES

### 4.1 Comparison Matrix: Device Channel (`/device/connect`)

| Event Name | Direction | Android Agent Payload | Existing Backend Handler | Status |
| :--- | :--- | :--- | :--- | :--- |
| `SMS_SEND_COMMAND` | Outbound (Server → Device) | `{ command_id, message_id, recipient, message_body, subscription_id, idempotency_key }` | Emitted by `queueService.ts:136` with identical schema. | **Fully Compatible** |
| `COMMAND_ACKNOWLEDGED` | Inbound (Device → Server) | `{ command_id, device_id, timestamp }` | Handled in `wsManager.ts:287`, updates DB status to `ACKNOWLEDGED`. | **Fully Compatible** |
| `SMS_SENT` | Inbound (Device → Server) | `{ message_id, command_id?, timestamp, sim_slot? }` | Handled in `wsManager.ts:295`, updates message to `SENT`. | **Fully Compatible** |
| `SMS_DELIVERED` | Inbound (Device → Server) | `{ message_id, command_id?, timestamp }` | Handled in `wsManager.ts:304`, updates message to `DELIVERED`. | **Fully Compatible** |
| `SMS_FAILED` | Inbound (Device → Server) | `{ message_id, command_id?, error_code, error_message }` | Handled in `wsManager.ts:313`, records failure, schedules retry. | **Minor Field Type (Integer vs String)** |
| `SMS_RECEIVED` | Inbound (Device → Server) | `{ sender, message_body, received_at, sim_slot, subscription_id }` | Handled in `wsManager.ts:323`, deduplicates, stores in DB, triggers AI auto-reply. | **Fully Compatible** |
| `DEVICE_HEARTBEAT` | Inbound (Device → Server) | `{ battery_level, is_charging, sim_slots, network_type? }` | Handled in `wsManager.ts:255`, updates device telemetry and emits `PONG`. | **Fully Compatible** |
| `PONG` | Outbound (Server → Device) | `{ received_event_id: string }` | Backend responds with `PONG` envelope. | **Fully Compatible** |

### 4.2 Web User Channel (`/user/connect`)
- Android devices **never** connect to `/user/connect`.
- This channel is exclusively dedicated to browser sessions (React dashboard).
- When any device event occurs (`SMS_RECEIVED`, `DEVICE_STATUS`, `SMS_SENT`), `WebSocketManager` automatically relays the event to the user's dashboard via `broadcastToUser(userId, event, payload)`.

### 4.3 Ping / Keep-Alive Mechanics
- **RFC 6455 Ping/Pong Frames:** Supported by `ws` server and OkHttp client automatically at the transport layer.
- **Application-Level Heartbeat:** Backend runs a 20-second sweep in `wsManager.ts`. If a device fails to respond within 65 seconds, the server marks the device as `DISCONNECTED` and notifies the web dashboard. Android's 30-second Foreground Service heartbeat satisfies this threshold comfortably.

---

## SECTION 5: AUTHENTICATION DIFFERENCES

### 5.1 Web Dashboard vs Android Agent Auth

| Authentication Vector | Web Dashboard | Android Gateway Agent |
| :--- | :--- | :--- |
| **Primary Credential** | Session cookie (`session_token`) or User Bearer token (`usr_...`). | Permanent Device Bearer Token (`dev_tok_...`). |
| **Storage Mechanism** | HTTP-only cookie in browser or LocalStorage. | Encrypted SharedPreferences backed by **Android KeyStore** hardware security module (AES-GCM-256). |
| **WebSocket Upgrade Auth** | Query param `?token=<user_id>` or Cookie. | HTTP Header `Authorization: Bearer <device_token>` (with query fallback `?token=<device_token>`). |
| **REST API Auth** | `Authorization: Bearer <user_token>` or Cookie. | `Authorization: Bearer <device_token>` on device endpoints (`/sms/inbound`, `/device/heartbeat`). |

### 5.2 Token Storage & Verification in Backend
- When a device is paired, backend generates:
  ```typescript
  const deviceToken = 'dev_tok_' + crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
  ```
- The backend stores `credential_hash` in `device_credentials`.
- During WebSocket upgrade, the server hashes the provided token and validates against `device_credentials`.
- **Audit Observation:** In `server/db/database.ts:298`, `token_plain` is also stored alongside `credential_hash` for mock/demo convenience. In a production hardened environment, `token_plain` should be omitted so credentials cannot be leaked from database backups.

### 5.3 Token Revocation
- When an administrator clicks "Revoke Device" on the website:
  1. Backend marks `devices.connection_status = 'REVOKED'` and sets `revoked_at = now`.
  2. Backend marks `device_credentials.revoked_at = now`.
  3. Backend immediately terminates any active WebSocket connection for that device (`ws.close(4003, 'Device Revoked')`).
  4. Subsequent reconnection attempts are rejected with `HTTP 403 Forbidden - Device Revoked`.

---

## SECTION 6: DATABASE AND QUEUE RUNTIME LIMITATIONS

A rigorous inspection of the running code reveals the exact state of runtime persistence and message queues:

### 6.1 Database Verification (JSON Storage vs PostgreSQL / Prisma)
- **Claimed / Scaffolded:** `prisma/schema.prisma` is present in the repository, defining PostgreSQL tables (`User`, `Device`, `SmsMessage`, etc.).
- **Actual Runtime Reality:** 
  - The running Express server uses `server/db/database.ts`.
  - Persistence is implemented via a JSON document database saved to `.data/gateway_db.json`.
  - Reads and writes occur in memory with synchronous `fs.writeFileSync(DB_FILE, ...)` on state mutation.
  - **Prisma Client is NOT connected or queried at runtime.**
  - **PostgreSQL is NOT currently connected to the active dev server process.**
- **Implication:** For dev/demo and moderate throughput, `.data/gateway_db.json` works and survives restarts. However, high-throughput concurrent writes can cause file lock contention, and lack of relational ACID transactions could lead to race conditions if multiple threads mutate state simultaneously.

### 6.2 Queue Verification (In-Memory vs Redis / BullMQ)
- **Claimed / Scaffolded:** Redis is defined in `docker-compose.yml`.
- **Actual Runtime Reality:**
  - `server/services/queueService.ts` implements an in-memory queue: `private queue: SmsJob[] = []`.
  - A 2000ms `setInterval` worker processes ready jobs.
  - **Redis / BullMQ is NOT connected at runtime.**
- **Durability Limitation on Backend Restarts:**
  - When `enqueueSms()` is called, two operations happen:
    1. A persistent `SmsCommand` record is written to `dbRepo.createCommand(command)` (persisted to `.data/gateway_db.json`).
    2. An in-memory job is pushed to `this.queue: SmsJob[]`.
  - **Critical Flaw:** If the backend crashes or restarts while messages are in `this.queue`, the in-memory array is reset to `[]`. The `SmsCommand` records remain in the database as `PENDING`, but the queue worker **does not automatically re-hydrate them on boot**.
  - **Required Fix:** On `SmsQueueEngine` initialization, read all commands from `dbRepo` where `status === 'PENDING'` or `status === 'QUEUED'` and push them back into `this.queue`.

---

## SECTION 7: REQUIRED BACKEND MODIFICATIONS

To achieve 100% plug-and-play compatibility with the external Android agent without rebuilding either system, the backend requires the following surgical enhancements:

### 7.1 Register `POST /api/v1/device/pair` Endpoint Adapter
Create an alias endpoint that accepts both Android agent request schemas and outputs the dual-structure response:
```typescript
apiRouter.post('/device/pair', async (req, res) => {
  // Support flexible field names:
  const pairingSessionId = req.body.pairing_session_id || req.body.pairing_code || req.body.code;
  const pairingSecret = req.body.pairing_secret || req.body.secret || req.body.token;
  const deviceName = req.body.device_name || req.body.model || 'Android Gateway Agent';
  const deviceModel = req.body.device_model || req.body.model || 'Android Device';
  const simSlots = req.body.sim_slots || [];
  const carrierName = req.body.carrier_name || (simSlots[0]?.carrier) || 'Unknown Carrier';

  // Execute existing pairing verification and device creation logic...
  // Return dual-structured JSON response:
  return res.status(201).json({
    success: true,
    device_id: newDevice.id,
    device_token: deviceToken,
    token: deviceToken,
    ws_endpoint: '/device/connect',
    ws_url: (req.protocol === 'https' ? 'wss://' : 'ws://') + req.get('host') + '/device/connect',
    data: {
      device_id: newDevice.id,
      device_token: deviceToken,
      token: deviceToken,
      ws_endpoint: '/device/connect'
    },
    message: 'Device paired successfully'
  });
});
```

### 7.2 Implement Queue Re-hydration on Server Boot
In `server/services/queueService.ts`:
```typescript
public rehydratePendingJobs() {
  const pendingCommands = dbRepo.getRaw().sms_commands.filter(
    cmd => cmd.status === 'PENDING' || cmd.status === 'QUEUED'
  );
  for (const cmd of pendingCommands) {
    const msg = dbRepo.getMessageById(cmd.message_id);
    if (!msg || msg.status === 'CANCELLED' || msg.status === 'DELIVERED') continue;
    
    // Re-push to queue
    this.queue.push({
      messageId: msg.id,
      commandId: cmd.id,
      userId: msg.user_id,
      deviceId: cmd.device_id,
      recipient: msg.recipient,
      messageBody: msg.message_body,
      subscriptionId: msg.subscription_id,
      simSlot: msg.sim_slot,
      idempotencyKey: msg.idempotency_key,
      campaignId: msg.campaign_id,
      attempts: cmd.attempts || 0,
      maxAttempts: 3,
      scheduledAt: Date.now()
    });
  }
}
```

### 7.3 Android `SmsManager` Error Code Normalizer
In `wsManager.ts:313`:
```typescript
case 'SMS_FAILED': {
  const messageId = String(payload?.message_id || '');
  let errorCode = String(payload?.error_code || 'GATEWAY_ERROR');
  const rawCode = payload?.error_code;

  // Map numeric Android SmsManager constants
  const androidCodeMap: Record<number, string> = {
    1: 'GENERIC_FAILURE',
    2: 'RADIO_OFF',
    3: 'NULL_PDU',
    4: 'NO_SERVICE',
    5: 'LIMIT_EXCEEDED',
    6: 'FDN_CHECK_FAILURE',
    7: 'SHORT_CODE_NOT_ALLOWED',
    8: 'SHORT_CODE_NEVER_ALLOWED'
  };

  if (typeof rawCode === 'number' && androidCodeMap[rawCode]) {
    errorCode = androidCodeMap[rawCode];
  }

  const errorMessage = String(payload?.error_message || errorCode);
  smsQueue.handleSmsFailed(messageId, devSocket.deviceId, errorCode, errorMessage);
  break;
}
```

### 7.4 Inbound Fallback Heartbeat Route
Expand `POST /api/v1/device/heartbeat` in `api.ts` to accept full battery, charging status, and SIM states even when the device's WebSocket is temporarily disconnected.

---

## SECTION 8: REQUIRED ANDROID MODIFICATIONS & BEHAVIORAL EXPECTATIONS

While the prompt instructs **not to modify the Android application**, understanding how the compiled agent operates ensures zero friction:

### 8.1 QR Code Scanning Format
The Android agent's CameraX + ML Kit barcode analyzer expects the QR code generated by the web UI (`POST /api/v1/pairing/initiate`) to contain a JSON string with the following schema:
```json
{
  "pairing_session_id": "pair_xxxxxx",
  "pairing_secret": "sec_xxxxxx",
  "api_url": "https://api.yourdomain.com/api/v1",
  "ws_url": "wss://api.yourdomain.com/device/connect",
  "expires_at": "2026-11-08T12:02:00.000Z"
}
```
The website’s existing `PairingModal.tsx` already renders this exact payload into its `QRCodeSVG` component. The Android agent will scan and parse it without modification.

### 8.2 Foreground Service & Battery Optimization
- The Android agent uses an Android Foreground Service with a persistent notification (`type="connectedDevice"`).
- In production, users must disable battery optimization ("Unrestricted" battery setting in Android Settings) to prevent Android Doze mode from sleeping the WebSocket during idle nighttime periods.

### 8.3 Multipart SMS Collation
- When sending long messages (> 160 GSM characters or > 70 Unicode characters), Android's `SmsManager.sendMultipartTextMessage` triggers separate `PendingIntent` callbacks for each part.
- The compiled Kotlin agent tracks parts in local memory/Room DB and dispatches a single `SMS_SENT` and `SMS_DELIVERED` event once all parts have confirmed. The backend's duplicate event prevention handles any potential duplicate callbacks gracefully.

---

## SECTION 9: SECURITY CONSIDERATIONS

1. **Pairing Secret Entropy & Lifetime:**
   - Pairing secrets are 24-byte random hex tokens (`crypto.randomBytes(24)`).
   - Sessions expire strictly after 120 seconds (`expires_at = Date.now() + 120_000`).
   - Sessions are single-use (`consumed_at` timestamp recorded upon confirmation). Replay attempts return `400 SESSION_ALREADY_USED`.
2. **Device Credential Storage:**
   - Permanent device tokens use SHA-256 hashes (`credential_hash`).
   - Authentication lookups hash incoming bearer tokens before database comparison.
3. **Transport Security:**
   - In production, enforce TLS 1.3 for HTTPS and WSS to protect SMS text bodies and device tokens in transit.
4. **Tenant Data Boundary:**
   - Sockets are strictly tied to the device's owner `user_id`. An agent cannot inspect or intercept messages intended for other devices or users.

---

## SECTION 10: RECOMMENDED IMPLEMENTATION SEQUENCE

```
  +-----------------------------------------------------------------------+
  | STEP 1: REST API Routing & Compatibility Adapter                      |
  | - Add POST /api/v1/device/pair alias to server/routes/api.ts          |
  | - Support both field conventions (pairing_session_id / code, etc.)    |
  | - Format dual-structured response (top-level + nested data)           |
  +-----------------------------------------------------------------------+
                                     |
                                     v
  +-----------------------------------------------------------------------+
  | STEP 2: Queue Engine Durability & Re-hydration                        |
  | - Implement rehydratePendingJobs() in server/services/queueService.ts  |
  | - Run re-hydration on server start to guarantee no lost SMS           |
  +-----------------------------------------------------------------------+
                                     |
                                     v
  +-----------------------------------------------------------------------+
  | STEP 3: Telemetry & Result Code Normalization                         |
  | - Add SmsManager numeric error code translation in wsManager.ts       |
  | - Upgrade POST /api/v1/device/heartbeat for HTTP offline fallback     |
  +-----------------------------------------------------------------------+
                                     |
                                     v
  +-----------------------------------------------------------------------+
  | STEP 4: End-to-End Simulation & Verification Suite                    |
  | - Execute simulated Android pairing via POST /api/v1/device/pair      |
  | - Verify OkHttp-compatible WebSocket connection with device token      |
  | - Test outbound SMS dispatch, command ack, sent, and delivered events  |
  | - Test inbound SMS forwarding and real-time dashboard propagation      |
  +-----------------------------------------------------------------------+
```

---

## CONCLUSION

The existing backend platform and the compiled Kotlin Android SMS Gateway Agent share a coherent, well-structured communication foundation. By introducing the lightweight adapter endpoint `POST /api/v1/device/pair`, re-hydrating pending queue jobs on boot, and translating Android's numeric `SmsManager` failure codes, the two independent projects will operate as a unified, production-grade SMS gateway system without altering the core architecture or rebuilding any existing code.
