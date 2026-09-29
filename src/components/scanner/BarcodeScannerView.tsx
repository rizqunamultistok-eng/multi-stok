import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Barcode, 
  Package, 
  CheckCircle2, 
  XCircle, 
  Volume2, 
  History, 
  Edit3, 
  Tag, 
  Layers,
  ArrowRightLeft
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { sound } from '../../lib/sound';
import { Barang, StockLocation } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { Pagination } from '../common/Pagination';

export const BarcodeScannerView: React.FC = () => {
  const { barangList, updateBarang } = useInventory();

  const [inputCode, setInputCode] = useState('');
  const [scannedProduct, setScannedProduct] = useState<Barang | null>(null);
  const [scanHistory, setScanHistory] = useState<{ barang: Barang; timestamp: string }[]>([]);
  const [notFoundQuery, setNotFoundQuery] = useState<string | null>(null);

  // Pagination for Scan History (25, 50, 100, 150, 200)
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);

  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return scanHistory.slice(start, start + historyPageSize);
  }, [scanHistory, historyPage, historyPageSize]);

  // Quick adjust modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [newStok, setNewStok] = useState(0);
  const [newLocation, setNewLocation] = useState<StockLocation>('gudang');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleScanOrSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputCode.trim();
    if (!query) return;

    // Look up by barcode or kodebarang
    const found = barangList.find(
      (b) =>
        b.kodebarcode.toLowerCase() === query.toLowerCase() ||
        b.kodebarang.toLowerCase() === query.toLowerCase()
    );

    if (found) {
      sound.playScannerBeep();
      setScannedProduct(found);
      setNotFoundQuery(null);
      setNewStok(found.stok);
      setNewLocation((found.lokasi as StockLocation) || 'gudang');
      setScanHistory((prev) => [
        { barang: found, timestamp: new Date().toISOString() },
        ...prev.slice(0, 19),
      ]);
    } else {
      sound.playErrorBeep();
      setScannedProduct(null);
      setNotFoundQuery(query);
    }

    setInputCode('');
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedProduct) return;

    await updateBarang(scannedProduct.kodebarang, {
      stok: newStok,
      lokasi: newLocation,
    });

    setScannedProduct((prev) =>
      prev ? { ...prev, stok: newStok, lokasi: newLocation } : null
    );
    setIsAdjustModalOpen(false);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Input Scanner Area */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <form onSubmit={handleScanOrSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Barcode className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Arahkan barcode scanner ke sini atau ketik barcode..."
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              className="w-full pl-11 pr-4 py-3 text-sm font-mono border-2 border-blue-500 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-100 bg-blue-50/20"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            Cari / Scan
          </button>
        </form>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-blue-600" />
            Notifikasi audio aktif (Beep jika ada di DB, Error buzzer jika tidak ada)
          </span>
          <span className="hidden sm:inline font-mono text-[11px] text-slate-400">
            Tekan Enter setelah scan
          </span>
        </div>
      </div>

      {/* RESULT PRODUCT CARD */}
      {scannedProduct ? (
        <div className="bg-white rounded-2xl border-2 border-emerald-500 p-6 shadow-md space-y-5 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="success" size="md">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Produk Terdaftar
                </Badge>
                <Badge variant="primary" size="md">
                  {scannedProduct.jenis}
                </Badge>
                <Badge size="md">
                  {(scannedProduct.lokasi || 'gudang').toUpperCase()}
                </Badge>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-2">
                {scannedProduct.namabarang}
              </h2>
              <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-500 pt-1">
                <span>Kode: <strong>{scannedProduct.kodebarang}</strong></span>
                <span>Barcode: <strong>{scannedProduct.kodebarcode}</strong></span>
                <span>Merek: <strong>{scannedProduct.merek}</strong></span>
                <span>Satuan: <strong>{scannedProduct.satuan}</strong></span>
              </div>
            </div>

            <button
              onClick={() => setIsAdjustModalOpen(true)}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5 self-start"
            >
              <Edit3 className="w-4 h-4 text-blue-600" />
              Sesuaikan Stok / Saluran
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Sisa Stok Fisik</div>
              <div className="text-2xl font-black text-blue-600 mt-1">
                {scannedProduct.stok} {scannedProduct.satuan}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Harga Jual Retail</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                Rp {scannedProduct.hargajual.toLocaleString('id-ID')}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Harga Pokok (HPP)</div>
              <div className="text-2xl font-black text-slate-700 mt-1">
                Rp {scannedProduct.hargapokok.toLocaleString('id-ID')}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Supplier</div>
              <div className="text-sm font-bold text-slate-800 mt-2 truncate">
                {scannedProduct.supplier}
              </div>
            </div>
          </div>
        </div>
      ) : notFoundQuery ? (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-6 text-center space-y-2 animate-in fade-in duration-150">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-rose-950">
            Produk Tidak Ditemukan
          </h3>
          <p className="text-xs text-rose-800">
            Kode barcode atau SKU <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-rose-300">{notFoundQuery}</code> tidak terdaftar di database barang.
          </p>
        </div>
      ) : null}

      {/* Scan History Log */}
      {scanHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              Riwayat Scan Terakhir Sesi Ini ({scanHistory.length})
            </h3>
            {scanHistory.length > 25 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="text-[11px]">Per Halaman:</span>
                <select
                  value={historyPageSize}
                  onChange={(e) => {
                    setHistoryPageSize(Number(e.target.value));
                    setHistoryPage(1);
                  }}
                  className="px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={150}>150</option>
                  <option value={200}>200</option>
                </select>
              </div>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {paginatedHistory.map((item, idx) => (
              <div
                key={idx}
                onClick={() => setScannedProduct(item.barang)}
                className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg cursor-pointer transition-colors text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-700">
                    {item.barang.kodebarang}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {item.barang.namabarang}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-blue-600">
                    Stok: {item.barang.stok}
                  </span>
                  <span className="text-slate-400">
                    {new Date(item.timestamp).toLocaleTimeString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {scanHistory.length > 25 && (
            <Pagination
              currentPage={historyPage}
              totalItems={scanHistory.length}
              pageSize={historyPageSize}
              pageSizeOptions={[25, 50, 100, 150, 200]}
              onPageChange={setHistoryPage}
              onPageSizeChange={setHistoryPageSize}
              itemName="hasil scan"
            />
          )}
        </div>
      )}

      {/* Adjust Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Penyesuaian Stok Cepat"
        subtitle={scannedProduct?.namabarang}
        maxWidth="md"
      >
        <form onSubmit={handleSaveAdjustment} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Jumlah Stok Baru
            </label>
            <input
              type="number"
              min="0"
              required
              value={newStok}
              onChange={(e) => setNewStok(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Lokasi / Saluran Penyimpanan
            </label>
            <select
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value as StockLocation)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="gudang">Gudang Utama</option>
              <option value="toko">Toko Pusat</option>
              <option value="reseller">Mitra Reseller</option>
              <option value="online">Online / Marketplace</option>
              <option value="cacat">Barang Cacat</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
            >
              Simpan Perubahan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
