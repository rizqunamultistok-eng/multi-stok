import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, FilePlus2, PackagePlus, Plus, ReceiptText, Search, Trash2 } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { Barang } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { normalizeItemCode } from '../../lib/itemCode';

type ReceiptLine = {
  kodebarang: string;
  namabarang: string;
  jumlah: number;
  barangBaru?: Omit<Barang, 'updated_at'>;
};

function createInvoiceNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `BM-${date}-${suffix}`;
}

const emptyNewItem = (): Omit<Barang, 'updated_at'> => ({
  kodebarang: '',
  kodebarcode: '',
  namabarang: '',
  jenis: 'Umum',
  merek: '',
  satuan: 'Pcs',
  hargapokok: 0,
  hargajual: 0,
  stok: 0,
  supplier: '',
  lokasi: 'gudang',
  min_stok: 10,
});

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';

export const BarangMasukView: React.FC = () => {
  const { barangList, suppliers, barangMasukList, receiveGoods, deleteGoodsReceipt } = useInventory();
  const { isAdmin } = useAuth();
  const [nomorFaktur, setNomorFaktur] = useState(() => createInvoiceNumber());
  const [supplier, setSupplier] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [catatan, setCatatan] = useState('');
  const [mode, setMode] = useState<'lama' | 'baru'>('lama');
  const [query, setQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const resultListRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [newItem, setNewItem] = useState(emptyNewItem);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const submitLockRef = useRef(false);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  const [receiptToDelete, setReceiptToDelete] = useState<string | null>(null);
  const [isDeletingReceipt, setIsDeletingReceipt] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');

  const handleDeleteReceipt = async () => {
    if (!receiptToDelete) return;
    setIsDeletingReceipt(true);
    const result = await deleteGoodsReceipt(receiptToDelete);
    setIsDeletingReceipt(false);
    setHistoryMessage(result.message);
    if (result.success) setReceiptToDelete(null);
  };

  const matchingItems = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('id');
    if (!value) return [];
    return barangList.filter((item) =>
      [item.kodebarang, item.kodebarcode, item.namabarang].some((field) => field.toLocaleLowerCase('id').includes(value))
    ).slice(0, 30);
  }, [barangList, query]);
  const activeResultIndex = matchingItems.findIndex((item) => item.kodebarang === selectedCode);

  useEffect(() => {
    if (activeResultIndex < 0) return;
    resultListRef.current
      ?.querySelector(`[data-result-index="${activeResultIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeResultIndex]);

  const addExistingItem = (code = selectedCode) => {
    const item = barangList.find((entry) => entry.kodebarang === code);
    if (!item) {
      setErrorMessage('Pilih barang lama dari hasil pencarian kode atau barcode.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setErrorMessage('Jumlah barang harus bilangan bulat lebih dari nol.');
      return;
    }
    if (lines.some((line) => line.kodebarang.toUpperCase() === item.kodebarang.toUpperCase())) {
      setErrorMessage('Barang ini sudah ada di faktur.');
      return;
    }
    setLines((previous) => [...previous, { kodebarang: item.kodebarang, namabarang: item.namabarang, jumlah: quantity }]);
    setSelectedCode('');
    setQuery('');
    setQuantity(1);
    setErrorMessage('');
  };

  const addNewItem = () => {
    const code = normalizeItemCode(newItem.kodebarang);
    if (!code || !newItem.kodebarcode.trim() || !newItem.namabarang.trim()) {
      setErrorMessage('Kode barang, barcode, dan nama barang wajib diisi.');
      return;
    }
    if (barangList.some((item) => item.kodebarang.trim().toUpperCase() === code.toUpperCase()) || lines.some((line) => line.kodebarang.toUpperCase() === code.toUpperCase())) {
      setErrorMessage('Kode barang sudah terdaftar. Gunakan alur barang lama untuk menambah stok.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setErrorMessage('Jumlah barang harus bilangan bulat lebih dari nol.');
      return;
    }
    setLines((previous) => [...previous, {
      kodebarang: code,
      namabarang: newItem.namabarang.trim(),
      jumlah: quantity,
      barangBaru: { ...newItem, kodebarang: code, supplier: newItem.supplier || supplier.trim() },
    }]);
    setNewItem(emptyNewItem());
    setQuantity(1);
    setErrorMessage('');
  };

  const submitReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitLockRef.current) return;
    if (!nomorFaktur.trim() || !supplier.trim() || lines.length === 0) {
      setErrorMessage('Nomor faktur, supplier, dan minimal satu barang harus diisi.');
      return;
    }
    submitLockRef.current = true;
    setIsSaving(true);
    let saved = false;
    try {
      saved = await receiveGoods({
        nomor_faktur: nomorFaktur.trim(),
        supplier: supplier.trim(),
        supplier_kode: suppliers.find((item) => item.nama.trim().toLocaleLowerCase('id') === supplier.trim().toLocaleLowerCase('id'))?.kode,
        tanggal,
        catatan,
        items: lines.map(({ kodebarang, jumlah, barangBaru: newItemData }) => ({ kodebarang, jumlah, barangBaru: newItemData })),
      });
    } finally {
      submitLockRef.current = false;
      setIsSaving(false);
    }
    if (!saved) {
      setErrorMessage('Faktur belum tersimpan. Periksa kode barang dan jumlah setiap baris.');
      return;
    }
    setNomorFaktur(createInvoiceNumber());
    setSupplier('');
    setCatatan('');
    setLines([]);
    setErrorMessage('');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
          <ReceiptText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Barang Masuk</h1>
          <p className="mt-1 text-sm text-slate-600">Catat faktur pembelian dan tambahkan stok ke gudang.</p>
        </div>
      </header>

      <form onSubmit={submitReceipt} className="space-y-5">
        <section className="grid grid-cols-1 gap-4 border-b border-slate-200 pb-5 sm:grid-cols-3">
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            <span>Nomor Faktur</span>
            <input required value={nomorFaktur} readOnly className={`${inputClass} bg-slate-100 font-mono font-semibold`} aria-label="Nomor faktur otomatis" />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            <span>Supplier</span>
            <input required list="supplier-options" value={supplier} onChange={(event) => setSupplier(event.target.value)} className={inputClass} placeholder="Ketik atau pilih nama supplier" />
            <datalist id="supplier-options">
              {suppliers.map((item) => <option key={item.kode} value={item.nama}>{item.kode}</option>)}
            </datalist>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            <span>Tanggal Faktur</span>
            <input required type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-700 sm:col-span-3">
            <span>Catatan</span>
            <input value={catatan} onChange={(event) => setCatatan(event.target.value)} className={inputClass} placeholder="Catatan penerimaan (opsional)" />
          </label>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">Rincian Barang</h2>
            <div className="inline-flex rounded-lg border border-slate-300 p-1" role="group" aria-label="Jenis barang">
              <button type="button" onClick={() => { setMode('lama'); setErrorMessage(''); }} className={`rounded-md px-3 py-2 text-xs font-semibold ${mode === 'lama' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Barang Lama</button>
              <button type="button" onClick={() => { setMode('baru'); setErrorMessage(''); }} className={`rounded-md px-3 py-2 text-xs font-semibold ${mode === 'baru' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Barang Baru</button>
            </div>
          </div>

          {mode === 'lama' ? (
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
              <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                <span>Cari kode, barcode, atau nama barang</span>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setSelectedCode(''); }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' && matchingItems.length > 0) {
                        event.preventDefault();
                        const nextIndex = activeResultIndex < matchingItems.length - 1 ? activeResultIndex + 1 : 0;
                        setSelectedCode(matchingItems[nextIndex].kodebarang);
                      } else if (event.key === 'ArrowUp' && matchingItems.length > 0) {
                        event.preventDefault();
                        const previousIndex = activeResultIndex > 0 ? activeResultIndex - 1 : matchingItems.length - 1;
                        setSelectedCode(matchingItems[previousIndex].kodebarang);
                      } else if (event.key === 'Enter' && matchingItems.length > 0) {
                        event.preventDefault();
                        const codeToAdd = matchingItems.length === 1
                          ? matchingItems[0].kodebarang
                          : selectedCode;
                        if (codeToAdd) addExistingItem(codeToAdd);
                      } else if (event.key === 'Escape') {
                        setQuery('');
                        setSelectedCode('');
                      }
                    }}
                    className={`${inputClass} pl-9`}
                    placeholder="Ketik untuk mencari barang"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={matchingItems.length > 0}
                    aria-controls="barang-search-results"
                    aria-activedescendant={activeResultIndex >= 0 ? `barang-search-result-${activeResultIndex}` : undefined}
                  />
                  {matchingItems.length > 0 && (
                    <div ref={resultListRef} id="barang-search-results" role="listbox" aria-label="Hasil pencarian barang" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1.5 shadow-xl">
                      {matchingItems.map((item, index) => (
                        <button
                          key={item.kodebarang}
                          id={`barang-search-result-${index}`}
                          data-result-index={index}
                          type="button"
                          role="option"
                          aria-selected={selectedCode === item.kodebarang}
                          onMouseEnter={() => setSelectedCode(item.kodebarang)}
                          onClick={() => addExistingItem(item.kodebarang)}
                          className={`flex min-h-[3.75rem] w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left focus:bg-emerald-50 focus:outline-none ${selectedCode === item.kodebarang ? 'bg-emerald-50' : 'hover:bg-emerald-50'}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-xs font-bold text-slate-900">{item.kodebarang}</span>
                            <span className="mt-0.5 block truncate text-xs font-medium text-slate-700">{item.namabarang}</span>
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-500">Stok {item.stok}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                <span>Jumlah Masuk</span>
                <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className={inputClass} />
              </label>
              <button type="button" onClick={addExistingItem} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                <Plus className="h-4 w-4" /> Tambah Baris
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Kode Barang</span><input value={newItem.kodebarang} onChange={(event) => setNewItem((item) => ({ ...item, kodebarang: event.target.value.toUpperCase() }))} className={inputClass} pattern="[A-Za-z0-9]+" title="Kode barang hanya boleh berisi huruf dan angka." required /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Kode Barcode</span><input value={newItem.kodebarcode} onChange={(event) => setNewItem((item) => ({ ...item, kodebarcode: event.target.value }))} className={inputClass} required /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Nama Barang</span><input value={newItem.namabarang} onChange={(event) => setNewItem((item) => ({ ...item, namabarang: event.target.value }))} className={inputClass} required /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Jenis</span><input value={newItem.jenis} onChange={(event) => setNewItem((item) => ({ ...item, jenis: event.target.value }))} className={inputClass} required /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Merek</span><input value={newItem.merek} onChange={(event) => setNewItem((item) => ({ ...item, merek: event.target.value }))} className={inputClass} /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Satuan</span><input value={newItem.satuan} onChange={(event) => setNewItem((item) => ({ ...item, satuan: event.target.value }))} className={inputClass} required /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Harga Pokok</span><input type="number" min="0" value={newItem.hargapokok} onChange={(event) => setNewItem((item) => ({ ...item, hargapokok: Number(event.target.value) }))} className={inputClass} /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Harga Jual</span><input type="number" min="0" value={newItem.hargajual} onChange={(event) => setNewItem((item) => ({ ...item, hargajual: Number(event.target.value) }))} className={inputClass} /></label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-700"><span>Jumlah Masuk</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className={inputClass} /></label>
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="button" onClick={addNewItem} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
                  <PackagePlus className="h-4 w-4" /> Tambah Barang Baru
                </button>
              </div>
            </div>
          )}
        </section>

        {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{errorMessage}</p>}

        <div className="overflow-x-auto border-y border-slate-200">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-3 py-3">Kode</th><th className="px-3 py-3">Nama Barang</th><th className="px-3 py-3 text-right">Jumlah</th><th className="px-3 py-3">Jenis</th><th className="px-3 py-3 text-center">Hapus</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {lines.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Belum ada rincian barang.</td></tr> : lines.map((line) => (
                <tr key={line.kodebarang}>
                  <td className="px-3 py-3 font-mono text-xs">{line.kodebarang}</td>
                  <td className="px-3 py-3 font-medium">{line.namabarang}</td>
                  <td className="px-3 py-3 text-right">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      aria-label={`Jumlah ${line.namabarang}`}
                      value={line.jumlah || ''}
                      onChange={(event) => {
                        const nextQuantity = Number(event.target.value);
                        setLines((previous) => previous.map((item) => item.kodebarang === line.kodebarang ? { ...item, jumlah: nextQuantity } : item));
                      }}
                      className="ml-auto block w-24 rounded-md border border-slate-300 px-2.5 py-2 text-right text-sm tabular-nums outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    />
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">{line.barangBaru ? 'Barang baru' : 'Barang lama'}</td>
                  <td className="px-3 py-3 text-center"><button type="button" aria-label={`Hapus ${line.namabarang}`} onClick={() => setLines((previous) => previous.filter((item) => item.kodebarang !== line.kodebarang))} className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-slate-600">{lines.length} baris, {lines.reduce((total, line) => total + line.jumlah, 0).toLocaleString('id-ID')} unit masuk gudang</p>
          <button type="submit" disabled={isSaving || lines.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400">
            <FilePlus2 className="h-4 w-4" /> {isSaving ? 'Menyimpan...' : 'Simpan Faktur & Stok'}
          </button>
        </footer>
      </form>

      <section className="space-y-3 border-t border-slate-200 pt-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Riwayat Faktur Masuk</h2>
            <p className="mt-1 text-xs text-slate-500">{barangMasukList.length.toLocaleString('id-ID')} faktur tersimpan</p>
          </div>
        </div>
        {historyMessage && <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{historyMessage}</p>}
        <div className="overflow-x-auto border-y border-slate-200 bg-white">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-3">Tanggal</th>
                <th className="px-3 py-3">Nomor Faktur</th>
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3 text-right">Baris</th>
                <th className="px-3 py-3 text-right">Total Unit</th>
                <th className="px-3 py-3 text-center">Rincian</th>
                {isAdmin && <th className="px-3 py-3 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {barangMasukList.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6} className="px-3 py-8 text-center text-slate-500">Belum ada riwayat faktur masuk.</td></tr>
              ) : barangMasukList.map((receipt) => (
                <React.Fragment key={receipt.nomor_faktur}>
                  <tr className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{receipt.tanggal}</td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-900">{receipt.nomor_faktur}</td>
                    <td className="px-3 py-3 font-medium text-slate-800">{receipt.supplier}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{receipt.total_baris.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{receipt.total_qty.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-3 text-center">
                      <button type="button" aria-expanded={expandedReceipt === receipt.nomor_faktur} onClick={() => setExpandedReceipt((current) => current === receipt.nomor_faktur ? null : receipt.nomor_faktur)} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">
                        {expandedReceipt === receipt.nomor_faktur ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {expandedReceipt === receipt.nomor_faktur ? 'Tutup' : 'Lihat'}
                      </button>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-3 text-center">
                        <button type="button" title="Hapus faktur dan kurangi stok gudang" onClick={() => { setHistoryMessage(''); setReceiptToDelete(receipt.nomor_faktur); }} className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedReceipt === receipt.nomor_faktur && (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="bg-slate-50 px-4 py-3">
                        <div className="space-y-2">
                          {receipt.catatan && <p className="text-xs text-slate-600">Catatan: {receipt.catatan}</p>}
                          <div className="divide-y divide-slate-200 border-y border-slate-200">
                            {receipt.items.map((item) => (
                              <div key={item.id || item.kodebarang} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
                                <span className="min-w-0"><span className="font-mono font-semibold">{item.kodebarang}</span><span className="ml-2 text-slate-700">{item.namabarang}</span></span>
                                <span className="text-right tabular-nums">{item.jumlah.toLocaleString('id-ID')} {item.satuan}</span>
                                <span className="hidden text-right text-slate-500 sm:block">Harga pokok {item.hargapokok.toLocaleString('id-ID')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        isOpen={receiptToDelete !== null}
        onClose={() => { if (!isDeletingReceipt) setReceiptToDelete(null); }}
        onConfirm={handleDeleteReceipt}
        title="Hapus Faktur Barang Masuk?"
        message={`Faktur ${receiptToDelete || ''} beserta rinciannya akan dihapus. Stok gudang dikurangi sesuai jumlah faktur. Jika saldo gudang sudah terpakai, penghapusan ditolak dan faktur tetap tersimpan.`}
        confirmText="Hapus faktur & stok"
        type="danger"
        isLoading={isDeletingReceipt}
      />
    </div>
  );
};