import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, ActiveTab } from './components/Navigation';
import { TopBar } from './components/TopBar';
import { OverviewView } from './components/OverviewView';
import { DevicesView } from './components/DevicesView';
import { InboxView } from './components/InboxView';
import { SendSmsView } from './components/SendSmsView';
import { CampaignsView } from './components/CampaignsView';
import { ContactsView } from './components/ContactsView';
import { AiSettingsView } from './components/AiSettingsView';
import { SimulatorView } from './components/SimulatorView';
import { ApiDocsView } from './components/ApiDocsView';

import {
  User,
  Device,
  SmsMessage,
  Conversation,
  Campaign,
  Contact,
  ContactGroup,
  AiSettings,
  AiAutomationLog,
  OverviewAnalytics
} from './types';
import { api } from './services/api';
import { useGatewaySocket } from './hooks/useGatewaySocket';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Core application data states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [recentMessages, setRecentMessages] = useState<SmsMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiLogs, setAiLogs] = useState<AiAutomationLog[]>([]);
  const [analytics, setAnalytics] = useState<OverviewAnalytics | null>(null);

  // UI state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOpenConnectModal, setIsOpenConnectModal] = useState(false);
  const [composerRecipient, setComposerRecipient] = useState('');

  // WebSocket hook for live updates
  const { isConnected: isWsConnected, addListener } = useGatewaySocket(currentUser?.id);

  // Initial load
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch user profile
      try {
        const me = await api.getMe();
        setCurrentUser(me.user);
      } catch {
        // Fallback demo user
        setCurrentUser({
          id: 'usr_admin_001',
          name: 'Sarah Kimaro',
          email: 'admin@smsgateway.io',
          status: 'ACTIVE'
        });
      }

      // 2. Fetch resources in parallel
      const [
        devicesData,
        messagesData,
        conversationsData,
        campaignsData,
        contactsData,
        groupsData,
        aiSettingsData,
        aiLogsData,
        analyticsData
      ] = await Promise.all([
        api.getDevices().catch(() => []),
        api.getMessages().catch(() => []),
        api.getConversations().catch(() => []),
        api.getCampaigns().catch(() => []),
        api.getContacts().catch(() => []),
        api.getContactGroups().catch(() => []),
        api.getAiSettings().catch(() => null),
        api.getAiLogs().catch(() => []),
        api.getOverviewAnalytics().catch(() => null)
      ]);

      setDevices(devicesData);
      setRecentMessages(messagesData);
      setConversations(conversationsData);
      setCampaigns(campaignsData);
      setContacts(contactsData);
      setContactGroups(groupsData);
      setAiSettings(aiSettingsData);
      setAiLogs(aiLogsData);
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Error loading gateway data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Wire real-time WebSocket listeners
  useEffect(() => {
    // 1. SMS Received from Android phone
    const unsubs: Array<() => void> = [];

    unsubs.push(
      addListener('SMS_RECEIVED', (payload) => {
        console.log('[App] Realtime SMS_RECEIVED:', payload);
        const newMsg: SmsMessage = {
          id: String(payload.message_id || 'msg_' + Date.now()),
          user_id: currentUser?.id || 'usr_admin_001',
          device_id: String(payload.device_id),
          direction: 'INBOUND',
          sender: String(payload.sender),
          recipient: String(payload.recipient),
          message_body: String(payload.message_body),
          status: 'DELIVERED',
          sim_slot: Number(payload.sim_slot || 0),
          subscription_id: Number(payload.sim_slot || 0) + 1,
          received_at: String(payload.received_at || new Date().toISOString()),
          created_at: String(payload.received_at || new Date().toISOString())
        };

        setRecentMessages(prev => [newMsg, ...prev]);

        // Refresh conversations & analytics quietly
        api.getConversations().then(setConversations).catch(() => {});
        api.getOverviewAnalytics().then(setAnalytics).catch(() => {});
        api.getAiLogs().then(setAiLogs).catch(() => {});
      })
    );

    // 2. SMS Sent / Delivered / Failed status updates
    unsubs.push(
      addListener('SMS_SENT', (payload) => {
        setRecentMessages(prev =>
          prev.map(m => (m.id === payload.message_id ? { ...m, status: 'SENT', sent_at: String(payload.sent_at) } : m))
        );
      })
    );

    unsubs.push(
      addListener('SMS_DELIVERED', (payload) => {
        setRecentMessages(prev =>
          prev.map(m => (m.id === payload.message_id ? { ...m, status: 'DELIVERED', delivered_at: String(payload.delivered_at) } : m))
        );
      })
    );

    unsubs.push(
      addListener('SMS_FAILED', (payload) => {
        setRecentMessages(prev =>
          prev.map(m => (m.id === payload.message_id ? { ...m, status: 'FAILED', error_message: String(payload.error_message) } : m))
        );
      })
    );

    // 3. Device status & connectivity
    unsubs.push(
      addListener('DEVICE_CONNECTED', (payload) => {
        setDevices(prev =>
          prev.map(d => (d.id === payload.device_id ? { ...d, connection_status: 'CONNECTED', gateway_status: 'IDLE' } : d))
        );
        api.getDevices().then(setDevices).catch(() => {});
        api.getOverviewAnalytics().then(setAnalytics).catch(() => {});
      })
    );

    unsubs.push(
      addListener('DEVICE_DISCONNECTED', (payload) => {
        setDevices(prev =>
          prev.map(d => (d.id === payload.device_id ? { ...d, connection_status: 'DISCONNECTED', gateway_status: 'OFFLINE' } : d))
        );
        api.getOverviewAnalytics().then(setAnalytics).catch(() => {});
      })
    );

    unsubs.push(
      addListener('DEVICE_STATUS', (payload) => {
        setDevices(prev =>
          prev.map(d => {
            if (d.id === payload.device_id) {
              return {
                ...d,
                ...(typeof payload.battery_level === 'number' ? { battery_level: payload.battery_level } : {}),
                ...(typeof payload.is_charging === 'boolean' ? { is_charging: payload.is_charging } : {})
              };
            }
            return d;
          })
        );
      })
    );

    // 4. Campaign progress
    unsubs.push(
      addListener('CAMPAIGN_PROGRESS', (payload) => {
        setCampaigns(prev =>
          prev.map(c => {
            if (c.id === payload.campaign_id) {
              return {
                ...c,
                sent_count: Number(payload.sent || c.sent_count),
                delivered_count: Number(payload.delivered || c.delivered_count),
                failed_count: Number(payload.failed || c.failed_count),
                queued_count: Number(payload.queued || c.queued_count)
              };
            }
            return c;
          })
        );
      })
    );

    return () => {
      unsubs.forEach(u => u());
    };
  }, [addListener, currentUser]);

  const handleLogout = async () => {
    try {
      await api.logout();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const handleSelectSendMessage = (rec: string) => {
    setComposerRecipient(rec);
    setActiveTab('send');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      {/* Dark Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        devices={devices}
        isWsConnected={isWsConnected}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar with Top Bar Contract */}
        <TopBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isWsConnected={isWsConnected}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewView
              analytics={analytics}
              devices={devices}
              recentMessages={recentMessages}
              setActiveTab={setActiveTab}
              onOpenConnectModal={() => setIsOpenConnectModal(true)}
            />
          )}

          {activeTab === 'devices' && (
            <DevicesView
              devices={devices}
              onRefresh={loadAllData}
              isOpenConnectModal={isOpenConnectModal}
              onCloseConnectModal={() => setIsOpenConnectModal(false)}
              onOpenConnectModal={() => setIsOpenConnectModal(true)}
            />
          )}

          {activeTab === 'inbox' && (
            <InboxView
              conversations={conversations}
              devices={devices}
              onRefresh={loadAllData}
              onSelectSendMessage={handleSelectSendMessage}
            />
          )}

          {activeTab === 'send' && (
            <SendSmsView
              devices={devices}
              contacts={contacts}
              onMessageSent={loadAllData}
              initialRecipient={composerRecipient}
            />
          )}

          {activeTab === 'campaigns' && (
            <CampaignsView
              campaigns={campaigns}
              devices={devices}
              contacts={contacts}
              contactGroups={contactGroups}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'contacts' && (
            <ContactsView
              contacts={contacts}
              contactGroups={contactGroups}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'ai' && (
            <AiSettingsView
              settings={aiSettings}
              logs={aiLogs}
              devices={devices}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'simulator' && (
            <SimulatorView
              devices={devices}
              recentMessages={recentMessages}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'api_docs' && (
            <ApiDocsView />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
