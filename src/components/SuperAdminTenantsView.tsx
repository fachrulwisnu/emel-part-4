import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Search, 
  Settings2, 
  Trash2, 
  FileText, 
  Layers, 
  Sparkles, 
  Server, 
  MessageSquare, 
  User, 
  Key, 
  Eye, 
  EyeOff, 
  UserCheck, 
  Check, 
  Save, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Bot, 
  Sliders 
} from 'lucide-react';

export interface TenantPermissions {
  dashboard: boolean;
  cit_dispatch: boolean;
  daily_summary: boolean;
  mail_wa_setup: boolean;
  dynamic_filters: boolean;
  order_input_read?: boolean;
  order_input_create?: boolean;
  order_input_update?: boolean;
  order_input_delete?: boolean;
}

export interface TenantConfig {
  id: number;
  name: string;
  ai_primary_model?: string;
  ai_fallback_model?: string;
  ai_models?: string[];
  feature_individual_parsing: boolean;
  feature_bulk_summary: boolean;
  pop3_host?: string;
  pop3_port?: number;
  pop3_user?: string;
  pop3_pass?: string;
  wa_phone?: string;
  admin_email?: string;
  admin_password?: string;
  permissions?: TenantPermissions;
  created_at?: string;
}

const AVAILABLE_AI_MODELS = [
  { id: 'Gemini Flash Latest', name: 'Gemini Flash Latest', desc: 'Model Google Gemini Flash terbaru via REST API resmi', provider: 'Google Cloud' },
  { id: 'Custom AI Core', name: 'Custom AI Core', desc: 'Engine utama klasifikasi email & penarikan entitas', provider: 'Internal Core' },
  { id: 'Custom AI Vision', name: 'Custom AI Vision', desc: 'Engine multimodal OCR untuk parsing lampiran PDF/Gambar', provider: 'Internal Vision' },
  { id: 'Nemotron 3 Nano Omni 30B', name: 'Nemotron 3 Nano Omni 30B', desc: 'Model 30B parameter super cepat ultra-low latency', provider: 'NVIDIA' },
  { id: 'Nemotron 3 Super 120B', name: 'Nemotron 3 Super 120B', desc: 'Model 120B parameter reasoning & ROTATOR kompleks', provider: 'NVIDIA' },
  { id: 'OpenAI GPT-OSS 120B', name: 'OpenAI GPT-OSS 120B', desc: 'Model Cascade Fallback Tier 1 OSS 120B', provider: 'OpenAI / NVIDIA' },
  { id: 'Nemotron 3 Ultra 550B', name: 'Nemotron 3 Ultra 550B', desc: 'Model Ultra Deep Reasoning Engine 550B', provider: 'NVIDIA' },
  { id: 'StepFun AI Step 3.7 Flash', name: 'StepFun AI Step 3.7 Flash', desc: 'Model real-time flash untuk rangkuman harian', provider: 'StepFun' }
];

export const SuperAdminTenantsView: React.FC = () => {
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTenant, setEditingTenant] = useState<TenantConfig | null>(null);
  const [modalTab, setModalTab] = useState<'info' | 'ai' | 'user'>('info');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadTenants = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/tenants');
      const data = await res.json();
      if (data.success && data.tenants) {
        setTenants(data.tenants);
      }
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleOpenAddTenant = () => {
    setModalTab('info');
    setShowPassword(false);
    setEditingTenant({
      id: 0,
      name: '',
      admin_email: '',
      admin_password: '',
      ai_models: ['Custom AI Core'],
      feature_individual_parsing: false,
      feature_bulk_summary: false,
      pop3_host: '',
      pop3_port: 110,
      pop3_user: '',
      pop3_pass: '',
      wa_phone: '',
      permissions: {
        dashboard: true,
        cit_dispatch: true,
        daily_summary: true,
        mail_wa_setup: true,
        dynamic_filters: true,
        order_input_read: true,
        order_input_create: true,
        order_input_update: true,
        order_input_delete: true
      }
    });
  };

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    if (!editingTenant.name.trim()) {
      setStatusMsg({ type: 'error', text: 'Nama Divisi wajib diisi!' });
      setModalTab('info');
      return;
    }

    if (editingTenant.id === 0 && (!editingTenant.admin_email || !editingTenant.admin_password)) {
      setStatusMsg({ type: 'error', text: 'Email & Password Admin Divisi wajib diisi saat membuat divisi baru!' });
      setModalTab('user');
      return;
    }

    const finalAiModels = (editingTenant.ai_models && editingTenant.ai_models.length > 0)
      ? editingTenant.ai_models
      : ['Custom AI Core', 'Nemotron 3 Super 120B'];

    const payload = {
      ...editingTenant,
      ai_models: finalAiModels,
      ai_primary_model: finalAiModels[0] || 'Custom AI Core',
      ai_fallback_model: finalAiModels[1] || 'Nemotron 3 Super 120B'
    };

    setIsSaving(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        const savedTenant: TenantConfig = data.tenant || {
          ...payload,
          id: data.tenant?.id || editingTenant.id || Date.now()
        };

        // Phase 2: Array state update using .map() for edits to prevent duplication
        setTenants(prev => {
          const exists = prev.some(item => item.id === savedTenant.id);
          if (exists) {
            return prev.map(item => item.id === savedTenant.id ? savedTenant : item);
          } else {
            return [...prev, savedTenant];
          }
        });

        setStatusMsg({ 
          type: 'success', 
          text: `Transaksi Berhasil! Divisi "${editingTenant.name}" dan Akun Admin (${editingTenant.admin_email || 'terbarui'}) berhasil disimpan.` 
        });
        setEditingTenant(null);
        await loadTenants();
      } else {
        setStatusMsg({ type: 'error', text: data.message || 'Gagal menyimpan divisi & user.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Terjadi kesalahan transaksi di server.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTenant = async (id: number) => {
    try {
      const res = await fetch(`/api/tenants/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Divisi tenant ID #${id} berhasil dihapus.` });
        setDeleteConfirmId(null);
        await loadTenants();
      } else {
        setStatusMsg({ type: 'error', text: 'Gagal menghapus divisi.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Gagal terhubung ke server.' });
    }
  };

  const toggleAiModel = (modelId: string) => {
    if (!editingTenant) return;
    const currentList = editingTenant.ai_models || ['Custom AI Core'];
    let updated: string[];
    if (currentList.includes(modelId)) {
      if (currentList.length <= 1) {
        alert('Setidaknya satu AI Model harus dialokasikan untuk divisi ini!');
        return;
      }
      updated = currentList.filter(m => m !== modelId);
    } else {
      updated = [...currentList, modelId];
    }
    setEditingTenant({ ...editingTenant, ai_models: updated });
  };

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.admin_email && t.admin_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (t.ai_models && t.ai_models.some(m => m.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-xs font-semibold mb-2">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Multi-Tenant Management Center</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Tenant & Admin User Management</h1>
            <p className="text-sm text-slate-300 mt-1">
              Kelola alokasi Multi-Select AI Models, fitur workflow per divisi, serta transaksi pembuatan User Admin terisolasi.
            </p>
          </div>

          <button
            onClick={loadTenants}
            disabled={isLoading}
            className="self-start md:self-auto px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-medium backdrop-blur-xs border border-white/20 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Tenants</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 shadow-xs ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* Main Tenant Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Table Header Controls */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>Daftar Divisi Tenant & User Admin</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Alokasi AI, workflow email, dan akun Admin terisolasi per divisi.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative text-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari divisi, user, atau AI..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8.5 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-blue-500 w-56 font-medium"
              />
            </div>

            <button
              onClick={handleOpenAddTenant}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Divisi Baru</span>
            </button>
          </div>
        </div>

        {/* Enterprise Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3.5 px-5">Divisi Tenant & Admin User</th>
                <th className="py-3.5 px-4">Fitur Workflow Aktif</th>
                <th className="py-3.5 px-4">AI Allocated (Multi-Select)</th>
                <th className="py-3.5 px-4">Status Mail POP3 & WA</th>
                <th className="py-3.5 px-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    Tidak ada divisi tenant yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  const allocatedAi = t.ai_models && t.ai_models.length > 0
                    ? t.ai_models
                    : [t.ai_primary_model || 'Custom AI Core', t.ai_fallback_model || 'Nemotron 3 Super 120B'].filter(Boolean);

                  return (
                    <tr key={t.id} className="hover:bg-blue-50/40 transition-colors group">
                      
                      {/* Divisi Name & Admin User */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm border border-blue-200 shrink-0">
                            #{t.id}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <span>Divisi {t.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-600 font-mono">
                              <User className="w-3 h-3 text-blue-600" />
                              <span>{t.admin_email || `${t.name.toLowerCase()}@corporate.com`}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Active Features Badges */}
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {t.feature_individual_parsing && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold">
                              <FileText className="w-3 h-3" />
                              <span>Individual Parsing</span>
                            </span>
                          )}
                          {t.feature_bulk_summary && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold">
                              <Layers className="w-3 h-3" />
                              <span>Daily Bulk Summary & WA</span>
                            </span>
                          )}
                          {!t.feature_individual_parsing && !t.feature_bulk_summary && (
                            <span className="text-[10px] text-slate-400 italic">No features active</span>
                          )}
                        </div>
                      </td>

                      {/* Allocated AI Badges */}
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {allocatedAi.map((m, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-[10px] font-mono font-semibold">
                              <Sparkles className="w-2.5 h-2.5 text-blue-600" />
                              <span>{m}</span>
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Integration Status */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <Server className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-slate-600 font-mono">
                              {t.pop3_host ? t.pop3_host : 'pop.secureserver.net'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-slate-600 font-mono">
                              {t.wa_phone ? `+${t.wa_phone}` : 'WA Disconnected'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setModalTab('info');
                              setEditingTenant(t);
                            }}
                            className="p-2 bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-600 rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                            title="Edit Konfigurasi Tenant & Admin"
                          >
                            <Settings2 className="w-4 h-4" />
                            <span className="font-semibold text-[11px] hidden sm:inline">Edit</span>
                          </button>

                          <button
                            onClick={() => setDeleteConfirmId(t.id)}
                            className="p-2 bg-white border border-slate-200 hover:border-rose-400 hover:text-rose-600 text-slate-400 rounded-xl shadow-2xs transition-all cursor-pointer"
                            title="Hapus Divisi Tenant"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* MODAL 'TAMBAH / EDIT DIVISI' */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-150 my-8">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-2xl border border-blue-400/30">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">
                    {editingTenant.id === 0 ? 'Tambah Divisi Tenant Baru' : `Edit Konfigurasi Divisi: ${editingTenant.name}`}
                  </h3>
                  <p className="text-xs text-slate-300">SaaS Multi-Tenant Allocation & Transactional User Setup</p>
                </div>
              </div>

              <button 
                onClick={() => setEditingTenant(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="bg-slate-100/80 px-6 pt-3 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
              
              <button
                type="button"
                onClick={() => setModalTab('info')}
                className={`px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
                  modalTab === 'info'
                    ? 'bg-white text-blue-600 border-slate-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 border-transparent'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Tab 1: Info & Workflow</span>
              </button>

              <button
                type="button"
                onClick={() => setModalTab('ai')}
                className={`px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
                  modalTab === 'ai'
                    ? 'bg-white text-blue-600 border-slate-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 border-transparent'
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>Tab 2: AI Models</span>
                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full text-[9px] font-bold">
                  {(editingTenant.ai_models || []).length} AI
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalTab('user')}
                className={`px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
                  modalTab === 'user'
                    ? 'bg-white text-blue-600 border-slate-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 border-transparent'
                }`}
              >
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Tab 3: Kredensial User Admin</span>
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-bold">
                  Transaction
                </span>
              </button>

            </div>

            <form onSubmit={handleSaveTenant} className="p-6 space-y-6 text-xs">
              
              {/* TAB 1: INFO DIVISI & FEATURE TOGGLES */}
              {modalTab === 'info' && (
                <div className="space-y-5">
                  
                  <div>
                    <label className="block font-bold text-slate-800 mb-1 text-xs">Nama Divisi / Tenant</label>
                    <input
                      type="text"
                      value={editingTenant.name}
                      onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })}
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white transition-all"
                      placeholder="Contoh: Legal, COS, RH, BM, Operational, Finance"
                    />
                  </div>

                  {/* FEATURE TOGGLES AS INTERACTIVE CARDS */}
                  <div className="space-y-3">
                    <label className="block font-bold text-slate-800 text-xs">
                      Feature Flags & Alur Kerja Email:
                    </label>

                    {/* Card 1: Individual Email Parsing */}
                    <div 
                      onClick={() => setEditingTenant({
                        ...editingTenant,
                        feature_individual_parsing: !editingTenant.feature_individual_parsing,
                        feature_bulk_summary: editingTenant.feature_individual_parsing ? editingTenant.feature_bulk_summary : false
                      })}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start justify-between gap-4 ${
                        editingTenant.feature_individual_parsing 
                          ? 'bg-emerald-50/60 border-emerald-500 shadow-xs' 
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300 opacity-75'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-xl ${
                          editingTenant.feature_individual_parsing ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">Individual Email Parsing (Mode COS)</span>
                            {editingTenant.feature_individual_parsing && (
                              <span className="bg-emerald-600 text-white text-[9px] px-2 py-0.2 rounded-full font-bold uppercase">Aktif</span>
                            )}
                          </div>
                          <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                            Setiap email masuk diurai terpisah oleh AI untuk deteksi tiket order, nominal uang, dan respon otomatis.
                          </p>
                        </div>
                      </div>

                      <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 mt-1 ${
                        editingTenant.feature_individual_parsing ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'
                      }`}>
                        <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                      </div>
                    </div>

                    {/* Card 2: Daily Bulk Summary */}
                    <div 
                      onClick={() => setEditingTenant({
                        ...editingTenant,
                        feature_bulk_summary: !editingTenant.feature_bulk_summary,
                        feature_individual_parsing: editingTenant.feature_bulk_summary ? editingTenant.feature_individual_parsing : false
                      })}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start justify-between gap-4 ${
                        editingTenant.feature_bulk_summary 
                          ? 'bg-indigo-50/60 border-indigo-500 shadow-xs' 
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300 opacity-75'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-xl ${
                          editingTenant.feature_bulk_summary ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">Daily Bulk Summary & WA Blast (Mode RH/BM)</span>
                            {editingTenant.feature_bulk_summary && (
                              <span className="bg-indigo-600 text-white text-[9px] px-2 py-0.2 rounded-full font-bold uppercase">Aktif</span>
                            )}
                          </div>
                          <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                            Kumpulkan seluruh email harian divisi lalu rangkum secara kolektif via AI dan kirimkan ringkasan ke WhatsApp.
                          </p>
                        </div>
                      </div>

                      <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 mt-1 ${
                        editingTenant.feature_bulk_summary ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'
                      }`}>
                        <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                      </div>
                    </div>

                  </div>

                  {/* TENANT ADMIN PERMISSIONS CHECKLIST */}
                  <div className="pt-2 border-t border-slate-200 space-y-3">
                    <label className="block font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Hak Akses & Permission Tenant Admin (RBAC):
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        { key: 'dashboard', label: 'AI Email Intelligence Dashboard', desc: 'Akses menu Dashboard & Email Ingestion' },
                        { key: 'cit_dispatch', label: 'CIT Dispatch Management', desc: 'Akses menu CIT Order Tracking & Dispatch' },
                        { key: 'daily_summary', label: 'Daily Bulk Email Summary', desc: 'Akses menu Bulk Summary & Ringkasan WA' },
                        { key: 'mail_wa_setup', label: 'Mail & WA Setup', desc: 'Konfigurasi akun POP3 Mail & WhatsApp' },
                                                { key: 'dynamic_filters', label: 'Dynamic Filters', desc: 'Konfigurasi Aturan Filter Email Otomatis' },
                        { key: 'order_input_read', label: 'Order Input (Read)', desc: 'Melihat halaman list Pending Input' },
                        { key: 'order_input_create', label: 'Order Input (Create)', desc: 'Generate & isi tiket CIT' },
                        { key: 'order_input_update', label: 'Order Input (Update)', desc: 'Edit data tiket partial' },
                        { key: 'order_input_delete', label: 'Order Input (Delete)', desc: 'Batal/hapus tiket' },
                      ].map((perm) => {
                        const currentPerms = editingTenant.permissions || {
                          dashboard: true,
                          cit_dispatch: true,
                          daily_summary: true,
                          mail_wa_setup: true,
                          dynamic_filters: true,
                          order_input_read: true,
                          order_input_create: true,
                          order_input_update: true,
                          order_input_delete: true
                        };
                        const isChecked = !!currentPerms[perm.key as keyof TenantPermissions];

                        return (
                          <div 
                            key={perm.key}
                            onClick={() => {
                              setEditingTenant({
                                ...editingTenant,
                                permissions: {
                                  ...currentPerms,
                                  [perm.key]: !isChecked
                                }
                              });
                            }}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                              isChecked 
                                ? 'bg-blue-50/70 border-blue-300' 
                                : 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-80'
                            }`}
                          >
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => {}} // handled by parent onClick
                              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-900">{perm.label}</div>
                              <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{perm.desc}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 2: MULTI-SELECT AI ALLOCATIONS */}
              {modalTab === 'ai' && (
                <div className="space-y-4">
                  
                  <div className="flex items-center justify-between bg-blue-50 p-3.5 rounded-xl border border-blue-200 text-blue-900">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
                      <div>
                        <strong className="font-bold block text-xs">Multi-Select AI Routing:</strong>
                        <span className="text-[11px] text-blue-800">
                          Centang semua AI Model yang diizinkan untuk digunakan oleh divisi {editingTenant.name || 'baru'}.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Select AI Models Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {AVAILABLE_AI_MODELS.map((model) => {
                      const isSelected = (editingTenant.ai_models || []).includes(model.id);

                      return (
                        <div
                          key={model.id}
                          onClick={() => toggleAiModel(model.id)}
                          className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-start justify-between gap-3 ${
                            isSelected 
                              ? 'bg-blue-50/80 border-blue-600 shadow-xs' 
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 opacity-80'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-xs">{model.name}</span>
                              <span className="text-[9px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-mono">
                                {model.provider}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-snug">{model.desc}</p>
                          </div>

                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}

              {/* TAB 3: KREDENSIAL LOGIN TENANT ADMIN (DATABASE TRANSACTION) */}
              {modalTab === 'user' && (
                <div className="space-y-4">
                  
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-900">
                    <UserCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="font-bold block">Pembuatan User Admin Divisi (Database Transaction):</strong>
                      <p className="text-emerald-800 leading-relaxed">
                        Sistem backend akan menjalankan transaksi database (BEGIN...COMMIT). Dalam sekali klik simpan, divisi baru dibuat sekaligus akun login untuk Admin Divisi ini dengan hashed password!
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1 text-xs">
                      Email / Username Admin Divisi <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={editingTenant.admin_email || ''}
                        onChange={(e) => setEditingTenant({ ...editingTenant, admin_email: e.target.value })}
                        required={editingTenant.id === 0}
                        placeholder={`Contoh: ${editingTenant.name ? editingTenant.name.toLowerCase() : 'legal'}@corporate.com`}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1 text-xs">
                      Password Login Admin Divisi <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={editingTenant.admin_password || ''}
                        onChange={(e) => setEditingTenant({ ...editingTenant, admin_password: e.target.value })}
                        required={editingTenant.id === 0}
                        placeholder={editingTenant.id === 0 ? "Ketik password akun divisi..." : "Kosongkan jika tidak ingin mengubah password"}
                        className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Password akan otomatis di-hash menggunakan library BCrypt sebelum disimpan.
                    </p>
                  </div>

                </div>
              )}

              {/* Modal Footer Controls */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
                <div className="text-[11px] text-slate-400">
                  {modalTab === 'info' && 'Lanjut ke Tab 2 (AI Models) & Tab 3 (User Admin)'}
                  {modalTab === 'ai' && 'Lanjut ke Tab 3 untuk melengkapi kredensial Admin'}
                  {modalTab === 'user' && 'Klik Simpan untuk mengeksekusi transaksi database'}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTenant(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all text-xs cursor-pointer"
                  >
                    Batal
                  </button>

                  {modalTab === 'info' && (
                    <button
                      type="button"
                      onClick={() => setModalTab('ai')}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl shadow-xs transition-all text-xs cursor-pointer"
                    >
                      Lanjut ke AI Models →
                    </button>
                  )}

                  {modalTab === 'ai' && (
                    <button
                      type="button"
                      onClick={() => setModalTab('user')}
                      className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl shadow-xs transition-all text-xs cursor-pointer"
                    >
                      Lanjut ke User Admin →
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-all text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Memproses Transaksi...' : 'Simpan Divisi & User Admin'}</span>
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Hapus Divisi Tenant?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Apakah Anda yakin ingin menghapus divisi ID #{deleteConfirmId}? Seluruh data terkait dan akun user divisi akan dihapus.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
              >
                Batal
              </button>
              <button
                onClick={() => handleDeleteTenant(deleteConfirmId)}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs"
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
