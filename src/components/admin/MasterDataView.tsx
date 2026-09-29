import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ArrowDownToLine, 
  ArrowUpDown,
  Edit3, 
  Trash2, 
  Package, 
  Barcode, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Tag,
  Layers
} from 'lucide-react';
import { useInventory, getItemLocationStock } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { Barang, StockLocation } from '../../types';
import { exportToExcel, exportToCsv } from '../../lib/excel';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Pagination } from '../common/Pagination';
import { getMinimumStockForItem } from '../../lib/minStock';
import { normalizeItemCode } from '../../lib/itemCode';

export const MasterDataView: React.FC = () => {
  const { 
    barangList, 
    addBarang, 
    updateBarang, 
    deleteBarang, 
    clearAllMasterData, 
    minStockSettings,
    suppliers
  } = useInventory();
  const { currentUser, isAdmin } = useAuth();

  // Search & Filter
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [clearAllPassword, setClearAllPassword] = useState('');
  const [clearAllPasswordError, setClearAllPasswordError] = useState('');

  const [activeItem, setActiveItem] = useState<Barang | null>(null);

  // Form State
  const initialForm: Omit<Barang, 'updated_at'> = {
    kodebarang: '',
    kodebarcode: '',
    namabarang: '',
    jenis: 'Sembako',
    merek: '',
    satuan: 'Pcs',
    hargapokok: 0,
    hargajual: 0,
    stok: 0,
    supplier: '',
    lokasi: 'gudang',
    min_stok: 10,
  };
  const [formData, setFormData] = useState<Omit<Barang, 'updated_at'>>(initialForm);

  type SortKey = 'kodebarang' | 'namabarang' | 'merek' | 'hargapokok' | 'hargajual' | 'stok' | 'supplier';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'kodebarang', direction: 'asc' });

  // Categories list (Jenis)
  const categories = useMemo(() => {
    const set = new Set(barangList.map((b) => b.jenis).filter(Boolean));
    return Array.from(set);
  }, [barangList]);

  // Brands list (Merek)
  const brands = useMemo(() => {
    const set = new Set(barangList.map((b) => b.merek).filter(Boolean));
    return Array.from(set);
  }, [barangList]);

  const supplierNames = useMemo(() => {
    const set = new Set([
      ...suppliers.map((supplier) => supplier.nama),
      ...barangList.map((item) => item.supplier),
    ].filter(Boolean));
    return Array.from(set).sort((first, second) => first.localeCompare(second, 'id', { sensitivity: 'base' }));
  }, [barangList, suppliers]);

  // Filtered List
  const filteredBarang = useMemo(() => {
    const result = barangList.filter((item) => {
      const matchSearch =
        item.namabarang.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.kodebarang.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.kodebarcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.merek.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.jenis.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.supplier.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCat = selectedCategory === 'all' || item.jenis === selectedCategory;
      const matchBrand = selectedBrand === 'all' || item.merek === selectedBrand;
      const matchSupplier = selectedSupplier === 'all' || item.supplier === selectedSupplier;
      const matchLoc = selectedLocation === 'all' || item.lokasi === selectedLocation;

      return matchSearch && matchCat && matchBrand && matchSupplier && matchLoc;
    });
    return result.sort((first, second) => {
      const left = first[sortConfig.key];
      const right = second[sortConfig.key];
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left || '').localeCompare(String(right || ''), 'id', { numeric: true, sensitivity: 'base' });
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [barangList, searchQuery, selectedCategory, selectedBrand, selectedSupplier, selectedLocation, sortConfig]);

  const sortHeader = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th scope="col" aria-sort={sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`py-3 px-3.5 ${align === 'right' ? 'text-right' : ''}`}>
      <button type="button" onClick={() => setSortConfig((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))} className={`inline-flex items-center gap-1.5 hover:text-indigo-700 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}<ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
    </th>
  );

  // Pagination for Master Data (20.000+ Barang)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedBrand, selectedSupplier, selectedLocation, pageSize]);

  const paginatedBarang = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBarang.slice(start, start + pageSize);
  }, [filteredBarang, currentPage, pageSize]);

  // Handlers
  const handleOpenAdd = () => {
    setFormData({
      ...initialForm,
      kodebarang: `BRG-00${barangList.length + 1}`,
      kodebarcode: `899${Math.floor(1000000000 + Math.random() * 9000000000)}`,
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (item: Barang) => {
    setActiveItem(item);
    setFormData({
      kodebarang: item.kodebarang,
      kodebarcode: item.kodebarcode,
      namabarang: item.namabarang,
      jenis: item.jenis,
      merek: item.merek,
      satuan: item.satuan,
      hargapokok: item.hargapokok,
      hargajual: item.hargajual,
      stok: item.stok,
      supplier: item.supplier,
      lokasi: item.lokasi || 'gudang',
      min_stok: item.min_stok || 10,
    });
    setIsEditModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.kodebarang || !formData.namabarang) return;
    const ok = await addBarang({ ...formData, kodebarang: normalizeItemCode(formData.kodebarang) });
    if (ok) setIsAddModalOpen(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    const ok = await updateBarang(activeItem.kodebarang, formData);
    if (ok) setIsEditModalOpen(false);
  };

  const handleDelete = async () => {
    if (!activeItem) return;
    const ok = await deleteBarang(activeItem.kodebarang);
    if (ok) setIsDeleteModalOpen(false);
  };

  const handleConfirmClearAll = async () => {
    const expectedPassword = currentUser.password || (currentUser.role === 'admin' ? 'admin123' : '123456');
    if (!clearAllPassword.trim() || clearAllPassword.trim() !== expectedPassword) {
      setClearAllPasswordError('Sandi salah. Data master tidak dihapus.');
      return;
    }

    await clearAllMasterData();
    setClearAllPassword('');
    setClearAllPasswordError('');
    setIsClearAllModalOpen(false);
  };

  const handleCloseClearAll = () => {
    setClearAllPassword('');
    setClearAllPasswordError('');
    setIsClearAllModalOpen(false);
  };

  const handleExportCsv = () => {
    const data = (filteredBarang.length > 0 ? filteredBarang : barangList).map((b) => ({
      kodebarang: b.kodebarang,
      kodebarcode: b.kodebarcode,
      namabarang: b.namabarang,
      jenis: b.jenis,
      merek: b.merek,
      satuan: b.satuan,
      hargapokok: b.hargapokok,
      hargajual: b.hargajual,
      stok: b.stok,
      supplier: b.supplier,
      lokasi: b.lokasi || 'gudang',
      min_stok: b.min_stok || 10,
    }));
    exportToCsv(data, `database`);
  };

  const handleExportExcel = () => {
    const data = (filteredBarang.length > 0 ? filteredBarang : barangList).map((b) => ({
      'Kode Barang': b.kodebarang,
      'Kode Barcode': b.kodebarcode,
      'Nama Barang': b.namabarang,
      Jenis: b.jenis,
      Merek: b.merek,
      Satuan: b.satuan,
      'Harga Pokok (Rp)': b.hargapokok,
      'Harga Jual (Rp)': b.hargajual,
      Stok: b.stok,
      'Lokasi Stok': b.lokasi || 'gudang',
      Supplier: b.supplier,
    }));
    exportToExcel(data, `database_barang_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Package className="w-5 h-5" />
            </div>
            Master Data Barang
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Database katalog barang, barcode, merek, jenis, harga pokok, harga jual, dan stok
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <button
                onClick={handleOpenAdd}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-indigo-600" />
                Tambah Manual
              </button>

              {barangList.length > 0 && (
                <button
                  onClick={() => {
                    setClearAllPassword('');
                    setClearAllPasswordError('');
                    setIsClearAllModalOpen(true);
                  }}
                  title="Hapus semua barang demo dan kosongkan database"
                  className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Kosongkan Data
                </button>
              )}
            </>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={handleExportCsv}
              title="Download database saat ini dalam format database.csv"
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              database.csv
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar with Brand & Jenis */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearchQuery(searchInput);
          }}
          className="relative sm:col-span-1 flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, barcode, merek, jenis..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl inline-flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            Cari
          </button>
        </form>

        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
          >
            <option value="all">Semua Jenis / Kategori ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
          >
            <option value="all">Semua Merek / Brand ({brands.length})</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
          >
            <option value="all">Semua Supplier ({supplierNames.length})</option>
            {supplierNames.map((supplier) => (
              <option key={supplier} value={supplier}>
                {supplier}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
          >
            <option value="all">Semua Saluran</option>
            <option value="gudang">Gudang Utama</option>
            <option value="toko">Toko Pusat</option>
            <option value="reseller">Mitra Reseller</option>
            <option value="online">Online / Marketplace</option>
            <option value="cacat">Barang Cacat</option>
          </select>
        </div>
      </div>

      {/* Quick Summary & Page Size Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="text-slate-600 font-medium">
          Ditemukan <span className="font-bold text-slate-900">{filteredBarang.length.toLocaleString('id-ID')}</span> barang di database
          {filteredBarang.length > 0 && (
            <span className="text-slate-400 ml-1">
              (Halaman {currentPage} dari {Math.max(1, Math.ceil(filteredBarang.length / pageSize))})
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

      {/* Master Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                {sortHeader('kodebarang', 'Kode / Barcode')}
                {sortHeader('namabarang', 'Nama Barang')}
                {sortHeader('merek', 'Merek')}
                <th className="py-3 px-3.5">Alokasi Multi-Lokasi (Read-Only)</th>
                {sortHeader('hargapokok', 'Harga Pokok', 'right')}
                {sortHeader('hargajual', 'Harga Jual', 'right')}
                {sortHeader('stok', 'Stok Total', 'right')}
                {sortHeader('supplier', 'Supplier')}
                {isAdmin && <th className="py-3 px-3.5 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {barangList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-slate-800 text-sm">Database Barang Masih Kosong</div>
                      <p className="text-xs text-slate-500">
                        Demo barang telah dihapus. Silakan unggah file <strong>database.csv</strong> Anda atau tambahkan barang secara manual.
                      </p>
                      <p className="pt-2 text-xs text-slate-500">Gunakan tombol Tambah Manual untuk memasukkan barang.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredBarang.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Tidak ada data barang yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                paginatedBarang.map((item) => {
                  const isLowStock = item.stok <= getMinimumStockForItem(item, minStockSettings);
                  const gudangQty = getItemLocationStock(item, 'gudang');
                  const tokoQty = getItemLocationStock(item, 'toko');
                  const resellerQty = getItemLocationStock(item, 'reseller');
                  const onlineQty = getItemLocationStock(item, 'online');
                  const cacatQty = getItemLocationStock(item, 'cacat');

                  return (
                    <tr key={item.kodebarang} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3.5">
                        <div className="font-mono font-bold text-slate-900">{item.kodebarang}</div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <Barcode className="w-3 h-3 text-slate-400" />
                          {item.kodebarcode}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-900 max-w-xs">
                        {item.namabarang}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="font-semibold text-indigo-900 flex items-center gap-1">
                          <Tag className="w-3 h-3 text-indigo-400" />
                          {item.merek || '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 min-w-[260px]">
                        {/* Read-Only Multi-Location Breakdown */}
                        <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                          <div className="px-1.5 py-0.5 rounded bg-blue-50/80 border border-blue-100 text-blue-800 flex items-center justify-between">
                            <span className="font-sans font-semibold">Gudang:</span>
                            <span className="font-bold">{gudangQty}</span>
                          </div>
                          <div className="px-1.5 py-0.5 rounded bg-cyan-50/80 border border-cyan-100 text-cyan-800 flex items-center justify-between">
                            <span className="font-sans font-semibold">Toko:</span>
                            <span className="font-bold">{tokoQty}</span>
                          </div>
                          <div className="px-1.5 py-0.5 rounded bg-amber-50/80 border border-amber-100 text-amber-800 flex items-center justify-between">
                            <span className="font-sans font-semibold">Reseller:</span>
                            <span className="font-bold">{resellerQty}</span>
                          </div>
                          <div className="px-1.5 py-0.5 rounded bg-emerald-50/80 border border-emerald-100 text-emerald-800 flex items-center justify-between">
                            <span className="font-sans font-semibold">Online:</span>
                            <span className="font-bold">{onlineQty}</span>
                          </div>
                          <div className="px-1.5 py-0.5 rounded bg-rose-50/80 border border-rose-100 text-rose-800 flex items-center justify-between">
                            <span className="font-sans font-semibold">Cacat:</span>
                            <span className="font-bold">{cacatQty}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-600">
                        {item.hargapokok.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-blue-700">
                        {item.hargajual.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-md ${
                            isLowStock
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'text-slate-800'
                          }`}
                        >
                          {item.stok}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 truncate max-w-[140px]">
                        {item.supplier}
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenEdit(item)}
                              title="Edit Barang"
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setActiveItem(item);
                                setIsDeleteModalOpen(true);
                              }}
                              title="Hapus Barang"
                              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
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

        {/* Pagination Controls */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredBarang.length}
          pageSize={pageSize}
          pageSizeOptions={[25, 50, 100, 150, 200]}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemName="barang"
        />
      </div>

      {/* MODAL: Tambah / Edit Barang */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
        }}
        title={isAddModalOpen ? 'Tambah Master Data Barang' : 'Edit Master Data Barang'}
        subtitle="Pastikan kode barang dan barcode unik untuk validasi POS"
        maxWidth="2xl"
      >
        <form onSubmit={isAddModalOpen ? handleSaveAdd : handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Barang (PK)</label>
              <input
                type="text"
                required
                disabled={isEditModalOpen}
                value={formData.kodebarang}
                pattern="[A-Za-z0-9]+"
                title="Kode barang hanya boleh berisi huruf dan angka."
                onChange={(e) => setFormData({ ...formData, kodebarang: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-slate-100"
                placeholder="Contoh: BRG-001"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Barcode / EAN</label>
              <input
                type="text"
                required
                value={formData.kodebarcode}
                onChange={(e) => setFormData({ ...formData, kodebarcode: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="Contoh: 8992761110012"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Barang</label>
              <input
                type="text"
                required
                value={formData.namabarang}
                onChange={(e) => setFormData({ ...formData, namabarang: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                placeholder="Nama lengkap produk..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Jenis / Kategori</label>
              <input
                type="text"
                required
                value={formData.jenis}
                onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                placeholder="Sembako, Minuman, Snack, dll"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Merek</label>
              <input
                type="text"
                required
                value={formData.merek}
                onChange={(e) => setFormData({ ...formData, merek: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                placeholder="Merek produk"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Satuan</label>
              <input
                type="text"
                required
                value={formData.satuan}
                onChange={(e) => setFormData({ ...formData, satuan: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                placeholder="Pcs, Dus, Renceng, Botol"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Supplier / Vendor</label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                placeholder="PT Distributor..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Harga Pokok (HPP)</label>
              <input
                type="number"
                min="0"
                required
                value={formData.hargapokok}
                onChange={(e) => setFormData({ ...formData, hargapokok: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Harga Jual</label>
              <input
                type="number"
                min="0"
                required
                value={formData.hargajual}
                onChange={(e) => setFormData({ ...formData, hargajual: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Stok Awal</label>
              <input
                type="number"
                min="0"
                required
                value={formData.stok}
                onChange={(e) => setFormData({ ...formData, stok: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Lokasi Saluran</label>
              <select
                value={formData.lokasi}
                onChange={(e) => setFormData({ ...formData, lokasi: e.target.value as StockLocation })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="gudang">Gudang Utama</option>
                <option value="toko">Toko Pusat</option>
                <option value="reseller">Mitra Reseller</option>
                <option value="online">Online / Marketplace</option>
                <option value="cacat">Barang Cacat</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Simpan Data Barang
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Master Barang"
        message={`Apakah Anda yakin ingin menghapus barang "${activeItem?.namabarang}" (${activeItem?.kodebarang})?\n\nTindakan ini akan menghapus data barang dari sistem.`}
        confirmText="Hapus Barang"
        type="danger"
      />

      {/* Clear All Demo Confirmation */}
      <Modal
        isOpen={isClearAllModalOpen}
        onClose={handleCloseClearAll}
        title="Kosongkan Semua Data Master Barang"
        subtitle="Verifikasi sandi admin diperlukan untuk melanjutkan."
        maxWidth="md"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleConfirmClearAll();
          }}
          className="space-y-5"
        >
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
            Tindakan ini akan menghapus semua data master barang dan riwayat terkait. Data tidak dapat dipulihkan dari aplikasi.
          </div>
          <div>
            <label htmlFor="clear-all-password" className="block text-xs font-bold text-slate-700 mb-1.5">
              Sandi akun admin ({currentUser.name})
            </label>
            <input
              id="clear-all-password"
              type="password"
              value={clearAllPassword}
              onChange={(event) => {
                setClearAllPassword(event.target.value);
                setClearAllPasswordError('');
              }}
              placeholder="Masukkan sandi admin"
              autoFocus
              className={`w-full px-3.5 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 ${
                clearAllPasswordError
                  ? 'border-rose-400 focus:ring-rose-200'
                  : 'border-slate-200 focus:ring-rose-200'
              }`}
            />
            {clearAllPasswordError && (
              <p className="mt-1.5 text-xs font-semibold text-rose-600">{clearAllPasswordError}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCloseClearAll}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
            >
              Kosongkan Sekarang
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

