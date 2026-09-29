import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Save, SlidersHorizontal } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { MinimumStockSettings } from '../../types';

export const MinimumStockSettingsView: React.FC = () => {
  const { barangList, minStockSettings, saveMinimumStockSettings } = useInventory();
  const [draft, setDraft] = useState<MinimumStockSettings>(minStockSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);

  const categories = useMemo(
    () => Array.from(new Set<string>(barangList.map((item) => item.jenis.trim()).filter((category) => category.length > 0)))
      .sort((first, second) => first.localeCompare(second)),
    [barangList],
  );

  useEffect(() => {
    setDraft(minStockSettings);
  }, [minStockSettings]);

  const setDefaultMinimum = (value: number) => {
    setDraft((previous) => ({ ...previous, defaultMinimum: value }));
  };

  const toggleCategory = (category: string, enabled: boolean) => {
    setDraft((previous) => {
      const categoryMinimums = { ...previous.categoryMinimums };
      if (enabled) categoryMinimums[category] = previous.defaultMinimum;
      else delete categoryMinimums[category];
      return { ...previous, categoryMinimums };
    });
  };

  const setCategoryMinimum = (category: string, value: number) => {
    setDraft((previous) => ({
      ...previous,
      categoryMinimums: { ...previous.categoryMinimums, [category]: value },
    }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const result = await saveMinimumStockSettings(draft);
    setMessage({
      success: result.success,
      text: result.success ? 'Pengaturan batas minimum stok berhasil disimpan.' : result.message || 'Pengaturan gagal disimpan.',
    });
    setIsSaving(false);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Batas Minimum Stok</h1>
          <p className="mt-1 text-xs text-slate-500">Atur ambang stok untuk daftar barang kritis.</p>
        </div>
      </header>

      <form onSubmit={handleSave} className="space-y-5">
        <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 sm:p-5">
          <label htmlFor="default-min-stock" className="block text-sm font-bold text-teal-950">
            Semua barang
          </label>
          <p className="mt-1 text-xs text-teal-800">Batas ini berlaku untuk semua produk kecuali kategori yang diberi batas khusus.</p>
          <div className="mt-3 flex max-w-xs items-center gap-3">
            <input
              id="default-min-stock"
              type="number"
              min="0"
              max="1000000"
              step="1"
              required
              value={draft.defaultMinimum}
              onChange={(event) => setDefaultMinimum(Number(event.target.value))}
              className="w-32 rounded-xl border border-teal-300 bg-white px-3 py-2 text-sm font-bold text-teal-950 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-xs font-semibold text-teal-800">pcs per produk</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-bold text-slate-900">Pengecualian per kategori</h2>
            <p className="mt-1 text-xs text-slate-500">Pilih kategori untuk memakai batas yang berbeda dari pengaturan semua barang.</p>
          </div>
          {categories.length === 0 ? (
            <p className="p-5 text-xs text-slate-500">Kategori akan muncul setelah data barang tersedia.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {categories.map((category) => {
                const hasOverride = Object.prototype.hasOwnProperty.call(draft.categoryMinimums, category);
                return (
                  <div key={category} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:px-5">
                    <label className="flex min-w-0 items-center gap-3 text-sm font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={hasOverride}
                        onChange={(event) => toggleCategory(category, event.target.checked)}
                        className="h-4 w-4 accent-teal-700"
                      />
                      <span className="truncate">{category}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        aria-label={`Batas minimum kategori ${category}`}
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        disabled={!hasOverride}
                        value={hasOverride ? draft.categoryMinimums[category] : draft.defaultMinimum}
                        onChange={(event) => setCategoryMinimum(category, Number(event.target.value))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-right text-xs font-bold text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <span className="text-[10px] text-slate-500">pcs</span>
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {message && (
          <div role="status" className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${message.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            {message.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {message.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>
    </div>
  );
};