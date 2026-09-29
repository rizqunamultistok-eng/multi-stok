import * as XLSX from 'xlsx';
import { Barang, MasterUploadPreviewItem, OpnamePreviewItem, KasirUploadPreviewItem, StockLocation, SalesStockLocation, MutationRequestLine, Supplier } from '../types';
import { getItemLocationStock } from '../context/InventoryContext';

const IDENTIFIER_HEADERS = new Set([
  'kodebarang', 'kode', 'sku', 'id', 'itemcode', 'kdbrg',
  'kodebarcode', 'barcode', 'ean', 'upc', 'kdbarcode',
]);
const TEMPLATE_INPUT_ROWS = 20000;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatIdentifierColumnsAsText(worksheet: XLSX.WorkSheet, headers: unknown[]) {
  const identifierColumns = headers
    .map((header, index) => IDENTIFIER_HEADERS.has(normalizeHeader(String(header))) ? index : -1)
    .filter((index) => index >= 0);
  if (identifierColumns.length === 0) return;

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const lastRow = Math.max(range.e.r, TEMPLATE_INPUT_ROWS);
  identifierColumns.forEach((column) => {
    for (let row = 1; row <= lastRow; row++) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[address] || { t: 's' as const, v: '' };
      if (cell.v !== undefined && cell.v !== '') cell.v = String(cell.v);
      cell.t = 's';
      cell.z = '@';
      worksheet[address] = cell;
    }
  });
  range.e.r = lastRow;
  worksheet['!ref'] = XLSX.utils.encode_range(range);
}

function readUploadRows(worksheet: XLSX.WorkSheet): Record<string, unknown>[] {
  if (!worksheet['!ref']) return [];
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  const headers = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => {
    const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + index })];
    return String(cell?.v ?? '').trim();
  });

  const rows = Array.from({ length: range.e.r - range.s.r }, (_, rowIndex) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      if (!header) return;
      const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r + rowIndex + 1, c: range.s.c + columnIndex })];
      const isIdentifier = IDENTIFIER_HEADERS.has(normalizeHeader(header));
      row[header] = cell
        ? isIdentifier && cell.t === 'n'
          ? String(cell.w ?? cell.v ?? '')
          : cell.v ?? ''
        : '';
    });
    return row;
  });

  return rows.filter((row) =>
    Object.values(row).some((value) => value !== null && value !== undefined && String(value).trim() !== '')
  );
}

function resolveExistingIdentifier(value: unknown, existingValues: string[]): string {
  const input = String(value ?? '').trim();
  const exactMatch = existingValues.find((candidate) => candidate.trim().toUpperCase() === input.toUpperCase());
  if (exactMatch || !/^\d+$/.test(input)) return exactMatch || input;

  const withoutLeadingZeros = (code: string) => code.replace(/^0+(?=\d)/, '');
  const numericMatches = existingValues.filter((candidate) =>
    /^\d+$/.test(candidate) && withoutLeadingZeros(candidate) === withoutLeadingZeros(input),
  );
  return numericMatches.length === 1 ? numericMatches[0] : input;
}

/**
 * Generate and download sample Excel or CSV templates
 */
export function downloadDatabaseCsvTemplate() {
  const headers = [
    'kodebarang',
    'kodebarcode',
    'namabarang',
    'jenis',
    'merek',
    'satuan',
    'hargapokok',
    'hargajual',
    'stok',
    'supplier',
    'lokasi',
    'min_stok',
  ];

  const sampleRows = [
    ['BRG-001', '8992761110012', 'Kopi Kapal Api Spesial Mix 24g', 'Minuman', 'Kapal Api', 'Renceng', 12500, 15000, 100, 'PT Santos Jaya Abadi', 'gudang', 20],
    ['BRG-002', '8993175538118', 'Indomie Goreng Original 85g', 'Makanan Instan', 'Indofood', 'Dus', 112000, 120000, 50, 'PT Indofood CBP Sukses Makmur', 'toko', 10],
    ['BRG-003', '8998866200234', 'Minyak Goreng Sania Pouch 2 Liter', 'Sembako', 'Sania', 'Pouch', 32000, 36000, 40, 'Wilmar Nabati Indonesia', 'toko', 10],
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map((row) => row.map((val) => (typeof val === 'string' && val.includes(',') ? `"${val}"` : val)).join(',')),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'database.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadExcelTemplate(type: 'master' | 'opname' | 'kasir_penjualan' | 'database_csv') {
  if (type === 'database_csv') {
    downloadDatabaseCsvTemplate();
    return;
  }

  let wsData: (string | number)[][];
  let filename: string;

  if (type === 'master') {
    filename = 'Template_Master_Data_Barang.xlsx';
    wsData = [
      ['kodebarang', 'kodebarcode', 'namabarang', 'jenis', 'merek', 'satuan', 'hargapokok', 'hargajual', 'stok', 'supplier', 'lokasi', 'min_stok'],
      ['BRG-001', '8991234567890', 'Sabun Cuci Piring Jeruk Nipis 780ml', 'Household', 'Sunlight', 'Pcs', 13500, 16000, 50, 'PT Unilever Indonesia Tbk', 'gudang', 10],
      ['BRG-002', '8999876543210', 'Kopi Instan 3 in 1 Bag 30x20g', 'Minuman Sachet', 'Torabika', 'Bag', 28000, 32500, 40, 'PT Mayora Indah Tbk', 'toko', 10],
    ];
  } else if (type === 'opname') {
    filename = 'Template_Stock_Opname_2Kolom.xlsx';
    wsData = [
      ['kodebarang', 'stok'],
      ['BRG-001', 145],
      ['BRG-002', 85],
    ];
  } else {
    // kasir_penjualan
    filename = 'Template_Upload_Penjualan_Kasir_2Kolom.xlsx';
    wsData = [
      ['kodebarang', 'jumlah_terjual'],
      ['BRG-001', 5],
      ['BRG-002', 2],
    ];
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  formatIdentifierColumnsAsText(ws, wsData[0]);
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, filename);
}

export function downloadSupplierTemplate() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['kode', 'nama', 'alamat', 'kota', 'kontak'],
    ['SUP-001', 'PT Contoh Distributor', 'Jl. Contoh No. 1', 'Jakarta', '021-555000'],
  ]);
  formatIdentifierColumnsAsText(worksheet, ['kode', 'nama', 'alamat', 'kota', 'kontak']);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Supplier');
  XLSX.writeFile(workbook, 'Template_Data_Supplier.xlsx');
}

export async function parseSupplierExcel(file: File): Promise<{ suppliers: Supplier[]; errors: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = readUploadRows(worksheet);
  const seenCodes = new Set<string>();
  const suppliers: Supplier[] = [];
  const errors: string[] = [];
  const findValue = (row: Record<string, unknown>, names: string[]) => {
    const key = Object.keys(row).find((candidate) => names.includes(normalizeHeader(candidate)));
    return key ? String(row[key] ?? '').trim() : '';
  };

  rows.forEach((row, index) => {
    const kode = findValue(row, ['kode', 'kodesupplier', 'kodevendor']);
    const nama = findValue(row, ['nama', 'namasupplier', 'namavendor']);
    if (!kode || !nama) {
      errors.push(`Baris ${index + 2}: kode dan nama wajib diisi.`);
      return;
    }
    const normalizedCode = kode.toLowerCase();
    if (seenCodes.has(normalizedCode)) {
      errors.push(`Baris ${index + 2}: kode ${kode} duplikat.`);
      return;
    }
    seenCodes.add(normalizedCode);
    suppliers.push({
      kode,
      nama,
      alamat: findValue(row, ['alamat', 'address']),
      kota: findValue(row, ['kota', 'city']),
      kontak: findValue(row, ['kontak', 'contact', 'telepon', 'telp', 'phone']),
    });
  });

  return { suppliers, errors };
}

export async function parseMutationRequestExcel(file: File, existingBarang: Barang[]): Promise<(MutationRequestLine & { namabarang?: string; satuan?: string; status: 'valid' | 'invalid'; error_message?: string })[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = readUploadRows(worksheet);
  const existingMap = new Map(existingBarang.map((item) => [item.kodebarang.trim().toUpperCase(), item]));
  const existingCodes = existingBarang.map((item) => item.kodebarang);
  const seen = new Set<string>();

  return rows.map((row) => {
    const findValue = (names: string[]) => {
      const key = Object.keys(row).find((candidate) => names.includes(candidate.trim().toLowerCase().replace(/[^a-z0-9]/g, '')));
      return key ? row[key] : '';
    };
    const kodebarang = resolveExistingIdentifier(findValue(['kodebarang', 'kode', 'sku', 'id', 'itemcode']), existingCodes);
    const jumlah = Number(findValue(['jumlah', 'jumlahdiminta', 'qty', 'stok', 'stock']));
    const item = existingMap.get(kodebarang.toUpperCase());
    if (!kodebarang) return { kodebarang, jumlah_diminta: 0, status: 'invalid', error_message: 'Kode barang wajib diisi.' };
    if (seen.has(kodebarang.toUpperCase())) return { kodebarang, jumlah_diminta: jumlah, status: 'invalid', error_message: 'Kode barang duplikat.' };
    seen.add(kodebarang.toUpperCase());
    if (!item) return { kodebarang, jumlah_diminta: jumlah, status: 'invalid', error_message: 'SKU tidak ditemukan di master.' };
    if (!Number.isFinite(jumlah) || jumlah <= 0) return { kodebarang: item.kodebarang, jumlah_diminta: 0, namabarang: item.namabarang, satuan: item.satuan, status: 'invalid', error_message: 'Jumlah harus lebih besar dari 0.' };
    return { kodebarang: item.kodebarang, jumlah_diminta: Math.floor(jumlah), namabarang: item.namabarang, satuan: item.satuan, status: 'valid' };
  });
}

export function downloadMutationRequestTemplate() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['kodebarang', 'jumlah'],
    ['BRG-001', 5],
    ['BRG-002', 10],
  ]);
  formatIdentifierColumnsAsText(worksheet, ['kodebarang', 'jumlah']);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Permintaan Mutasi');
  XLSX.writeFile(workbook, 'Template_Permintaan_Mutasi.xlsx');
}

/**
 * Export data array to Excel file
 */
export function exportToExcel(data: Record<string, unknown>[], fileName: string, sheetName = 'Data') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

/**
 * Export data array directly to CSV file
 */
export function exportToCsv(data: Record<string, unknown>[], fileName: string) {
  if (!data || data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse Master Data from CSV or Excel (All Columns)
 */
export async function parseMasterExcel(
  file: File,
  existingBarang: Barang[]
): Promise<MasterUploadPreviewItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = readUploadRows(worksheet);

  const existingMap = new Map<string, Barang>(
    existingBarang.map((b) => [b.kodebarang.trim().toUpperCase(), b])
  );
  const existingCodes = existingBarang.map((item) => item.kodebarang);
  const existingBarcodes = existingBarang.map((item) => item.kodebarcode);

  return rows.map((row) => {
    // Map case-insensitive and variation headers
    const findVal = (keyNames: string[]) => {
      for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (keyNames.includes(cleanKey)) {
          return row[key];
        }
      }
      return '';
    };

    const kodebarang = resolveExistingIdentifier(findVal(['kodebarang', 'kode', 'sku', 'id', 'itemcode', 'kdbrg']), existingCodes);
    const kodebarcode = resolveExistingIdentifier(
      findVal(['kodebarcode', 'barcode', 'ean', 'upc', 'kdbarcode']) || kodebarang,
      existingBarcodes,
    );
    const namabarang = String(findVal(['namabarang', 'nama', 'item', 'description', 'namaproduk', 'produk'])).trim();
    const jenis = String(findVal(['jenis', 'kategori', 'category', 'type', 'golongan', 'kelompok']) || 'Umum').trim();
    const merek = String(findVal(['merek', 'brand', 'merk', 'brandname']) || 'Tanpa Merek').trim();
    const satuan = String(findVal(['satuan', 'unit', 'uom', 'sat']) || 'Pcs').trim();
    const hargapokok = Number(findVal(['hargapokok', 'hpp', 'modal', 'cost', 'belipokok', 'hargabeli']) || 0);
    const hargajual = Number(findVal(['hargajual', 'harga', 'price', 'sellprice', 'jual']) || 0);
    const stok = Number(findVal(['stok', 'stock', 'qty', 'jumlah', 'stoktotal', 'saldo']) || 0);
    const supplier = String(findVal(['supplier', 'vendor', 'distributor', 'pemasok']) || '-').trim();
    const lokasi = (String(findVal(['lokasi', 'location', 'gudang', 'saluran']) || 'gudang').trim().toLowerCase()) as StockLocation;
    const min_stok = Number(findVal(['minstok', 'min_stok', 'minimum', 'safetystock']) || 10);

    const isUpdate = existingMap.has(kodebarang.toUpperCase());
    let isValid = true;
    let errorMsg = '';

    if (!kodebarang) {
      isValid = false;
      errorMsg = 'Kode barang wajib diisi.';
    } else if (!namabarang) {
      isValid = false;
      errorMsg = 'Nama barang wajib diisi.';
    }

    return {
      kodebarang,
      kodebarcode,
      namabarang,
      jenis,
      merek,
      satuan,
      hargapokok: isNaN(hargapokok) ? 0 : hargapokok,
      hargajual: isNaN(hargajual) ? 0 : hargajual,
      stok: isNaN(stok) ? 0 : stok,
      supplier,
      isUpdate,
      status: isValid ? 'valid' : 'invalid',
      error_message: errorMsg,
    };
  });
}

/**
 * Parse Opname Excel or CSV (2 Columns: kodebarang, stok)
 */
export async function parseOpnameExcel(
  file: File,
  existingBarang: Barang[],
  location: StockLocation = 'gudang'
): Promise<OpnamePreviewItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = readUploadRows(worksheet);

  const existingMap = new Map<string, Barang>(
    existingBarang.map((b) => [b.kodebarang.trim().toUpperCase(), b])
  );
  const existingCodes = existingBarang.map((item) => item.kodebarang);

  return rows.map((row) => {
    const findVal = (keyNames: string[]) => {
      for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (keyNames.includes(cleanKey)) {
          return row[key];
        }
      }
      return '';
    };

    const kodebarang = resolveExistingIdentifier(findVal(['kodebarang', 'kode', 'sku', 'barcode', 'kdbrg']), existingCodes);
    const stokRaw = findVal(['stok', 'stokfisik', 'qty', 'jumlah', 'fisik', 'opname']);
    const stokFisik = Number(stokRaw !== '' ? stokRaw : 0);

    const barangExist = existingMap.get(kodebarang.toUpperCase()) || null;
    const isFound = Boolean(barangExist);
    const selisih = barangExist ? stokFisik - getItemLocationStock(barangExist, location) : 0;

    return {
      kodebarang,
      stok_fisik: isNaN(stokFisik) ? 0 : stokFisik,
      barang_exist: barangExist,
      status: isFound ? 'valid' : 'tidak_ditemukan',
      selisih,
    };
  });
}

/**
 * Parse Kasir Penjualan Excel or CSV (2 Columns: kodebarang, jumlah_terjual)
 */
export async function parseKasirPenjualanExcel(
  file: File,
  existingBarang: Barang[],
  salesLocation: SalesStockLocation = 'toko'
): Promise<KasirUploadPreviewItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = readUploadRows(worksheet);

  const existingMap = new Map<string, Barang>(
    existingBarang.map((b) => [b.kodebarang.trim().toUpperCase(), b])
  );
  const existingCodes = existingBarang.map((item) => item.kodebarang);

  return rows.map((row) => {
    const findVal = (keyNames: string[]) => {
      for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (keyNames.includes(cleanKey)) {
          return row[key];
        }
      }
      return '';
    };

    const kodebarang = resolveExistingIdentifier(findVal(['kodebarang', 'kode', 'sku', 'barcode', 'kdbrg']), existingCodes);
    const qtyRaw = findVal(['jumlahterjual', 'jumlah', 'qty', 'terjual', 'sold', 'item', 'penjualan']);
    const jumlahTerjual = Math.max(0, Number(qtyRaw !== '' ? qtyRaw : 1));

    const barangExist = existingMap.get(kodebarang.toUpperCase()) || null;

    if (!barangExist) {
      return {
        kodebarang,
        jumlah_terjual: jumlahTerjual,
        namabarang: 'PRODUK TIDAK DITEMUKAN',
        stok_sebelum: 0,
        stok_sesudah: 0,
        hargajual: 0,
        total_nilai: 0,
        status: 'tidak_ditemukan',
        error_message: 'Kode barang tidak terdaftar di database',
      };
    }

    const stokSebelum = getItemLocationStock(barangExist, salesLocation);
    const stokSesudah = stokSebelum - jumlahTerjual;
    const isStokKurang = stokSesudah < 0;

    return {
      kodebarang,
      jumlah_terjual: jumlahTerjual,
      namabarang: barangExist.namabarang,
      stok_sebelum: stokSebelum,
      stok_sesudah: stokSesudah,
      hargajual: barangExist.hargajual,
      total_nilai: jumlahTerjual * barangExist.hargajual,
      status: isStokKurang ? 'stok_kurang' : 'valid',
      error_message: isStokKurang ? `Stok tidak mencukupi (Tersisa ${stokSebelum}, diminta ${jumlahTerjual})` : undefined,
    };
  });
}

