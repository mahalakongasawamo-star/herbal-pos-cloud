// Store/receipt branding — the one-row public.settings table. Owner writes,
// every active staff member reads (needed at the till for receipt printing).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settings } from '@/lib/types';

interface SettingsRow {
  company_name: string;
  company_details: string;
  receipt_title: string;
  receipt_footer: string;
  logo: string;
  print_layout: string;
  options_reviewed: boolean;
  updated_at: string;
}

function toSettings(r: SettingsRow): Settings {
  return {
    companyName: r.company_name,
    companyDetails: r.company_details,
    receiptTitle: r.receipt_title,
    receiptFooter: r.receipt_footer,
    logo: r.logo,
    printLayout: r.print_layout === 'side' ? 'side' : 'stacked',
    optionsReviewed: r.options_reviewed,
    updatedAt: r.updated_at,
  };
}

export async function fetchSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', true).single();
  if (error) throw error;
  return toSettings(data as unknown as SettingsRow);
}

export interface SettingsPatch {
  companyName?: string;
  companyDetails?: string;
  receiptTitle?: string;
  receiptFooter?: string;
  logo?: string;
  printLayout?: 'stacked' | 'side';
  optionsReviewed?: boolean;
}

export async function updateSettings(supabase: SupabaseClient, patch: SettingsPatch): Promise<Settings> {
  const row: Record<string, unknown> = {};
  if (patch.companyName !== undefined) row.company_name = patch.companyName;
  if (patch.companyDetails !== undefined) row.company_details = patch.companyDetails;
  if (patch.receiptTitle !== undefined) row.receipt_title = patch.receiptTitle;
  if (patch.receiptFooter !== undefined) row.receipt_footer = patch.receiptFooter;
  if (patch.logo !== undefined) row.logo = patch.logo;
  if (patch.printLayout !== undefined) row.print_layout = patch.printLayout;
  if (patch.optionsReviewed !== undefined) row.options_reviewed = patch.optionsReviewed;

  const { data, error } = await supabase.from('settings').update(row).eq('id', true).select('*').single();
  if (error) throw error;
  return toSettings(data as unknown as SettingsRow);
}
