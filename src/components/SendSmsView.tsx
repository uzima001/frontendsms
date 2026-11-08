import React, { useState, useEffect } from 'react';
import {
  Send,
  Smartphone,
  Signal,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Hash,
  ShieldCheck,
  Info
} from 'lucide-react';
import { Device, Contact } from '../types';
import { api } from '../services/api';

interface SendSmsViewProps {
  devices: Device[];
  contacts: Contact[];
  onMessageSent: () => void;
  initialRecipient?: string;
}

export const SendSmsView: React.FC<SendSmsViewProps> = ({
  devices,
  contacts,
  onMessageSent,
  initialRecipient = ''
}) => {
  const [recipient, setRecipient] = useState(initialRecipient);
  const [messageBody, setMessageBody] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedSimSlot, setSelectedSimSlot] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const [loading, setLoading] = useState(false);
  const [successResult, setSuccessResult] = useState<{ messageId: string; commandId: string; status: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set default device
  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) {
      const onlineDev = devices.find(d => d.connection_status === 'CONNECTED') || devices[0];
      setSelectedDeviceId(onlineDev.id);
    }
  }, [devices, selectedDeviceId]);

  // Generate random idempotency key on mount
  useEffect(() => {
    generateNewIdempotencyKey();
  }, []);

  const generateNewIdempotencyKey = () => {
    setIdempotencyKey('idem_' + Math.random().toString(36).slice(2, 11));
  };

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  // Segment & Character Calculator
  const isUnicode = /[^\u0000-\u007F]/.test(messageBody);
  const charCount = messageBody.length;
  let segmentCount = 1;
  let maxPerSegment = 160;

  if (isUnicode) {
    maxPerSegment = charCount <= 70 ? 70 : 67;
    segmentCount = Math.ceil(charCount / maxPerSegment) || 1;
  } else {
    maxPerSegment = charCount <= 160 ? 160 : 153;
    segmentCount = Math.ceil(charCount / maxPerSegment) || 1;
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !messageBody.trim() || !selectedDeviceId) return;

    setLoading(true);
    setErrorMessage(null);
    setSuccessResult(null);

    // Normalize phone number
    let normPhone = recipient.trim().replace(/[\s-()]/g, '');
    if (normPhone.startsWith('0')) {
      normPhone = '+255' + normPhone.slice(1);
    } else if (!normPhone.startsWith('+')) {
      normPhone = '+' + normPhone;
    }

    try {
      const res = await api.sendSms({
        device_id: selectedDeviceId,
        recipient: normPhone,
        message_body: messageBody.trim(),
        sim_slot: selectedSimSlot,
        subscription_id: selectedSimSlot + 1,
        idempotency_key: idempotencyKey
      });

      setSuccessResult({
        messageId: res.message.id,
        commandId: res.command_id,
        status: res.message.status
      });

      setMessageBody('');
      generateNewIdempotencyKey();
      onMessageSent();
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to dispatch message');
    } finally {
      setLoading(false);
    }
  };

  const applyContactNumber = (phone: string) => {
    setRecipient(phone);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Direct SMS Dispatch</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Send an individual SMS command directly to a connected Android SIM card gateway.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form */}
        <form onSubmit={handleSend} className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-6 space-y-5 shadow-xs">
          {/* Recipient Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Recipient Mobile Number</label>
              <span className="text-[11px] text-slate-400 font-mono">Tanzania / International</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. +255 715 889 900 or 0754 000 000"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                required
                className="flex-1 px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Quick TZ format button */}
              <button
                type="button"
                onClick={() => {
                  if (recipient.startsWith('0')) {
                    setRecipient('+255' + recipient.slice(1));
                  } else if (!recipient.startsWith('+255') && !recipient.startsWith('+')) {
                    setRecipient('+255' + recipient);
                  }
                }}
                className="px-2.5 py-2 text-[11px] font-mono text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                title="Normalize to Tanzanian E.164 (+255)"
              >
                +255 TZ
              </button>
            </div>
          </div>

          {/* Gateway & SIM Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Gateway Android Device</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.device_name} ({d.connection_status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Physical SIM Slot</label>
              <select
                value={selectedSimSlot}
                onChange={(e) => setSelectedSimSlot(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>SIM Slot 1 (Primary)</option>
                <option value={1}>SIM Slot 2 (Secondary)</option>
              </select>
            </div>
          </div>

          {/* Message Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Message Text</label>
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                <span className={isUnicode ? 'text-amber-600 font-semibold' : 'text-slate-500'}>
                  {isUnicode ? 'Unicode (UCS-2)' : 'GSM 7-bit'}
                </span>
                <span>·</span>
                <span className="font-semibold text-slate-900">{charCount} chars</span>
                <span>·</span>
                <span className="font-semibold text-blue-600">{segmentCount} segment{segmentCount > 1 ? 's' : ''}</span>
              </div>
            </div>

            <textarea
              rows={5}
              placeholder="Type your SMS message here..."
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              required
              className="w-full p-3.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed"
            />
          </div>

          {/* Idempotency Key */}
          <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500 border-t border-slate-100">
            <span className="font-mono truncate max-w-xs">Idempotency: {idempotencyKey}</span>
            <button
              type="button"
              onClick={generateNewIdempotencyKey}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Regenerate Key
            </button>
          </div>

          {/* Status alerts */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successResult && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Command Dispatched to Android Gateway!</span>
              </div>
              <p className="font-mono text-[11px] text-emerald-700">
                Message ID: {successResult.messageId} · Command: {successResult.commandId}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !recipient.trim() || !messageBody.trim()}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Queueing SMS & Dispatched via WebSocket...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch Outbound SMS</span>
              </>
            )}
          </button>
        </form>

        {/* Right Col: Quick Contacts & Telephony Info */}
        <div className="space-y-5">
          {/* Selected Device Health Preview */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>Target Gateway Node</span>
            </div>

            {selectedDevice ? (
              <div className="text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Name</span>
                  <span className="font-medium text-slate-800">{selectedDevice.device_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                    selectedDevice.connection_status === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {selectedDevice.connection_status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Carrier</span>
                  <span className="text-slate-800">{selectedDevice.carrier_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Battery</span>
                  <span className="font-mono text-slate-800">{selectedDevice.battery_level}%</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No device selected.</p>
            )}
          </div>

          {/* Quick Contacts Pick */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900">Quick Recipient Pick</h4>
            {contacts.length === 0 ? (
              <p className="text-xs text-slate-400">No saved contacts.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {contacts.slice(0, 6).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => applyContactNumber(c.phone_number)}
                    className="w-full text-left p-2 rounded-lg hover:bg-slate-50 text-xs flex items-center justify-between border border-transparent hover:border-slate-100 transition-colors"
                  >
                    <span className="font-medium text-slate-800 truncate">{c.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">{c.phone_number}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* GSM-7 vs Unicode Guidelines Note */}
          <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-100 text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 text-blue-900 font-semibold">
              <Info className="w-3.5 h-3.5" />
              <span>SMS Segment Rules</span>
            </div>
            <p>
              Standard GSM-7 text supports up to 160 characters per single segment. Messages exceeding 160 characters are automatically concatenated into 153-character parts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
