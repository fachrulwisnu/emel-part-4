import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  Mail, 
  Calendar, 
  User, 
  Download, 
  Sparkles, 
  RefreshCw, 
  FileText, 
  AlertCircle, 
  CheckCircle2,
  Inbox
} from 'lucide-react';

interface EmailIntelligenceSectionProps {
  onAddToast?: (title: string, message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export default function EmailIntelligenceSection({ onAddToast }: EmailIntelligenceSectionProps) {
  const [groupedEmails, setGroupedEmails] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Pending count & bulk processing states
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isBulkProcessing, setIsBulkProcessing] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<number>(0);
  const [bulkStatusText, setBulkStatusText] = useState<string>('');
  const [bulkLog, setBulkLog] = useState<string[]>([]);

  const fetchPendingCount = async () => {
    try {
      const res = await fetch('/api/emails/pending-intelligence');
      const json = await res.json();
      if (json.success) {
        setPendingCount(json.count);
      }
    } catch (err) {
      console.error('Failed to fetch pending intelligence count:', err);
    }
  };

  const fetchGroupedData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/emails/grouped');
      const json = await res.json();
      if (json.success) {
        setGroupedEmails(json.grouped || {});
      } else if (onAddToast) {
        onAddToast('Error', json.message || 'Gagal memuat data email terkelompok');
      }
    } catch (err: any) {
      console.error('Failed to fetch grouped emails:', err);
      if (onAddToast) {
        onAddToast('Error', err.message || String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupedData();
    fetchPendingCount();
  }, []);

  const startBulkIntelligence = () => {
    setIsBulkProcessing(true);
    setBulkProgress(0);
    setBulkStatusText('Starting bulk intelligence processing...');
    setBulkLog(['Memulai proses bulk...']);

    const eventSource = new EventSource('/api/emails/bulk-intelligence/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.percentage !== undefined) {
          setBulkProgress(data.percentage);
        }
        if (data.log) {
          setBulkStatusText(data.log);
          setBulkLog(prev => [data.log, ...prev].slice(0, 10));
        }

        if (data.status === 'complete') {
          eventSource.close();
          setIsBulkProcessing(false);
          if (onAddToast) {
            onAddToast('Bulk Complete', 'Semua email berhasil dianalisis!', 'success');
          }
          fetchGroupedData();
          fetchPendingCount();
        } else if (data.status === 'error') {
          eventSource.close();
          setIsBulkProcessing(false);
          if (onAddToast) {
            onAddToast('Bulk Error', data.log || 'Terjadi kesalahan saat memproses bulk', 'error');
          }
        }
      } catch (err: any) {
        console.error('SSE JSON parse error:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE stream error:', err);
      eventSource.close();
      setIsBulkProcessing(false);
      setBulkStatusText('Terjadi gangguan koneksi pada stream.');
    };
  };

  const toggleNode = (nodePath: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  const handleSelectEmail = (email: any) => {
    setSelectedEmail(email);
    setFeedbackMsg(null);
  };

  const handleAnalyzeIntelligence = async (messageId: string) => {
    if (!messageId) return;
    try {
      setIsAnalyzing(true);
      setFeedbackMsg(null);
      if (onAddToast) {
        onAddToast('AI Processing', 'Memulai analisis mendalam dengan model NVIDIA & Ephemeral files...', 'info');
      }

      const res = await fetch('/api/emails/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message_id: messageId })
      });

      const json = await res.json();
      if (json.success) {
        setFeedbackMsg({ text: 'Analisis AI Intelligence berhasil diselesaikan!', type: 'success' });
        if (onAddToast) {
          onAddToast('Success', 'Analisis email intelligence berhasil!', 'success');
        }
        
        // Refresh grouped data
        const refreshRes = await fetch('/api/emails/grouped');
        const refreshJson = await refreshRes.json();
        if (refreshJson.success) {
          setGroupedEmails(refreshJson.grouped || {});
          
          // Re-find selected email in refreshed data to update UI
          let found = false;
          const freshGrouped = refreshJson.grouped || {};
          for (const folder of Object.keys(freshGrouped)) {
            for (const sub of Object.keys(freshGrouped[folder])) {
              const matches = freshGrouped[folder][sub].find((e: any) => e.message_id === messageId);
              if (matches) {
                setSelectedEmail(matches);
                found = true;
                break;
              }
            }
            if (found) break;
          }
        }
      } else {
        const errorText = json.message || 'Gagal menganalisis email';
        setFeedbackMsg({ text: errorText, type: 'error' });
        if (onAddToast) {
          onAddToast('Error', errorText, 'error');
        }
      }
    } catch (err: any) {
      console.error('Analyze intelligence error:', err);
      const msg = err.message || String(err);
      setFeedbackMsg({ text: msg, type: 'error' });
      if (onAddToast) {
        onAddToast('Error', msg, 'error');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadAttachment = (messageId: string, filename: string) => {
    window.open(`/api/emails/${messageId}/attachment/${encodeURIComponent(filename)}`, '_blank');
  };

  const formatEmailDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-1 flex-row overflow-hidden bg-slate-50 w-full" id="email_intelligence_root">
      {/* LEFT PANEL: Folder Tree Accordion */}
      <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto" id="intelligence_sidebar">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FolderOpen className="h-5 w-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800">Tree Navigasi Folder</h2>
          </div>
          <button 
            onClick={fetchGroupedData}
            disabled={loading}
            className="p-1.5 hover:bg-slate-100 text-slate-500 rounded transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Pending Intelligence Info & Bulk Trigger */}
        <div className="mx-3 my-2.5 p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status Antrean AI</span>
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-extrabold rounded-full animate-pulse">
              {pendingCount} Pending
            </span>
          </div>
          
          <p className="text-[11px] text-slate-500 leading-normal">
            Terdapat {pendingCount} email berlampiran yang belum dianalisis secara mendalam oleh AI.
          </p>

          {!isBulkProcessing ? (
            <button
              onClick={startBulkIntelligence}
              disabled={pendingCount === 0}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              <span>Bulk Analyze Attachments</span>
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="flex justify-between text-[11px] font-bold text-indigo-700">
                <span className="truncate max-w-[150px]">{bulkStatusText}</span>
                <span>{bulkProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${bulkProgress}%` }}
                />
              </div>
              <div className="text-[9px] text-slate-400 font-mono max-h-16 overflow-y-auto leading-normal pt-1.5 border-t border-indigo-100/40 select-none">
                {bulkLog.map((logLine, idx) => (
                  <div key={idx} className="truncate">{logLine}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-8 space-y-3">
            <RefreshCw className="h-6 w-6 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-400 font-medium font-mono">Memuat navigasi beralur...</p>
          </div>
        ) : Object.keys(groupedEmails).length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 font-medium">
            <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            Belum ada email yang di-database-kan
          </div>
        ) : (
          <div className="p-3 space-y-1.5" id="tree_navigation_container">
            {Object.keys(groupedEmails).map((folderParent) => {
              const isFolderOpen = expandedNodes[folderParent];
              const subFolders = groupedEmails[folderParent];
              const totalEmailsInFolder = Object.values(subFolders).reduce((acc: number, list: any) => acc + list.length, 0);

              return (
                <div key={folderParent} className="space-y-1">
                  {/* LEVEL 1: Folder Parent */}
                  <button
                    onClick={() => toggleNode(folderParent)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-100/80 transition-all text-left text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      {isFolderOpen ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                      {isFolderOpen ? <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" /> : <Folder className="h-4 w-4 text-amber-500 shrink-0" />}
                      <span className="truncate uppercase">{folderParent}</span>
                    </div>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] shrink-0">{totalEmailsInFolder}</span>
                  </button>

                  {/* LEVEL 2: Sub-Folders inside Parent */}
                  {isFolderOpen && (
                    <div className="pl-4 space-y-1 border-l border-slate-200/60 ml-4 py-1">
                      {Object.keys(subFolders).map((folderChild) => {
                        const childPath = `${folderParent}/${folderChild}`;
                        const isChildOpen = expandedNodes[childPath];
                        const emailList = subFolders[folderChild];

                        return (
                          <div key={folderChild} className="space-y-1">
                            <button
                              onClick={() => toggleNode(childPath)}
                              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-slate-100/70 transition-all text-left text-[11px] font-semibold text-slate-600 cursor-pointer"
                            >
                              <div className="flex items-center space-x-1.5 truncate">
                                {isChildOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                                <span className="truncate text-slate-600">{folderChild}</span>
                              </div>
                              <span className="px-1.5 py-0.2 bg-blue-50 text-blue-600 rounded-full text-[9px] font-bold shrink-0">{emailList.length}</span>
                            </button>

                            {/* LEVEL 3: Emails in Sub-Folder */}
                            {isChildOpen && (
                              <div className="pl-3.5 ml-2 border-l border-slate-200/40 py-0.5 space-y-1">
                                {emailList.map((email: any) => {
                                  const isCurrent = selectedEmail?.message_id === email.message_id;
                                  return (
                                    <button
                                      key={email.message_id}
                                      onClick={() => handleSelectEmail(email)}
                                      className={`w-full flex items-start space-x-1.5 p-2 rounded-lg text-left transition-all cursor-pointer ${
                                        isCurrent 
                                          ? 'bg-blue-50/80 border border-blue-200 text-blue-700' 
                                          : 'hover:bg-slate-50 border border-transparent text-slate-600 hover:text-slate-800'
                                      }`}
                                    >
                                      <Mail className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${isCurrent ? 'text-blue-500' : 'text-slate-400'}`} />
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <p className="text-[11px] font-bold truncate leading-tight">{email.subject || '(Tanpa Subjek)'}</p>
                                        <p className="text-[9px] text-slate-400 truncate flex justify-between">
                                          <span>{email.sender}</span>
                                        </p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {/* RIGHT PANEL: Email Intelligence Viewer */}
      <section className="flex-1 flex flex-col overflow-y-auto p-6" id="intelligence_detail_view">
        {selectedEmail ? (
          <div className="space-y-6 max-w-4xl">
            {/* Header / Breadcrumb and Core Metadata Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                <div className="flex items-center space-x-1">
                  <span>Navigasi</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-blue-600">{selectedEmail.folder_parent}</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-indigo-600">{selectedEmail.folder_child}</span>
                </div>
                <span className="font-mono text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                  {selectedEmail.ai_status || 'PENDING'}
                </span>
              </div>

              <div className="space-y-2">
                <h1 className="text-base font-bold text-slate-800 tracking-tight leading-snug">
                  {selectedEmail.subject || '(Tanpa Subjek)'}
                </h1>
                
                <div className="grid grid-cols-2 gap-4 text-xs pt-2">
                  <div className="flex items-center space-x-2 text-slate-600">
                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate font-semibold">Dari: {selectedEmail.sender}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-slate-600">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>Diterima: {formatEmailDate(selectedEmail.date)}</span>
                  </div>
                </div>
              </div>

              {/* Action and manual trigger section */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex gap-1.5 flex-wrap">
                  {selectedEmail.tags && (Array.isArray(selectedEmail.tags) ? selectedEmail.tags : JSON.parse(selectedEmail.tags || '[]')).map((tag: string, idx: number) => (
                    <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md border border-blue-200/50">
                      #{tag}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleAnalyzeIntelligence(selectedEmail.message_id)}
                  disabled={isAnalyzing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Menganalisis...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Analyze Intelligence</span>
                    </>
                  )}
                </button>
              </div>

              {feedbackMsg && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${feedbackMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                  {feedbackMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}
            </div>

            {/* Email Summary Card */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center space-x-2">
                <FileText className="h-4.5 w-4.5 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Summary Email</h3>
              </div>
              <div className="p-6">
                <p className="text-xs text-slate-700 leading-relaxed bg-blue-50/30 p-4 rounded-xl border border-blue-100/30 font-medium select-text whitespace-pre-line">
                  {selectedEmail.summary_email || selectedEmail.summary || 'Belum ada ringkasan yang diekstraksi. Klik tombol "Analyze Intelligence" di atas untuk memproses email ini.'}
                </p>
              </div>
            </div>

            {/* Attachment Summary Card */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center space-x-2">
                <Download className="h-4.5 w-4.5 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Summary Attachment (Ephemeral Source)</h3>
              </div>
              <div className="p-6 space-y-4">
                {selectedEmail.summary_attachments && selectedEmail.summary_attachments.length > 0 ? (
                  <div className="space-y-3">
                    {selectedEmail.summary_attachments.map((att: any, idx: number) => (
                      <div key={idx} className="flex items-start justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-50/80 transition-all">
                        <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                            <p className="text-xs font-bold text-slate-700 truncate">{att.filename || 'File Attachment'}</p>
                          </div>
                          <p className="text-xs text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200 select-text">
                            {att.desc || 'No detail summary provided.'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDownloadAttachment(selectedEmail.message_id, att.filename)}
                          className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs font-medium">
                    {selectedEmail.attachments && (typeof selectedEmail.attachments === 'string' ? JSON.parse(selectedEmail.attachments || '[]') : selectedEmail.attachments).length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-slate-500">Email memiliki lampiran, namun belum dilakukan analisis detail. Klik "Analyze Intelligence" untuk mengekstraksi deskripsinya.</p>
                        <div className="flex justify-center gap-2 flex-wrap">
                          {(typeof selectedEmail.attachments === 'string' ? JSON.parse(selectedEmail.attachments || '[]') : selectedEmail.attachments).map((rawAtt: any, idx: number) => (
                            <button
                              key={idx}
                              onClick={() => handleDownloadAttachment(selectedEmail.message_id, rawAtt.filename)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="h-3 w-3" />
                              <span>{rawAtt.filename}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      'Tidak ada attachment yang menyertai email ini.'
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Raw Email Content Collapse */}
            <div className="border border-slate-200 rounded-2xl bg-white shadow-xs p-4">
              <details className="group">
                <summary className="flex items-center justify-between font-bold text-xs text-slate-600 uppercase tracking-wider cursor-pointer list-none select-none">
                  <span>Raw Email Text Content</span>
                  <ChevronDown className="h-4 w-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="mt-4 pt-4 border-t border-slate-100 font-mono text-[11px] text-slate-600 bg-slate-50 p-4 rounded-xl leading-relaxed max-h-96 overflow-y-auto select-text whitespace-pre-wrap">
                  {selectedEmail.body_text || 'No content.'}
                </div>
              </details>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
            <Sparkles className="h-12 w-12 text-slate-300 animate-pulse" />
            <h3 className="text-sm font-bold text-slate-700">Intelijen Email AI</h3>
            <p className="text-xs text-slate-400 max-w-sm text-center leading-normal">
              Pilih email yang telah dikelompokkan oleh AI di panel kiri untuk melihat ringkasan pesan, deskripsi attachment secara ephemeral, serta mengunduh berkasnya secara real-time.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
