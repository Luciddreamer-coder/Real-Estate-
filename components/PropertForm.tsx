import { useState } from 'react';
import type { Property, PropertyType, PropertyStatus } from '@/types';
import { Modal, Input, Select, Button } from './ui';
import { formatCurrency } from '@/lib/finance';

const PROPERTY_TYPES: PropertyType[] = ['Apartment', 'Floor', 'Plot', 'Villa', 'House', 'Penthouse', 'Studio'];
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
    rate_per_sqft: 5000, rera_approved: false, society: '',
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
  onSave: (p: Property) => Promise<void> | void;
  initial: Property;
}) {
  const [form, setForm] = useState<Property>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field: keyof Property, value: string | number | boolean) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'square_feet' || field === 'rate_per_sqft') {
        const area = field === 'square_feet' ? Number(value) : f.square_feet;
        const rate = field === 'rate_per_sqft' ? Number(value) : f.rate_per_sqft;
        if (area > 0 && rate > 0) next.price = area * rate;
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.address.trim() || !form.city.trim()) {
      setError('Property name/description and locality are required.');
      return;
    }
    if (!Number.isFinite(form.square_feet) || form.square_feet <= 0 || !Number.isFinite(form.rate_per_sqft) || form.rate_per_sqft <= 0) {
      setError('Area and rate per sqft must be greater than zero.');
      return;
    }

    const pricingChanged = form.square_feet !== initial.square_feet || form.rate_per_sqft !== initial.rate_per_sqft;
    const propertyToSave = pricingChanged
      ? { ...form, price: form.square_feet * form.rate_per_sqft }
      : form;

    setSaving(true);
    try {
      await onSave(propertyToSave);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save property.');
    } finally {
      setSaving(false);
    }
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-500">Total Price (calculated)</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(form.price)}</p>
              <p className="mt-1 text-xs text-slate-400">Area × Rate per sqft</p>
            </div>
          </div>
        </section>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save Property'}</Button>
        </div>
      </div>
    </Modal>
  );
}
