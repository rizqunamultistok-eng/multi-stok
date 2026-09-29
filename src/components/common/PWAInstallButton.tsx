import React, { useState } from 'react';
import { Download, Monitor, Smartphone, CheckCircle, HelpCircle, X, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'nav' | 'hero' | 'card' }> = ({ variant = 'nav' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;

  // If already running in standalone PWA window
  if (isInstalled) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-semibold">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
        <span className="hidden sm:inline">Aplikasi Terpasang (PWA)</span>
        <span className="sm:hidden">App PWA</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {variant === 'nav' ? (
        <button
          onClick={handleInstallClick}
          title="Install sebagai Aplikasi di Komputer / HP"
          aria-label="Install aplikasi Pantau Stok"
          className="flex h-10 w-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-0 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 hover:shadow-sm sm:h-auto sm:w-auto sm:rounded-full sm:px-3 sm:py-1.5"
        >
          <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">Install Aplikasi (PC / HP)</span>
        </button>
      ) : variant === 'card' ? (
        <button
          onClick={handleInstallClick}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <Download className="w-4 h-4" />
          Pasang Aplikasi Sekarang
        </button>
      ) : (
        <button
          onClick={handleInstallClick}
          className="px-5 py-2.5 rounded-2xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition flex items-center gap-2 cursor-pointer shadow-md hover:shadow-lg"
        >
          <Download className="w-4 h-4" />
          Install di Komputer & HP (PWA)
        </button>
      )}

      {/* Guide Modal for Desktop Chrome/Edge & Mobile iOS/Android */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Pasang Aplikasi Pantau Stok
                </h3>
                <p className="text-xs text-slate-500">
                  Berjalan seperti aplikasi komputer (.exe) & aplikasi HP tanpa install lewat Play Store
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {!isSecureContext && (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950">
                  <p className="font-bold">Alamat ini hanya bisa membuat pintasan, belum bisa memasang PWA.</p>
                  <p className="mt-1 leading-relaxed">
                    Anda membuka aplikasi melalui HTTP. Di Android, buka URL HTTPS dari tunnel untuk memasang aplikasi.
                    Jalankan server, lalu jalankan <strong>AKSES_DARI_HP_LUAR_TOKO.bat</strong> di komputer dan buka URL HTTPS yang ditampilkan.
                  </p>
                </div>
              )}

              {/* Option 1: Komputer (Chrome / Edge / Windows) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 mb-1.5">
                  <Monitor className="w-4 h-4 text-indigo-600" />
                  Di Komputer Windows / Mac:
                </div>
                <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>
                    Buka link aplikasi di <strong>Google Chrome</strong> atau <strong>Microsoft Edge</strong>.
                  </li>
                  <li>
                    Lihat di ujung kanan bar alamat URL atas (address bar), klik ikon <strong>Install / Pasang Aplikasi</strong> <span className="inline-block px-1.5 py-0.5 rounded bg-slate-200 font-mono text-[10px]">⊕</span>.
                  </li>
                  <li>
                    Klik <strong>Install</strong>. Aplikasi langsung muncul di Desktop & Taskbar tanpa bingkai browser!
                  </li>
                </ol>
              </div>

              {/* Option 2: HP Android / iPhone */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-950 mb-1.5">
                  <Smartphone className="w-4 h-4 text-indigo-600" />
                  Di HP (Android & iPhone):
                </div>
                <div className="text-xs text-slate-700 space-y-1.5">
                  <p>
                    <strong>Android (Chrome):</strong>{' '}
                    {isSecureContext
                      ? <>Tekan menu titik tiga <span className="font-mono">⋮</span>, lalu pilih <strong>&quot;Install aplikasi&quot;</strong>.</>
                      : <>Buka aplikasi melalui URL HTTPS terlebih dahulu. Menu <strong>&quot;Tambahkan ke Layar Utama&quot;</strong> pada alamat HTTP hanya membuat pintasan.</>}
                  </p>
                  <p>
                    <strong>iPhone (Safari):</strong> Tekan tombol <strong>Share</strong> (ikon kotak dengan panah atas), geser ke bawah, lalu tekan <strong>&quot;Add to Home Screen&quot; (Tambah ke Layar Utama)</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                💡 <strong>Tips Topologi 5 PC:</strong> Anda tidak butuh software tambahan yang ribet. Cukup jalankan server di 1 PC utama, lalu 4 PC lainnya & HP tinggal membuka alamat IP PC server tersebut!
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs cursor-pointer"
                >
                  Tutup Panduan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
