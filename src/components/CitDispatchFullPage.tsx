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
import type { EntityMasterDetail } from '../services/citApi';

interface CitDispatchFullPageProps {
  emailId: string;
  prefillEmail?: any;
  onClose: () => void;
  onOrderCreated?: (result: any) => void;
}

interface CurrencyMaster {
  MoneyCode: string;
  MoneyName: string | null;
}

interface ScItemMaster {
  Code: string;
  Name: string | null;
  Value: number | null;
  Category: string | null;
  MoneyCode: string | null;
  MoneyType: string | null;
  PublishYear: string | null;
}

interface DenominationRow {
  id: string;
  item_id: string;
  item_name: string;
  denomination: number;
  quantity: number;
  subtotal: number;
  remarks: string;
  fancySerialNumber: string;
  isAiFilled?: boolean;
}

interface CitPartyFields {
  name: string;
  address: string;
  city: string;
  contactName: string;
  contactNumber: string;
}

interface CitPartyPanelProps {
  title: 'Pengirim' | 'Penerima';
  value: CitPartyFields;
  onChange: (value: CitPartyFields) => void;
}

const CitPartyPanel: React.FC<CitPartyPanelProps> = ({ title, value, onChange }) => {
  const update = (field: keyof CitPartyFields, nextValue: string) => {
    onChange({ ...value, [field]: nextValue });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
      <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">{title}</h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={value.name} onChange={(e) => update('name', e.target.value)} placeholder="Nama" className="md:col-span-2 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden" />
        <input value={value.address} onChange={(e) => update('address', e.target.value)} placeholder="Alamat" className="md:col-span-2 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden" />
        <input value={value.city} onChange={(e) => update('city', e.target.value)} placeholder="Kota" className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden" />
        <div className="grid grid-cols-2 gap-2">
          <input value={value.contactName} onChange={(e) => update('contactName', e.target.value)} placeholder="Kontak" className="min-w-0 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden" />
          <input value={value.contactNumber} onChange={(e) => update('contactNumber', e.target.value)} placeholder="No. Telp" className="min-w-0 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden" />
        </div>
      </div>
    </div>
  );
};

interface TicketDraft {
  planDate: string;
  tripDate: string;
  warehouseCode: string;
  warehouseName: string;
  bankCode: string;
  bankName: string;
  clientCode: string;
  clientName: string;
  vaultBranchCode: number | null;
  vaultBranchName: string;
  serialNumber: string;
  requestTime: string;
  notes: string;
  tripType: string;
  deliveryType: 'D' | 'DCC' | 'C' | 'CCC' | 'T';
  cycleType: 'P' | 'S' | 'A';
  onCall: boolean;
  transactionType: '' | 'STC' | 'COS' | 'BBC';
  machineCdr: 'Y' | 'N';
  validationLocationEnabled: boolean;
  validationLocation: string;
  senderParty: CitPartyFields;
  receiverParty: CitPartyFields;
  daToken: string;
  citType: string;
  currency: string;
  targetAmount: number;
  rows: DenominationRow[];
  pairedCollectionTargetAmount: number;
  pairedCollectionRows: DenominationRow[];
}

export const CitDispatchFullPage: React.FC<CitDispatchFullPageProps> = ({
  emailId,
  prefillEmail,
  onClose,
  onOrderCreated
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rawEmail, setRawEmail] = useState<any>(null);
  const [aiData, setAiData] = useState<any>(null);
  const [masterItems, setMasterItems] = useState<ScItemMaster[]>([]);
  const [masterCurrencies, setMasterCurrencies] = useState<CurrencyMaster[]>([]);
  const [masterEntities, setMasterEntities] = useState<EntityMasterDetail[]>([]);
  const [entityMasterLoading, setEntityMasterLoading] = useState(true);

  // Multi-Order Tracking State
  const [targetTickets, setTargetTickets] = useState<number>(1);
  const [processedTickets, setProcessedTickets] = useState<number>(0);
  const [orderStatus, setOrderStatus] = useState<string>('PENDING');
  const [currentTicketIndex, setCurrentTicketIndex] = useState<number>(1);

  // Form Fields State
  const [planDate, setPlanDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tripDate, setTripDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [warehouseCode, setWarehouseCode] = useState<string>('');
  const [warehouseName, setWarehouseName] = useState<string>('');
  const [bankCode, setBankCode] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [clientCode, setClientCode] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [vaultBranchCode, setVaultBranchCode] = useState<number | null>(null);
  const [vaultBranchName, setVaultBranchName] = useState<string>('');
  const [serialNumber, setSerialNumber] = useState<string>('');
  const [requestTime, setRequestTime] = useState<string>('');
  const [tripType, setTripType] = useState<string>('Delivery');
  const [deliveryType, setDeliveryType] = useState<'D' | 'DCC' | 'C' | 'CCC' | 'T'>('D');
  const [cycleType, setCycleType] = useState<'P' | 'S' | 'A'>('P');
  const [onCall, setOnCall] = useState<boolean>(false);
  const [transactionType, setTransactionType] = useState<'' | 'STC' | 'COS' | 'BBC'>('');
  const [machineCdr, setMachineCdr] = useState<'Y' | 'N'>('N');
  const [validationLocationEnabled, setValidationLocationEnabled] = useState<boolean>(false);
  const [validationLocation, setValidationLocation] = useState<string>('');
  const [senderParty, setSenderParty] = useState<CitPartyFields>({
    name: '', address: '', city: '', contactName: '', contactNumber: ''
  });
  const [receiverParty, setReceiverParty] = useState<CitPartyFields>({
    name: '', address: '', city: '', contactName: '', contactNumber: ''
  });
  const [daToken, setDaToken] = useState<string>('');
  const [citType, setCitType] = useState<string>('CIT');
  const [currency, setCurrency] = useState<string>('IDR');
  const [notes, setNotes] = useState<string>('');
  const [targetAmount, setTargetAmount] = useState<number>(0);
  const [rows, setRows] = useState<DenominationRow[]>([]);
  const [pairedCollectionTargetAmount, setPairedCollectionTargetAmount] = useState<number>(0);
  const [pairedCollectionRows, setPairedCollectionRows] = useState<DenominationRow[]>([]);
  const [ticketDrafts, setTicketDrafts] = useState<Record<number, TicketDraft>>({});

  // AI Field Highlights (Visual Sparkle Flags)
  const [aiHighlights, setAiHighlights] = useState<Record<string, boolean>>({
    targetTickets: true,
    warehouseName: true,
    vaultBranchName: true,
    clientName: true,
    tripType: true,
    cycleType: true,
    targetAmount: true,
    rows: true
  });

  // Success Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search dropdown states
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientOpen, setIsClientOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [isBankOpen, setIsBankOpen] = useState(false);

  const warehouseOptions = Array.from(
    new Map<string, { code: string; name: string }>(
      masterEntities
        .filter(entity => String(entity.Type || '').trim().toUpperCase() === 'WH' && Boolean(entity.EntityCode))
        .map(entity => [entity.EntityCode, { code: entity.EntityCode, name: entity.EntityName || entity.EntityCode }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const vaultOptions = Array.from(
    new Map<number, { code: number; name: string }>(
      masterEntities
        .filter(entity => entity.Type === 'ENT' && entity.BranchCode !== null && Boolean(entity.BranchName))
        .map(entity => [Number(entity.BranchCode), { code: Number(entity.BranchCode), name: String(entity.BranchName) }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const branchClients = masterEntities.filter(entity => entity.Type === 'ENT');
  const groupNames = new Map(
    masterEntities
      .filter(entity => entity.Type === 'GRP' && Boolean(entity.EntityCode))
      .map(entity => [entity.EntityCode, entity.EntityName || entity.EntityCode])
  );
  const bankOptions = Array.from(
    new Map<string, { code: string; name: string }>(
      branchClients
        .map(entity => entity.ManagingGroupCode || entity.GroupCode || '')
        .filter(Boolean)
        .map(code => [code, { code, name: groupNames.get(code) || code }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const clientOptions = branchClients
    .filter(entity => !bankCode || (entity.ManagingGroupCode || entity.GroupCode || '') === bankCode)
    .sort((a, b) => (a.EntityName || a.EntityCode).localeCompare(b.EntityName || b.EntityCode));
  const selectedClient = masterEntities.find(
    entity => entity.Type === 'ENT' && entity.EntityCode === clientCode
  );

  // Fetch initial email details and master data
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);

        const masterDataPromise = Promise.all([
          fetch('/api/cit/scitems').catch(() => null),
          fetch('/api/cit/currencies').catch(() => null)
        ]);
        const entityMasterPromise = fetch('/api/cit/entity-master-details?page=1&size=20000').catch(() => null);

        const makeDetailData = (email: any) => ({
          success: true,
          raw_email_data: {
            ...email,
            sender_email: email.sender || email.sender_email || email.fromAddress || email.from || '',
            from: email.sender || email.sender_email || email.fromAddress || email.from || '',
            subject: email.subject || '',
            received_at: email.date || email.received_at || '',
            date: email.date || email.received_at || '',
            body_html: email.html_body || email.body_html || '',
            body_text: email.body_text || email.body || ''
          },
          ai_extracted_json: {
            target_tickets: email.target_tickets || 1,
            processed_tickets: email.processed_tickets || 0,
            order_status: email.order_status || 'PENDING',
            total_amount: email.total_amount || 0,
            currency: email.currency || 'IDR',
            client_name: email.suggested_bank || '',
            branch_name: email.suggested_folder_child || '',
            trip_type: email.trip_type || 'Delivery',
            cycle_type: email.cycle_type || 'Siklus 1 (Pagi)',
            cit_type: email.cit_type || 'CIT',
            extracted_notes: email.extracted_notes || ''
          }
        });

        // 1. Fetch Email Detail with AI json
        let detailRes = await fetch(`/api/emails/${encodeURIComponent(emailId)}`);
        let detailData = await detailRes.json().catch(() => null);
        const directRawEmail = detailData?.success ? detailData.raw_email_data : null;

        if (!detailData || !detailData.success || !detailData.raw_email_data || !detailData.ai_extracted_json) {
          detailRes = await fetch(`/api/emails/detail/${encodeURIComponent(emailId)}`);
          detailData = await detailRes.json().catch(() => null);
        }

        if ((!detailData || !detailData.success || !detailData.raw_email_data) && directRawEmail) {
          detailData = makeDetailData(directRawEmail);
        }

        if ((!detailData || !detailData.success || !detailData.raw_email_data) && prefillEmail) {
          detailData = makeDetailData(prefillEmail);
        }

        if (!detailData || !detailData.success || !detailData.raw_email_data || !detailData.ai_extracted_json) {
          // Fallback: search in GET /api/emails list if direct detail lookup failed
          const emailsRes = await fetch('/api/emails');
          if (emailsRes.ok) {
            const emailsPayload = await emailsRes.json();
            const emailsList = Array.isArray(emailsPayload)
              ? emailsPayload
              : Array.isArray(emailsPayload.emails)
                ? emailsPayload.emails
                : Array.isArray(emailsPayload.data)
                  ? emailsPayload.data
                  : [];
            const found = emailsList.find((e: any) =>
              String(e.message_id) === String(emailId) ||
              String(e.id) === String(emailId)
            );
            if (found) {
              detailData = makeDetailData(found);
            }
          }
        }

        if (!detailData?.success || !detailData.raw_email_data || !detailData.ai_extracted_json) {
          throw new Error(detailData?.message || 'Data email tidak ditemukan');
        }

        // 2. Fetch Master Items & Currencies
        const [scRes, currRes] = await masterDataPromise;

        let scItems: ScItemMaster[] = [];

        if (scRes && scRes.ok) {
          const scJson = await scRes.json();
          if (scJson.success && Array.isArray(scJson.data)) {
            scItems = scJson.data.filter((item: ScItemMaster) => typeof item?.Code === 'string' && item.Code.length > 0);
          }
        }

        let currenciesList: CurrencyMaster[] = [];
        if (currRes && currRes.ok) {
          const currJson = await currRes.json();
          if (currJson.success && Array.isArray(currJson.data)) {
            currenciesList = currJson.data.filter((item: CurrencyMaster) => typeof item?.MoneyCode === 'string' && item.MoneyCode.length > 0);
          }
        }

        if (!isMounted) return;

        setMasterItems(scItems);
        setMasterCurrencies(currenciesList);

        entityMasterPromise
          .then(async entityRes => {
            if (!entityRes || !entityRes.ok) return;
            const entityJson = await entityRes.json();
            if (entityJson.success && Array.isArray(entityJson.data?.data) && isMounted) {
              setMasterEntities(
                entityJson.data.data.filter(
                  (item: EntityMasterDetail) => typeof item?.EntityCode === 'string' && item.EntityCode.length > 0
                )
              );
            }
          })
          .catch(err => console.error('Failed to load CIT entity master:', err))
          .finally(() => {
            if (isMounted) setEntityMasterLoading(false);
          });

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

          const initialDrafts: Record<number, TicketDraft> = {};
          for (let ticketIndex = 1; ticketIndex <= tTickets; ticketIndex += 1) {
            initialDrafts[ticketIndex] = buildTicketDraftFromAi(ai, ticketIndex, scItems);
          }
          setTicketDrafts(initialDrafts);
          applyTicketDraft(initialDrafts[nextIndex]);
        }
      } catch (err: any) {
        console.error('Failed to load CIT dispatch data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [emailId, prefillEmail]);

  const normalizeCycleType = (value: unknown): TicketDraft['cycleType'] => {
    const normalized = String(value || '').toUpperCase();
    if (normalized === 'S' || normalized.includes('SIANG')) return 'S';
    if (normalized === 'A' || normalized.includes('ADHOC') || normalized.includes('AD-HOC')) return 'A';
    return 'P';
  };

  const emptyParty = (): CitPartyFields => ({
    name: '', address: '', city: '', contactName: '', contactNumber: ''
  });

  const buildTicketDraftFromAi = (ai: any, ticketIdx: number, itemsMaster: ScItemMaster[]): TicketDraft => {
    const orderObj = ai.orders_list && ai.orders_list[ticketIdx - 1]
      ? ai.orders_list[ticketIdx - 1]
      : null;
    const selectedCurrency = orderObj?.currency || ai.currency || 'IDR';
    const selectedCategory = orderObj?.trip_type || ai.trip_type || 'Delivery';
    const requestedTripCode = orderObj?.delivery_type || ai.delivery_type;
    const selectedTripCode: TicketDraft['deliveryType'] = selectedCategory === 'Collection'
      ? (requestedTripCode === 'CCC' ? 'CCC' : 'C')
      : selectedCategory === 'Netting'
        ? 'T'
        : (requestedTripCode === 'DCC' ? 'DCC' : 'D');
    const amt = orderObj?.amount || (ai.total_amount ? (ai.total_amount / (ai.target_tickets || 1)) : 0);
    let draftRows: DenominationRow[] = [];

    if (orderObj?.denom || ai.denomination_suggestion || amt > 0) {
      const denomVal = orderObj?.denom || ai.denomination_suggestion || 100000;
      const qty = orderObj?.qty || (amt > 0 ? Math.floor(amt / denomVal) : 0);
      const currencyItems = itemsMaster.filter(item => item.MoneyCode === selectedCurrency);
      const matchingMaster = currencyItems.find(item => Number(item.Value) === Number(denomVal)) || currencyItems[0];

      if (matchingMaster) {
        const denomination = Number(matchingMaster.Value) || 0;
        draftRows = [{
          id: `row-${ticketIdx}-1`,
          item_id: matchingMaster.Code,
          item_name: matchingMaster.Name || matchingMaster.Code,
          denomination,
          quantity: qty > 0 ? qty : 0,
          subtotal: denomination * (qty > 0 ? qty : 0),
          remarks: '',
          fancySerialNumber: '',
          isAiFilled: true
        }];
      }
    }

    return {
      planDate: ai.plan_date || new Date().toISOString().split('T')[0],
      tripDate: orderObj?.trip_date || ai.trip_date || ai.plan_date || new Date().toISOString().split('T')[0],
      warehouseCode: orderObj?.warehouse_code || ai.warehouse_code || '',
      warehouseName: orderObj?.warehouse_name || ai.warehouse_name || orderObj?.branch || ai.branch_name || '',
      bankCode: '',
      bankName: orderObj?.bank || ai.bank_name || '',
      clientCode: '',
      clientName: orderObj?.client || ai.client_name || '',
      vaultBranchCode: null,
      vaultBranchName: orderObj?.vault_branch_name || ai.vault_branch_name || '',
      serialNumber: orderObj?.serial_number || ai.serial_number || '',
      requestTime: orderObj?.request_time || ai.request_time || '',
      notes: orderObj?.notes || ai.extracted_notes || '',
      tripType: selectedCategory,
      deliveryType: selectedTripCode,
      cycleType: normalizeCycleType(orderObj?.cycle || ai.cycle_type),
      onCall: Boolean(orderObj?.on_call ?? ai.on_call),
      transactionType: ['STC', 'COS', 'BBC'].includes(orderObj?.transaction_type || ai.transaction_type)
        ? (orderObj?.transaction_type || ai.transaction_type)
        : '',
      machineCdr: orderObj?.machine_cdr === 'Y' || ai.machine_cdr === 'Y' ? 'Y' : 'N',
      validationLocationEnabled: Boolean(orderObj?.validation_location || ai.validation_location),
      validationLocation: orderObj?.validation_location || ai.validation_location || '',
      senderParty: emptyParty(),
      receiverParty: emptyParty(),
      daToken: orderObj?.da_token || ai.da_token || '',
      citType: ai.cit_type || 'CIT',
      currency: selectedCurrency,
      targetAmount: amt,
      rows: draftRows,
      pairedCollectionTargetAmount: 0,
      pairedCollectionRows: []
    };
  };

  const applyTicketDraft = (draft: TicketDraft) => {
    setPlanDate(draft.planDate);
    setTripDate(draft.tripDate);
    setWarehouseCode(draft.warehouseCode);
    setWarehouseName(draft.warehouseName);
    setBankCode(draft.bankCode);
    setBankName(draft.bankName);
    setClientCode(draft.clientCode);
    setClientName(draft.clientName);
    setVaultBranchCode(draft.vaultBranchCode);
    setVaultBranchName(draft.vaultBranchName);
    setSerialNumber(draft.serialNumber);
    setRequestTime(draft.requestTime);
    setNotes(draft.notes);
    setTripType(draft.tripType);
    setDeliveryType(draft.deliveryType);
    setCycleType(draft.cycleType);
    setOnCall(draft.onCall);
    setTransactionType(draft.transactionType);
    setMachineCdr(draft.machineCdr);
    setValidationLocationEnabled(draft.validationLocationEnabled);
    setValidationLocation(draft.validationLocation);
    setSenderParty({ ...draft.senderParty });
    setReceiverParty({ ...draft.receiverParty });
    setDaToken(draft.daToken);
    setCitType(draft.citType);
    setCurrency(draft.currency);
    setTargetAmount(draft.targetAmount);
    setRows(draft.rows.map(row => ({ ...row })));
    setPairedCollectionTargetAmount(draft.pairedCollectionTargetAmount);
    setPairedCollectionRows(draft.pairedCollectionRows.map(row => ({ ...row })));
  };

  const captureCurrentTicketDraft = (): TicketDraft => ({
    planDate,
    tripDate,
    warehouseCode,
    warehouseName,
    bankCode,
    bankName,
    clientCode,
    clientName,
    vaultBranchCode,
    vaultBranchName,
    serialNumber,
    requestTime,
    notes,
    tripType,
    deliveryType,
    cycleType,
    onCall,
    transactionType,
    machineCdr,
    validationLocationEnabled,
    validationLocation,
    senderParty: { ...senderParty },
    receiverParty: { ...receiverParty },
    daToken,
    citType,
    currency,
    targetAmount,
    rows: rows.map(row => ({ ...row })),
    pairedCollectionTargetAmount,
    pairedCollectionRows: pairedCollectionRows.map(row => ({ ...row }))
  });

  // Switch ticket tab
  const handleSelectTicketTab = (ticketIdx: number) => {
    const currentDraft = captureCurrentTicketDraft();
    const nextDraft = ticketDrafts[ticketIdx] || (aiData ? buildTicketDraftFromAi(aiData, ticketIdx, masterItems) : currentDraft);
    setTicketDrafts(prev => ({ ...prev, [currentTicketIndex]: currentDraft, [ticketIdx]: nextDraft }));
    setCurrentTicketIndex(ticketIdx);
    applyTicketDraft(nextDraft);
  };

  const handleTripCategoryChange = (nextCategory: string) => {
    setTripType(nextCategory);
    setDeliveryType(nextCategory === 'Collection' ? 'C' : nextCategory === 'Netting' ? 'T' : 'D');
    if (nextCategory !== 'Delivery' && cycleType === 'A') setCycleType('P');

    if (clientName) {
      const selectedParty: CitPartyFields = {
        name: clientName,
        address: '',
        city: '',
        contactName: '',
        contactNumber: ''
      };
      if (nextCategory === 'Collection') {
        setSenderParty(prev => ({ ...prev, ...selectedParty }));
      } else {
        setReceiverParty(prev => ({ ...prev, ...selectedParty }));
      }
    }

    setAiHighlights(prev => ({ ...prev, tripType: false }));
  };

  // Denomination Row handlers
  const handleAddRow = (target: 'primary' | 'paired' = 'primary') => {
    const defaultMaster = masterItems.find(item => item.MoneyCode === currency);
    if (!defaultMaster) return;

    const denomination = Number(defaultMaster.Value) || 0;
    const newRow: DenominationRow = {
      id: `${target}-row-${Date.now()}-${Math.random()}`,
      item_id: defaultMaster.Code,
      item_name: defaultMaster.Name || defaultMaster.Code,
      denomination,
      quantity: 0,
      subtotal: 0,
      remarks: '',
      fancySerialNumber: '',
      isAiFilled: false
    };
    if (target === 'paired') {
      setPairedCollectionRows(prev => [...prev, newRow]);
    } else {
      setRows(prev => [...prev, newRow]);
    }
  };

  const handleCurrencyChange = (nextCurrency: string) => {
    setCurrency(nextCurrency);
    const firstItem = masterItems.find(item => item.MoneyCode === nextCurrency);
    if (!firstItem) {
      setRows([]);
      setPairedCollectionRows([]);
      return;
    }

    const denomination = Number(firstItem.Value) || 0;
    setRows(prevRows => prevRows.map(row => ({
      ...row,
      item_id: firstItem.Code,
      item_name: firstItem.Name || firstItem.Code,
      denomination,
      subtotal: denomination * row.quantity,
      isAiFilled: false
    })));
    setPairedCollectionRows(prevRows => prevRows.map(row => ({
      ...row,
      item_id: firstItem.Code,
      item_name: firstItem.Name || firstItem.Code,
      denomination,
      subtotal: denomination * row.quantity,
      isAiFilled: false
    })));
  };

  const handleUpdateRow = (
    target: 'primary' | 'paired',
    id: string,
    field: 'item_id' | 'quantity' | 'remarks' | 'fancySerialNumber',
    value: string
  ) => {
    const updateRows = (prevRows: DenominationRow[]) =>
      prevRows.map(row => {
        if (row.id !== id) return row;

        if (field === 'item_id') {
          const selectedMaster = masterItems.find(item => item.Code === value);
          const newDenom = selectedMaster?.Value !== null && selectedMaster?.Value !== undefined
            ? Number(selectedMaster.Value)
            : row.denomination;
          return {
            ...row,
            item_id: value,
            item_name: selectedMaster?.Name || selectedMaster?.Code || row.item_name,
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
        } else if (field === 'remarks' || field === 'fancySerialNumber') {
          return { ...row, [field]: value, isAiFilled: false };
        }
        return row;
      });

    if (target === 'paired') {
      setPairedCollectionRows(updateRows);
    } else {
      setRows(updateRows);
    }
  };

  const handleRemoveRow = (target: 'primary' | 'paired', id: string) => {
    if (target === 'paired') {
      setPairedCollectionRows(prev => prev.filter(row => row.id !== id));
    } else {
      setRows(prev => prev.filter(row => row.id !== id));
    }
  };

  // Calculated total amount across all breakdown rows
  const calculatedTotal = rows.reduce((sum, r) => sum + r.subtotal, 0);
  const pairedCollectionTotal = pairedCollectionRows.reduce((sum, row) => sum + row.subtotal, 0);
  const effectiveTotal = tripType === 'Delivery' ? calculatedTotal : targetAmount;
  const ticketSummaryDrafts = Array.from({ length: targetTickets }, (_, index) => {
    const ticketIndex = index + 1;
    const draft = ticketIndex === currentTicketIndex
      ? captureCurrentTicketDraft()
      : ticketDrafts[ticketIndex] || (aiData ? buildTicketDraftFromAi(aiData, ticketIndex, masterItems) : captureCurrentTicketDraft());
    const total = draft.tripType === 'Delivery'
      ? draft.rows.reduce((sum, row) => sum + row.subtotal, 0)
      : draft.targetAmount;
    return { ticketIndex, draft, total };
  });
  const operationalSummaryRows = ticketSummaryDrafts.flatMap(({ ticketIndex, draft, total }) => {
    const primary = {
      key: `${ticketIndex}-${draft.deliveryType}`,
      ticketIndex,
      tripCode: draft.deliveryType,
      draft,
      total
    };
    if (draft.deliveryType !== 'DCC') return [primary];
    return [
      primary,
      {
        key: `${ticketIndex}-CCC`,
        ticketIndex,
        tripCode: 'CCC' as const,
        draft,
        total: draft.pairedCollectionRows.reduce((sum, row) => sum + row.subtotal, 0)
      }
    ];
  });
  const grandTotal = operationalSummaryRows.reduce((sum, item) => sum + item.total, 0);

  // Submit Handler (Multi-Order Partial Fulfillment)
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planDate || !tripDate || !warehouseCode || vaultBranchCode === null || !bankCode || !clientCode) {
      alert('Tanggal Plan, Tanggal Trip, Cab ADV, Vault, Bank, dan Client wajib diisi.');
      return;
    }
    if (!transactionType) {
      alert('Jenis Transaksi pada Client belum diatur di ScEntity. Hubungi Team Marketing sebelum membuat trip.');
      return;
    }
    if (tripType === 'Delivery' && rows.length === 0) {
      alert('Detail denomination Delivery wajib diisi.');
      return;
    }
    if (deliveryType === 'DCC' && pairedCollectionRows.length === 0) {
      alert('DCC harus memiliki detail denomination pasangan CCC.');
      return;
    }
    if (tripDate < planDate) {
      alert('Tanggal Trip tidak boleh lebih kecil dari Tanggal Plan.');
      return;
    }
    try {
      setSubmitting(true);

      const payload = {
        message_id: emailId,
        ticket_index: currentTicketIndex,
        target_tickets: targetTickets,
        trip_date: tripDate,
        warehouse_code: warehouseCode,
        warehouse_name: warehouseName,
        branch_code: vaultBranchCode,
        branch_name: vaultBranchName,
        bank_code: bankCode,
        bank_name: bankName,
        client_code: clientCode,
        client_name: clientName,
        vault_branch_code: vaultBranchCode,
        vault_branch_name: vaultBranchName,
        serial_number: serialNumber,
        request_time: requestTime,
        plan_date: planDate,
        trip_type: tripType,
        trip_code: deliveryType,
        cycle_type: cycleType,
        on_call: onCall,
        transaction_type: transactionType,
        machine_cdr: tripType === 'Collection' ? machineCdr : undefined,
        validation_location: tripType === 'Collection' && validationLocationEnabled ? validationLocation : undefined,
        sender: senderParty,
        receiver: receiverParty,
        da_token: daToken,
        cit_type: citType,
        currency,
        total_amount: effectiveTotal,
        items: rows,
        linked_orders: deliveryType === 'DCC'
          ? [{
              trip_code: 'CCC',
              currency,
              total_amount: pairedCollectionTotal,
              items: pairedCollectionRows
            }]
          : [],
        notes
      };

      setTicketDrafts(prev => ({ ...prev, [currentTicketIndex]: captureCurrentTicketDraft() }));

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
          const nextDraft = ticketDrafts[nextIdx] || buildTicketDraftFromAi(aiData, nextIdx, masterItems);
          setCurrentTicketIndex(nextIdx);
          applyTicketDraft(nextDraft);
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

  const renderDenominationPanel = (
    title: string,
    target: 'primary' | 'paired',
    panelRows: DenominationRow[],
    total: number,
    extractedTarget: number
  ) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-emerald-600" />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{title}</h4>
          {target === 'paired' && (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              Otomatis dibuat bersama DCC
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => handleAddRow(target)}
          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-colors border border-blue-200"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Tambah Pecahan</span>
        </button>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
        <div className="bg-slate-50 px-4 py-2.5 grid grid-cols-12 gap-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
          <div className="col-span-3">Kode / Pecahan Uang</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-2 text-right">Value</div>
          <div className="col-span-2">Keterangan</div>
          <div className="col-span-2">Fancy SN</div>
          <div className="col-span-1 text-center">Aksi</div>
        </div>

        {panelRows.map(row => (
          <div key={row.id} className="px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-slate-50">
            <div className="col-span-3 flex items-center gap-2">
              {row.isAiFilled && <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
              <select
                value={row.item_id}
                onChange={(e) => handleUpdateRow(target, row.id, 'item_id', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              >
                {masterItems
                  .filter(item => item.MoneyCode === currency)
                  .map(item => (
                    <option key={item.Code} value={item.Code}>
                      {item.Code} — {item.Name || item.Code}
                    </option>
                  ))}
              </select>
            </div>
            <div className="col-span-2">
              <input
                type="number"
                min={0}
                value={row.quantity}
                onChange={(e) => handleUpdateRow(target, row.id, 'quantity', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold text-right bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
            <div className="col-span-2 text-right font-mono font-bold text-slate-800 text-xs">
              {row.denomination.toLocaleString()}
            </div>
            <div className="col-span-2">
              <input
                value={row.remarks}
                onChange={(e) => handleUpdateRow(target, row.id, 'remarks', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
            <div className="col-span-2">
              <input
                value={row.fancySerialNumber}
                onChange={(e) => handleUpdateRow(target, row.id, 'fancySerialNumber', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
            <div className="col-span-1 text-center">
              <button
                type="button"
                onClick={() => handleRemoveRow(target, row.id)}
                className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {panelRows.length === 0 && (
          <div className="px-4 py-6 text-center text-xs font-medium text-slate-400">
            Belum ada denomination. Klik Tambah Pecahan.
          </div>
        )}
      </div>

      <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between shadow-md">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Nominal {target === 'paired' ? 'CCC' : deliveryType}</span>
          <p className="text-xl font-extrabold font-mono text-emerald-400">{currency} {total.toLocaleString()}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 block font-bold">Target: {currency} {extractedTarget.toLocaleString()}</span>
          <span className={`mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${
            total === extractedTarget
              ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/20 text-amber-300'
          }`}>
            {total === extractedTarget ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {total === extractedTarget ? 'Nominal Sesuai' : 'Ada Penyesuaian Manual'}
          </span>
        </div>
      </div>
    </div>
  );

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
                      setTicketDrafts(prev => ({ ...prev, [currentTicketIndex]: captureCurrentTicketDraft() }));
                      setTargetTickets(v);
                      if (currentTicketIndex > v) {
                        const nextDraft = ticketDrafts[v] || (aiData ? buildTicketDraftFromAi(aiData, v, masterItems) : captureCurrentTicketDraft());
                        setCurrentTicketIndex(v);
                        applyTicketDraft(nextDraft);
                      }
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
                <span>Header Form (Always Required)</span>
              </h4>

              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                <span className="text-slate-500">Ticket ID:</span>
                <span className="rounded-md bg-emerald-50 px-2 py-1 font-mono text-emerald-700">{emailId}</span>
                <span className="ml-2 text-slate-500">Order ID:</span>
                <span className="rounded-md bg-blue-50 px-2 py-1 font-mono text-blue-700">CIT-{emailId.slice(-6)}</span>
                <span className="ml-auto rounded-md bg-slate-100 px-2 py-1 text-slate-600">Satuan: {currency}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Tanggal Plan */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Tanggal Plan *</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={planDate}
                    onChange={(e) => setPlanDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
                  />
                </div>

                {/* Tanggal Trip */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Tanggal Trip *</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={planDate}
                    value={tripDate}
                    onChange={(e) => setTripDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
                  />
                </div>

                {/* Cabang Advantage / Warehouse */}
                <div className="relative">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>Cab ADV *</span>
                    </span>
                    {aiHighlights.warehouseName && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.2 rounded border border-blue-200 flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                    )}
                  </label>

                  <div
                    onClick={() => setIsBranchOpen(!isBranchOpen)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      aiHighlights.warehouseName
                        ? 'bg-blue-50/50 border-blue-300 text-blue-900 ring-1 ring-blue-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  >
                    <span>{warehouseName || 'Pilih Cab ADV'}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>

                  {isBranchOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-1">
                      <div className="relative mb-2">
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Cari kode atau nama Cab ADV..."
                          value={warehouseSearch}
                          onChange={(e) => setWarehouseSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {warehouseOptions
                          .filter(warehouse => `${warehouse.name} ${warehouse.code}`.toLowerCase().includes(warehouseSearch.toLowerCase()))
                          .map(warehouse => (
                          <div
                            key={warehouse.code}
                            onClick={() => {
                              setWarehouseCode(warehouse.code);
                              setWarehouseName(warehouse.name);
                              setIsBranchOpen(false);
                              setAiHighlights(prev => ({ ...prev, warehouseName: false }));
                            }}
                            className={`px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                              warehouseCode === warehouse.code ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <span>{warehouse.name}</span>
                            <span className={`ml-2 font-mono text-[10px] ${warehouseCode === warehouse.code ? 'text-blue-100' : 'text-slate-400'}`}>
                              {warehouse.code}
                            </span>
                          </div>
                        ))}
                        {warehouseOptions.length === 0 && (
                          <div className="px-3 py-2 text-xs text-slate-400">
                            {entityMasterLoading ? 'Memuat master Cab ADV...' : 'Master Cab ADV belum tersedia.'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bank */}
                <div className="relative">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    <span>Bank *</span>
                  </label>
                  <div
                    onClick={() => setIsBankOpen(!isBankOpen)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl flex items-center justify-between cursor-pointer transition-all"
                  >
                    <span>{bankName || 'Pilih Bank'}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  {isBankOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-1">
                      <div className="relative mb-2">
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Cari bank..."
                          value={bankSearch}
                          onChange={(e) => setBankSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {bankOptions
                          .filter(bank => `${bank.name} ${bank.code}`.toLowerCase().includes(bankSearch.toLowerCase()))
                          .map(bank => (
                            <div
                              key={bank.code}
                              onClick={() => {
                                setBankCode(bank.code);
                                setBankName(bank.name);
                                setClientCode('');
                                setClientName('');
                                setVaultBranchCode(null);
                                setVaultBranchName('');
                                setTransactionType('');
                                setIsBankOpen(false);
                              }}
                              className={`px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                                bankCode === bank.code ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              <span>{bank.name}</span>
                              <span className={`ml-2 font-mono text-[10px] ${bankCode === bank.code ? 'text-blue-100' : 'text-slate-400'}`}>
                                {bank.code}
                              </span>
                            </div>
                          ))}
                        {bankOptions.length === 0 && (
                          <div className="px-3 py-2 text-xs text-slate-400">
                            {entityMasterLoading ? 'Memuat master bank...' : 'Bank tidak ditemukan.'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 border-t border-slate-100 pt-4">
                {/* Client */}
                <div className="relative">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>Client *</span>
                    </span>
                    {aiHighlights.clientName && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.2 rounded border border-blue-200 flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                    )}
                  </label>

                  <div
                    onClick={() => bankCode && setIsClientOpen(!isClientOpen)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      aiHighlights.clientName
                        ? 'bg-blue-50/50 border-blue-300 text-blue-900 ring-1 ring-blue-200'
                        : bankCode
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span>{clientName || (bankCode ? 'Pilih Client' : 'Pilih Bank dahulu')}</span>
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
                        {clientOptions
                          .filter(client => `${client.EntityName || ''} ${client.EntityCode}`.toLowerCase().includes(clientSearch.toLowerCase()))
                          .map(client => (
                          <div
                            key={client.EntityCode}
                            onClick={() => {
                              setClientCode(client.EntityCode);
                              setClientName(client.EntityName || client.EntityCode);
                              setVaultBranchCode(client.VaultBranchCode);
                              setVaultBranchName(
                                client.VaultBranchCode === null
                                  ? ''
                                  : vaultOptions.find(vault => vault.code === client.VaultBranchCode)?.name || String(client.VaultBranchCode)
                              );
                              const selectedParty = {
                                name: client.EntityName || client.EntityCode,
                                address: '',
                                city: '',
                                contactName: '',
                                contactNumber: ''
                              };
                              if (tripType === 'Collection') {
                                setSenderParty(selectedParty);
                              } else {
                                setReceiverParty(selectedParty);
                              }
                              const defaultCountMethod = String(client.DefaultCountMethod || '').trim().toUpperCase();
                              setTransactionType(
                                ['STC', 'COS', 'BBC'].includes(defaultCountMethod)
                                  ? defaultCountMethod as 'STC' | 'COS' | 'BBC'
                                  : ''
                              );
                              setIsClientOpen(false);
                              setAiHighlights(prev => ({ ...prev, clientName: false, vaultBranchName: false }));
                            }}
                            className={`px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                              clientCode === client.EntityCode ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <span>{client.EntityName || client.EntityCode}</span>
                            <span className={`ml-2 font-mono text-[10px] ${clientCode === client.EntityCode ? 'text-blue-100' : 'text-slate-400'}`}>
                              {client.EntityCode}
                            </span>
                          </div>
                        ))}
                        {clientOptions.length === 0 && (
                          <div className="px-3 py-2 text-xs text-slate-400">
                            {bankCode ? 'Client tidak ditemukan.' : 'Pilih Bank dahulu.'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Vault</label>
                  <div
                    title={vaultBranchCode !== null ? `VaultBranchCode: ${vaultBranchCode}` : undefined}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-100 border border-slate-200 rounded-xl text-slate-600"
                  >
                    {clientCode ? vaultBranchName || 'Vault client belum diatur' : 'Pilih Client dahulu'}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Client BI</label>
                  <div className="w-full px-3 py-2 text-xs font-bold bg-slate-100 border border-slate-200 rounded-xl text-slate-600">
                    {!selectedClient ? 'Pilih Client dahulu' : selectedClient.IsClientBI === 1 ? 'Ya' : 'Tidak'}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">No Seri</label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: CATEGORY & CUSTOM FIELDS */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
                <Zap className="h-4 w-4 text-slate-600" />
                <span>Operational Category & Custom Fields</span>
              </h4>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {/* CIT Category */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                    <span>CIT Category</span>
                    {aiHighlights.tripType && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.2 rounded border border-blue-200 flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                    )}
                  </label>
                  <select
                    value={tripType}
                    onChange={(e) => handleTripCategoryChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="Delivery">DA Delivery</option>
                    <option value="Collection">DA Collection</option>
                    <option value="Netting">DA Netting</option>
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
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'P', label: 'Pagi' },
                      { value: 'S', label: 'Siang' },
                      ...(tripType === 'Delivery' ? [{ value: 'A', label: 'Adhoc' }] : [])
                    ] as Array<{ value: 'P' | 'S' | 'A'; label: string }>).map(option => (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                          cycleType === option.value
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="radio"
                          name="cycleType"
                          value={option.value}
                          checked={cycleType === option.value}
                          onChange={() => {
                            setCycleType(option.value);
                            setAiHighlights(prev => ({ ...prev, cycleType: false }));
                          }}
                        />
                        <span>{option.label} ({option.value})</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Satuan / Mata Uang */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Satuan</label>
                  <select
                    value={currency}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {masterCurrencies.map(item => (
                      <option key={item.MoneyCode} value={item.MoneyCode}>
                        {item.MoneyCode}{item.MoneyName ? ` - ${item.MoneyName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">Tipe Trip</label>
                  <div className="space-y-2 text-xs font-semibold text-slate-700">
                    {tripType === 'Delivery' && (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="deliveryType" checked={deliveryType === 'D'} onChange={() => setDeliveryType('D')} />
                          <span>Delivery (D)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="deliveryType"
                            checked={deliveryType === 'DCC'}
                            onChange={() => {
                              setDeliveryType('DCC');
                              if (pairedCollectionRows.length === 0) handleAddRow('paired');
                            }}
                          />
                          <span>Delivery Cash to Cash (DCC)</span>
                        </label>
                      </>
                    )}
                    {tripType === 'Collection' && (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="deliveryType" checked={deliveryType === 'C'} onChange={() => setDeliveryType('C')} />
                          <span>Collect (C)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="deliveryType" checked={deliveryType === 'CCC'} onChange={() => setDeliveryType('CCC')} />
                          <span>Collect Cash to Cash (CCC)</span>
                        </label>
                      </>
                    )}
                    {tripType === 'Netting' && (
                      <span className="inline-flex rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-bold text-blue-700">
                        Netting (T)
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Waktu Request</label>
                  <input
                    type="datetime-local"
                    value={requestTime}
                    onChange={(e) => setRequestTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
                    Jenis Transaksi
                    <span className="ml-2 normal-case text-[9px] font-semibold text-slate-400">otomatis dari Client</span>
                  </label>
                  <div className="flex gap-2">
                    {(['STC', 'BBC', 'COS'] as const).map(type => (
                      <label
                        key={type}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-extrabold ${
                          transactionType === type
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-slate-50 text-slate-400'
                        }`}
                      >
                        <input type="radio" name="transactionType" checked={transactionType === type} disabled />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                  {!transactionType && clientCode && (
                    <p className="mt-2 text-[10px] font-bold text-rose-600">
                      Belum diatur pada ScEntity. Hubungi Team Marketing.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                    {deliveryType === 'DCC' ? 'Jumlah DCC' : 'Jumlah'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-right bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
                  />
                </div>

                {deliveryType === 'DCC' && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Jumlah CCC</label>
                    <input
                      type="number"
                      min={0}
                      value={pairedCollectionTargetAmount}
                      onChange={(e) => setPairedCollectionTargetAmount(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-3 py-2 text-xs font-mono font-bold text-right bg-violet-50 border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:bg-white focus:outline-hidden"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">On Call</label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={onCall} onChange={(e) => setOnCall(e.target.checked)} />
                    <span>Trip direquest via call</span>
                  </label>
                </div>

                {tripType === 'Collection' && (
                  <>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Trx Mesin CDR</label>
                      <select
                        value={machineCdr}
                        onChange={(e) => setMachineCdr(e.target.value as 'Y' | 'N')}
                        className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      >
                        <option value="N">Tidak (N)</option>
                        <option value="Y">Ya (Y)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Lokasi Validasi</label>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={validationLocationEnabled} onChange={(e) => setValidationLocationEnabled(e.target.checked)} />
                        <input
                          type="text"
                          value={validationLocation}
                          disabled={!validationLocationEnabled}
                          onChange={(e) => setValidationLocation(e.target.value)}
                          className="min-w-0 flex-1 px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className={tripType === 'Collection' ? '' : 'xl:col-span-3'}>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Token DA</label>
                  <input
                    type="text"
                    value={daToken}
                    onChange={(e) => setDaToken(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <CitPartyPanel title="Pengirim" value={senderParty} onChange={setSenderParty} />
                <CitPartyPanel title="Penerima" value={receiverParty} onChange={setReceiverParty} />
              </div>
            </div>

            {/* SECTION 4: DENOMINATION BREAKDOWN (PECAHAN UANG) */}
            {tripType === 'Delivery' && (
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
                  onClick={() => handleAddRow('primary')}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-colors border border-blue-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Pecahan</span>
                </button>
              </div>

              {/* Rows Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="bg-slate-50 px-4 py-2.5 grid grid-cols-12 gap-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <div className="col-span-3">Kode / Pecahan Uang</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Value</div>
                  <div className="col-span-2">Keterangan</div>
                  <div className="col-span-2">Fancy SN</div>
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
                    <div className="col-span-3 flex items-center gap-2">
                      {row.isAiFilled && (
                        <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" title="Terisi Otomatis oleh AI" />
                      )}
                      <select
                        value={row.item_id}
                        onChange={(e) => handleUpdateRow('primary', row.id, 'item_id', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      >
                        {masterItems
                          .filter(item => item.MoneyCode === currency)
                          .map(item => (
                          <option key={item.Code} value={item.Code}>
                            {item.Code} — {item.Name || item.Code}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div className="col-span-2">
                      <input
                        type="number"
                        min={0}
                        value={row.quantity}
                        onChange={(e) => handleUpdateRow('primary', row.id, 'quantity', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono font-bold text-right bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="col-span-2 text-right font-mono font-bold text-slate-800 text-xs">
                      {row.denomination.toLocaleString()}
                    </div>

                    <div className="col-span-2">
                      <input
                        value={row.remarks}
                        onChange={(e) => handleUpdateRow('primary', row.id, 'remarks', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="col-span-2">
                      <input
                        value={row.fancySerialNumber}
                        onChange={(e) => handleUpdateRow('primary', row.id, 'fancySerialNumber', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>

                    {/* Remove button */}
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow('primary', row.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer transition-colors"
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
            )}

            {tripType === 'Delivery' && deliveryType === 'DCC' && renderDenominationPanel(
              'Denomination Pasangan Collection Cash to Cash (CCC)',
              'paired',
              pairedCollectionRows,
              pairedCollectionTotal,
              pairedCollectionTargetAmount
            )}

            {/* Common Fields */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
                <Clock className="h-4 w-4 text-slate-600" />
                <span>Common Fields</span>
              </h4>
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Keterangan</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span>Order Summary (All Tickets)</span>
                </h4>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                  {operationalSummaryRows.length} Trip Operasional
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 font-extrabold">No</th>
                      <th className="px-3 py-2.5 font-extrabold">Tipe Trip</th>
                      <th className="px-3 py-2.5 font-extrabold">Tanggal Trip</th>
                      <th className="px-3 py-2.5 font-extrabold">Currency</th>
                      <th className="px-3 py-2.5 font-extrabold">Cab ADV</th>
                      <th className="px-3 py-2.5 font-extrabold">Vault</th>
                      <th className="px-3 py-2.5 font-extrabold">Client</th>
                      <th className="px-3 py-2.5 text-right font-extrabold">Total / Jumlah</th>
                      <th className="px-3 py-2.5 text-center font-extrabold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {operationalSummaryRows.map(({ key, ticketIndex, tripCode, draft, total }) => (
                      <tr key={key} className={ticketIndex === currentTicketIndex ? 'bg-blue-50/50' : 'bg-white'}>
                        <td className="px-3 py-2.5 font-bold">{ticketIndex}</td>
                        <td className="px-3 py-2.5 font-semibold">{tripCode}</td>
                        <td className="px-3 py-2.5 font-mono">{draft.tripDate}</td>
                        <td className="px-3 py-2.5 font-mono font-bold">{draft.currency}</td>
                        <td className="px-3 py-2.5 font-semibold">{draft.warehouseName || '-'}</td>
                        <td className="px-3 py-2.5 font-semibold">{draft.vaultBranchName || '-'}</td>
                        <td className="px-3 py-2.5 font-semibold">{draft.clientName || '-'}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {draft.currency} {total.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleSelectTicketTab(ticketIndex)}
                            className="font-bold text-blue-600 hover:text-blue-800"
                          >
                            Lihat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end text-xs font-bold text-slate-700">
                <span>Grand Total (All Tickets):&nbsp;</span>
                <span className="font-mono text-emerald-700">{currency} {grandTotal.toLocaleString()}</span>
              </div>
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
                <span className="truncate max-w-[200px]" title={rawEmail?.sender_email || rawEmail?.from || rawEmail?.sender || rawEmail?.fromName}>
                  {rawEmail?.sender_email || rawEmail?.from || rawEmail?.sender || rawEmail?.fromName || 'Pengirim Tidak Diketahui'}
                </span>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                  {(rawEmail?.received_at || rawEmail?.date) ? new Date(rawEmail?.received_at || rawEmail?.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>

              <p className="text-xs font-bold text-slate-900 leading-snug select-text">
                {rawEmail?.subject || '(Tanpa Subjek)'}
              </p>

              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 pt-1 border-t border-slate-100">
                <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="font-semibold text-slate-700">
                  {(rawEmail?.received_at || rawEmail?.date) ? new Date(rawEmail?.received_at || rawEmail?.date).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) : 'Tanggal tidak tersedia'}
                </span>
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
              {(rawEmail?.html_body || rawEmail?.body_html) ? (
                <div
                  className="prose prose-xs max-w-none text-xs text-slate-700 overflow-x-auto leading-relaxed border-t border-slate-100 pt-3 select-text"
                  dangerouslySetInnerHTML={{ __html: rawEmail.html_body || rawEmail.body_html }}
                />
              ) : (
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono bg-slate-50 p-3 rounded-lg border border-slate-100 select-text">
                  {rawEmail?.body_text || rawEmail?.body || 'Tidak ada teks isi pesan.'}
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
