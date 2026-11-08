# DATABASE SCHEMA SPECIFICATION

**Database Engine:** PostgreSQL 16 / CockroachDB compatible  
**ORM / Schema Definition:** Prisma (`prisma/schema.prisma`)  
**Runtime In-Memory Persistence:** Transactional atomic JSON (`server/db/database.ts` at `.data/gateway_db.json`)

---

## 1. ENTITY RELATIONSHIP OVERVIEW

```
  users (1) ───< devices (N) ───< sms_commands (N)
    │                │
    │                └───< device_credentials (N)
    │                └───< device_events (N)
    │
    ├───< pairing_sessions (N)
    ├───< sms_messages (N) ───< sms_commands (N)
    ├───< contacts (N) ───> contact_groups (1)
    ├───< campaigns (N) ───< campaign_recipients (N)
    ├───< ai_settings (1)
    ├───< ai_conversations (N)
    ├───< ai_automation_logs (N)
    └───< audit_logs (N)
```

---

## 2. DETAILED TABLE SCHEMAS

### 1. `users`
Represents customer/tenant accounts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | PRIMARY KEY | Unique user identifier (e.g. `usr_...`) |
| `name` | `VARCHAR(255)` | NOT NULL | User's full name |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | Account email address |
| `password_hash` | `VARCHAR(255)` | NOT NULL | Password hash (Argon2id or SHA-256) |
| `email_verified_at`| `TIMESTAMP` | NULL | Verification timestamp |
| `status` | `VARCHAR(32)` | DEFAULT 'ACTIVE' | `ACTIVE`, `SUSPENDED`, `PENDING` |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Record creation timestamp |
| `updated_at` | `TIMESTAMP` | NOT NULL | Record last update timestamp |

**Indexes:**
- `INDEX ON (email)`

---

### 2. `devices`
Represents physical Android smartphones acting as SMS gateways.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | PRIMARY KEY | Unique device identifier (e.g. `dev_...`) |
| `user_id` | `VARCHAR(36)` | FOREIGN KEY (`users.id`) | Tenant owner ID (CASCADE delete) |
| `device_name` | `VARCHAR(255)` | NOT NULL | User-assigned label (e.g. "Samsung Galaxy M13") |
| `device_model` | `VARCHAR(255)` | NOT NULL | Hardware model (e.g. "SM-M135F") |
| `platform` | `VARCHAR(32)` | DEFAULT 'ANDROID' | Operating system |
| `android_version`| `VARCHAR(32)` | NOT NULL | Android release (e.g. "14 (API 34)") |
| `app_version` | `VARCHAR(32)` | NOT NULL | Companion Agent version (e.g. "1.2.0") |
| `connection_status`| `VARCHAR(32)`| DEFAULT 'DISCONNECTED'| `CONNECTED`, `DISCONNECTED`, `REVOKED`, `ERROR` |
| `gateway_status` | `VARCHAR(32)`| DEFAULT 'IDLE' | `IDLE`, `SENDING`, `MAINTENANCE`, `OFFLINE` |
| `sim_status` | `VARCHAR(32)` | DEFAULT 'ACTIVE' | `ACTIVE`, `ABSENT`, `RESTRICTED` |
| `carrier_name` | `VARCHAR(255)` | NOT NULL | Carrier display string (e.g. "Vodacom TZ") |
| `battery_level` | `INTEGER` | DEFAULT 100 | Battery charge level (0–100%) |
| `last_heartbeat_at`| `TIMESTAMP` | NULL | Timestamp of last received ping/heartbeat |
| `connected_at` | `TIMESTAMP` | NULL | Initial or latest connection time |
| `revoked_at` | `TIMESTAMP` | NULL | Timestamp when device authorization was revoked |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Registration date |
| `updated_at` | `TIMESTAMP` | NOT NULL | Last update timestamp |

**Indexes:**
- `INDEX ON (user_id)`
- `INDEX ON (connection_status)`

---

### 3. `pairing_sessions`
Stores transient WhatsApp Web-style pairing requests.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | PRIMARY KEY | Pairing session ID (e.g. `pair_...`) |
| `user_id` | `VARCHAR(36)` | FOREIGN KEY (`users.id`) | Initiating web user |
| `pairing_secret_hash` | `VARCHAR(255)` | NOT NULL | SHA-256 hash of single-use secret |
| `status` | `VARCHAR(32)` | DEFAULT 'PENDING' | `PENDING`, `CONFIRMED`, `EXPIRED`, `CANCELLED` |
| `expires_at` | `TIMESTAMP` | NOT NULL | Hard expiration (exactly 120s from creation) |
| `consumed_at`| `TIMESTAMP` | NULL | Timestamp when scanned and confirmed |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Session creation timestamp |

**Indexes:**
- `INDEX ON (user_id)`
- `INDEX ON (status)`

---

### 4. `device_credentials`
Stores permanent authorization credentials for Android devices.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | PRIMARY KEY | Credential record ID |
| `device_id` | `VARCHAR(36)` | FOREIGN KEY (`devices.id`) | Associated Android phone |
| `credential_hash` | `VARCHAR(255)` | UNIQUE, NOT NULL | SHA-256 hash of `device_token` |
| `credential_version`| `INTEGER` | DEFAULT 1 | For credential rotation |
| `expires_at` | `TIMESTAMP` | NULL | Expiration (null = persistent) |
| `revoked_at` | `TIMESTAMP` | NULL | Invalidation timestamp |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- `INDEX ON (device_id)`
- `UNIQUE INDEX ON (credential_hash)`

---

### 5. `sms_messages`
The single source of truth for all incoming and outgoing SMS.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | PRIMARY KEY | Message identifier (e.g. `msg_...`) |
| `user_id` | `VARCHAR(36)` | FOREIGN KEY (`users.id`) | Account owner |
| `device_id` | `VARCHAR(36)` | FOREIGN KEY (`devices.id`) | Relaying Android gateway |
| `direction` | `VARCHAR(16)` | NOT NULL | `INBOUND` or `OUTBOUND` |
| `sender` | `VARCHAR(64)` | NOT NULL | Mobile number or device identifier |
| `recipient` | `VARCHAR(64)` | NOT NULL | Destination phone number |
| `message_body` | `TEXT` | NOT NULL | Raw SMS content |
| `status` | `VARCHAR(32)` | DEFAULT 'QUEUED' | `QUEUED`, `DISPATCHED`, `SENT`, `DELIVERED`, `FAILED`, `CANCELLED` |
| `sim_slot` | `INTEGER` | DEFAULT 0 | 0 for SIM 1, 1 for SIM 2 |
| `subscription_id` | `INTEGER` | DEFAULT 1 | Android telephony subscription identifier |
| `idempotency_key` | `VARCHAR(128)`| NULL | Unique client deduplication key |
| `source_event_id` | `VARCHAR(128)`| NULL | Android event ID for inbound deduplication |
| `campaign_id` | `VARCHAR(36)` | NULL | Associated campaign ID if bulk |
| `error_code` | `VARCHAR(64)` | NULL | Error code if failed |
| `error_message` | `TEXT` | NULL | Detailed error description |
| `received_at` | `TIMESTAMP` | NULL | Inbound receipt timestamp |
| `sent_at` | `TIMESTAMP` | NULL | Timestamp when Android submitted to telephony |
| `delivered_at` | `TIMESTAMP` | NULL | Timestamp when carrier returned delivery report |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Record creation |

**Indexes:**
- `INDEX ON (user_id, created_at)`
- `INDEX ON (device_id, status)`
- `INDEX ON (recipient)`
- `INDEX ON (sender)`
- `UNIQUE INDEX ON (idempotency_key)`
- `UNIQUE INDEX ON (source_event_id)`

---

### 6. `sms_commands`
Tracks individual dispatch orders sent to devices.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | PRIMARY KEY | Command ID (`cmd_...`) |
| `device_id` | `VARCHAR(36)` | FOREIGN KEY (`devices.id`) | Target Android phone |
| `message_id` | `VARCHAR(36)` | FOREIGN KEY (`sms_messages.id`)| Associated SMS message |
| `command_type` | `VARCHAR(64)` | DEFAULT 'SMS_SEND_COMMAND' | Command enum |
| `payload` | `JSONB / JSON` | NOT NULL | Full command JSON envelope |
| `status` | `VARCHAR(32)` | DEFAULT 'PENDING' | `PENDING`, `DISPATCHED`, `ACKNOWLEDGED`, `COMPLETED`, `FAILED` |
| `attempts` | `INTEGER` | DEFAULT 0 | Transmission attempt count |
| `acknowledged_at` | `TIMESTAMP` | NULL | Acknowledgment timestamp |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Command creation |
| `updated_at` | `TIMESTAMP` | NOT NULL | Last status update |

---

### 7. `contacts` & `contact_groups`
Directory management and STOP suppression.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | PRIMARY KEY | Contact identifier |
| `user_id` | `VARCHAR(36)` | FOREIGN KEY (`users.id`) | Tenant owner |
| `name` | `VARCHAR(255)` | NOT NULL | Contact name |
| `phone_number` | `VARCHAR(64)` | NOT NULL | E.164 normalized phone |
| `email` | `VARCHAR(255)` | NULL | Optional email |
| `group_id` | `VARCHAR(36)` | NULL | Associated segment group |
| `consent_status` | `VARCHAR(32)` | DEFAULT 'GRANTED' | `GRANTED`, `OPTED_OUT`, `PENDING` |
| `opted_out_at` | `TIMESTAMP` | NULL | Opt-out timestamp |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Registration |
| `updated_at` | `TIMESTAMP` | NOT NULL | Update timestamp |

---

### 8. `campaigns` & `campaign_recipients`
Bulk messaging orchestration.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(36)` | PRIMARY KEY | Campaign identifier |
| `user_id` | `VARCHAR(36)` | FOREIGN KEY (`users.id`) | Tenant owner |
| `device_id` | `VARCHAR(36)` | FOREIGN KEY (`devices.id`) | Selected Android gateway |
| `campaign_name` | `VARCHAR(255)` | NOT NULL | Campaign title |
| `message_template` | `TEXT` | NOT NULL | Template with `{{name}}` placeholders |
| `status` | `VARCHAR(32)` | DEFAULT 'DRAFT' | `DRAFT`, `SCHEDULED`, `PROCESSING`, `COMPLETED`, `PAUSED`, `FAILED`, `CANCELLED` |
| `total_recipients` | `INTEGER` | DEFAULT 0 | Total count |
| `queued_count` | `INTEGER` | DEFAULT 0 | Pending count |
| `sent_count` | `INTEGER` | DEFAULT 0 | Successfully submitted count |
| `delivered_count` | `INTEGER` | DEFAULT 0 | Carrier confirmed count |
| `failed_count` | `INTEGER` | DEFAULT 0 | Failed count |
| `rate_limit_per_minute` | `INTEGER`| DEFAULT 30 | Messages per minute rate control |
| `started_at` | `TIMESTAMP` | NULL | Dispatch start time |
| `completed_at` | `TIMESTAMP` | NULL | Dispatch completion time |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Creation timestamp |

---

### 9. `ai_settings`, `ai_conversations`, `ai_automation_logs`
Gemini-powered auto-reply engine configuration and audit trails.

- `ai_settings`: Stores system instructions, response limits, language, cooldown minutes, and daily quotas.
- `ai_conversations`: Enforces anti-loop rules by tracking `automated_reply_count` per phone number within the cooldown window.
- `ai_automation_logs`: Stores incoming text, generated model reply, latency in milliseconds, and status (`SUCCESS`, `WAITING_APPROVAL`, `FAILED`).
