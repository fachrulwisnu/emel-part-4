import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  Check,
  History,
  Copy
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
  id?: number | string;
  tenant_id: number;
  summary_date: string;
  content_text: string;
  content_text_short?: string;
  is_sent_to_wa?: boolean;
  source_email_ids?: string[];
  source_emails?: EmailSource[];
  created_at?: string;
  history?: DailySummary[];
}

interface BulkSummaryViewProps {
  currentTenantId?: number;
  tenantName?: string;
}

export const BulkSummaryView: React.FC<BulkSummaryViewProps> = ({ currentTenantId, tenantName }) => {
  const getYYYYMMDD = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => getYYYYMMDD(new Date()), []);
  const h2Str = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return getYYYYMMDD(d);
  }, []);

  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [isLoading, setIsLoading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blastingId, setBlastingId] = useState<number | string | null>(null);

  // Cache & Incremental Detection States
  const [isCached, setIsCached] = useState<boolean>(false);
  const [hasNewEmails, setHasNewEmails] = useState<boolean>(false);
  const [newEmailsCount, setNewEmailsCount] = useState<number>(0);

  // Progress Bar & Step Status & Estimated Time States
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentStepText, setCurrentStepText] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Accordion state per summary ID
  const [expandedSummaryIds, setExpandedSummaryIds] = useState<Record<string | number, boolean>>({});

  // Active Tab per summary card: 'full' (Laporan Lengkap Web/DCT) vs 'short' (Telegram/WA)
  const [activeTabMap, setActiveTabMap] = useState<Record<string | number, 'full' | 'short'>>({});

  // Selected Version per summary card
  const [selectedVersionMap, setSelectedVersionMap] = useState<Record<string | number, number>>({});

  // Copied indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal summary detail state (INSTRUKSI 3)
  const [selectedSummaryForDetail, setSelectedSummaryForDetail] = useState<DailySummary | null>(null);

  // Modal email detail state
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<EmailSource | null>(null);
  const [viewBodyFormat, setViewBodyFormat] = useState<'text' | 'html'>('text');

  const validateDateRange = (dateStr: string): boolean => {
    if (dateStr > todayStr) {
      setMessage("Tidak dapat merangkum tanggal di masa depan.");
      return false;
    }
    if (dateStr < h2Str) {
      setMessage(`Peringatan: Rentang tanggal melebihi batas maksimal 2 hari ke belakang. Silakan pilih tanggal antara ${h2Str} sampai ${todayStr}.`);
      return false;
    }
    return true;
  };

  const loadSummaries = async (overrideDate?: string) => {
    const rawDate = overrideDate || selectedDate;
    const targetDateStr = typeof rawDate === 'string' && rawDate.trim() ? rawDate.trim().split('T')[0] : todayStr;
    if (!validateDateRange(targetDateStr)) {
      setSummaries([]);
      return;
    }

    setIsLoading(true);
    setSummaries([]);
    try {
      let url = `/api/bulk-summary/today?target_date=${targetDateStr}`;
      if (currentTenantId) url += `&tenant_id=${currentTenantId}`;
      const res = await fetch(url);
      const data = await res.json();
      
      setIsCached(Boolean(data.cached));
      setHasNewEmails(Boolean(data.has_new_emails));
      setNewEmailsCount(Number(data.new_emails_count || 0));

      const targetObj = data.data || data.cached_data;
      const textContent = targetObj?.summary_text || targetObj?.content_text;
      if (data.success && targetObj && textContent && textContent.trim().length > 0) {
        const mappedData = {
          ...targetObj,
          content_text: textContent,
          content_text_short: targetObj.summary_text_short || targetObj.content_text_short,
          created_at: targetObj.generated_at || targetObj.created_at,
          source_emails: targetObj.referenced_emails || targetObj.source_emails
        };
        setSummaries([mappedData]);
        if (mappedData.id) {
          setExpandedSummaryIds({ [mappedData.id]: true });
        }
      } else {
        setSummaries([]);
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

  const handleTriggerBulkSummary = async (overrideDate?: string, options?: { is_merge?: boolean; force_refresh?: boolean; force_reprocess?: boolean }) => {
    const rawDate = overrideDate || selectedDate;
    const targetDateStr = typeof rawDate === 'string' && rawDate.trim() ? rawDate.trim().split('T')[0] : todayStr;
    setMessage(null);

    if (!validateDateRange(targetDateStr)) {
      return;
    }

    setIsTriggering(true);
    setIsLoading(true);
    
    // Setup Progress Bar Simulation & Step Tracking
    const estSec = options?.is_merge ? 5 : 8;
    setRemainingSeconds(estSec);
    setProgressPercent(15);
    setCurrentStepText('Step 1 (20%): Memeriksa cache & mendeteksi email baru...');

    let currentSec = estSec;
    const interval = setInterval(() => {
      currentSec -= 1;
      if (currentSec >= 0) {
        setRemainingSeconds(currentSec);
      }

      setProgressPercent(prev => {
        if (prev < 30) {
          setCurrentStepText('Step 1 (20%): Memeriksa cache & mendeteksi email baru...');
          return prev + 10;
        } else if (prev < 65) {
          setCurrentStepText('Step 2 (50%): Mengagregasi payload email...');
          return prev + 12;
        } else if (prev < 90) {
          setCurrentStepText('Step 3 (85%): Core AI Engine menyusun Executive Dashboard...');
          return prev + 8;
        }
        return prev;
      });
    }, 600);

    try {
      const res = await fetch('/api/bulk-summary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenantId,
          target_date: targetDateStr,
          is_merge: Boolean(options?.is_merge),
          force_refresh: Boolean(options?.force_refresh),
          force_reprocess: Boolean(options?.force_reprocess || options?.force_refresh || options?.is_merge)
        })
      });
      const data = await res.json();
      clearInterval(interval);
      
      setProgressPercent(100);
      setCurrentStepText('Step 4 (100%): Menyimpan dan memfinalisasi laporan...');

      const targetObj = data.data || data.cached_data;
      if (data.success && targetObj) {
        setIsCached(Boolean(data.cached));
        setHasNewEmails(Boolean(data.has_new_emails));
        setNewEmailsCount(Number(data.new_emails_count || 0));

        setMessage(data.message || `Rangkuman baru berhasil diproses untuk tanggal ${targetDateStr}!`);
        const mappedData = {
          ...targetObj,
          content_text: targetObj.summary_text || targetObj.content_text,
          content_text_short: targetObj.summary_text_short || targetObj.content_text_short,
          created_at: targetObj.generated_at || targetObj.created_at,
          source_emails: targetObj.referenced_emails || targetObj.source_emails
        };
        setSummaries([mappedData]);
        if (mappedData.id) {
          setExpandedSummaryIds({ [mappedData.id]: true });
        }
      } else {
        setMessage(data.message || 'Gagal memicu bulk summary');
        setSummaries([]);
      }
    } catch (err: any) {
      clearInterval(interval);
      setMessage('Gagal terhubung ke server.');
    } finally {
      setTimeout(() => {
        setIsTriggering(false);
        setIsLoading(false);
        setProgressPercent(0);
        setCurrentStepText('');
      }, 500);
    }
  };

  const handleWaBlast = async (summaryId: number | string) => {
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

  const toggleAccordion = (summaryId: number | string) => {
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

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Filter Tanggal (Date-Picker) untuk History */}
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white shadow-inner">
            <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-semibold text-slate-300 shrink-0 text-[11px]">Tanggal:</span>
            <input 
              type="date"
              min={h2Str}
              max={todayStr}
              value={selectedDate}
              onChange={(e) => {
                const newDate = e.target.value;
                setSelectedDate(newDate);
                loadSummaries(newDate);
              }}
              className="bg-transparent text-white focus:outline-none font-bold cursor-pointer text-xs"
            />
          </div>

          <button
            onClick={() => loadSummaries(selectedDate)}
            disabled={isLoading}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => handleTriggerBulkSummary(selectedDate)}
            disabled={isTriggering || isLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 text-amber-300 ${(isTriggering || isLoading) ? 'animate-spin' : ''}`} />
            <span>{(isTriggering || isLoading) ? 'Memproses AI Summary...' : 'Generate Summary Sekarang'}</span>
          </button>
        </div>
      </div>

      {/* INSTRUKSI 3: PROGRESS BAR & REALTIME STEP STATUS */}
      {(isTriggering || (isLoading && progressPercent > 0)) && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 text-white shadow-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-indigo-300">
              <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
              <span>{currentStepText || 'Memproses AI Engine...'}</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              {remainingSeconds > 0 && (
                <span className="bg-indigo-950 px-3 py-1 rounded-full border border-indigo-700/60 text-indigo-200">
                  Estimasi Sisa: {remainingSeconds} detik
                </span>
              )}
              <span className="font-extrabold text-indigo-400 text-xs">{progressPercent}%</span>
            </div>
          </div>

          {/* Dynamic Progress Bar */}
          <div className="w-full bg-slate-800 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-700">
            <div 
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out shadow-sm"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Step Badges */}
          <div className="grid grid-cols-4 gap-2 pt-1 text-[10px] font-medium text-slate-400 text-center">
            <div className={`py-1.5 px-2 rounded-lg border transition-all ${progressPercent >= 20 ? 'bg-indigo-950 text-indigo-200 border-indigo-600 font-bold' : 'bg-slate-800/50 border-slate-700/50'}`}>
              1. Cek Cache (20%)
            </div>
            <div className={`py-1.5 px-2 rounded-lg border transition-all ${progressPercent >= 50 ? 'bg-indigo-950 text-indigo-200 border-indigo-600 font-bold' : 'bg-slate-800/50 border-slate-700/50'}`}>
              2. Agregasi Email (50%)
            </div>
            <div className={`py-1.5 px-2 rounded-lg border transition-all ${progressPercent >= 85 ? 'bg-indigo-950 text-indigo-200 border-indigo-600 font-bold' : 'bg-slate-800/50 border-slate-700/50'}`}>
              3. Core AI Engine (85%)
            </div>
            <div className={`py-1.5 px-2 rounded-lg border transition-all ${progressPercent >= 100 ? 'bg-emerald-950 text-emerald-200 border-emerald-600 font-bold' : 'bg-slate-800/50 border-slate-700/50'}`}>
              4. Finalisasi (100%)
            </div>
          </div>
        </div>
      )}

      {/* INSTRUKSI 3: INCREMENTAL NEW EMAIL DETECTION & MERGE BANNER */}
      {hasNewEmails && !isTriggering && (
        <div className="p-5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-200/80 text-amber-800 border border-amber-300">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-amber-950 flex items-center gap-2">
                <span>Terdeteksi {newEmailsCount} Email Baru yang belum dirangkum!</span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Terdapat email baru yang masuk sejak rangkuman terakhir. Gabungkan email baru ke dalam laporan harian tanpa membuang token untuk merangkum ulang email lama.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
            <button
              onClick={() => handleTriggerBulkSummary(selectedDate, { force_reprocess: true, is_merge: true })}
              disabled={isTriggering || isLoading}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 fill-white" />
              <span>Merge & Generate Ulang</span>
            </button>
          </div>
        </div>
      )}

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
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center border border-indigo-100 shadow-2xs">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Belum ada rangkuman untuk tanggal ini</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Belum ada rangkuman harian yang ter-generate untuk tanggal {selectedDate}. Silakan klik Generate Summary di bawah ini.
            </p>
            <button
              onClick={() => handleTriggerBulkSummary()}
              disabled={isTriggering || isLoading}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-700 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 text-amber-300 ${(isTriggering || isLoading) ? 'animate-spin' : ''}`} />
              <span>{(isTriggering || isLoading) ? 'Memproses AI Summary...' : 'Generate Summary Tanggal Ini'}</span>
            </button>
          </div>
        ) : (
          summaries.map((s, idx) => {
            const summaryId = s.id || idx;
            const isExpanded = !!expandedSummaryIds[summaryId];
            
            // Version History calculation
            const historyList = (s.history && s.history.length > 0) ? s.history : [s];
            const currentVersionIdx = selectedVersionMap[summaryId] ?? 0;
            const activeSummary = historyList[currentVersionIdx] || s;

            const sourceEmails = activeSummary.source_emails || s.source_emails || [];
            const sourceCount = sourceEmails.length;

            const currentTab = activeTabMap[summaryId] || 'full';
            const displayText = currentTab === 'short' 
              ? (activeSummary.content_text_short || activeSummary.content_text)
              : activeSummary.content_text;

            const handleCopyText = (text: string) => {
              navigator.clipboard.writeText(text);
              setCopiedKey(`${summaryId}-${currentTab}`);
              setTimeout(() => setCopiedKey(null), 2000);
            };

            return (
              <div key={summaryId} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all overflow-hidden">
                
                {/* Header Card with Version Selector & Action Buttons */}
                <div className="bg-slate-50/80 p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-xl font-extrabold text-xs shadow-xs">
                      Tenant #{s.tenant_id}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span>Rangkuman Tanggal: {String(s.summary_date || '')}</span>
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Diperbarui: {activeSummary.created_at ? new Date(activeSummary.created_at).toLocaleString('id-ID') : 'Baru Saja'}</span>
                        <span>•</span>
                        <span className="font-medium text-slate-600">Cut-off: 05:00 - 23:59</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Right Actions & Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Version History Dropdown / Switcher if multiple versions exist */}
                    {historyList.length > 1 && (
                      <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-1 text-xs">
                        <History className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="font-bold text-indigo-900 text-[11px]">Versi:</span>
                        <select
                          value={currentVersionIdx}
                          onChange={(e) => setSelectedVersionMap(prev => ({ ...prev, [summaryId]: Number(e.target.value) }))}
                          className="bg-transparent font-bold text-indigo-700 focus:outline-none cursor-pointer text-xs"
                        >
                          {historyList.map((h, hIdx) => (
                            <option key={hIdx} value={hIdx}>
                              Versi #{historyList.length - hIdx} ({h.created_at ? new Date(h.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Terbaru'}) {hIdx === 0 ? '• Terbaru' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {isCached && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>Cached</span>
                      </span>
                    )}

                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                      s.is_sent_to_wa 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}>
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{s.is_sent_to_wa ? 'Sent via WA' : 'Ready for Blast'}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setSelectedSummaryForDetail(activeSummary)}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Detail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleWaBlast(summaryId as number)}
                      disabled={blastingId === summaryId}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                        s.is_sent_to_wa
                          ? 'bg-slate-800 hover:bg-slate-900 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      <Send className={`w-3.5 h-3.5 ${blastingId === summaryId ? 'animate-pulse' : ''}`} />
                      <span>{blastingId === summaryId ? 'Mengirim...' : s.is_sent_to_wa ? 'Blast Ulang WA' : 'Blast WA'}</span>
                    </button>
                  </div>
                </div>

                {/* AI Summary Content & Format Switcher Tabs */}
                <div className="p-5 space-y-4">
                  {/* Format Tabs & Copy Action */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTabMap(prev => ({ ...prev, [summaryId]: 'full' as const }))}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          currentTab === 'full'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Laporan Lengkap (Web / DCT)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTabMap(prev => ({ ...prev, [summaryId]: 'short' as const }))}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          currentTab === 'short'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Format Ringkas (Telegram / WA)</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyText(displayText)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === `${summaryId}-${currentTab}` ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Teks Disalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Salin Teks {currentTab === 'short' ? 'Telegram/WA' : 'Laporan'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Summary Text Content Rendering */}
                  {currentTab === 'full' ? (
                    <div className="bg-white text-gray-900 border border-gray-200 shadow-sm rounded-xl p-6 lg:p-8 prose prose-slate prose-table:border-collapse prose-th:bg-gray-100 prose-td:border prose-td:border-gray-200 max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 text-emerald-950 border border-emerald-200 shadow-sm rounded-xl p-6 lg:p-8 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {displayText}
                    </div>
                  )}

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
                  Rangkuman Tanggal: {String(selectedSummaryForDetail.summary_date || '')}
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
              {/* Laporan Lengkap (Web / DCT) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Laporan Lengkap (Web / DCT)
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedSummaryForDetail.content_text);
                      setCopiedKey('modal-full');
                      setTimeout(() => setCopiedKey(null), 2000);
                    }}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'modal-full' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{copiedKey === 'modal-full' ? 'Disalin!' : 'Salin Laporan'}</span>
                  </button>
                </div>
                <div className="bg-white text-gray-900 border border-gray-200 shadow-sm rounded-xl p-6 lg:p-8 prose prose-slate prose-table:border-collapse prose-th:bg-gray-100 prose-td:border prose-td:border-gray-200 max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedSummaryForDetail.content_text}</ReactMarkdown>
                </div>
              </div>

              {/* Format Ringkas (Telegram / WA) */}
              {selectedSummaryForDetail.content_text_short && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      Format Ringkas (Telegram / WhatsApp)
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedSummaryForDetail.content_text_short || '');
                        setCopiedKey('modal-short');
                        setTimeout(() => setCopiedKey(null), 2000);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'modal-short' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{copiedKey === 'modal-short' ? 'Disalin!' : 'Salin Telegram/WA'}</span>
                    </button>
                  </div>
                  <div className="bg-emerald-50 text-emerald-950 border border-emerald-200 shadow-sm rounded-xl p-6 lg:p-8 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                    {selectedSummaryForDetail.content_text_short}
                  </div>
                </div>
              )}

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
