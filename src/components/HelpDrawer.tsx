import React from 'react';
import { HelpCircle, X, BookOpen, FileText, CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { HELP_CONTENT, HelpSection } from '../config/helpContent';

interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentMenuKey: string;
}

export const HelpDrawer: React.FC<HelpDrawerProps> = ({ isOpen, onClose, currentMenuKey }) => {
  if (!isOpen) return null;

  // Fallback if menu key not found
  const content: HelpSection = HELP_CONTENT[currentMenuKey] || HELP_CONTENT['inbox'];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Dark Overlay Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        {/* Slide-Over Panel (Width: ~380px - 420px) */}
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between transform transition-transform duration-300 ease-in-out">
          
          {/* Drawer Header */}
          <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-slate-800 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30 shrink-0 mt-0.5">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider mb-0.5">
                  Bantuan & Dokumentasi Fitur
                </div>
                <h3 className="text-base font-bold text-white leading-tight">
                  {content.title}
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-snug">
                  {content.subtitle}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Tutup Panel Bantuan"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Content Body (Scrollable) */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6 text-slate-700 text-xs leading-relaxed">
            
            {/* Bagian 1: Cara Menggunakan Fitur Ini */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm mb-2 pb-2 border-b border-slate-200/80">
                <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>{content.usageTitle}</span>
              </div>

              <p className="text-slate-600 mb-3 text-xs leading-relaxed">
                {content.usageOverview}
              </p>

              <div className="space-y-2">
                <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider">
                  Langkah-Langkah Penggunaan:
                </div>
                <ol className="space-y-2 pl-1">
                  {content.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 font-extrabold text-[10px] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                        {idx + 1}
                      </span>
                      <span className="text-slate-700 text-xs leading-normal flex-1">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Bagian 2: Penjelasan Field (Glossary) */}
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm mb-3 pb-2 border-b border-slate-200">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>{content.glossaryTitle}</span>
              </div>

              <div className="space-y-2.5">
                {content.glossary.map((item, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:border-indigo-200 transition-colors">
                    <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 mb-1 text-indigo-950">
                      <ChevronRight className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>{item.term}</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed pl-5">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Support Note */}
            <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2.5 text-indigo-900 text-[11px]">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong>Butuh Bantuan Lebih Lanjut?</strong>
                <p className="text-indigo-700 mt-0.5">
                  Hubungi Tim Support TI / Super Admin jika Anda memerlukan bantuan akses peran atau mengalami kendala integrasi.
                </p>
              </div>
            </div>

          </div>

          {/* Drawer Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-mono font-medium text-slate-400">
              Menu: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">{currentMenuKey}</code>
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              Tutup Bantuan
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
