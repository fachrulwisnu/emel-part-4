import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Send, 
  RefreshCw, 
  Calendar, 
  Building2, 
  CheckCircle2, 
  MessageSquare, 
  Layers, 
  Clock, 
  Sparkles,
  AlertCircle
} from 'lucide-react';

interface DailySummary {
  id?: number;
  tenant_id: number;
  summary_date: string;
  content_text: string;
  is_sent_to_wa?: boolean;
  created_at?: string;
}

interface BulkSummaryViewProps {
  currentTenantId?: number;
  tenantName?: string;
}

export const BulkSummaryView: React.FC<BulkSummaryViewProps> = ({ currentTenantId, tenantName }) => {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSummaries = async () => {
    setIsLoading(true);
    try {
      const url = currentTenantId ? `/api/daily-summaries?tenant_id=${currentTenantId}` : '/api/daily-summaries';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.summaries) {
        setSummaries(data.summaries);
      }
    } catch (err) {
      console.error('Failed to load daily summaries:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummaries();
  }, [currentTenantId]);

  const handleTriggerBulkSummary = async () => {
    setIsTriggering(true);
    setMessage(null);
    try {
      const res = await fetch('/api/daily-summaries/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: currentTenantId })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Proses pembuatkan Daily Bulk Summary berhasil dipicu!');
        await loadSummaries();
      } else {
        setMessage('Gagal memicu bulk summary: ' + (data.message || 'Error'));
      }
    } catch (err: any) {
      setMessage('Gagal terhubung ke server.');
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded-full text-xs font-semibold mb-2">
            <Layers className="w-3.5 h-3.5" />
            <span>Daily Bulk Email Summary {tenantName ? `• Divisi ${tenantName}` : ''}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Rangkuman Harian & Blast WhatsApp</h1>
          <p className="text-xs text-slate-300 mt-1">
            Rangkuman konsolidasi dari seluruh email belum terbaca/penting harian yang di-generate AI dan di-blast via WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={loadSummaries}
            disabled={isLoading}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium border border-white/20 transition-all flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleTriggerBulkSummary}
            disabled={isTriggering}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-md transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{isTriggering ? 'Generasi AI...' : 'Generate Summary Sekarang'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Summary List */}
      <div className="space-y-4">
        {summaries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Belum Ada Rangkuman Harian</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Sistem akan memproses email durasi harian secara otomatis via cron job dan mengirimkan rangkuman ke nomor WhatsApp divisi.
            </p>
            <button
              onClick={handleTriggerBulkSummary}
              disabled={isTriggering}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Jalankan Manual Sekarang</span>
            </button>
          </div>
        ) : (
          summaries.map((s, idx) => (
            <div key={s.id || idx} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-indigo-300 transition-all space-y-4">
              
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs">
                    Tenant #{s.tenant_id}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span>Rangkuman Tanggal: {s.summary_date}</span>
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Dibuat pada: {s.created_at ? new Date(s.created_at).toLocaleString('id-ID') : 'Baru Saja'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${
                    s.is_sent_to_wa 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{s.is_sent_to_wa ? 'Sent via WhatsApp' : 'Ready for Blast'}</span>
                  </span>
                </div>
              </div>

              {/* Summary Content Body */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs font-mono whitespace-pre-wrap text-slate-800 leading-relaxed">
                {s.content_text}
              </div>

            </div>
          ))
        )}
      </div>

    </div>
  );
};
