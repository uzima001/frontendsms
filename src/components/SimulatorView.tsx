import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Smartphone,
  Send,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Power,
  ArrowDownLeft,
  ArrowUpRight,
  Code
} from 'lucide-react';
import { Device, WsEventLog, SmsMessage } from '../types';
import { api } from '../services/api';

interface SimulatorViewProps {
  devices: Device[];
  recentMessages: SmsMessage[];
  onRefresh: () => void;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  devices,
  recentMessages,
  onRefresh
}) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices[0]?.id || '');
  const [inboundSender, setInboundSender] = useState('+255712998877');
  const [inboundBody, setInboundBody] = useState('Habari, what are your opening hours on Sunday?');

  const [wsLogs, setWsLogs] = useState<WsEventLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  // Poll event logs
  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadLogs = async () => {
    try {
      const res = await api.getDevEvents();
      setWsLogs(res.logs || []);
    } catch {}
  };

  const copyLogJson = (json: unknown, id: string) => {
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    setCopiedLogId(id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const handleSimulateInboundSms = async () => {
    if (!selectedDeviceId || !inboundBody.trim()) return;
    setLoading(true);
    setActionMessage(null);

    try {
      await api.simulateAgentAction({
        action: 'SEND_INBOUND_SMS',
        device_id: selectedDeviceId,
        sender: inboundSender,
        message_body: inboundBody.trim()
      });

      setActionMessage('Simulated Inbound SMS dispatched. Check SMS Inbox & AI Auto-Reply logs!');
      onRefresh();
      loadLogs();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleConnection = async () => {
    if (!selectedDeviceId) return;
    setLoading(true);
    try {
      const res = await api.simulateAgentAction({
        action: 'TOGGLE_CONNECTION',
        device_id: selectedDeviceId
      });
      setActionMessage((res as Record<string, string>).message || 'Connection toggled');
      onRefresh();
      loadLogs();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateSent = async (messageId: string) => {
    try {
      await api.simulateAgentAction({
        action: 'REPORT_SENT',
        device_id: selectedDeviceId,
        message_id: messageId
      });
      onRefresh();
      loadLogs();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleSimulateDelivered = async (messageId: string) => {
    try {
      await api.simulateAgentAction({
        action: 'REPORT_DELIVERED',
        device_id: selectedDeviceId,
        message_id: messageId
      });
      onRefresh();
      loadLogs();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleSimulateFailed = async (messageId: string) => {
    try {
      await api.simulateAgentAction({
        action: 'REPORT_FAILED',
        device_id: selectedDeviceId,
        message_id: messageId
      });
      onRefresh();
      loadLogs();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Find dispatched or queued messages for this device
  const deviceOutboundMessages = recentMessages.filter(
    m => m.device_id === selectedDeviceId && m.direction === 'OUTBOUND'
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Android Agent Protocol Inspector</h2>
            <span className="bg-amber-100 text-amber-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-amber-300">
              Developer Console
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Test the exact WebSocket contract and simulate OkHttp Android Gateway Agent responses without physical hardware.
          </p>
        </div>

        {/* Device Picker */}
        <div className="flex items-center gap-2 shrink-0">
          <Smartphone className="w-4 h-4 text-slate-500" />
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none"
          >
            {devices.map(d => (
              <option key={d.id} value={d.id}>
                {d.device_name} ({d.connection_status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-blue-600 font-bold ml-2">&times;</button>
        </div>
      )}

      {/* Simulator Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Device Controls & Inbound Simulator */}
        <div className="space-y-6">
          {/* Virtual Device State Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900">Virtual Gateway State</h3>
              </div>
              <button
                onClick={handleToggleConnection}
                disabled={loading}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors shadow-2xs ${
                  selectedDevice?.connection_status === 'CONNECTED'
                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>
                  {selectedDevice?.connection_status === 'CONNECTED' ? 'Simulate Disconnect' : 'Simulate Connect'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase">WebSocket Status</span>
                <p className="font-mono font-semibold text-slate-800 mt-0.5">
                  {selectedDevice?.connection_status}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Gateway Telephony Mode</span>
                <p className="font-mono text-slate-800 mt-0.5">
                  {selectedDevice?.gateway_status}
                </p>
              </div>
            </div>
          </div>

          {/* Inbound SMS Simulator Form */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900">Simulate Inbound SMS from Customer</h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Injects a mock mobile SMS received by the Android device SIM. Tests backend ingestion, real-time WebSocket broadcast, and the Gemini AI Auto-Reply engine!
            </p>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Customer Sender Number</label>
              <input
                type="text"
                value={inboundSender}
                onChange={(e) => setInboundSender(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Inbound SMS Text</label>
              <textarea
                rows={2}
                value={inboundBody}
                onChange={(e) => setInboundBody(e.target.value)}
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-sans"
              />
            </div>

            <button
              onClick={handleSimulateInboundSms}
              disabled={loading || !inboundBody.trim()}
              className="w-full py-2 px-3 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5 text-emerald-600" />
              <span>Simulate Inbound SMS & Trigger AI</span>
            </button>
          </div>

          {/* Outbound SMS Status Trigger Controls */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900">Simulate Android Radio Callbacks</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Telephony Intents</span>
            </div>

            <p className="text-[11px] text-slate-500">
              Simulate carrier network callbacks for recent outbound messages dispatched to this gateway:
            </p>

            {deviceOutboundMessages.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No outbound messages sent to this gateway yet.</p>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto">
                {deviceOutboundMessages.slice(0, 4).map(msg => (
                  <div key={msg.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-slate-900">{msg.recipient}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                        {msg.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 truncate">{msg.message_body}</p>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleSimulateSent(msg.id)}
                        className="px-2 py-1 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200"
                        title="Simulate SmsManager SENT Intent"
                      >
                        Report Sent
                      </button>

                      <button
                        onClick={() => handleSimulateDelivered(msg.id)}
                        className="px-2 py-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200"
                        title="Simulate Carrier Delivery Receipt"
                      >
                        Report Delivered
                      </button>

                      <button
                        onClick={() => handleSimulateFailed(msg.id)}
                        className="px-2 py-1 text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200"
                        title="Simulate Radio / Airtime Failure"
                      >
                        Report Failed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Live WebSocket Frame Stream */}
        <div className="bg-slate-950 text-slate-200 p-5 rounded-xl border border-slate-800 shadow-lg flex flex-col h-[640px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white font-mono">Live WebSocket Frame Stream</h3>
            </div>
            <button
              onClick={loadLogs}
              className="p-1 text-slate-400 hover:text-white"
              title="Refresh log stream"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto mt-3 space-y-3 font-mono text-[11px] pr-1">
            {wsLogs.length === 0 ? (
              <div className="text-center py-20 text-slate-600">
                Awaiting WebSocket event traffic...
              </div>
            ) : (
              wsLogs.map(log => {
                const isOutbound = log.direction === 'OUTBOUND';

                return (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-900/90 rounded-lg border border-slate-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                        isOutbound ? 'bg-blue-900/80 text-blue-300' : 'bg-emerald-900/80 text-emerald-300'
                      }`}>
                        {log.direction} · {log.endpoint}
                      </span>

                      <div className="flex items-center gap-2 text-slate-500">
                        <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <button
                          onClick={() => copyLogJson(log.payload, log.id)}
                          className="hover:text-slate-300"
                          title="Copy JSON Payload"
                        >
                          {copiedLogId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <div className="text-amber-400 font-bold text-xs">
                      {log.event}
                    </div>

                    <pre className="text-slate-400 overflow-x-auto text-[10px] leading-tight p-2 bg-slate-950/70 rounded">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
