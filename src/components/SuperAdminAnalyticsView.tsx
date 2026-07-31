import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Mail, 
  AlertTriangle, 
  Clock, 
  Building2, 
  Bot, 
  TrendingUp, 
  RefreshCw, 
  ShieldCheck, 
  Sparkles 
} from 'lucide-react';

export const AVAILABLE_AI_MODELS = [
  { id: 'Custom AI Core', name: 'Custom AI Core', desc: 'Engine utama klasifikasi email & penarikan entitas', provider: 'Internal Core' },
  { id: 'Custom AI Vision', name: 'Custom AI Vision', desc: 'Engine multimodal OCR untuk parsing lampiran PDF/Gambar', provider: 'Internal Vision' },
  { id: 'Nemotron 3 Nano Omni 30B', name: 'Nemotron 3 Nano Omni 30B', desc: 'Model 30B parameter super cepat ultra-low latency', provider: 'NVIDIA' },
  { id: 'Nemotron 3 Super 120B', name: 'Nemotron 3 Super 120B', desc: 'Model 120B parameter reasoning & ROTATOR kompleks', provider: 'NVIDIA' },
  { id: 'Qwen3 Next 80B', name: 'Qwen3 Next 80B', desc: 'Model 80B multilingual presisi tinggi', provider: 'Alibaba Cloud' },
  { id: 'StepFun AI Step 3.7 Flash', name: 'StepFun AI Step 3.7 Flash', desc: 'Model real-time flash untuk rangkuman harian', provider: 'StepFun' }
];

export const SuperAdminAnalyticsView: React.FC = () => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalEmails: 0,
    criticalCount: 0,
    highCount: 0,
    routineCount: 0,
    divisionCounts: {} as Record<string, number>
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Load tenants
      const resTenants = await fetch('/api/tenants');
      const dataTenants = await resTenants.json();
      if (dataTenants.success && dataTenants.tenants) {
        setTenants(dataTenants.tenants);
      }

      // 2. Load email stats
      const resEmails = await fetch('/api/emails');
      const dataEmails = await resEmails.json();
      if (dataEmails.success && dataEmails.emails) {
        const emails: any[] = dataEmails.emails;
        let critical = 0;
        let high = 0;
        let routine = 0;
        const divMap: Record<string, number> = {};

        emails.forEach(e => {
          const urg = (e.urgency_level || 'Routine').toLowerCase();
          if (urg === 'critical' || urg === 'mendesak') critical++;
          else if (urg === 'high' || urg === 'tinggi') high++;
          else routine++;

          const tId = e.tenant_id || 1;
          divMap[tId] = (divMap[tId] || 0) + 1;
        });

        setStats({
          totalEmails: emails.length,
          criticalCount: critical,
          highCount: high,
          routineCount: routine,
          divisionCounts: divMap
        });
      }
    } catch (err) {
      console.error('Failed to load global analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full text-xs font-semibold mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              <span>Super Admin Dashboard Analytics</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Global System Analytics & Intelligence</h1>
            <p className="text-sm text-slate-300 mt-1">
              Overview performa global pemrosesan email, tingkat urgensi, serta telemetry alokasi AI model per divisi.
            </p>
          </div>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="self-start md:self-auto px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-medium backdrop-blur-xs border border-white/20 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Analytics</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Email Global</span>
            <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
              <Mail className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{stats.totalEmails}</div>
            <p className="text-xs text-slate-500 mt-1">Terhitung dari seluruh divisi tenant</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kritis / Urgent</span>
            <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-600">{stats.criticalCount}</div>
            <p className="text-xs text-slate-500 mt-1">Email butuh penanganan mementingkan SLA</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Urgensi Tinggi</span>
            <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-600">{stats.highCount}</div>
            <p className="text-xs text-slate-500 mt-1">Diproses dengan prioritas medium</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Divisi Aktif</span>
            <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-indigo-600">{tenants.length}</div>
            <p className="text-xs text-slate-500 mt-1">Divisi aktif terdaftar di sistem</p>
          </div>
        </div>
      </div>

      {/* Email Volume & AI Allocations Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Division Email Traffic Breakdown */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-sm">Volume Email per Divisi Tenant</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Live Telemetry</span>
          </div>

          <div className="space-y-3 pt-2">
            {tenants.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Belum ada data divisi tenant.</p>
            ) : (
              tenants.map(t => {
                const count = stats.divisionCounts[t.id] || 0;
                const pct = stats.totalEmails > 0 ? Math.round((count / stats.totalEmails) * 100) : 0;

                return (
                  <div key={t.id} className="space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-slate-700">
                      <span>Divisi {t.name}</span>
                      <span className="font-mono text-blue-600">{count} Email ({pct}%)</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* AI Model Allocations & Engine Health */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-sm">Alokasi Engine AI & Model Status</h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Online
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {AVAILABLE_AI_MODELS.map(m => {
              const assignedCount = tenants.filter(t => (t.ai_models || []).includes(m.id)).length;

              return (
                <div key={m.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">{m.name}</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-blue-100 text-blue-700 font-bold rounded">
                      {assignedCount} Divisi
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
};
