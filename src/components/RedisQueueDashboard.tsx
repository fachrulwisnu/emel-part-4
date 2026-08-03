import React, { useState, useEffect } from 'react';
import { Database, Clock, Zap, CheckCircle2, AlertTriangle, RefreshCw, RotateCcw, ShieldAlert, Cpu, Terminal, ArrowRight } from 'lucide-react';
import { User } from './DynamicFiltersManager';

interface CompletedJob {
  id: string;
  name: string;
  data: { email_id?: string; tenant_id?: number };
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  durationMs?: number;
  returnvalue?: any;
}

interface FailedJob {
  id: string;
  name: string;
  data: { email_id?: string; tenant_id?: number };
  timestamp: number;
  failedReason?: string;
  stacktrace?: string[];
  attemptsMade?: number;
}

interface RedisQueueDashboardProps {
  currentUser: User | null;
}

export const RedisQueueDashboard: React.FC<RedisQueueDashboardProps> = ({ currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const fetchQueueStatus = async () => {
    try {
      const res = await fetch('/api/admin/queue-status');
      const data = await res.json();
      if (data.success) {
        setCounts(data.counts || { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
        setCompletedJobs(data.completedJobs || []);
        setFailedJobs(data.failedJobs || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch Redis Queue status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchQueueStatus();
    }
  }, [isSuperAdmin]);

  // Auto-refresh interval (5 seconds)
  useEffect(() => {
    if (!isSuperAdmin || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchQueueStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [isSuperAdmin, autoRefresh]);

  const handleRetryJob = async (job: FailedJob) => {
    setRetryingJobId(job.id);
    try {
      const res = await fetch(`/api/admin/queue-retry/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_id: job.data?.email_id, tenant_id: job.data?.tenant_id })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Job #${job.id} berhasil dipancing ulang ke antrean!` });
        await fetchQueueStatus();
      } else {
        setMessage({ type: 'error', text: data.message || 'Gagal memancing ulang job' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Terjadi kesalahan sistem' });
    } finally {
      setRetryingJobId(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-2xl flex flex-col items-center">
          <ShieldAlert className="w-12 h-12 text-amber-600 mb-3" />
          <h2 className="text-xl font-bold mb-2">Akses Terbatas (Super Admin Only)</h2>
          <p className="text-sm max-w-md">
            Halaman Redis BullMQ Monitor hanya dapat diakses oleh role **Super Admin**. Silakan login sebagai Super Admin untuk memantau status antrean pemrosesan AI.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold tracking-wider uppercase mb-1">
            <Cpu className="w-4 h-4 text-indigo-400" />
            Super Admin Infrastructure Control
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            AI Queue & Redis BullMQ Monitor
            <span className="text-[11px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Redis
            </span>
          </h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            Pemantauan performa antrean pemrosesan email AI real-time, statistik throughput BullMQ, dan kontrol pemicuan ulang (retry) untuk job yang mengalami error.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 bg-white/10 px-3 py-2 rounded-xl cursor-pointer hover:bg-white/15 transition-colors">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded text-indigo-500 focus:ring-0"
            />
            Auto-Refresh (5s)
          </label>

          <button
            onClick={() => { setLoading(true); fetchQueueStatus(); }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            {message.text}
          </div>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">Tutup</button>
        </div>
      )}

      {/* Scorecard Metric Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Waiting */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Waiting (Menunggu)
            </span>
            <div className="text-3xl font-extrabold text-amber-600 font-mono">
              {counts.waiting + (counts.delayed || 0)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Email di antrean Redis
            </span>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Active */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Active (Sedang Diproses)
            </span>
            <div className="text-3xl font-extrabold text-blue-600 font-mono">
              {counts.active}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Sedang dianalisis LLM
            </span>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 border border-blue-100">
            <Zap className="w-6 h-6 animate-pulse" />
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Completed (Selesai)
            </span>
            <div className="text-3xl font-extrabold text-emerald-600 font-mono">
              {counts.completed}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Sukses terekstraksi
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Failed */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Failed (Gagal Error)
            </span>
            <div className="text-3xl font-extrabold text-rose-600 font-mono">
              {counts.failed}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Memerlukan retry manual
            </span>
          </div>
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0 border border-rose-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* FAILED LOGS & ERROR RETRY TABLE */}
      <div className="bg-white border border-rose-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <span>Tabel Error / Failed Jobs (Daftar Email Gagal Diproses AI)</span>
          </div>
          <span className="text-xs font-bold text-rose-700 bg-white px-2.5 py-1 rounded-lg border border-rose-200">
            {failedJobs.length} Failed Records
          </span>
        </div>

        {failedJobs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            Sempurna! Tidak ada job yang mengalami error di antrean BullMQ saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Job ID</th>
                  <th className="py-3 px-4">Email / Message ID</th>
                  <th className="py-3 px-4">Target Tenant</th>
                  <th className="py-3 px-4">Percobaan (Attempts)</th>
                  <th className="py-3 px-4">Pesan Error / Stack Trace</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {failedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-rose-50/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      #{job.id}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 max-w-xs truncate" title={job.data?.email_id}>
                      {job.data?.email_id || '-'}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      Tenant #{job.data?.tenant_id || 1}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {job.attemptsMade || 1} / 3
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="bg-slate-900 text-rose-300 p-2.5 rounded-lg font-mono text-[11px] leading-relaxed max-h-24 overflow-y-auto break-all border border-slate-800">
                        {job.failedReason || 'Unknown LLM Exception'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleRetryJob(job)}
                        disabled={retryingJobId === job.id}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 ml-auto cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${retryingJobId === job.id ? 'animate-spin' : ''}`} />
                        <span>{retryingJobId === job.id ? 'Retrying...' : 'Retry Job'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* COMPLETED JOBS TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Tabel Completed Jobs (50 Email Selesai Diproses Terakhir)</span>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
            {completedJobs.length} Completed Records
          </span>
        </div>

        {completedJobs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic">
            Belum ada data job selesai di memori Redis saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Job ID</th>
                  <th className="py-3 px-4">Email ID / Message ID</th>
                  <th className="py-3 px-4">Target Tenant</th>
                  <th className="py-3 px-4">Waktu Selesai (Finish Time)</th>
                  <th className="py-3 px-4">AI Processing Duration</th>
                  <th className="py-3 px-4">Status Hasil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      #{job.id}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 max-w-xs truncate" title={job.data?.email_id}>
                      {job.data?.email_id || '-'}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      Tenant #{job.data?.tenant_id || 1}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">
                      {job.finishedOn ? new Date(job.finishedOn).toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {job.durationMs ? (
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">
                          {(job.durationMs / 1000).toFixed(2)}s
                        </span>
                      ) : (
                        <span className="text-slate-400">&lt; 1s</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-emerald-100 text-emerald-800 font-extrabold text-[10px] px-2.5 py-1 rounded-md inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        SUCCESS
                      </span>
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
