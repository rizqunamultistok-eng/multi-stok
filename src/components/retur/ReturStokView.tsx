import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowRight, Building2, CheckCircle2, LoaderCircle, Package, Search, Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getItemLocationStock, useInventory } from '../../context/InventoryContext';
import { ReturStok, StockLocation } from '../../types';

const LOCATION_OPTIONS: { id: StockLocation; label: string }[] = [
  { id: 'toko', label: 'Toko' },
  { id: 'online', label: 'Online' },
  { id: 'gudang', label: 'Gudang' },
  { id: 'cacat', label: 'Cacat' },
  { id: 'reseller', label: 'Reseller' },
];

const RETURN_SOURCES: StockLocation[] = ['toko', 'online', 'gudang', 'cacat', 'reseller'];

function getReturnDestination(request: ReturStok): string {
  if (request.asal_lokasi === 'gudang') return request.supplier || 'Supplier';
  return LOCATION_OPTIONS.find((location) => location.id === request.tujuan_lokasi)?.label || request.tujuan_lokasi || '-';
}

export const ReturStokView: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { barangList, returStokList, suppliers, createReturStok, processReturStok } = useInventory();
  const canChooseSource = isAdmin;
  const initialSource = RETURN_SOURCES.includes(currentUser.role as StockLocation)
    ? currentUser.role as StockLocation
    : 'toko';
  const [sourceLocation, setSourceLocation] = useState<StockLocation>(initialSource);
  const [destinationLocation, setDestinationLocation] = useState<StockLocation>('gudang');
  const [supplierName, setSupplierName] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const resultListRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [processFeedback, setProcessFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const matchingItems = useMemo(() => {
    const query = itemQuery.trim().toLocaleLowerCase('id');
    if (!query) return [];
    return barangList.filter((item) =>
      getItemLocationStock(item, sourceLocation) > 0 &&
      [item.kodebarang, item.kodebarcode, item.namabarang].some((field) => field.toLocaleLowerCase('id').includes(query))
    ).slice(0, 30);
  }, [barangList, itemQuery, sourceLocation]);
  const activeResultIndex = matchingItems.findIndex((item) => item.kodebarang === selectedCode);

  useEffect(() => {
    if (activeResultIndex < 0) return;
    resultListRef.current
      ?.querySelector(`[data-result-index="${activeResultIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeResultIndex]);

  const selectedItem = barangList.find((item) => item.kodebarang === selectedCode);
  const availableStock = selectedItem ? getItemLocationStock(selectedItem, sourceLocation) : 0;
  const selectItem = (code: string) => {
    setSelectedCode(code);
    setItemQuery('');
  };
  const visibleRequests = useMemo(() => {
    const scoped = isAdmin
      ? returStokList
      : returStokList.filter((request) => request.asal_lokasi === currentUser.role || request.tujuan_lokasi === currentUser.role || request.pemohon_id === currentUser.id);
    return [...scoped].sort((first, second) => second.created_at.localeCompare(first.created_at));
  }, [returStokList, isAdmin, currentUser.role, currentUser.id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || !selectedCode) return;
    setIsSubmitting(true);
    setFeedback(null);
    const result = await createReturStok({
      kodebarang: selectedCode,
      asal_lokasi: sourceLocation,
      tujuan_lokasi: sourceLocation === 'gudang' ? null : destinationLocation,
      supplier: sourceLocation === 'gudang' ? supplierName : null,
      jumlah: quantity,
      alasan: reason,
    });
    setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    if (result.success) {
      setSelectedCode('');
      setItemQuery('');
      setQuantity(1);
      setReason('');
      setSupplierName('');
    }
    setIsSubmitting(false);
  };

  const handleProcessRequest = async (request: ReturStok) => {
    if (processingRequestId) return;
    setProcessingRequestId(request.id);
    setProcessFeedback(null);
    const result = await processReturStok(request.id);
    setProcessFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    setProcessingRequestId(null);
  };

  const canProcessRequest = (request: ReturStok) => isAdmin
    || request.tujuan_lokasi === currentUser.role
    || (request.asal_lokasi === 'gudang' && request.tujuan_lokasi === null && currentUser.role === 'gudang');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex items-start gap-3 border-b border-slate-200 pb-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
          <Undo2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Retur Stok</h1>
          <p className="mt-1 text-sm text-slate-600">Ajukan retur ke lokasi lain atau supplier. Stok berubah saat nota diproses oleh Admin atau lokasi tujuan.</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="grid gap-5 border-b border-slate-200 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
        <div className="space-y-4">
          {canChooseSource && (
            <label className="block text-xs font-semibold text-slate-700">
              Lokasi asal
              <select value={sourceLocation} onChange={(event) => { setSourceLocation(event.target.value as StockLocation); setSelectedCode(''); setItemQuery(''); }} className="mt-1.5 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                {RETURN_SOURCES.map((location) => <option key={location} value={location}>{LOCATION_OPTIONS.find((entry) => entry.id === location)?.label}</option>)}
              </select>
            </label>
          )}

          <div>
            <label htmlFor="retur-item-search" className="text-xs font-semibold text-slate-700">Cari barang yang akan diretur</label>
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                id="retur-item-search"
                value={itemQuery}
                onChange={(event) => { setItemQuery(event.target.value); setSelectedCode(''); }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && matchingItems.length > 0) {
                    event.preventDefault();
                    const nextIndex = activeResultIndex < matchingItems.length - 1 ? activeResultIndex + 1 : 0;
                    setSelectedCode(matchingItems[nextIndex].kodebarang);
                  } else if (event.key === 'ArrowUp' && matchingItems.length > 0) {
                    event.preventDefault();
                    const previousIndex = activeResultIndex > 0 ? activeResultIndex - 1 : matchingItems.length - 1;
                    setSelectedCode(matchingItems[previousIndex].kodebarang);
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const codeToSelect = matchingItems.length === 1 ? matchingItems[0].kodebarang : selectedCode;
                    if (codeToSelect) selectItem(codeToSelect);
                  } else if (event.key === 'Escape') {
                    setItemQuery('');
                    setSelectedCode('');
                  }
                }}
                placeholder="Ketik kode, barcode, atau nama barang"
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={matchingItems.length > 0}
                aria-controls="retur-barang-search-results"
                aria-activedescendant={activeResultIndex >= 0 ? `retur-barang-search-result-${activeResultIndex}` : undefined}
              />
              {matchingItems.length > 0 && (
                <div ref={resultListRef} id="retur-barang-search-results" role="listbox" aria-label="Hasil pencarian barang" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1.5 shadow-xl">
                  {matchingItems.map((item, index) => (
                    <button
                      key={item.kodebarang}
                      id={`retur-barang-search-result-${index}`}
                      data-result-index={index}
                      type="button"
                      role="option"
                      aria-selected={selectedCode === item.kodebarang}
                      onClick={() => selectItem(item.kodebarang)}
                      className={`flex min-h-[3.75rem] w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left focus:bg-rose-50 focus:outline-none ${selectedCode === item.kodebarang ? 'bg-rose-50' : 'hover:bg-rose-50'}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs font-bold text-slate-900">{item.kodebarang}</span>
                        <span className="mt-0.5 block truncate text-xs font-medium text-slate-700">{item.namabarang}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">Barcode {item.kodebarcode}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-500">Stok {getItemLocationStock(item, sourceLocation)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedItem && <p className="mt-1.5 text-xs text-slate-500">Dipilih: {selectedItem.kodebarang} - {selectedItem.namabarang}. Stok {LOCATION_OPTIONS.find((entry) => entry.id === sourceLocation)?.label}: {availableStock} {selectedItem.satuan}</p>}
          </div>

          <label className="block text-xs font-semibold text-slate-700">
            Jumlah retur
            <input type="number" min={1} max={availableStock || undefined} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1.5 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" />
          </label>

          <label className="block text-xs font-semibold text-slate-700">
            Alasan / keterangan
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Contoh: barang rusak, salah kirim, atau tidak sesuai" className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="space-y-4">
          {sourceLocation === 'gudang' ? (
            <label className="block text-xs font-semibold text-slate-700">
              Supplier tujuan
              <input list="retur-supplier-list" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required placeholder="Pilih atau ketik nama supplier" className="mt-1.5 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" />
              <datalist id="retur-supplier-list">{suppliers.map((supplier) => <option key={supplier.kode} value={supplier.nama} />)}</datalist>
            </label>
          ) : (
            <label className="block text-xs font-semibold text-slate-700">
              Lokasi tujuan
              <select value={destinationLocation} onChange={(event) => setDestinationLocation(event.target.value as StockLocation)} className="mt-1.5 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                {LOCATION_OPTIONS.filter((location) => location.id !== sourceLocation).map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
              </select>
            </label>
          )}

          <div className="flex items-start gap-2 border-l-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            {sourceLocation === 'gudang' ? <Building2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{sourceLocation === 'gudang' ? 'Retur gudang dikirim ke supplier dan mengurangi stok gudang saat diproses.' : 'Saat diproses, stok asal berkurang dan stok lokasi tujuan bertambah.'} Pengajuan tetap menunggu proses.</span>
          </div>

          {feedback && <p role="status" className={`text-xs ${feedback.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{feedback.message}</p>}
          <button type="submit" disabled={isSubmitting || !selectedItem || quantity < 1 || quantity > availableStock || (sourceLocation === 'gudang' && !supplierName.trim())} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            <Package className="h-4 w-4" />{isSubmitting ? 'Menyimpan request...' : 'Buat Request Retur'}
          </button>
        </div>
      </form>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Riwayat request retur</h2>
          <span className="text-xs text-slate-500">{visibleRequests.length} request</span>
        </div>
        {processFeedback && <p role="status" className={`mb-3 text-xs ${processFeedback.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{processFeedback.message}</p>}
        {visibleRequests.length === 0 ? (
          <div className="border-y border-slate-200 py-8 text-center text-sm text-slate-500">Belum ada request retur.</div>
        ) : (
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {visibleRequests.map((request) => (
              <article key={request.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-bold text-slate-900">{request.nomor_retur}</span>
                    <span className="text-xs text-slate-500">{new Date(request.created_at).toLocaleString('id-ID')}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-800">{request.namabarang} <span className="font-normal text-slate-500">({request.kodebarang})</span></p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-600">{request.asal_lokasi.toUpperCase()} <ArrowRight className="h-3 w-3" /> {getReturnDestination(request)} <span className="ml-1">· {request.jumlah} {request.satuan}</span></p>
                  {request.alasan && <p className="mt-1 text-xs text-slate-500">{request.alasan}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">Diajukan {request.pemohon_name}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className={`w-fit rounded-sm px-2 py-1 text-[10px] font-bold uppercase ${request.status === 'disetujui' ? 'bg-emerald-100 text-emerald-800' : request.status === 'ditolak' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                    {request.status === 'disetujui' ? 'Diproses' : request.status === 'ditolak' ? 'Ditolak' : 'Menunggu'}
                  </span>
                  {request.status === 'pending' && canProcessRequest(request) && (
                    <button type="button" onClick={() => void handleProcessRequest(request)} disabled={processingRequestId !== null} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">
                      {processingRequestId === request.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Proses retur
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};