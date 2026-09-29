import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Calendar, 
  DollarSign, 
  Package, 
  Receipt,
  FileCheck2,
  Trash2,
  Search,
  Filter,
  ArrowDownToLine
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { parseKasirPenjualanExcel, downloadExcelTemplate, exportToExcel } from '../../lib/excel';
import { sound } from '../../lib/sound';
import { KasirUploadPreviewItem, getCashierSalesLocation } from '../../types';
import { Badge } from '../common/Badge';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Pagination } from '../common/Pagination';

interface KasirDashboardProps {
  initialView?: 'upload' | 'history';
}

export const KasirDashboard: React.FC<KasirDashboardProps> = ({ initialView = 'upload' }) => {
  const { currentUser } = useAuth();
  const { barangList, penjualanList, processKasirPenjualan } = useInventory();

  const [activeTab, setActiveTab] = useState<'upload' | 'history'>(initialView);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewItems, setPreviewItems] = useState<KasirUploadPreviewItem[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const submitLockRef = useRef(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [keteranganInput, setKeteranganInput] = useState('');
  const salesLocation = getCashierSalesLocation(currentUser.role) || 'toko';
  const salesLocationLabel = {
    toko: 'Toko',
    online: 'Online',
    reseller: 'Reseller',
    cacat: 'Barang Cacat',
  }[salesLocation];

  // History filters
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  // Daily sales totals
  const mySalesToday = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return penjualanList.filter((p) => {
      const matchUser = p.user_id === currentUser.id;
      const matchDate = p.created_at.startsWith(todayStr);
      return matchUser && matchDate;
    });
  }, [penjualanList, currentUser.id]);

  const totalOmsetToday = useMemo(() => {
    return mySalesToday.reduce((acc, curr) => acc + curr.total_nilai, 0);
  }, [mySalesToday]);

  const totalItemTerjualToday = useMemo(() => {
    return mySalesToday.reduce((acc, curr) => acc + curr.jumlah_terjual, 0);
  }, [mySalesToday]);

  // Preview Analysis
  const previewStats = useMemo(() => {
    const total = previewItems.length;
    const valid = previewItems.filter((i) => i.status === 'valid').length;
    const notFound = previewItems.filter((i) => i.status === 'tidak_ditemukan').length;
    const insufficientStock = previewItems.filter((i) => i.status === 'stok_kurang').length;
    const totalQuantity = previewItems
      .filter((i) => i.status === 'valid')
      .reduce((acc, curr) => acc + curr.jumlah_terjual, 0);
    const totalOmset = previewItems
      .filter((i) => i.status === 'valid')
      .reduce((acc, curr) => acc + curr.total_nilai, 0);

    const hasErrors = notFound > 0 || insufficientStock > 0;

    return { total, valid, notFound, insufficientStock, totalQuantity, totalOmset, hasErrors };
  }, [previewItems]);

  // Handle File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsProcessingFile(true);
    setExecutionResult(null);

    try {
      const items = await parseKasirPenjualanExcel(file, barangList, salesLocation);
      setPreviewItems(items);

      const hasInvalid = items.some((i) => i.status !== 'valid');
      if (hasInvalid) {
        sound.playErrorBeep();
      } else {
        sound.playScannerBeep();
      }
    } catch {
      sound.playErrorBeep();
      setExecutionResult({
        success: false,
        message: 'Gagal membaca file Excel. Pastikan format kolom: kodebarang, jumlah_terjual',
      });
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsProcessingFile(true);
    setExecutionResult(null);

    try {
      const items = await parseKasirPenjualanExcel(file, barangList, salesLocation);
      setPreviewItems(items);

      const hasInvalid = items.some((i) => i.status !== 'valid');
      if (hasInvalid) {
        sound.playErrorBeep();
      } else {
        sound.playScannerBeep();
      }
    } catch {
      sound.playErrorBeep();
      setExecutionResult({
        success: false,
        message: 'Gagal memproses file Excel yang di-drop.',
      });
    } finally {
      setIsProcessingFile(false);
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setPreviewItems([]);
    setExecutionResult(null);
    setKeteranganInput('');
  };

  // Submit and commit
  const handleConfirmSubmit = async () => {
    if (submitLockRef.current) return;
    if (previewStats.hasErrors) {
      sound.playErrorBeep();
      return;
    }

    submitLockRef.current = true;
    setIsExecuting(true);
    const validPayload = previewItems.map((item) => ({
      kodebarang: item.kodebarang,
      jumlah_terjual: item.jumlah_terjual,
    }));

    const result = await processKasirPenjualan(
      validPayload,
      keteranganInput || `Upload Excel: ${selectedFile?.name || 'Kasir POS'}`
    );

    submitLockRef.current = false;
    setIsExecuting(false);
    setIsConfirmOpen(false);
    setExecutionResult(result);

    if (result.success) {
      resetUpload();
    }
  };

  // History filtering for logged in cashier only
  const filteredMyHistory = useMemo(() => {
    return penjualanList.filter((p) => {
      const isMine = p.user_id === currentUser.id;
      if (!isMine) return false;

      const matchSearch =
        !historySearch ||
        p.kodebarang.toLowerCase().includes(historySearch.toLowerCase()) ||
        p.namabarang.toLowerCase().includes(historySearch.toLowerCase()) ||
        (p.keterangan && p.keterangan.toLowerCase().includes(historySearch.toLowerCase()));

      const matchDate =
        !historyDateFilter || p.created_at.startsWith(historyDateFilter);

      return matchSearch && matchDate;
    });
  }, [penjualanList, currentUser.id, historySearch, historyDateFilter]);

  // Pagination for Riwayat Penjualan Kasir (25, 50, 100, 150, 200 per page)
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historyDateFilter, historyPageSize]);

  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return filteredMyHistory.slice(start, start + historyPageSize);
  }, [filteredMyHistory, historyPage, historyPageSize]);

  // Pagination for Preview Table
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25);

  useEffect(() => {
    setPreviewPage(1);
  }, [previewItems.length, previewPageSize]);

  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    parseKasirPenjualanExcel(selectedFile, barangList, salesLocation)
      .then((items) => {
        if (!cancelled) setPreviewItems(items);
      })
      .catch(() => {
        if (!cancelled) setExecutionResult({ success: false, message: 'Preview penjualan gagal dihitung ulang.' });
      });
    return () => {
      cancelled = true;
    };
  }, [salesLocation]);

  const paginatedPreview = useMemo(() => {
    const start = (previewPage - 1) * previewPageSize;
    return previewItems.slice(start, start + previewPageSize);
  }, [previewItems, previewPage, previewPageSize]);

  const exportMyHistory = () => {
    const data = filteredMyHistory.map((h, i) => ({
      No: i + 1,
      Tanggal: new Date(h.created_at).toLocaleString('id-ID'),
      'Kode Barang': h.kodebarang,
      'Nama Barang': h.namabarang,
      'Jumlah Terjual': h.jumlah_terjual,
      'Harga Jual': h.hargajual,
      'Total Nilai (Rp)': h.total_nilai,
      Lokasi: h.lokasi || '-',
      Keterangan: h.keterangan || '-',
    }));
    exportToExcel(data, `Riwayat_Penjualan_${currentUser.name.replace(/\s+/g, '_')}`);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. Kasir Header & Banner (Bento Style) */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-md border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                Point of Sale Terminal
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              Kasir: {currentUser.name}
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>

          {/* Daily sales metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-800/70 p-3 rounded-2xl border border-slate-700/60 backdrop-blur-xs">
            <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Transaksi Hari Ini</div>
              <div className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-1 mt-0.5">
                <Receipt className="w-4 h-4 text-indigo-400" />
                {mySalesToday.length}
              </div>
            </div>
            <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Terjual (Pcs)</div>
              <div className="text-lg sm:text-xl font-extrabold text-amber-400 flex items-center gap-1 mt-0.5">
                <Package className="w-4 h-4 text-amber-400" />
                {totalItemTerjualToday.toLocaleString('id-ID')}
              </div>
            </div>
            <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Omset Hari Ini</div>
              <div className="text-lg sm:text-xl font-extrabold text-emerald-400 mt-0.5">
                Rp {totalOmsetToday.toLocaleString('id-ID')}
              </div>
            </div>
          </div>
        </div>

        {/* Decorative circle glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        {/* Tab Toggle Buttons */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-800 relative z-10">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            Upload Penjualan (Excel 2 Kolom)
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Riwayat Penjualan Saya ({penjualanList.filter((p) => p.user_id === currentUser.id).length})
          </button>
        </div>
      </div>

      {/* 2. Feedback Messages */}
      {executionResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in duration-200 ${
            executionResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {executionResult.success ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm font-medium">
            {executionResult.message}
          </div>
          <button
            onClick={() => setExecutionResult(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 3. VIEW: UPLOAD PENJUALAN EXCEL */}
      {activeTab === 'upload' && (
        <div className="space-y-6">
          {/* Instructions & Template Download */}
          <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-700" />
                <h3 className="text-sm font-bold text-indigo-950">
                  Format Upload File Penjualan Kasir (2 Kolom)
                </h3>
              </div>
              <p className="text-xs text-indigo-800 leading-relaxed max-w-2xl">
                Sistem hanya membutuhkan 2 kolom: <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded-md border border-indigo-200 text-indigo-900">kodebarang</span> dan <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded-md border border-indigo-200 text-indigo-900">jumlah_terjual</span>. Sistem akan otomatis memvalidasi stok database, menghitung harga jual, mengurangi stok secara atomic, dan mencatat tanggal serta waktu penjualan.
              </p>
            </div>
            <button
              onClick={() => downloadExcelTemplate('kasir_penjualan')}
              className="px-4 py-2.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors shadow-2xs flex items-center gap-2 shrink-0"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              Download Template Excel (.xlsx)
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-xs font-bold text-slate-800">Lokasi penjualan akun</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Lokasi ditentukan otomatis berdasarkan role kasir.</p>
            </div>
            <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${salesLocation === 'cacat' ? 'bg-rose-100 text-rose-800' : 'bg-indigo-50 text-indigo-800'}`}>
              {salesLocationLabel}
            </span>
          </div>

          {/* Upload Dropzone Area */}
          {!previewItems.length ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/20 rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer group shadow-xs"
            >
              <input
                type="file"
                id="kasir-excel-upload"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="kasir-excel-upload"
                className="cursor-pointer flex flex-col items-center justify-center gap-3"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 group-hover:scale-105 transition-all shadow-xs flex items-center justify-center text-indigo-600">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800 group-hover:text-indigo-700">
                    Klik atau Seret (Drag & Drop) File Excel Penjualan ke Sini
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Mendukung format Microsoft Excel (.xlsx, .xls) & CSV
                  </p>
                </div>
                <div className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors">
                  <FileSpreadsheet className="w-4 h-4" />
                  Pilih File dari Komputer
                </div>
              </label>
            </div>
          ) : (
            /* PREVIEW TABLE WITH VALIDATION & HIGHLIGHTS */
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-6">
              {/* Header Info of the File */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                    <FileCheck2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Pratinjau Upload: {selectedFile?.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Total {previewItems.length} baris barang dibaca dari Excel
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={resetUpload}
                    className="px-3.5 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Batal & Upload Ulang
                  </button>
                </div>
              </div>

              {/* Status Alert Pills / Summary Bento Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Baris</div>
                  <div className="text-xl font-extrabold text-slate-800 mt-0.5">{previewStats.total}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Valid & Siap Potong</div>
                  <div className="text-xl font-extrabold text-emerald-700 mt-0.5">{previewStats.valid}</div>
                </div>
                <div className={`p-3.5 rounded-2xl border ${previewStats.notFound > 0 ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider">Tidak Ditemukan</div>
                  <div className="text-xl font-extrabold mt-0.5">{previewStats.notFound}</div>
                </div>
                <div className={`p-3.5 rounded-2xl border ${previewStats.insufficientStock > 0 ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider">Stok Kurang</div>
                  <div className="text-xl font-extrabold mt-0.5">{previewStats.insufficientStock}</div>
                </div>
              </div>

              {/* Warnings if any */}
              {previewStats.hasErrors && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Perhatian:</span> Ditemukan {previewStats.notFound} barang tidak terdaftar atau {previewStats.insufficientStock} barang dengan stok tidak mencukupi. Anda harus memperbaiki file Excel terlebih dahulu sebelum dapat mengeksekusi pemotongan stok.
                  </div>
                </div>
              )}

              {/* Table Preview */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3.5">Status</th>
                      <th className="py-3 px-3.5">Kode Barang</th>
                      <th className="py-3 px-3.5">Nama Barang di Database</th>
                      <th className="py-3 px-3.5 text-right">Jumlah Terjual</th>
                      <th className="py-3 px-3.5 text-right">Stok Sebelum</th>
                      <th className="py-3 px-3.5 text-right">Stok Sesudah</th>
                      <th className="py-3 px-3.5 text-right">Harga Jual</th>
                      <th className="py-3 px-3.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedPreview.map((item, idx) => {
                      let rowBg = 'hover:bg-slate-50';
                      let statusBadge = <Badge variant="success" size="sm">Valid</Badge>;

                      if (item.status === 'tidak_ditemukan') {
                        rowBg = 'bg-rose-50/90 text-rose-950 font-medium hover:bg-rose-100';
                        statusBadge = <Badge variant="danger" size="sm">Tidak Ada di DB</Badge>;
                      } else if (item.status === 'stok_kurang') {
                        rowBg = 'bg-amber-50/90 text-amber-950 font-medium hover:bg-amber-100';
                        statusBadge = <Badge variant="warning" size="sm">Stok Kurang</Badge>;
                      }

                      return (
                        <tr key={idx} className={`transition-colors ${rowBg}`}>
                          <td className="py-2.5 px-3.5 whitespace-nowrap">{statusBadge}</td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-slate-800">{item.kodebarang}</td>
                          <td className="py-2.5 px-3.5 font-semibold text-slate-900">
                            <div>{item.namabarang}</div>
                            {item.error_message && (
                              <div className="text-[10px] text-rose-600 font-normal">{item.error_message}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-extrabold text-indigo-600">
                            {item.jumlah_terjual}
                          </td>
                          <td className="py-2.5 px-3.5 text-right text-slate-600">
                            {item.status === 'tidak_ditemukan' ? '-' : item.stok_sebelum}
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-bold">
                            {item.status === 'tidak_ditemukan' ? '-' : (
                              <span className={item.stok_sesudah < 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-700'}>
                                {item.stok_sesudah}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-right">
                            {item.status === 'tidak_ditemukan' ? '-' : item.hargajual.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-bold text-slate-900">
                            {item.status === 'tidak_ditemukan' ? '-' : item.total_nilai.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {previewItems.length > 25 && (
                  <Pagination
                    currentPage={previewPage}
                    totalItems={previewItems.length}
                    pageSize={previewPageSize}
                    pageSizeOptions={[25, 50, 100, 150, 200]}
                    onPageChange={setPreviewPage}
                    onPageSizeChange={setPreviewPageSize}
                    itemName="item preview"
                  />
                )}
              </div>

              {/* Bottom Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3">
                <div className="space-y-1">
                  <div className="text-xs text-slate-600">
                    Estimasi Omset Valid: <span className="font-extrabold text-slate-900 text-sm sm:text-base">Rp {previewStats.totalOmset.toLocaleString('id-ID')}</span> ({previewStats.totalQuantity} pcs barang)
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    Waktu transaksi dicatat otomatis saat penjualan disimpan.
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={resetUpload}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => setIsConfirmOpen(true)}
                    disabled={previewStats.hasErrors || previewStats.valid === 0 || isExecuting}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Konfirmasi & Potong Stok ({previewStats.valid} Item)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. VIEW: RIWAYAT PENJUALAN KASIR SAYA */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Riwayat Penjualan Kasir ({currentUser.name})
              </h3>
              <p className="text-xs text-slate-400">
                Menampilkan seluruh transaksi penjualan yang Anda upload
              </p>
            </div>
            <button
              onClick={exportMyHistory}
              disabled={filteredMyHistory.length === 0}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <ArrowDownToLine className="w-4 h-4" />
              Export ke Excel (.xlsx)
            </button>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <form onSubmit={(e) => { e.preventDefault(); setHistorySearch(historySearchInput); }} className="relative sm:col-span-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kode / nama barang..."
                  value={historySearchInput}
                  onChange={(e) => setHistorySearchInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button type="submit" className="px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl inline-flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                Cari
              </button>
            </form>
            <div>
              <input
                type="date"
                value={historyDateFilter}
                onChange={(e) => setHistoryDateFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="text-[11px] whitespace-nowrap">Per Halaman:</span>
              <select
                value={historyPageSize}
                onChange={(e) => {
                  setHistoryPageSize(Number(e.target.value));
                  setHistoryPage(1);
                }}
                className="w-full px-2 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={150}>150</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>

          {/* History Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Waktu Transaksi</th>
                  <th className="py-3 px-3.5">Kode Barang</th>
                  <th className="py-3 px-3.5">Nama Barang</th>
                  <th className="py-3 px-3.5 text-center">Lokasi</th>
                  <th className="py-3 px-3.5 text-right">Jumlah</th>
                  <th className="py-3 px-3.5 text-right">Harga Satuan</th>
                  <th className="py-3 px-3.5 text-right">Total Nilai</th>
                  <th className="py-3 px-3.5">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMyHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Belum ada data riwayat penjualan yang tercatat.
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3.5 text-slate-500 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString('id-ID', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-800">
                        {item.kodebarang}
                      </td>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-800">
                        {item.namabarang}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <Badge size="sm" variant={item.lokasi === 'online' ? 'success' : item.lokasi === 'reseller' ? 'warning' : 'info'}>
                          {item.lokasi === 'cacat' ? 'Barang Cacat' : item.lokasi || '-'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-extrabold text-indigo-600">
                        {item.jumlah_terjual}
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-600">
                        {item.hargajual.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-extrabold text-emerald-700">
                        {item.total_nilai.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-500 truncate max-w-xs">
                        {item.keterangan || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Footer */}
            <Pagination
              currentPage={historyPage}
              totalItems={filteredMyHistory.length}
              pageSize={historyPageSize}
              pageSizeOptions={[25, 50, 100, 150, 200]}
              onPageChange={setHistoryPage}
              onPageSizeChange={setHistoryPageSize}
              itemName="transaksi"
            />
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmSubmit}
        title="Konfirmasi Pemotongan Stok Penjualan"
        message={`Apakah Anda yakin ingin memproses ${previewStats.valid} item penjualan dengan total omset Rp ${previewStats.totalOmset.toLocaleString('id-ID')}?\n\nStok lokasi ${salesLocation.toUpperCase()} akan dikurangi. Tanggal dan jam transaksi dicatat otomatis.`}
        confirmText="Ya, Potong Stok Sekarang"
        cancelText="Periksa Kembali"
        type="primary"
        isLoading={isExecuting}
      />
    </div>
  );
};
