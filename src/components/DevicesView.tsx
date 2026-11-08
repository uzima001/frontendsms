import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import {
  Smartphone,
  Plus,
  RefreshCw,
  Battery,
  BatteryCharging,
  Signal,
  CheckCircle2,
  AlertTriangle,
  X,
  Edit2,
  PowerOff,
  Trash2,
  Copy,
  Check,
  QrCode
} from 'lucide-react';
import { Device, PairingSessionResponse } from '../types';
import { api } from '../services/api';

interface DevicesViewProps {
  devices: Device[];
  onRefresh: () => void;
  isOpenConnectModal: boolean;
  onCloseConnectModal: () => void;
  onOpenConnectModal: () => void;
}

export const DevicesView: React.FC<DevicesViewProps> = ({
  devices,
  onRefresh,
  isOpenConnectModal,
  onCloseConnectModal,
  onOpenConnectModal
}) => {
  // Pairing modal state
  const [pairingData, setPairingData] = useState<PairingSessionResponse | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(120);
  const [isPairingSuccess, setIsPairingSuccess] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rename modal
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [newName, setNewName] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Start pairing session when modal opens
  useEffect(() => {
    if (isOpenConnectModal) {
      initiatePairing();
    } else {
      setPairingData(null);
      setIsPairingSuccess(false);
      setPairingError(null);
    }
  }, [isOpenConnectModal]);

  // Countdown timer for pairing secret (2-minute expiration requirement)
  useEffect(() => {
    if (!pairingData || isPairingSuccess) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(pairingData.expires_at).getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        setPairingError('QR code has expired for security. Please generate a new code.');
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pairingData, isPairingSuccess]);

  // Render QR code to canvas
  useEffect(() => {
    if (pairingData && qrCanvasRef.current && !isPairingSuccess) {
      const payloadString = JSON.stringify({
        pairing_session_id: pairingData.pairing_session_id,
        pairing_secret: pairingData.pairing_secret,
        api_url: pairingData.api_url,
        ws_url: pairingData.ws_url,
        expires_at: pairingData.expires_at
      });

      QRCode.toCanvas(qrCanvasRef.current, payloadString, {
        width: 240,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      }).catch(err => {
        console.error('QR code generation failed:', err);
      });
    }
  }, [pairingData, isPairingSuccess]);

  // Poll pairing status or wait for WS
  useEffect(() => {
    if (!pairingData || isPairingSuccess || secondsRemaining <= 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await api.getPairingStatus(pairingData.pairing_session_id);
        if (res.status === 'CONFIRMED') {
          setIsPairingSuccess(true);
          try {
            confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
          } catch {}
          onRefresh();
          clearInterval(pollInterval);
        } else if (res.status === 'EXPIRED') {
          setPairingError('Pairing session expired.');
          clearInterval(pollInterval);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [pairingData, isPairingSuccess, secondsRemaining]);

  const initiatePairing = async () => {
    setPairingLoading(true);
    setPairingError(null);
    setIsPairingSuccess(false);

    try {
      const res = await api.initiatePairing();
      setPairingData(res);
      const remaining = Math.max(0, Math.floor((new Date(res.expires_at).getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    } catch (err) {
      setPairingError((err as Error).message || 'Failed to initiate pairing session');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    if (!confirm('Are you sure you want to disconnect this Android gateway?')) return;
    setActionLoading(deviceId);
    try {
      await api.disconnectDevice(deviceId);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (deviceId: string) => {
    if (!confirm('REVOKE DEVICE: This device will permanently lose all authorization tokens and cannot reconnect without scanning a new QR code. Continue?')) return;
    setActionLoading(deviceId);
    try {
      await api.revokeDevice(deviceId);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice || !newName.trim()) return;

    setActionLoading(editingDevice.id);
    try {
      await api.renameDevice(editingDevice.id, newName.trim());
      setEditingDevice(null);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Connected Android Devices</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage physical mobile SIM nodes relaying SMS between your web control panel and cellular carriers.
          </p>
        </div>

        <button
          onClick={onOpenConnectModal}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs shrink-0"
        >
          <QrCode className="w-4 h-4" />
          <span>Connect New Device</span>
        </button>
      </div>

      {/* Devices Grid */}
      {devices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto">
          <Smartphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900">No Gateway Devices Connected</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Scan a QR code using the companion Android Gateway Agent app to link a physical SIM card.
          </p>
          <button
            onClick={onOpenConnectModal}
            className="mt-4 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
          >
            Pair First Android Phone
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {devices.map(device => {
            const isConnected = device.connection_status === 'CONNECTED';
            const isRevoked = device.connection_status === 'REVOKED';

            return (
              <div
                key={device.id}
                className={`bg-white rounded-xl border transition-all ${
                  isRevoked
                    ? 'border-slate-200 opacity-60 bg-slate-50'
                    : isConnected
                    ? 'border-slate-200 shadow-xs hover:border-slate-300'
                    : 'border-slate-200'
                } p-5 flex flex-col justify-between`}
              >
                <div>
                  {/* Top Bar of Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        isConnected ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{device.device_name}</h4>
                        <p className="text-[11px] text-slate-500 font-mono">{device.device_model} · {device.android_version}</p>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded font-medium ${
                      isConnected
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : isRevoked
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : isRevoked ? 'bg-rose-500' : 'bg-slate-400'}`} />
                      {device.connection_status}
                    </span>
                  </div>

                  {/* Telemetry info */}
                  <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Battery</span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-slate-800 font-mono">
                        {device.is_charging ? (
                          <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Battery className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span>{device.battery_level}%</span>
                        {device.is_charging && <span className="text-[10px] text-emerald-600 font-sans">Charging</span>}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Carrier</span>
                      <p className="text-slate-800 mt-0.5 text-[11px] font-medium truncate">
                        {device.carrier_name || 'Standard GSM'}
                      </p>
                    </div>
                  </div>

                  {/* SIM Slots Details */}
                  <div className="mt-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Physical SIM Modules ({device.sim_slots?.length || 1})
                    </span>
                    {(device.sim_slots || []).map((slot, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Signal className="w-3 h-3 text-blue-600" />
                          <span className="font-medium text-slate-700">SIM {slot.slot_index + 1}: {slot.carrier}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">
                          {slot.phone_number || 'Ready'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Heartbeat info */}
                  <div className="mt-3 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                    <span>Last Heartbeat:</span>
                    <span className="text-slate-600">
                      {device.last_heartbeat_at
                        ? new Date(device.last_heartbeat_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Never'}
                    </span>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setEditingDevice(device);
                      setNewName(device.device_name);
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                    title="Rename Device"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-2">
                    {isConnected && (
                      <button
                        onClick={() => handleDisconnect(device.id)}
                        disabled={actionLoading === device.id}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors border border-slate-200"
                      >
                        Disconnect
                      </button>
                    )}

                    {!isRevoked && (
                      <button
                        onClick={() => handleRevoke(device.id)}
                        disabled={actionLoading === device.id}
                        className="px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md transition-colors border border-rose-200"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WHATSAPP WEB-STYLE QR PAIRING MODAL (Conforming to Section 7) */}
      {isOpenConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <QrCode className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Connect Android Device</h3>
              </div>
              <button
                onClick={onCloseConnectModal}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            {isPairingSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto animate-bounce">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-slate-900">Device Paired & Connected!</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Your Android Gateway Agent has authenticated and established an active WebSocket connection.
                </p>
                <button
                  onClick={onCloseConnectModal}
                  className="mt-4 px-6 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                >
                  Go to Dashboard
                </button>
              </div>
            ) : (
              <div className="py-4 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Open the <strong>Android SMS Gateway Agent</strong> on your phone and scan this QR code to authenticate:
                </p>

                {/* QR Display Card */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center min-h-[260px]">
                  {pairingLoading ? (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <span className="text-xs">Generating secure pairing secret...</span>
                    </div>
                  ) : pairingError ? (
                    <div className="text-center p-3 text-xs text-rose-600 space-y-2">
                      <AlertTriangle className="w-6 h-6 mx-auto text-rose-500" />
                      <p>{pairingError}</p>
                      <button
                        onClick={initiatePairing}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Generate New Code
                      </button>
                    </div>
                  ) : (
                    <>
                      <canvas ref={qrCanvasRef} className="rounded-lg shadow-xs" />
                      <div className="mt-3 flex items-center justify-between w-full px-2 text-xs">
                        <span className="text-slate-500 font-mono">
                          Expires in: <strong className={secondsRemaining < 30 ? 'text-rose-600' : 'text-slate-900'}>{secondsRemaining}s</strong>
                        </span>
                        <button
                          onClick={initiatePairing}
                          className="text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Reload</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Quick copy credentials helper */}
                {pairingData && (
                  <div className="bg-slate-100 p-2.5 rounded-lg text-[11px] font-mono text-slate-600 flex items-center justify-between">
                    <span className="truncate max-w-[280px]">Session: {pairingData.pairing_session_id}</span>
                    <button
                      onClick={() => copyToClipboard(pairingData.pairing_secret, 'secret')}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Copy Secret"
                    >
                      {copiedKey === 'secret' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}

                <div className="text-[11px] text-slate-400 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/80">
                  <span className="font-semibold text-blue-900">Security Invariant:</span> Single-use token expires in 2 minutes. The Android agent receives credentials without transmitting user passwords.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {editingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form onSubmit={handleRenameSubmit} className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Rename Gateway Device</h3>
            <p className="text-xs text-slate-500 mb-3">Provide a friendly name for this Android hardware SIM node:</p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Dar Warehouse SIM 1"
              autoFocus
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingDevice(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading === editingDevice.id}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
