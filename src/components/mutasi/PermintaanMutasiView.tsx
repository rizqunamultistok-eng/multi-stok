import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ArrowRightLeft, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Building2, 
  Store, 
  ShoppingBag, 
  Users2, 
  Globe, 
  Search, 
  Filter, 
  AlertTriangle, 
  ShieldAlert, 
  Sparkles,
  Info,
  Check,
  X,
  Package,
  Calendar,
  UserCheck,
  Printer
  ,Edit3,
  Trash2
} from 'lucide-react';
import { useInventory, getItemLocationStock, countUniqueMutationRequests } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { PermintaanMutasi, StockLocation, Barang, MutationRequestLine } from '../../types';
import { downloadMutationRequestTemplate, parseMutationRequestExcel } from '../../lib/excel';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { Pagination } from '../common/Pagination';

export const PermintaanMutasiView: React.FC = () => {
  const { 
    barangList, 
    permintaanMutasiList, 
    createPermintaanMutasi, 
    createPermintaanMutasiBatch,
    approvePermintaanMutasi, 
    rejectPermintaanMutasi,
    updatePermintaanMutasi,
    deletePermintaanMutasi
  } = useInventory();
  const { currentUser, users, isAdmin } = useAuth();

  // Filters
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'disetujui' | 'ditolak'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChannel, setFilterChannel] = useState<string>('all');

  // Create Request Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedKodeBarang, setSelectedKodeBarang] = useState('');
  const [selectedAsalLokasi, setSelectedAsalLokasi] = useState<StockLocation>('gudang');
  const [selectedTujuanLokasi, setSelectedTujuanLokasi] = useState<StockLocation>(() => {
    if (!isAdmin) {
      return currentUser.role as StockLocation;
    }
    return 'toko';
  });
  const [jumlahDiminta, setJumlahDiminta] = useState<number>(5);
  const [alasanPermintaan, setAlasanPermintaan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [itemSearchInput, setItemSearchInput] = useState('');
  const [requestLines, setRequestLines] = useState<MutationRequestLine[]>([]);
  const [mutationFileName, setMutationFileName] = useState('');
  const [mutationImportError, setMutationImportError] = useState('');

  // Approval/Rejection Modal States
  const [activeRequest, setActiveRequest] = useState<PermintaanMutasi | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const escapePrintHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const handlePrintMutationNote = (request: PermintaanMutasi) => {
    const noteItems = permintaanMutasiList.filter((item) => item.nomor_permintaan === request.nomor_permintaan);
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    const rows = noteItems.map((item, index) => `
      <tr>
        <td class="number">${index + 1}</td>
        <td>${escapePrintHtml(item.kodebarang)}</td>
        <td>${escapePrintHtml(item.namabarang)}</td>
        <td class="number">${item.jumlah_diminta}</td>
      </tr>
    `).join('');
    const status = request.status === 'disetujui' ? 'DISETUJUI' : request.status === 'ditolak' ? 'DITOLAK' : 'MENUNGGU PERSETUJUAN';
    const requester = users.find((user) => user.id === request.pemohon_id);
    const approver = request.disetujui_oleh_id ? users.find((user) => user.id === request.disetujui_oleh_id) : undefined;
    const approvalLocation = getLocationName(request.asal_lokasi);
    const signatureImage = (signature?: string) => signature ? `<img class="signature-image" src="${escapePrintHtml(signature)}" alt="Tanda tangan" />` : '<span class="line">&nbsp;</span>';

    printWindow.document.write(`<!doctype html><html><head><title>Nota Mutasi ${escapePrintHtml(request.nomor_permintaan)}</title>
      <style>
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:32px;font-size:12px}
        .header{text-align:center;border-bottom:2px solid #111827;padding-bottom:12px;margin-bottom:18px}.header h1{font-size:20px;margin:0 0 5px}.header p{margin:2px 0;color:#4b5563}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 30px;margin-bottom:18px}.meta b{display:inline-block;min-width:125px}
        .status{text-align:center;font-weight:bold;border:1px solid #111827;padding:7px;margin:10px 0 18px;letter-spacing:1px}
        table{width:100%;border-collapse:collapse;margin-bottom:18px}th,td{border:1px solid #9ca3af;padding:8px;text-align:left}th{background:#f3f4f6;text-align:center}td.number{text-align:center;font-weight:bold}
        .notes{min-height:45px;border:1px solid #d1d5db;padding:8px;margin-bottom:44px}.signatures{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;text-align:center}.signature{height:130px;display:flex;flex-direction:column;justify-content:space-between}.line{border-bottom:1px solid #111827;padding-bottom:4px}.signature-image{height:88px;max-width:240px;object-fit:contain;margin:auto auto 4px;opacity:.82;mix-blend-mode:multiply}
        @media print{body{margin:15mm}.no-print{display:none}}
      </style></head><body>
      <div class="header"><h1>NOTA PERMINTAAN MUTASI STOK</h1><p>Pantau Stok Multi-Channel</p></div>
      <div class="status">${status}</div>
      <div class="meta">
        <div><b>Nomor Nota</b>: ${escapePrintHtml(request.nomor_permintaan)}</div>
        <div><b>Tanggal</b>: ${new Date(request.created_at).toLocaleString('id-ID')}</div>
        <div><b>Lokasi Asal</b>: ${escapePrintHtml(getLocationName(request.asal_lokasi))}</div>
        <div><b>Lokasi Tujuan</b>: ${escapePrintHtml(getLocationName(request.tujuan_lokasi))}</div>
        <div><b>Pemohon</b>: ${escapePrintHtml(request.pemohon_name)}</div>
        <div><b>Pemeriksa/Penyetuju</b>: ${escapePrintHtml(request.status === 'disetujui' ? approvalLocation : request.disetujui_oleh_name || '-')}</div>
      </div>
      <table><thead><tr><th>No</th><th>Kode Barang</th><th>Nama Barang</th><th>Jumlah</th></tr></thead><tbody>${rows}</tbody></table>
      <div><b>Alasan / Keterangan</b></div><div class="notes">${escapePrintHtml(request.alasan || '-')} ${request.catatan_approval ? `<br><br><b>Catatan Persetujuan:</b> ${escapePrintHtml(request.catatan_approval)}` : ''}</div>
      <div class="signatures"><div class="signature"><span>Pemohon</span>${signatureImage(requester?.signature)}<span>${escapePrintHtml(request.pemohon_name)}</span></div><div class="signature"><span>Menyetujui</span>${signatureImage(approver?.signature)}<span>${escapePrintHtml(request.status === 'disetujui' ? approvalLocation : request.disetujui_oleh_name || '')}</span></div></div>
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
      </body></html>`);
    printWindow.document.close();
  };

  // Selected item object for live stock calculation in modal
  const selectedItem = useMemo(() => {
    return barangList.find((b) => b.kodebarang === selectedKodeBarang) || null;
  }, [barangList, selectedKodeBarang]);

  const itemSearchResults = useMemo(() => {
    const query = itemSearchInput.trim().toLowerCase();
    if (!query) return barangList.slice(0, 8);
    return barangList.filter((item) =>
      String(item.kodebarang || '').toLowerCase().includes(query) ||
      String(item.namabarang || '').toLowerCase().includes(query)
    ).slice(0, 12);
  }, [barangList, itemSearchInput]);

  const requestLineItems = useMemo(() => requestLines.map((line) => ({
    line,
    item: barangList.find((barang) => barang.kodebarang === line.kodebarang),
  })), [requestLines, barangList]);

  const sourceAvailableStock = useMemo(() => {
    if (!selectedItem) return 0;
    return getItemLocationStock(selectedItem, selectedAsalLokasi);
  }, [selectedItem, selectedAsalLokasi]);

  // Statistics & Scoping
  // Admin sees all mutation requests across all channels.
  // Other roles ONLY see requests where their role is involved (asal_lokasi, tujuan_lokasi, or pemohon_id)
  const roleScopedMutasiList = useMemo(() => {
    if (isAdmin) return permintaanMutasiList;
    return permintaanMutasiList.filter((req) => 
      req.asal_lokasi === currentUser.role ||
      req.tujuan_lokasi === currentUser.role ||
      req.pemohon_id === currentUser.id
    );
  }, [permintaanMutasiList, isAdmin, currentUser.role, currentUser.id]);

  const stats = useMemo(() => {
    const total = countUniqueMutationRequests(roleScopedMutasiList);
    const pending = countUniqueMutationRequests(roleScopedMutasiList.filter((r) => r.status === 'pending'));
    const disetujui = countUniqueMutationRequests(roleScopedMutasiList.filter((r) => r.status === 'disetujui'));
    const ditolak = countUniqueMutationRequests(roleScopedMutasiList.filter((r) => r.status === 'ditolak'));
    
    // Pending that need current user's approval
    const needMyApproval = countUniqueMutationRequests(roleScopedMutasiList.filter((r) => {
      if (r.status !== 'pending') return false;
      if (isAdmin) return true;
      return r.asal_lokasi === currentUser.role;
    }));

    return { total, pending, disetujui, ditolak, needMyApproval };
  }, [roleScopedMutasiList, isAdmin, currentUser.role]);

  // Filtered List
  const filteredList = useMemo(() => {
    return roleScopedMutasiList.filter((req) => {
      const matchStatus = filterStatus === 'all' || req.status === filterStatus;
      const matchSearch =
        req.nomor_permintaan.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.namabarang.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.kodebarang.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.pemohon_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchChannel =
        filterChannel === 'all' ||
        req.asal_lokasi === filterChannel ||
        req.tujuan_lokasi === filterChannel;

      return matchStatus && matchSearch && matchChannel;
    });
  }, [roleScopedMutasiList, filterStatus, searchQuery, filterChannel]);

  // Pagination for Mutasi Requests (25, 50, 100, 150, 200 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, searchQuery, filterChannel, pageSize]);

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  // Channel UI helper
  const getLocationName = (loc: StockLocation) => {
    switch (loc) {
      case 'gudang': return 'Gudang Utama';
      case 'toko': return 'Toko Pusat';
      case 'reseller': return 'Mitra Reseller';
      case 'online': return 'Online/E-Com';
      case 'cacat': return 'Barang Cacat';
      default: return loc;
    }
  };

  const getLocationBadgeVariant = (loc: StockLocation) => {
    switch (loc) {
      case 'gudang': return 'primary';
      case 'toko': return 'info';
      case 'reseller': return 'warning';
      case 'online': return 'success';
      case 'cacat': return 'danger';
      default: return 'default';
    }
  };

  // Open Create Modal with sensible defaults
  const handleOpenCreateModal = () => {
    if (barangList.length > 0) {
      setSelectedKodeBarang(barangList[0].kodebarang);
    }
    setSelectedAsalLokasi('gudang');
    if (!isAdmin) {
      setSelectedTujuanLokasi(currentUser.role as StockLocation);
    } else {
      setSelectedTujuanLokasi('toko');
    }
    setJumlahDiminta(5);
    setAlasanPermintaan('');
    setItemSearchInput('');
    setRequestLines([]);
    setMutationFileName('');
    setMutationImportError('');
    setIsCreateModalOpen(true);
  };

  const addRequestLine = () => {
    if (!selectedKodeBarang || requestLines.some((line) => line.kodebarang === selectedKodeBarang)) return;
    setRequestLines((previous) => [...previous, { kodebarang: selectedKodeBarang, jumlah_diminta: jumlahDiminta }]);
    setItemSearchInput('');
  };

  const handleMutationExcelChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMutationFileName(file.name);
    setMutationImportError('');
    const parsed = await parseMutationRequestExcel(file, barangList);
    const invalid = parsed.filter((item) => item.status === 'invalid');
    const valid = parsed.filter((item) => item.status === 'valid');
    setRequestLines((previous) => {
      const merged = new Map(previous.map((line) => [line.kodebarang, line]));
      valid.forEach((item) => merged.set(item.kodebarang, { kodebarang: item.kodebarang, jumlah_diminta: item.jumlah_diminta }));
      return Array.from(merged.values());
    });
    if (invalid.length > 0) setMutationImportError(`${invalid.length} baris ditolak: ${invalid[0].error_message}`);
  };

  // Submit Create Request
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    if (requestLines.length === 0) addRequestLine();
    const lines = requestLines.length > 0 ? requestLines : [{ kodebarang: selectedKodeBarang, jumlah_diminta: jumlahDiminta }];
    if (lines.length === 0 || !lines[0].kodebarang || jumlahDiminta <= 0) return;

    submitLockRef.current = true;
    setIsSubmitting(true);
    let res;
    try {
      res = await createPermintaanMutasiBatch({
        items: lines,
        asal_lokasi: selectedAsalLokasi,
        tujuan_lokasi: selectedTujuanLokasi,
        alasan: alasanPermintaan,
      });
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }

    if (res.success) {
      setIsCreateModalOpen(false);
    }
  };

  // Trigger Approve
  const handleConfirmApprove = async () => {
    if (!activeRequest) return;
    setIsSubmitting(true);
    await approvePermintaanMutasi(activeRequest.id, approvalNote);
    setIsSubmitting(false);
    setIsApproveModalOpen(false);
    setActiveRequest(null);
  };

  // Trigger Reject
  const handleConfirmReject = async () => {
    if (!activeRequest) return;
    setIsSubmitting(true);
    await rejectPermintaanMutasi(activeRequest.id, rejectReason || 'Ditolak karena stok fisik tidak mencukupi.');
    setIsSubmitting(false);
    setIsRejectModalOpen(false);
    setActiveRequest(null);
  };

  const handleAdminEdit = async (request: PermintaanMutasi) => {
    const quantity = window.prompt('Jumlah diminta:', String(request.jumlah_diminta));
    if (quantity === null) return;
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const reason = window.prompt('Alasan permintaan:', request.alasan || '');
    if (reason === null) return;
    await updatePermintaanMutasi(request.id, { jumlah_diminta: amount, alasan: reason });
  };

  const handleAdminDelete = async (request: PermintaanMutasi) => {
    if (!window.confirm(`Hapus permintaan ${request.nomor_permintaan}?`)) return;
    await deletePermintaanMutasi(request.id);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                Permintaan Mutasi & Notifikasi Stok
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Alur permohonan transfer stok antar saluran dengan verifikasi ketersediaan dan approval instan
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl shadow-xs hover:shadow-indigo-100 transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Permintaan Mutasi</span>
        </button>
      </div>

      {/* Role Scoping Notification Banner */}
      {!isAdmin ? (
        <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-2xl flex items-center justify-between text-xs text-indigo-950">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse shrink-0" />
            <div>
              <span className="font-bold">Notifikasi Khusus Saluran: {currentUser.role.toUpperCase()}</span>
              <span className="text-indigo-800 ml-1.5 hidden sm:inline">
                Sesuai hak akses, Anda hanya melihat permintaan mutasi & notifikasi yang berasal dari atau ditujukan ke saluran Anda.
              </span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-xl bg-white border border-indigo-200 font-mono font-bold text-indigo-700 text-xs shrink-0">
            {roleScopedMutasiList.length} Mutasi Terkait
          </span>
        </div>
      ) : (
        <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-2xl flex items-center justify-between text-xs text-purple-950">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
            <span className="font-bold">Akses Admin / Owner:</span>
            <span className="text-purple-800 hidden sm:inline">Menampilkan seluruh notifikasi dan permintaan mutasi dari semua saluran.</span>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-white border border-purple-200 font-mono font-bold text-purple-700 text-[11px]">
            Total {permintaanMutasiList.length} Data
          </span>
        </div>
      )}

      {/* Bento Notification & Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Need Approval Highlight */}
        <div className={`p-4 rounded-3xl border transition-all ${
          stats.needMyApproval > 0 
            ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/30' 
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Perlu Disetujui Saya
            </span>
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
              stats.needMyApproval > 0 ? 'bg-amber-500 text-white animate-bounce' : 'bg-slate-100 text-slate-400'
            }`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.needMyApproval.toLocaleString('id-ID')}</div>
          <p className="text-[10px] text-slate-400 mt-1 font-medium">
            {isAdmin ? 'Semua permintaan pending' : `Permintaan stok dari ${currentUser.role.toUpperCase()}`}
          </p>
        </div>

        {/* Card 2: Total Pending */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Pending
            </span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">{stats.pending.toLocaleString('id-ID')}</div>
          <p className="text-[10px] text-slate-400 mt-1">Menunggu konfirmasi gudang/saluran</p>
        </div>

        {/* Card 3: Approved */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Disetujui
            </span>
            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">{stats.disetujui.toLocaleString('id-ID')}</div>
          <p className="text-[10px] text-slate-400 mt-1">Stok berhasil dipindahkan</p>
        </div>

        {/* Card 4: Total Permintaan */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Riwayat
            </span>
            <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.total.toLocaleString('id-ID')}</div>
          <p className="text-[10px] text-slate-400 mt-1">{stats.ditolak.toLocaleString('id-ID')} ditolak</p>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="p-4 bg-white rounded-3xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Status Pill Filters */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterStatus === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Semua ({roleScopedMutasiList.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterStatus === 'pending'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending ({stats.pending})</span>
          </button>
          <button
            onClick={() => setFilterStatus('disetujui')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterStatus === 'disetujui'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Disetujui ({stats.disetujui})</span>
          </button>
          <button
            onClick={() => setFilterStatus('ditolak')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterStatus === 'ditolak'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Ditolak ({stats.ditolak})</span>
          </button>
        </div>

        {/* Search & Channel Filter */}
        <form onSubmit={(e) => { e.preventDefault(); setSearchQuery(searchInput); }} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari SKU, barang, pemohon..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl inline-flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" />
            Cari
          </button>

          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
          >
            <option value="all">Semua Saluran</option>
            <option value="gudang">Gudang</option>
            <option value="toko">Toko</option>
            <option value="reseller">Reseller</option>
            <option value="online">Online</option>
            <option value="cacat">Barang Cacat</option>
          </select>
        </form>
      </div>

      {/* Pagination & Count Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="text-slate-600 font-medium">
          Menampilkan <span className="font-bold text-slate-900">{filteredList.length}</span> permintaan mutasi
          {filteredList.length > 0 && (
            <span className="text-slate-400 ml-1">
              (Halaman {currentPage} dari {Math.max(1, Math.ceil(filteredList.length / pageSize))})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-[11px] text-slate-500 whitespace-nowrap">Per Halaman:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={150}>150</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      {/* Requests List Cards (Bento Style) */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Tidak ada data permintaan mutasi</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Belum ada permohonan stok yang sesuai dengan filter yang dipilih.
            </p>
          </div>
        ) : (
          paginatedList.map((req) => {
            const item = barangList.find((b) => b.kodebarang === req.kodebarang);
            const currentSourceStock = item ? getItemLocationStock(item, req.asal_lokasi) : 0;
            const currentTargetStock = item ? getItemLocationStock(item, req.tujuan_lokasi) : 0;
            const isStockSufficient = currentSourceStock >= req.jumlah_diminta;

            const canApproveOrReject =
              req.status === 'pending' &&
              (isAdmin || currentUser.role === req.asal_lokasi);

            return (
              <div
                key={req.id}
                className={`p-4 sm:p-5 bg-white rounded-3xl border transition-all ${
                  req.status === 'pending'
                    ? 'border-amber-200 shadow-2xs hover:border-amber-300'
                    : req.status === 'disetujui'
                    ? 'border-slate-200'
                    : 'border-slate-200 opacity-80'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Request Info & SKU */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                        {req.nomor_permintaan}
                      </span>

                      {/* Status Badge */}
                      {req.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Menunggu Persetujuan
                        </span>
                      )}
                      {req.status === 'disetujui' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Disetujui & Mutasi Selesai
                        </span>
                      )}
                      {req.status === 'ditolak' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Permintaan Ditolak
                        </span>
                      )}

                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(req.created_at).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Barang Details & Route */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div>
                        <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>{req.namabarang} - {req.jumlah_diminta}</span>
                          <span className="text-xs font-mono font-normal text-slate-400">
                            ({req.kodebarang})
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <span className="font-semibold text-slate-700">Pemohon:</span> {req.pemohon_name} (Saluran {req.pemohon_role.toUpperCase()})
                        </p>
                      </div>
                    </div>

                    {/* Route Visualizer Card */}
                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
                      {/* From */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Dari:</span>
                        <Badge size="sm" variant={getLocationBadgeVariant(req.asal_lokasi)}>
                          {getLocationName(req.asal_lokasi)}
                        </Badge>
                        <span className="text-[11px] text-slate-500">
                          (Stok saat ini: <strong className={currentSourceStock < req.jumlah_diminta ? 'text-rose-600' : 'text-slate-800'}>{currentSourceStock}</strong> {req.satuan})
                        </span>
                      </div>

                      <div className="text-slate-300">➔</div>

                      {/* To */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Ke:</span>
                        <Badge size="sm" variant={getLocationBadgeVariant(req.tujuan_lokasi)}>
                          {getLocationName(req.tujuan_lokasi)}
                        </Badge>
                        <span className="text-[11px] text-slate-500">
                          (Stok saat ini: <strong>{currentTargetStock}</strong> {req.satuan})
                        </span>
                      </div>

                      <div className="text-slate-300">|</div>

                      {/* Jumlah */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Jumlah Minta:</span>
                        <span className="font-extrabold text-indigo-700 px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                          {req.jumlah_diminta}
                        </span>
                      </div>
                    </div>

                    {/* Catatan / Alasan */}
                    {req.alasan && (
                      <p className="text-xs text-slate-600 italic bg-amber-50/50 p-2 rounded-xl border border-amber-100/50">
                        "{req.alasan}"
                      </p>
                    )}

                    {/* Approval Note if approved/rejected */}
                    {req.catatan_approval && (
                      <div className="text-xs text-slate-600 flex items-start gap-1.5 pt-1">
                        <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <span>
                          <strong>Catatan Approval:</strong>{' '}
                          {req.status === 'disetujui' && req.catatan_approval.startsWith('Disetujui oleh ')
                            ? req.catatan_approval.replace(/^Disetujui oleh [^.]+/, `Disetujui oleh ${getLocationName(req.asal_lokasi)}`)
                            : req.catatan_approval}
                          {req.status === 'disetujui' && !req.catatan_approval.startsWith('Disetujui oleh ') && (
                            <span className="text-slate-400">({getLocationName(req.asal_lokasi)})</span>
                          )}
                          {req.status !== 'disetujui' && req.disetujui_oleh_name && (
                            <span className="text-slate-400">({getLocationName(req.asal_lokasi)})</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Action Buttons (Approve / Reject) */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-end justify-center gap-2 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0">
                    <button
                      type="button"
                      onClick={() => handlePrintMutationNote(req)}
                      className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      Cetak Nota
                    </button>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleAdminEdit(req)} className="px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl flex items-center gap-1.5 cursor-pointer">
                          <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        <button type="button" onClick={() => handleAdminDelete(req)} className="px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl flex items-center gap-1.5 cursor-pointer">
                          <Trash2 className="w-4 h-4" /> Hapus
                        </button>
                      </div>
                    )}
                    {canApproveOrReject ? (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        {/* If stock is sufficient -> enable Approve */}
                        {isStockSufficient ? (
                          <button
                            onClick={() => {
                              setActiveRequest(req);
                              setApprovalNote(`Disetujui oleh ${getLocationName(req.asal_lokasi)}. Stok segera dikirim.`);
                              setIsApproveModalOpen(true);
                            }}
                            className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            <span>Setujui & Kirim</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                            <span>Stok Asal Kurang</span>
                          </div>
                        )}

                        {/* Reject button */}
                        <button
                          onClick={() => {
                            setActiveRequest(req);
                            setRejectReason(isStockSufficient ? 'Ditolak karena alasan jadwal' : 'Stok fisik pada lokasi asal tidak mencukupi permintaan.');
                            setIsRejectModalOpen(true);
                          }}
                          className="flex-1 sm:flex-none px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                          <span>Tolak</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-xs text-slate-400">
                        {req.status === 'pending' ? (
                          <span className="text-amber-600 font-medium">
                            Menunggu verifikasi {getLocationName(req.asal_lokasi)}
                          </span>
                        ) : req.status === 'disetujui' ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Selesai Diproses
                          </span>
                        ) : (
                          <span className="text-rose-600 font-medium flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            Dibatalkan
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <Pagination
        currentPage={currentPage}
        totalItems={filteredList.length}
        pageSize={pageSize}
        pageSizeOptions={[25, 50, 100, 150, 200]}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemName="permintaan mutasi"
      />

      {/* MODAL 1: Buat Permintaan Mutasi Baru */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Form Permintaan Mutasi Stok"
        size="md"
      >
        <form onSubmit={handleSubmitCreate} className="space-y-4">
          {/* Item Search, Excel Import, and Nota Lines */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-bold text-slate-700">Cari Barang / SKU</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={downloadMutationRequestTemplate} className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg">
                  Template Excel
                </button>
                <label className="px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer">
                  Import Excel
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleMutationExcelChange} className="hidden" />
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={itemSearchInput}
                onChange={(event) => setItemSearchInput(event.target.value)}
                placeholder="Ketik kode atau nama barang..."
                className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="button" onClick={addRequestLine} className="px-3 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl">
                <Plus className="w-3.5 h-3.5 inline mr-1" /> Tambah
              </button>
            </div>
            {itemSearchResults.length > 0 && itemSearchInput && (
              <div className="mt-2 max-h-32 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {itemSearchResults.map((item) => (
                  <button
                    key={item.kodebarang}
                    type="button"
                    onClick={() => {
                      setSelectedKodeBarang(item.kodebarang);
                      setItemSearchInput(`${item.kodebarang} - ${item.namabarang}`);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-indigo-50 ${selectedKodeBarang === item.kodebarang ? 'bg-indigo-50 text-indigo-700' : ''}`}
                  >
                    <strong>{item.kodebarang}</strong> - {item.namabarang} - {getItemLocationStock(item, selectedAsalLokasi)}
                  </button>
                ))}
              </div>
            )}
            {mutationFileName && <p className="mt-1 text-[11px] text-slate-500">File: {mutationFileName}</p>}
            {mutationImportError && <p className="mt-1 text-[11px] font-semibold text-rose-600">{mutationImportError}</p>}
            {requestLineItems.length > 0 && (
              <div className="mt-3 border border-indigo-100 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-indigo-50 text-xs font-bold text-indigo-900">Isi Nota Mutasi ({requestLineItems.length} barang)</div>
                {requestLineItems.map(({ line, item }) => (
                  <div key={line.kodebarang} className="flex items-center gap-2 px-3 py-2 border-t border-indigo-50 text-xs">
                    <span className="font-mono font-bold flex-1">{line.kodebarang} - {item?.namabarang || 'SKU'} - {line.jumlah_diminta}</span>
                    <input
                      type="number"
                      min="1"
                      value={line.jumlah_diminta}
                      onChange={(event) => setRequestLines((previous) => previous.map((current) => current.kodebarang === line.kodebarang ? { ...current, jumlah_diminta: Math.max(1, Number(event.target.value) || 1) } : current))}
                      className="w-20 px-2 py-1 text-right border border-slate-200 rounded-lg"
                    />
                    <button type="button" onClick={() => setRequestLines((previous) => previous.filter((current) => current.kodebarang !== line.kodebarang))} className="p-1 text-rose-600" title="Hapus dari nota">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Location Selection Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Lokasi Asal (Source) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Lokasi Asal (Permintaan dari Mana)
              </label>
              <select
                value={selectedAsalLokasi}
                onChange={(e) => setSelectedAsalLokasi(e.target.value as StockLocation)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="gudang">Gudang Utama</option>
                <option value="toko">Toko Pusat</option>
                <option value="reseller">Mitra Reseller</option>
                <option value="online">Online / E-Com</option>
                <option value="cacat">Barang Cacat</option>
              </select>
              {selectedItem && (
                <div className="mt-1 text-[11px] font-medium text-slate-500">
                  Stok di {getLocationName(selectedAsalLokasi)}:{' '}
                  <strong className={sourceAvailableStock === 0 ? 'text-rose-600' : 'text-indigo-600'}>
                    {sourceAvailableStock}
                  </strong>
                </div>
              )}
            </div>

            {/* Lokasi Tujuan (Target) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Lokasi Tujuan (Dikirim ke Mana)
              </label>
              <select
                value={selectedTujuanLokasi}
                onChange={(e) => setSelectedTujuanLokasi(e.target.value as StockLocation)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="toko">Toko Pusat</option>
                <option value="gudang">Gudang Utama</option>
                <option value="reseller">Mitra Reseller</option>
                <option value="online">Online / E-Com</option>
                <option value="cacat">Barang Cacat</option>
              </select>
              {selectedItem && (
                <div className="mt-1 text-[11px] font-medium text-slate-500">
                  Stok di {getLocationName(selectedTujuanLokasi)}:{' '}
                  <strong className="text-slate-700">
                    {getItemLocationStock(selectedItem, selectedTujuanLokasi)}
                  </strong>
                </div>
              )}
            </div>
          </div>

          {/* Validation warning if origin === destination */}
          {selectedAsalLokasi === selectedTujuanLokasi && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Lokasi asal dan lokasi tujuan tidak boleh sama.</span>
            </div>
          )}

          {/* Quantity Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Jumlah Diminta
            </label>
            <input
              type="number"
              min="1"
              max={sourceAvailableStock > 0 ? sourceAvailableStock : 9999}
              value={jumlahDiminta}
              onChange={(e) => setJumlahDiminta(parseInt(e.target.value) || 1)}
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
              required
            />
            {jumlahDiminta > sourceAvailableStock && (
              <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                Jumlah melebihi stok yang tersedia di {getLocationName(selectedAsalLokasi)} ({sourceAvailableStock}).
              </p>
            )}
          </div>

          {/* Reason / Alasan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Alasan / Keterangan Permintaan
            </label>
            <textarea
              rows={2}
              placeholder="Contoh: Tambah stok kasir toko karena transaksi ramai hari libur..."
              value={alasanPermintaan}
              onChange={(e) => setAlasanPermintaan(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedAsalLokasi === selectedTujuanLokasi || jumlahDiminta <= 0}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {isSubmitting ? 'Mengirim...' : 'Kirim Permintaan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Konfirmasi Persetujuan (Approval) */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Setujui Permintaan Mutasi Stok"
        size="md"
      >
        {activeRequest && (
          <div className="space-y-4">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-1.5">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Persetujuan Mutasi {activeRequest.nomor_permintaan}</span>
              </div>
              <p className="text-emerald-800">
                Stok sebanyak <strong>{activeRequest.jumlah_diminta} {activeRequest.satuan}</strong> dari <strong>{getLocationName(activeRequest.asal_lokasi)}</strong> akan segera dipotong dan ditambahkan ke <strong>{getLocationName(activeRequest.tujuan_lokasi)}</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Catatan Persetujuan (Opsional)
              </label>
              <textarea
                rows={2}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Contoh: Stok telah disiapkan dan dikirim via ekspedisi internal..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isSubmitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'Memproses...' : 'Setujui & Mutasi Sekarang'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 3: Konfirmasi Penolakan (Rejection) */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Tolak Permintaan Mutasi"
        size="md"
      >
        {activeRequest && (
          <div className="space-y-4">
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-1">
              <div className="font-bold text-rose-900 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Penolakan Permintaan {activeRequest.nomor_permintaan}</span>
              </div>
              <p className="text-rose-800">
                Permintaan mutasi <strong>{activeRequest.namabarang}</strong> sebanyak {activeRequest.jumlah_diminta} {activeRequest.satuan} akan dibatalkan.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Alasan Penolakan <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Tuliskan alasan penolakan (misal: stok fisik menipis, barang rusak, dll)..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isSubmitting || !rejectReason.trim()}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>{isSubmitting ? 'Memproses...' : 'Tolak Permintaan'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
