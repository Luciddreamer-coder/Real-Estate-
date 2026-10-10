import { useState } from 'react';
import type { Property, PropertyType, PropertyStatus } from '@/types';
import { Modal, Input, Select, Textarea, Button } from './ui';

const PROPERTY_TYPES: PropertyType[] = ['Apartment', 'Floor', 'Plot', 'Villa', 'House', 'Studio'];
const PROPERTY_STATUSES: PropertyStatus[] = ['Ready to move', 'Under Construction', 'New', 'Resale'];

export function createEmptyProperty(): Property {
  return {
    id: crypto.randomUUID(),
    address: '', city: 'Gurugram', state: '', zip: '',
    property_type: 'Apartment', status: 'New',
    price: 5000000, bedrooms: 2, bathrooms: 2,
    square_feet: 1000, lot_size: 0, year_built: 2020,
    monthly_rent: 15000, property_tax_annual: 50000,
    insurance_annual: 25000, hoa_monthly: 2000, vacancy_rate: 5,
    maintenance_rate: 5, management_rate: 8,
    down_payment_pct: 20, interest_rate: 8.5, loan_term_years: 20,
    closing_costs: 100000, rehab_cost: 0, notes: '',
    created_at: new Date().toISOString(),
    rate_per_sqft: 0, rera_approved: false, society: '',
  };
}

export function PropertyForm({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: Property) => void;
  initial: Property;
}) {
  const [form, setForm] = useState<Property>(initial);

  const update = (field: keyof Property, value: string | number | boolean) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = () => {
    if (!form.address.trim() || !form.city.trim()) return;
    onSave(form);
  };

  return (
    <Modal open={open} onClose={onClose} title="Property Details" maxWidth="max-w-3xl">
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Property Info</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Property Name / Description" value={form.address} onChange={(v) => update('address', v)} placeholder="3 BHK Apartment in DLF Park Place" />
            </div>
            <Input label="Locality / Sector" value={form.city} onChange={(v) => update('city', v)} placeholder="Sector 54" />
            <Input label="Builder Name" value={form.state} onChange={(v) => update('state', v)} placeholder="DLF" />
            <Input label="Society / Project" value={form.society} onChange={(v) => update('society', v)} placeholder="DLF Park Place" />
            <Input label="Company / Seller" value={form.zip} onChange={(v) => update('zip', v)} placeholder="" />
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Classification</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select label="Type" value={form.property_type} onChange={(v) => update('property_type', v)} options={PROPERTY_TYPES.map((t) => ({ value: t, label: t }))} />
            <Select label="Status" value={form.status} onChange={(v) => update('status', v)} options={PROPERTY_STATUSES.map((s) => ({ value: s, label: s }))} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">RERA Approved</label>
              <select
                value={form.rera_approved ? 'yes' : 'no'}
                onChange={(e) => update('rera_approved', e.target.value === 'yes')}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <Input label="BHK Count" type="number" value={form.bedrooms} onChange={(v) => update('bedrooms', Number(v))} />
            <Input label="Area (sqft)" type="number" value={form.square_feet} onChange={(v) => update('square_feet', Number(v))} />
            <Input label="Rate / sqft" type="number" prefix="₹" value={form.rate_per_sqft} onChange={(v) => update('rate_per_sqft', Number(v))} />
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Purchase & Rental</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Purchase Price" type="number" prefix="₹" value={form.price} onChange={(v) => update('price', Number(v))} />
            <Input label="Monthly Rent" type="number" prefix="₹" value={form.monthly_rent} onChange={(v) => update('monthly_rent', Number(v))} />
            <Input label="Closing Costs" type="number" prefix="₹" value={form.closing_costs} onChange={(v) => update('closing_costs', Number(v))} />
            <Input label="Rehab / Repairs" type="number" prefix="₹" value={form.rehab_cost} onChange={(v) => update('rehab_cost', Number(v))} />
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Operating Expenses</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Property Tax (annual)" type="number" prefix="₹" value={form.property_tax_annual} onChange={(v) => update('property_tax_annual', Number(v))} />
            <Input label="Insurance (annual)" type="number" prefix="₹" value={form.insurance_annual} onChange={(v) => update('insurance_annual', Number(v))} />
            <Input label="Maintenance (monthly)" type="number" prefix="₹" value={form.hoa_monthly} onChange={(v) => update('hoa_monthly', Number(v))} />
            <Input label="Vacancy Rate" type="number" suffix="%" value={form.vacancy_rate} onChange={(v) => update('vacancy_rate', Number(v))} />
            <Input label="Maintenance Rate" type="number" suffix="%" value={form.maintenance_rate} onChange={(v) => update('maintenance_rate', Number(v))} />
            <Input label="Management Rate" type="number" suffix="%" value={form.management_rate} onChange={(v) => update('management_rate', Number(v))} />
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Financing</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Down Payment" type="number" suffix="%" value={form.down_payment_pct} onChange={(v) => update('down_payment_pct', Number(v))} />
            <Input label="Interest Rate" type="number" suffix="%" value={form.interest_rate} onChange={(v) => update('interest_rate', Number(v))} />
            <Input label="Loan Term" type="number" suffix="yrs" value={form.loan_term_years} onChange={(v) => update('loan_term_years', Number(v))} />
          </div>
        </section>

        <Textarea label="Notes" value={form.notes} onChange={(v) => update('notes', v)} rows={3} />

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit}>Save Property</Button>
        </div>
      </div>
    </Modal>
  );
}
