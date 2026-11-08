import React from 'react';
import {
  LayoutDashboard,
  Smartphone,
  Inbox,
  Send,
  Layers,
  Users,
  Bot,
  Terminal,
  FileCode2,
  Activity,
  LogOut
} from 'lucide-react';
import { User, Device } from '../types';

export type ActiveTab =
  | 'overview'
  | 'devices'
  | 'inbox'
  | 'send'
  | 'campaigns'
  | 'contacts'
  | 'ai'
  | 'simulator'
  | 'api_docs';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: User | null;
  devices: Device[];
  isWsConnected: boolean;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  devices,
  isWsConnected,
  onLogout
}) => {
  const onlineCount = devices.filter(d => d.connection_status === 'CONNECTED').length;

  const navItems = [
    { id: 'overview' as ActiveTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'devices' as ActiveTab, label: 'Devices & SIMs', icon: Smartphone, badge: `${onlineCount}/${devices.length}` },
    { id: 'inbox' as ActiveTab, label: 'SMS Inbox', icon: Inbox },
    { id: 'send' as ActiveTab, label: 'Quick Composer', icon: Send },
    { id: 'campaigns' as ActiveTab, label: 'Bulk Campaigns', icon: Layers },
    { id: 'contacts' as ActiveTab, label: 'Contacts & Groups', icon: Users },
    { id: 'ai' as ActiveTab, label: 'AI Auto-Reply', icon: Bot },
    { id: 'simulator' as ActiveTab, label: 'Agent Simulator', icon: Terminal, highlight: true },
    { id: 'api_docs' as ActiveTab, label: 'API & Contract', icon: FileCode2 }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-none">SMS Gateway Hub</h1>
            <p className="text-[11px] text-slate-400 mt-1">Android Gateway Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Messaging Engine
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : item.highlight
                  ? 'text-amber-400 hover:bg-slate-800 hover:text-amber-300'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.highlight ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`px-1.5 py-0.5 text-[10px] rounded font-mono ${
                  isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Gateway Live Status Box */}
      <div className="p-3 mx-3 mb-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-400">WebSocket Node</span>
          <span className={`flex items-center gap-1.5 text-[11px] font-medium ${isWsConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isWsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isWsConnected ? 'Synchronized' : 'Reconnecting'}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
          <span>Active SIMs</span>
          <span className="text-slate-200 tabular-nums">{onlineCount} connected</span>
        </div>
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
            {currentUser?.name?.[0] || 'A'}
          </div>
          <div className="truncate text-left">
            <p className="text-xs font-medium text-white truncate">{currentUser?.name || 'Admin User'}</p>
            <p className="text-[11px] text-slate-400 truncate">{currentUser?.email || 'admin@smsgateway.io'}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          title="Sign out"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
