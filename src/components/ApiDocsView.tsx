import React, { useState } from 'react';
import {
  FileCode2,
  Copy,
  Check,
  Code,
  Download,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Terminal
} from 'lucide-react';

export const ApiDocsView: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'endpoints' | 'events' | 'kotlin'>('endpoints');

  const copyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const endpoints = [
    {
      method: 'POST',
      path: '/api/v1/pairing/initiate',
      auth: 'User Bearer / Session',
      desc: 'Generates one-time 2-minute pairing session secret & QR payload.',
      sampleReq: '{}',
      sampleRes: `{
  "success": true,
  "data": {
    "pairing_session_id": "pair_e3b0c442",
    "pairing_secret": "sec_8f498327104b2a9e3d8109",
    "api_url": "https://api.yourdomain.com/api/v1",
    "ws_url": "wss://api.yourdomain.com/device/connect",
    "expires_at": "2026-11-08T12:02:00.000Z"
  }
}`
    },
    {
      method: 'POST',
      path: '/api/v1/pairing/confirm',
      auth: 'Pairing Secret',
      desc: 'Called by Android Agent after scanning QR code to register device & obtain permanent credentials.',
      sampleReq: `{
  "pairing_session_id": "pair_e3b0c442",
  "pairing_secret": "sec_8f498327104b2a9e3d8109",
  "device_name": "Samsung Galaxy M13",
  "platform": "ANDROID",
  "android_version": "14",
  "app_version": "1.2.0"
}`,
      sampleRes: `{
  "success": true,
  "data": {
    "device_id": "dev_7c9f8021ae",
    "device_token": "dev_tok_9918237198a287fbb...",
    "ws_endpoint": "/device/connect"
  }
}`
    },
    {
      method: 'POST',
      path: '/api/v1/sms/inbound',
      auth: 'Device Token',
      desc: 'Forwards incoming mobile SMS received by the Android SIM to backend.',
      sampleReq: `{
  "event_id": "evt_in_9921",
  "device_id": "dev_7c9f8021ae",
  "sender": "+255715889900",
  "message_body": "Hello, I need assistance.",
  "received_at": "2026-11-08T12:00:00Z",
  "sim_slot": 0,
  "subscription_id": 1
}`,
      sampleRes: `{
  "success": true,
  "data": {
    "message_id": "msg_99218201",
    "status": "DELIVERED"
  }
}`
    },
    {
      method: 'POST',
      path: '/api/v1/sms/send',
      auth: 'User Session',
      desc: 'Queues an outbound SMS and dispatches command to the connected Android device.',
      sampleReq: `{
  "device_id": "dev_7c9f8021ae",
  "recipient": "+255715889900",
  "message_body": "Your order #9821 is dispatched.",
  "sim_slot": 0,
  "subscription_id": 1,
  "idempotency_key": "unique_idem_123"
}`,
      sampleRes: `{
  "success": true,
  "data": {
    "message": { "id": "msg_0019283", "status": "QUEUED" },
    "command_id": "cmd_8192301"
  }
}`
    }
  ];

  const wsEvents = [
    {
      name: 'SMS_SEND_COMMAND',
      source: 'Backend -> Android Agent',
      desc: 'Orders the Android device to send an SMS through physical SIM card.',
      envelope: `{
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
    "idempotency_key": "unique_key"
  }
}`
    },
    {
      name: 'COMMAND_ACKNOWLEDGED',
      source: 'Android Agent -> Backend',
      desc: 'Confirms receipt and acceptance into local Android queue.',
      envelope: `{
  "event": "COMMAND_ACKNOWLEDGED",
  "event_id": "evt_ack_202",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:01.000Z",
  "payload": {
    "command_id": "cmd_8192301",
    "message_id": "msg_0019283"
  }
}`
    },
    {
      name: 'SMS_SENT',
      source: 'Android Agent -> Backend',
      desc: 'Carrier intent confirms message was successfully submitted to mobile network telephony.',
      envelope: `{
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
}`
    },
    {
      name: 'SMS_DELIVERED',
      source: 'Android Agent -> Backend',
      desc: 'Carrier delivery report confirms handset delivery.',
      envelope: `{
  "event": "SMS_DELIVERED",
  "event_id": "evt_deliv_404",
  "device_id": "dev_7c9f8021ae",
  "timestamp": "2026-11-08T12:00:08.000Z",
  "payload": {
    "message_id": "msg_0019283",
    "recipient": "+255715889900",
    "delivered_at": "2026-11-08T12:00:08.000Z"
  }
}`
    }
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">API Contract & Android Integration</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Technical specifications for the independent Android Gateway Agent and backend microservices.
          </p>
        </div>

        <a
          href="/api/v1/openapi.json"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>OpenAPI 3.0 Spec JSON</span>
        </a>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('endpoints')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'endpoints' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          REST Endpoints
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'events' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          WebSocket Event Envelopes
        </button>
        <button
          onClick={() => setActiveTab('kotlin')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'kotlin' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Kotlin OkHttp Integration Code
        </button>
      </div>

      {/* TAB 1: REST Endpoints */}
      {activeTab === 'endpoints' && (
        <div className="space-y-4">
          {endpoints.map((ep, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                    ep.method === 'POST' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {ep.method}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-900">{ep.path}</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  Auth: {ep.auth}
                </span>
              </div>

              <p className="text-xs text-slate-600">{ep.desc}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Request Payload</span>
                  <pre className="p-3 bg-slate-950 text-slate-300 rounded-lg text-[11px] font-mono overflow-x-auto">
                    {ep.sampleReq}
                  </pre>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Response Payload</span>
                  <pre className="p-3 bg-slate-950 text-slate-300 rounded-lg text-[11px] font-mono overflow-x-auto">
                    {ep.sampleRes}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: WebSocket Events */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-100 text-xs text-blue-900">
            <strong>WebSocket Connection URL:</strong> <code className="font-mono">wss://api.yourdomain.com/device/connect</code> with <code className="font-mono">Authorization: Bearer &lt;device_token&gt;</code> header.
          </div>

          {wsEvents.map((ev, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-600 font-mono">{ev.name}</span>
                  <span className="text-[11px] font-medium text-slate-500">({ev.source})</span>
                </div>
                <button
                  onClick={() => copyCode(ev.envelope, ev.name)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  title="Copy Envelope"
                >
                  {copiedKey === ev.name ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <p className="text-xs text-slate-600">{ev.desc}</p>

              <pre className="p-3 bg-slate-950 text-slate-300 rounded-lg text-[11px] font-mono overflow-x-auto">
                {ev.envelope}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Kotlin OkHttp Integration */}
      {activeTab === 'kotlin' && (
        <div className="bg-slate-950 text-slate-200 rounded-xl p-5 shadow-lg space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-emerald-400 font-bold">Android Gateway Agent — GatewayWebSocketClient.kt</span>
            <button
              onClick={() => copyCode(`// See API_CONTRACT.md for full code`, 'kotlin')}
              className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Kotlin Class</span>
            </button>
          </div>

          <pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed p-2">
{`// Android OkHttp standard WebSocket implementation
class GatewayWebSocketClient(
    private val serverWsUrl: String, // "wss://api.yourdomain.com/device/connect"
    private val deviceId: String,
    private val deviceToken: String
) : WebSocketListener() {

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .build()

    fun connect() {
        val request = Request.Builder()
            .url(serverWsUrl)
            .addHeader("Authorization", "Bearer $deviceToken")
            .build()
        client.newWebSocket(request, this)
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
        val json = JSONObject(text)
        when (json.optString("event")) {
            "SMS_SEND_COMMAND" -> {
                val payload = json.getJSONObject("payload")
                sendAcknowledge(payload.getString("command_id"), payload.getString("message_id"))
                // Execute via Android SmsManager...
            }
        }
    }
}`}
          </pre>
        </div>
      )}
    </div>
  );
};
