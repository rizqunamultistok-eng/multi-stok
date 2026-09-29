import React, { useState } from 'react';
import { 
  Code2, 
  Terminal, 
  Copy, 
  Check, 
  Server, 
  ShieldCheck, 
  Database, 
  ExternalLink, 
  BookOpen,
  Settings,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Zap
} from 'lucide-react';
import { SQL_FINAL_SCRIPT } from '../../lib/sqlScripts';
import { 
  getActiveSupabaseCredentials, 
  setCustomSupabaseCredentials, 
  resetCustomSupabaseCredentials,
  testCustomSupabaseConnection
} from '../../lib/supabase';
import { useInventory } from '../../context/InventoryContext';

export const SqlAndDeploymentView: React.FC = () => {
  const { refreshData } = useInventory();
  const initialCreds = getActiveSupabaseCredentials();
  const [inputUrl, setInputUrl] = useState(initialCreds.url);
  const [inputKey, setInputKey] = useState(initialCreds.anonKey);
  const [isCustom, setIsCustom] = useState(initialCreds.isCustom);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'warning' | 'error' | null; message: string }>({ type: null, message: '' });
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'indexes' | 'functions' | 'schema' | 'rls' | 'location_stock' | 'deployment'>('indexes');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(key);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const handleTestAndSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsTesting(true);
    const result = await testCustomSupabaseConnection(inputUrl.trim(), inputKey.trim());
    if (result.connected && result.hasTable) {
      setCustomSupabaseCredentials(inputUrl.trim(), inputKey.trim());
      setIsCustom(true);
      setStatusFeedback({ type: 'success', message: 'Koneksi dan tabel Supabase berhasil disimpan.' });
      await refreshData();
    } else {
      setStatusFeedback({ type: result.connected ? 'warning' : 'error', message: result.message });
    }
    setIsTesting(false);
  };

  const handleResetDefault = async () => {
    resetCustomSupabaseCredentials();
    const defaults = getActiveSupabaseCredentials();
    setInputUrl(defaults.url);
    setInputKey(defaults.anonKey);
    setIsCustom(false);
    setStatusFeedback({ type: 'success', message: 'Konfigurasi berhasil dikembalikan ke server demo bawaan.' });
    await refreshData();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Code2 className="w-6 h-6 text-indigo-600" />
            Koneksi Supabase & SQL Schema Database
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Ganti URL & API Key database Supabase langsung dari aplikasi PWA ini tanpa perlu mengedit kode file.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Buka Supabase Dashboard
          </a>
        </div>
      </div>

      {/* Supabase Connection Interactive Editor Bento Card */}
      <div className="bg-white rounded-3xl p-6 border-2 border-indigo-100 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Pengaturan Database Supabase (Langsung di Aplikasi)
              </h3>
              <p className="text-xs text-slate-500">
                {isCustom 
                  ? '🟢 Menggunakan Database Supabase Pribadi Milik Anda' 
                  : '⚪ Menggunakan Database Demo Bawaan Aplikasi'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isCustom && (
              <button
                type="button"
                onClick={handleResetDefault}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset ke Default
              </button>
            )}
            <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
              isCustom 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}>
              {isCustom ? 'Custom Database Aktif' : 'Default Demo Aktif'}
            </span>
          </div>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleTestAndSave} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* Supabase URL */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>VITE_SUPABASE_URL:</span>
                <span className="text-[10px] text-slate-400 font-normal">Dari Project Settings &gt; API</span>
              </label>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
                className="w-full px-4 py-2.5 font-mono text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>

            {/* Supabase Anon Key */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>VITE_SUPABASE_ANON_KEY (Public Key):</span>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showKey ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full px-4 py-2.5 font-mono text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition pr-10"
                />
              </div>
            </div>
          </div>

          {/* Feedback Status Box */}
          {statusFeedback.type && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 ${
                statusFeedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : statusFeedback.type === 'warning'
                  ? 'bg-amber-50 border border-amber-200 text-amber-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {statusFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed font-medium">{statusFeedback.message}</div>
            </div>
          )}

          {/* Submit Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-500">
              💡 Pengaturan ini langsung disimpan ke browser/PWA Anda dan tetap tersimpan meski aplikasi ditutup.
            </p>
            <button
              type="submit"
              disabled={isTesting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs shrink-0"
            >
              {isTesting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Menguji & Menyambungkan...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Uji Koneksi & Simpan ke Aplikasi
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Tabs */}
      {false && (
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('indexes')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'indexes'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          ⚡ Indeks & Optimasi 20.000 Data (Wajib)
        </button>

        <button
          onClick={() => setActiveTab('functions')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'functions'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Database className="w-4 h-4" />
          PostgreSQL Functions (Atomic)
        </button>

        <button
          onClick={() => setActiveTab('schema')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'schema'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          DDL Schema Tables
        </button>

        <button
          onClick={() => setActiveTab('rls')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'rls'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          RLS Security Policies
        </button>

        <button
          onClick={() => setActiveTab('location_stock')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'location_stock'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Database className="w-4 h-4" />
          Migrasi Lokasi Stok (Opsional)
        </button>

        <button
          onClick={() => setActiveTab('deployment')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'deployment'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Server className="w-4 h-4" />
          Panduan PM2 + Nginx Ubuntu
        </button>
      </div>
      )}

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed">
        SQL final membuat tabel stok Gudang, Toko, Reseller, Online, dan Barang Cacat. Lokasi Etalase lama dialihkan ke Toko. Saldo lama direset ke 0 hanya saat seluruh tabel lokasi masih kosong; setelah ada saldo lokasi, menjalankan ulang skrip tidak meresetnya. Kolom <code>barang.stok</code> otomatis menjadi jumlah seluruh lokasi.
      </div>

      {/* Code Container */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-mono">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>
              pantau_stok_final.sql (semua tabel, fungsi, policy, dan index)
            </span>
          </div>

          <button
            onClick={() => copyToClipboard(SQL_FINAL_SCRIPT, 'final')}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {copiedTab === 'final' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Salin Script</span>
              </>
            )}
          </button>
        </div>

        <div className="p-4 max-h-[600px] overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed">
          <pre className="whitespace-pre-wrap">
            {SQL_FINAL_SCRIPT}
          </pre>
        </div>
      </div>
    </div>
  );
};
