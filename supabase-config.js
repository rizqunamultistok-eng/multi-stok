export function normalizeSupabaseUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

export function normalizeSupabaseKey(value) {
  return String(value ?? '').trim();
}

export function getSupabaseRuntimeConfig(env = process.env) {
  const url = normalizeSupabaseUrl(env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '');
  const anonKey = normalizeSupabaseKey(env.VITE_SUPABASE_ANON_KEY ?? '');
  const serviceRoleKey = normalizeSupabaseKey(env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  const isConfigured = Boolean(url && url.startsWith('https://') && anonKey && anonKey.length > 20);

  return {
    url,
    anonKey,
    serviceRoleKey,
    isConfigured,
  };
}