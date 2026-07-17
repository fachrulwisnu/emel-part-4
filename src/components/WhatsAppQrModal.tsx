import React, { useState, useEffect } from 'react';
import { X, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

interface WhatsAppQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export default function WhatsAppQrModal({ isOpen, onClose, onConnected }: WhatsAppQrModalProps) {
  const [qrData, setQrData] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'pending' | 'connected' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isResetting, setIsResetting] = useState<boolean>(false);

  const fetchQrStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/qr');
      const json = await res.json();
      
      if (json.status === 'connected') {
        setStatus('connected');
        onConnected();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else if (json.status === 'pending') {
        setStatus('pending');
        setQrData(json.qr || '');
        setErrorMessage('');
      } else {
        setStatus('error');
        setErrorMessage(json.message || 'Gagal mengambil data QR Code.');
      }
    } catch (err: any) {
      console.error('[WhatsAppQrModal] Fetch QR error:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Terjadi kesalahan jaringan.');
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Reset state on open
    setQrData('');
    setStatus('loading');
    setErrorMessage('');
    setIsResetting(false);

    // Initial fetch
    fetchQrStatus();

    // Poll every 3 seconds
    const interval = setInterval(() => {
      fetchQrStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen]);

  const handleRefreshQr = async () => {
    try {
      setIsResetting(true);
      setStatus('loading');
      setQrData('');
      setErrorMessage('');

      const res = await fetch('/api/whatsapp/reset', {
        method: 'POST'
      });
      const json = await res.json();

      if (json.success) {
        // Fetch status immediately after reset
        await fetchQrStatus();
      } else {
        setStatus('error');
        setErrorMessage(json.message || 'Gagal memuat ulang QR Code.');
      }
    } catch (err: any) {
      console.error('[WhatsAppQrModal] Reset error:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Terjadi kesalahan saat memproses inisialisasi ulang.');
    } finally {
      setIsResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden transform transition-all border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Koneksi WhatsApp Gateway</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center justify-center min-h-[340px]">
          {status === 'loading' && (
            <div className="text-center space-y-3">
              <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-700">Mempersiapkan Sesi & QR Code...</p>
              <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
                Menghubungkan ke engine Baileys dan membuat sesi enkripsi baru. Silakan tunggu sebentar.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4 py-4">
              <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto border border-rose-200">
                <AlertTriangle className="h-6 w-6 text-rose-600" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800">Gagal Memuat QR Code</p>
                <p className="text-[10px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  {errorMessage || 'Sesi terputus atau backend tidak merespon.'}
                </p>
              </div>
              <button
                onClick={handleRefreshQr}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] cursor-pointer transition-all flex items-center gap-1.5 mx-auto shadow-xs"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Coba Lagi</span>
              </button>
            </div>
          )}

          {status === 'connected' && (
            <div className="text-center space-y-3 py-6">
              <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto border border-emerald-200">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <p className="text-xs font-bold text-slate-800">WhatsApp Terhubung!</p>
              <p className="text-[10px] text-slate-400">
                Sesi Anda telah aktif dan siap digunakan untuk mengirim laporan harian.
              </p>
            </div>
          )}

          {status === 'pending' && (
            <div className="text-center space-y-4 w-full">
              <p className="text-xs font-bold text-slate-700 leading-normal">
                Scan QR Code ini dengan Aplikasi WhatsApp Anda
              </p>
              
              <div className="relative mx-auto w-48 h-48 border border-slate-200 rounded-xl p-2 bg-white shadow-inner flex items-center justify-center">
                {qrData ? (
                  <img 
                    src={qrData} 
                    alt="WhatsApp QR Code" 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center space-y-2">
                    <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin mx-auto" />
                    <p className="text-[9px] text-slate-400 font-semibold">Memuat QR...</p>
                  </div>
                )}
              </div>

              <div className="text-left bg-slate-50 border border-slate-100 rounded-lg p-3 text-[10px] text-slate-500 leading-relaxed max-w-sm mx-auto space-y-1">
                <p className="font-bold text-slate-700">💡 Cara Menghubungkan:</p>
                <p>1. Buka aplikasi WhatsApp di telepon genggam Anda.</p>
                <p>2. Tap <span className="font-semibold text-slate-700">Menu / Settings</span> dan pilih <span className="font-semibold text-slate-700">Linked Devices</span>.</p>
                <p>3. Tap <span className="font-semibold text-slate-700">Link a Device</span> lalu arahkan kamera ke layar ini.</p>
              </div>

              <div className="pt-2 flex justify-center gap-2">
                <button
                  onClick={handleRefreshQr}
                  disabled={isResetting}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className={`h-3 w-3 ${isResetting ? 'animate-spin' : ''}`} />
                  <span>Refresh QR</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
