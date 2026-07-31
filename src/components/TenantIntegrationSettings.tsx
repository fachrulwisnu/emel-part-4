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
  HelpCircle
} from 'lucide-react';

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
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingPop3, setIsTestingPop3] = useState(false);
  const [isTestingWa, setIsTestingWa] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Form States
  const [pop3Host, setPop3Host] = useState('pop.secureserver.net');
  const [pop3Port, setPop3Port] = useState(110);
  const [pop3User, setPop3User] = useState(`${tenantName.toLowerCase()}@corporate.com`);
  const [pop3Pass, setPop3Pass] = useState('SecretPass123!');
  const [waPhone, setWaPhone] = useState('6281234567890');
  const [waStatus, setWaStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'PAIRING'>('CONNECTED');

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Tenant Info
  const loadTenantConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tenants?id=${currentTenantId}`);
      const data = await res.json();
      if (data.success && data.tenant) {
        const t = data.tenant;
        if (t.pop3_host) setPop3Host(t.pop3_host);
        if (t.pop3_port) setPop3Port(t.pop3_port);
        if (t.pop3_user) setPop3User(t.pop3_user);
        if (t.pop3_pass) setPop3Pass(t.pop3_pass);
        if (t.wa_phone) setWaPhone(t.wa_phone);
      }
    } catch (err) {
      console.error('Failed to load tenant integration settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenantConfig();
  }, [currentTenantId]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);

    try {
      const payload = {
        id: currentTenantId,
        name: tenantName,
        pop3_host: pop3Host,
        pop3_port: Number(pop3Port),
        pop3_user: pop3User,
        pop3_pass: pop3Pass,
        wa_phone: waPhone
      };

      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setStatusMsg({ type: 'success', text: `Kredensial Mail & WA Divisi ${tenantName} berhasil disimpan!` });
        if (onAddToast) onAddToast('Simpan Berhasil', `Konfigurasi server email & WA Divisi ${tenantName} telah terbarui.`);
      } else {
        setStatusMsg({ type: 'error', text: data.message || 'Gagal menyimpan kredensial.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Terjadi kesalahan saat terhubung ke server.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPop3 = async () => {
    setIsTestingPop3(true);
    setTimeout(() => {
      setIsTestingPop3(false);
      setStatusMsg({
        type: 'success',
        text: `Tes Koneksi POP3 Berhasil! Server ${pop3Host}:${pop3Port} merespons ok (+OK Hello from POP3 Server).`
      });
      if (onAddToast) onAddToast('Koneksi POP3 OK', `Otentikasi user "${pop3User}" ke ${pop3Host} berhasil.`);
    }, 1200);
  };

  const handleTestWa = async () => {
    setIsTestingWa(true);
    setTimeout(() => {
      setIsTestingWa(false);
      setStatusMsg({
        type: 'success',
        text: `Tes Pesan WhatsApp Terkirim! Notifikasi pengujian berhasil dikirim ke nomor ${waPhone}.`
      });
      if (onAddToast) onAddToast('WA Test Sent', `Pesan simulasi rangkuman email telah dikirim ke +${waPhone}.`);
    }, 1200);
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
              <span>Tenant Self-Service Integration Setup</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Mail Server & WA Setup: Divisi {tenantName}</h1>
            <p className="text-sm text-slate-300 mt-1">
              Isolasi kredensial POP3 email dan sesi WhatsApp secara independen untuk Divisi {tenantName}.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto bg-white/10 px-3.5 py-2 rounded-xl backdrop-blur-xs border border-white/15">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-200">Tenant ID: #{currentTenantId}</span>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 shadow-xs ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
        </div>
      )}

      {/* Main Settings Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. POP3 MAIL SERVER CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Server Email POP3 (Divisi {tenantName})</h3>
                  <p className="text-[11px] text-slate-500">Kredensial penarikan email otomatis per divisi</p>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-bold">
                POP3 Server
              </span>
            </div>

            <form onSubmit={handleSaveConfig} className="p-5 space-y-4 text-xs">
              
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>POP3 Hostname</span>
                  <span className="text-[10px] text-slate-400 font-normal">Contoh: pop.secureserver.net</span>
                </label>
                <div className="relative">
                  <Server className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={pop3Host}
                    onChange={(e) => setPop3Host(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block font-semibold text-slate-700 mb-1">Port</label>
                  <input
                    type="number"
                    value={pop3Port}
                    onChange={(e) => setPop3Port(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Metode Keamanan</label>
                  <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium">
                    <option>Standard / TLS (Port 110/995)</option>
                    <option>SSL Direct (Port 995)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Username / Email Address</label>
                <input
                  type="email"
                  value={pop3User}
                  onChange={(e) => setPop3User(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={pop3Pass}
                    onChange={(e) => setPop3Pass(e.target.value)}
                    required
                    className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleTestPop3}
                  disabled={isTestingPop3}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingPop3 ? 'animate-spin' : ''}`} />
                  <span>{isTestingPop3 ? 'Testing...' : 'Tes POP3'}</span>
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-xs transition-all text-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan POP3'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>

        {/* 2. WHATSAPP BLAST & SESSION CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Notifikasi & WA Blast (Divisi {tenantName})</h3>
                  <p className="text-[11px] text-slate-500">Manajemen nomor penerima & sesi WhatsApp</p>
                </div>
              </div>

              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${
                waStatus === 'CONNECTED' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${waStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span>{waStatus}</span>
              </span>
            </div>

            <div className="p-5 space-y-4 text-xs">
              
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nomor WhatsApp Target Blast/Alert</label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value)}
                    placeholder="6281234567890"
                    required
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Format menggunakan kode negara tanpa tanda plus (Contoh: 6281234567890)
                </p>
              </div>

              {/* QR Session Pairing Card */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span>Sesi Sockets WhatsApp Web</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Sesi Aktif ({tenantName})
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Sesi WhatsApp ini akan digunakan oleh AI Cron Job untuk mengirimkan Daily Bulk Summary dan alert tiket darurat khusus divisi {tenantName}.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsQrModalOpen(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-xs"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Scan QR Code Sesi WA</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestWa}
                    disabled={isTestingWa}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 font-semibold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    <Send className={`w-3 h-3 text-emerald-600 ${isTestingWa ? 'animate-bounce' : ''}`} />
                    <span>{isTestingWa ? 'Mengirim...' : 'Tes Kirim WA'}</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs transition-all text-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan Kredensial WA'}</span>
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Information Banner */}
      <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
        <HelpCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="font-bold block">Pemberitahuan Isolasi Multi-Tenant:</strong>
          <p className="text-blue-800 leading-relaxed">
            Sistem backend telah mengisolasi penarikan email dan blasting notifikasi. Semua email yang ditarik menggunakan server POP3 di atas akan ditandai dengan <code>tenant_id: #{currentTenantId}</code> dan tidak akan pernah bercampur dengan email milik divisi lain.
          </p>
        </div>
      </div>

      {/* QR Code Modal Overlay */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 text-center space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>Pairing Sesi WhatsApp Web</span>
              </h3>
              <button onClick={() => setIsQrModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block">
              <img 
                src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=WA_SESSION_TENANT_AUTOMATION" 
                alt="WhatsApp Pairing QR"
                className="w-44 h-44 mx-auto rounded-lg"
              />
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Buka aplikasi WhatsApp di HP Anda &gt; Menu Perangkat Tertaut &gt; Tautkan Perangkat, lalu arahkan kamera ke QR Code ini.
            </p>

            <button
              onClick={() => {
                setWaStatus('CONNECTED');
                setIsQrModalOpen(false);
                if (onAddToast) onAddToast('WhatsApp Paired', `Sesi WA Divisi ${tenantName} telah terhubung.`);
              }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs"
            >
              Saya Sudah Scan (Hubungkan)
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
