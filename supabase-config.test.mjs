import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseRuntimeConfig } from './supabase-config.js';

test('missing env values should not create a default cloud config', () => {
  const config = getSupabaseRuntimeConfig({
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
  });

  assert.equal(config.url, '');
  assert.equal(config.anonKey, '');
  assert.equal(config.isConfigured, false);
});
