import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Coins, RefreshCw, Zap, CheckCircle2, AlertCircle, ArrowLeft, Plus, 
  Trash2, FileText, Paperclip, Clock, Building2, Calendar, Layers, 
  Search, Check, ChevronDown, Info, ArrowRight, Save
} from 'lucide-react';
import HtmlEmailViewer from './HtmlEmailViewer';

interface CitDispatchFullPageProps {
  emailId: string;
  onClose: () => void;
  onOrderCreated?: (result: any) => void;
}

export const CitDispatchFullPage: React.FC<CitDispatchFullPageProps> = ({
  emailId,
  onClose,
  onOrderCreated
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rawEmail, setRawEmail] = useState<any>(null);
  
  // Tracker State
  const [targetTickets, setTargetTickets] = useState(1);
  const [processedTickets, setProcessedTickets] = useState(0);

  // Form State
  const [citCategory, setCitCategory] = useState('DA Delivery');
  
  // Left Column fields
  const [ticketId, setTicketId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [planDate, setPlanDate] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [branch, setBranch] = useState('Jakarta (JKT)');
  const [bank] = useState('BCA');
  const [client, setClient] = useState('Retail');
  const [requestTime, setRequestTime] = useState('09:00');
  const [notes, setNotes] = useState('');

  // Middle Column fields (DA Delivery)
  const [tripType, setTripType] = useState('D');
  const [siklus, setSiklus] = useState('Pagi');
  const [isOnCall, setIsOnCall] = useState(false);
  const [trxType, setTrxType] = useState('STC');
  const [tokenDa, setTokenDa] = useState('');
  const [currency, setCurrency] = useState('IDR');
  
  const [denoms, setDenoms] = useState<{id: string, denom: number, qty: number}[]>([
    { id: '1', denom: 100000, qty: 100 }
  ]);

  useEffect(() => {
    fetchEmailDetails();
  }, [emailId]);

  const fetchEmailDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/emails/${emailId}`);
      const data = await res.json();
      if (data.success && data.email) {
        setRawEmail(data.email);
        
        // Setup Tracker
        setTargetTickets(data.email.target_tickets || 1);
        setProcessedTickets(data.email.processed_tickets || 0);
        
        // Generate random IDs for form
        const rand = Math.floor(Math.random() * 10000);
        setTicketId(`TCK-${rand}`);
        setOrderId(`ORD-${rand}`);
        setPlanDate(new Date().toISOString().split('T')[0]);
        setTripDate(new Date().toISOString().split('T')[0]);
        
        // Pre-populate AI data if available
        if (data.email.extracted_notes) {
          setNotes(data.email.extracted_notes || "");
          if (data.email.cit_type) {
            const validCategories = ["DA Delivery", "DA Collection", "DA Netting", "Titipan", "Receive", "Release", "Warkat"];
            // Simple match or fallback to DA Delivery
            const matched = validCategories.find(c => c.toLowerCase() === (data.email.cit_type || '').toLowerCase());
            setCitCategory(matched || 'DA Delivery');
          }

        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDenom = () => {
    setDenoms([...denoms, { id: Math.random().toString(), denom: 50000, qty: 1 }]);
  };

  const updateDenom = (id: string, field: 'denom' | 'qty', val: number) => {
    setDenoms(denoms.map(d => d.id === id ? { ...d, [field]: val } : d));
  };

  const removeDenom = (id: string) => {
    setDenoms(denoms.filter(d => d.id !== id));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // API call placeholder for saving order
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const newProcessed = processedTickets + 1;
      const isComplete = newProcessed >= targetTickets;
      
      // Update email progress in database
      await fetch('/api/emails/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: emailId,
          processed_tickets: newProcessed,
          target_tickets: targetTickets,
          order_status: isComplete ? 'COMPLETED' : 'PARTIAL'
        })
      });

      setProcessedTickets(newProcessed);
      
      if (onOrderCreated) {
        onOrderCreated({ status: isComplete ? 'COMPLETED' : 'PARTIAL', ticketId });
      }

      if (isComplete) {
        onClose();
      } else {
        // Reset form for next ticket
        const rand = Math.floor(Math.random() * 10000);
        setTicketId(`TCK-${rand}`);
        setOrderId(`ORD-${rand}`);
        setDenoms([{ id: Math.random().toString(), denom: 100000, qty: 100 }]);
        // Keep other data intact for easy cloning
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl shadow-xl flex items-center gap-3">
        <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
        <span className="font-medium text-slate-700">Loading Order Data...</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-slate-100 flex flex-col h-screen overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header & Multi-Order Tracker Banner */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-800">CIT / ATM Order Dispatcher</h1>
            <p className="text-xs text-slate-500">Buat tiket order CIT berdasarkan instruksi email</p>
          </div>
        </div>
        
        {/* Tracker */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-slate-700">Target Tiket:</span>
            <input 
              type="number" 
              value={targetTickets} 
              onChange={e => setTargetTickets(parseInt(e.target.value) || 1)}
              className="w-16 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="h-6 w-px bg-slate-300"></div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">Progress:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-blue-700">{processedTickets + 1}</span>
              <span className="text-xs text-slate-500">of {targetTickets}</span>
            </div>
          </div>
          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden ml-2">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-500" 
              style={{ width: `${((processedTickets) / targetTickets) * 100}%` }}
            ></div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{processedTickets + 1 >= targetTickets ? 'Submit Final' : 'Save & Next Ticket'}</span>
            {processedTickets + 1 < targetTickets && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Kolom 1: Header Form & Common Fields (~25-30%) */}
        <div className="w-[28%] bg-slate-50/50 border-r border-slate-200 p-4 overflow-y-auto space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              📝 Header Form
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ticket ID</label>
                  <input type="text" readOnly value={ticketId} className="w-full px-3 py-1.5 bg-slate-100 border border-slate-200 rounded text-xs font-mono text-slate-700" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Order ID</label>
                  <input type="text" readOnly value={orderId} className="w-full px-3 py-1.5 bg-slate-100 border border-slate-200 rounded text-xs font-mono text-slate-700" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal Plan</label>
                  <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal Trip</label>
                  <input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Branch</label>
                <input type="text" value={branch} onChange={e => setBranch(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Cari branch..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Bank</label>
                  <input type="text" disabled value={bank} className="w-full px-3 py-1.5 bg-slate-100 border border-slate-200 rounded text-xs text-slate-500 font-semibold" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Client Type</label>
                  <select value={client} onChange={e => setClient(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none">
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Satuan</label>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">LBR</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              🏷️ Common Fields
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Waktu Request</label>
                <input type="time" value={requestTime} onChange={e => setRequestTime(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Keterangan / Notes</label>
                <textarea 
                  rows={4}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Catatan dari AI akan muncul di sini..."
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        {/* Kolom 2: CIT Category & Dynamic Fields (~40%) */}
        <div className="w-[42%] bg-white border-r border-slate-200 p-4 overflow-y-auto">
          <div className="mb-5">
            <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              CIT Category
            </label>
            <select 
              value={citCategory}
              onChange={e => setCitCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="DA Delivery">DA Delivery</option>
              <option value="DA Collection">DA Collection</option>
              <option value="DA Netting">DA Netting</option>
              <option value="Titipan" disabled>Titipan (Disabled)</option>
              <option value="Receive" disabled>Receive (Disabled)</option>
              <option value="Release" disabled>Release (Disabled)</option>
              <option value="Warkat" disabled>Warkat (Disabled)</option>
            </select>
          </div>

          <div className="transition-all duration-300 ease-in-out">
            {citCategory === 'DA Delivery' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm animate-in slide-in-from-bottom-2 fade-in">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-blue-600" />
                  📦 DA Delivery Custom Fields
                </h3>
                
                <div className="space-y-4">
                  {/* Tipe Trip */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Tipe Trip</label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="triptype" checked={tripType === 'D'} onChange={() => setTripType('D')} className="text-blue-600" />
                        <span className="text-xs font-medium text-slate-700">Delivery (D)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="triptype" checked={tripType === 'DCC'} onChange={() => setTripType('DCC')} className="text-blue-600" />
                        <span className="text-xs font-medium text-slate-700">Delivery Cash to Cash (DCC)</span>
                      </label>
                    </div>
                  </div>

                  {/* Siklus */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Siklus</label>
                    <div className="flex flex-wrap gap-2">
                      {['Pagi', 'Siang', 'Middle', 'Adhoc'].map(s => (
                        <button 
                          key={s}
                          onClick={() => setSiklus(s)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            siklus === s ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {s === 'Pagi' ? '🌅' : s === 'Siang' ? '☀️' : s === 'Middle' ? '🌙' : '⚡'} {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* On Call */}
                    <div className="flex items-center gap-2 pt-5">
                      <input type="checkbox" id="oncall" checked={isOnCall} onChange={e => setIsOnCall(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <label htmlFor="oncall" className="text-xs font-semibold text-slate-700 cursor-pointer">On Call Delivery</label>
                    </div>
                    {/* Token DA */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Token DA</label>
                      <input type="text" value={tokenDa} onChange={e => setTokenDa(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Input token..." />
                    </div>
                  </div>

                  {/* Jenis Transaksi & Currency */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Jenis Transaksi</label>
                      <div className="flex gap-1.5">
                        {['STC', 'COS', 'BBC'].map(t => (
                          <button 
                            key={t}
                            onClick={() => setTrxType(t)}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors ${
                              trxType === t ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Mata Uang *</label>
                      <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none">
                        <option value="IDR">IDR - Rupiah</option>
                        <option value="USD">USD - US Dollar</option>
                      </select>
                    </div>
                  </div>

                  {/* Denom Table */}
                  <div className="pt-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-2">Denomination Breakdown *</label>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Denom</th>
                            <th className="px-3 py-2 font-semibold w-24">Qty (LBR)</th>
                            <th className="px-3 py-2 font-semibold">Value</th>
                            <th className="px-3 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {denoms.map(d => (
                            <tr key={d.id}>
                              <td className="px-2 py-1.5">
                                <input 
                                  type="number" 
                                  value={d.denom} 
                                  onChange={e => updateDenom(d.id, 'denom', parseInt(e.target.value) || 0)}
                                  className="w-full px-2 py-1 border border-slate-200 rounded outline-none focus:border-blue-500 text-xs" 
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input 
                                  type="number" 
                                  value={d.qty} 
                                  onChange={e => updateDenom(d.id, 'qty', parseInt(e.target.value) || 0)}
                                  className="w-full px-2 py-1 border border-slate-200 rounded outline-none focus:border-blue-500 text-xs" 
                                />
                              </td>
                              <td className="px-3 py-1.5 font-mono text-slate-700">
                                {(d.denom * d.qty).toLocaleString('id-ID')}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button onClick={() => removeDenom(d.id)} className="text-red-400 hover:text-red-600 p-1">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200">
                          <tr>
                            <td colSpan={2} className="px-3 py-2 font-bold text-slate-700 text-right">TOTAL:</td>
                            <td colSpan={2} className="px-3 py-2 font-mono font-bold text-blue-700 text-sm">
                              IDR {denoms.reduce((acc, curr) => acc + (curr.denom * curr.qty), 0).toLocaleString('id-ID')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <button 
                      onClick={handleAddDenom}
                      className="mt-2 w-full py-1.5 border border-dashed border-blue-300 rounded text-xs font-semibold text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Denom
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Fallback info */}
            {citCategory !== 'DA Delivery' && (
              <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                Form khusus untuk <b>{citCategory}</b> belum tersedia.
              </div>
            )}
          </div>
        </div>

        {/* Kolom 3: Email Preview (~30-35%) */}
        <div className="w-[30%] bg-slate-50 flex flex-col overflow-hidden">
          {rawEmail ? (
            <div className="flex-1 flex flex-col h-full">
              <div className="p-4 bg-white border-b border-slate-200 shrink-0">
                <h2 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                  ✉️ Email Preview
                </h2>
                <div className="mt-3">
                  <div className="text-sm font-bold text-slate-900 line-clamp-2 leading-tight">
                    {rawEmail.subject}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex justify-between items-start">
                    <span className="truncate pr-2">{rawEmail.sender}</span>
                    <span className="shrink-0">{new Date(rawEmail.date || rawEmail.received_at).toLocaleDateString('id-ID')}</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
                <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden p-3 text-sm break-words whitespace-pre-wrap max-h-[80vh] overflow-y-auto">
                  {rawEmail.html_body ? (
                    <HtmlEmailViewer htmlContent={rawEmail.html_body} />
                  ) : (
                    <div className="whitespace-pre-wrap font-mono text-xs text-slate-700">
                      {rawEmail.body_text}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 p-6 text-center text-sm">
              <div className="flex flex-col items-center">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <p>Data email tidak ditemukan.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
