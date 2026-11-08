export interface User {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
}

export interface SimSlot {
  slot_index: number;
  subscription_id: number;
  carrier: string;
  phone_number?: string;
  signal_level: number;
  is_active: boolean;
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
  carrier_name: string;
  sim_slots: SimSlot[];
  battery_level: number;
  is_charging?: boolean;
  last_heartbeat_at: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
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

export interface Conversation {
  phone_number: string;
  contact_name?: string;
  last_message: SmsMessage;
  unread_count: number;
  total_messages: number;
  device_id: string;
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
  allowed_contacts: string[];
  blocked_contacts: string[];
  cooldown_minutes: number;
  fallback_response: string;
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

export interface OverviewAnalytics {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  total_inbound: number;
  total_outbound: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  queued_count: number;
  delivery_rate_percent: number;
  active_campaigns: number;
  ai_auto_reply_enabled: boolean;
  ai_daily_used: number;
  chart_data: Array<{
    time: string;
    inbound: number;
    outbound: number;
    delivered: number;
  }>;
}

export interface PairingSessionResponse {
  pairing_session_id: string;
  pairing_secret: string;
  api_url: string;
  ws_url: string;
  expires_at: string;
}

export interface WsEventLog {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  endpoint: '/device/connect' | '/user/connect';
  targetId: string;
  event: string;
  payload: unknown;
  timestamp: string;
}
