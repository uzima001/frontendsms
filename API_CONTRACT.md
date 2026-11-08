# SMS GATEWAY PLATFORM — SHARED API & WEBSOCKET CONTRACT

**Version:** 1.0.0  
**Target Platform:** Central Backend API & Android SMS Gateway Agent (Kotlin / OkHttp)  
**Base REST URL:** `https://api.yourdomain.com/api/v1`  
**Device WebSocket Endpoint:** `wss://api.yourdomain.com/device/connect`  
**User Dashboard WebSocket Endpoint:** `wss://api.yourdomain.com/user/connect`

---

## 1. COMMUNICATION PHILOSOPHY

1. **Backend as Source of Truth:** The central backend coordinates and records all SMS states, user accounts, and campaigns.
2. **Device as Gateway:** The Android application acts as a hardware gateway executing physical SIM operations (sending SMS via `SmsManager`, intercepting incoming SMS via `BroadcastReceiver`, and reporting delivery intents).
3. **No Direct Web-to-Device Traffic:** The web dashboard communicates exclusively through the backend API and user WebSocket. The Android app communicates exclusively with the backend device endpoints and device WebSocket.

---

## 2. AUTHENTICATION MECHANISMS

- **Web Users:** Authenticate using HTTP-only secure session cookies or `Authorization: Bearer <session_token>`.
- **Android Devices:** Authenticate using a unique `device_token` issued upon successful QR code pairing.
  - When establishing WebSocket connection:  
    Provide `Authorization: Bearer <device_token>` header, or query param `?token=<device_token>`.
  - When calling device REST endpoints (e.g., `/sms/inbound`):  
    Provide `Authorization: Bearer <device_token>` in HTTP headers.

---

## 3. QR PAIRING PROTOCOL (WhatsApp Web Style)

### Step 1: Frontend Initiates Pairing
- **Endpoint:** `POST /api/v1/pairing/initiate`
- **Headers:** `Authorization: Bearer <user_token>`
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "pairing_session_id": "pair_e3b0c44298fc",
    "pairing_secret": "sec_8f498327104b2a9e3d8109",
    "api_url": "https://api.yourdomain.com/api/v1",
    "ws_url": "wss://api.yourdomain.com/device/connect",
    "expires_at": "2026-11-08T12:02:00.000Z"
  },
  "message": "Pairing session initiated"
}
```

### Step 2: Android Agent Scans QR & Confirms Pairing
- **Endpoint:** `POST /api/v1/pairing/confirm`
- **Request Body:**
```json
{
  "pairing_session_id": "pair_e3b0c44298fc",
  "pairing_secret": "sec_8f498327104b2a9e3d8109",
  "device_name": "Samsung Galaxy M13",
  "device_model": "SM-M135F",
  "platform": "ANDROID",
  "android_version": "14",
  "app_version": "1.2.0",
  "carrier_name": "Vodacom Tanzania / Airtel",
  "sim_slots": [
    {
      "slot_index": 0,
      "subscription_id": 1,
      "carrier": "Vodacom Tanzania",
      "phone_number": "+255754892110",
      "signal_level": 4,
      "is_active": true
    },
    {
      "slot_index": 1,
      "subscription_id": 2,
      "carrier": "Airtel Tanzania",
      "phone_number": "+255682411905",
      "signal_level": 3,
      "is_active": true
    }
  ]
}
```

- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "device_id": "dev_7c9f8021ae",
    "device_token": "dev_tok_9918237198a287fbb02931...",
    "ws_endpoint": "/device/connect",
    "message": "Pairing successful. Connect to WebSocket using device_token."
  },
  "message": "Device paired successfully"
}
```

---

## 4. REST API ENDPOINTS SPECIFICATION

All REST requests return a standardized JSON format:
- Success: `{ "success": true, "data": { ... }, "message": "..." }`
- Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`

### A. Inbound SMS Ingestion
- **Method & Path:** `POST /api/v1/sms/inbound`
- **Caller:** Android SMS Gateway Agent
- **Headers:** `Authorization: Bearer <device_token>`
- **Request Body:**
```json
{
  "event_id": "evt_in_6061928",
  "device_id": "dev_7c9f8021ae",
  "sender": "+255762334455",
  "message_body": "What are your business opening hours this weekend?",
  "received_at": "2026-11-08T12:00:15.000Z",
  "sim_slot": 0,
  "subscription_id": 1
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "message_id": "msg_0019283",
    "status": "DELIVERED"
  },
  "message": "Inbound SMS stored successfully"
}
```

### B. Outbound SMS Dispatch
- **Method & Path:** `POST /api/v1/sms/send`
- **Caller:** Web Dashboard / Third-Party API Integrator
- **Headers:** `Authorization: Bearer <user_token>`
- **Request Body:**
```json
{
  "device_id": "dev_7c9f8021ae",
  "recipient": "+255715889900",
  "message_body": "Your appointment is confirmed.",
  "sim_slot": 0,
  "subscription_id": 1,
  "idempotency_key": "unique-client-key-123"
}
```
- **Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "msg_99182",
      "status": "QUEUED"
    },
    "command_id": "cmd_8192301",
    "status": "QUEUED",
    "is_device_online": true
  },
  "message": "SMS queued for dispatch"
}
```

### C. Device Telemetry & Management
- `GET /api/v1/devices` — Returns all registered Android devices.
- `GET /api/v1/devices/:id` — Returns single device record with SIM slots and battery level.
- `PATCH /api/v1/devices/:id` — Renames device (`{ "device_name": "New Name" }`).
- `POST /api/v1/devices/:id/disconnect` — Disconnects device WebSocket remotely.
- `POST /api/v1/devices/:id/revoke` — Invalidation and termination of device token.

### D. Bulk SMS Campaigns
- `POST /api/v1/campaigns` — Creates campaign with template and recipients array.
- `POST /api/v1/campaigns/:id/start` — Starts queue dispatching with configured rate limits.
- `POST /api/v1/campaigns/:id/pause` — Pauses campaign.
- `POST /api/v1/campaigns/:id/resume` — Resumes paused campaign.
- `POST /api/v1/campaigns/:id/cancel` — Cancels remaining queued messages.

### E. AI Auto-Reply & Testing Sandbox
- `GET /api/v1/ai/settings` — Returns user's AI instructions, limits, and cooldown settings.
- `PUT /api/v1/ai/settings` — Updates AI instructions, language, and model configuration.
- `POST /api/v1/ai/test` — Sandbox endpoint executing Gemini prompt without sending physical SMS.
- `GET /api/v1/ai/logs` — Audit log of automated responses and generation latencies.

---

## 5. SHARED WEBSOCKET EVENT CONTRACT

All WebSocket events use this standard JSON envelope:

```json
{
  "event": "EVENT_NAME",
  "event_id": "evt_uuid",
  "device_id": "dev_uuid",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {}
}
```

### A. Events Sent by Backend to Android Device

#### 1. `SMS_SEND_COMMAND`
Dispatched when the backend has an outbound SMS for the Android device to send using a physical SIM.

```json
{
  "event": "SMS_SEND_COMMAND",
  "event_id": "evt_cmd_77192",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {
    "command_id": "cmd_8192301",
    "message_id": "msg_0019283",
    "recipient": "+255715889900",
    "message_body": "Habari Juma, order #9821 has been dispatched.",
    "subscription_id": 1,
    "idempotency_key": "idem_0019283"
  }
}
```

#### 2. `PING`
Sent periodically by backend to verify connection liveness.

```json
{
  "event": "PING",
  "event_id": "ping_9912",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {}
}
```

#### 3. `DEVICE_DISCONNECT`
Sent when the user requests disconnect or authorization is revoked.

```json
{
  "event": "DEVICE_DISCONNECT",
  "event_id": "evt_disc_112",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {
    "reason": "Device authorization revoked by administrator"
  }
}
```

---

### B. Events Sent by Android Device to Backend

#### 1. `DEVICE_HEARTBEAT`
Sent every 30-45 seconds by Android app to report battery level, charging status, and SIM signal.

```json
{
  "event": "DEVICE_HEARTBEAT",
  "event_id": "evt_hb_101",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {
    "battery_level": 88,
    "is_charging": true,
    "sim_slots": [
      {
        "slot_index": 0,
        "subscription_id": 1,
        "carrier": "Vodacom Tanzania",
        "signal_level": 4,
        "is_active": true
      }
    ]
  }
}
```

#### 2. `COMMAND_ACKNOWLEDGED`
Sent immediately after the Android app parses `SMS_SEND_COMMAND` and places it into the Android local queue.

```json
{
  "event": "COMMAND_ACKNOWLEDGED",
  "event_id": "evt_ack_202",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:01.000Z",
  "payload": {
    "command_id": "cmd_8192301",
    "message_id": "msg_0019283"
  }
}
```

#### 3. `SMS_SENT`
Sent when the Android `SmsManager` reports `Activity.RESULT_OK` on the sent intent (message submitted to carrier telephony).

```json
{
  "event": "SMS_SENT",
  "event_id": "evt_sent_303",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:03.000Z",
  "payload": {
    "command_id": "cmd_8192301",
    "message_id": "msg_0019283",
    "recipient": "+255715889900",
    "sim_slot": 0,
    "timestamp": "2026-11-08T12:00:03.000Z"
  }
}
```

#### 4. `SMS_DELIVERED`
Sent when the carrier returns an SMS delivery receipt via the delivery intent.

```json
{
  "event": "SMS_DELIVERED",
  "event_id": "evt_deliv_404",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:08.000Z",
  "payload": {
    "message_id": "msg_0019283",
    "recipient": "+255715889900",
    "delivered_at": "2026-11-08T12:00:08.000Z"
  }
}
```

#### 5. `SMS_FAILED`
Sent when the Android `SmsManager` reports an error (e.g. `RESULT_ERROR_GENERIC_FAILURE`, `RESULT_ERROR_NO_SERVICE`, `RESULT_ERROR_RADIO_OFF`).

```json
{
  "event": "SMS_FAILED",
  "event_id": "evt_fail_505",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:04.000Z",
  "payload": {
    "command_id": "cmd_8192301",
    "message_id": "msg_0019283",
    "error_code": "RESULT_ERROR_GENERIC_FAILURE",
    "error_message": "Network radio reported dispatch failure or insufficient balance"
  }
}
```

#### 6. `SMS_RECEIVED`
Sent when Android intercepts an incoming SMS via `Telephony.Sms.Intents.SMS_RECEIVED_ACTION`.

```json
{
  "event": "SMS_RECEIVED",
  "event_id": "evt_in_606",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:15.000Z",
  "payload": {
    "sender": "+255762334455",
    "message_body": "What are your business opening hours this weekend?",
    "received_at": "2026-11-08T12:00:15.000Z",
    "sim_slot": 0,
    "subscription_id": 1
  }
}
```

---

## 6. ANDROID KOTLIN (OKHTTP) INTEGRATION EXAMPLE

Below is a reference implementation showing how the Android Gateway Agent connects using standard OkHttp `WebSocketListener`:

```kotlin
package com.smsgateway.agent

import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class GatewayWebSocketClient(
    private val serverWsUrl: String, // e.g. "wss://api.yourdomain.com/device/connect"
    private val deviceId: String,
    private val deviceToken: String,
    private val smsListener: SmsCommandListener
) : WebSocketListener() {

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null

    fun connect() {
        val request = Request.Builder()
            .url(serverWsUrl)
            .addHeader("Authorization", "Bearer $deviceToken")
            .build()
        webSocket = client.newWebSocket(request, this)
    }

    override fun onOpen(webSocket: WebSocket, response: Response) {
        println("WebSocket Connected to Gateway Server")
        sendHeartbeat(batteryLevel = 90, isCharging = true)
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
        val json = JSONObject(text)
        val event = json.optString("event")
        val payload = json.optJSONObject("payload") ?: return

        when (event) {
            "SMS_SEND_COMMAND" -> {
                val commandId = payload.getString("command_id")
                val messageId = payload.getString("message_id")
                val recipient = payload.getString("recipient")
                val messageBody = payload.getString("message_body")
                val subId = payload.optInt("subscription_id", 1)

                // 1. Acknowledge receipt
                sendAcknowledge(commandId, messageId)

                // 2. Delegate to Android SmsManager
                smsListener.onSendSmsRequested(commandId, messageId, recipient, messageBody, subId)
            }
            "PING" -> {
                sendPong()
            }
            "DEVICE_DISCONNECT" -> {
                webSocket.close(1000, "Disconnected by server")
            }
        }
    }

    fun sendAcknowledge(commandId: String, messageId: String) {
        val json = JSONObject().apply {
            put("event", "COMMAND_ACKNOWLEDGED")
            put("event_id", "evt_ack_" + System.currentTimeMillis())
            put("device_id", deviceId)
            put("timestamp", java.time.Instant.now().toString())
            put("payload", JSONObject().apply {
                put("command_id", commandId)
                put("message_id", messageId)
            })
        }
        webSocket?.send(json.toString())
    }

    fun reportSmsSent(commandId: String, messageId: String, recipient: String, simSlot: Int) {
        val json = JSONObject().apply {
            put("event", "SMS_SENT")
            put("event_id", "evt_sent_" + System.currentTimeMillis())
            put("device_id", deviceId)
            put("timestamp", java.time.Instant.now().toString())
            put("payload", JSONObject().apply {
                put("command_id", commandId)
                put("message_id", messageId)
                put("recipient", recipient)
                put("sim_slot", simSlot)
            })
        }
        webSocket?.send(json.toString())
    }

    fun reportSmsDelivered(messageId: String, recipient: String) {
        val json = JSONObject().apply {
            put("event", "SMS_DELIVERED")
            put("event_id", "evt_deliv_" + System.currentTimeMillis())
            put("device_id", deviceId)
            put("timestamp", java.time.Instant.now().toString())
            put("payload", JSONObject().apply {
                put("message_id", messageId)
                put("recipient", recipient)
                put("delivered_at", java.time.Instant.now().toString())
            })
        }
        webSocket?.send(json.toString())
    }

    fun sendHeartbeat(batteryLevel: Int, isCharging: Boolean) {
        val json = JSONObject().apply {
            put("event", "DEVICE_HEARTBEAT")
            put("event_id", "evt_hb_" + System.currentTimeMillis())
            put("device_id", deviceId)
            put("timestamp", java.time.Instant.now().toString())
            put("payload", JSONObject().apply {
                put("battery_level", batteryLevel)
                put("is_charging", isCharging)
            })
        }
        webSocket?.send(json.toString())
    }

    fun sendPong() {
        val json = JSONObject().apply {
            put("event", "PONG")
            put("event_id", "pong_" + System.currentTimeMillis())
            put("device_id", deviceId)
            put("timestamp", java.time.Instant.now().toString())
            put("payload", JSONObject())
        }
        webSocket?.send(json.toString())
    }
}

interface SmsCommandListener {
    fun onSendSmsRequested(commandId: String, messageId: String, recipient: String, messageBody: String, subscriptionId: Int)
}
```
