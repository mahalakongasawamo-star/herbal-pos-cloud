import type { SupabaseClient } from '@supabase/supabase-js';
import { toBranch } from '@/lib/mappers';
import type { Branch } from '@/lib/types';

export async function fetchBranches(supabase: SupabaseClient): Promise<Branch[]> {
  const { data, error } = await supabase.from('branches').select('*').order('code');
  if (error) throw error;
  return data.map(toBranch);
}
