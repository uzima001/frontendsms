import React, { useState } from 'react';
import {
  Bot,
  Sparkles,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Play,
  Save,
  RefreshCw,
  Sliders,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { AiSettings, AiAutomationLog, Device } from '../types';
import { api } from '../services/api';

interface AiSettingsViewProps {
  settings: AiSettings | null;
  logs: AiAutomationLog[];
  devices: Device[];
  onRefresh: () => void;
}

export const AiSettingsView: React.FC<AiSettingsViewProps> = ({
  settings,
  logs,
  devices,
  onRefresh
}) => {
  // Settings form state
  const [enabled, setEnabled] = useState(settings?.enabled ?? true);
  const [deviceId, setDeviceId] = useState(settings?.device_id || devices[0]?.id || '');
  const [systemInstructions, setSystemInstructions] = useState(
    settings?.system_instructions ||
      'You are a courteous, professional customer support assistant for SMS Gateway Hub in Tanzania. Provide concise, direct answers under 160 characters. Support English and Swahili.'
  );
  const [responseLanguage, setResponseLanguage] = useState(settings?.response_language || 'English and Swahili');
  const [maximumResponseLength, setMaximumResponseLength] = useState(settings?.maximum_response_length || 160);
  const [dailyLimit, setDailyLimit] = useState(settings?.daily_limit || 100);
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(settings?.response_delay_seconds || 3);
  const [cooldownMinutes, setCooldownMinutes] = useState(settings?.cooldown_minutes || 15);
  const [approvalMode, setApprovalMode] = useState(settings?.approval_mode ?? false);
  const [fallbackResponse, setFallbackResponse] = useState(
    settings?.fallback_response || 'Thank you for reaching out. An agent will respond to your inquiry shortly.'
  );

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Interactive Sandbox state
  const [testInquiry, setTestInquiry] = useState('Habari! What are your business working hours this weekend?');
  const [testResult, setTestResult] = useState<{ reply: string; latencyMs: number } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      await api.updateAiSettings({
        enabled,
        device_id: deviceId || null,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        system_instructions: systemInstructions,
        response_language: responseLanguage,
        maximum_response_length: maximumResponseLength,
        daily_limit: dailyLimit,
        response_delay_seconds: responseDelaySeconds,
        cooldown_minutes: cooldownMinutes,
        approval_mode: approvalMode,
        fallback_response: fallbackResponse
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrompt = async () => {
    if (!testInquiry.trim()) return;
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await api.testAiPrompt({
        system_instructions: systemInstructions,
        incoming_text: testInquiry.trim(),
        language: responseLanguage,
        max_length: maximumResponseLength
      });
      setTestResult(res);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">AI Auto-Reply Configuration</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Automate intelligent conversational SMS replies powered by Google Gemini API with guardrails and anti-looping.
          </p>
        </div>

        {/* Master AI Toggle */}
        <div className="flex items-center gap-3 bg-white p-2.5 px-4 rounded-xl border border-slate-200 shadow-2xs shrink-0">
          <div className="text-left">
            <span className="text-xs font-bold text-slate-900 block">Master Automation</span>
            <span className="text-[11px] text-slate-500">{enabled ? 'Active Engine' : 'Paused'}</span>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Settings Form */}
        <form onSubmit={handleSaveSettings} className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">System Instructions & Behavior</h3>
            </div>
            <span className="text-[11px] font-mono text-purple-600 font-semibold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              gemini-3.8-flash
            </span>
          </div>

          {/* System Instructions Textarea */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              System Prompt & Business Persona Instructions
            </label>
            <textarea
              rows={5}
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              placeholder="Provide exact knowledge, store hours, pricing rules, and voice tone..."
              required
              className="w-full p-3.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Instructions given directly to Gemini model for contextual reasoning.
            </p>
          </div>

          {/* Grid Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Primary Target Gateway</label>
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="">Any Active Gateway</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.device_name} ({d.carrier_name})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Response Language</label>
              <input
                type="text"
                value={responseLanguage}
                onChange={(e) => setResponseLanguage(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Max Characters per Reply</label>
              <input
                type="number"
                min={50}
                max={320}
                value={maximumResponseLength}
                onChange={(e) => setMaximumResponseLength(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
              <span className="text-[10px] text-slate-400">160 chars = 1 single SMS segment</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Daily Response Limit</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
                <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                  ({settings?.daily_used || 0} used today)
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Natural Response Delay</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={responseDelaySeconds}
                  onChange={(e) => setResponseDelaySeconds(Number(e.target.value))}
                  className="w-24 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
                <span className="text-xs text-slate-500">seconds delay before sending reply</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Anti-Loop Cooldown</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                  className="w-24 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
                <span className="text-xs text-slate-500">minutes cooldown after 3 auto-replies</span>
              </div>
            </div>
          </div>

          {/* Fallback Response */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Fallback Response</label>
            <input
              type="text"
              value={fallbackResponse}
              onChange={(e) => setFallbackResponse(e.target.value)}
              placeholder="Message sent if AI provider fails or rate limit is reached"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          {/* Human Approval Mode Toggle */}
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              id="approvalMode"
              checked={approvalMode}
              onChange={(e) => setApprovalMode(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="approvalMode" className="text-xs text-slate-700 cursor-pointer">
              <strong className="block text-slate-900 font-semibold">Human Approval Mode</strong>
              Replies are generated and saved in the inbox drafts queue, requiring operator confirmation before sending via SIM.
            </label>
          </div>

          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>AI settings successfully saved and applied!</span>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2 shadow-xs"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save AI Configuration</span>
            </button>
          </div>
        </form>

        {/* Right Col: Interactive Sandbox Testing Area */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-bold text-slate-900">Interactive Prompt Sandbox</h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Test how Gemini responds to customer inquiries using your current system prompt without dispatching a live SMS:
            </p>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Simulated Inbound Message</label>
              <textarea
                rows={3}
                value={testInquiry}
                onChange={(e) => setTestInquiry(e.target.value)}
                placeholder="e.g. Do you deliver to Arusha? How much is shipping?"
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
              />
            </div>

            <button
              type="button"
              onClick={handleTestPrompt}
              disabled={testLoading || !testInquiry.trim()}
              className="w-full py-2 px-3 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {testLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  <span>Generating via Gemini 3.8 Flash...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-purple-600" />
                  <span>Test AI Response Preview</span>
                </>
              )}
            </button>

            {/* Test Result Display */}
            {testResult && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span className="font-semibold text-purple-700">Preview Output</span>
                  <span>{testResult.latencyMs}ms · {testResult.reply.length} chars</span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-900 leading-relaxed font-sans shadow-2xs">
                  {testResult.reply}
                </div>
              </div>
            )}
          </div>

          {/* Safety Safeguards Note */}
          <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Anti-Looping & Guardrails</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              The engine automatically caps consecutive automated responses to 3 per number to prevent infinite AI-to-AI or auto-responder loops. Stop keywords (STOP, SITAKI) automatically suppress future automated replies.
            </p>
          </div>
        </div>
      </div>

      {/* Automation Audit Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">AI Auto-Reply Audit History</h3>
            <p className="text-xs text-slate-500 mt-0.5">Audit log of all inbound triggers and model responses</p>
          </div>
          <span className="font-mono text-xs text-slate-500">{logs.length} logged events</span>
        </div>

        {logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No automated responses logged yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                  <th className="py-2.5 px-3">Sender Phone</th>
                  <th className="py-2.5 px-3">Inbound Customer Query</th>
                  <th className="py-2.5 px-3">Generated AI Response</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 font-mono">Latency</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.slice(0, 8).map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono text-slate-900 font-medium">
                      {log.phone_number}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                      {log.incoming_text}
                    </td>
                    <td className="py-2.5 px-3 text-slate-900 max-w-sm truncate font-medium">
                      {log.generated_response}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded font-medium ${
                        log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      {log.latency_ms}ms
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-[11px]">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
