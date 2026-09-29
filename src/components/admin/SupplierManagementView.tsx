import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Building2, Download, FileSpreadsheet, Plus, Save, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { Supplier } from '../../types';
import { downloadSupplierTemplate, parseSupplierExcel } from '../../lib/excel';
import { Pagination } from '../common/Pagination';

const emptySupplier: Supplier = { kode: '', nama: '', alamat: '', kota: '', kontak: '' };

export const SupplierManagementView: React.FC = () => {
  const { suppliers, saveSuppliers } = useInventory();
  const [draft, setDraft] = useState<Supplier>(emptySupplier);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<Supplier[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Supplier; direction: 'asc' | 'desc' }>({ key: 'kode', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);

  const filteredSuppliers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return suppliers
      .filter((supplier) => !normalizedQuery || [supplier.kode, supplier.nama, supplier.alamat, supplier.kota, supplier.kontak]
        .some((value) => value.toLowerCase().includes(normalizedQuery)))
      .sort((first, second) => {
        const comparison = String(first[sortConfig.key] || '').localeCompare(String(second[sortConfig.key] || ''), 'id', { numeric: true, sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
  }, [suppliers, query, sortConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, pageSize, sortConfig, suppliers.length]);

  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSuppliers.slice(start, start + pageSize);
  }, [filteredSuppliers, currentPage, pageSize]);

  const sortHeader = (key: keyof Supplier, label: string) => (
    <th scope="col" aria-sort={sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-3 py-3">
      <button type="button" onClick={() => setSortConfig((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))} className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-teal-800">
        {label}<ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
    </th>
  );

  const resetForm = () => {
    setDraft(emptySupplier);
    setEditingCode(null);
    setIsFormOpen(false);
  };

  const handleSupplierFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      const result = await parseSupplierExcel(file);
      setImportPreview(result.suppliers);
      setImportErrors(result.errors);
    } catch {
      setImportPreview([]);
      setImportErrors(['File tidak dapat dibaca. Pastikan format Excel memiliki header kode dan nama.']);
    }
  };

  const importSuppliers = async () => {
    if (!importPreview.length) return;
    const mergedSuppliers = new Map(suppliers.map((supplier) => [supplier.kode.toLowerCase(), supplier]));
    importPreview.forEach((supplier) => mergedSuppliers.set(supplier.kode.toLowerCase(), supplier));
    setIsSaving(true);
    setMessage(null);
    const result = await saveSuppliers(Array.from(mergedSuppliers.values()));
    setIsSaving(false);
    setMessage({ success: result.success, text: result.success ? `${importPreview.length} supplier berhasil diimpor.` : result.message || 'Import supplier gagal.' });
    if (result.success) {
      setImportPreview([]);
      setImportErrors([]);
    }
  };

  const submitSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = { ...draft, kode: draft.kode.trim(), nama: draft.nama.trim() };
    if (!normalized.kode || !normalized.nama) return;
    const duplicate = suppliers.some((supplier) => supplier.kode.toLowerCase() === normalized.kode.toLowerCase()
      && supplier.kode !== editingCode);
    if (duplicate) {
      setMessage({ success: false, text: 'Kode supplier sudah digunakan.' });
      return;
    }

    const nextSuppliers = editingCode
      ? suppliers.map((supplier) => supplier.kode === editingCode ? normalized : supplier)
      : [...suppliers, normalized];
    setIsSaving(true);
    setMessage(null);
    const result = await saveSuppliers(nextSuppliers);
    setIsSaving(false);
    setMessage({ success: result.success, text: result.success ? 'Data supplier tersimpan.' : result.message || 'Data supplier gagal disimpan.' });
    if (result.success) resetForm();
  };

  const removeSupplier = async (kode: string) => {
    if (!window.confirm(`Hapus supplier ${kode}?`)) return;
    setIsSaving(true);
    setMessage(null);
    const result = await saveSuppliers(suppliers.filter((supplier) => supplier.kode !== kode));
    setIsSaving(false);
    setMessage({ success: result.success, text: result.success ? 'Supplier dihapus.' : result.message || 'Supplier gagal dihapus.' });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700"><Building2 className="h-5 w-5" /></div>
          <div><h1 className="text-xl font-bold text-slate-900">Data Supplier</h1><p className="mt-1 text-xs text-slate-500">Kelola identitas dan kontak pemasok barang.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadSupplierTemplate} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Template Excel</button>
          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"><UploadCloud className="h-4 w-4" /> Import Excel<input type="file" accept=".xlsx,.xls,.csv" onChange={handleSupplierFile} className="sr-only" /></label>
          <button type="button" onClick={() => { resetForm(); setIsFormOpen(true); setMessage(null); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800"><Plus className="h-4 w-4" /> Supplier Baru</button>
        </div>
      </header>

      {isFormOpen && (
        <form onSubmit={submitSupplier} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-bold text-slate-700">Kode Supplier<input required disabled={editingCode !== null} value={draft.kode} onChange={(event) => setDraft({ ...draft, kode: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono font-normal disabled:bg-slate-100" /></label>
          <label className="text-xs font-bold text-slate-700">Nama<input required value={draft.nama} onChange={(event) => setDraft({ ...draft, nama: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <label className="text-xs font-bold text-slate-700">Alamat<input value={draft.alamat} onChange={(event) => setDraft({ ...draft, alamat: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <label className="text-xs font-bold text-slate-700">Kota<input value={draft.kota} onChange={(event) => setDraft({ ...draft, kota: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <label className="text-xs font-bold text-slate-700">Kontak<input value={draft.kontak} onChange={(event) => setDraft({ ...draft, kontak: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <div className="flex items-end justify-end gap-2">
            <button type="button" onClick={resetForm} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><X className="h-4 w-4" /> Batal</button>
            <button type="submit" disabled={isSaving} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" /> {isSaving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </form>
      )}

      {message && <p role="status" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${message.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{message.text}</p>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-semibold text-slate-600">{filteredSuppliers.length} supplier</span>
          <label className="relative block sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode, nama, alamat..." className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs" /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600"><tr>{sortHeader('kode', 'Kode')}{sortHeader('nama', 'Nama')}{sortHeader('alamat', 'Alamat')}{sortHeader('kota', 'Kota')}{sortHeader('kontak', 'Kontak')}<th className="px-3 py-3 text-right">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuppliers.length === 0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Belum ada data supplier.</td></tr> : paginatedSuppliers.map((supplier) => (
                <tr key={supplier.kode} className="hover:bg-slate-50">
                  <td className="px-3 py-3 font-mono font-bold text-slate-800">{supplier.kode}</td><td className="px-3 py-3 font-semibold text-slate-900">{supplier.nama}</td><td className="px-3 py-3 text-slate-600">{supplier.alamat || '-'}</td><td className="px-3 py-3 text-slate-600">{supplier.kota || '-'}</td><td className="px-3 py-3 text-slate-600">{supplier.kontak || '-'}</td>
                  <td className="px-3 py-2"><div className="flex justify-end gap-1"><button type="button" onClick={() => { setDraft(supplier); setEditingCode(supplier.kode); setIsFormOpen(true); setMessage(null); }} className="rounded-md px-2 py-1 font-semibold text-teal-700 hover:bg-teal-50">Edit</button><button type="button" disabled={isSaving} onClick={() => void removeSupplier(supplier.kode)} aria-label={`Hapus supplier ${supplier.nama}`} className="rounded-md p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={filteredSuppliers.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemName="supplier"
        />
      </section>

      {(importPreview.length > 0 || importErrors.length > 0) && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><FileSpreadsheet className="h-4 w-4 text-teal-700" /> Pratinjau Import ({importPreview.length})</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setImportPreview([]); setImportErrors([]); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><X className="h-4 w-4" /> Batal</button>
              <button type="button" onClick={() => void importSuppliers()} disabled={isSaving || importPreview.length === 0} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white disabled:opacity-50"><UploadCloud className="h-4 w-4" /> {isSaving ? 'Menyimpan...' : 'Impor Supplier'}</button>
            </div>
          </div>
          {importErrors.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="mb-1 font-bold">Baris yang dilewati</p>{importErrors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}</div>}
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Kode</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Alamat</th><th className="px-3 py-2">Kota</th><th className="px-3 py-2">Kontak</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{importPreview.map((supplier) => <tr key={supplier.kode}><td className="px-3 py-2 font-mono">{supplier.kode}</td><td className="px-3 py-2 font-semibold">{supplier.nama}</td><td className="px-3 py-2">{supplier.alamat || '-'}</td><td className="px-3 py-2">{supplier.kota || '-'}</td><td className="px-3 py-2">{supplier.kontak || '-'}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">Kode yang sudah ada akan diperbarui; kode baru akan ditambahkan.</p>
        </section>
      )}
    </div>
  );
};