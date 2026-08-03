import React, { useState, useEffect } from 'react';
import { Filter, RefreshCw, Plus, Trash2, Edit3, Search, ShieldAlert, CheckCircle2, Building, Mail, MapPin } from 'lucide-react';

export interface User {
  id: number;
  tenant_id: number | null;
  email: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER';
  tenant_name?: string;
}

export interface DynamicFilterRule {
  id?: number;
  tenant_id?: number;
  emails: string;
  region: string;
  branch: string;
  created_at?: string;
}

interface DynamicFiltersManagerProps {
  currentUser: User | null;
}

export const DynamicFiltersManager: React.FC<DynamicFiltersManagerProps> = ({ currentUser }) => {
  const [filters, setFilters] = useState<DynamicFilterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DynamicFilterRule | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formRegion, setFormRegion] = useState('REGION 1');
  const [formBranch, setFormBranch] = useState('');
  const [formEmails, setFormEmails] = useState('');

  // Strict Super Admin Access Guard
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const fetchFilters = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dynamic-filters');
      const data = await res.json();
      if (data.success) {
        setFilters(data.filters || []);
      }
    } catch (err: any) {
      console.error('Error fetching dynamic filters:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchFilters();
    }
  }, [isSuperAdmin]);

  const handleOpenModal = (rule?: DynamicFilterRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormRegion(rule.region);
      setFormBranch(rule.branch);
      setFormEmails(rule.emails);
    } else {
      setEditingRule(null);
      setFormRegion('REGION 1');
      setFormBranch('');
      setFormEmails('');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBranch || !formEmails) {
      alert('Branch dan Email wajib diisi.');
      return;
    }

    try {
      const payload: DynamicFilterRule = {
        id: editingRule?.id,
        region: formRegion,
        branch: formBranch.toUpperCase(),
        emails: formEmails
      };

      const res = await fetch('/api/dynamic-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Dynamic Filter berhasil disimpan.' });
        setIsModalOpen(false);
        fetchFilters();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal menyimpan Dynamic Filter' });
    }
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (!window.confirm('Hapus aturan Dynamic Filter ini?')) return;

    try {
      const res = await fetch(`/api/dynamic-filters/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Aturan berhasil dihapus.' });
        fetchFilters();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal menghapus' });
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-2xl flex flex-col items-center">
          <ShieldAlert className="w-12 h-12 text-amber-600 mb-3" />
          <h2 className="text-xl font-bold mb-2">Akses Terbatas (Super Admin Only)</h2>
          <p className="text-sm max-w-md">
            Halaman Kelola Master Data Dynamic Filters hanya dapat diakses oleh role **Super Admin**. Role Tenant Admin atau Staff tidak memiliki izin untuk mengubah master routing region.
          </p>
        </div>
      </div>
    );
  }

  const regions = ['ALL', 'REGION 1', 'REGION 2', 'REGION 3', 'REGION 4', 'REGION 5', 'REGION 6'];

  const filtered = filters.filter(f => {
    const matchesRegion = selectedRegion === 'ALL' || f.region === selectedRegion;
    const matchesSearch = f.branch.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          f.emails.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          f.region.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesRegion && matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white p-6 rounded-2xl shadow-xl border border-indigo-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold tracking-wider uppercase mb-1">
            <Filter className="w-4 h-4" />
            Master Data Routing Region & Branch
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Master Dynamic Filters Management</h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            Sistem penyaringan email cerdas berdasarkan domain/sender email client untuk memetakan pesan secara otomatis ke Region 1-6 dan Kantor Cabang operasional CIT.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Filter Baru
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

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          {regions.map(r => (
            <button
              key={r}
              onClick={() => setSelectedRegion(r)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                selectedRegion === r
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px] flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari Cabang / Email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Main Table / Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
          Memuat data Dynamic Filters...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500">
          <Filter className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-base text-slate-700">Belum ada Dynamic Filter terdaftar</p>
          <p className="text-xs mt-1 text-slate-400">Klik "Seed Master Data (1-6)" untuk mengisi otomatis atau tambahkan manual.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(item => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {item.region}
                    </span>
                    <span className="bg-slate-100 text-slate-800 text-xs font-extrabold px-2.5 py-1 rounded-md flex items-center gap-1">
                      <Building className="w-3 h-3 text-slate-500" />
                      {item.branch}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenModal(item)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit Filter"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Hapus Filter"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 font-mono break-all leading-relaxed">
                  <div className="flex items-center gap-1 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <Mail className="w-3 h-3" /> Address Filters ({item.emails.split(',').length} email):
                  </div>
                  {item.emails.split(',').map((email, idx) => (
                    <span key={idx} className="inline-block bg-white border border-slate-200 rounded px-1.5 py-0.5 mr-1 mb-1 text-[11px] font-sans font-medium text-slate-800">
                      {email.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-indigo-900 text-white p-5 flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Filter className="w-5 h-5 text-indigo-400" />
                {editingRule ? 'Edit Dynamic Filter' : 'Tambah Dynamic Filter Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-indigo-200 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Region</label>
                <select
                  value={formRegion}
                  onChange={e => setFormRegion(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="REGION 1">REGION 1</option>
                  <option value="REGION 2">REGION 2</option>
                  <option value="REGION 3">REGION 3</option>
                  <option value="REGION 4">REGION 4</option>
                  <option value="REGION 5">REGION 5</option>
                  <option value="REGION 6">REGION 6</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nama Cabang (Branch)</label>
                <input
                  type="text"
                  placeholder="Contoh: PALEMBANG, MERUYA, SEMARANG"
                  value={formBranch}
                  onChange={e => setFormBranch(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Daftar Email (Dipisahkan Koma)</label>
                <textarea
                  rows={4}
                  placeholder="palembang, agus@advantagescm.com, Muzni.Purbajanti@danamon.co.id"
                  value={formEmails}
                  onChange={e => setFormEmails(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">Masukkan kata kunci email / domain sender yang akan secara otomatis memetakan pesan masuk ke cabang ini.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow"
                >
                  Simpan Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
