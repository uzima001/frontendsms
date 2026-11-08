import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Persistence directory
const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.resolve(DATA_DIR, 'gateway_db.json');

// Interface definitions matching section 16 of the prompt
export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  user_id: string;
  device_name: string;
  device_model: string;
  platform: 'ANDROID';
  android_version: string;
  app_version: string;
  connection_status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'REVOKED' | 'ERROR';
  gateway_status: 'IDLE' | 'SENDING' | 'MAINTENANCE' | 'OFFLINE';
  sim_status: 'ACTIVE' | 'ABSENT' | 'RESTRICTED';
  carrier_name: string; // e.g. "Vodacom TZ / Airtel"
  sim_slots: {
    slot_index: number;
    subscription_id: number;
    carrier: string;
    phone_number?: string;
    signal_level: number; // 0-4
    is_active: boolean;
  }[];
  battery_level: number; // 0-100
  is_charging?: boolean;
  last_heartbeat_at: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PairingSession {
  id: string;
  user_id: string;
  pairing_secret_hash: string;
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export interface DeviceCredential {
  id: string;
  device_id: string;
  credential_hash: string;
  token_plain?: string; // used for demo pairing handover
  credential_version: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface SmsMessage {
  id: string;
  user_id: string;
  device_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender: string;
  recipient: string;
  message_body: string;
  status: 'QUEUED' | 'DISPATCHED' | 'SENT' | 'FAILED' | 'DELIVERED' | 'DELIVERY_UNKNOWN' | 'CANCELLED';
  sim_slot: number;
  subscription_id: number;
  idempotency_key?: string;
  source_event_id?: string;
  campaign_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  received_at?: string | null;
  created_at: string;
  sent_at?: string | null;
  delivered_at?: string | null;
}

export interface SmsCommand {
  id: string;
  device_id: string;
  message_id: string;
  command_type: 'SMS_SEND_COMMAND';
  payload: {
    command_id: string;
    message_id: string;
    recipient: string;
    message_body: string;
    subscription_id: number;
    idempotency_key?: string;
  };
  status: 'PENDING' | 'DISPATCHED' | 'ACKNOWLEDGED' | 'COMPLETED' | 'FAILED';
  attempts: number;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  phone_number: string;
  email?: string;
  group_id?: string | null;
  consent_status: 'GRANTED' | 'OPTED_OUT' | 'PENDING';
  opted_out_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactGroup {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  device_id: string;
  sim_slot: number;
  subscription_id: number;
  campaign_name: string;
  message_template: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'PAUSED' | 'FAILED' | 'CANCELLED';
  total_recipients: number;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  rate_limit_per_minute: number;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  contact_id?: string | null;
  phone_number: string;
  recipient_name?: string;
  message_id?: string | null;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'DELIVERED';
  error_message?: string | null;
  created_at: string;
}

export interface AiSettings {
  id: string;
  user_id: string;
  device_id?: string | null;
  enabled: boolean;
  provider: 'gemini' | 'openai' | 'anthropic';
  model: string;
  system_instructions: string;
  response_language: string;
  maximum_response_length: number;
  approval_mode: boolean;
  daily_limit: number;
  daily_used: number;
  response_delay_seconds: number;
  allowed_contacts: string[]; // phone numbers or empty for all
  blocked_contacts: string[];
  cooldown_minutes: number;
  fallback_response: string;
  created_at: string;
  updated_at: string;
}

export interface AiConversation {
  id: string;
  user_id: string;
  device_id: string;
  phone_number: string;
  last_message_at: string;
  automated_reply_count: number;
  created_at: string;
  updated_at: string;
}

export interface AiAutomationLog {
  id: string;
  user_id: string;
  device_id: string;
  incoming_message_id: string;
  phone_number: string;
  incoming_text: string;
  generated_response: string;
  status: 'SUCCESS' | 'WAITING_APPROVAL' | 'REJECTED' | 'FAILED';
  provider: string;
  model: string;
  latency_ms: number;
  error_message?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface DatabaseSchema {
  users: User[];
  devices: Device[];
  pairing_sessions: PairingSession[];
  device_credentials: DeviceCredential[];
  sms_messages: SmsMessage[];
  sms_commands: SmsCommand[];
  contacts: Contact[];
  contact_groups: ContactGroup[];
  campaigns: Campaign[];
  campaign_recipients: CampaignRecipient[];
  ai_settings: AiSettings[];
  ai_conversations: AiConversation[];
  ai_automation_logs: AiAutomationLog[];
  audit_logs: AuditLog[];
}

// In-memory cache synced to disk
let db: DatabaseSchema = {
  users: [],
  devices: [],
  pairing_sessions: [],
  device_credentials: [],
  sms_messages: [],
  sms_commands: [],
  contacts: [],
  contact_groups: [],
  campaigns: [],
  campaign_recipients: [],
  ai_settings: [],
  ai_conversations: [],
  ai_automation_logs: [],
  audit_logs: []
};

// Seed initial realistic data
function getInitialSeedData(): DatabaseSchema {
  const adminUserId = 'usr_admin_001';
  const defaultDeviceId = 'dev_samsung_m13_01';
  const now = new Date().toISOString();
  const pastHour = new Date(Date.now() - 3600000).toISOString();
  const past2Hours = new Date(Date.now() - 7200000).toISOString();
  const pastDay = new Date(Date.now() - 86400000).toISOString();

  // Simple bcrypt/sha hash for default password: Password123!
  const passwordHash = crypto.createHash('sha256').update('Password123!').digest('hex');

  const users: User[] = [
    {
      id: adminUserId,
      name: 'Sarah Kimaro',
      email: 'admin@smsgateway.io',
      password_hash: passwordHash,
      email_verified_at: pastDay,
      status: 'ACTIVE',
      created_at: pastDay,
      updated_at: now
    }
  ];

  const devices: Device[] = [
    {
      id: defaultDeviceId,
      user_id: adminUserId,
      device_name: 'Samsung Galaxy M13',
      device_model: 'SM-M135F',
      platform: 'ANDROID',
      android_version: '14 (API 34)',
      app_version: '1.2.0',
      connection_status: 'CONNECTED',
      gateway_status: 'IDLE',
      sim_status: 'ACTIVE',
      carrier_name: 'Vodacom Tanzania / Airtel TZ',
      sim_slots: [
        {
          slot_index: 0,
          subscription_id: 1,
          carrier: 'Vodacom Tanzania',
          phone_number: '+255 754 892 110',
          signal_level: 4,
          is_active: true
        },
        {
          slot_index: 1,
          subscription_id: 2,
          carrier: 'Airtel Tanzania',
          phone_number: '+255 682 411 905',
          signal_level: 3,
          is_active: true
        }
      ],
      battery_level: 88,
      is_charging: true,
      last_heartbeat_at: now,
      connected_at: pastDay,
      revoked_at: null,
      created_at: pastDay,
      updated_at: now
    },
    {
      id: 'dev_pixel_7a_02',
      user_id: adminUserId,
      device_name: 'Google Pixel 7a (Backup Gateway)',
      device_model: 'Pixel 7a',
      platform: 'ANDROID',
      android_version: '14',
      app_version: '1.2.0',
      connection_status: 'DISCONNECTED',
      gateway_status: 'OFFLINE',
      sim_status: 'ACTIVE',
      carrier_name: 'Tigo Tanzania',
      sim_slots: [
        {
          slot_index: 0,
          subscription_id: 1,
          carrier: 'Tigo Tanzania',
          phone_number: '+255 713 550 224',
          signal_level: 3,
          is_active: true
        }
      ],
      battery_level: 42,
      is_charging: false,
      last_heartbeat_at: past2Hours,
      connected_at: pastDay,
      revoked_at: null,
      created_at: pastDay,
      updated_at: past2Hours
    }
  ];

  const device_credentials: DeviceCredential[] = [
    {
      id: 'cred_dev_samsung_01',
      device_id: defaultDeviceId,
      credential_hash: crypto.createHash('sha256').update('device_token_demo_samsung_123').digest('hex'),
      token_plain: 'device_token_demo_samsung_123',
      credential_version: 1,
      expires_at: null,
      revoked_at: null,
      created_at: pastDay
    }
  ];

  const contact_groups: ContactGroup[] = [
    {
      id: 'grp_retail_clients',
      user_id: adminUserId,
      name: 'VIP Retail Clients',
      description: 'Dar es Salaam wholesale and retail recurring buyers',
      created_at: pastDay
    },
    {
      id: 'grp_tech_subscribers',
      user_id: adminUserId,
      name: 'System Alerts & Staff',
      description: 'Operations engineers and branch managers',
      created_at: pastDay
    }
  ];

  const contacts: Contact[] = [
    {
      id: 'cnt_01',
      user_id: adminUserId,
      name: 'Juma Mwamburi',
      phone_number: '+255715889900',
      email: 'juma@mwamburi.co.tz',
      group_id: 'grp_retail_clients',
      consent_status: 'GRANTED',
      opted_out_at: null,
      created_at: pastDay,
      updated_at: pastDay
    },
    {
      id: 'cnt_02',
      user_id: adminUserId,
      name: 'Amina Salum',
      phone_number: '+255762334455',
      email: 'amina.salum@gmail.com',
      group_id: 'grp_retail_clients',
      consent_status: 'GRANTED',
      opted_out_at: null,
      created_at: pastDay,
      updated_at: pastDay
    },
    {
      id: 'cnt_03',
      user_id: adminUserId,
      name: 'Dr. Michael Chen',
      phone_number: '+255788112233',
      email: 'mchen@eastafricaclinic.org',
      group_id: 'grp_tech_subscribers',
      consent_status: 'GRANTED',
      opted_out_at: null,
      created_at: pastDay,
      updated_at: pastDay
    },
    {
      id: 'cnt_04',
      user_id: adminUserId,
      name: 'Grace Mlay',
      phone_number: '+255744990011',
      email: 'grace.mlay@arushaexp.com',
      group_id: 'grp_retail_clients',
      consent_status: 'GRANTED',
      opted_out_at: null,
      created_at: pastDay,
      updated_at: pastDay
    }
  ];

  const sms_messages: SmsMessage[] = [
    {
      id: 'msg_01_inbound',
      user_id: adminUserId,
      device_id: defaultDeviceId,
      direction: 'INBOUND',
      sender: '+255715889900',
      recipient: '+255 754 892 110',
      message_body: 'Habari, I wanted to confirm the shipping status of order #9821.',
      status: 'DELIVERED',
      sim_slot: 0,
      subscription_id: 1,
      source_event_id: 'evt_sim_in_01',
      received_at: past2Hours,
      created_at: past2Hours
    },
    {
      id: 'msg_02_outbound',
      user_id: adminUserId,
      device_id: defaultDeviceId,
      direction: 'OUTBOUND',
      sender: '+255 754 892 110',
      recipient: '+255715889900',
      message_body: 'Hello Juma! Your order #9821 was dispatched this morning via Dar Express. Tracking ref: DX-44109.',
      status: 'DELIVERED',
      sim_slot: 0,
      subscription_id: 1,
      idempotency_key: 'idem_001_shipping',
      created_at: pastHour,
      sent_at: pastHour,
      delivered_at: pastHour
    },
    {
      id: 'msg_03_inbound',
      user_id: adminUserId,
      device_id: defaultDeviceId,
      direction: 'INBOUND',
      sender: '+255762334455',
      recipient: '+255 754 892 110',
      message_body: 'What are your working hours this Sunday?',
      status: 'DELIVERED',
      sim_slot: 0,
      subscription_id: 1,
      source_event_id: 'evt_sim_in_02',
      received_at: new Date(Date.now() - 1800000).toISOString(),
      created_at: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'msg_04_ai_reply',
      user_id: adminUserId,
      device_id: defaultDeviceId,
      direction: 'OUTBOUND',
      sender: '+255 754 892 110',
      recipient: '+255762334455',
      message_body: '[AI Auto-Reply] Hello Amina! Our Dar es Salaam main branch is open Sunday 9:00 AM to 3:00 PM. Call +255 754 892 110 for urgent support.',
      status: 'SENT',
      sim_slot: 0,
      subscription_id: 1,
      idempotency_key: 'idem_ai_reply_03',
      created_at: new Date(Date.now() - 1700000).toISOString(),
      sent_at: new Date(Date.now() - 1695000).toISOString(),
      delivered_at: null
    }
  ];

  const ai_settings: AiSettings[] = [
    {
      id: 'ai_cfg_01',
      user_id: adminUserId,
      device_id: defaultDeviceId,
      enabled: true,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      system_instructions: 'You are an intelligent, professional customer support representative for SMS Gateway Hub in Tanzania. Answer inquiries concisely (under 160 characters whenever possible). Be courteous, friendly, and helpful. If asked about shipping, orders, or hours, provide clear direct answers. Support both English and Swahili appropriately.',
      response_language: 'English and Swahili',
      maximum_response_length: 160,
      approval_mode: false,
      daily_limit: 100,
      daily_used: 1,
      response_delay_seconds: 3,
      allowed_contacts: [],
      blocked_contacts: [],
      cooldown_minutes: 15,
      fallback_response: 'Thank you for reaching out. An agent will respond to your inquiry shortly.',
      created_at: pastDay,
      updated_at: now
    }
  ];

  const campaigns: Campaign[] = [
    {
      id: 'cmp_holiday_promo',
      user_id: adminUserId,
      device_id: defaultDeviceId,
      sim_slot: 0,
      subscription_id: 1,
      campaign_name: 'Mid-Season Wholesale Promotion',
      message_template: 'Habari {{name}}, enjoy 15% discount on all bulk shipments through Friday! Visit store or reply YES to order.',
      status: 'COMPLETED',
      total_recipients: 4,
      queued_count: 0,
      sent_count: 4,
      failed_count: 0,
      delivered_count: 3,
      rate_limit_per_minute: 20,
      scheduled_at: pastDay,
      started_at: pastDay,
      completed_at: pastDay,
      created_at: pastDay
    }
  ];

  const campaign_recipients: CampaignRecipient[] = [
    {
      id: 'cr_01',
      campaign_id: 'cmp_holiday_promo',
      contact_id: 'cnt_01',
      phone_number: '+255715889900',
      recipient_name: 'Juma Mwamburi',
      status: 'DELIVERED',
      created_at: pastDay
    },
    {
      id: 'cr_02',
      campaign_id: 'cmp_holiday_promo',
      contact_id: 'cnt_02',
      phone_number: '+255762334455',
      recipient_name: 'Amina Salum',
      status: 'DELIVERED',
      created_at: pastDay
    },
    {
      id: 'cr_03',
      campaign_id: 'cmp_holiday_promo',
      contact_id: 'cnt_03',
      phone_number: '+255788112233',
      recipient_name: 'Dr. Michael Chen',
      status: 'DELIVERED',
      created_at: pastDay
    },
    {
      id: 'cr_04',
      campaign_id: 'cmp_holiday_promo',
      contact_id: 'cnt_04',
      phone_number: '+255744990011',
      recipient_name: 'Grace Mlay',
      status: 'SENT',
      created_at: pastDay
    }
  ];

  const audit_logs: AuditLog[] = [
    {
      id: 'aud_01',
      user_id: adminUserId,
      action: 'DEVICE_PAIRED',
      resource_type: 'device',
      resource_id: defaultDeviceId,
      metadata: { device_name: 'Samsung Galaxy M13', model: 'SM-M135F' },
      created_at: pastDay
    },
    {
      id: 'aud_02',
      user_id: adminUserId,
      action: 'CAMPAIGN_COMPLETED',
      resource_type: 'campaign',
      resource_id: 'cmp_holiday_promo',
      metadata: { total: 4, delivered: 3 },
      created_at: pastDay
    }
  ];

  return {
    users,
    devices,
    pairing_sessions: [],
    device_credentials,
    sms_messages,
    sms_commands: [],
    contacts,
    contact_groups,
    campaigns,
    campaign_recipients,
    ai_settings,
    ai_conversations: [
      {
        id: 'conv_01',
        user_id: adminUserId,
        device_id: defaultDeviceId,
        phone_number: '+255762334455',
        last_message_at: now,
        automated_reply_count: 1,
        created_at: pastDay,
        updated_at: now
      }
    ],
    ai_automation_logs: [
      {
        id: 'ailog_01',
        user_id: adminUserId,
        device_id: defaultDeviceId,
        incoming_message_id: 'msg_03_inbound',
        phone_number: '+255762334455',
        incoming_text: 'What are your working hours this Sunday?',
        generated_response: '[AI Auto-Reply] Hello Amina! Our Dar es Salaam main branch is open Sunday 9:00 AM to 3:00 PM. Call +255 754 892 110 for urgent support.',
        status: 'SUCCESS',
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        latency_ms: 820,
        created_at: new Date(Date.now() - 1700000).toISOString()
      }
    ],
    audit_logs
  };
}

// Load database from disk or initialize
export function initDatabase(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(raw);
    } else {
      db = getInitialSeedData();
      persistDatabase();
    }
  } catch (err) {
    console.error('Failed to load database, using seed:', err);
    db = getInitialSeedData();
  }
}

export function persistDatabase(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error persisting database:', err);
  }
}

// Accessor methods for repository
export const dbRepo = {
  getRaw: () => db,
  persist: persistDatabase,

  // Users
  getUserByEmail: (email: string) => db.users.find(u => u.email.toLowerCase() === email.toLowerCase()),
  getUserById: (id: string) => db.users.find(u => u.id === id),
  createUser: (user: User) => {
    db.users.push(user);
    persistDatabase();
    return user;
  },

  // Devices
  getDevicesByUserId: (userId: string) => db.devices.filter(d => d.user_id === userId),
  getDeviceById: (deviceId: string) => db.devices.find(d => d.id === deviceId),
  createDevice: (device: Device) => {
    db.devices.push(device);
    persistDatabase();
    return device;
  },
  updateDevice: (deviceId: string, updates: Partial<Device>) => {
    const idx = db.devices.findIndex(d => d.id === deviceId);
    if (idx !== -1) {
      db.devices[idx] = { ...db.devices[idx], ...updates, updated_at: new Date().toISOString() };
      persistDatabase();
      return db.devices[idx];
    }
    return null;
  },
  revokeDevice: (deviceId: string) => {
    const idx = db.devices.findIndex(d => d.id === deviceId);
    if (idx !== -1) {
      db.devices[idx].connection_status = 'REVOKED';
      db.devices[idx].gateway_status = 'OFFLINE';
      db.devices[idx].revoked_at = new Date().toISOString();
      db.devices[idx].updated_at = new Date().toISOString();
      persistDatabase();
      return db.devices[idx];
    }
    return null;
  },

  // Credentials
  getDeviceCredential: (deviceId: string) => db.device_credentials.find(c => c.device_id === deviceId && !c.revoked_at),
  getDeviceCredentialByHash: (hash: string) => db.device_credentials.find(c => c.credential_hash === hash && !c.revoked_at),
  createDeviceCredential: (cred: DeviceCredential) => {
    db.device_credentials.push(cred);
    persistDatabase();
    return cred;
  },

  // Pairing sessions
  createPairingSession: (session: PairingSession) => {
    db.pairing_sessions.push(session);
    persistDatabase();
    return session;
  },
  getPairingSessionById: (id: string) => db.pairing_sessions.find(s => s.id === id),
  updatePairingSession: (id: string, updates: Partial<PairingSession>) => {
    const idx = db.pairing_sessions.findIndex(s => s.id === id);
    if (idx !== -1) {
      db.pairing_sessions[idx] = { ...db.pairing_sessions[idx], ...updates };
      persistDatabase();
      return db.pairing_sessions[idx];
    }
    return null;
  },

  // SMS Messages
  getMessagesByUserId: (userId: string, filter?: { deviceId?: string; direction?: string; status?: string; search?: string }) => {
    let list = db.sms_messages.filter(m => m.user_id === userId);
    if (filter?.deviceId) list = list.filter(m => m.device_id === filter.deviceId);
    if (filter?.direction) list = list.filter(m => m.direction === filter.direction);
    if (filter?.status) list = list.filter(m => m.status === filter.status);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(m => m.sender.toLowerCase().includes(q) || m.recipient.toLowerCase().includes(q) || m.message_body.toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  getMessageById: (id: string) => db.sms_messages.find(m => m.id === id),
  getMessageByEventId: (eventId: string) => db.sms_messages.find(m => m.source_event_id === eventId),
  getMessageByIdempotencyKey: (key: string) => db.sms_messages.find(m => m.idempotency_key === key),
  createMessage: (msg: SmsMessage) => {
    db.sms_messages.push(msg);
    persistDatabase();
    return msg;
  },
  updateMessage: (id: string, updates: Partial<SmsMessage>) => {
    const idx = db.sms_messages.findIndex(m => m.id === id);
    if (idx !== -1) {
      db.sms_messages[idx] = { ...db.sms_messages[idx], ...updates };
      persistDatabase();
      return db.sms_messages[idx];
    }
    return null;
  },

  // Commands
  createCommand: (cmd: SmsCommand) => {
    db.sms_commands.push(cmd);
    persistDatabase();
    return cmd;
  },
  getCommandById: (cmdId: string) => db.sms_commands.find(c => c.id === cmdId),
  getPendingCommandsForDevice: (deviceId: string) => db.sms_commands.filter(c => c.device_id === deviceId && (c.status === 'PENDING' || c.status === 'DISPATCHED')),
  updateCommand: (cmdId: string, updates: Partial<SmsCommand>) => {
    const idx = db.sms_commands.findIndex(c => c.id === cmdId);
    if (idx !== -1) {
      db.sms_commands[idx] = { ...db.sms_commands[idx], ...updates, updated_at: new Date().toISOString() };
      persistDatabase();
      return db.sms_commands[idx];
    }
    return null;
  },

  // Contacts
  getContactsByUserId: (userId: string) => db.contacts.filter(c => c.user_id === userId),
  getContactById: (id: string) => db.contacts.find(c => c.id === id),
  getContactByPhone: (userId: string, phone: string) => db.contacts.find(c => c.user_id === userId && c.phone_number.replace(/\s+/g, '') === phone.replace(/\s+/g, '')),
  createContact: (contact: Contact) => {
    db.contacts.push(contact);
    persistDatabase();
    return contact;
  },
  updateContact: (id: string, updates: Partial<Contact>) => {
    const idx = db.contacts.findIndex(c => c.id === id);
    if (idx !== -1) {
      db.contacts[idx] = { ...db.contacts[idx], ...updates, updated_at: new Date().toISOString() };
      persistDatabase();
      return db.contacts[idx];
    }
    return null;
  },
  deleteContact: (id: string) => {
    const idx = db.contacts.findIndex(c => c.id === id);
    if (idx !== -1) {
      db.contacts.splice(idx, 1);
      persistDatabase();
      return true;
    }
    return false;
  },

  // Groups
  getContactGroupsByUserId: (userId: string) => db.contact_groups.filter(g => g.user_id === userId),
  createContactGroup: (group: ContactGroup) => {
    db.contact_groups.push(group);
    persistDatabase();
    return group;
  },

  // Campaigns
  getCampaignsByUserId: (userId: string) => db.campaigns.filter(c => c.user_id === userId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  getCampaignById: (id: string) => db.campaigns.find(c => c.id === id),
  createCampaign: (campaign: Campaign, recipients: CampaignRecipient[]) => {
    db.campaigns.push(campaign);
    db.campaign_recipients.push(...recipients);
    persistDatabase();
    return campaign;
  },
  updateCampaign: (id: string, updates: Partial<Campaign>) => {
    const idx = db.campaigns.findIndex(c => c.id === id);
    if (idx !== -1) {
      db.campaigns[idx] = { ...db.campaigns[idx], ...updates };
      persistDatabase();
      return db.campaigns[idx];
    }
    return null;
  },
  getCampaignRecipients: (campaignId: string) => db.campaign_recipients.filter(r => r.campaign_id === campaignId),
  updateCampaignRecipient: (id: string, updates: Partial<CampaignRecipient>) => {
    const idx = db.campaign_recipients.findIndex(r => r.id === id);
    if (idx !== -1) {
      db.campaign_recipients[idx] = { ...db.campaign_recipients[idx], ...updates };
      persistDatabase();
      return db.campaign_recipients[idx];
    }
    return null;
  },

  // AI Settings
  getAiSettingsByUserId: (userId: string) => db.ai_settings.find(s => s.user_id === userId),
  upsertAiSettings: (settings: AiSettings) => {
    const idx = db.ai_settings.findIndex(s => s.user_id === settings.user_id);
    if (idx !== -1) {
      db.ai_settings[idx] = { ...db.ai_settings[idx], ...settings, updated_at: new Date().toISOString() };
    } else {
      db.ai_settings.push(settings);
    }
    persistDatabase();
    return db.ai_settings.find(s => s.user_id === settings.user_id)!;
  },
  getAiConversation: (userId: string, deviceId: string, phone: string) => {
    return db.ai_conversations.find(c => c.user_id === userId && c.device_id === deviceId && c.phone_number.replace(/\s+/g, '') === phone.replace(/\s+/g, ''));
  },
  upsertAiConversation: (userId: string, deviceId: string, phone: string, automatedCount: number) => {
    const idx = db.ai_conversations.findIndex(c => c.user_id === userId && c.device_id === deviceId && c.phone_number.replace(/\s+/g, '') === phone.replace(/\s+/g, ''));
    const now = new Date().toISOString();
    if (idx !== -1) {
      db.ai_conversations[idx].automated_reply_count = automatedCount;
      db.ai_conversations[idx].last_message_at = now;
      db.ai_conversations[idx].updated_at = now;
    } else {
      db.ai_conversations.push({
        id: 'conv_' + crypto.randomUUID().slice(0, 8),
        user_id: userId,
        device_id: deviceId,
        phone_number: phone,
        last_message_at: now,
        automated_reply_count: automatedCount,
        created_at: now,
        updated_at: now
      });
    }
    persistDatabase();
  },
  createAiLog: (log: AiAutomationLog) => {
    db.ai_automation_logs.unshift(log);
    if (db.ai_automation_logs.length > 500) db.ai_automation_logs.pop();
    persistDatabase();
    return log;
  },
  getAiLogsByUserId: (userId: string) => db.ai_automation_logs.filter(l => l.user_id === userId),

  // Audit Logs
  createAuditLog: (log: AuditLog) => {
    db.audit_logs.unshift(log);
    if (db.audit_logs.length > 1000) db.audit_logs.pop();
    persistDatabase();
    return log;
  },
  getAuditLogsByUserId: (userId: string) => db.audit_logs.filter(l => l.user_id === userId)
};

// Initialize right away
initDatabase();
