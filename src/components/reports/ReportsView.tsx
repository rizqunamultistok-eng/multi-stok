import React, { useMemo, useState } from 'react';
import { 
  Layers, 
  AlertTriangle, 
  Package, 
  ArrowRightLeft,
  RefreshCw,
  Database,
  CheckCircle2,
  Boxes,
  Store,
  Truck,
  Globe,
  Warehouse,
  PieChart as PieChartIcon,
  Plus,
  Check,
  Search,
  Filter,
  Info
} from 'lucide-react';
import { 
  BarChart as RechartsBarChart,
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RechartsPieChart,
  Pie, 
  Cell 
} from 'recharts';
import { getItemLocationStock, getTotalConsolidatedStock, useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../common/Badge';
import { Pagination } from '../common/Pagination';
import { MutasiStok, StockLocation } from '../../types';
import { LOCATION_THEME } from '../../lib/locationTheme';
import { getMinimumStockForItem } from '../../lib/minStock';

type MutasiFilter = 'all' | MutasiStok['tipe'];

const MUTASI_FILTERS: { id: MutasiFilter; label: string }[] = [
  { id: 'all', label: 'Total' },
  { id: 'opname', label: 'Opname' },
  { id: 'penjualan', label: 'Penjualan' },
  { id: 'barang_masuk', label: 'Barang Masuk' },
  { id: 'retur', label: 'Retur' },
  { id: 'pembatalan', label: 'Pembatalan' },
  { id: 'manual', label: 'Manual' },
];

const STOCK_LOCATION_LABELS: Record<StockLocation, string> = {
  gudang: 'Gudang',
  toko: 'Toko',
  reseller: 'Reseller',
  online: 'Online',
  cacat: 'Barang Cacat',
};

function formatStockLocation(location?: string | null): string {
  if (!location) return '-';
  return STOCK_LOCATION_LABELS[location as StockLocation] || location;
}

export const ReportsView: React.FC = () => {
  const { 
    barangList, 
    mutasiList, 
    opnameHistoryList, 
    isDbConnected, 
    dbStatusMsg, 
    refreshData, 
    isLoading,
    minStockSettings
  } = useInventory();
  const { currentUser, users } = useAuth();

  const [lastSyncTime, setLastSyncTime] = useState<string>(() => new Date().toLocaleTimeString('id-ID'));
  const [criticalSearchInput, setCriticalSearchInput] = useState('');
  const [criticalSearchQuery, setCriticalSearchQuery] = useState('');
  const [criticalPage, setCriticalPage] = useState(1);
  const [criticalPageSize, setCriticalPageSize] = useState(10);

  // Pagination for Audit Log Mutasi (25, 50, 100, 150, 200 per page)
  const [mutasiPage, setMutasiPage] = useState(1);
  const [mutasiPageSize, setMutasiPageSize] = useState(25);
  const [mutasiFilter, setMutasiFilter] = useState<MutasiFilter>('all');

  const filteredMutasi = useMemo(
    () => mutasiFilter === 'all' ? mutasiList : mutasiList.filter((item) => item.tipe === mutasiFilter),
    [mutasiList, mutasiFilter],
  );

  const mutasiCounts = useMemo(() => {
    const counts: Record<MutasiFilter, number> = { all: mutasiList.length, opname: 0, penjualan: 0, barang_masuk: 0, retur: 0, pembatalan: 0, manual: 0 };
    mutasiList.forEach((item) => { counts[item.tipe] += 1; });
    return counts;
  }, [mutasiList]);

  React.useEffect(() => {
    setMutasiPage(1);
  }, [mutasiFilter]);

  const paginatedMutasi = useMemo(() => {
    const start = (mutasiPage - 1) * mutasiPageSize;
    return filteredMutasi.slice(start, start + mutasiPageSize);
  }, [filteredMutasi, mutasiPage, mutasiPageSize]);

  const barangByKode = useMemo(
    () => new Map(barangList.map((barang) => [barang.kodebarang, barang])),
    [barangList]
  );

  const userById = useMemo(
    () => new Map<string, typeof users[number]>(users.map((user): [string, typeof user] => [user.id, user])),
    [users],
  );
  const userByName = useMemo(
    () => new Map<string, typeof users[number]>(users.map((user): [string, typeof user] => [user.name.trim().toLowerCase(), user])),
    [users],
  );

  const getMutationLocation = (mutation: MutasiStok): string => {
    const transferMatch = mutation.keterangan.match(/\b(?:dari|from)\s+(gudang|toko|reseller|online|cacat)\s+ke\s+(gudang|toko|reseller|online|cacat)\b/i);
    if (transferMatch) {
      return `${formatStockLocation(transferMatch[1].toLowerCase())} ke ${formatStockLocation(transferMatch[2].toLowerCase())}`;
    }

    if (mutation.tipe === 'opname') {
      const mutationDate = mutation.created_at.slice(0, 10);
      const history = opnameHistoryList.find((entry) => {
        const sameUser = (mutation.user_id && entry.user_id === mutation.user_id)
          || entry.user_name.trim().toLowerCase() === String(mutation.user_name || '').trim().toLowerCase();
        const sameDate = entry.created_at.slice(0, 10) === mutationDate;
        const containsItem = entry.details?.some((detail) => detail.kodebarang === mutation.kodebarang);
        return sameUser && sameDate && containsItem && Boolean(entry.lokasi);
      });
      if (history?.lokasi) return formatStockLocation(history.lokasi);
    }

    const cashier = userById.get(mutation.user_id)
      || userByName.get(String(mutation.user_name || '').trim().toLowerCase());
    const roleLocation = cashier && ['gudang', 'toko', 'reseller', 'online', 'cacat'].includes(cashier.role)
      ? cashier.role
      : undefined;
    if (roleLocation) return formatStockLocation(roleLocation);

    const itemLocation = barangByKode.get(mutation.kodebarang)?.lokasi;
    return formatStockLocation(itemLocation);
  };

  // 1. Total Aggregate Metrics
  const totalSkuCount = barangList.length;
  const totalStockUnits = useMemo(() => {
    return barangList.reduce((acc, b) => acc + getTotalConsolidatedStock(b), 0);
  }, [barangList]);

  const totalStockHppValue = useMemo(() => {
    return barangList.reduce((acc, b) => acc + getTotalConsolidatedStock(b) * b.hargapokok, 0);
  }, [barangList]);

  // 2. Channel Breakdown Data
  const channelMetrics = useMemo(() => {
    const map: Record<string, { count: number; units: number; hpp: number; items: typeof barangList }> = {
      gudang: { count: 0, units: 0, hpp: 0, items: [] },
      toko: { count: 0, units: 0, hpp: 0, items: [] },
      reseller: { count: 0, units: 0, hpp: 0, items: [] },
      online: { count: 0, units: 0, hpp: 0, items: [] },
      cacat: { count: 0, units: 0, hpp: 0, items: [] },
    };

    barangList.forEach((b) => {
      (Object.keys(map) as StockLocation[]).forEach((loc) => {
        const locationStock = getItemLocationStock(b, loc);
        if (locationStock > 0) {
          map[loc].count += 1;
          map[loc].units += locationStock;
          map[loc].hpp += locationStock * b.hargapokok;
          map[loc].items.push(b);
        }
      });
    });

    return [
      {
        id: 'gudang' as StockLocation,
        name: 'Gudang Utama (Pusat)',
        icon: Warehouse,
        color: LOCATION_THEME.gudang.hex,
        bgColor: 'bg-blue-600',
        lightBg: LOCATION_THEME.gudang.softBg,
        textColor: LOCATION_THEME.gudang.text,
        borderColor: LOCATION_THEME.gudang.border,
        units: map.gudang.units,
        skuCount: map.gudang.count,
        hpp: map.gudang.hpp,
        syncStatus: 'Tersinkronisasi Realtime',
        roleNote: 'Penyimpanan Utama & Buffer',
      },
      {
        id: 'toko' as StockLocation,
        name: 'Toko Pusat (Retail Outlet)',
        icon: Store,
        color: LOCATION_THEME.toko.hex,
        bgColor: 'bg-teal-600',
        lightBg: LOCATION_THEME.toko.softBg,
        textColor: LOCATION_THEME.toko.text,
        borderColor: LOCATION_THEME.toko.border,
        units: map.toko.units,
        skuCount: map.toko.count,
        hpp: map.toko.hpp,
        syncStatus: 'Tersinkronisasi Realtime',
        roleNote: 'Point of Sale & Kasir',
      },
      {
        id: 'reseller' as StockLocation,
        name: 'Mitra Reseller & Agen',
        icon: Truck,
        color: LOCATION_THEME.reseller.hex,
        bgColor: 'bg-amber-500',
        lightBg: LOCATION_THEME.reseller.softBg,
        textColor: LOCATION_THEME.reseller.text,
        borderColor: LOCATION_THEME.reseller.border,
        units: map.reseller.units,
        skuCount: map.reseller.count,
        hpp: map.reseller.hpp,
        syncStatus: 'Tersinkronisasi Realtime',
        roleNote: 'Konsinyasi & Distributor Mitra',
      },
      {
        id: 'online' as StockLocation,
        name: 'Online & Marketplace',
        icon: Globe,
        color: LOCATION_THEME.online.hex,
        bgColor: 'bg-violet-600',
        lightBg: LOCATION_THEME.online.softBg,
        textColor: LOCATION_THEME.online.text,
        borderColor: LOCATION_THEME.online.border,
        units: map.online.units,
        skuCount: map.online.count,
        hpp: map.online.hpp,
        syncStatus: 'Tersinkronisasi Realtime',
        roleNote: 'Shopee, Tokopedia & Webstore',
      },
      {
        id: 'cacat' as StockLocation,
        name: 'Barang Cacat',
        icon: Package,
        color: LOCATION_THEME.cacat.hex,
        bgColor: 'bg-rose-600',
        lightBg: LOCATION_THEME.cacat.softBg,
        textColor: LOCATION_THEME.cacat.text,
        borderColor: LOCATION_THEME.cacat.border,
        units: map.cacat.units,
        skuCount: map.cacat.count,
        hpp: map.cacat.hpp,
        syncStatus: 'Tersinkronisasi Realtime',
        roleNote: 'Stok cacat yang tetap dapat dijual melalui kasir',
      },
    ];
  }, [barangList]);

  // 3. Low Stock & Critical Discrepancies
  const lowStockItems = useMemo(() => {
    return barangList.filter((b) => b.stok <= getMinimumStockForItem(b, minStockSettings));
  }, [barangList, minStockSettings]);

  const filteredCriticalItems = useMemo(() => {
    const query = criticalSearchQuery.trim().toLowerCase();
    if (!query) return lowStockItems;
    return lowStockItems.filter((item) =>
      item.namabarang.toLowerCase().includes(query) ||
      item.kodebarang.toLowerCase().includes(query) ||
      item.kodebarcode.toLowerCase().includes(query)
    );
  }, [lowStockItems, criticalSearchQuery]);

  const paginatedCriticalItems = useMemo(() => {
    const start = (criticalPage - 1) * criticalPageSize;
    return filteredCriticalItems.slice(start, start + criticalPageSize);
  }, [filteredCriticalItems, criticalPage, criticalPageSize]);

  const outOfStockItems = useMemo(() => {
    return barangList.filter((b) => b.stok === 0);
  }, [barangList]);

  // 4. Sync Distribution Chart Data
  const chartDistribution = useMemo(() => {
    return channelMetrics.map((c) => ({
      name: c.name.split(' (')[0],
      units: c.units,
      sku: c.skuCount,
      fill: c.color,
    }));
  }, [channelMetrics]);

  const hasChartData = chartDistribution.some((item) => item.units > 0);

  // 5. Handle manual sync trigger
  const handleManualSync = async () => {
    await refreshData();
    setLastSyncTime(new Date().toLocaleTimeString('id-ID'));
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* 1. TOP SYNC BANNER (Bento Style) */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-md border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Supabase Sync Engine
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Semua Saluran Terkoneksi
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              Sinkronisasi Stok Multi-Channel
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Hub sinkronisasi stok terpusat untuk <strong className="text-slate-200">Gudang Utama</strong>, <strong className="text-slate-200">Toko Pusat</strong>, <strong className="text-slate-200">Mitra Reseller</strong>, dan <strong className="text-slate-200">Online Marketplace</strong> via Supabase Database.
            </p>
          </div>

          {/* Sync Trigger & Quick Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="bg-slate-800/80 backdrop-blur-xs p-3.5 rounded-2xl border border-slate-700/60 text-xs">
              <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Terakhir Disinkronkan</div>
              <div className="font-mono font-bold text-white mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {lastSyncTime} WIB
              </div>
            </div>

            <button
              onClick={handleManualSync}
              disabled={isLoading}
              className="px-5 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Sinkronkan Sekarang
            </button>

          </div>
        </div>

        {/* Decorative Circle Background */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      </div>

      {/* 2. AGGREGATE SUMMARY BENTO TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total SKU */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Katalog SKU</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{totalSkuCount.toLocaleString('id-ID')}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Master produk terdaftar di database</p>
          </div>
        </div>

        {/* Total Fisik Stok */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Fisik Unit</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {totalStockUnits.toLocaleString('id-ID')} <span className="text-sm font-semibold text-slate-400">Pcs</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total fisik tersebar di 6 saluran</p>
          </div>
        </div>

        {/* Estimasi Nilai HPP Stok */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nilai Aset Stok (HPP)</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Rp {totalStockHppValue.toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Nilai modal barang tersimpan</p>
          </div>
        </div>

        {/* Stok Menipis / Kritis */}
        <div className={`rounded-3xl p-5 border shadow-xs flex flex-col justify-between ${
          lowStockItems.length > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              lowStockItems.length > 0 ? 'text-rose-700' : 'text-slate-400'
            }`}>
              Stok Kritis / Menipis
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              lowStockItems.length > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
              lowStockItems.length > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}>
              {lowStockItems.length.toLocaleString('id-ID')} <span className="text-sm font-semibold text-slate-400">SKU</span>
            </div>
            <p className={`text-[11px] mt-0.5 ${lowStockItems.length > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>
              {lowStockItems.length > 0 ? `${outOfStockItems.length.toLocaleString('id-ID')} barang stok habis (0 pcs)` : 'Semua stok dalam batas aman'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. 6 CHANNELS REAL-TIME SYNC CARDS */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Keseimbangan & Distribusi Stok 6 Saluran
            </h2>
            <p className="text-xs text-slate-400">
              Status ketersediaan stok fisik riil per masing-masing saluran
            </p>
          </div>
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 hidden sm:inline-block">
            Database: {dbStatusMsg}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {channelMetrics.map((chan) => {
            const Icon = chan.icon;
            return (
                <div 
                key={chan.id}
                className={`bg-white rounded-3xl p-5 border-2 ${chan.borderColor} shadow-xs hover:shadow-md transition-all flex flex-col justify-between group`}
              >
                <div>
                  {/* Channel Header */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className={`w-9 h-9 rounded-2xl ${chan.lightBg} ${chan.textColor} flex items-center justify-center border ${chan.borderColor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      Live Sync
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-slate-900 leading-tight">
                    {chan.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                    {chan.roleNote}
                  </p>

                  {/* Stock count */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-500 font-medium">Stok Fisik:</span>
                      <span className="text-lg font-extrabold text-slate-900">
                        {chan.units.toLocaleString('id-ID')} <span className="text-xs font-semibold text-slate-400">Pcs</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Varian Produk:</span>
                      <span className="font-bold text-slate-700">{chan.skuCount.toLocaleString('id-ID')} SKU</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Estimasi Aset:</span>
                      <span className="font-mono font-semibold text-slate-700">Rp {(chan.hpp / 1000).toLocaleString('id-ID')}k</span>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* 4. VISUAL CHARTS & COMPARISON (Bento Grid 2 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Bar Comparison of Stock Units across 6 channels */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                Komparasi Kuantitas Fisik per Saluran
              </h3>
              <p className="text-xs text-slate-400">
                Memastikan ketersediaan stok seimbang di seluruh channel distribusi
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md self-start sm:self-auto">
              Total: {totalStockUnits.toLocaleString('id-ID')} Pcs
            </span>
          </div>

          <div className="h-60 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              {hasChartData ? (
                <RechartsBarChart data={chartDistribution} barCategoryGap="25%">
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tickFormatter={(val) => `${val} pcs`}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(val: number) => [`${val.toLocaleString('id-ID')} Pcs`, 'Kuantitas Stok']}
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  />
                  <Bar dataKey="units" radius={[8, 8, 0, 0]}>
                    {chartDistribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </RechartsBarChart>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Data stok per saluran belum tersedia.
                </div>
              )}
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-3 border-t border-slate-100 text-center">
            {channelMetrics.map((c) => (
              <div key={c.id} className="text-[10px]">
                <div className="font-bold text-slate-700 truncate">{c.name.split(' (')[0]}</div>
                <div className="font-extrabold text-indigo-600 text-xs mt-0.5">{c.units} pcs</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Channel Share Donut */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-indigo-600" />
              Porsi Alokasi Stok
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Persentase distribusi barang
            </p>

            <div className="h-44 my-2 flex items-center justify-center">
              {hasChartData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={channelMetrics.filter((channel) => channel.units > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="units"
                    >
                      {channelMetrics.filter((channel) => channel.units > 0).map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number) => [`${val.toLocaleString('id-ID')} Pcs`, 'Jumlah Stok']}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center">
                  Data stok per saluran belum tersedia.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
            {channelMetrics.map((c) => {
              const pct = totalStockUnits > 0 ? ((c.units / totalStockUnits) * 100).toFixed(1) : '0';
              return (
                <div key={c.id} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-slate-600">{c.name.split(' (')[0]}</span>
                  </div>
                  <span className="font-bold text-slate-900">{c.units} pcs ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. CRITICAL STOCK & REBALANCING ALERT TABLE */}
      {lowStockItems.length > 0 && (
        <div className="order-last bg-white rounded-3xl p-6 border border-rose-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-rose-950 text-sm">
                  Daftar Barang Kritis & Butuh Restock / Mutasi Antar-Saluran
                </h3>
                <p className="text-xs text-rose-700">
                  Ditemukan {lowStockItems.length} produk dengan kuantitas &le; batas minimum stok.
                </p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCriticalSearchQuery(criticalSearchInput);
                setCriticalPage(1);
              }}
              className="flex gap-2"
            >
              <div className="relative min-w-0 flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={criticalSearchInput}
                  onChange={(e) => setCriticalSearchInput(e.target.value)}
                  placeholder="Cari nama / kode..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-rose-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl inline-flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                Cari
              </button>
            </form>
          </div>

          <div className="overflow-x-auto border border-rose-100 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-rose-50/60 text-rose-900 font-bold border-b border-rose-100">
                <tr>
                  <th className="p-3">Kode Barang</th>
                  <th className="p-3">Nama Barang</th>
                  <th className="p-3">Saluran Aktif</th>
                  <th className="p-3 text-right">Sisa Stok</th>
                  <th className="p-3 text-right">Batas Min</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {paginatedCriticalItems.map((item) => (
                  <tr key={item.kodebarang} className="hover:bg-rose-50/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{item.kodebarang}</td>
                    <td className="p-3 font-semibold text-slate-800">{item.namabarang}</td>
                    <td className="p-3">
                      <span className="capitalize px-2 py-0.5 bg-slate-100 rounded-md text-slate-700 font-medium">
                        {item.lokasi || 'gudang'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-extrabold text-rose-600">
                      {item.stok} {item.satuan}
                    </td>
                    <td className="p-3 text-right text-slate-500">{getMinimumStockForItem(item, minStockSettings)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-100 text-rose-700">
                        {item.stok === 0 ? 'HABIS (0)' : 'MENIPIS'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={criticalPage}
            totalItems={filteredCriticalItems.length}
            pageSize={criticalPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageChange={setCriticalPage}
            onPageSizeChange={(size) => {
              setCriticalPageSize(size);
              setCriticalPage(1);
            }}
            itemName="barang kritis"
            className="-mx-6 -mb-6 rounded-b-3xl border-rose-100"
          />
        </div>
      )}

      {/* 6. REAL-TIME AUDIT LOG MUTASI & SINKRONISASI STOK */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Log Mutasi & Sinkronisasi Stok Terbaru
              </h3>
              <p className="text-xs text-slate-400">
                Seluruh riwayat perpindahan, opname fisik, dan pemotongan stok lintas saluran
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="text-[11px]">Per Halaman:</span>
              <select
                value={mutasiPageSize}
                onChange={(e) => {
                  setMutasiPageSize(Number(e.target.value));
                  setMutasiPage(1);
                }}
                className="px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={150}>150</option>
                <option value={200}>200</option>
              </select>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {mutasiCounts[mutasiFilter]} rekaman audit
            </span>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter tipe transaksi">
          {MUTASI_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={mutasiFilter === filter.id}
              onClick={() => setMutasiFilter(filter.id)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${mutasiFilter === filter.id ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {filter.label} <span className={mutasiFilter === filter.id ? 'text-indigo-100' : 'text-slate-400'}>({mutasiCounts[filter.id]})</span>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Waktu Sync</th>
                <th className="p-3">Kode Barang</th>
                <th className="p-3">Nama Produk</th>
                <th className="p-3 text-center">Tipe Transaksi</th>
                <th className="p-3">Lokasi</th>
                <th className="p-3 text-right">Stok Sebelum</th>
                <th className="p-3 text-right">Perubahan</th>
                <th className="p-3 text-right">Stok Akhir</th>
                <th className="p-3">Petugas</th>
                <th className="p-3">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMutasi.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-xs text-slate-400">
                    Belum ada riwayat mutasi stok tercatat.
                  </td>
                </tr>
              ) : (
                paginatedMutasi.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-slate-500 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString('id-ID', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">{m.kodebarang}</td>
                    <td className="p-3 font-semibold text-slate-800">
                      {m.namabarang || barangByKode.get(m.kodebarang)?.namabarang || '-'}
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        size="sm"
                        variant={
                          m.tipe === 'transfer'
                            ? 'info'
                            : m.tipe === 'opname'
                            ? 'purple'
                            : m.tipe === 'barang_masuk'
                            ? 'primary'
                            : 'warning'
                        }
                      >
                        {m.tipe.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-3 whitespace-nowrap">{getMutationLocation(m)}</td>
                    <td className="p-3 text-right text-slate-600">{m.stok_sebelum}</td>
                    <td className="p-3 text-right font-bold">
                      {m.perubahan > 0 ? (
                        <span className="text-emerald-600">+{m.perubahan}</span>
                      ) : m.perubahan < 0 ? (
                        <span className="text-rose-600">{m.perubahan}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-extrabold text-slate-900">{m.stok_sesudah}</td>
                    <td className="p-3 font-semibold text-slate-700">{m.user_name || '-'}</td>
                    <td className="p-3 text-slate-500 truncate max-w-xs">{m.keterangan || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <Pagination
          currentPage={mutasiPage}
          totalItems={filteredMutasi.length}
          pageSize={mutasiPageSize}
          pageSizeOptions={[25, 50, 100, 150, 200]}
          onPageChange={setMutasiPage}
          onPageSizeChange={setMutasiPageSize}
          itemName="mutasi"
        />
      </div>

    </div>
  );
};

