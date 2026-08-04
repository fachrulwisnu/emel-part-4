import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  MessageSquare, 
  Key, 
  ShieldCheck, 
  Server, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  QrCode, 
  Lock, 
  Eye, 
  EyeOff, 
  Check, 
  Smartphone,
  HelpCircle,
  Plus,
  Trash2,
  Edit2,
  X
} from 'lucide-react';

interface MailConfig {
  id?: number;
  tenant_id: number;
  email_address: string;
  host: string;
  port: number;
  username: string;
  password: string;
  is_active?: boolean;
}

interface TenantIntegrationSettingsProps {
  currentTenantId?: number;
  tenantName?: string;
  onAddToast?: (title: string, message: string) => void;
}

export const TenantIntegrationSettings: React.FC<TenantIntegrationSettingsProps> = ({
  currentTenantId = 1,
  tenantName = 'COS',
  onAddToast
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [mailConfigs, setMailConfigs] = useState<MailConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<MailConfig | null>(null);
  
  // Modal Form State
  const [formEmailAddress, setFormEmailAddress] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState(995);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  // WhatsApp States
  const [waPhone, setWaPhone] = useState('6281234567890');
  const [isSavingWa, setIsSavingWa] = useState(false);

  // Single AI Model Tester State (Superadmin)
  const [selectedTestModel, setSelectedTestModel] = useState('Gemini Flash Latest');
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency: number;
    modelName: string;
    output?: string;
    error?: string;
  } | null>(null);

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTestSingleModel = async () => {
    setIsTestingModel(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/ai/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: selectedTestModel })
      });
      const data = await res.json();
      if (data.success) {
        const resultObj = {
          success: true,
          latency: data.latency,
          modelName: data.modelName || selectedTestModel,
          output: data.output
        };
        setTestResult(resultObj);
        setStatusMsg({ type: 'success', text: `Tes Model ${selectedTestModel} Berhasil (${data.latency} ms)` });
        if (onAddToast) {
          onAddToast('Tes Model AI Berhasil', `${selectedTestModel} merespon dalam ${data.latency} ms.`);
        }
      } else {
        const resultObj = {
          success: false,
          latency: data.latency || 0,
          modelName: data.modelName || selectedTestModel,
          error: data.error || data.message || 'Error tidak diketahui'
        };
        setTestResult(resultObj);
        setStatusMsg({ type: 'error', text: `Tes Model ${selectedTestModel} Gagal: ${resultObj.error}` });
        if (onAddToast) {
          onAddToast('Tes Model AI Gagal', `${selectedTestModel}: ${resultObj.error}`);
        }
      }
    } catch (err: any) {
      const resultObj = {
        success: false,
        latency: 0,
        modelName: selectedTestModel,
        error: err.message || String(err)
      };
      setTestResult(resultObj);
      setStatusMsg({ type: 'error', text: `Gagal terhubung ke server saat menguji model ${selectedTestModel}` });
      if (onAddToast) {
        onAddToast('Tes Model AI Gagal', `Koneksi gagal: ${err.message}`);
      }
    } finally {
      setIsTestingModel(false);
    }
  };

  // Load Mail Configurations
  const loadMailConfigs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/mail-configs?tenant_id=${currentTenantId}`);
      const data = await res.json();
      if (data.success && data.configs) {
        setMailConfigs(data.configs);
      }
    } catch (err) {
      console.error('Failed to load mail configs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load Tenant Info (WA Phone)
  const loadTenantConfig = async () => {
    try {
      const res = await fetch(`/api/tenants?id=${currentTenantId}`);
      const data = await res.json();
      if (data.success && data.tenant) {
        if (data.tenant.wa_phone) setWaPhone(data.tenant.wa_phone);
      }
    } catch (err) {
      console.error('Failed to load tenant WA info:', err);
    }
  };

  useEffect(() => {
    loadMailConfigs();
    loadTenantConfig();
  }, [currentTenantId]);

  const handleOpenAddModal = () => {
    setEditingConfig(null);
    setFormEmailAddress('');
    setFormHost('pop.secureserver.net');
    setFormPort(995);
    setFormUsername('');
    setFormPassword('');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (config: MailConfig) => {
    setEditingConfig(config);
    setFormEmailAddress(config.email_address);
    setFormHost(config.host);
    setFormPort(config.port || 995);
    setFormUsername(config.username);
    setFormPassword(config.password || '');
    setFormIsActive(config.is_active !== false);
    setIsModalOpen(true);
  };

  const handleSaveMailConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmailAddress || !formHost || !formUsername) {
      setStatusMsg({ type: 'error', text: 'Semua field wajib diisi' });
      return;
    }

    setIsSavingConfig(true);
    setStatusMsg(null);

    try {
      const payload = {
        tenant_id: currentTenantId,
        email_address: formEmailAddress.trim(),
        host: formHost.trim(),
        port: Number(formPort) || 995,
        username: formUsername.trim(),
        password: formPassword,
        is_active: formIsActive
      };

      let res;
      if (editingConfig && editingConfig.id) {
        res = await fetch(`/api/mail-configs/${editingConfig.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/mail-configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Konfigurasi email ${formEmailAddress} berhasil disimpan!` });
        if (onAddToast) onAddToast('Simpan Berhasil', `Akun ${formEmailAddress} terkonfigurasi untuk ${tenantName}.`);
        setIsModalOpen(false);
        loadMailConfigs();
      } else {
        setStatusMsg({ type: 'error', text: data.message || 'Gagal menyimpan akun email' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Terjadi kesalahan saat menghubungi server.' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleDeleteMailConfig = async (id: number, emailAddr: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus akun email ${emailAddr}?`)) return;
    try {
      const res = await fetch(`/api/mail-configs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Akun email ${emailAddr} berhasil dihapus.` });
        if (onAddToast) onAddToast('Hapus Akun', `Akun ${emailAddr} telah dihapus.`);
        loadMailConfigs();
      } else {
        setStatusMsg({ type: 'error', text: data.message || 'Gagal menghapus akun' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Gagal terhubung ke server' });
    }
  };

  const handleTestPop3Config = async (config: MailConfig) => {
    if (!config.id) return;
    setTestingId(config.id);
    try {
      const res = await fetch('/api/mail-configs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: data.message });
        if (onAddToast) onAddToast('Tes POP3 Sukses', `Otentikasi ${config.email_address} berhasil.`);
      } else {
        setStatusMsg({ type: 'error', text: data.message || 'Tes POP3 gagal.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Gagal melakukan tes koneksi POP3.' });
    } finally {
      setTestingId(null);
    }
  };

  const handleSaveWaConfig = async () => {
    setIsSavingWa(true);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentTenantId, name: tenantName, wa_phone: waPhone })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Nomor WhatsApp blast untuk ${tenantName} berhasil disimpan!` });
        if (onAddToast) onAddToast('WA Saved', `Nomor WA terbarui ke +${waPhone}`);
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Gagal menyimpan nomor WA.' });
    } finally {
      setIsSavingWa(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      
      {/* Enterprise Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-xs font-semibold mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Multi-Account Mail Integration Setup</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Email Accounts & WA Setup: Divisi {tenantName}</h1>
            <p className="text-sm text-slate-300 mt-1">
              Kelola beberapa akun email POP3/IMAP secara independen untuk Divisi {tenantName} tanpa mencampur data antar-tenant.
            </p>
          </div>
          
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Akun Email</span>
          </button>
        </div>
      </div>

      {/* Global Alert Notification */}
      {statusMsg && (
        <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium border ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          )}
          <div className="flex-1">{statusMsg.text}</div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* MULTI-ACCOUNT EMAIL TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Daftar Akun Email POP3/IMAP ({mailConfigs.length})</h2>
              <p className="text-xs text-slate-500">Setiap email yang masuk akan secara otomatis diisolasikan ke `tenant_id` {tenantName}.</p>
            </div>
          </div>
          <button
            onClick={loadMailConfigs}
            disabled={isLoading}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {mailConfigs.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">Belum ada akun email terkonfigurasi</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Tambahkan setidaknya 1 akun POP3 untuk menerima inbox otomatis harian.</p>
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Akun Email Baru</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 uppercase font-bold text-slate-400">
                <tr>
                  <th className="px-5 py-3">Alamat Email</th>
                  <th className="px-5 py-3">POP3 Server & Port</th>
                  <th className="px-5 py-3">Username</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mailConfigs.map((config) => (
                  <tr key={config.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500" />
                        <span>{config.email_address}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-600">
                      {config.host}:{config.port || 995}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-600">
                      {config.username}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {config.is_active !== false ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="w-3 h-3" /> Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => handleTestPop3Config(config)}
                        disabled={testingId === config.id}
                        className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        {testingId === config.id ? 'Testing...' : 'Tes POP3'}
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(config)}
                        className="px-2.5 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMailConfig(config.id!, config.email_address)}
                        className="px-2.5 py-1 text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* WHATSAPP BLAST INTEGRATION SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">WhatsApp Blast Target (Divisi {tenantName})</h2>
            <p className="text-xs text-slate-500">Nomor WhatsApp penerima rangkuman harian kolektif dan pemberitahuan penting.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Nomor WhatsApp Target (Format Internasional Ex: 628123...)</label>
            <input
              type="text"
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
              placeholder="6281234567890"
              className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <button
              onClick={handleSaveWaConfig}
              disabled={isSavingWa}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingWa ? 'Saving...' : 'Simpan Nomor WA'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SINGLE AI MODEL TESTER (SUPERADMIN DIAGNOSTIC) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800">Single AI Model Tester</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                Superadmin Tool
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Uji latensi dan fungsionalitas model AI individu secara langsung untuk mendiagnosa koneksi API.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Pilih Model AI yang Ingin Diuji</label>
            <select
              value={selectedTestModel}
              onChange={(e) => setSelectedTestModel(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:border-purple-500 focus:outline-none font-medium text-slate-800"
            >
              <option value="Gemini Flash Latest">Gemini Flash Latest (Google Cloud)</option>
              <option value="Custom AI Core">Custom AI Core (aim.adv.my.id)</option>
              <option value="Custom AI Vision">Custom AI Vision (aim.adv.my.id)</option>
              <option value="Nemotron 3 Nano Omni 30B">Nemotron 3 Nano Omni 30B (NVIDIA)</option>
              <option value="Nemotron 3 Super 120B">Nemotron 3 Super 120B (NVIDIA)</option>
              <option value="Qwen3 Next 80B">Qwen3 Next 80B (Alibaba Cloud)</option>
              <option value="StepFun AI Step 3.7 Flash">StepFun AI Step 3.7 Flash (StepFun)</option>
            </select>
          </div>
          <div>
            <button
              onClick={handleTestSingleModel}
              disabled={isTestingModel}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isTestingModel ? 'animate-spin' : ''}`} />
              <span>{isTestingModel ? 'Menguji Model...' : 'Uji Model AI'}</span>
            </button>
          </div>
        </div>

        {/* Test Output Card */}
        {testResult && (
          <div className={`mt-4 p-4 rounded-xl border text-xs space-y-2 ${
            testResult.success 
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
              : 'bg-rose-50/70 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                )}
                Hasil Diagnostik: {testResult.modelName}
              </span>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 border border-slate-200">
                Latensi: {testResult.latency} ms
              </span>
            </div>
            
            {testResult.output && (
              <div className="mt-2 bg-white/90 p-3 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {testResult.output}
              </div>
            )}

            {testResult.error && (
              <div className="mt-2 bg-rose-100/90 p-3 rounded-lg border border-rose-200 font-mono text-[11px] text-rose-800 whitespace-pre-wrap">
                Error: {testResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL ADD / EDIT MAIL CONFIG */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Server className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  {editingConfig ? 'Edit Akun Email POP3' : 'Tambah Akun Email Baru'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMailConfig} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Alamat Email (Source Email)</label>
                <input
                  type="email"
                  required
                  placeholder="admin@tenant.com"
                  value={formEmailAddress}
                  onChange={(e) => setFormEmailAddress(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">POP3 Server Host</label>
                  <input
                    type="text"
                    required
                    placeholder="pop.secureserver.net"
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Port</label>
                  <input
                    type="number"
                    required
                    value={formPort}
                    onChange={(e) => setFormPort(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Username POP3</label>
                <input
                  type="text"
                  required
                  placeholder="admin@tenant.com"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Password POP3</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="isActiveCheck" className="text-xs font-bold text-slate-700">
                  Aktifkan pengambilan otomatis (POP3 Cron Sync)
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 font-bold text-xs rounded-xl text-slate-600 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  {isSavingConfig ? 'Saving...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
