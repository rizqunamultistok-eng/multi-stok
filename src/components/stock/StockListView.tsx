import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Layers, 
  Search, 
  AlertTriangle, 
  ArrowDownToLine, 
  ArrowUpDown,
  Building2, 
  Store, 
  Users2, 
  Globe,
  Plus,
  Clock,
  CheckCircle2,
  Download,
  X,
  Package,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Zap
} from 'lucide-react';
import { useInventory, getItemLocationStock, getTotalConsolidatedStock } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { Barang, StockLocation } from '../../types';
import { exportToExcel } from '../../lib/excel';
import { LOCATION_THEME } from '../../lib/locationTheme';
import { getMinimumStockForItem } from '../../lib/minStock';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { Pagination } from '../common/Pagination';

const STOCK_EXPORT_COLUMNS = [
  { key: 'nomor', label: 'No' },
  { key: 'kodebarang', label: 'Kode Barang' },
  { key: 'namabarang', label: 'Nama Barang' },
  { key: 'satuan', label: 'Satuan' },
  { key: 'stokGudang', label: 'Stok Gudang' },
  { key: 'stokToko', label: 'Stok Toko' },
  { key: 'stokReseller', label: 'Stok Reseller' },
  { key: 'stokOnline', label: 'Stok Online' },
  { key: 'stokCacat', label: 'Stok Barang Cacat' },
  { key: 'totalStok', label: 'Total Stok' },
  { key: 'hargaPokok', label: 'Harga Pokok (HPP)' },
  { key: 'hargaJual', label: 'Harga Jual' },
  { key: 'supplierKode', label: 'Kode Supplier' },
  { key: 'supplierNama', label: 'Supplier' },
  { key: 'supplierAlamat', label: 'Alamat Supplier' },
  { key: 'supplierKota', label: 'Kota Supplier' },
  { key: 'supplierKontak', label: 'Kontak Supplier' },
] as const;

type StockExportColumn = typeof STOCK_EXPORT_COLUMNS[number]['key'];
const DEFAULT_UNCHECKED_EXPORT_COLUMNS: StockExportColumn[] = ['hargaPokok', 'supplierAlamat', 'supplierKota', 'supplierKontak'];
const EMPTY_SUPPLIER_FILTER = '__without_supplier__';

export const StockListView: React.FC = () => {
  const { 
    barangList, 
    createPermintaanMutasi, 
    pendingApprovalCount,
    searchBarangServer,
    syncProgress,
    minStockSettings,
    suppliers
  } = useInventory();
  const { currentUser, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<string>('semua');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [supplierInput, setSupplierInput] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [activeSupplierIndex, setActiveSupplierIndex] = useState(-1);
  const supplierListRef = useRef<HTMLDivElement>(null);
  const [isSearchingServer, setIsSearchingServer] = useState(false);

  // Pagination states for 20.000+ records
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  type SortKey = 'kodebarang' | 'namabarang' | 'gudang' | 'toko' | 'reseller' | 'online' | 'cacat' | 'total' | 'hargajual';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'kodebarang', direction: 'asc' });
  const [jumpPageInput, setJumpPageInput] = useState('1');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<StockExportColumn[]>(() => STOCK_EXPORT_COLUMNS
    .filter((column) => !DEFAULT_UNCHECKED_EXPORT_COLUMNS.includes(column.key))
    .map((column) => column.key));

  const stockLocations: StockLocation[] = ['gudang', 'toko', 'reseller', 'online', 'cacat'];
  const roleLocation = stockLocations.includes(currentUser.role as StockLocation)
    ? currentUser.role as StockLocation
    : 'gudang';

  const supplierOptions = useMemo(() => {
    const isNoSupplierSelection = supplierFilter === EMPTY_SUPPLIER_FILTER && supplierInput.trim() === '-';
    const query = isNoSupplierSelection ? '' : supplierInput.trim().toLocaleLowerCase('id');
    return suppliers.filter((supplier) => !query
      || supplier.nama.toLocaleLowerCase('id').includes(query)
      || supplier.kode.toLocaleLowerCase('id').includes(query)
    ).slice(0, 20);
  }, [suppliers, supplierInput, supplierFilter]);

  const supplierCodeByAlias = useMemo(() => {
    const aliases = new Map<string, string>();
    suppliers.forEach((supplier) => {
      aliases.set(supplier.kode.trim().toLocaleLowerCase('id'), supplier.kode);
      aliases.set(supplier.nama.trim().toLocaleLowerCase('id'), supplier.kode);
    });
    return aliases;
  }, [suppliers]);

  const activeSupplier = suppliers.find((supplier) => supplier.kode === supplierFilter);

  useEffect(() => {
    if (activeSupplierIndex < 0) return;
    supplierListRef.current
      ?.querySelector(`[data-supplier-index="${activeSupplierIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeSupplierIndex]);

  const selectSupplier = (supplier: (typeof suppliers)[number]) => {
    setSupplierFilter(supplier.kode);
    setSupplierInput(supplier.nama);
    setIsSupplierDropdownOpen(false);
    setActiveSupplierIndex(-1);
    setCurrentPage(1);
  };

  const clearSupplierFilter = () => {
    setSupplierFilter('');
    setSupplierInput('');
    setIsSupplierDropdownOpen(false);
    setActiveSupplierIndex(-1);
    setCurrentPage(1);
  };

  const selectNoSupplier = () => {
    setSupplierFilter(EMPTY_SUPPLIER_FILTER);
    setSupplierInput('-');
    setIsSupplierDropdownOpen(false);
    setActiveSupplierIndex(-1);
    setCurrentPage(1);
  };

  const handleExecuteSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchInput.trim();
    setSearchQuery(q);
    setCurrentPage(1);

    if (q) {
      setIsSearchingServer(true);
      try {
        await searchBarangServer(q);
      } finally {
        setIsSearchingServer(false);
      }
    }
  };

  const handleResetSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Direct Transfer modal (Instant movement)

  // Mutation Request modal (Request & Approval workflow)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestBarang, setRequestBarang] = useState<Barang | null>(null);
  const [requestSourceLoc, setRequestSourceLoc] = useState<StockLocation>('gudang');
  const [requestTargetLoc, setRequestTargetLoc] = useState<StockLocation>(() => {
    if (!isAdmin) {
      return currentUser.role as StockLocation;
    }
    return 'toko';
  });
  const [requestQty, setRequestQty] = useState(5);
  const [requestReason, setRequestReason] = useState('');

  const channelTabs = [
    { id: 'semua', label: 'Semua Saluran', icon: Layers },
    { id: 'gudang', label: 'Gudang Utama', icon: Building2 },
    { id: 'toko', label: 'Toko Pusat', icon: Store },
    { id: 'reseller', label: 'Mitra Reseller', icon: Users2 },
    { id: 'online', label: 'Online / E-Com', icon: Globe },
    { id: 'cacat', label: 'Barang Cacat', icon: ShieldAlert },
  ];

  // Filtered
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const supplierQuery = supplierFilter.trim().toLocaleLowerCase('id');
    const filtered = barangList.filter((item) => {
      const matchLocation =
        activeTab === 'semua' || getItemLocationStock(item, activeTab as StockLocation) > 0;
      if (!matchLocation) return false;

      const matchesSearch = !q || (
        String(item.namabarang || '').toLowerCase().includes(q) ||
        String(item.kodebarang || '').toLowerCase().includes(q) ||
        String(item.kodebarcode || '').toLowerCase().includes(q) ||
        String(item.merek || '').toLowerCase().includes(q) ||
        String(item.supplier || '').toLowerCase().includes(q)
      );
      if (!matchesSearch) return false;
      if (supplierFilter === EMPTY_SUPPLIER_FILTER) {
        const supplierValue = String(item.supplier ?? '').trim();
        return !supplierValue || supplierValue === '-';
      }
      if (!supplierQuery) return true;

      const supplierValue = String(item.supplier || '').trim().toLocaleLowerCase('id');
      return supplierCodeByAlias.get(supplierValue) === supplierFilter;
    });
    const getSortValue = (item: Barang): string | number => {
      switch (sortConfig.key) {
        case 'kodebarang': return item.kodebarang;
        case 'namabarang': return item.namabarang;
        case 'gudang':
        case 'toko':
        case 'reseller':
        case 'online':
        case 'cacat': return getItemLocationStock(item, sortConfig.key);
        case 'total': return getTotalConsolidatedStock(item);
        case 'hargajual': return Number(item.hargajual || 0);
      }
    };
    return [...filtered].sort((first, second) => {
      const left = getSortValue(first);
      const right = getSortValue(second);
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), 'id', { numeric: true, sensitivity: 'base' });
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [barangList, activeTab, searchQuery, supplierFilter, supplierCodeByAlias, sortConfig]);

  const sortHeader = (key: SortKey, label: string, className = '') => (
    <th scope="col" aria-sort={sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`py-3 px-3.5 ${className}`}>
      <button type="button" onClick={() => setSortConfig((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))} className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:text-indigo-700">
        {label}<ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
    </th>
  );

  // Reset to page 1 when filter or tab changes
  useEffect(() => {
    setCurrentPage(1);
    setJumpPageInput('1');
  }, [activeTab, searchQuery, supplierFilter, pageSize, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  // Sync jump input
  useEffect(() => {
    setJumpPageInput(String(currentPage));
  }, [currentPage]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const roleSummary = useMemo(() => {
    const scopeRole = isAdmin ? 'admin' : currentUser.role;
    const roleLabel = scopeRole === 'admin' ? 'Semua Saluran' : scopeRole.toUpperCase();

    const itemsForRole =
      scopeRole === 'admin'
        ? filteredItems
        : filteredItems.filter((item) => {
            const role = scopeRole as StockLocation;
            return getItemLocationStock(item, role) > 0;
          });

    const totalUnits = itemsForRole.reduce((sum, item) => {
      const qty = scopeRole === 'admin' ? getTotalConsolidatedStock(item) : getItemLocationStock(item, scopeRole as StockLocation);
      return sum + qty;
    }, 0);

    const totalHppValue = itemsForRole.reduce((sum, item) => {
      const qty = scopeRole === 'admin' ? getTotalConsolidatedStock(item) : getItemLocationStock(item, scopeRole as StockLocation);
      return sum + qty * Number(item.hargapokok || 0);
    }, 0);

    const totalAssetValue = itemsForRole.reduce((sum, item) => {
      const qty = scopeRole === 'admin' ? getTotalConsolidatedStock(item) : getItemLocationStock(item, scopeRole as StockLocation);
      return sum + qty * Number(item.hargajual || 0);
    }, 0);

    const totalProfit = totalAssetValue - totalHppValue;

    return {
      roleLabel,
      totalUnits,
      totalHppValue,
      totalAssetValue,
      totalProfit,
    };
  }, [currentUser.role, filteredItems]);

  const startRecord = filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, filteredItems.length);

  const handleOpenRequestMutation = (item: Barang) => {
    setRequestBarang(item);
    setRequestSourceLoc('gudang');
    if (!isAdmin) {
      setRequestTargetLoc(currentUser.role as StockLocation);
    } else {
      setRequestTargetLoc('toko');
    }
    setRequestQty(5);
    setRequestReason(`Permintaan restock ${item.namabarang} untuk saluran ${currentUser.role}`);
    setIsRequestModalOpen(true);
  };

  const handleExecuteRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestBarang || requestQty <= 0) return;

    await createPermintaanMutasi({
      kodebarang: requestBarang.kodebarang,
      asal_lokasi: requestSourceLoc,
      tujuan_lokasi: requestTargetLoc,
      jumlah_diminta: requestQty,
      alasan: requestReason,
    });
    setIsRequestModalOpen(false);
  };

  const handleExport = () => {
    if (selectedExportColumns.length === 0) return;
    const data = filteredItems.map((item, index) => {
      const supplierValue = String(item.supplier || '').trim().toLowerCase();
      const supplier = suppliers.find((candidate) => candidate.kode.trim().toLowerCase() === supplierValue
        || candidate.nama.trim().toLowerCase() === supplierValue);
      const values: Record<StockExportColumn, unknown> = {
        nomor: index + 1,
        kodebarang: item.kodebarang,
        namabarang: item.namabarang,
        satuan: item.satuan,
        stokGudang: getItemLocationStock(item, 'gudang'),
        stokToko: getItemLocationStock(item, 'toko'),
        stokReseller: getItemLocationStock(item, 'reseller'),
        stokOnline: getItemLocationStock(item, 'online'),
        stokCacat: getItemLocationStock(item, 'cacat'),
        totalStok: getTotalConsolidatedStock(item),
        hargaJual: item.hargajual,
        hargaPokok: item.hargapokok,
        supplierNama: supplier?.nama || item.supplier || '',
        supplierKode: supplier?.kode || '',
        supplierAlamat: supplier?.alamat || '',
        supplierKota: supplier?.kota || '',
        supplierKontak: supplier?.kontak || '',
      };
      return Object.fromEntries(selectedExportColumns.map((key) => [
        STOCK_EXPORT_COLUMNS.find((column) => column.key === key)?.label || key,
        values[key],
      ]));
    });
    exportToExcel(data, `Laporan_Stok_Multi_Saluran_${activeTab.toUpperCase()}`);
    setIsExportModalOpen(false);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Layers className="w-5 h-5" />
            </div>
            Monitoring & Alokasi Stok Multi-Saluran
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Data read-only ketersediaan stok fisik terintegrasi di Gudang, Toko, Reseller, dan Online
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Channel Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {channelTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const tabTheme = tab.id === 'semua' ? null : LOCATION_THEME[tab.id as StockLocation];
          const count =
            tab.id === 'semua'
              ? barangList.length
              : barangList.filter((b) => getItemLocationStock(b, tab.id as StockLocation) > 0).length;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 border cursor-pointer ${
                isActive
                  ? tabTheme?.active || 'bg-indigo-700 text-white border-indigo-700 shadow-xs'
                  : tabTheme
                  ? `${tabTheme.softBg} ${tabTheme.text} ${tabTheme.border} hover:brightness-[0.98]`
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : tabTheme?.text || 'text-slate-500'}`} />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                  isActive ? 'bg-black/15 text-white' : 'bg-white/80 text-current'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sync Status Banner if downloading 20.000+ items */}
      {syncProgress.isSyncing && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 px-4 flex items-center justify-between text-xs text-indigo-900">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
            <span className="font-semibold">
              Memuat seluruh database dari Supabase: {syncProgress.loaded.toLocaleString('id-ID')} dari {syncProgress.total.toLocaleString('id-ID')} barang
            </span>
          </div>
          <span className="text-[11px] text-indigo-600 font-mono">
            {Math.round((syncProgress.loaded / (syncProgress.total || 1)) * 100)}%
          </span>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Total Stok {roleSummary.roleLabel}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {roleSummary.totalUnits.toLocaleString('id-ID')}
            <span className="ml-1 text-xs font-bold text-slate-500">pcs</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 leading-relaxed">
            Total item aktif untuk {roleSummary.roleLabel.toLowerCase()} berdasarkan stok yang tersedia di {currentUser.role === 'admin' ? 'semua saluran' : `saluran ${currentUser.role}`}. 
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Nilai Aset Stok (HPP)</div>
          <div className="mt-2 text-2xl font-black text-amber-700">
            Rp {roleSummary.totalHppValue.toLocaleString('id-ID')}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 leading-relaxed">
            Rumus: jumlah stok × harga pokok. Contoh: 15 pcs × Rp 3.000 = Rp 45.000.
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Nilai Aset Stok (Harga Jual)</div>
          <div className="mt-2 text-2xl font-black text-emerald-700">
            Rp {roleSummary.totalAssetValue.toLocaleString('id-ID')}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 leading-relaxed">
            Rumus: jumlah stok × harga jual. Contoh: 15 pcs × Rp 5.000 = Rp 75.000.
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Estimasi Laba Kotor</div>
          <div className={`mt-2 text-2xl font-black ${roleSummary.totalProfit >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
            Rp {roleSummary.totalProfit.toLocaleString('id-ID')}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 leading-relaxed">
            Rumus: (jumlah stok × harga jual) - (jumlah stok × harga pokok). Contoh: Rp 75.000 - Rp 45.000 = Rp 30.000.
          </div>
        </div>
      </div>

      {/* Search & Pagination Toolbar */}
      <div className="bg-white p-3.5 rounded-3xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Form with Dedicated 'Cari' Button */}
          <form onSubmit={handleExecuteSearch} className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Ketik kode, barcode, atau nama barang lalu klik Cari..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-8 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleResetSearch}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  title="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isSearchingServer}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isSearchingServer ? 'Mencari...' : 'Cari'}</span>
            </button>
          </form>

          <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-slate-600">
            <span className="text-[11px] text-slate-500 whitespace-nowrap">Per Halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={150}>150</option>
              <option value={200}>200</option>
            </select>

            <span className="text-[11px] font-bold text-slate-800 bg-slate-100 px-2.5 py-1.5 rounded-xl whitespace-nowrap">
              {filteredItems.length.toLocaleString('id-ID')} Barang
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2 sm:max-w-md">
          <label htmlFor="stock-supplier-filter" className="text-[11px] font-semibold text-slate-600">Filter supplier</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              id="stock-supplier-filter"
              type="text"
              value={supplierInput}
              onFocus={() => { setIsSupplierDropdownOpen(true); setActiveSupplierIndex(-1); }}
              onBlur={() => setIsSupplierDropdownOpen(false)}
              onChange={(event) => { setSupplierInput(event.target.value); setIsSupplierDropdownOpen(true); setActiveSupplierIndex(-1); }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setIsSupplierDropdownOpen(true);
                  setActiveSupplierIndex((index) => index < supplierOptions.length ? index + 1 : 0);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setIsSupplierDropdownOpen(true);
                  setActiveSupplierIndex((index) => index > 0 ? index - 1 : supplierOptions.length);
                } else if (event.key === 'Enter' && isSupplierDropdownOpen) {
                  event.preventDefault();
                  if (activeSupplierIndex === 0 || supplierOptions.length === 0) selectNoSupplier();
                  else if (activeSupplierIndex > 0) selectSupplier(supplierOptions[activeSupplierIndex - 1]);
                  else if (supplierOptions.length === 1) selectSupplier(supplierOptions[0]);
                } else if (event.key === 'Escape') {
                  setIsSupplierDropdownOpen(false);
                  setSupplierInput(supplierFilter === EMPTY_SUPPLIER_FILTER ? '-' : activeSupplier?.nama || '');
                  setActiveSupplierIndex(-1);
                }
              }}
              placeholder="Ketik atau pilih nama supplier"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isSupplierDropdownOpen}
              aria-controls="stock-supplier-options"
              aria-activedescendant={activeSupplierIndex >= 0 ? `stock-supplier-option-${activeSupplierIndex}` : undefined}
            />
            {isSupplierDropdownOpen && (
              <div ref={supplierListRef} id="stock-supplier-options" role="listbox" aria-label="Pilihan supplier" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                <button
                  id="stock-supplier-option-0"
                  data-supplier-index={0}
                  type="button"
                  role="option"
                  aria-selected={activeSupplierIndex === 0}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={selectNoSupplier}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${activeSupplierIndex === 0 ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50'}`}
                >
                  <span className="text-xs font-semibold">-</span>
                  <span className="text-[10px] text-slate-500">Tanpa supplier</span>
                </button>
                {supplierOptions.map((supplier, index) => (
                  <button
                    key={supplier.kode}
                    id={`stock-supplier-option-${index + 1}`}
                    data-supplier-index={index + 1}
                    type="button"
                    role="option"
                    aria-selected={activeSupplierIndex === index + 1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSupplier(supplier)}
                    className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${activeSupplierIndex === index + 1 ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50'}`}
                  >
                    <span className="truncate text-xs font-semibold">{supplier.nama}</span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">{supplier.kode}</span>
                  </button>
                ))}
                {supplierOptions.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Supplier tidak ditemukan.</p>}
              </div>
            )}
            {(supplierFilter || supplierInput) && (
              <button type="button" onClick={clearSupplierFilter} aria-label="Hapus filter supplier" className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Active Search Filter Chip */}
        {searchQuery && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-xs">
            <span className="text-slate-500">Hasil pencarian untuk:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs">
              "{searchQuery}"
              <button
                type="button"
                onClick={handleResetSearch}
                className="hover:text-rose-600 ml-1 cursor-pointer font-bold"
                title="Batalkan pencarian"
              >
                ✕
              </button>
            </span>
            <span className="text-slate-400 text-[11px]">
              (Ditemukan {filteredItems.length.toLocaleString('id-ID')} barang)
            </span>
          </div>
        )}
      </div>

      {/* Table of Stocks with Multi-Location Read-Only Breakdown */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                {sortHeader('kodebarang', 'Kode / SKU')}
                {sortHeader('namabarang', 'Nama Barang')}
                {sortHeader('gudang', 'Gudang', 'text-center bg-blue-100/70 text-blue-950')}
                {sortHeader('toko', 'Toko', 'text-center bg-teal-100/70 text-teal-950')}
                {sortHeader('reseller', 'Reseller', 'text-center bg-amber-50/50 text-amber-900')}
                {sortHeader('online', 'Online', 'text-center bg-violet-100/70 text-violet-950')}
                {sortHeader('cacat', 'Barang Cacat', 'text-center bg-rose-50/50 text-rose-900')}
                {sortHeader('total', 'Total Stok', 'text-right font-black text-slate-900')}
                {sortHeader('hargajual', 'Harga Jual', 'text-right')}
                <th className="py-3 px-3.5 text-center">Aksi Mutasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Tidak ada barang yang sesuai di lokasi ini.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const gudangQty = getItemLocationStock(item, 'gudang');
                  const tokoQty = getItemLocationStock(item, 'toko');
                  const resellerQty = getItemLocationStock(item, 'reseller');
                  const onlineQty = getItemLocationStock(item, 'online');
                  const cacatQty = getItemLocationStock(item, 'cacat');
                  const totalStock = getTotalConsolidatedStock(item);
                  const isLow = totalStock <= getMinimumStockForItem(item, minStockSettings);

                  return (
                    <tr key={item.kodebarang} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-800">
                        {item.kodebarang}
                      </td>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-900 max-w-xs">
                        {item.namabarang}
                      </td>

                      {/* Read-Only Multi-Channel Columns */}
                      <td className="py-2.5 px-3.5 text-center bg-blue-50/60">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                          gudangQty === 0 ? 'text-slate-300' : 'text-blue-700 bg-blue-50'
                        }`}>
                          {gudangQty}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-center bg-teal-50/60">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                          tokoQty === 0 ? 'text-slate-300' : 'text-teal-800 bg-teal-100'
                        }`}>
                          {tokoQty}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-center bg-amber-50/30">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                          resellerQty === 0 ? 'text-slate-300' : 'text-amber-700 bg-amber-50'
                        }`}>
                          {resellerQty}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-center bg-violet-50/60">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                          onlineQty === 0 ? 'text-slate-300' : 'text-violet-800 bg-violet-100'
                        }`}>
                          {onlineQty}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-center bg-rose-50/30">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                          cacatQty === 0 ? 'text-slate-300' : 'text-rose-700 bg-rose-50'
                        }`}>
                          {cacatQty}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-black text-indigo-700">
                        <span className={`px-2 py-0.5 rounded ${isLow ? 'bg-rose-50 text-rose-700' : ''}`}>
                          {totalStock.toLocaleString('id-ID')}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-semibold text-slate-900">
                        {item.hargajual.toLocaleString('id-ID')}
                      </td>

                      {/* Action buttons (non-kasir only) */}
                      {(
                        <td className="py-2.5 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenRequestMutation(item)}
                              title="Minta Tambah Stok dari Gudang / Saluran Lain"
                              className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Minta Stok
                            </button>

                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredItems.length}
          pageSize={pageSize}
          pageSizeOptions={[25, 50, 100, 150, 200]}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemName="barang"
        />
      </div>

      {/* Modal 1: Request Mutation (Minta Tambah Stok) */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Ajukan Permintaan Tambah Stok"
        subtitle={requestBarang?.namabarang}
        maxWidth="md"
      >
        <form onSubmit={handleExecuteRequest} className="space-y-4">
          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-xs space-y-1">
            <div className="font-bold text-indigo-950 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-600" />
              <span>{requestBarang?.namabarang} ({requestBarang?.kodebarang})</span>
            </div>
            <p className="text-indigo-800 text-[11px]">
              Permintaan akan dikirimkan ke staff saluran asal untuk diverifikasi ketersediaan stoknya.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Minta Dari Saluran (Asal)
              </label>
              <select
                value={requestSourceLoc}
                onChange={(e) => setRequestSourceLoc(e.target.value as StockLocation)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="gudang">Gudang Utama</option>
                <option value="toko">Toko Pusat</option>
                <option value="reseller">Mitra Reseller</option>
                <option value="online">Online / E-Com</option>
                <option value="cacat">Barang Cacat</option>
              </select>
              {requestBarang && (
                <div className="mt-1 text-[11px] text-slate-500">
                  Stok Asal: <strong>{getItemLocationStock(requestBarang, requestSourceLoc)} {requestBarang.satuan}</strong>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Kirim Ke Saluran (Tujuan)
              </label>
              <select
                value={requestTargetLoc}
                onChange={(e) => setRequestTargetLoc(e.target.value as StockLocation)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="toko">Toko Pusat</option>
                <option value="gudang">Gudang Utama</option>
                <option value="reseller">Mitra Reseller</option>
                <option value="online">Online / E-Com</option>
                <option value="cacat">Barang Cacat</option>
              </select>
              {requestBarang && (
                <div className="mt-1 text-[11px] text-slate-500">
                  Stok Tujuan Saat Ini: <strong>{getItemLocationStock(requestBarang, requestTargetLoc)} {requestBarang.satuan}</strong>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Jumlah Yang Diminta ({requestBarang?.satuan})
            </label>
            <input
              type="number"
              min="1"
              value={requestQty}
              onChange={(e) => setRequestQty(parseInt(e.target.value) || 1)}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Alasan / Keterangan Kebutuhan
            </label>
            <input
              type="text"
              placeholder="Contoh: Stok toko sisa sedikit, butuh tambahan display..."
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsRequestModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={requestSourceLoc === requestTargetLoc || requestQty <= 0}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Kirim Permintaan
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Direct Transfer Stock Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Konfirmasi Kolom Export Excel"
        subtitle={`Pilih kolom yang akan diunduh (${filteredItems.length.toLocaleString('id-ID')} barang).`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-xs font-semibold text-slate-600">Kolom terpilih: {selectedExportColumns.length} dari {STOCK_EXPORT_COLUMNS.length}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelectedExportColumns(STOCK_EXPORT_COLUMNS.map((column) => column.key))} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Pilih semua</button>
              <button type="button" onClick={() => setSelectedExportColumns([])} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Kosongkan</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {STOCK_EXPORT_COLUMNS.map((column) => (
              <label key={column.key} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <input type="checkbox" checked={selectedExportColumns.includes(column.key)} onChange={(event) => setSelectedExportColumns((current) => event.target.checked ? [...current, column.key] : current.filter((key) => key !== column.key))} className="h-4 w-4 accent-emerald-700" />
                {column.label}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setIsExportModalOpen(false)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-semibold text-slate-700">Batal</button>
            <button type="button" onClick={handleExport} disabled={selectedExportColumns.length === 0 || filteredItems.length === 0} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" /> Download Excel</button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

