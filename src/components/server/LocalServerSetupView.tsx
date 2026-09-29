import React, { useState } from 'react';
import { 
  Server, 
  Wifi, 
  WifiOff, 
  Smartphone, 
  Monitor, 
  Network, 
  Download, 
  Copy, 
  Check, 
  ShieldCheck, 
  Zap, 
  Terminal, 
  Globe, 
  Layers,
  ArrowRight,
  ExternalLink,
  Laptop
} from 'lucide-react';
import { PWAInstallButton } from '../common/PWAInstallButton';

export const LocalServerSetupView: React.FC = () => {
  const [serverIp, setServerIp] = useState('192.168.88.10');
  const [serverPort, setServerPort] = useState('3000');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const localUrl = `http://${serverIp}:${serverPort}`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Download Windows 1-Click Server Runner .bat
  const downloadServerBatch = () => {
    const batchContent = `@echo off
title [SERVER UTAMA] Pantau Stok Multi-Saluran
color 0A
cls
echo ========================================================
echo       SERVER PANTAU STOK MULTI-SALURAN
echo    Solusi 5 Komputer (2 Online, 3 Offline) & HP
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [PERHATIAN] Komputer ini belum terpasang Node.js!
    echo Unduh dan install Node.js terlebih dahulu dari:
    echo -> https://nodejs.org (Pilih versi LTS)
    echo.
    pause
    exit /b
)

if not exist "package.json" (
    color 0C
    echo [PERHATIAN] File .bat ini harus berada di dalam folder proyek aplikasi!
    echo Pastikan Anda meletakkannya di folder yang ada file package.json.
    echo.
    pause
    exit /b
)

if not exist "node_modules" (
    echo [INFO] Memasang komponen aplikasi (npm install)...
    call npm install
)

echo [1/3] Mendeteksi IP Komputer Server Anda...
for /f "tokens=4" %%a in ('route print ^| find " 0.0.0.0 "') do set SERVER_IP=%%a
if "%SERVER_IP%"=="" set SERVER_IP=localhost
echo IP Komputer Server Anda adalah: %SERVER_IP%
echo.
echo [2/3] Membuat aplikasi dan menjalankan Server LAN di Port 3000...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build aplikasi gagal.
  pause
  exit /b 1
)
echo Komputer lain (offline) & HP cukup buka di browser:
echo -> http://%SERVER_IP%:3000
echo.
echo [3/3] Membuka aplikasi di komputer ini...
start http://localhost:3000
echo.
echo ========================================================
echo   JANGAN TUTUP JENDELA INI SELAMA TOKO BEROPERASI!
echo   (Server sedang melayani komputer kasir & HP)
echo ========================================================
call npm start
pause
`;
    const blob = new Blob([batchContent], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'JALANKAN_SERVER_PANTAU_STOK.bat';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download Windows Client Shortcut .bat for 3 Offline PCs
  const downloadClientBatch = () => {
    const batchContent = `@echo off
title Buka Pantau Stok Kasir / Gudang
color 0B
@set SERVER_IP=${serverIp}
if not "%~1"=="" set SERVER_IP=%~1
echo Menghubungkan ke Server Komputer Utama (%SERVER_IP%)...
start msedge --app=http://%SERVER_IP%:${serverPort} || start chrome --app=http://%SERVER_IP%:${serverPort} || start http://%SERVER_IP%:${serverPort}
exit
`;
    const blob = new Blob([batchContent], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'BUKA_KASIR_OFFLINE.bat';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download Cloudflare Tunnel Free Runner for remote HP access
  const downloadCloudflareBatch = () => {
    const batchContent = `@echo off
title Akses HP Dari Luar Toko (Cloudflare Tunnel Gratis)
color 0E
echo ========================================================
echo  MENGHUBUNGKAN SERVER KE INTERNET AGAR HP BISA PANTAU
echo  (Gratis, Aman, Tanpa Perlu Langganan IP Publik)
echo ========================================================
echo.
echo Menjalankan tunnel port 3000...
npx untun@latest tunnel http://localhost:3000
pause
`;
    const blob = new Blob([batchContent], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'AKSES_DARI_HP_LUAR_TOKO.bat';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Topologi Solusi 5 Komputer & Pantau HP
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Solusi Praktis: 5 PC (3 Offline, 2 Online) & HP
          </h1>
          <p className="text-sm text-indigo-100/90 leading-relaxed">
            Anda <strong>tidak perlu ribet</strong> berlangganan internet untuk semua komputer. Cukup 1 komputer utama dijadikan server lokal, 3 komputer kasir/gudang offline bisa mengakses lewat jaringan kabel LAN/WiFi toko, dan HP Anda bisa memantau stok dari mana saja.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <PWAInstallButton variant="hero" />
            <button
              onClick={downloadServerBatch}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 transition flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Download className="w-4 h-4" />
              Download Launcher Server 1-Klik (.bat)
            </button>
          </div>
        </div>

        {/* Decorative background grid */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
      </div>

      {/* Visual Topology Diagram Bento */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-600" />
            Bagan Cara Kerja Jaringan Anda
          </h2>
          <span className="text-xs font-semibold text-slate-500 bg-white px-3 py-1 rounded-xl border border-slate-200">
            1 Jaringan Router / WiFi Lokal
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Komputer Server (Online) */}
          <div className="bg-white p-5 rounded-3xl border-2 border-indigo-500/40 shadow-xs space-y-3 relative">
            <div className="absolute -top-3 left-4 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider">
              Komputer 1 (Utama)
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                <Server className="w-5 h-5" />
                SERVER LOKAL
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                <Wifi className="w-3 h-3 text-emerald-600" /> Ada Internet
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Komputer ini yang menjalankan aplikasi. Berperan sebagai pusat database dan melayani client komputer lainnya serta HP.
            </p>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-700 space-y-1">
              <div className="text-[11px] text-slate-400">Build dan jalankan server:</div>
              <div className="font-bold text-indigo-600">npm run build</div>
              <div className="font-bold text-indigo-600">npm start</div>
            </div>
          </div>

          {/* Card 2: 3 Komputer Offline */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3 relative">
            <div className="absolute -top-3 left-4 px-2.5 py-0.5 rounded-full bg-slate-700 text-white text-[10px] font-bold uppercase tracking-wider">
              Komputer 2, 3, 4 (Kasir / Gudang)
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Monitor className="w-5 h-5 text-slate-600" />
                PC OFFLINE
              </div>
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold flex items-center gap-1">
                <WifiOff className="w-3 h-3 text-rose-600" /> Tanpa Kuota
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cukup colok kabel LAN atau konek ke WiFi yang sama dengan Komputer 1. Buka browser atau PWA ke alamat IP Komputer 1.
            </p>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-700 space-y-1">
              <div className="text-[11px] text-slate-400">Buka alamat di browser:</div>
              <div className="font-bold text-emerald-600">{localUrl}</div>
            </div>
          </div>

          {/* Card 3: HP Pemilik & Komputer 5 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3 relative">
            <div className="absolute -top-3 left-4 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider">
              Komputer 5 & HP Pemilik
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Smartphone className="w-5 h-5 text-indigo-600" />
                HP
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold flex items-center gap-1">
                <Globe className="w-3 h-3 text-blue-600" /> Luar / Dalam Toko
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Di dalam toko: Konek WiFi toko & buka {localUrl}. Di luar toko: Akses lewat link cloud/tunnel aman yang disediakan server.
            </p>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="text-[11px] text-slate-400 font-mono">Format Aplikasi:</div>
              <div className="font-bold text-indigo-600">PWA (Tampil seperti App HP)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud user sync setup */}
      <section className="p-5 sm:p-6 bg-sky-50 border border-sky-200 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-sky-950 font-bold text-sm">
          <ShieldCheck className="w-4 h-4" />
          Sinkronisasi akun ke Supabase
        </div>
        <p className="text-xs text-sky-900 leading-relaxed">
          Di komputer server, simpan service-role key di file <code>.env</code> pada folder proyek, lalu jalankan ulang server:
        </p>
        <pre className="p-3 bg-white border border-sky-200 rounded-lg text-xs text-slate-800 overflow-x-auto">
          SUPABASE_SERVICE_ROLE_KEY=&lt;service_role_key&gt;
        </pre>
        <p className="text-xs text-sky-900 leading-relaxed">
          Gunakan key dari Supabase Project Settings, jangan memakai awalan <code>VITE_</code>, jangan bagikan atau commit file <code>.env</code>, dan pastikan SQL skema user sudah dijalankan. Login Admin aplikasi harus cocok dengan akun Admin di tabel <code>public.users</code>.
        </p>
      </section>

      {/* Simulator IP & Quick Launcher Generator */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Konfigurasi IP Komputer Server Anda
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Ketikkan IP Komputer Server Anda (cara cek: buka Command Prompt di PC Server, ketik <code>ipconfig</code>, lihat IPv4 Address).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Alamat IP Komputer Server (Komputer 1):
            </label>
            <input
              type="text"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              placeholder="Contoh: 192.168.1.100 atau 192.168.0.5"
              className="w-full px-4 py-2.5 text-xs font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Port Server:
            </label>
            <input
              type="text"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              className="w-full px-4 py-2.5 text-xs font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-indigo-950">
              Alamat URL yang dibuka oleh 3 PC Offline & HP di Toko:
            </div>
            <div className="font-mono text-sm font-extrabold text-indigo-600 mt-1 select-all">
              {localUrl}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(localUrl, 'local_url')}
              className="px-3.5 py-2 rounded-xl bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {copiedKey === 'local_url' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copiedKey === 'local_url' ? 'Tersalin!' : 'Salin URL'}
            </button>
            <button
              onClick={downloadClientBatch}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              Download File Shortcut Kasir (.bat)
            </button>
          </div>
        </div>
      </div>

      {/* 3 Step Simple Instructions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Step 1 */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
            1
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Nyalakan Server di Komputer 1</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Download file <code>JALANKAN_SERVER.bat</code> lalu letakkan di folder aplikasi pada Komputer 1. Cukup klik 2x file tersebut, server otomatis menyala di background.
          </p>
          <button
            onClick={downloadServerBatch}
            className="w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Ambil File JALANKAN_SERVER.bat
          </button>
        </div>

        {/* Step 2 */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
            2
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Pasang Jadi Aplikasi (PWA / Exe)</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Buka link di browser Chrome atau Edge pada komputer, lalu klik tombol <strong>Install Aplikasi</strong>. Aplikasi akan berubah menjadi window mandiri (seperti software .exe) dengan icon di desktop.
          </p>
          <PWAInstallButton variant="card" />
        </div>

        {/* Step 3 */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
            3
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Pantau dari HP di Luar Toko</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Bila Anda ingin memantau stok dari HP saat sedang di luar toko/di rumah, jalankan Cloudflare Tunnel gratis (tanpa biaya langganan IP publik).
          </p>
          <button
            onClick={downloadCloudflareBatch}
            className="w-full py-2 px-3 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Script Akses HP Luar Toko
          </button>
        </div>
      </div>

      {/* Troubleshooting localhost refused connection */}
      <div className="p-6 rounded-3xl bg-amber-50 border-2 border-amber-200 space-y-3">
        <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2">
          <span>⚠️</span> Muncul Pesan &quot;localhost menolak untuk terhubung&quot; (ERR_CONNECTION_REFUSED)?
        </h4>
        <div className="text-xs text-amber-950 space-y-2 leading-relaxed">
          <p>
            Pesan ini muncul karena kata <strong>localhost</strong> berarti <em>komputer Anda sendiri</em>. Jika di komputer Anda belum dijalankan server aplikasinya, Windows otomatis menolak sambungan.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-white/80 rounded-2xl border border-amber-200 space-y-1">
              <strong className="text-slate-900 text-xs block">Opsi A: Gunakan Cloud URL (Langsung Jalan, 0 Ribet)</strong>
              <p className="text-slate-600 text-[11px]">
                Aplikasi ini sudah aktif online di cloud! Anda tidak perlu install apapun di komputer:
              </p>
              <a
                href={window.location.origin}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-indigo-600 font-bold text-[11px] underline break-all mt-1"
              >
                {window.location.origin}
                <ExternalLink className="w-3 h-3 inline" />
              </a>
            </div>

            <div className="p-3.5 bg-white/80 rounded-2xl border border-amber-200 space-y-1">
              <strong className="text-slate-900 text-xs block">Opsi B: Jika Ingin Full Offline di Komputer Sendiri</strong>
              <p className="text-slate-600 text-[11px]">
                Pastikan komputer utama sudah terinstall <strong>Node.js</strong> dari <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-semibold">nodejs.org</a>, lalu jalankan file <code>JALANKAN_SERVER_PANTAU_STOK.bat</code> di folder aplikasi.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
