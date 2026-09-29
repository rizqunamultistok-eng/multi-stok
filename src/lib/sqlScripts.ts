/**
 * Production-Ready PostgreSQL Schemas, Functions, RLS Policies, and Deployment Configs
 * for Pantau Stok Multi-Channel (Supabase Self-Hosted).
 */

export const SQL_SCHEMA_SCRIPT = `-- ============================================================================
-- PANTAU STOK MULTI-CHANNEL - DATABASE SCHEMA & MIGRATIONS
-- Database: Supabase PostgreSQL (styfwlxrsxpvguxnglih.supabase.co)
-- ============================================================================

-- 1. TABEL USERS & PROFILE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'gudang', 'toko', 'reseller', 'online', 'cacat')),
  active BOOLEAN NOT NULL DEFAULT true,
  avatar TEXT,
  password TEXT NOT NULL DEFAULT '123456',
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrasi aman untuk tabel users yang sudah lebih dulu dibuat.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '123456';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signature TEXT;
UPDATE public.users SET password = '123456' WHERE password IS NULL;
ALTER TABLE public.users ALTER COLUMN password SET DEFAULT '123456';
ALTER TABLE public.users ALTER COLUMN password SET NOT NULL;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE public.users
SET role = CASE role
  WHEN 'kasir' THEN 'toko'
  WHEN 'kasir_toko' THEN 'toko'
  WHEN 'etalase' THEN 'toko'
  WHEN 'kasir_online' THEN 'online'
  WHEN 'kasir_reseller' THEN 'reseller'
  WHEN 'kasir_cacat' THEN 'cacat'
END
WHERE role IN ('kasir', 'kasir_toko', 'etalase', 'kasir_online', 'kasir_reseller', 'kasir_cacat');
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'gudang', 'toko', 'reseller', 'online', 'cacat'));
ALTER TABLE public.users DROP COLUMN IF EXISTS shift;

-- 2. TABEL BARANG (MASTER DATA)
CREATE TABLE IF NOT EXISTS public.barang (
  kodebarang TEXT PRIMARY KEY,
  kodebarcode TEXT NOT NULL,
  namabarang TEXT NOT NULL,
  jenis TEXT NOT NULL DEFAULT 'Umum',
  merek TEXT NOT NULL DEFAULT 'Tanpa Merek',
  satuan TEXT NOT NULL DEFAULT 'Pcs',
  hargapokok NUMERIC(15, 2) NOT NULL DEFAULT 0,
  hargajual NUMERIC(15, 2) NOT NULL DEFAULT 0,
  stok INTEGER NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '-',
  lokasi TEXT NOT NULL DEFAULT 'gudang' CHECK (lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat')),
  min_stok INTEGER NOT NULL DEFAULT 10,
  stok_lokasi JSONB NOT NULL DEFAULT jsonb_build_object(
    'gudang', 0, 'toko', 0, 'reseller', 0, 'online', 0, 'cacat', 0
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.normalize_barang_kode()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.kodebarang := upper(btrim(NEW.kodebarang));
  IF NEW.kodebarang !~ '^[A-Z0-9]+$' THEN
    RAISE EXCEPTION 'Kode barang hanya boleh berisi huruf dan angka: %', NEW.kodebarang;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_barang_kode ON public.barang;
CREATE TRIGGER trg_normalize_barang_kode
  BEFORE INSERT OR UPDATE OF kodebarang ON public.barang
  FOR EACH ROW EXECUTE FUNCTION public.normalize_barang_kode();
ALTER TABLE public.barang DROP CONSTRAINT IF EXISTS barang_kodebarang_format_check;
ALTER TABLE public.barang ADD CONSTRAINT barang_kodebarang_format_check
  CHECK (kodebarang ~ '^[A-Z0-9]+$') NOT VALID;

-- Stok tiap saluran disimpan terpisah; public.barang.stok adalah total otomatis.
CREATE TABLE IF NOT EXISTS public.stok_gudang (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stok_toko (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stok_reseller (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stok_online (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stok_cacat (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for fast search & barcode scan
CREATE INDEX IF NOT EXISTS idx_barang_barcode ON public.barang(kodebarcode);
CREATE INDEX IF NOT EXISTS idx_barang_nama ON public.barang(namabarang);
CREATE INDEX IF NOT EXISTS idx_barang_lokasi ON public.barang(lokasi);

-- Data supplier dan faktur ditambahkan sebagai tabel terpisah agar skema lama tetap utuh.
CREATE TABLE IF NOT EXISTS public.suppliers (
  kode TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  alamat TEXT NOT NULL DEFAULT '',
  kota TEXT NOT NULL DEFAULT '',
  kontak TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.barang_masuk (
  nomor_faktur TEXT PRIMARY KEY,
  supplier_kode TEXT,
  supplier TEXT NOT NULL,
  tanggal DATE NOT NULL,
  catatan TEXT,
  total_baris INTEGER NOT NULL DEFAULT 0 CHECK (total_baris >= 0),
  total_qty INTEGER NOT NULL DEFAULT 0 CHECK (total_qty >= 0),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.barang_masuk_detail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_faktur TEXT NOT NULL REFERENCES public.barang_masuk(nomor_faktur) ON DELETE CASCADE,
  kodebarang TEXT NOT NULL,
  namabarang TEXT NOT NULL,
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),
  satuan TEXT NOT NULL DEFAULT 'Pcs',
  hargapokok NUMERIC(15, 2) NOT NULL DEFAULT 0,
  hargajual NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nomor_faktur, kodebarang)
);

CREATE INDEX IF NOT EXISTS idx_barang_masuk_tanggal ON public.barang_masuk(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_barang_masuk_supplier ON public.barang_masuk(supplier_kode, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_barang_masuk_detail_kodebarang ON public.barang_masuk_detail(kodebarang);

-- 3. TABEL MUTASI STOK
CREATE TABLE IF NOT EXISTS public.mutasi_stok (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kodebarang TEXT NOT NULL REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok_sebelum INTEGER NOT NULL,
  stok_sesudah INTEGER NOT NULL,
  perubahan INTEGER NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT,
  tipe TEXT NOT NULL DEFAULT 'manual' CHECK (tipe IN ('barang_masuk', 'opname', 'penjualan', 'retur', 'pembatalan', 'manual')),
  lokasi_asal TEXT,
  lokasi_tujuan TEXT,
  jumlah_pergerakan INTEGER,
  stok_lokasi_sebelum INTEGER,
  stok_lokasi_sesudah INTEGER,
  stok_tujuan_sebelum INTEGER,
  stok_tujuan_sesudah INTEGER,
  referensi_tipe TEXT,
  referensi_id TEXT,
  keterangan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS lokasi_asal TEXT;
ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS lokasi_tujuan TEXT;
ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS jumlah_pergerakan INTEGER;
ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS stok_lokasi_sebelum INTEGER;
ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS stok_lokasi_sesudah INTEGER;
ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS stok_tujuan_sebelum INTEGER;
ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS stok_tujuan_sesudah INTEGER;
ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS referensi_tipe TEXT;
ALTER TABLE public.mutasi_stok ADD COLUMN IF NOT EXISTS referensi_id TEXT;
ALTER TABLE public.mutasi_stok DROP CONSTRAINT IF EXISTS mutasi_stok_tipe_check;
UPDATE public.mutasi_stok
SET tipe = 'manual'
WHERE tipe NOT IN ('barang_masuk', 'opname', 'penjualan', 'retur', 'pembatalan', 'manual');
ALTER TABLE public.mutasi_stok ADD CONSTRAINT mutasi_stok_tipe_check
  CHECK (tipe IN ('barang_masuk', 'opname', 'penjualan', 'retur', 'pembatalan', 'manual'));

CREATE INDEX IF NOT EXISTS idx_mutasi_kodebarang ON public.mutasi_stok(kodebarang);
CREATE INDEX IF NOT EXISTS idx_mutasi_created_at ON public.mutasi_stok(created_at DESC);

-- 4. TABEL OPNAME HISTORY
CREATE TABLE IF NOT EXISTS public.opname_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_role TEXT,
  lokasi TEXT,
  file_name TEXT NOT NULL,
  total_proses INTEGER NOT NULL DEFAULT 0,
  total_sesuai INTEGER NOT NULL DEFAULT 0,
  total_selisih INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sukses' CHECK (status IN ('sukses', 'parsial', 'gagal')),
  details JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.opname_history ADD COLUMN IF NOT EXISTS lokasi TEXT;
ALTER TABLE public.opname_history ADD COLUMN IF NOT EXISTS user_role TEXT;

-- 5. TABEL PENJUALAN HISTORY
CREATE TABLE IF NOT EXISTS public.penjualan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT,
  kodebarang TEXT NOT NULL,
  namabarang TEXT NOT NULL,
  jumlah_terjual INTEGER NOT NULL CHECK (jumlah_terjual > 0),
  hargajual NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_nilai NUMERIC(15, 2) NOT NULL DEFAULT 0,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  shift TEXT CHECK (shift IN ('pagi', 'siang', 'malam') OR shift IS NULL),
  lokasi TEXT,
  keterangan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_penjualan_user_shift ON public.penjualan_history(user_id, shift, created_at DESC);
ALTER TABLE public.penjualan_history ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE public.penjualan_history ADD COLUMN IF NOT EXISTS shift TEXT;
ALTER TABLE public.penjualan_history ALTER COLUMN shift DROP NOT NULL;
ALTER TABLE public.penjualan_history ADD COLUMN IF NOT EXISTS lokasi TEXT;
CREATE INDEX IF NOT EXISTS idx_penjualan_lokasi ON public.penjualan_history(lokasi, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_penjualan_transaction_line
  ON public.penjualan_history(transaction_id, kodebarang);

-- 6. TABEL PERMINTAAN MUTASI ANTAR LOKASI
CREATE TABLE IF NOT EXISTS public.permintaan_mutasi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_permintaan TEXT NOT NULL,
  kodebarang TEXT NOT NULL REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  namabarang TEXT NOT NULL,
  asal_lokasi TEXT NOT NULL,
  tujuan_lokasi TEXT NOT NULL,
  jumlah_diminta INTEGER NOT NULL CHECK (jumlah_diminta > 0),
  satuan TEXT NOT NULL DEFAULT 'PCS',
  alasan TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'disetujui', 'ditolak')),
  pemohon_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  pemohon_name TEXT NOT NULL,
  pemohon_role TEXT NOT NULL,
  disetujui_oleh_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  disetujui_oleh_name TEXT,
  catatan_approval TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

WITH duplicate_requests AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY nomor_permintaan, kodebarang, pemohon_role, pemohon_name, created_at
      ORDER BY updated_at DESC, id
    ) AS duplicate_rank
  FROM public.permintaan_mutasi
)
DELETE FROM public.permintaan_mutasi AS request
USING duplicate_requests AS duplicate
WHERE request.id = duplicate.id AND duplicate.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_permintaan_mutasi_idempotency
  ON public.permintaan_mutasi(nomor_permintaan, kodebarang, pemohon_role, pemohon_name, created_at);

CREATE INDEX IF NOT EXISTS idx_permintaan_status ON public.permintaan_mutasi(status, created_at DESC);
`;

export const SQL_FUNCTIONS_SCRIPT = `-- ============================================================================
-- POSTGRESQL ATOMIC TRANSACTION FUNCTIONS
-- ============================================================================

-- Migration histori penjualan: aman dijalankan berulang kali
ALTER TABLE public.penjualan_history ADD COLUMN IF NOT EXISTS lokasi TEXT;
CREATE INDEX IF NOT EXISTS idx_penjualan_lokasi ON public.penjualan_history(lokasi, created_at DESC);

-- Function 1: fn_update_stok (Update single item stock with atomic mutation recording)
CREATE OR REPLACE FUNCTION public.fn_update_stok(
  p_kodebarang TEXT,
  p_delta INTEGER,
  p_user_id UUID,
  p_keterangan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stok INTEGER;
  v_new_stok INTEGER;
  v_user_name TEXT;
  v_namabarang TEXT;
  v_tipe TEXT;
BEGIN
  -- Dapatkan data barang & kunci baris (FOR UPDATE) untuk konkurensi aman
  SELECT stok, namabarang INTO v_current_stok, v_namabarang
  FROM public.barang
  WHERE kodebarang = p_kodebarang
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang dengan kode % tidak ditemukan', p_kodebarang;
  END IF;

  v_new_stok := v_current_stok + p_delta;
  IF v_new_stok < 0 THEN
    RAISE EXCEPTION 'Stok tidak mencukupi untuk barang %. Stok saat ini: %, pengurangan: %', 
      v_namabarang, v_current_stok, ABS(p_delta);
  END IF;

  -- Dapatkan nama user
  SELECT name INTO v_user_name FROM public.users WHERE id = p_user_id;

  -- Update tabel barang
  UPDATE public.barang
  SET stok = v_new_stok,
      updated_at = now()
  WHERE kodebarang = p_kodebarang;

  -- Tentukan tipe mutasi
  IF p_delta < 0 THEN
    v_tipe := 'penjualan';
  ELSIF p_keterangan ILIKE '%opname%' THEN
    v_tipe := 'opname';
  ELSE
    v_tipe := 'manual';
  END IF;

  -- Catat mutasi stok
  INSERT INTO public.mutasi_stok (
    kodebarang, stok_sebelum, stok_sesudah, perubahan, user_id, user_name, tipe,
    lokasi_asal, lokasi_tujuan, stok_lokasi_sebelum, stok_lokasi_sesudah,
    referensi_tipe, referensi_id, keterangan, created_at
  ) VALUES (
    p_kodebarang, v_current_stok, v_new_stok, p_delta, p_user_id, COALESCE(v_user_name, 'System'), v_tipe, p_keterangan, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'kodebarang', p_kodebarang,
    'stok_sebelum', v_current_stok,
    'stok_sesudah', v_new_stok,
    'perubahan', p_delta
  );
END;
$$;


-- Function 2: fn_batch_opname (Bulk Opname Update in a single atomic transaction)
DROP FUNCTION IF EXISTS public.fn_batch_opname(JSONB, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.fn_batch_opname(
  p_items JSONB, -- Array of {"kodebarang": "...", "stok_fisik": 100}
  p_user_id UUID,
  p_file_name TEXT,
  p_lokasi TEXT DEFAULT 'gudang'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_curr_stok INTEGER;
  v_curr_location_stok INTEGER;
  v_new_total_stok INTEGER;
  v_nama TEXT;
  v_user_name TEXT;
  v_user_role TEXT;
  v_total_proses INTEGER := 0;
  v_total_sesuai INTEGER := 0;
  v_total_selisih INTEGER := 0;
  v_selisih INTEGER;
  v_details JSONB := '[]'::jsonb;
BEGIN
  IF p_lokasi NOT IN ('gudang', 'toko', 'reseller', 'online', 'cacat') THEN
    RAISE EXCEPTION 'Lokasi opname tidak valid: %', p_lokasi;
  END IF;

  SELECT name, role INTO v_user_name, v_user_role
  FROM public.users
  WHERE id = p_user_id AND active = true;
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Akun petugas tidak aktif atau tidak ditemukan.';
  END IF;
  IF v_user_role <> 'admin' AND v_user_role <> p_lokasi THEN
    RAISE EXCEPTION 'Role % hanya dapat melakukan opname di lokasi %.', v_user_role, v_user_role;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(kodebarang TEXT, stok_fisik INTEGER)
  LOOP
    IF v_item.stok_fisik IS NULL OR v_item.stok_fisik < 0 THEN
      RAISE EXCEPTION 'Jumlah opname harus bilangan bulat nol atau lebih untuk barang %.', v_item.kodebarang;
    END IF;

    SELECT stok, COALESCE((stok_lokasi->>p_lokasi)::INTEGER, 0), namabarang
    INTO v_curr_stok, v_curr_location_stok, v_nama
    FROM public.barang
    WHERE kodebarang = v_item.kodebarang
    FOR UPDATE;

    IF FOUND THEN
      v_total_proses := v_total_proses + 1;
      v_selisih := v_item.stok_fisik - v_curr_location_stok;
      IF v_selisih < 0 THEN
        RAISE EXCEPTION 'Opname hanya boleh menambah stok. Barang % di % tercatat %, hasil fisik %.',
          v_item.kodebarang, p_lokasi, v_curr_location_stok, v_item.stok_fisik;
      END IF;
      v_new_total_stok := v_curr_stok + v_selisih;

      IF v_selisih = 0 THEN
        v_total_sesuai := v_total_sesuai + 1;
      ELSE
        v_total_selisih := v_total_selisih + 1;
        
        -- Update stok fisik
        UPDATE public.barang
        SET stok = v_new_total_stok,
            stok_lokasi = jsonb_set(
              COALESCE(stok_lokasi, '{}'::jsonb),
              ARRAY[p_lokasi],
              to_jsonb(v_item.stok_fisik),
              true
            ),
            updated_at = now()
        WHERE kodebarang = v_item.kodebarang;

        -- Catat mutasi
        INSERT INTO public.mutasi_stok (
          kodebarang, stok_sebelum, stok_sesudah, perubahan, user_id, user_name, tipe,
          lokasi_asal, lokasi_tujuan, jumlah_pergerakan, stok_lokasi_sebelum, stok_lokasi_sesudah,
          referensi_tipe, referensi_id, keterangan
        ) VALUES (
          v_item.kodebarang, v_curr_stok, v_new_total_stok, v_selisih, p_user_id, COALESCE(v_user_name, 'Staff'), 'opname',
          p_lokasi, p_lokasi, v_selisih, v_curr_location_stok, v_item.stok_fisik, 'opname', p_file_name,
          'Hasil Stock Opname Excel (' || p_lokasi || '): ' || p_file_name
        );
      END IF;

      v_details := v_details || jsonb_build_object(
        'kodebarang', v_item.kodebarang,
        'namabarang', v_nama,
        'stok_sistem', v_curr_location_stok,
        'stok_fisik', v_item.stok_fisik,
        'selisih', v_selisih
      );
    END IF;
  END LOOP;

  -- Catat opname history
  INSERT INTO public.opname_history (
    user_id, user_name, lokasi, file_name, total_proses, total_sesuai, total_selisih, status, details, created_at
  ) VALUES (
    p_user_id, COALESCE(v_user_name, 'Staff'), p_lokasi, p_file_name, v_total_proses, v_total_sesuai, v_total_selisih, 'sukses', v_details, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'total_proses', v_total_proses,
    'total_sesuai', v_total_sesuai,
    'total_selisih', v_total_selisih
  );
END;
$$;


-- Function 3: fn_record_penjualan (Record Sales from Kasir Excel & Deduct Stock Atomically)
DROP FUNCTION IF EXISTS public.fn_record_penjualan(JSONB, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_record_penjualan(JSONB, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_record_penjualan(JSONB, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_record_penjualan(JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_record_penjualan(
  p_items JSONB, -- Array of {"kodebarang": "...", "jumlah_terjual": 5}
  p_user_email TEXT,
  p_keterangan TEXT,
  p_transaction_id TEXT,
  p_sales_location TEXT DEFAULT 'toko'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_curr_stok INTEGER;
  v_curr_total_stok INTEGER;
  v_namabarang TEXT;
  v_hargajual NUMERIC(15, 2);
  v_total_nilai NUMERIC(15, 2);
  v_user_name TEXT;
  v_user_id UUID;
  v_user_role TEXT;
  v_allowed_location TEXT;
  v_total_items INTEGER := 0;
  v_total_nominal NUMERIC(15, 2) := 0;
  v_existing_count INTEGER;
  v_existing_items INTEGER;
  v_existing_nominal NUMERIC(15, 2);
BEGIN
  IF p_transaction_id IS NULL OR btrim(p_transaction_id) = '' THEN
    RAISE EXCEPTION 'ID transaksi wajib diisi untuk mencegah penjualan tercatat ganda.';
  END IF;

  SELECT id, name, role INTO v_user_id, v_user_name, v_user_role
  FROM public.users
  WHERE lower(email) = lower(p_user_email) AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun kasir tidak ditemukan atau tidak aktif.';
  END IF;

  v_allowed_location := CASE v_user_role
    WHEN 'toko' THEN 'toko'
    WHEN 'online' THEN 'online'
    WHEN 'reseller' THEN 'reseller'
    WHEN 'cacat' THEN 'cacat'
    WHEN 'admin' THEN p_sales_location
    ELSE NULL
  END;

  IF v_allowed_location IS NULL OR v_allowed_location <> p_sales_location THEN
    RAISE EXCEPTION 'Role % tidak diizinkan mencatat penjualan pada lokasi %.', v_user_role, p_sales_location;
  END IF;

  IF p_sales_location NOT IN ('toko', 'reseller', 'online', 'cacat') THEN
    RAISE EXCEPTION 'Lokasi penjualan tidak valid: %.', p_sales_location;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_transaction_id, 0));

  SELECT COUNT(*), COALESCE(SUM(jumlah_terjual), 0), COALESCE(SUM(total_nilai), 0)
  INTO v_existing_count, v_existing_items, v_existing_nominal
  FROM public.penjualan_history
  WHERE transaction_id = p_transaction_id;

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'total_items_processed', v_existing_count,
      'total_units_sold', v_existing_items,
      'total_nominal_sales', v_existing_nominal
    );
  END IF;

  -- Validasi & loop semua item
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(kodebarang TEXT, jumlah_terjual INTEGER)
  LOOP
    SELECT stok, COALESCE((stok_lokasi->>p_sales_location)::INTEGER, 0), namabarang, hargajual
    INTO v_curr_total_stok, v_curr_stok, v_namabarang, v_hargajual
    FROM public.barang
    WHERE kodebarang = v_item.kodebarang
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % tidak ditemukan di database', v_item.kodebarang;
    END IF;

    IF v_curr_stok < v_item.jumlah_terjual THEN
      RAISE EXCEPTION 'Stok tidak mencukupi untuk % (Sisa: %, Terjual: %)', 
        v_namabarang, v_curr_stok, v_item.jumlah_terjual;
    END IF;

    v_total_nilai := v_item.jumlah_terjual * v_hargajual;
    v_total_nominal := v_total_nominal + v_total_nilai;
    v_total_items := v_total_items + 1;

    -- Kurangi stok di tabel barang
    UPDATE public.barang
    SET stok = GREATEST(0, stok - v_item.jumlah_terjual),
        stok_lokasi = jsonb_set(
          COALESCE(stok_lokasi, '{}'::jsonb),
          ARRAY[p_sales_location],
          to_jsonb(GREATEST(0, COALESCE((stok_lokasi->>p_sales_location)::INTEGER, 0) - v_item.jumlah_terjual)),
          true
        ),
        updated_at = now()
    WHERE kodebarang = v_item.kodebarang;

    -- Catat ke mutasi stok
    INSERT INTO public.mutasi_stok (
      kodebarang, stok_sebelum, stok_sesudah, perubahan, user_id, user_name, tipe,
      lokasi_asal, lokasi_tujuan, jumlah_pergerakan, stok_lokasi_sebelum, stok_lokasi_sesudah,
      referensi_tipe, referensi_id, keterangan
    ) VALUES (
      v_item.kodebarang, v_curr_total_stok, v_curr_total_stok - v_item.jumlah_terjual, -v_item.jumlah_terjual,
      v_user_id, COALESCE(v_user_name, 'Kasir'), 'penjualan',
      p_sales_location, NULL, v_item.jumlah_terjual, v_curr_stok, v_curr_stok - v_item.jumlah_terjual, 'penjualan', p_transaction_id,
      'Upload Penjualan Kasir' || COALESCE(': ' || p_keterangan, '')
    );

    -- Catat ke penjualan_history
    INSERT INTO public.penjualan_history (
      transaction_id, kodebarang, namabarang, jumlah_terjual, hargajual, total_nilai, user_id, user_name, lokasi, keterangan
    ) VALUES (
      p_transaction_id, v_item.kodebarang, v_namabarang, v_item.jumlah_terjual, v_hargajual, v_total_nilai, 
      v_user_id, COALESCE(v_user_name, 'Kasir'), p_sales_location, p_keterangan
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_items_processed', v_total_items,
    'total_nominal_sales', v_total_nominal
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_delete_barang_masuk(
  p_nomor_faktur TEXT,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_current_total INTEGER;
  v_current_warehouse INTEGER;
  v_receipt_exists BOOLEAN;
  v_line_count INTEGER := 0;
BEGIN
  IF p_nomor_faktur IS NULL OR btrim(p_nomor_faktur) = '' THEN
    RAISE EXCEPTION 'Nomor faktur wajib diisi.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_nomor_faktur, 0));
  SELECT TRUE INTO v_receipt_exists
  FROM public.barang_masuk
  WHERE nomor_faktur = p_nomor_faktur
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true);
  END IF;

  FOR v_item IN
    SELECT kodebarang, namabarang, jumlah
    FROM public.barang_masuk_detail
    WHERE nomor_faktur = p_nomor_faktur
    ORDER BY kodebarang
  LOOP
    SELECT stok,
      COALESCE((stok_lokasi->>'gudang')::INTEGER, CASE WHEN lokasi = 'gudang' THEN stok ELSE 0 END)
    INTO v_current_total, v_current_warehouse
    FROM public.barang
    WHERE kodebarang = v_item.kodebarang
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Master barang % tidak ditemukan; faktur tidak dihapus.', v_item.kodebarang;
    END IF;
    IF v_current_warehouse < v_item.jumlah THEN
      RAISE EXCEPTION 'Stok gudang % tidak cukup untuk membatalkan faktur. Sisa: %, jumlah faktur: %.',
        v_item.kodebarang, v_current_warehouse, v_item.jumlah;
    END IF;

    UPDATE public.barang
    SET stok = GREATEST(0, stok - v_item.jumlah),
        stok_lokasi = jsonb_set(
          COALESCE(stok_lokasi, jsonb_build_object('gudang', 0, 'toko', 0, 'reseller', 0, 'online', 0, 'cacat', 0)),
          '{gudang}', to_jsonb(v_current_warehouse - v_item.jumlah), true
        ),
        updated_at = now()
    WHERE kodebarang = v_item.kodebarang;

    INSERT INTO public.mutasi_stok (
      kodebarang, stok_sebelum, stok_sesudah, perubahan, user_id, user_name, tipe,
      lokasi_asal, lokasi_tujuan, jumlah_pergerakan, stok_lokasi_sebelum, stok_lokasi_sesudah,
      referensi_tipe, referensi_id, keterangan, created_at
    ) VALUES (
      v_item.kodebarang, v_current_total, v_current_total - v_item.jumlah, -v_item.jumlah,
      p_user_id, COALESCE(NULLIF(p_user_name, ''), 'Admin'), 'pembatalan',
      'gudang', NULL, v_item.jumlah, v_current_warehouse, v_current_warehouse - v_item.jumlah,
      'barang_masuk', p_nomor_faktur, 'Pembatalan barang masuk faktur ' || p_nomor_faktur, now()
    );
    v_line_count := v_line_count + 1;
  END LOOP;

  DELETE FROM public.barang_masuk WHERE nomor_faktur = p_nomor_faktur;
  RETURN jsonb_build_object('success', true, 'nomor_faktur', p_nomor_faktur, 'total_baris', v_line_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_delete_barang_masuk(TEXT, UUID, TEXT) TO anon, authenticated;
`;

export const SQL_RLS_POLICIES_SCRIPT = `-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Aktifkan RLS di semua tabel
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_gudang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_toko ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_reseller ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_online ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_cacat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutasi_stok ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opname_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penjualan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barang_masuk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barang_masuk_detail ENABLE ROW LEVEL SECURITY;

-- Helper Function: Dapatkan Role dari JWT auth.uid()
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 1. POLICIES UNTUK TABEL USERS
-- Penulisan user dilakukan server dengan service-role key setelah verifikasi Admin.
-- Jangan tambahkan policy untuk anon pada tabel ini.
DROP POLICY IF EXISTS "Admin full access on users" ON public.users;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Admin full access on barang" ON public.barang;
DROP POLICY IF EXISTS "Non-kasir can read barang" ON public.barang;
DROP POLICY IF EXISTS "Admin and Non-Kasir opname access" ON public.opname_history;
DROP POLICY IF EXISTS "Admin can view all sales" ON public.penjualan_history;
DROP POLICY IF EXISTS "Kasir can view only own sales" ON public.penjualan_history;
DROP POLICY IF EXISTS "Kasir and Admin can insert sales" ON public.penjualan_history;
DROP POLICY IF EXISTS "Admin and Stock staff can view mutations" ON public.mutasi_stok;
DROP POLICY IF EXISTS "LAN gateway stok_gudang" ON public.stok_gudang;
DROP POLICY IF EXISTS "LAN gateway stok_toko" ON public.stok_toko;
DROP POLICY IF EXISTS "LAN gateway stok_reseller" ON public.stok_reseller;
DROP POLICY IF EXISTS "LAN gateway stok_online" ON public.stok_online;
DROP POLICY IF EXISTS "LAN gateway stok_cacat" ON public.stok_cacat;
DROP POLICY IF EXISTS "LAN gateway suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "LAN gateway barang_masuk" ON public.barang_masuk;
DROP POLICY IF EXISTS "LAN gateway barang_masuk_detail" ON public.barang_masuk_detail;

-- Admin punya akses penuh
CREATE POLICY "Admin full access on users" ON public.users
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin');

-- User umum bisa melihat profile mereka sendiri
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 2. POLICIES UNTUK TABEL BARANG
-- Admin punya akses penuh CRUD
CREATE POLICY "Admin full access on barang" ON public.barang
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin');

-- Non-Kasir (Gudang, Toko, Reseller, Online) BISA membaca stok
CREATE POLICY "Non-kasir can read barang" ON public.barang
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('gudang', 'toko', 'reseller', 'online', 'cacat'));

-- KASIR DIBLOKIR dari SELECT langsung ke tabel barang untuk keamanan stok
-- (Kasir memotong stok secara terenkapsulasi melalui SECURITY DEFINER fn_record_penjualan)

-- 3. POLICIES UNTUK TABEL OPNAME HISTORY
-- Admin & Non-Kasir bisa membaca & mengunggah opname
CREATE POLICY "Admin and Non-Kasir opname access" ON public.opname_history
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'gudang', 'toko', 'reseller', 'online', 'cacat'));

-- 4. POLICIES UNTUK TABEL PENJUALAN HISTORY
-- Admin bisa melihat semua riwayat penjualan
CREATE POLICY "Admin can view all sales" ON public.penjualan_history
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

-- Kasir HANYA BISA melihat riwayat penjualan miliknya sendiri
CREATE POLICY "Kasir can view only own sales" ON public.penjualan_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.current_user_role() IN ('toko', 'online', 'reseller', 'cacat'));

-- Kasir & Admin bisa insert penjualan
CREATE POLICY "Kasir and Admin can insert sales" ON public.penjualan_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'toko' AND lokasi = 'toko')
    OR (public.current_user_role() = 'online' AND lokasi = 'online')
    OR (public.current_user_role() = 'reseller' AND lokasi = 'reseller')
    OR (public.current_user_role() = 'cacat' AND lokasi = 'cacat')
  );

-- 5. POLICIES UNTUK TABEL MUTASI STOK
-- Admin & Non-kasir bisa melihat mutasi
CREATE POLICY "Admin and Stock staff can view mutations" ON public.mutasi_stok
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'gudang', 'toko', 'reseller', 'online', 'cacat'));

-- Gateway LAN memakai anon key di server utama; tabel lain juga mengikuti policy gateway ini.
CREATE POLICY "LAN gateway stok_gudang" ON public.stok_gudang FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway stok_toko" ON public.stok_toko FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway stok_reseller" ON public.stok_reseller FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway stok_online" ON public.stok_online FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway stok_cacat" ON public.stok_cacat FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway suppliers" ON public.suppliers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway barang_masuk" ON public.barang_masuk FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway barang_masuk_detail" ON public.barang_masuk_detail FOR ALL TO anon USING (true) WITH CHECK (true);

-- Mode server LAN: server memakai anon key sebagai gateway pusat.
ALTER TABLE public.permintaan_mutasi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LAN gateway barang" ON public.barang;
DROP POLICY IF EXISTS "LAN gateway mutasi" ON public.mutasi_stok;
DROP POLICY IF EXISTS "LAN gateway opname" ON public.opname_history;
DROP POLICY IF EXISTS "LAN gateway penjualan" ON public.penjualan_history;
DROP POLICY IF EXISTS "LAN gateway permintaan" ON public.permintaan_mutasi;
CREATE POLICY "LAN gateway barang" ON public.barang FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway mutasi" ON public.mutasi_stok FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway opname" ON public.opname_history FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway penjualan" ON public.penjualan_history FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "LAN gateway permintaan" ON public.permintaan_mutasi FOR ALL TO anon USING (true) WITH CHECK (true);
`;

export const DEPLOYMENT_GUIDE_MD = `# 🚀 Panduan Deployment Pantau Stok Multi-Channel (Ubuntu + PM2 + Nginx)

## 1. Persiapan Server Ubuntu (22.04 LTS / 24.04 LTS)

Login ke VPS Ubuntu Anda:
\`\`\`bash
ssh root@your-server-ip
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx build-essential
\`\`\`

## 2. Install Node.js 20 LTS & PM2
\`\`\`bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
\`\`\`

## 3. Clone Repository & Install Dependencies
\`\`\`bash
mkdir -p /var/www/pantau-stok
cd /var/www/pantau-stok
# Clone source code atau upload file project
git clone <URL_REPO_ANDA> .

# Setup Environment File (.env.production)
cat << 'EOF' > .env.production
PORT=3000
NODE_ENV=production
VITE_SUPABASE_URL=https://styfwlxrsxpvguxnglih.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0eWZ3bHhyc3hwdmd1eG5nbGloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODM4NzEsImV4cCI6MjEwNTc1OTg3MX0.YyEGYz5byhvKdPTFZGza72PHZJzom-yIFpHyuL-E4yA
EOF

# Install dependencies & Build
npm install
npm run build
\`\`\`

## 4. Konfigurasi PM2 Process Manager
Buat file \`ecosystem.config.cjs\` di \`/var/www/pantau-stok\`:
\`\`\`javascript
module.exports = {
  apps: [
    {
      name: 'pantau-stok-app',
      script: 'node',
      args: 'server.js', // atau serve static / custom server
      cwd: '/var/www/pantau-stok',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
\`\`\`

Jalankan PM2 dan aktifkan auto-start saat reboot:
\`\`\`bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
\`\`\`

## 5. Konfigurasi Nginx Reverse Proxy & SSL (Domain: pantau-studio.simponi-kharisma.my.id)

Buat file virtual host Nginx:
\`\`\`bash
sudo nano /etc/nginx/sites-available/pantau-studio
\`\`\`

Isi konfigurasi berikut:
\`\`\`nginx
server {
    listen 80;
    server_name pantau-studio.simponi-kharisma.my.id;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
\`\`\`

Aktifkan konfigurasi dan reload Nginx:
\`\`\`bash
sudo ln -s /etc/nginx/sites-available/pantau-studio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
\`\`\`

## 6. Pasang SSL Gratis dengan Let's Encrypt (Certbot)
\`\`\`bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pantau-studio.simponi-kharisma.my.id
\`\`\`

Aplikasi kini live dengan aman di **https://pantau-studio.simponi-kharisma.my.id**!
`;

export const SQL_OPTIMIZATION_INDEXES_SCRIPT = `-- ============================================================================
-- OPTIMASI POSTGRESQL & SUPABASE UNTUK 20.000+ DATA BARANG
-- Eksekusi di Supabase SQL Editor untuk mempercepat query dari detik ke mili-detik
-- ============================================================================

-- 1. Tambahkan kolom password untuk sistem login multi-role
ALTER TABLE IF EXISTS public.users 
ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '123456';
ALTER TABLE IF EXISTS public.users
ADD COLUMN IF NOT EXISTS signature TEXT;
UPDATE public.users SET password = '123456' WHERE password IS NULL;
ALTER TABLE public.users ALTER COLUMN password SET DEFAULT '123456';
ALTER TABLE public.users ALTER COLUMN password SET NOT NULL;

-- Set password default untuk admin
UPDATE public.users 
SET password = 'admin123' 
WHERE role = 'admin' AND (password IS NULL OR password = '123456');

-- 2. Aktifkan modul Trigram (pg_trgm) untuk pencarian nama barang instan
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. B-Tree Indexes untuk pencarian tepat (Equality / Range) pada 20.000 baris
CREATE INDEX IF NOT EXISTS idx_barang_kodebarang ON public.barang(kodebarang);
CREATE INDEX IF NOT EXISTS idx_barang_kodebarcode ON public.barang(kodebarcode);
CREATE INDEX IF NOT EXISTS idx_barang_lokasi_stok ON public.barang(lokasi, stok);
CREATE INDEX IF NOT EXISTS idx_barang_jenis ON public.barang(jenis);
CREATE INDEX IF NOT EXISTS idx_barang_merek ON public.barang(merek);
CREATE INDEX IF NOT EXISTS idx_barang_hargajual ON public.barang(hargajual);
CREATE INDEX IF NOT EXISTS idx_barang_updated_at ON public.barang(updated_at DESC);

-- 4. GIN Trigram Index untuk pencarian LIKE / ILIKE nama barang (< 5ms untuk 20.000 data)
CREATE INDEX IF NOT EXISTS idx_barang_namabarang_gin ON public.barang USING gin (namabarang gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_barang_merek_gin ON public.barang USING gin (merek gin_trgm_ops);

-- 5. Indeks untuk tabel mutasi, opname, dan penjualan
CREATE INDEX IF NOT EXISTS idx_mutasi_kode_created ON public.mutasi_stok(kodebarang, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_penjualan_created ON public.penjualan_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_penjualan_shift ON public.penjualan_history(shift, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permintaan_status ON public.permintaan_mutasi(status, created_at DESC);

-- 6. Perbarui statistik query planner (Cost-Based Optimizer)
ANALYZE public.barang;
ANALYZE public.mutasi_stok;
ANALYZE public.penjualan_history;
ANALYZE public.permintaan_mutasi;
ANALYZE public.users;
`;

export const SQL_LOCATION_STOCK_MIGRATION_SCRIPT = `-- ============================================================================
-- MIGRASI LOKASI STOK (OPSIONAL / LEGACY COMPATIBILITY)
-- Catatan: pola stok baru tidak memakai import stok lokasi manual. Script ini hanya
-- untuk database lama yang masih memerlukan normalisasi saldo per lokasi.
-- Jalankan sekali di Supabase SQL Editor setelah tabel barang tersedia.
-- ============================================================================

ALTER TABLE public.barang
  ADD COLUMN IF NOT EXISTS stok_lokasi JSONB NOT NULL DEFAULT jsonb_build_object(
    'gudang', 0, 'toko', 0, 'reseller', 0, 'online', 0, 'cacat', 0
  );
ALTER TABLE public.barang ALTER COLUMN stok_lokasi SET DEFAULT jsonb_build_object(
  'gudang', 0, 'toko', 0, 'reseller', 0, 'online', 0, 'cacat', 0
);
ALTER TABLE public.barang DROP CONSTRAINT IF EXISTS barang_lokasi_check;
UPDATE public.barang SET lokasi = 'toko' WHERE lokasi = 'etalase';
ALTER TABLE public.barang ADD CONSTRAINT barang_lokasi_check
  CHECK (lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat'));
UPDATE public.barang
SET stok_lokasi = jsonb_set(COALESCE(stok_lokasi, '{}'::jsonb), '{cacat}', COALESCE(stok_lokasi->'cacat', '0'::jsonb), true)
WHERE NOT (COALESCE(stok_lokasi, '{}'::jsonb) ? 'cacat');

CREATE TABLE IF NOT EXISTS public.stok_gudang (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stok_toko (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stok_reseller (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stok_online (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stok_cacat (
  kodebarang TEXT PRIMARY KEY REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrate legacy store balances without deleting the table or its dependencies.
DO $$
BEGIN
  IF to_regclass('public.stok_etalase') IS NOT NULL THEN
    EXECUTE $migration$
      UPDATE public.barang AS barang
      SET stok_lokasi = jsonb_set(
            jsonb_set(
              COALESCE(barang.stok_lokasi, '{}'::jsonb),
              '{toko}', to_jsonb(merged.toko_stock), true
            ),
            ARRAY[merged.primary_location],
            to_jsonb(merged.primary_stock + GREATEST(0, barang.stok - merged.total_stock)),
            true
          ),
          stok = GREATEST(barang.stok, merged.total_stock)
      FROM public.stok_etalase AS etalase
      CROSS JOIN LATERAL (
        SELECT
          GREATEST(COALESCE((barang.stok_lokasi->>'toko')::INTEGER, 0), COALESCE(etalase.stok, 0)) AS toko_stock,
          COALESCE((barang.stok_lokasi->>'gudang')::INTEGER, 0)
            + COALESCE((barang.stok_lokasi->>'reseller')::INTEGER, 0)
            + COALESCE((barang.stok_lokasi->>'online')::INTEGER, 0)
            + COALESCE((barang.stok_lokasi->>'cacat')::INTEGER, 0)
            + GREATEST(COALESCE((barang.stok_lokasi->>'toko')::INTEGER, 0), COALESCE(etalase.stok, 0)) AS total_stock,
          CASE WHEN barang.lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat') THEN barang.lokasi ELSE 'gudang' END AS primary_location,
          CASE
            WHEN barang.lokasi = 'toko' THEN GREATEST(COALESCE((barang.stok_lokasi->>'toko')::INTEGER, 0), COALESCE(etalase.stok, 0))
            ELSE COALESCE((barang.stok_lokasi->>barang.lokasi)::INTEGER, 0)
          END AS primary_stock
      ) AS merged
      WHERE barang.kodebarang = etalase.kodebarang
    $migration$;
  END IF;
END;
$$;

-- Inisialisasi saldo kosong satu kali saja. Saat ada data lokasi, rerun tidak menghapus stok.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stok_gudang LIMIT 1)
     AND NOT EXISTS (SELECT 1 FROM public.stok_toko LIMIT 1)
     AND NOT EXISTS (SELECT 1 FROM public.stok_reseller LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.stok_online LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.stok_cacat LIMIT 1) THEN
    UPDATE public.barang AS barang
    SET stok_lokasi = CASE
      WHEN COALESCE((barang.stok_lokasi->>'gudang')::INTEGER, 0)
        + COALESCE((barang.stok_lokasi->>'toko')::INTEGER, 0)
        + COALESCE((barang.stok_lokasi->>'reseller')::INTEGER, 0)
        + COALESCE((barang.stok_lokasi->>'online')::INTEGER, 0)
        + COALESCE((barang.stok_lokasi->>'cacat')::INTEGER, 0) = 0 AND barang.stok > 0
      THEN jsonb_set(
        COALESCE(barang.stok_lokasi, '{}'::jsonb),
        ARRAY[CASE WHEN barang.lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat') THEN barang.lokasi ELSE 'gudang' END],
        to_jsonb(barang.stok), true
      )
      ELSE COALESCE(barang.stok_lokasi, jsonb_build_object('gudang', 0, 'toko', 0, 'reseller', 0, 'online', 0, 'cacat', 0))
    END;

    INSERT INTO public.stok_gudang (kodebarang, stok) SELECT kodebarang, COALESCE((stok_lokasi->>'gudang')::INTEGER, 0) FROM public.barang ON CONFLICT DO NOTHING;
    INSERT INTO public.stok_toko (kodebarang, stok) SELECT kodebarang, COALESCE((stok_lokasi->>'toko')::INTEGER, 0) FROM public.barang ON CONFLICT DO NOTHING;
    INSERT INTO public.stok_reseller (kodebarang, stok) SELECT kodebarang, COALESCE((stok_lokasi->>'reseller')::INTEGER, 0) FROM public.barang ON CONFLICT DO NOTHING;
    INSERT INTO public.stok_online (kodebarang, stok) SELECT kodebarang, COALESCE((stok_lokasi->>'online')::INTEGER, 0) FROM public.barang ON CONFLICT DO NOTHING;
    INSERT INTO public.stok_cacat (kodebarang, stok) SELECT kodebarang, COALESCE((stok_lokasi->>'cacat')::INTEGER, 0) FROM public.barang ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_barang_location_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  location_key TEXT;
  other_stock INTEGER;
  location_stock INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stok_lokasi := COALESCE(NEW.stok_lokasi, jsonb_build_object(
      'gudang', 0, 'toko', 0, 'reseller', 0, 'online', 0, 'cacat', 0
    ));
    IF COALESCE((NEW.stok_lokasi->>'gudang')::INTEGER, 0)
      + COALESCE((NEW.stok_lokasi->>'toko')::INTEGER, 0)
      + COALESCE((NEW.stok_lokasi->>'reseller')::INTEGER, 0)
      + COALESCE((NEW.stok_lokasi->>'online')::INTEGER, 0)
      + COALESCE((NEW.stok_lokasi->>'cacat')::INTEGER, 0) = 0 AND NEW.stok > 0 THEN
      location_key := CASE WHEN NEW.lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat') THEN NEW.lokasi ELSE 'gudang' END;
      NEW.stok_lokasi := jsonb_set(NEW.stok_lokasi, ARRAY[location_key], to_jsonb(NEW.stok), true);
    END IF;
  ELSIF NEW.stok_lokasi IS NOT DISTINCT FROM OLD.stok_lokasi AND NEW.stok IS DISTINCT FROM OLD.stok THEN
    location_key := CASE WHEN NEW.lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat') THEN NEW.lokasi ELSE 'gudang' END;
    other_stock := OLD.stok
      - COALESCE((OLD.stok_lokasi->>location_key)::INTEGER, 0);
    location_stock := NEW.stok - other_stock;
    IF location_stock < 0 THEN
      RAISE EXCEPTION 'Stok total tidak dapat lebih kecil dari stok di lokasi lain.';
    END IF;
    NEW.stok_lokasi := jsonb_set(
      COALESCE(OLD.stok_lokasi, '{}'::jsonb),
      ARRAY[location_key],
      to_jsonb(location_stock),
      true
    );
  END IF;

  NEW.stok := COALESCE((NEW.stok_lokasi->>'gudang')::INTEGER, 0)
    + COALESCE((NEW.stok_lokasi->>'toko')::INTEGER, 0)
    + COALESCE((NEW.stok_lokasi->>'reseller')::INTEGER, 0)
    + COALESCE((NEW.stok_lokasi->>'online')::INTEGER, 0)
    + COALESCE((NEW.stok_lokasi->>'cacat')::INTEGER, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_barang_location_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locations JSONB;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.stok_lokasi IS NOT DISTINCT FROM OLD.stok_lokasi THEN RETURN NULL; END IF;
  locations := COALESCE(NEW.stok_lokasi, '{}'::jsonb);

  INSERT INTO public.stok_gudang (kodebarang, stok, updated_at)
  VALUES (NEW.kodebarang, COALESCE((locations->>'gudang')::INTEGER, 0), now())
  ON CONFLICT (kodebarang) DO UPDATE SET stok = EXCLUDED.stok, updated_at = now();
  INSERT INTO public.stok_toko (kodebarang, stok, updated_at)
  VALUES (NEW.kodebarang, COALESCE((locations->>'toko')::INTEGER, 0), now())
  ON CONFLICT (kodebarang) DO UPDATE SET stok = EXCLUDED.stok, updated_at = now();
  INSERT INTO public.stok_reseller (kodebarang, stok, updated_at)
  VALUES (NEW.kodebarang, COALESCE((locations->>'reseller')::INTEGER, 0), now())
  ON CONFLICT (kodebarang) DO UPDATE SET stok = EXCLUDED.stok, updated_at = now();
  INSERT INTO public.stok_online (kodebarang, stok, updated_at)
  VALUES (NEW.kodebarang, COALESCE((locations->>'online')::INTEGER, 0), now())
  ON CONFLICT (kodebarang) DO UPDATE SET stok = EXCLUDED.stok, updated_at = now();
  INSERT INTO public.stok_cacat (kodebarang, stok, updated_at)
  VALUES (NEW.kodebarang, COALESCE((locations->>'cacat')::INTEGER, 0), now())
  ON CONFLICT (kodebarang) DO UPDATE SET stok = EXCLUDED.stok, updated_at = now();
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_barang_stock_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_code TEXT;
  warehouse_stock INTEGER;
  store_stock INTEGER;
  reseller_stock INTEGER;
  online_stock INTEGER;
  damaged_stock INTEGER;
BEGIN
  item_code := CASE WHEN TG_OP = 'DELETE' THEN OLD.kodebarang ELSE NEW.kodebarang END;
  SELECT COALESCE(g.stok, 0), COALESCE(t.stok, 0),
          COALESCE(r.stok, 0), COALESCE(o.stok, 0), COALESCE(c.stok, 0)
        INTO warehouse_stock, store_stock, reseller_stock, online_stock, damaged_stock
  FROM public.barang b
  LEFT JOIN public.stok_gudang g ON g.kodebarang = b.kodebarang
  LEFT JOIN public.stok_toko t ON t.kodebarang = b.kodebarang
  LEFT JOIN public.stok_reseller r ON r.kodebarang = b.kodebarang
  LEFT JOIN public.stok_online o ON o.kodebarang = b.kodebarang
  LEFT JOIN public.stok_cacat c ON c.kodebarang = b.kodebarang
  WHERE b.kodebarang = item_code;

  IF FOUND THEN
    UPDATE public.barang
    SET stok = warehouse_stock + store_stock + reseller_stock + online_stock + damaged_stock,
        stok_lokasi = jsonb_build_object(
          'gudang', warehouse_stock, 'toko', store_stock,
          'reseller', reseller_stock, 'online', online_stock, 'cacat', damaged_stock
        ),
        updated_at = now()
    WHERE kodebarang = item_code;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_barang_location_stock ON public.barang;
CREATE TRIGGER trg_prepare_barang_location_stock
  BEFORE INSERT OR UPDATE OF stok, stok_lokasi ON public.barang
  FOR EACH ROW EXECUTE FUNCTION public.prepare_barang_location_stock();
DROP TRIGGER IF EXISTS trg_sync_barang_location_tables ON public.barang;
CREATE TRIGGER trg_sync_barang_location_tables
  AFTER INSERT OR UPDATE OF stok, stok_lokasi ON public.barang
  FOR EACH ROW EXECUTE FUNCTION public.sync_barang_location_tables();

DROP TRIGGER IF EXISTS trg_refresh_barang_from_stok_gudang ON public.stok_gudang;
CREATE TRIGGER trg_refresh_barang_from_stok_gudang AFTER INSERT OR UPDATE OR DELETE ON public.stok_gudang
  FOR EACH ROW EXECUTE FUNCTION public.refresh_barang_stock_total();
DROP TRIGGER IF EXISTS trg_refresh_barang_from_stok_toko ON public.stok_toko;
CREATE TRIGGER trg_refresh_barang_from_stok_toko AFTER INSERT OR UPDATE OR DELETE ON public.stok_toko
  FOR EACH ROW EXECUTE FUNCTION public.refresh_barang_stock_total();
DROP TRIGGER IF EXISTS trg_refresh_barang_from_stok_reseller ON public.stok_reseller;
CREATE TRIGGER trg_refresh_barang_from_stok_reseller AFTER INSERT OR UPDATE OR DELETE ON public.stok_reseller
  FOR EACH ROW EXECUTE FUNCTION public.refresh_barang_stock_total();
DROP TRIGGER IF EXISTS trg_refresh_barang_from_stok_online ON public.stok_online;
CREATE TRIGGER trg_refresh_barang_from_stok_online AFTER INSERT OR UPDATE OR DELETE ON public.stok_online
  FOR EACH ROW EXECUTE FUNCTION public.refresh_barang_stock_total();
DROP TRIGGER IF EXISTS trg_refresh_barang_from_stok_cacat ON public.stok_cacat;
CREATE TRIGGER trg_refresh_barang_from_stok_cacat AFTER INSERT OR UPDATE OR DELETE ON public.stok_cacat
  FOR EACH ROW EXECUTE FUNCTION public.refresh_barang_stock_total();

UPDATE public.barang
SET stok_lokasi = jsonb_set(
  COALESCE(stok_lokasi, '{}'::jsonb) - 'etalase',
  '{toko}',
  to_jsonb(COALESCE((stok_lokasi->>'toko')::INTEGER, 0) + COALESCE((stok_lokasi->>'etalase')::INTEGER, 0)),
  true
)
WHERE COALESCE(stok_lokasi, '{}'::jsonb) ? 'etalase';

INSERT INTO public.stok_gudang (kodebarang, stok) SELECT kodebarang, 0 FROM public.barang ON CONFLICT DO NOTHING;
INSERT INTO public.stok_toko (kodebarang, stok) SELECT kodebarang, 0 FROM public.barang ON CONFLICT DO NOTHING;
INSERT INTO public.stok_reseller (kodebarang, stok) SELECT kodebarang, 0 FROM public.barang ON CONFLICT DO NOTHING;
INSERT INTO public.stok_online (kodebarang, stok) SELECT kodebarang, 0 FROM public.barang ON CONFLICT DO NOTHING;
INSERT INTO public.stok_cacat (kodebarang, stok) SELECT kodebarang, 0 FROM public.barang ON CONFLICT DO NOTHING;
DROP FUNCTION IF EXISTS public.finalize_location_stock_imports(UUID);
DROP FUNCTION IF EXISTS public.finalize_location_stock_imports(TEXT);
DROP TABLE IF EXISTS public.stock_import_items;
DROP TABLE IF EXISTS public.stock_import_batches;
 NOTIFY pgrst, 'reload schema';
`;

export const SQL_RETUR_STOK_MIGRATION_SCRIPT = `-- ============================================================================
-- RETUR STOK: REQUEST ANTAR LOKASI ATAU KE SUPPLIER
-- Aman dijalankan berulang; tidak menghapus atau mengubah tabel yang sudah ada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.retur_stok (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_retur TEXT NOT NULL UNIQUE,
  kodebarang TEXT NOT NULL REFERENCES public.barang(kodebarang) ON DELETE CASCADE,
  namabarang TEXT NOT NULL,
  asal_lokasi TEXT NOT NULL CHECK (asal_lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat')),
  tujuan_lokasi TEXT CHECK (tujuan_lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat')),
  supplier TEXT,
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),
  satuan TEXT NOT NULL DEFAULT 'Pcs',
  alasan TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'disetujui', 'ditolak')),
  pemohon_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  pemohon_name TEXT NOT NULL,
  pemohon_role TEXT NOT NULL CHECK (pemohon_role IN ('admin', 'gudang', 'toko', 'reseller', 'online', 'cacat')),
  disetujui_oleh_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  disetujui_oleh_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (asal_lokasi = 'gudang' AND tujuan_lokasi IS NULL AND supplier IS NOT NULL AND length(trim(supplier)) > 0)
    OR
    (asal_lokasi <> 'gudang' AND tujuan_lokasi IS NOT NULL AND tujuan_lokasi <> asal_lokasi AND supplier IS NULL)
  )
);

ALTER TABLE public.retur_stok ADD COLUMN IF NOT EXISTS disetujui_oleh_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.retur_stok ADD COLUMN IF NOT EXISTS disetujui_oleh_name TEXT;

CREATE INDEX IF NOT EXISTS idx_retur_stok_created_at ON public.retur_stok(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retur_stok_asal_status ON public.retur_stok(asal_lokasi, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.process_retur_stok(
  p_retur_id UUID,
  p_processor_id UUID,
  p_processor_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.retur_stok%ROWTYPE;
  v_barang public.barang%ROWTYPE;
  v_updated_barang public.barang%ROWTYPE;
  v_updated_request public.retur_stok%ROWTYPE;
  v_mutasi public.mutasi_stok%ROWTYPE;
  v_stock_by_location JSONB;
  v_total_location_stock INTEGER;
  v_source_stock INTEGER;
  v_target_stock INTEGER := 0;
  v_stock_change INTEGER;
  v_primary_location TEXT;
  v_processor_id UUID := p_processor_id;
  v_processor_name TEXT := COALESCE(NULLIF(trim(p_processor_name), ''), 'Pengguna');
BEGIN
  SELECT * INTO v_request
  FROM public.retur_stok
  WHERE id = p_retur_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota retur tidak ditemukan.';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Nota retur % sudah diproses.', v_request.nomor_retur;
  END IF;

  SELECT * INTO v_barang
  FROM public.barang
  WHERE kodebarang = v_request.kodebarang
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang % tidak ditemukan.', v_request.kodebarang;
  END IF;

  IF v_processor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_processor_id) THEN
    v_processor_id := NULL;
  END IF;

  v_stock_by_location := COALESCE(v_barang.stok_lokasi, jsonb_build_object(
    'gudang', 0, 'toko', 0, 'reseller', 0, 'online', 0, 'cacat', 0
  ));
  v_total_location_stock := COALESCE((v_stock_by_location->>'gudang')::INTEGER, 0)
    + COALESCE((v_stock_by_location->>'toko')::INTEGER, 0)
    + COALESCE((v_stock_by_location->>'reseller')::INTEGER, 0)
    + COALESCE((v_stock_by_location->>'online')::INTEGER, 0)
    + COALESCE((v_stock_by_location->>'cacat')::INTEGER, 0);

  IF v_total_location_stock = 0 AND v_barang.stok > 0 THEN
    v_primary_location := CASE
      WHEN v_barang.lokasi IN ('gudang', 'toko', 'reseller', 'online', 'cacat') THEN v_barang.lokasi
      ELSE 'gudang'
    END;
    v_stock_by_location := jsonb_set(v_stock_by_location, ARRAY[v_primary_location], to_jsonb(v_barang.stok), true);
  END IF;

  v_source_stock := COALESCE((v_stock_by_location->>v_request.asal_lokasi)::INTEGER, 0);
  IF v_source_stock < v_request.jumlah THEN
    RAISE EXCEPTION 'Stok % tidak cukup untuk retur % (tersedia %, diminta %).',
      v_request.asal_lokasi, v_request.nomor_retur, v_source_stock, v_request.jumlah;
  END IF;

  v_stock_by_location := jsonb_set(
    v_stock_by_location,
    ARRAY[v_request.asal_lokasi],
    to_jsonb(v_source_stock - v_request.jumlah),
    true
  );
  IF v_request.tujuan_lokasi IS NOT NULL THEN
    v_target_stock := COALESCE((v_stock_by_location->>v_request.tujuan_lokasi)::INTEGER, 0);
    v_stock_by_location := jsonb_set(
      v_stock_by_location,
      ARRAY[v_request.tujuan_lokasi],
      to_jsonb(v_target_stock + v_request.jumlah),
      true
    );
  END IF;

  UPDATE public.barang
  SET stok_lokasi = v_stock_by_location,
      updated_at = now()
  WHERE kodebarang = v_request.kodebarang
  RETURNING * INTO v_updated_barang;

  UPDATE public.retur_stok
  SET status = 'disetujui',
      disetujui_oleh_id = v_processor_id,
      disetujui_oleh_name = v_processor_name,
      updated_at = now()
  WHERE id = p_retur_id
  RETURNING * INTO v_updated_request;

  v_stock_change := v_updated_barang.stok - v_barang.stok;
  INSERT INTO public.mutasi_stok (
    kodebarang, stok_sebelum, stok_sesudah, perubahan, user_id, user_name, tipe,
    lokasi_asal, lokasi_tujuan, jumlah_pergerakan, stok_lokasi_sebelum, stok_lokasi_sesudah,
    stok_tujuan_sebelum, stok_tujuan_sesudah, referensi_tipe, referensi_id, keterangan, created_at
  ) VALUES (
    v_request.kodebarang,
    v_barang.stok,
    v_updated_barang.stok,
    v_stock_change,
    v_processor_id,
    v_processor_name,
    'retur',
    v_request.asal_lokasi,
    v_request.tujuan_lokasi,
    v_request.jumlah,
    v_source_stock,
    v_source_stock - v_request.jumlah,
    CASE WHEN v_request.tujuan_lokasi IS NULL THEN NULL ELSE v_target_stock END,
    CASE WHEN v_request.tujuan_lokasi IS NULL THEN NULL ELSE v_target_stock + v_request.jumlah END,
    'retur',
    v_request.nomor_retur,
    CASE WHEN v_request.tujuan_lokasi IS NULL
      THEN format('[%s] Retur %s %s ke supplier %s.', v_request.nomor_retur, v_request.jumlah, v_request.satuan, v_request.supplier)
      ELSE format('[%s] Retur %s %s dari %s ke %s.', v_request.nomor_retur, v_request.jumlah, v_request.satuan, v_request.asal_lokasi, v_request.tujuan_lokasi)
    END,
    now()
  ) RETURNING * INTO v_mutasi;

  RETURN jsonb_build_object(
    'request', to_jsonb(v_updated_request),
    'barang', to_jsonb(v_updated_barang),
    'mutasi', to_jsonb(v_mutasi)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_retur_stok(UUID, UUID, TEXT) TO anon, authenticated;

ALTER TABLE public.retur_stok ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'retur_stok'
      AND policyname = 'LAN gateway retur_stok'
  ) THEN
    CREATE POLICY "LAN gateway retur_stok" ON public.retur_stok
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END;
$$;
NOTIFY pgrst, 'reload schema';
`;

export const SQL_RESET_ACTIVITY_SCRIPT = `-- ============================================================================
-- RESET OPERASIONAL: HAPUS RIWAYAT PERGERAKAN DAN MULAI SALDO DARI NOL
-- Mempertahankan public.users, public.barang, dan data supplier.
-- Jalankan hanya setelah memastikan database yang dipilih benar.
-- ============================================================================
BEGIN;

TRUNCATE TABLE
  public.barang_masuk_detail,
  public.barang_masuk,
  public.penjualan_history,
  public.opname_history,
  public.permintaan_mutasi,
  public.retur_stok,
  public.mutasi_stok
RESTART IDENTITY;

UPDATE public.barang
SET stok_lokasi = jsonb_build_object(
      'gudang', 0, 'toko', 0, 'reseller', 0, 'online', 0, 'cacat', 0
    ),
    stok = 0,
    updated_at = now();

COMMIT;
NOTIFY pgrst, 'reload schema';
`;

export const SQL_FINAL_SCRIPT = [
  SQL_SCHEMA_SCRIPT,
  SQL_FUNCTIONS_SCRIPT,
  SQL_RETUR_STOK_MIGRATION_SCRIPT,
  SQL_RLS_POLICIES_SCRIPT,
  SQL_OPTIMIZATION_INDEXES_SCRIPT,
].join('\n\n');
