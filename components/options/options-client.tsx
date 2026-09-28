'use client';

// Assembles the Options screen (SPEC §1 Phase 1, owner-only per SPEC §2).
// Ported from legacy-vite-app/src/modules/Options.jsx's layout (SPEC §10):
// the same two-column grid, minus the "Cashiers" and "Data and backup"
// panels — see StaffPanel's header comment and this project's task notes
// for why those two don't carry over into a shared cloud backend.
import { PageHeader } from '@/components/ui';
import { StoreSettings } from './store-settings';
import { StaffPanel } from './staff-panel';
import { PaymentMethods } from './payment-methods';
import { MemberTiers } from './member-tiers';

export function OptionsClient() {
  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <PageHeader
        title="Options"
        description="Store details, staff, payment methods and member tiers. Changes save automatically."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <StoreSettings />
        <div className="grid content-start gap-4">
          <StaffPanel />
          <PaymentMethods />
        </div>
        <MemberTiers className="xl:col-span-2" />
      </div>
    </div>
  );
}
