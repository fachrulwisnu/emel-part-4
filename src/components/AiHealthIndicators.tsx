import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';

interface ModelHealth {
  name: string;
  status: 'Online' | 'Offline';
  statusCode: number;
  latency: string;
  error?: string;
}

export function AiHealthIndicators() {
  const [health, setHealth] = useState<ModelHealth[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/system/ai-health');
      const data = await res.json();
      if (data.success && data.health) {
        setHealth(data.health);
      }
    } catch (err) {
      console.error('Failed to fetch AI health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000); // refresh every 60 seconds
    return () => clearInterval(interval);
  }, []);

  // Determine overall status
  const isAllOnline = health.length > 0 && health.every((h) => h.status === 'Online');
  const hasOffline = health.some((h) => h.status === 'Offline');

  let overallColor = 'bg-slate-300';
  let overallText = 'Checking AI Status...';

  if (!loading && health.length > 0) {
    if (isAllOnline) {
      overallColor = 'bg-emerald-500';
      overallText = 'AI Systems Online';
    } else if (hasOffline) {
      overallColor = 'bg-rose-500 animate-pulse';
      overallText = 'AI System Degraded';
    } else {
      overallColor = 'bg-amber-500';
      overallText = 'AI Status Warning';
    }
  }

  return (
    <div className="relative inline-block" id="ai_health_indicators">
      {/* Indicator Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-0.5 text-[10px] bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full font-mono font-bold flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer select-none"
        title="Click to view full AI Health Check details"
      >
        <span className={`h-2 w-2 rounded-full ${overallColor}`}></span>
        <span>AI Health: {loading && health.length === 0 ? 'Loading...' : (isAllOnline ? 'Online' : 'Degraded')}</span>
      </button>

      {/* Popover Tooltip */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-40 animate-fade-in text-slate-700">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                <Activity className="h-3.5 w-3.5 text-blue-500" />
                AI Systems Monitor
              </span>
              <button
                onClick={fetchHealth}
                disabled={loading}
                className="text-[9px] text-blue-600 hover:text-blue-800 disabled:text-slate-400 font-bold transition-colors cursor-pointer"
              >
                {loading ? 'Refreshing...' : 'Refresh Now'}
              </button>
            </div>

            <div className="space-y-2.5">
              {health.map((item) => {
                const isOnline = item.status === 'Online';
                return (
                  <div key={item.name} className="flex flex-col space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700 capitalize">
                        {item.name.replace(/-/g, ' ')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-slate-400">
                          {item.latency}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
                            isOnline
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-100'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                    {item.error && (
                      <p className="text-[9px] text-rose-500 font-mono leading-normal pl-0.5 truncate max-w-full" title={item.error}>
                        {item.error}
                      </p>
                    )}
                  </div>
                );
              })}

              {health.length === 0 && !loading && (
                <div className="text-center text-[10px] py-2 text-slate-400 italic">
                  No health check data. Check server logs.
                </div>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 text-[9px] text-slate-400 leading-normal">
              Status diperbarui otomatis setiap 60 detik. Memantau integrasi model Nemotron-3-Nano-Omni, Nemotron-3-Super, Qwen3-Next-80B, dan StepFun-3.7-Flash secara aktif.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
