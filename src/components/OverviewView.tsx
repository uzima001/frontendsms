import React from 'react';
import {
  Smartphone,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Layers,
  Bot,
  Send,
  Plus,
  Battery,
  BatteryCharging,
  Signal,
  AlertTriangle
} from 'lucide-react';
import { OverviewAnalytics, Device, SmsMessage } from '../types';
import { ActiveTab } from './Navigation';

interface OverviewViewProps {
  analytics: OverviewAnalytics | null;
  devices: Device[];
  recentMessages: SmsMessage[];
  setActiveTab: (tab: ActiveTab) => void;
  onOpenConnectModal: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  analytics,
  devices,
  recentMessages,
  setActiveTab,
  onOpenConnectModal
}) => {
  const onlineDevices = devices.filter(d => d.connection_status === 'CONNECTED');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gateways */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Android Gateways</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {analytics?.online_devices ?? onlineDevices.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              / {analytics?.total_devices ?? devices.length} online
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>SIM Telephony nodes</span>
            <button
              onClick={() => setActiveTab('devices')}
              className="text-blue-600 hover:text-blue-700 font-medium text-xs"
            >
              Manage &rarr;
            </button>
          </div>
        </div>

        {/* Inbound SMS */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Incoming Messages</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {analytics?.total_inbound ?? recentMessages.filter(m => m.direction === 'INBOUND').length}
            </span>
            <span className="text-xs text-emerald-600 font-medium">Forwarded to Web</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Real-time ingestion</span>
            <button
              onClick={() => setActiveTab('inbox')}
              className="text-blue-600 hover:text-blue-700 font-medium text-xs"
            >
              View Inbox &rarr;
            </button>
          </div>
        </div>

        {/* Outbound Dispatched */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Outbound SMS</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {analytics?.total_outbound ?? recentMessages.filter(m => m.direction === 'OUTBOUND').length}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({analytics?.delivered_count ?? 0} confirmed delivered)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Delivery confirmation</span>
            <span className="font-mono text-xs text-emerald-600 font-semibold">
              {analytics?.delivery_rate_percent ?? 98}% rate
            </span>
          </div>
        </div>

        {/* AI & Automation */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">AI Auto-Reply</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-sm font-semibold px-2 py-0.5 rounded ${
              analytics?.ai_auto_reply_enabled
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {analytics?.ai_auto_reply_enabled ? 'Active Engine' : 'Engine Inactive'}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span className="font-mono text-[11px]">Gemini 3.8 Flash</span>
            <button
              onClick={() => setActiveTab('ai')}
              className="text-blue-600 hover:text-blue-700 font-medium text-xs"
            >
              Configure &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Chart & Gateway Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: SMS Traffic Trends */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Message Volume & Carrier Dispatch</h3>
              <p className="text-xs text-slate-500 mt-0.5">Hourly throughput processed by Android gateway SIM cards</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Outbound SMS
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Inbound SMS
              </span>
            </div>
          </div>

          {/* Clean SVG Bar Chart */}
          <div className="h-56 w-full flex items-end gap-3 pt-6 pb-2 border-b border-slate-100">
            {(analytics?.chart_data || [
              { time: '08:00', inbound: 4, outbound: 12 },
              { time: '10:00', inbound: 15, outbound: 35 },
              { time: '12:00', inbound: 22, outbound: 48 },
              { time: '14:00', inbound: 28, outbound: 62 },
              { time: '16:00', inbound: 18, outbound: 28 },
              { time: '18:00', inbound: 9, outbound: 14 },
              { time: 'Now', inbound: 6, outbound: 10 }
            ]).map((point, i) => {
              const maxVal = 70;
              const outHeight = Math.max(12, Math.min(100, (point.outbound / maxVal) * 100));
              const inHeight = Math.max(8, Math.min(100, (point.inbound / maxVal) * 100));

              return (
                <div key={i} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full max-w-[36px] flex items-end gap-1 h-full">
                    {/* Inbound bar */}
                    <div
                      style={{ height: `${inHeight}%` }}
                      className="flex-1 bg-emerald-400 group-hover:bg-emerald-500 rounded-t transition-all"
                      title={`Inbound: ${point.inbound}`}
                    />
                    {/* Outbound bar */}
                    <div
                      style={{ height: `${outHeight}%` }}
                      className="flex-1 bg-blue-600 group-hover:bg-blue-700 rounded-t transition-all"
                      title={`Outbound: ${point.outbound}`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono mt-2">{point.time}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Rate Control: Active BullMQ throttle adhering to carrier limits</span>
            <span className="font-mono text-slate-700 font-medium">Queue Concurrency: Normal</span>
          </div>
        </div>

        {/* Right Col: Connected Android Devices Quick Status */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Gateway Telephony</h3>
              <button
                onClick={onOpenConnectModal}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pair Phone</span>
              </button>
            </div>

            <div className="space-y-3">
              {devices.length === 0 ? (
                <div className="py-8 text-center">
                  <Smartphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-600 font-medium">No Android devices paired yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">Connect your phone to begin sending and receiving SMS.</p>
                  <button
                    onClick={onOpenConnectModal}
                    className="mt-3 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Connect Device
                  </button>
                </div>
              ) : (
                devices.map(device => {
                  const isConnected = device.connection_status === 'CONNECTED';
                  return (
                    <div
                      key={device.id}
                      className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className="text-xs font-semibold text-slate-900">{device.device_name}</span>
                        </div>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {device.connection_status}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate max-w-[140px]">{device.carrier_name}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="flex items-center gap-1">
                            {device.is_charging ? (
                              <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Battery className="w-3.5 h-3.5 text-slate-500" />
                            )}
                            {device.battery_level}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={() => setActiveTab('simulator')}
              className="w-full py-2 px-3 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Launch Virtual Agent Simulator</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Live SMS Messages Stream */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Live SMS Telemetry Feed</h3>
            <p className="text-xs text-slate-500 mt-0.5">Real-time incoming and dispatched mobile messages</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('send')}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Compose SMS</span>
            </button>
            <button
              onClick={() => setActiveTab('inbox')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Full Inbox
            </button>
          </div>
        </div>

        {recentMessages.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No message activity recorded yet. Send your first SMS or simulate an inbound reply.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                  <th className="py-2.5 px-3">Direction</th>
                  <th className="py-2.5 px-3">Party (From/To)</th>
                  <th className="py-2.5 px-3">Message Body</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">SIM Slot</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentMessages.slice(0, 7).map(msg => {
                  const isInbound = msg.direction === 'INBOUND';
                  return (
                    <tr key={msg.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                          isInbound ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {isInbound ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {msg.direction}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-900 font-medium">
                        {isInbound ? msg.sender : msg.recipient}
                      </td>
                      <td className="py-3 px-3 text-slate-700 max-w-md truncate">
                        {msg.message_body}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-medium px-2 py-0.5 rounded ${
                          msg.status === 'DELIVERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : msg.status === 'SENT'
                            ? 'bg-blue-100 text-blue-800'
                            : msg.status === 'DISPATCHED'
                            ? 'bg-indigo-100 text-indigo-800'
                            : msg.status === 'QUEUED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {msg.status === 'DELIVERED' && <CheckCircle2 className="w-3 h-3" />}
                          {msg.status === 'QUEUED' && <Clock className="w-3 h-3" />}
                          {msg.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500">
                        SIM {msg.sim_slot + 1}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400 text-[11px]">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
