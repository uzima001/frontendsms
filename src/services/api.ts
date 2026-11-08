import {
  User,
  Device,
  SmsMessage,
  Conversation,
  Contact,
  ContactGroup,
  Campaign,
  AiSettings,
  AiAutomationLog,
  OverviewAnalytics,
  PairingSessionResponse,
  WsEventLog
} from '../types';

const BASE_URL = '/api/v1';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    },
    ...options
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error?.message || json.message || 'API request failed');
  }

  return json.data as T;
}

export const api = {
  // Auth
  getMe: () => fetchJson<{ user: User }>(`${BASE_URL}/auth/me`),
  login: (email: string, password: string) => fetchJson<{ user: User; token: string }>(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  logout: () => fetchJson<Record<string, unknown>>(`${BASE_URL}/auth/logout`, { method: 'POST' }),

  // Pairing
  initiatePairing: () => fetchJson<PairingSessionResponse>(`${BASE_URL}/pairing/initiate`, { method: 'POST' }),
  getPairingStatus: (id: string) => fetchJson<{ id: string; status: string; expires_at: string }>(`${BASE_URL}/pairing/${id}/status`),
  cancelPairing: (id: string) => fetchJson<Record<string, unknown>>(`${BASE_URL}/pairing/${id}/cancel`, { method: 'POST' }),

  // Devices
  getDevices: () => fetchJson<Device[]>(`${BASE_URL}/devices`),
  getDevice: (id: string) => fetchJson<Device>(`${BASE_URL}/devices/${id}`),
  renameDevice: (id: string, name: string) => fetchJson<Device>(`${BASE_URL}/devices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ device_name: name })
  }),
  disconnectDevice: (id: string) => fetchJson<Device>(`${BASE_URL}/devices/${id}/disconnect`, { method: 'POST' }),
  revokeDevice: (id: string) => fetchJson<Device>(`${BASE_URL}/devices/${id}/revoke`, { method: 'POST' }),

  // SMS
  getMessages: (params?: { device_id?: string; direction?: string; status?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.device_id) query.set('device_id', params.device_id);
    if (params?.direction) query.set('direction', params.direction);
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    return fetchJson<SmsMessage[]>(`${BASE_URL}/sms?${query.toString()}`);
  },
  getConversations: () => fetchJson<Conversation[]>(`${BASE_URL}/sms/conversations`),
  getConversationThread: (phone: string) => fetchJson<{ contact?: Contact; phone_number: string; messages: SmsMessage[] }>(
    `${BASE_URL}/sms/conversations/${encodeURIComponent(phone)}`
  ),
  sendSms: (payload: {
    device_id: string;
    recipient: string;
    message_body: string;
    sim_slot?: number;
    subscription_id?: number;
    idempotency_key?: string;
  }) => fetchJson<{ message: SmsMessage; command_id: string }>(`${BASE_URL}/sms/send`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  retrySms: (id: string) => fetchJson<SmsMessage>(`${BASE_URL}/sms/${id}/retry`, { method: 'POST' }),

  // Campaigns
  getCampaigns: () => fetchJson<Campaign[]>(`${BASE_URL}/campaigns`),
  getCampaign: (id: string) => fetchJson<Campaign & { recipients: unknown[] }>(`${BASE_URL}/campaigns/${id}`),
  createCampaign: (payload: {
    campaign_name: string;
    device_id: string;
    sim_slot: number;
    subscription_id: number;
    message_template: string;
    recipients: Array<{ phone_number: string; name?: string }>;
    rate_limit_per_minute?: number;
    start_immediately?: boolean;
  }) => fetchJson<Campaign>(`${BASE_URL}/campaigns`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  startCampaign: (id: string) => fetchJson<Record<string, unknown>>(`${BASE_URL}/campaigns/${id}/start`, { method: 'POST' }),
  pauseCampaign: (id: string) => fetchJson<Record<string, unknown>>(`${BASE_URL}/campaigns/${id}/pause`, { method: 'POST' }),
  resumeCampaign: (id: string) => fetchJson<Record<string, unknown>>(`${BASE_URL}/campaigns/${id}/resume`, { method: 'POST' }),
  cancelCampaign: (id: string) => fetchJson<Record<string, unknown>>(`${BASE_URL}/campaigns/${id}/cancel`, { method: 'POST' }),

  // Contacts & Groups
  getContacts: () => fetchJson<Contact[]>(`${BASE_URL}/contacts`),
  createContact: (payload: {
    name: string;
    phone_number: string;
    email?: string;
    group_id?: string;
    consent_status?: 'GRANTED' | 'OPTED_OUT';
  }) => fetchJson<Contact>(`${BASE_URL}/contacts`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateContact: (id: string, payload: Partial<Contact>) => fetchJson<Contact>(`${BASE_URL}/contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  deleteContact: (id: string) => fetchJson<Record<string, unknown>>(`${BASE_URL}/contacts/${id}`, { method: 'DELETE' }),
  importContacts: (contacts: Array<{ name: string; phone_number: string; email?: string }>, group_id?: string) =>
    fetchJson<{ imported_count: number }>(`${BASE_URL}/contacts/import`, {
      method: 'POST',
      body: JSON.stringify({ contacts, group_id })
    }),
  getContactGroups: () => fetchJson<ContactGroup[]>(`${BASE_URL}/contact-groups`),
  createContactGroup: (payload: { name: string; description?: string }) => fetchJson<ContactGroup>(`${BASE_URL}/contact-groups`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // AI
  getAiSettings: () => fetchJson<AiSettings>(`${BASE_URL}/ai/settings`),
  updateAiSettings: (payload: Partial<AiSettings>) => fetchJson<AiSettings>(`${BASE_URL}/ai/settings`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }),
  testAiPrompt: (payload: {
    system_instructions: string;
    incoming_text: string;
    language?: string;
    max_length?: number;
  }) => fetchJson<{ reply: string; latencyMs: number }>(`${BASE_URL}/ai/test`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getAiLogs: () => fetchJson<AiAutomationLog[]>(`${BASE_URL}/ai/logs`),

  // Analytics
  getOverviewAnalytics: () => fetchJson<OverviewAnalytics>(`${BASE_URL}/analytics/overview`),

  // Developer & Simulator
  getDevEvents: () => fetchJson<{ logs: WsEventLog[]; connected_devices: string[]; queue_stats: unknown }>(`${BASE_URL}/dev/events`),
  simulateAgentAction: (payload: {
    action: string;
    device_id?: string;
    message_id?: string;
    command_id?: string;
    sender?: string;
    message_body?: string;
  }) => fetchJson<Record<string, unknown>>(`${BASE_URL}/dev/simulate-agent`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
};
