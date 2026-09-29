import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ClipboardCheck, 
  UploadCloud, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  FileSpreadsheet, 
  FileText, 
  History, 
  Search,
  Camera,
  CameraOff,
  Barcode,
  Save,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useInventory, getItemLocationStock } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { parseOpnameExcel, downloadExcelTemplate, exportToExcel } from '../../lib/excel';
import { OpnamePreviewItem, StockLocation } from '../../types';
import { Badge } from '../common/Badge';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Pagination } from '../common/Pagination';
import { LOCATION_THEME } from '../../lib/locationTheme';

const opnameLocations: { id: StockLocation; label: string }[] = [
  { id: 'gudang', label: 'Gudang' },
  { id: 'toko', label: 'Toko' },
  { id: 'reseller', label: 'Reseller' },
  { id: 'online', label: 'Online' },
  { id: 'cacat', label: 'Barang Cacat' },
];

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const OpnameView: React.FC = () => {
  const { barangList, opnameHistoryList, processOpname, opnameEnabled, setOpnameEnabled } = useInventory();
  const { currentUser, isAdmin, users } = useAuth();

  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewItems, setPreviewItems] = useState<OpnamePreviewItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null);
  const roleLocation = opnameLocations.some((location) => location.id === currentUser.role)
    ? currentUser.role as StockLocation
    : 'gudang';
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const usersByName = useMemo(() => new Map(users.map((user) => [user.name.trim().toLowerCase(), user])), [users]);
  const resolveHistoryUser = (item: typeof opnameHistoryList[number]) =>
    usersById.get(item.user_id) || usersByName.get(item.user_name.trim().toLowerCase());
  const resolveHistoryLocation = (item: typeof opnameHistoryList[number]): StockLocation | undefined => {
    if (item.lokasi && opnameLocations.some((location) => location.id === item.lokasi)) return item.lokasi;
    const role = item.user_role || resolveHistoryUser(item)?.role;
    return opnameLocations.some((location) => location.id === role) ? role as StockLocation : undefined;
  };
  const [selectedLocation, setSelectedLocation] = useState<StockLocation>(
    () => currentUser.role === 'admin' ? 'gudang' : roleLocation,
  );
  const selectedLocationTheme = LOCATION_THEME[selectedLocation];
  const [manualSearch, setManualSearch] = useState('');
  const [manualPage, setManualPage] = useState(1);
  const [manualPageSize, setManualPageSize] = useState(50);
  const [selectedManualItem, setSelectedManualItem] = useState<import('../../types').Barang | null>(null);
  const [countedQuantity, setCountedQuantity] = useState('');
  const [autoSaveManual, setAutoSaveManual] = useState(false);
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [manualResult, setManualResult] = useState<{ success: boolean; text: string } | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoSavedKeyRef = useRef('');
  const manualSaveLockRef = useRef(false);
  const barcodeHandlerRef = useRef<(code: string) => void>(() => {});

  useEffect(() => {
    if (currentUser.role !== 'admin') setSelectedLocation(roleLocation);
  }, [currentUser.role, roleLocation]);

  const filteredManualItems = useMemo(() => {
    const query = manualSearch.trim().toLowerCase();
    if (!query) return barangList;
    return barangList.filter((item) =>
      [item.kodebarang, item.kodebarcode, item.namabarang, item.merek]
        .some((value) => String(value || '').toLowerCase().includes(query)),
    );
  }, [barangList, manualSearch]);

  const manualTotalPages = Math.max(1, Math.ceil(filteredManualItems.length / manualPageSize));
  const paginatedManualItems = useMemo(() => {
    const start = (manualPage - 1) * manualPageSize;
    return filteredManualItems.slice(start, start + manualPageSize);
  }, [filteredManualItems, manualPage, manualPageSize]);

  useEffect(() => {
    setManualPage(1);
  }, [manualSearch, manualPageSize]);

  const selectManualItem = (item: import('../../types').Barang) => {
    setSelectedManualItem(item);
    setCountedQuantity('');
    setManualResult(null);
    autoSavedKeyRef.current = '';
  };

  const handleBarcode = (code: string) => {
    setManualSearch(code);
    const normalizedCode = code.trim().toLowerCase();
    const found = barangList.find((item) =>
      item.kodebarcode.toLowerCase() === normalizedCode || item.kodebarang.toLowerCase() === normalizedCode,
    );
    if (found) {
      selectManualItem(found);
      setManualResult({ success: true, text: `${found.namabarang} dipilih dari hasil scan.` });
    } else {
      setSelectedManualItem(null);
      setManualResult({ success: false, text: `Barcode/SKU ${code} tidak ditemukan.` });
    }
  };
  barcodeHandlerRef.current = handleBarcode;

  useEffect(() => {
    if (!isCameraOpen) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let scannerControls: { stop: () => void } | null = null;
    void import('@zxing/browser').then(async ({ BrowserMultiFormatReader }) => {
      if (cancelled) return;
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(undefined, video, (result, _error, callbackControls) => {
        scannerControls = callbackControls;
        if (!result || cancelled) return;
        callbackControls.stop();
        setIsCameraOpen(false);
        barcodeHandlerRef.current(result.getText());
      });
      scannerControls = controls;
      if (cancelled) controls.stop();
    }).catch(() => {
      if (cancelled) return;
      setCameraError('Kamera tidak dapat dibuka. Izinkan akses kamera dan gunakan HTTPS atau localhost.');
      setIsCameraOpen(false);
    });

    return () => {
      cancelled = true;
      scannerControls?.stop();
    };
  }, [isCameraOpen]);

  const saveManualCount = async (automatic = false) => {
    if (!selectedManualItem || countedQuantity.trim() === '' || manualSaveLockRef.current) return;
    const quantity = Number(countedQuantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setManualResult({ success: false, text: 'Jumlah stok harus bilangan bulat nol atau lebih.' });
      return;
    }

    const saveKey = `${selectedManualItem.kodebarang}:${selectedLocation}:${quantity}`;
    if (autoSavedKeyRef.current === saveKey) return;

    manualSaveLockRef.current = true;
    setIsManualSaving(true);
    const result = await processOpname(
      [{ kodebarang: selectedManualItem.kodebarang, stok_fisik: quantity }],
      `Opname manual - ${currentUser.name}`,
      selectedLocation,
    );
    manualSaveLockRef.current = false;
    setIsManualSaving(false);
    if (result.success) {
      autoSavedKeyRef.current = saveKey;
      setManualResult({
        success: true,
        text: `${selectedManualItem.namabarang}: stok ${quantity} tersimpan${automatic ? ' otomatis' : ''}.`,
      });
    } else {
      setManualResult({ success: false, text: 'Opname hanya boleh menambah stok; angka fisik tidak boleh lebih rendah dari stok sistem.' });
    }
  };

  const handleManualSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = manualSearch.trim().toLowerCase();
    if (!query) return;
    const exactMatch = barangList.find((item) =>
      item.kodebarang.toLowerCase() === query || item.kodebarcode.toLowerCase() === query,
    );
    if (exactMatch) selectManualItem(exactMatch);
  };

  // Statistics
  const stats = useMemo(() => {
    const total = previewItems.length;
    const valid = previewItems.filter((i) => i.status === 'valid').length;
    const notFound = previewItems.filter((i) => i.status === 'tidak_ditemukan').length;
    const selisihCount = previewItems.filter((i) => i.status === 'valid' && i.selisih !== 0).length;
    const totalSelisihQty = previewItems
      .filter((i) => i.status === 'valid')
      .reduce((acc, curr) => acc + curr.selisih, 0);

    return { total, valid, notFound, selisihCount, totalSelisihQty };
  }, [previewItems]);
  const hasOpnameDecrease = previewItems.some((item) => item.status === 'valid' && item.selisih < 0);

  // Pagination for Preview (25, 50, 100, 150, 200)
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25);

  useEffect(() => {
    setPreviewPage(1);
  }, [previewItems.length, previewPageSize]);

  const paginatedPreview = useMemo(() => {
    const start = (previewPage - 1) * previewPageSize;
    return previewItems.slice(start, start + previewPageSize);
  }, [previewItems, previewPage, previewPageSize]);

  // Pagination for History (25, 50, 100, 150, 200)
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [historyLocation, setHistoryLocation] = useState<'all' | StockLocation>('all');
  const [historyStartDate, setHistoryStartDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [historyEndDate, setHistoryEndDate] = useState(() => formatDateInput(new Date()));
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  useEffect(() => {
    setHistoryPage(1);
  }, [opnameHistoryList.length, historyPageSize, currentUser.role, users.length, historyLocation, historyStartDate, historyEndDate]);

  const visibleHistory = opnameHistoryList.filter((item) => {
    const location = resolveHistoryLocation(item);
    const locationMatches = isAdmin
      ? historyLocation === 'all' || location === historyLocation
      : location === roleLocation;
    const recordDate = item.created_at.slice(0, 10);
    return locationMatches
      && (!historyStartDate || recordDate >= historyStartDate)
      && (!historyEndDate || recordDate <= historyEndDate);
  });

  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return visibleHistory.slice(start, start + historyPageSize);
  }, [visibleHistory, historyPage, historyPageSize]);

  const exportHistoryReport = () => {
    const report = visibleHistory.map((item) => ({
      Tanggal: new Date(item.created_at).toLocaleString('id-ID'),
      Petugas: item.user_name,
      Lokasi: opnameLocations.find((location) => location.id === resolveHistoryLocation(item))?.label || '-',
      Sumber: item.file_name,
      'Total Diproses': item.total_proses,
      Sesuai: item.total_sesuai,
      Selisih: item.total_selisih,
      Status: item.status.toUpperCase(),
    }));
    const locationPart = historyLocation === 'all' ? 'semua_lokasi' : historyLocation;
    exportToExcel(report, `laporan_opname_${locationPart}_${historyStartDate || 'awal'}_${historyEndDate || 'akhir'}`);
  };

  const toggleOpnameAccess = async () => {
    setIsSavingAccess(true);
    const result = await setOpnameEnabled(!opnameEnabled);
    setIsSavingAccess(false);
    setResultMsg({
      success: result.success,
      text: result.success
        ? `Menu stock opname ${opnameEnabled ? 'ditutup' : 'dibuka'} untuk pengguna lokasi.`
        : result.message || 'Pengaturan akses opname gagal disimpan.',
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsProcessing(true);
    setResultMsg(null);

    try {
      const items = await parseOpnameExcel(file, barangList, selectedLocation);
      setPreviewItems(items);
    } catch {
      setResultMsg({
        success: false,
        text: 'Gagal memproses file Excel. Pastikan format kolom: kodebarang, stok',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLocationChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const location = event.target.value as StockLocation;
    setSelectedLocation(location);
    setSelectedManualItem(null);
    setCountedQuantity('');
    setManualResult(null);
    autoSavedKeyRef.current = '';
    if (!selectedFile) return;
    setIsProcessing(true);
    try {
      setPreviewItems(await parseOpnameExcel(selectedFile, barangList, location));
    } catch {
      setResultMsg({ success: false, text: 'Gagal menghitung ulang preview opname untuk lokasi tersebut.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitOpname = async () => {
    if (!selectedFile) return;
    setIsExecuting(true);

    const validPayload = previewItems
      .filter((i) => i.status === 'valid')
      .map((i) => ({
        kodebarang: i.kodebarang,
        stok_fisik: i.stok_fisik,
      }));

    const result = await processOpname(validPayload, selectedFile.name, selectedLocation);
    setIsExecuting(false);
    setIsConfirmOpen(false);

    if (result.success) {
      setResultMsg({
        success: true,
        text: `Opname berhasil! ${result.totalProses} item diproses, ${result.totalSelisih} item disesuaikan stoknya.`,
      });
      setSelectedFile(null);
      setPreviewItems([]);
    } else {
      setResultMsg({
        success: false,
        text: 'Terjadi kesalahan saat memproses data opname.',
      });
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className={`w-6 h-6 ${selectedLocationTheme.text}`} />
            Stock Opname
          </h1>
          <p className="text-xs text-slate-500 mt-1">
              Penyesuaian stok fisik dengan template 2 kolom: <code>kodebarang</code> dan <code>stok</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={opnameEnabled} disabled={isSavingAccess} onChange={() => void toggleOpnameAccess()} className="h-4 w-4 accent-teal-700" />
              {isSavingAccess ? 'Menyimpan...' : 'Menu opname dibuka'}
            </label>
          )}
          {(isAdmin || opnameEnabled) && (
            <>
              <button onClick={() => setActiveTab('upload')} className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors ${activeTab === 'upload' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}>
                Opname Manual & Excel
              </button>
              <button onClick={() => setActiveTab('history')} className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}>
                <History className="w-4 h-4" /> Riwayat Opname ({visibleHistory.length})
              </button>
            </>
          )}
        </div>
      </div>

      {!isAdmin && !opnameEnabled && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Menu stock opname sedang ditutup oleh Admin.
        </div>
      )}

      {resultMsg && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            resultMsg.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {resultMsg.success ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="text-xs font-semibold">{resultMsg.text}</span>
        </div>
      )}

      {/* VIEW: UPLOAD */}
      {(isAdmin || opnameEnabled) && activeTab === 'upload' && (
        <div className="space-y-6">
          {/* Instructions Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">
                Panduan Upload Stock Opname
              </h3>
              <p className="text-xs text-slate-600 max-w-2xl">
                Isi 2 kolom pada template: <strong>kodebarang</strong> dan <strong>stok</strong> fisik.
              </p>
            </div>
            {isAdmin && (
              <label className="sr-only" htmlFor="opname-location">Lokasi opname</label>
            )}
            {isAdmin && (
              <select
                id="opname-location"
                aria-label="Lokasi opname"
                value={selectedLocation}
                onChange={handleLocationChange}
                className={`min-h-10 min-w-44 rounded-lg border px-3 py-2 text-xs font-semibold ${selectedLocationTheme.softBg} ${selectedLocationTheme.text} ${selectedLocationTheme.border}`}
              >
                  {opnameLocations.map((location) => (
                    <option key={location.id} value={location.id}>{location.label}</option>
                  ))}
              </select>
            )}
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center lg:ml-auto">
              {!previewItems.length && (
                <div className="min-w-0 flex-1 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5">
                  <input
                    type="file"
                    id="opname-upload"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="opname-upload" className="flex min-h-11 cursor-pointer items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-800">Pilih File Excel Hasil Stock Opname Fisik</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">.xlsx, .xls, .csv · kodebarang, stok</span>
                    </span>
                    <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white">Pilih File</span>
                  </label>
                </div>
              )}
              <button
                type="button"
                onClick={() => downloadExcelTemplate('opname')}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 shadow-2xs transition-colors hover:bg-blue-50"
              >
                <Download className="h-4 w-4 text-blue-600" />
                Download Template Opname
              </button>
            </div>
          </div>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Opname Manual</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Klik barang, masukkan jumlah fisik, lalu simpan.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSaveManual}
                    onChange={(event) => setAutoSaveManual(event.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
                  Simpan otomatis
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCameraError('');
                    setIsCameraOpen((open) => !open);
                  }}
                  className="px-3 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-700 rounded-xl inline-flex items-center gap-1.5"
                >
                  {isCameraOpen ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                  {isCameraOpen ? 'Tutup Kamera' : 'Scan Kamera'}
                </button>
              </div>
            </div>

            {cameraError && <p role="alert" className="text-xs text-rose-700">{cameraError}</p>}
            {isCameraOpen && (
              <div className="max-w-xl overflow-hidden rounded-xl bg-slate-950">
                <video ref={videoRef} className="w-full max-h-72 object-contain" muted playsInline />
              </div>
            )}

            <form onSubmit={handleManualSearchSubmit} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="search"
                  value={manualSearch}
                  onChange={(event) => setManualSearch(event.target.value)}
                  placeholder="Cari nama, SKU, atau scan barcode USB..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center justify-center gap-1.5">
                <Barcode className="w-4 h-4" /> Cari / Scan USB
              </button>
            </form>

            {manualResult && (
              <p role="status" className={`text-xs font-semibold ${manualResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                {manualResult.text}
              </p>
            )}

            {selectedManualItem && (
              <div className={`grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] items-end gap-3 p-3 rounded-xl border ${selectedLocationTheme.softBg} ${selectedLocationTheme.border}`}>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{selectedManualItem.namabarang}</div>
                  <div className="text-[11px] font-mono text-slate-500">{selectedManualItem.kodebarang} · Stok lokasi: {getItemLocationStock(selectedManualItem, selectedLocation)}</div>
                </div>
                <label className="text-[11px] font-bold text-slate-700">
                  Jumlah fisik
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={countedQuantity}
                    onChange={(event) => {
                      setCountedQuantity(event.target.value);
                      autoSavedKeyRef.current = '';
                    }}
                    onBlur={() => {
                      if (autoSaveManual) void saveManualCount(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="Isi hasil hitung"
                    className="mt-1 w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveManualCount()}
                  disabled={isManualSaving || countedQuantity.trim() === ''}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl inline-flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" /> {isManualSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>{filteredManualItems.length.toLocaleString('id-ID')} dari {barangList.length.toLocaleString('id-ID')} barang</span>
              <label className="inline-flex items-center gap-2">
                Baris
                <select
                  value={manualPageSize}
                  onChange={(event) => setManualPageSize(Number(event.target.value))}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg"
                >
                  {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>

            <div className="overflow-auto max-h-[28rem] border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 font-bold">
                  <tr>
                    <th className="px-3 py-2.5">Kode / Barcode</th>
                    <th className="px-3 py-2.5">Nama Barang</th>
                    <th className="px-3 py-2.5 text-right">Stok {opnameLocations.find((location) => location.id === selectedLocation)?.label}</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedManualItems.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Barang tidak ditemukan.</td></tr>
                  ) : paginatedManualItems.map((item) => (
                    <tr
                      key={item.kodebarang}
                      tabIndex={0}
                      aria-selected={selectedManualItem?.kodebarang === item.kodebarang}
                      onClick={() => selectManualItem(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectManualItem(item);
                        }
                      }}
                      className={`cursor-pointer outline-none hover:bg-blue-50 focus:bg-blue-50 ${selectedManualItem?.kodebarang === item.kodebarang ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-3 py-2 font-mono text-slate-600">{item.kodebarang}<div className="text-[10px] text-slate-400">{item.kodebarcode}</div></td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{item.namabarang}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{getItemLocationStock(item, selectedLocation)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{item.stok}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={manualPage}
              totalItems={filteredManualItems.length}
              pageSize={manualPageSize}
              pageSizeOptions={[25, 50, 100]}
              onPageChange={setManualPage}
              onPageSizeChange={setManualPageSize}
              itemName="barang"
            />
          </section>

          {previewItems.length > 0 && (
            /* PREVIEW TABLE WITH HIGHLIGHTS */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Pratinjau Hasil Opname: {selectedFile?.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {stats.total} baris dibaca ({stats.valid} valid, {stats.notFound} tidak ditemukan)
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewItems([]);
                  }}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Batal & Upload Ulang
                </button>
              </div>

              {/* Status metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] text-slate-500">Total Baris</div>
                  <div className="text-lg font-bold text-slate-900">{stats.total}</div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-[11px] text-emerald-700">Barang Cocok di DB</div>
                  <div className="text-lg font-bold text-emerald-700">{stats.valid}</div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="text-[11px] text-blue-700">Ada Selisih Stok</div>
                  <div className="text-lg font-bold text-blue-700">{stats.selisihCount} Item</div>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <div className="text-[11px] text-rose-700">Tidak Terdaftar (Merah)</div>
                  <div className="text-lg font-bold text-rose-700">{stats.notFound}</div>
                </div>
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Kode Barang</th>
                      <th className="py-2.5 px-3">Nama Barang</th>
                      <th className="py-2.5 px-3 text-right">Harga Jual</th>
                      <th className="py-2.5 px-3 text-right">Stok Lokasi Saat Ini</th>
                      <th className="py-2.5 px-3 text-right">Stok Fisik Opname</th>
                      <th className="py-2.5 px-3 text-right">Selisih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedPreview.map((item, idx) => {
                      const isNotFound = item.status === 'tidak_ditemukan';
                      const isSelisih = item.selisih !== 0;

                      return (
                        <tr
                          key={idx}
                          className={`${
                            isNotFound
                              ? 'bg-rose-50/80 text-rose-950 font-semibold'
                              : isSelisih
                              ? 'bg-blue-50/40 hover:bg-blue-50/80'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <Badge
                              size="sm"
                              variant={isNotFound ? 'danger' : isSelisih ? 'warning' : 'success'}
                            >
                              {isNotFound ? 'Tidak Ada di DB' : isSelisih ? 'Ada Selisih' : 'Sesuai'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">{item.kodebarang}</td>
                          <td className="py-2.5 px-3">
                            {item.barang_exist ? item.barang_exist.namabarang : 'KODE TIDAK TERDAFTAR'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            {item.barang_exist
                              ? item.barang_exist.hargajual.toLocaleString('id-ID')
                              : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            {item.barang_exist ? item.barang_exist.stok_lokasi?.[selectedLocation] ?? (item.barang_exist.lokasi === selectedLocation ? item.barang_exist.stok : 0) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {item.stok_fisik}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            {isNotFound ? (
                              '-'
                            ) : item.selisih > 0 ? (
                              <span className="text-emerald-600 flex items-center justify-end gap-0.5">
                                <TrendingUp className="w-3.5 h-3.5" /> +{item.selisih}
                              </span>
                            ) : item.selisih < 0 ? (
                              <span className="text-rose-600 flex items-center justify-end gap-0.5">
                                <TrendingDown className="w-3.5 h-3.5" /> {item.selisih}
                              </span>
                            ) : (
                              <span className="text-slate-400">0 (Pas)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {previewItems.length > 25 && (
                <Pagination
                  currentPage={previewPage}
                  totalItems={previewItems.length}
                  pageSize={previewPageSize}
                  pageSizeOptions={[25, 50, 100, 150, 200]}
                  onPageChange={setPreviewPage}
                  onPageSizeChange={setPreviewPageSize}
                  itemName="item opname"
                />
              )}

              {/* Action */}
              {hasOpnameDecrease && (
                <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Opname hanya dapat menambah stok. Koreksi yang mengurangi stok harus dicatat melalui retur atau proses penjualan yang sesuai.
                </p>
              )}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewItems([]);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Batal
                </button>
                <button
                  onClick={() => setIsConfirmOpen(true)}
                  disabled={stats.valid === 0 || isExecuting || hasOpnameDecrease}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Terapkan Hasil Opname ({stats.valid} Item)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: RIWAYAT OPNAME */}
      {(isAdmin || opnameEnabled) && activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Stock Opname
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="text-[11px] whitespace-nowrap">Per Halaman:</span>
              <select
                value={historyPageSize}
                onChange={(e) => {
                  setHistoryPageSize(Number(e.target.value));
                  setHistoryPage(1);
                }}
                className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={150}>150</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {isAdmin && (
              <label className="text-[11px] font-semibold text-slate-600">
                Lokasi laporan
                <select value={historyLocation} onChange={(event) => setHistoryLocation(event.target.value as 'all' | StockLocation)} className="mt-1 block min-w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800">
                  <option value="all">Semua lokasi</option>
                  {opnameLocations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
                </select>
              </label>
            )}
            <label className="text-[11px] font-semibold text-slate-600">Dari tanggal<input type="date" value={historyStartDate} onChange={(event) => setHistoryStartDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800" /></label>
            <label className="text-[11px] font-semibold text-slate-600">Sampai tanggal<input type="date" value={historyEndDate} onChange={(event) => setHistoryEndDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800" /></label>
            <button type="button" onClick={exportHistoryReport} disabled={visibleHistory.length === 0} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /> Unduh Laporan</button>
            <span className="ml-auto pb-2 text-[11px] text-slate-500">{visibleHistory.length} catatan</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">Petugas</th>
                  <th className="p-3">Lokasi</th>
                  <th className="p-3">Sumber</th>
                  <th className="p-3 text-right">Total Diproses</th>
                  <th className="p-3 text-right">Sesuai</th>
                  <th className="p-3 text-right">Selisih</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      Belum ada riwayat opname.
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">{item.user_name}</td>
                      <td className="p-3">{opnameLocations.find((location) => location.id === resolveHistoryLocation(item))?.label || '-'}</td>
                      <td className="p-3 font-mono text-slate-700">{item.file_name}</td>
                      <td className="p-3 text-right font-bold text-slate-900">{item.total_proses}</td>
                      <td className="p-3 text-right text-emerald-600 font-semibold">{item.total_sesuai}</td>
                      <td className="p-3 text-right text-rose-600 font-semibold">{item.total_selisih}</td>
                      <td className="p-3 text-center">
                        <Badge size="sm" variant="success">
                          {item.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <Pagination
            currentPage={historyPage}
            totalItems={visibleHistory.length}
            pageSize={historyPageSize}
            pageSizeOptions={[25, 50, 100, 150, 200]}
            onPageChange={setHistoryPage}
            onPageSizeChange={setHistoryPageSize}
            itemName="riwayat opname"
          />
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleCommitOpname}
        title="Terapkan Hasil Stock Opname"
        message={`Apakah Anda yakin ingin memperbarui stok ${selectedLocation} untuk ${stats.valid} item sesuai hasil opname fisik?\n\nTotal stok barang akan dihitung dari seluruh lokasi.`}
        confirmText="Ya, Terapkan Opname"
        type="primary"
        isLoading={isExecuting}
      />
    </div>
  );
};
