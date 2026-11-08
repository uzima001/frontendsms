# WEBSOCKET PROTOCOL SPECIFICATION & EVENT CONTRACT

**Version:** 1.0.0  
**Transport:** Standard RFC 6455 WebSocket (`ws://` / `wss://`)  
**Encoding:** JSON UTF-8  

This document specifies the real-time bidirectional communication protocol between:
1. **The Backend Server** and **Android SMS Gateway Agents** (`/device/connect`)
2. **The Backend Server** and **Web Dashboard Clients** (`/user/connect`)

---

## 1. ENDPOINTS & HANDSHAKE AUTHENTICATION

### A. Android Device Connection: `/device/connect`
- **URL:** `wss://api.yourdomain.com/device/connect`
- **Authentication:** Must provide the permanent `device_token` issued during QR pairing.
  - **Preferred:** HTTP Header `Authorization: Bearer <device_token>` during WebSocket upgrade.
  - **Fallback:** URL Query Parameter `?token=<device_token>` during WebSocket upgrade.
- **Handshake Response:**
  - `101 Switching Protocols` — Connection authorized and active.
  - `401 Unauthorized` — Missing or unparseable device token.
  - `403 Forbidden` — Token invalid or device revoked by account owner.

### B. Web Dashboard Connection: `/user/connect`
- **URL:** `wss://api.yourdomain.com/user/connect`
- **Authentication:** Authenticates via HTTP-only session cookie or `?token=<session_token>`.
- **Purpose:** Receives live notifications of inbound SMS, device battery/heartbeats, delivery status, and campaign progress.

---

## 2. STANDARD EVENT ENVELOPE

Every message sent across the WebSocket MUST be wrapped in this JSON envelope:

```json
{
  "event": "EVENT_NAME",
  "event_id": "evt_uuid_v4",
  "device_id": "dev_uuid_v4",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {}
}
```

### Envelope Fields:
- `event` (string, required): The event name in uppercase snake case.
- `event_id` (string, required): Globally unique identifier for this transmission (used for deduplication).
- `device_id` (string, required): The UUID of the authenticated Android device.
- `timestamp` (string, required): ISO-8601 UTC timestamp.
- `payload` (object, required): Event-specific data object.

---

## 3. EVENTS: BACKEND $\longrightarrow$ ANDROID AGENT

### 1. `SMS_SEND_COMMAND`
Dispatched when the backend has an outbound SMS ready to be transmitted via the phone's physical SIM card.

```json
{
  "event": "SMS_SEND_COMMAND",
  "event_id": "evt_cmd_8829102",
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

#### Android Agent Responsibilities:
1. Parse command and immediately return `COMMAND_ACKNOWLEDGED`.
2. Inspect `subscription_id` to route to the correct physical SIM card.
3. Call `SmsManager.getSmsManagerForSubscriptionId(subscriptionId).sendTextMessage(...)`.
4. Listen for `SentIntent` and emit `SMS_SENT` or `SMS_FAILED`.
5. Listen for `DeliveryIntent` and emit `SMS_DELIVERED` when the carrier confirms delivery.

---

### 2. `PING`
Sent every 20 seconds by the backend to verify the socket is healthy.

```json
{
  "event": "PING",
  "event_id": "ping_99120",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {}
}
```

#### Android Agent Responsibilities:
- Immediately reply with `PONG` or a `DEVICE_HEARTBEAT` payload.

---

### 3. `DEVICE_DISCONNECT`
Sent when the account owner disconnects or revokes the device from the dashboard.

```json
{
  "event": "DEVICE_DISCONNECT",
  "event_id": "evt_disc_1120",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {
    "reason": "Revoked by user"
  }
}
```

#### Android Agent Responsibilities:
- Close WebSocket with status code `1000`. Do not attempt reconnection.

---

## 4. EVENTS: ANDROID AGENT $\longrightarrow$ BACKEND

### 1. `DEVICE_CONNECTED`
Sent upon initial WebSocket connection.

```json
{
  "event": "DEVICE_CONNECTED",
  "event_id": "evt_conn_01",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:00.000Z",
  "payload": {
    "app_version": "1.2.0",
    "battery_level": 92
  }
}
```

---

### 2. `DEVICE_HEARTBEAT`
Sent periodically (every 30 seconds) by the Android Agent.

```json
{
  "event": "DEVICE_HEARTBEAT",
  "event_id": "evt_hb_301",
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
      },
      {
        "slot_index": 1,
        "subscription_id": 2,
        "carrier": "Airtel Tanzania",
        "signal_level": 3,
        "is_active": true
      }
    ]
  }
}
```

---

### 3. `COMMAND_ACKNOWLEDGED`
Confirms the Android application has parsed `SMS_SEND_COMMAND` and placed it into its local queue.

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

---

### 4. `SMS_SENT`
Confirms that the telephony system accepted the SMS into the cell radio.

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

---

### 5. `SMS_DELIVERED`
Confirms that the cellular carrier returned an SMS delivery report.

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

---

### 6. `SMS_FAILED`
Reports that the dispatch failed at the hardware or carrier level.

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
    "error_message": "Network radio reported dispatch failure or airtime exhausted"
  }
}
```

---

### 7. `SMS_RECEIVED`
Emitted when the Android phone receives an inbound SMS via cellular broadcast.

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

## 5. OUTBOUND SMS MESSAGE LIFECYCLE (STATE MACHINE)

```
[ User clicks Send / Campaign starts ]
                 |
                 v
             [ QUEUED ] (Saved in database, pending in queue)
                 |
                 v (Backend delivers SMS_SEND_COMMAND to Device WebSocket)
           [ DISPATCHED ]
                 |
                 v (Android emits COMMAND_ACKNOWLEDGED)
          [ ACKNOWLEDGED ]
                 |
        +--------+--------+
        |                 |
(Android emits      (Android emits
  SMS_SENT)           SMS_FAILED)
        |                 |
        v                 v
     [ SENT ]         [ FAILED ]
        |
        v (Carrier reports delivery intent: SMS_DELIVERED)
   [ DELIVERED ]
```

---

## 6. TIMEOUTS, HEARTBEAT SWEEP & RECONNECTION

1. **Keep-Alive Interval:** Backend sends `PING` every 20 seconds.
2. **Disconnection Detection:** If no message or heartbeat is received from a device within 65 seconds, the server terminates the TCP socket and transitions device status to `DISCONNECTED`.
3. **Android Client Reconnection Policy:**
   - If the WebSocket closes unexpectedly or network drops, Android Agent MUST reconnect using exponential backoff:
     - 1st retry: 2 seconds
     - 2nd retry: 5 seconds
     - 3rd retry: 10 seconds
     - Maximum retry ceiling: 30 seconds
   - Upon reconnection, pending outbound messages retained in backend queues automatically drain to the device in FIFO order.
