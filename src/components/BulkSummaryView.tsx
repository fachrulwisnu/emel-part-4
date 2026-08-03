import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Send, 
  RefreshCw, 
  Calendar, 
  CheckCircle2, 
  MessageSquare, 
  Layers, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  Mail,
  Eye,
  X,
  User,
  Inbox,
  Clock,
  ShieldAlert,
  Tag,
  Paperclip,
  Check
} from 'lucide-react';

interface EmailSource {
  id?: number;
  message_id: string;
  subject: string;
  sender: string;
  receiver?: string;
  date: string;
  body_text?: string;
  html_body?: string;
  is_read?: boolean;
  is_important?: boolean;
  urgency_level?: string;
  folder_parent?: string;
  folder_child?: string;
  attachments?: any[];
}

interface DailySummary {
  id?: number;
  tenant_id: number;
  summary_date: string;
  content_text: string;
  is_sent_to_wa?: boolean;
  source_email_ids?: string[];
  source_emails?: EmailSource[];
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
  const [blastingId, setBlastingId] = useState<number | null>(null);

  // Accordion state per summary ID
  const [expandedSummaryIds, setExpandedSummaryIds] = useState<Record<number, boolean>>({});

  // Modal summary detail state (INSTRUKSI 3)
  const [selectedSummaryForDetail, setSelectedSummaryForDetail] = useState<DailySummary | null>(null);

  // Modal email detail state
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<EmailSource | null>(null);
  const [viewBodyFormat, setViewBodyFormat] = useState<'text' | 'html'>('text');

  const loadSummaries = async () => {
    setIsLoading(true);
    try {
      const url = currentTenantId ? `/api/daily-summaries?tenant_id=${currentTenantId}` : '/api/daily-summaries';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.summaries) {
        setSummaries(data.summaries);
        // Expand first summary by default
        if (data.summaries.length > 0 && data.summaries[0].id) {
          setExpandedSummaryIds(prev => ({ ...prev, [data.summaries[0].id]: true }));
        }
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
        setMessage('Proses pembuatan Daily Bulk Summary berhasil dipicu!');
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

  const handleWaBlast = async (summaryId: number) => {
    setBlastingId(summaryId);
    setMessage(null);
    try {
      const res = await fetch(`/api/daily-summaries/${summaryId}/wa-blast`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message || 'Berhasil melakukan WA Blast!');
        await loadSummaries();
      } else {
        setMessage('Gagal WA Blast: ' + (data.message || 'Error'));
      }
    } catch (err) {
      setMessage('Gagal terhubung ke server untuk WA Blast.');
    } finally {
      setBlastingId(null);
    }
  };

  const toggleAccordion = (summaryId: number) => {
    setExpandedSummaryIds(prev => ({
      ...prev,
      [summaryId]: !prev[summaryId]
    }));
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
            Transparansi data bahan baku email masuk (Cut-off 05:00 - 23:59) yang dirangkum oleh AI dan siap di-blast via WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={loadSummaries}
            disabled={isLoading}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleTriggerBulkSummary}
            disabled={isTriggering}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{isTriggering ? 'Generasi AI...' : 'Generate Summary Sekarang'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-medium flex items-center gap-2 shadow-xs animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Summary List */}
      <div className="space-y-6">
        {summaries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Belum Ada Rangkuman Harian</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Sistem akan memproses email masuk secara otomatis sesuai cut-off 05:00 - 23:59 harian dan menghasilkan rangkuman AI.
            </p>
            <button
              onClick={handleTriggerBulkSummary}
              disabled={isTriggering}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold shadow-xs hover:bg-indigo-700 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Jalankan Manual Sekarang</span>
            </button>
          </div>
        ) : (
          summaries.map((s, idx) => {
            const summaryId = s.id || idx;
            const isExpanded = !!expandedSummaryIds[summaryId];
            const sourceEmails = s.source_emails || [];
            const sourceCount = sourceEmails.length;

            return (
              <div key={summaryId} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all overflow-hidden">
                
                {/* Header Card with Strategic WA Blast Button */}
                <div className="bg-slate-50/80 p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-xl font-extrabold text-xs shadow-xs">
                      Tenant #{s.tenant_id}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span>Rangkuman Tanggal: {s.summary_date}</span>
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Dibuat: {s.created_at ? new Date(s.created_at).toLocaleString('id-ID') : 'Baru Saja'}</span>
                        <span>•</span>
                        <span className="font-medium text-slate-600">Cut-off Time: 05:00 - 23:59</span>
                      </div>
                    </div>
                  </div>

                  {/* Strategic WA Blast Controls (INSTRUKSI 4) */}
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                      s.is_sent_to_wa 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}>
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{s.is_sent_to_wa ? 'Sent via WhatsApp' : 'Ready for Blast'}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setSelectedSummaryForDetail(s)}
                      className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Detail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleWaBlast(summaryId)}
                      disabled={blastingId === summaryId}
                      className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer ${
                        s.is_sent_to_wa
                          ? 'bg-slate-800 hover:bg-slate-900 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                      title="Kirim hasil rangkuman AI ke nomor WhatsApp divisi"
                    >
                      <Send className={`w-3.5 h-3.5 ${blastingId === summaryId ? 'animate-pulse' : ''}`} />
                      <span>{blastingId === summaryId ? 'Mengirim...' : s.is_sent_to_wa ? 'Blast Ulang WA' : 'Blast WA Sekarang'}</span>
                    </button>
                  </div>
                </div>

                {/* AI Summary Content Text Box */}
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Teks Hasil Summary AI (WhatsApp Ready)</span>
                    </h4>
                  </div>

                  <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed shadow-inner border border-slate-800">
                    {s.content_text}
                  </div>

                  {/* INSTRUKSI 3: DATA TRANSPARENCY & AWARENESS SECTION */}
                  <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                    
                    {/* Section Accordion Header */}
                    <div 
                      onClick={() => toggleAccordion(summaryId)}
                      className="p-3.5 bg-indigo-50/80 hover:bg-indigo-100/70 border-b border-indigo-100 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Inbox className="w-4 h-4 text-indigo-700" />
                        <span className="font-bold text-xs text-indigo-950">
                          Referensi Email Masuk ({sourceCount} Email)
                        </span>
                        <span className="text-[10px] bg-indigo-600 text-white font-extrabold px-2 py-0.5 rounded-full">
                          {sourceCount} Email Terangkum
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-700">
                        <span>{isExpanded ? 'Sembunyikan Daftar' : 'Tampilkan Daftar Email'}</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Section Accordion Content List */}
                    {isExpanded && (
                      <div className="p-3 divide-y divide-slate-200/80 bg-white">
                        {sourceCount === 0 ? (
                          <div className="py-6 text-center text-slate-400 text-xs italic">
                            Tidak ada metadata email sumber khusus yang tersimpan untuk rangkuman ini.
                          </div>
                        ) : (
                          sourceEmails.map((email, eIdx) => (
                            <div 
                              key={email.message_id || eIdx}
                              onClick={() => setSelectedEmailDetail(email)}
                              className="py-3 px-3 hover:bg-indigo-50/50 rounded-lg transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                            >
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="p-2 bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 rounded-lg shrink-0 transition-colors">
                                  <Mail className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-slate-900 truncate">
                                      {email.subject || '(Tanpa Subjek)'}
                                    </span>
                                    {email.urgency_level === 'High' && (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-red-100 text-red-700 border border-red-200 shrink-0">
                                        Penting
                                      </span>
                                    )}
                                    {!email.is_read && (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                        Unread
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 truncate">
                                    <span className="font-semibold text-slate-700">Pengirim:</span> {email.sender || 'Unknown'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                  <span className="text-[11px] font-mono text-slate-500 block">
                                    {email.date ? new Date(email.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    {email.date ? new Date(email.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : ''}
                                  </span>
                                </div>
                                <div className="p-1.5 text-slate-400 group-hover:text-indigo-600 transition-colors">
                                  <Eye className="w-4 h-4" />
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                  </div>

                </div>

              </div>
            );
          })
        )}
      </div>

      {/* VIEW EMAIL DETAIL MODAL / OVERLAY (INSTRUKSI 3.4) */}
      {selectedEmailDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                  <Mail className="w-4 h-4" />
                  <span>Detail Email Asli (Bahan Baku Summary)</span>
                </div>
                <h3 className="font-bold text-base text-white tracking-tight leading-snug">
                  {selectedEmailDetail.subject || '(Tanpa Subjek)'}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEmailDetail(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Metadata Info Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-bold">Pengirim:</span>
                  <span className="font-mono text-slate-900">{selectedEmailDetail.sender}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{selectedEmailDetail.date ? new Date(selectedEmailDetail.date).toLocaleString('id-ID') : '-'}</span>
                </div>
              </div>

              {selectedEmailDetail.receiver && (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className="font-bold">Penerima:</span>
                  <span className="font-mono text-slate-800">{selectedEmailDetail.receiver}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {selectedEmailDetail.urgency_level && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-200">
                    Urgency: {selectedEmailDetail.urgency_level}
                  </span>
                )}
                {selectedEmailDetail.folder_parent && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                    Kategori: {selectedEmailDetail.folder_parent} {selectedEmailDetail.folder_child ? `> ${selectedEmailDetail.folder_child}` : ''}
                  </span>
                )}
                {selectedEmailDetail.attachments && selectedEmailDetail.attachments.length > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200 text-slate-800 flex items-center gap-1">
                    <Paperclip className="w-3 h-3" />
                    <span>{selectedEmailDetail.attachments.length} Lampiran</span>
                  </span>
                )}
              </div>
            </div>

            {/* View Format Selector */}
            {selectedEmailDetail.html_body && (
              <div className="px-5 pt-3 bg-white flex items-center justify-between text-xs border-b border-slate-100">
                <span className="font-bold text-slate-600">Format Teks:</span>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setViewBodyFormat('text')}
                    className={`px-3 py-1 rounded-md font-bold transition-all ${
                      viewBodyFormat === 'text' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Teks Mentah
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewBodyFormat('html')}
                    className={`px-3 py-1 rounded-md font-bold transition-all ${
                      viewBodyFormat === 'html' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tampilan HTML
                  </button>
                </div>
              </div>
            )}

            {/* Email Body Content */}
            <div className="p-5 overflow-y-auto flex-1 text-xs text-slate-800 leading-relaxed bg-white">
              {viewBodyFormat === 'html' && selectedEmailDetail.html_body ? (
                <div 
                  className="prose prose-slate max-w-none text-xs"
                  dangerouslySetInnerHTML={{ __html: selectedEmailDetail.html_body }} 
                />
              ) : (
                <div className="font-mono whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-slate-800">
                  {selectedEmailDetail.body_text || '(Tidak ada konten teks)'}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEmailDetail(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Tutup Detail Email
              </button>
            </div>

          </div>
        </div>
      )}

      {/* SUMMARY DETAIL FULL MODAL (INSTRUKSI 3) */}
      {selectedSummaryForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-1">
                  <FileText className="w-4 h-4" />
                  <span>Detail Daily Bulk Email Summary</span>
                </div>
                <h3 className="font-bold text-lg text-white">
                  Rangkuman Tanggal: {selectedSummaryForDetail.summary_date}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Tenant #{selectedSummaryForDetail.tenant_id} • Dibuat: {selectedSummaryForDetail.created_at ? new Date(selectedSummaryForDetail.created_at).toLocaleString('id-ID') : '-'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleWaBlast(selectedSummaryForDetail.id || 0)}
                  disabled={blastingId === selectedSummaryForDetail.id}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{blastingId === selectedSummaryForDetail.id ? 'Sending...' : selectedSummaryForDetail.is_sent_to_wa ? 'Blast Ulang WA' : 'Blast WA Sekarang'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSummaryForDetail(null)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* WhatsApp Text Summary */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Teks Rangkuman AI
                </h4>
                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed shadow-inner border border-slate-800">
                  {selectedSummaryForDetail.content_text}
                </div>
              </div>

              {/* Source Emails Accordion List */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-indigo-600" />
                  Referensi Email Masuk ({(selectedSummaryForDetail.source_emails || []).length} Email)
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200 bg-white">
                  {(selectedSummaryForDetail.source_emails || []).length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs italic">
                      Tidak ada daftar email sumber khusus untuk rangkuman ini.
                    </div>
                  ) : (
                    (selectedSummaryForDetail.source_emails || []).map((email, eIdx) => (
                      <div
                        key={email.message_id || eIdx}
                        onClick={() => setSelectedEmailDetail(email)}
                        className="p-3 hover:bg-indigo-50/50 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-2 bg-slate-100 group-hover:bg-indigo-100 text-slate-600 group-hover:text-indigo-700 rounded-lg shrink-0">
                            <Mail className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-xs text-slate-900 truncate">
                              {email.subject || '(Tanpa Subjek)'}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              Pengirim: {email.sender || 'Unknown'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] font-mono text-slate-500">
                            {email.date ? new Date(email.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </span>
                          <Eye className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSummaryForDetail(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                Tutup Detail
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
