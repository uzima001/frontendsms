import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Send,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Smartphone,
  User as UserIcon,
  Filter,
  RefreshCw
} from 'lucide-react';
import { Conversation, SmsMessage, Device } from '../types';
import { api } from '../services/api';

interface InboxViewProps {
  conversations: Conversation[];
  devices: Device[];
  onRefresh: () => void;
  onSelectSendMessage?: (recipient: string) => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  conversations,
  devices,
  onRefresh,
  onSelectSendMessage
}) => {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<SmsMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');

  // Quick reply input
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedSimSlot, setSelectedSimSlot] = useState<number>(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Set default selection
  useEffect(() => {
    if (!selectedPhone && conversations.length > 0) {
      setSelectedPhone(conversations[0].phone_number);
    }
  }, [conversations, selectedPhone]);

  // Set default device
  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) {
      const onlineDev = devices.find(d => d.connection_status === 'CONNECTED') || devices[0];
      setSelectedDeviceId(onlineDev.id);
    }
  }, [devices, selectedDeviceId]);

  // Load active thread messages
  useEffect(() => {
    if (!selectedPhone) return;
    loadThread(selectedPhone);
  }, [selectedPhone]);

  const loadThread = async (phone: string) => {
    setThreadLoading(true);
    try {
      const data = await api.getConversationThread(phone);
      setThreadMessages(data.messages);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to load thread:', err);
    } finally {
      setThreadLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    const matchesSearch =
      conv.phone_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (conv.contact_name && conv.contact_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      conv.last_message.message_body.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDevice = deviceFilter === 'all' || conv.device_id === deviceFilter;
    return matchesSearch && matchesDevice;
  });

  const selectedConversation = conversations.find(c => c.phone_number === selectedPhone);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedPhone || !selectedDeviceId) return;

    setSending(true);
    try {
      await api.sendSms({
        device_id: selectedDeviceId,
        recipient: selectedPhone,
        message_body: replyText.trim(),
        sim_slot: selectedSimSlot,
        subscription_id: selectedSimSlot + 1
      });

      setReplyText('');
      await loadThread(selectedPhone);
      onRefresh();
    } catch (err) {
      alert((err as Error).message || 'Failed to dispatch reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-65px)] flex bg-white overflow-hidden">
      {/* LEFT PANE: Conversations list */}
      <div className="w-80 lg:w-96 border-r border-slate-200 flex flex-col shrink-0 bg-slate-50/50">
        {/* Search & Filter Header */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search conversations, numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none"
            >
              <option value="all">All Gateway Devices</option>
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.device_name} ({d.carrier_name})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No conversation threads match your filter.
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = conv.phone_number === selectedPhone;
              const isOutbound = conv.last_message.direction === 'OUTBOUND';

              return (
                <button
                  key={conv.phone_number}
                  onClick={() => setSelectedPhone(conv.phone_number)}
                  className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 ${
                    isSelected ? 'bg-blue-50/80 border-l-3 border-blue-600' : 'hover:bg-slate-100/70 bg-white'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                    <UserIcon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {conv.contact_name || conv.phone_number}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(conv.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {conv.contact_name && (
                      <p className="text-[11px] text-slate-500 font-mono truncate">{conv.phone_number}</p>
                    )}

                    <p className="text-xs text-slate-600 truncate mt-1">
                      {isOutbound && <span className="text-slate-400 font-medium">You: </span>}
                      {conv.last_message.message_body}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANE: Message Thread & Quick Reply */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedConversation ? (
          <>
            {/* Thread Header */}
            <div className="h-14 px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  {selectedConversation.contact_name?.[0] || 'C'}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    {selectedConversation.contact_name || selectedConversation.phone_number}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {selectedConversation.contact_name ? `${selectedConversation.phone_number} · ` : ''}
                    {threadMessages.length} messages in thread
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => selectedPhone && loadThread(selectedPhone)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md"
                  title="Refresh thread"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${threadLoading ? 'animate-spin text-blue-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/40">
              {threadLoading && threadMessages.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">Loading conversation history...</div>
              ) : (
                threadMessages.map(msg => {
                  const isInbound = msg.direction === 'INBOUND';

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl px-4 py-2.5 shadow-2xs text-xs leading-relaxed ${
                          isInbound
                            ? 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                            : 'bg-blue-600 text-white rounded-br-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.message_body}</p>

                        <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10px] ${
                          isInbound ? 'text-slate-400' : 'text-blue-100'
                        }`}>
                          <span className="font-mono">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>

                          {!isInbound && (
                            <span title={msg.status} className="inline-flex items-center">
                              {msg.status === 'DELIVERED' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                              ) : msg.status === 'SENT' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                              ) : msg.status === 'DISPATCHED' ? (
                                <Check className="w-3.5 h-3.5 text-blue-200" />
                              ) : msg.status === 'QUEUED' ? (
                                <Clock className="w-3 h-3 text-amber-200" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-300" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Metadata tag */}
                      <span className="text-[10px] text-slate-400 mt-1 px-1 font-mono">
                        {isInbound ? `SIM ${msg.sim_slot + 1}` : msg.status}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Reply Box */}
            <form onSubmit={handleSendReply} className="p-3.5 bg-white border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Smartphone className="w-3 h-3 text-slate-400" />
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="bg-transparent border-0 font-medium text-slate-700 focus:outline-none cursor-pointer"
                    >
                      {devices.map(d => (
                        <option key={d.id} value={d.id}>{d.device_name}</option>
                      ))}
                    </select>
                  </div>

                  <select
                    value={selectedSimSlot}
                    onChange={(e) => setSelectedSimSlot(Number(e.target.value))}
                    className="bg-transparent border-0 font-medium text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value={0}>SIM 1</option>
                    <option value={1}>SIM 2</option>
                  </select>
                </div>

                <span className="font-mono text-slate-400">
                  {replyText.length} / 160 chars ({Math.ceil(replyText.length / 160) || 1} SMS)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Reply to ${selectedConversation.contact_name || selectedConversation.phone_number}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
            <Smartphone className="w-10 h-10 text-slate-300 mb-2" />
            <p className="font-medium text-slate-600">Select a conversation to view messaging history</p>
            <p className="text-[11px] text-slate-400 mt-1">Or dispatch a new SMS to initiate a thread.</p>
          </div>
        )}
      </div>
    </div>
  );
};
