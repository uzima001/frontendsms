import React, { useState } from 'react';
import {
  Users,
  Plus,
  Upload,
  Download,
  Search,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { Contact, ContactGroup } from '../types';
import { api } from '../services/api';

interface ContactsViewProps {
  contacts: Contact[];
  contactGroups: ContactGroup[];
  onRefresh: () => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts,
  contactGroups,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Add form
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [groupId, setGroupId] = useState('');

  // New Group form
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');

  // CSV Import state
  const [csvData, setCsvData] = useState<Array<{ name: string; phone_number: string; email?: string }>>([]);
  const [importGroupId, setImportGroupId] = useState('');

  const [loading, setLoading] = useState(false);

  const filteredContacts = contacts.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesGroup = selectedGroup === 'all' || c.group_id === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneNumber.trim()) return;

    setLoading(true);
    try {
      await api.createContact({
        name: name.trim(),
        phone_number: phoneNumber.trim(),
        email: email.trim() || undefined,
        group_id: groupId || undefined,
        consent_status: 'GRANTED'
      });

      setIsAddModalOpen(false);
      setName('');
      setPhoneNumber('');
      setEmail('');
      setGroupId('');
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setLoading(true);
    try {
      await api.createContactGroup({
        name: groupName.trim(),
        description: groupDesc.trim() || undefined
      });

      setIsGroupModalOpen(false);
      setGroupName('');
      setGroupDesc('');
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await api.deleteContact(id);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleToggleOptOut = async (contact: Contact) => {
    const newStatus = contact.consent_status === 'OPTED_OUT' ? 'GRANTED' : 'OPTED_OUT';
    try {
      await api.updateContact(contact.id, {
        consent_status: newStatus
      });
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleExportCsv = () => {
    if (contacts.length === 0) return;
    const headers = ['Name', 'Phone Number', 'Email', 'Group', 'Consent Status'];
    const rows = contacts.map(c => [
      `"${c.name}"`,
      `"${c.phone_number}"`,
      `"${c.email || ''}"`,
      `"${contactGroups.find(g => g.id === c.group_id)?.name || ''}"`,
      `"${c.consent_status}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sms_contacts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      const parsed: Array<{ name: string; phone_number: string; email?: string }> = [];

      for (let i = 0; i < lines.length; i++) {
        if (i === 0 && (lines[0].toLowerCase().includes('name') || lines[0].toLowerCase().includes('phone'))) {
          continue;
        }
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length >= 2) {
          parsed.push({
            name: cols[0],
            phone_number: cols[1],
            email: cols[2] || undefined
          });
        }
      }
      setCsvData(parsed);
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (csvData.length === 0) return;
    setLoading(true);
    try {
      await api.importContacts(csvData, importGroupId || undefined);
      setIsImportModalOpen(false);
      setCsvData([]);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Contacts & Recipient Groups</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage recipient directories, campaign segments, consent records, and STOP opt-out suppression.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>
          <button
            onClick={() => setIsGroupModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Group</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, phone number or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Filter Group:</span>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none"
          >
            <option value="all">All Groups ({contacts.length})</option>
            {contactGroups.map(g => {
              const count = contacts.filter(c => c.group_id === g.id).length;
              return (
                <option key={g.id} value={g.id}>{g.name} ({count})</option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredContacts.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No contacts match the criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                  <th className="py-3 px-4">Contact Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">Consent Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContacts.map(contact => {
                  const group = contactGroups.find(g => g.id === contact.group_id);
                  const isOptedOut = contact.consent_status === 'OPTED_OUT';

                  return (
                    <tr key={contact.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {contact.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 font-medium">
                        {contact.phone_number}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {contact.email || '—'}
                      </td>
                      <td className="py-3 px-4">
                        {group ? (
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                            {group.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleOptOut(contact)}
                          title="Click to toggle opt-out suppression"
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                            isOptedOut
                              ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {isOptedOut ? <XCircle className="w-3 h-3 text-rose-500" /> : <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          {contact.consent_status}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                          title="Delete Contact"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD CONTACT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form onSubmit={handleAddContact} className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Add New Contact</h3>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Baraka Mwita"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Mobile Phone Number</label>
              <input
                type="text"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+255 7XX XXX XXX or 07XXXXXXXX"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address (Optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Assign to Group</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="">No Group</option>
                {contactGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
              >
                Save Contact
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CREATE GROUP MODAL */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form onSubmit={handleCreateGroup} className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Create Contact Group</h3>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Group Name</label>
              <input
                type="text"
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. VIP Retail Clients"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Description (Optional)</label>
              <input
                type="text"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                placeholder="e.g. Dar es Salaam branch recurring buyers"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
              >
                Create Group
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Import Contacts via CSV</h3>
            <p className="text-xs text-slate-500">
              Upload a file with columns: <strong>name, phone_number, email</strong>
            </p>

            <input
              type="file"
              accept=".csv"
              onChange={handleCsvFileSelect}
              className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700"
            />

            {csvData.length > 0 && (
              <p className="text-xs text-emerald-600 font-semibold">
                Ready to import {csvData.length} records.
              </p>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Target Group</label>
              <select
                value={importGroupId}
                onChange={(e) => setImportGroupId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="">No Group</option>
                {contactGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={csvData.length === 0 || loading}
                onClick={handleImportSubmit}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-xs"
              >
                Import {csvData.length} Contacts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
