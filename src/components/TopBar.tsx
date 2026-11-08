import React from 'react';
import { Send, RefreshCw } from 'lucide-react';
import { ActiveTab } from './Navigation';

interface TopBarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isWsConnected: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  isWsConnected,
  onRefresh,
  isRefreshing
}) => {
  const getTabLabel = (tab: ActiveTab) => {
    switch (tab) {
      case 'overview': return 'Gateway Overview';
      case 'devices': return 'Device & SIM Management';
      case 'inbox': return 'Conversational SMS Inbox';
      case 'send': return 'Dispatch Single Message';
      case 'campaigns': return 'Bulk Campaign Engine';
      case 'contacts': return 'Contacts & Consent Directory';
      case 'ai': return 'AI Auto-Reply Configuration';
      case 'simulator': return 'Android Agent Protocol Inspector';
      case 'api_docs': return 'Developer Contract & Specs';
      default: return 'Dashboard';
    }
  };

  return (
    <header className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Section Title and Path */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-slate-900 whitespace-nowrap shrink-0">
          {getTabLabel(activeTab)}
        </h2>
        <span className="text-slate-300 font-light">|</span>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="font-mono text-[11px]">{isWsConnected ? 'WSS Live' : 'Connecting...'}</span>
        </div>
      </div>

      {/* Zone 2: Fast Navigation Shortcuts */}
      <nav className="hidden lg:flex items-center gap-5 text-xs font-medium text-slate-600">
        <button
          onClick={() => setActiveTab('overview')}
          className={`transition-colors whitespace-nowrap ${activeTab === 'overview' ? 'text-blue-600 font-semibold' : 'hover:text-slate-900'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('devices')}
          className={`transition-colors whitespace-nowrap ${activeTab === 'devices' ? 'text-blue-600 font-semibold' : 'hover:text-slate-900'}`}
        >
          Gateways
        </button>
        <button
          onClick={() => setActiveTab('inbox')}
          className={`transition-colors whitespace-nowrap ${activeTab === 'inbox' ? 'text-blue-600 font-semibold' : 'hover:text-slate-900'}`}
        >
          Inbox
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`transition-colors whitespace-nowrap ${activeTab === 'campaigns' ? 'text-blue-600 font-semibold' : 'hover:text-slate-900'}`}
        >
          Bulk SMS
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={`transition-colors whitespace-nowrap ${activeTab === 'simulator' ? 'text-blue-600 font-semibold' : 'hover:text-slate-900'}`}
        >
          Agent Inspector
        </button>
      </nav>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Reload state from backend"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
        </button>

        <button
          onClick={() => setActiveTab('send')}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm whitespace-nowrap shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span>New SMS</span>
        </button>
      </div>
    </header>
  );
};
