import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Coins,
  Zap,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Paperclip,
  Clock,
  Building2,
  Calendar,
  Layers,
  Search,
  Check,
  ChevronDown,
  Info
} from 'lucide-react';

interface CitDispatchFullPageProps {
  emailId: string;
  onClose: () => void;
  onOrderCreated?: (result: any) => void;
}

interface DenominationRow {
  id: string;
  item_id: string;
  item_name: string;
  denomination: number;
  quantity: number;
  subtotal: number;
  isAiFilled?: boolean;
}

export const CitDispatchFullPage: React.FC<CitDispatchFullPageProps> = ({
  emailId,
  onClose,
  onOrderCreated
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rawEmail, setRawEmail] = useState<any>(null);
  const [aiData, setAiData] = useState<any>(null);
  const [masterItems, setMasterItems] = useState<any[]>([]);
  const [masterCurrencies, setMasterCurrencies] = useState<string[]>(['IDR', 'USD']);

  // Multi-Order Tracking State
  const [targetTickets, setTargetTickets] = useState<number>(1);
  const [processedTickets, setProcessedTickets] = useState<number>(0);
  const [orderStatus, setOrderStatus] = useState<string>('PENDING');
  const [currentTicketIndex, setCurrentTicketIndex] = useState<number>(1);

  // Form Fields State
  const [planDate, setPlanDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [branchName, setBranchName] = useState<string>('MEDAN');
  const [clientName, setClientName] = useState<string>('MAYBANK');
  const [tripType, setTripType] = useState<string>('Delivery');
  const [cycleType, setCycleType] = useState<string>('Siklus 1 (Pagi)');
  const [citType, setCitType] = useState<string>('CIT');
  const [currency, setCurrency] = useState<string>('IDR');
  const [notes, setNotes] = useState<string>('');
  const [targetAmount, setTargetAmount] = useState<number>(100000000);
  const [rows, setRows] = useState<DenominationRow[]>([]);

  // AI Field Highlights (Visual Sparkle Flags)
  const [aiHighlights, setAiHighlights] = useState<Record<string, boolean>>({
    targetTickets: true,
    branchName: true,
    clientName: true,
    tripType: true,
    cycleType: true,
    targetAmount: true,
    rows: true
  });

  // Success Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search dropdown states
  const [branchSearch, setBranchSearch] = useState('');
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientOpen, setIsClientOpen] = useState(false);

  const BRANCH_OPTIONS = [
    'MEDAN', 'JAKARTA', 'SURABAYA', 'BANDUNG', 'PURWOKERTO', 'SEMARANG',
    'BALI', 'MAKASSAR', 'PALEMBANG', 'BATAM', 'BALIKPAPAN', 'YOGYAKARTA'
  ];

  const CLIENT_OPTIONS = [
    'MAYBANK', 'BCA', 'BANK MANDIRI', 'BRI', 'BNI', 'CIMB NIAGA',
    'BANK DANAMON', 'PERMATA BANK', 'BANK MEGA', 'OCBC NISP'
  ];

  // Fetch initial email details and master data
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);

        // 1. Fetch Email Detail with AI json
        const detailRes = await fetch(`/api/emails/detail/${encodeURIComponent(emailId)}`);
        const detailData = await detailRes.json();

        // 2. Fetch Master Items & Currencies
        const [scRes, currRes] = await Promise.all([
          fetch('/api/cit/scitems').catch(() => null),
          fetch('/api/cit/currencies').catch(() => null)
        ]);

        let scItems = [
          { id: "IDR_100K", code: "IDR_100K", name: "IDR 100.000 (Lembar)", denomination: 100000, currency: "IDR" },
          { id: "IDR_50K", code: "IDR_50K", name: "IDR 50.000 (Lembar)", denomination: 50000, currency: "IDR" },
          { id: "IDR_20K", code: "IDR_20K", name: "IDR 20.000 (Lembar)", denomination: 20000, currency: "IDR" },
          { id: "IDR_10K", code: "IDR_10K", name: "IDR 10.000 (Lembar)", denomination: 10000, currency: "IDR" },
          { id: "IDR_5K", code: "IDR_5K", name: "IDR 5.000 (Lembar)", denomination: 5000, currency: "IDR" },
          { id: "USD_100", code: "USD_100", name: "USD 100 (Bill)", denomination: 100, currency: "USD" }
        ];

        if (scRes && scRes.ok) {
          const scJson = await scRes.json();
          if (scJson.data && scJson.data.length > 0) scItems = scJson.data;
        }

        let currenciesList = ['IDR', 'USD', 'EUR', 'SGD'];
        if (currRes && currRes.ok) {
          const currJson = await currRes.json();
          if (currJson.data && currJson.data.length > 0) currenciesList = currJson.data;
        }

        if (!isMounted) return;

        setMasterItems(scItems);
        setMasterCurrencies(currenciesList);

        if (detailData.success) {
          setRawEmail(detailData.raw_email_data);
          const ai = detailData.ai_extracted_json;
          setAiData(ai);

          // Map AI Extracted JSON to State
          const tTickets = ai.target_tickets || 1;
          const pTickets = ai.processed_tickets || 0;
          setTargetTickets(tTickets);
          setProcessedTickets(pTickets);
          setOrderStatus(ai.order_status || 'PENDING');

          const nextIndex = pTickets < tTickets ? pTickets + 1 : 1;
          setCurrentTicketIndex(nextIndex);

          // Populate form state from AI for current ticket
          populateFormFromAi(ai, nextIndex, scItems);
        }
      } catch (err) {
        console.error('Failed to load CIT dispatch data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [emailId]);

  // Helper to populate form fields for a specific ticket index from AI JSON
  const populateFormFromAi = (ai: any, ticketIdx: number, itemsMaster: any[]) => {
    if (!ai) return;

    // Check if there is an orders_list entry for this ticket index
    const orderObj = ai.orders_list && ai.orders_list[ticketIdx - 1]
      ? ai.orders_list[ticketIdx - 1]
      : null;

    setBranchName(orderObj?.branch || ai.branch_name || 'MEDAN');
    setClientName(orderObj?.client || ai.client_name || 'MAYBANK');
    setTripType(orderObj?.trip_type || ai.trip_type || 'Delivery');
    setCycleType(orderObj?.cycle || ai.cycle_type || 'Siklus 1 (Pagi)');
    setCitType(ai.cit_type || 'CIT');
    setCurrency(ai.currency || 'IDR');
    setNotes(ai.extracted_notes || '');

    const amt = orderObj?.amount || (ai.total_amount ? (ai.total_amount / (ai.target_tickets || 1)) : 100000000);
    setTargetAmount(amt);

    // Build Denomination Rows
    const denomVal = orderObj?.denom || ai.denomination_suggestion || 100000;
    const qty = orderObj?.qty || Math.floor(amt / denomVal);

    const matchingMaster = itemsMaster.find(m => m.denomination === denomVal) || itemsMaster[0];

    const initialRows: DenominationRow[] = [
      {
        id: 'row-1',
        item_id: matchingMaster?.id || 'IDR_100K',
        item_name: matchingMaster?.name || 'IDR 100.000 (Lembar)',
        denomination: matchingMaster?.denomination || 100000,
        quantity: qty > 0 ? qty : 1000,
        subtotal: (matchingMaster?.denomination || 100000) * (qty > 0 ? qty : 1000),
        isAiFilled: true
      }
    ];

    setRows(initialRows);
  };

  // Switch ticket tab
  const handleSelectTicketTab = (ticketIdx: number) => {
    setCurrentTicketIndex(ticketIdx);
    if (aiData) {
      populateFormFromAi(aiData, ticketIdx, masterItems);
    }
  };

  // Denomination Row handlers
  const handleAddRow = () => {
    const defaultMaster = masterItems[0] || { id: 'IDR_100K', name: 'IDR 100.000 (Lembar)', denomination: 100000 };
    const newRow: DenominationRow = {
      id: `row-${Date.now()}-${Math.random()}`,
      item_id: defaultMaster.id,
      item_name: defaultMaster.name,
      denomination: defaultMaster.denomination,
      quantity: 100,
      subtotal: defaultMaster.denomination * 100,
      isAiFilled: false
    };
    setRows([...rows, newRow]);
  };

  const handleUpdateRow = (id: string, field: 'item_id' | 'quantity', value: any) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id !== id) return row;

        if (field === 'item_id') {
          const selectedMaster = masterItems.find(m => m.id === value) || masterItems[0];
          const newDenom = selectedMaster?.denomination || row.denomination;
          return {
            ...row,
            item_id: value,
            item_name: selectedMaster?.name || row.item_name,
            denomination: newDenom,
            subtotal: newDenom * row.quantity,
            isAiFilled: false
          };
        } else if (field === 'quantity') {
          const newQty = Math.max(0, parseInt(value, 10) || 0);
          return {
            ...row,
            quantity: newQty,
            subtotal: row.denomination * newQty,
            isAiFilled: false
          };
        }
        return row;
      })
    );
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  // Calculated total amount across all breakdown rows
  const calculatedTotal = rows.reduce((sum, r) => sum + r.subtotal, 0);

  // Submit Handler (Multi-Order Partial Fulfillment)
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);

      const payload = {
        message_id: emailId,
        ticket_index: currentTicketIndex,
        target_tickets: targetTickets,
        branch_name: branchName,
        client_name: clientName,
        plan_date: planDate,
        trip_type: tripType,
        cycle_type: cycleType,
        cit_type: citType,
        currency,
        total_amount: calculatedTotal,
        items: rows,
        notes
      };

      const res = await fetch('/api/cit/submit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        const newProc = data.processed_tickets;
        const newTarget = data.target_tickets;
        const newStat = data.order_status;

        setProcessedTickets(newProc);
        setTargetTickets(newTarget);
        setOrderStatus(newStat);

        setToastMessage(`✨ Order Tiket #${currentTicketIndex} Berhasil Dibuat! (${data.ticket_id})`);
        setTimeout(() => setToastMessage(null), 4000);

        if (onOrderCreated) {
          onOrderCreated(data);
        }

        // If remaining orders exist, auto advance to next ticket index!
        if (newProc < newTarget) {
          const nextIdx = newProc + 1;
          setCurrentTicketIndex(nextIdx);
          populateFormFromAi(aiData, nextIdx, masterItems);
        }
      } else {
        alert(`Gagal membuat order: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Error submitting order: ${err.message || String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 text-slate-700 font-sans">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <Sparkles className="h-5 w-5 text-blue-600 absolute animate-pulse" />
        </div>
        <h3 className="text-base font-bold text-slate-800 mb-1">Membuka Full-Page CIT Dispatch...</h3>
        <p className="text-xs text-slate-500">Mengekstrak data AI Copilot dan mempersiapkan form order...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col font-sans select-text overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-slide-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
            title="Kembali ke Inbox"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Inbox</span>
          </button>

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm">
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-800 leading-none flex items-center gap-2">
                <span>CIT / ATM Order Dispatcher</span>
                <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200 uppercase tracking-wider">
                  Full-Page Split View
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-md font-medium">
                Email: <span className="text-slate-700 font-semibold">{rawEmail?.subject || emailId}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Status Badge & Order Tracker */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Pemrosesan</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 ${
              orderStatus === 'COMPLETED' || processedTickets >= targetTickets
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : processedTickets > 0
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                orderStatus === 'COMPLETED' || processedTickets >= targetTickets ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'
              }`} />
              {orderStatus === 'COMPLETED' || processedTickets >= targetTickets
                ? 'All Orders Completed'
                : processedTickets > 0
                ? `Pending ${targetTickets - processedTickets} Orders (${processedTickets}/${targetTickets})`
                : `New / Unprocessed (0/${targetTickets})`
              }
            </span>
          </div>
        </div>
      </header>

      {/* SPLIT VIEW CONTAINER */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* LEFT/CENTER PANEL: FORM DISPATCH AREA (65% width) */}
        <div className="w-[65%] bg-white border-r border-slate-200 overflow-y-auto flex flex-col p-6 space-y-6">

          {/* AI Banner */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm shrink-0">
                <Sparkles className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>AI Pre-populated Order Form</span>
                  <span className="text-[9px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-bold font-mono">
                    Nemotron / Inkling AI
                  </span>
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed font-medium">
                  Formulir di bawah terisi otomatis dari hasil ekstraksi AI. Field berkilau ✨ adalah hasil AI. Anda bebas merevisi data sebelum menekan submit.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitOrder} className="space-y-6">

            {/* SECTION 1: TICKET ITERATOR */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span>Ticket Iterator & Multi-Order Tracker</span>
                  {aiHighlights.targetTickets && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-300" title="Terisi Otomatis oleh AI">
                      <Sparkles className="h-2.5 w-2.5 text-amber-600" />
                      <span>AI Multi-Order Detected</span>
                    </span>
                  )}
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Total Tiket Harus Dibuat:</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={targetTickets}
                    onChange={(e) => {
                      const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setTargetTickets(v);
                      setAiHighlights(prev => ({ ...prev, targetTickets: false }));
                    }}
                    className="w-16 px-2.5 py-1 text-center font-extrabold text-blue-700 bg-white border border-blue-300 rounded-lg text-sm shadow-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Ticket Navigation Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {Array.from({ length: targetTickets }, (_, idx) => {
                  const ticketNum = idx + 1;
                  const isCurrent = ticketNum === currentTicketIndex;
                  const isDone = ticketNum <= processedTickets;

                  return (
                    <button
                      key={ticketNum}
                      type="button"
                      onClick={() => handleSelectTicketTab(ticketNum)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border shrink-0 ${
                        isCurrent
                          ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-300'
                          : isDone
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isDone ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-white animate-ping' : 'bg-slate-400'}`} />
                      )}
                      <span>Tiket [ {ticketNum} ] of {targetTickets}</span>
                      {isDone && <span className="text-[9px] bg-emerald-200/80 text-emerald-900 px-1.5 py-0.2 rounded-md font-extrabold">Selesai</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 2: HEADER FORM (Tanggal, Cabang, Client) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
                <Building2 className="h-4 w-4 text-slate-600" />
                <span>Header Form & Entity Destination</span>
              </h4>

              <div className="grid grid-cols-3 gap-4">
                {/* Tanggal Plan */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Tanggal Plan</span>
                  </label>
                  <input
                    type="date"
                    value={planDate}
                    onChange={(e) => setPlanDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
                  />
                </div>

                {/* Target Branch / Cabang */}
                <div className="relative">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>Branch / Cabang</span>
                    </span>
                    {aiHighlights.branchName && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.2 rounded border border-blue-200 flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                    )}
                  </label>

                  <div
                    onClick={() => setIsBranchOpen(!isBranchOpen)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      aiHighlights.branchName
                        ? 'bg-blue-50/50 border-blue-300 text-blue-900 ring-1 ring-blue-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  >
                    <span>{branchName || 'Pilih Branch'}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>

                  {isBranchOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-1">
                      <div className="relative mb-2">
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Cari cabang..."
                          value={branchSearch}
                          onChange={(e) => setBranchSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {BRANCH_OPTIONS.filter(b => b.toLowerCase().includes(branchSearch.toLowerCase())).map(b => (
                          <div
                            key={b}
                            onClick={() => {
                              setBranchName(b);
                              setIsBranchOpen(false);
                              setAiHighlights(prev => ({ ...prev, branchName: false }));
                            }}
                            className={`px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                              branchName === b ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            {b}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Client / Bank */}
                <div className="relative">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>Client / Bank</span>
                    </span>
                    {aiHighlights.clientName && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.2 rounded border border-blue-200 flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                    )}
                  </label>

                  <div
                    onClick={() => setIsClientOpen(!isClientOpen)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      aiHighlights.clientName
                        ? 'bg-blue-50/50 border-blue-300 text-blue-900 ring-1 ring-blue-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  >
                    <span>{clientName || 'Pilih Client'}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>

                  {isClientOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-1">
                      <div className="relative mb-2">
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Cari client/bank..."
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {CLIENT_OPTIONS.filter(c => c.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                          <div
                            key={c}
                            onClick={() => {
                              setClientName(c);
                              setIsClientOpen(false);
                              setAiHighlights(prev => ({ ...prev, clientName: false }));
                            }}
                            className={`px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                              clientName === c ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            {c}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 3: CATEGORY & CUSTOM FIELDS */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
                <Zap className="h-4 w-4 text-slate-600" />
                <span>Operational Category & Custom Fields</span>
              </h4>

              <div className="grid grid-cols-3 gap-4">
                {/* Tipe Trip */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                    <span>Tipe Trip</span>
                    {aiHighlights.tripType && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.2 rounded border border-blue-200 flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                    )}
                  </label>
                  <select
                    value={tripType}
                    onChange={(e) => {
                      setTripType(e.target.value);
                      setAiHighlights(prev => ({ ...prev, tripType: false }));
                    }}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="Delivery">Delivery (Setor Tunai)</option>
                    <option value="Pickup">Pickup (Tarik Tunai)</option>
                    <option value="Replenishment">Replenishment (Pengisian ATM)</option>
                    <option value="Emergency">Emergency (Darurat)</option>
                  </select>
                </div>

                {/* Siklus Shift */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                    <span>Siklus / Shift</span>
                    {aiHighlights.cycleType && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.2 rounded border border-blue-200 flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                    )}
                  </label>
                  <select
                    value={cycleType}
                    onChange={(e) => {
                      setCycleType(e.target.value);
                      setAiHighlights(prev => ({ ...prev, cycleType: false }));
                    }}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="Siklus 1 (Pagi)">Siklus 1 (Pagi 08:00)</option>
                    <option value="Siklus 2 (Siang)">Siklus 2 (Siang 13:00)</option>
                    <option value="Siklus 3 (Malam)">Siklus 3 (Malam 19:00)</option>
                    <option value="Ad-Hoc">Ad-Hoc (Insidental)</option>
                  </select>
                </div>

                {/* Tipe Service (CIT vs ATM) & Mata Uang */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Tipe Order</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setCitType('CIT')}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                          citType === 'CIT' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        CIT
                      </button>
                      <button
                        type="button"
                        onClick={() => setCitType('ATM')}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                          citType === 'ATM' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ATM
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Mata Uang</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden"
                    >
                      {masterCurrencies.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4: DENOMINATION BREAKDOWN (PECAHAN UANG) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Denomination Breakdown (Rincian Pecahan Uang)
                  </h4>
                  {aiHighlights.rows && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5 text-blue-600" />
                      <span>AI Pre-filled Breakdown</span>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-colors border border-blue-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Pecahan</span>
                </button>
              </div>

              {/* Rows Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="bg-slate-50 px-4 py-2.5 grid grid-cols-12 gap-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <div className="col-span-5">Jenis Pecahan Uang (Master Item)</div>
                  <div className="col-span-3 text-right">Jumlah (Lembar)</div>
                  <div className="col-span-3 text-right">Subtotal ({currency})</div>
                  <div className="col-span-1 text-center">Aksi</div>
                </div>

                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={`px-4 py-3 grid grid-cols-12 gap-3 items-center transition-colors ${
                      row.isAiFilled ? 'bg-blue-50/30' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Item Select */}
                    <div className="col-span-5 flex items-center gap-2">
                      {row.isAiFilled && (
                        <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" title="Terisi Otomatis oleh AI" />
                      )}
                      <select
                        value={row.item_id}
                        onChange={(e) => handleUpdateRow(row.id, 'item_id', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      >
                        {masterItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div className="col-span-3">
                      <input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) => handleUpdateRow(row.id, 'quantity', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono font-bold text-right bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>

                    {/* Subtotal */}
                    <div className="col-span-3 text-right font-mono font-bold text-slate-800 text-xs">
                      {row.subtotal.toLocaleString()} {currency}
                    </div>

                    {/* Remove button */}
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={rows.length <= 1}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 disabled:opacity-30 cursor-pointer transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Calculation Footer */}
              <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between shadow-md">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Nominal Order (Tiket #{currentTicketIndex})</span>
                  <p className="text-xl font-extrabold font-mono text-emerald-400">
                    {currency} {calculatedTotal.toLocaleString()}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-bold">
                    Target AI Email: {currency} {targetAmount.toLocaleString()}
                  </span>
                  {calculatedTotal === targetAmount ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-md border border-emerald-500/30 inline-flex items-center gap-1 mt-1">
                      <Check className="h-3 w-3" /> Nominal Sesuai Ekstraksi AI
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-md border border-amber-500/30 inline-flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3" /> Ada Penyesuaian Manual
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Catatan Khusus Operasional */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                Catatan Khusus Operasional
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tambahkan catatan khusus pengawalan atau instruksi vault..."
                className="w-full p-3 text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* SUBMIT BUTTON BAR */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-all"
              >
                Simpan & Keluar
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 cursor-pointer transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Memproses Submission Tiket #{currentTicketIndex}...</span>
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4" />
                    <span>Create CIT Order (Tiket #{currentTicketIndex} dari {targetTickets})</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </div>

        {/* RIGHT PANEL: FIXED STICKY EMAIL PREVIEW (35% width) */}
        <div className="w-[35%] bg-slate-50 border-l border-slate-200 flex flex-col h-full overflow-hidden">
          <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <span>Reference Email Preview</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">35% Fixed Panel</span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 select-text">
            {/* Email Header Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span className="truncate max-w-[200px]">{rawEmail?.fromName || rawEmail?.sender}</span>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                  {rawEmail?.date ? new Date(rawEmail.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>

              <p className="text-xs font-bold text-slate-900 leading-snug">
                {rawEmail?.subject}
              </p>

              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{rawEmail?.date ? new Date(rawEmail.date).toLocaleString() : ''}</span>
              </div>
            </div>

            {/* AI Copilot Summary Card */}
            {aiData?.summary && (
              <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-4 text-xs">
                <h4 className="text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-blue-600" />
                  <span>AI Operational Summary</span>
                </h4>
                <p className="text-slate-700 leading-relaxed font-medium">
                  {aiData.summary}
                </p>
              </div>
            )}

            {/* Email Body Content */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pesan Email Lengkap</h4>
              {rawEmail?.html_body ? (
                <div
                  className="prose prose-xs max-w-none text-xs text-slate-700 overflow-x-auto leading-relaxed border-t border-slate-100 pt-2"
                  dangerouslySetInnerHTML={{ __html: rawEmail.html_body }}
                />
              ) : (
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {rawEmail?.body_text || 'Tidak ada teks isi pesan.'}
                </p>
              )}
            </div>

            {/* Email Attachments List */}
            {rawEmail?.attachments && rawEmail.attachments.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  <span>Lampiran File ({rawEmail.attachments.length})</span>
                </h4>

                <div className="space-y-1.5">
                  {rawEmail.attachments.map((att: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="font-bold text-slate-800 truncate text-[11px]">{att.filename || `Attachment ${idx+1}`}</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 shrink-0">
                        {att.size ? `${Math.round(att.size / 1024)} KB` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
