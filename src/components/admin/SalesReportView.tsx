import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  Search, 
  ArrowDownToLine, 
  DollarSign, 
  ShoppingBag, 
  User, 
  Receipt,
  Calendar,
  Trash2
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { PenjualanHistory, canUseCashier, getCashierSalesLocation } from '../../types';
import { exportToExcel } from '../../lib/excel';
import { Badge } from '../common/Badge';
import { Pagination } from '../common/Pagination';
import { ConfirmDialog } from '../common/ConfirmDialog';

type SalesReportRecord = PenjualanHistory & { isLegacyFromMutation?: boolean };

function formatSalesLocation(location?: string): string {
  switch (location) {
    case 'gudang': return 'Gudang';
    case 'toko': return 'Toko';
    case 'reseller': return 'Reseller';
    case 'online': return 'Online';
    case 'cacat': return 'Barang Cacat';
    default: return location || '-';
  }
}

export const SalesReportView: React.FC = () => {
  const { penjualanList, mutasiList, barangList, deleteSalesRecord } = useInventory();
  const { users, isAdmin } = useAuth();
  const [saleToDelete, setSaleToDelete] = useState<SalesReportRecord | null>(null);
  const [isDeletingSale, setIsDeletingSale] = useState(false);
  const [saleDeleteError, setSaleDeleteError] = useState('');

  const handleConfirmDeleteSale = async () => {
    if (!saleToDelete || isDeletingSale) return;
    setIsDeletingSale(true);
    const result = await deleteSalesRecord(saleToDelete.id);
    setIsDeletingSale(false);
    if (result.success) {
      setSaleToDelete(null);
      setSaleDeleteError('');
    } else {
      setSaleDeleteError(result.message);
    }
  };

  // Filters
  const [selectedCashier, setSelectedCashier] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Cashier list
  const cashierUsers = useMemo(() => {
    return users.filter((u) => canUseCashier(u.role));
  }, [users]);

  const reportSales = useMemo(() => {
    const userById = new Map<string, typeof users[number]>(users.map((user): [string, typeof user] => [user.id, user]));
    const userByName = new Map<string, typeof users[number]>(users.map((user): [string, typeof user] => [user.name.trim().toLowerCase(), user]));
    const findCashier = (userId: string, userName: string) =>
      userById.get(userId) || userByName.get(userName.trim().toLowerCase());
    const existingSales = penjualanList.map((sale) => {
      const cashier = findCashier(sale.user_id, sale.user_name);
      return {
        ...sale,
        lokasi: sale.lokasi || (cashier ? getCashierSalesLocation(cashier.role) || undefined : undefined),
        isLegacyFromMutation: false,
      };
    });
    const existingKeys = new Set(existingSales.map((sale) => [
      sale.user_id,
      sale.kodebarang.trim().toUpperCase(),
      sale.created_at,
      sale.jumlah_terjual,
    ].join('|')));
    const barangByCode = new Map<string, typeof barangList[number]>(barangList.map((barang): [string, typeof barang] => [barang.kodebarang.trim().toUpperCase(), barang]));
    const reconstructed = mutasiList
      .filter((mutation) => mutation.tipe === 'penjualan')
      .filter((mutation) => {
        const key = [
          mutation.user_id,
          mutation.kodebarang.trim().toUpperCase(),
          mutation.created_at,
          Math.abs(mutation.perubahan),
        ].join('|');
        return !existingKeys.has(key);
      })
      .map((mutation): SalesReportRecord => {
        const soldQuantity = Math.abs(mutation.perubahan);
        const barang = barangByCode.get(mutation.kodebarang.trim().toUpperCase());
        const unitPrice = Number(barang?.hargajual || 0);
        const cashier = findCashier(mutation.user_id, mutation.user_name || '');
        return {
          id: `legacy-mutation-${mutation.id}`,
          kodebarang: mutation.kodebarang,
          namabarang: mutation.namabarang || barang?.namabarang || '-',
          jumlah_terjual: soldQuantity,
          hargajual: unitPrice,
          total_nilai: unitPrice * soldQuantity,
          user_id: mutation.user_id,
          user_name: mutation.user_name || cashier?.name || '-',
          lokasi: cashier ? getCashierSalesLocation(cashier.role) || undefined : undefined,
          keterangan: unitPrice > 0
            ? 'Riwayat dari log mutasi; nilai memakai harga jual saat ini.'
            : 'Riwayat dari log mutasi; harga historis tidak tersedia.',
          created_at: mutation.created_at,
          isLegacyFromMutation: true,
        };
      });

    return [...existingSales, ...reconstructed]
      .sort((first, second) => second.created_at.localeCompare(first.created_at));
  }, [penjualanList, mutasiList, barangList, users]);

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return reportSales.filter((item) => {
      const matchCashier = selectedCashier === 'all' || item.user_id === selectedCashier;
      const itemDate = item.created_at.split('T')[0];
      const matchStart = !startDate || itemDate >= startDate;
      const matchEnd = !endDate || itemDate <= endDate;

      const matchQuery =
        !searchQuery ||
        item.namabarang.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.kodebarang.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.keterangan && item.keterangan.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchCashier && matchStart && matchEnd && matchQuery;
    });
  }, [reportSales, selectedCashier, startDate, endDate, searchQuery]);

  // Pagination (25, 50, 100, 150, 200 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCashier, startDate, endDate, searchQuery, pageSize]);

  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, currentPage, pageSize]);

  // Aggregate Metrics
  const totalOmset = useMemo(() => {
    return filteredSales.reduce((acc, curr) => acc + curr.total_nilai, 0);
  }, [filteredSales]);

  const totalQtyTerjual = useMemo(() => {
    return filteredSales.reduce((acc, curr) => acc + curr.jumlah_terjual, 0);
  }, [filteredSales]);

  const exportSalesExcel = () => {
    const data = filteredSales.map((item, idx) => ({
      No: idx + 1,
      Tanggal: new Date(item.created_at).toLocaleString('id-ID'),
      Kasir: item.user_name,
      Lokasi: formatSalesLocation(item.lokasi),
      'Kode Barang': item.kodebarang,
      'Nama Barang': item.namabarang,
      'Jumlah Terjual': item.jumlah_terjual,
      'Harga Jual (Rp)': item.hargajual,
      'Total Nilai (Rp)': item.total_nilai,
      Keterangan: item.keterangan || '-',
    }));
    exportToExcel(data, `Laporan_Penjualan_Kasir_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            Laporan Penjualan Semua Kasir & Shift
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Analisis transaksi penjualan POS hasil upload Excel seluruh kasir secara terpusat
          </p>
        </div>

        <button
          onClick={exportSalesExcel}
          disabled={filteredSales.length === 0}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
        >
          <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
          Export Laporan Excel
        </button>
      </div>

      {saleDeleteError && (
        <div role="alert" className="p-3 text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl">
          {saleDeleteError}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Omset Penjualan</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            Rp {totalOmset.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold">
            Dari {filteredSales.length.toLocaleString('id-ID')} transaksi penjualan
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Produk Terjual (Pcs)</span>
            <ShoppingBag className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {totalQtyTerjual.toLocaleString('id-ID')} Pcs
          </div>
          <div className="text-[11px] text-blue-600 font-semibold">
            Stok otomatis terpotong di database
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Rata-rata Transaksi</span>
            <Receipt className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            Rp{' '}
            {filteredSales.length > 0
              ? Math.round(totalOmset / filteredSales.length).toLocaleString('id-ID')
              : 0}
          </div>
          <div className="text-[11px] text-purple-600 font-semibold">
            Per entri nota penjualan
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <form onSubmit={(e) => { e.preventDefault(); setSearchQuery(searchInput); }} className="relative lg:col-span-2 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama barang / kode / kasir..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button type="submit" className="px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl inline-flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              Cari
            </button>
          </form>

          <div>
            <select
              value={selectedCashier}
              onChange={(e) => setSelectedCashier(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">Semua Kasir</option>
              {cashierUsers.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              title="Dari Tanggal"
            />
          </div>
        </div>

        {(selectedCashier !== 'all' || startDate || endDate || searchQuery) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Menampilkan {filteredSales.length} dari {reportSales.length} transaksi
            </span>
            <button
              onClick={() => {
                setSelectedCashier('all');
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
              }}
              className="text-blue-600 font-semibold hover:underline"
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* Table Action & Page Size Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="text-slate-600 font-medium">
          Ditemukan <span className="font-bold text-slate-900">{filteredSales.length.toLocaleString('id-ID')}</span> transaksi penjualan
          {filteredSales.length > 0 && (
            <span className="text-slate-400 ml-1">
              (Halaman {currentPage} dari {Math.max(1, Math.ceil(filteredSales.length / pageSize))})
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

      {/* Sales Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3.5">Tanggal & Waktu</th>
                <th className="py-3 px-3.5">Kasir</th>
                <th className="py-3 px-3.5 text-center">Lokasi</th>
                <th className="py-3 px-3.5">Kode Barang</th>
                <th className="py-3 px-3.5">Nama Produk</th>
                <th className="py-3 px-3.5 text-right">Qty Terjual</th>
                <th className="py-3 px-3.5 text-right">Harga Jual</th>
                <th className="py-3 px-3.5 text-right">Total Nilai</th>
                <th className="py-3 px-3.5">Keterangan</th>
                {isAdmin && <th className="py-3 px-3.5 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="py-8 text-center text-slate-400">
                    Tidak ada transaksi penjualan yang cocok.
                  </td>
                </tr>
              ) : (
                paginatedSales.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3.5 text-slate-500 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleString('id-ID', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-slate-900">
                      {item.user_name}
                    </td>
                    <td className="py-2.5 px-3.5 text-center font-semibold text-slate-600">
                      {formatSalesLocation(item.lokasi)}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono font-bold text-slate-700">
                      {item.kodebarang}
                    </td>
                    <td className="py-2.5 px-3.5 font-medium text-slate-900 max-w-xs truncate">
                      {item.namabarang}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-bold text-blue-600">
                      {item.jumlah_terjual}
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-slate-600">
                      {item.hargajual.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-bold text-emerald-700">
                      {item.total_nilai.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-500 truncate max-w-xs">
                      {item.keterangan || '-'}
                    </td>
                    {isAdmin && !item.isLegacyFromMutation && (
                      <td className="py-2.5 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setSaleToDelete(item)}
                          title="Hapus transaksi dan kembalikan stok"
                          aria-label={`Hapus penjualan ${item.namabarang} dan kembalikan stok`}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredSales.length}
          pageSize={pageSize}
          pageSizeOptions={[25, 50, 100, 150, 200]}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemName="transaksi"
        />
      </div>

      <ConfirmDialog
        isOpen={Boolean(saleToDelete)}
        onClose={() => {
          if (!isDeletingSale) setSaleToDelete(null);
        }}
        onConfirm={() => { void handleConfirmDeleteSale(); }}
        title="Hapus Transaksi Penjualan"
        message={saleToDelete
          ? `Hapus penjualan ${saleToDelete.namabarang} sebanyak ${saleToDelete.jumlah_terjual} dan kembalikan stok ke lokasi ${formatSalesLocation(saleToDelete.lokasi)}? Tindakan ini akan dicatat sebagai mutasi pembalik.`
          : ''}
        confirmText="Hapus & Kembalikan Stok"
        type="danger"
        isLoading={isDeletingSale}
      />
    </div>
  );
};
