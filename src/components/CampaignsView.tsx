import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Play,
  Pause,
  XCircle,
  Clock,
  CheckCircle2,
  Users,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw,
  Info,
  ChevronRight,
  Smartphone
} from 'lucide-react';
import { Campaign, Device, Contact, ContactGroup } from '../types';
import { api } from '../services/api';

interface CampaignsViewProps {
  campaigns: Campaign[];
  devices: Device[];
  contacts: Contact[];
  contactGroups: ContactGroup[];
  onRefresh: () => void;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  campaigns,
  devices,
  contacts,
  contactGroups,
  onRefresh
}) => {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  // Wizard state
  const [campaignName, setCampaignName] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices[0]?.id || '');
  const [selectedSimSlot, setSelectedSimSlot] = useState(0);

  // Step 2: Recipients
  const [recipientSource, setRecipientSource] = useState<'csv' | 'group' | 'manual'>('group');
  const [selectedGroupId, setSelectedGroupId] = useState(contactGroups[0]?.id || '');
  const [manualNumbers, setManualNumbers] = useState('');
  const [csvRecipients, setCsvRecipients] = useState<Array<{ phone_number: string; name: string }>>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

  // Step 3: Message template
  const [messageTemplate, setMessageTemplate] = useState('Habari {{name}}, we have new stock available today. Reply YES for details.');

  // Step 4: Rate limit & Schedule
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(30);
  const [startImmediately, setStartImmediately] = useState(true);
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Parse CSV
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      const parsed: Array<{ phone_number: string; name: string }> = [];

      for (let i = 0; i < lines.length; i++) {
        // Skip header if line 0 has phone or name
        if (i === 0 && (lines[0].toLowerCase().includes('phone') || lines[0].toLowerCase().includes('name'))) {
          continue;
        }

        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length >= 1) {
          const phone = cols[0];
          const name = cols.length > 1 ? cols[1] : '';
          if (phone) {
            parsed.push({ phone_number: phone, name });
          }
        }
      }

      setCsvRecipients(parsed);
    };
    reader.readAsText(file);
  };

  // Compile final recipient list
  const getPreparedRecipients = (): Array<{ phone_number: string; name: string }> => {
    if (recipientSource === 'csv') {
      return csvRecipients;
    } else if (recipientSource === 'group') {
      const groupContacts = contacts.filter(c => c.group_id === selectedGroupId && c.consent_status !== 'OPTED_OUT');
      return groupContacts.map(c => ({ phone_number: c.phone_number, name: c.name }));
    } else {
      const lines = manualNumbers.split(/[\n,;]/).map(s => s.trim()).filter(s => s.length > 0);
      return lines.map(num => ({ phone_number: num, name: '' }));
    }
  };

  const handleCreateCampaign = async () => {
    if (!consentConfirmed) {
      alert('You must confirm that all recipients have consented to receive messages.');
      return;
    }

    const recipients = getPreparedRecipients();
    if (recipients.length === 0) {
      alert('No valid recipients provided.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await api.createCampaign({
        campaign_name: campaignName.trim(),
        device_id: selectedDeviceId,
        sim_slot: selectedSimSlot,
        subscription_id: selectedSimSlot + 1,
        message_template: messageTemplate.trim(),
        recipients,
        rate_limit_per_minute: rateLimitPerMinute,
        start_immediately: startImmediately
      });

      setIsWizardOpen(false);
      resetWizard();
      onRefresh();
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setCampaignName('');
    setCsvRecipients([]);
    setCsvFileName(null);
    setManualNumbers('');
    setConsentConfirmed(false);
  };

  const handleStart = async (id: string) => {
    setActionLoading(id);
    try {
      await api.startCampaign(id);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id: string) => {
    setActionLoading(id);
    try {
      await api.pauseCampaign(id);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this campaign? Pending messages will be discarded.')) return;
    setActionLoading(id);
    try {
      await api.cancelCampaign(id);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Bulk SMS Campaigns</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Orchestrate high-volume outreach campaigns through connected Android SIM gateways with carrier rate-limiting.
          </p>
        </div>

        <button
          onClick={() => {
            setIsWizardOpen(true);
            resetWizard();
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Bulk Campaign</span>
        </button>
      </div>

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900">No Bulk Campaigns Created</h3>
          <p className="text-xs text-slate-500 mt-1">
            Create your first campaign to dispatch personalized SMS to groups or CSV lists.
          </p>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="mt-4 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map(camp => {
            const isProcessing = camp.status === 'PROCESSING';
            const isCompleted = camp.status === 'COMPLETED';
            const isPaused = camp.status === 'PAUSED';
            const progressPercent = camp.total_recipients > 0
              ? Math.round((camp.sent_count / camp.total_recipients) * 100)
              : 0;

            const targetDevice = devices.find(d => d.id === camp.device_id);

            return (
              <div key={camp.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-sm font-bold text-slate-900">{camp.campaign_name}</h4>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                        isProcessing
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : isCompleted
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : isPaused
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {camp.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1">
                      Target Gateway: <span className="font-medium text-slate-700">{targetDevice?.device_name || 'Android Gateway'}</span> (SIM {camp.sim_slot + 1}) · Rate: <span className="font-mono">{camp.rate_limit_per_minute} SMS/min</span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {camp.status === 'DRAFT' || camp.status === 'PAUSED' ? (
                      <button
                        onClick={() => handleStart(camp.id)}
                        disabled={actionLoading === camp.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Start</span>
                      </button>
                    ) : null}

                    {isProcessing && (
                      <button
                        onClick={() => handlePause(camp.id)}
                        disabled={actionLoading === camp.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </button>
                    )}

                    {!isCompleted && camp.status !== 'CANCELLED' && (
                      <button
                        onClick={() => handleCancel(camp.id)}
                        disabled={actionLoading === camp.id}
                        className="px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-1.5">
                    <span>
                      Progress: <strong className="text-slate-900">{camp.sent_count}</strong> of {camp.total_recipients} dispatched
                    </span>
                    <span className="font-semibold text-blue-600">{progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${progressPercent}%` }}
                      className={`h-full transition-all duration-300 ${
                        isCompleted ? 'bg-emerald-500' : 'bg-blue-600'
                      }`}
                    />
                  </div>
                </div>

                {/* Counters strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50/70 p-3 rounded-lg border border-slate-100 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase">Queued</span>
                    <p className="text-slate-800 font-bold">{camp.queued_count}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase">Sent to Carrier</span>
                    <p className="text-blue-600 font-bold">{camp.sent_count}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase">Confirmed Delivered</span>
                    <p className="text-emerald-600 font-bold">{camp.delivered_count}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase">Failed</span>
                    <p className="text-rose-600 font-bold">{camp.failed_count}</p>
                  </div>
                </div>

                {/* Template preview */}
                <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Message Template</span>
                  <p className="italic font-mono text-[11px] text-slate-700">{camp.message_template}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4-STEP CAMPAIGN WIZARD MODAL */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create Bulk SMS Campaign</h3>
                <p className="text-xs text-slate-400 font-mono">Step {wizardStep} of 4</p>
              </div>
              <button onClick={() => setIsWizardOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Steps indicator */}
            <div className="flex items-center gap-1.5 my-4">
              {[1, 2, 3, 4].map(s => (
                <div
                  key={s}
                  className={`flex-1 h-1 rounded-full ${s <= wizardStep ? 'bg-blue-600' : 'bg-slate-200'}`}
                />
              ))}
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {errorMsg}
              </div>
            )}

            {/* STEP 1: Campaign details */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Campaign Name</label>
                  <input
                    type="text"
                    placeholder="e.g. End of Month Promotion, Staff Notification"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Android Gateway Device</label>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {devices.map(d => (
                        <option key={d.id} value={d.id}>{d.device_name} ({d.carrier_name})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">SIM Slot</label>
                    <select
                      value={selectedSimSlot}
                      onChange={(e) => setSelectedSimSlot(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={0}>SIM 1 (Primary)</option>
                      <option value={1}>SIM 2 (Secondary)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    disabled={!campaignName.trim()}
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
                  >
                    <span>Next: Select Recipients</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Recipients */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setRecipientSource('group')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                      recipientSource === 'group' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Contact Group
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientSource('csv')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                      recipientSource === 'csv' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Upload CSV File
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientSource('manual')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                      recipientSource === 'manual' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Paste Numbers
                  </button>
                </div>

                {recipientSource === 'group' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Choose Recipient Group</label>
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      {contactGroups.map(g => {
                        const count = contacts.filter(c => c.group_id === g.id && c.consent_status !== 'OPTED_OUT').length;
                        return (
                          <option key={g.id} value={g.id}>{g.name} ({count} active contacts)</option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {recipientSource === 'csv' && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-700 block">Upload CSV List</label>
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-500 transition-colors bg-slate-50">
                      <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs text-slate-600 font-medium">Click to upload CSV or drag and drop</p>
                      <p className="text-[11px] text-slate-400 mt-1">Columns: phone_number, name</p>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvUpload}
                        className="mt-3 text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                    {csvFileName && (
                      <p className="text-xs text-emerald-600 font-medium">
                        Parsed {csvRecipients.length} recipients from {csvFileName}
                      </p>
                    )}
                  </div>
                )}

                {recipientSource === 'manual' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Paste Numbers (one per line or comma-separated)</label>
                    <textarea
                      rows={4}
                      value={manualNumbers}
                      onChange={(e) => setManualNumbers(e.target.value)}
                      placeholder="+255715889900&#10;+255762334455&#10;+255788112233"
                      className="w-full p-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                    />
                  </div>
                )}

                <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    disabled={getPreparedRecipients().length === 0}
                    onClick={() => setWizardStep(3)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
                  >
                    <span>Next: Compose Template ({getPreparedRecipients().length} contacts)</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Template */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">Message Template</label>
                    <span className="text-[11px] font-mono text-slate-500">
                      Placeholder: <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600">{"{{name}}"}</code>
                    </span>
                  </div>

                  <textarea
                    rows={4}
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    required
                    className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>

                {/* Live Preview */}
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                  <span className="text-[10px] font-bold text-blue-900 uppercase block mb-1">Live Personalized Preview</span>
                  <p className="text-xs text-slate-800 italic">
                    "{messageTemplate.replace(/\{\{\s*name\s*\}\}/gi, 'Juma')}"
                  </p>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(2)}
                    className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    disabled={!messageTemplate.trim()}
                    onClick={() => setWizardStep(4)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
                  >
                    <span>Next: Rate Limits & Schedule</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Rate limit & Confirmation */}
            {wizardStep === 4 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Sending Rate Limit (Adhering to Carrier Limits)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={rateLimitPerMinute}
                      onChange={(e) => setRateLimitPerMinute(Number(e.target.value))}
                      className="w-24 px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                    />
                    <span className="text-xs text-slate-500">messages per minute (BullMQ controlled)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="startImm"
                    checked={startImmediately}
                    onChange={(e) => setStartImmediately(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="startImm" className="text-xs text-slate-700 font-medium cursor-pointer">
                    Start processing campaign immediately upon creation
                  </label>
                </div>

                {/* Consent & Anti-Abuse Confirmation */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Mandatory Consent & Abuse Policy</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    By launching this campaign, you confirm that all recipients have explicitly opted in. Inbound "STOP" or "UNSUBSCRIBE" messages will automatically suppress future dispatches.
                  </p>
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentConfirmed}
                      onChange={(e) => setConsentConfirmed(e.target.checked)}
                      className="rounded border-amber-400 text-blue-600 focus:ring-blue-500"
                    />
                    <span>I verify that all recipients have consented to receive these SMS messages</span>
                  </label>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(3)}
                    className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    disabled={loading || !consentConfirmed}
                    onClick={handleCreateCampaign}
                    className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 shadow-xs"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>Launch Campaign ({getPreparedRecipients().length} Recipients)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
