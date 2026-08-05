import React, { useState, useEffect } from 'react';
import { Layers, Search, RefreshCw, Clock, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export const PendingOrderInput = ({ currentUser, onOpenDispatch }: { currentUser: any, onOpenDispatch: (id: string) => void }) => {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/emails/pending-orders?tenant_id=' + (currentUser?.tenant_id || ''));
      const data = await res.json();
      if (data.success && data.emails) {
        setEmails(data.emails);
      }
    } catch (err) {
      console.error('Failed to fetch pending orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Pending Order Input</h2>
          <p className="text-sm text-slate-500 mt-1">Daftar email order yang membutuhkan input tiket CIT.</p>
        </div>
        <button 
          onClick={fetchPending}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="px-4 py-3">Informasi Email</th>
                <th className="px-4 py-3">Urgensi & SLA</th>
                <th className="px-4 py-3">Estimasi Nominal</th>
                <th className="px-4 py-3">Progress Input</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Memuat data...</td>
                </tr>
              ) : emails.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 flex flex-col items-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                    <p>Semua order sudah diproses.</p>
                  </td>
                </tr>
              ) : (
                emails.map(email => {
                  const target = email.target_tickets || 1;
                  const processed = email.processed_tickets || 0;
                  const progress = Math.round((processed / target) * 100);
                  const isPartial = processed > 0;

                  return (
                    <tr key={email.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 line-clamp-1">{email.subject}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{email.sender}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                          <Clock className="w-3 h-3" />
                          H-1 / Urgent
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">
                        {email.extracted_notes?.includes('IDR') ? 'Lihat Email' : 'IDR -'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-2 h-2 rounded-full ${isPartial ? 'bg-amber-400' : 'bg-slate-300'}`}></div>
                          <span className="text-xs font-medium text-slate-700">
                            {processed} / {target} Tiket Dibuat
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {currentUser?.permissions?.order_input_create !== false ? (
                          <button 
                            onClick={() => onOpenDispatch(email.message_id || String(email.id))}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
                          >
                            <span>{isPartial ? 'Lanjutkan Input' : 'Mulai Input'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Tidak ada akses</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
