import { useState } from 'react';
import { GitCompare, Plus, X, Trophy, CheckCircle, XCircle } from 'lucide-react';
import type { Property } from '@/types';
import { formatCurrency } from '@/lib/finance';
import { Card, Button, Badge, EmptyState } from '@/components/ui';

export function Compare({
  properties,
  onSelectProperty,
}: {
  properties: Property[];
  onSelectProperty: (id: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const selected = properties.filter((p) => selectedIds.includes(p.id));
  const available = properties.filter((p) => !selectedIds.includes(p.id)).slice(0, 50);

  const toggleProperty = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 4)
    );
  };

  const bestPricePerSqft = selected.length > 0 ? Math.min(...selected.map((p) => p.square_feet > 0 ? p.price / p.square_feet : Infinity)) : 0;

  const rows: { label: string; getValue: (p: Property) => string; isBest?: (p: Property) => boolean }[] = [
    { label: 'Price', getValue: (p) => formatCurrency(p.price) },
    { label: 'Area (sqft)', getValue: (p) => p.square_feet.toLocaleString('en-IN') },
    { label: 'Price / sqft', getValue: (p) => `₹${(p.square_feet > 0 ? Math.round(p.price / p.square_feet) : 0).toLocaleString('en-IN')}`, isBest: (p) => p.square_feet > 0 && (p.price / p.square_feet) === bestPricePerSqft },
    { label: 'BHK', getValue: (p) => p.bedrooms > 0 ? `${p.bedrooms} BHK` : '-' },
    { label: 'RERA Approved', getValue: (p) => (p.rera_approved ? 'Yes' : 'No') },
    { label: 'Property Type', getValue: (p) => p.property_type },
    { label: 'Status', getValue: (p) => p.status },
    { label: 'Builder', getValue: (p) => p.state },
    { label: 'Society', getValue: (p) => p.society || '-' },
    { label: 'Locality', getValue: (p) => p.city },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compare Properties</h1>
          <p className="mt-1 text-sm text-slate-500">Side-by-side comparison of up to 4 properties</p>
        </div>
        {selected.length < 4 && properties.length > 0 && (
          <Button onClick={() => setShowPicker(!showPicker)}>
            <Plus className="h-4 w-4" /> Add to Compare
          </Button>
        )}
      </div>

      {showPicker && available.length > 0 && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Select properties to compare (showing top 50 by value)</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-80 overflow-y-auto">
            {available.map((p) => (
              <button
                key={p.id}
                onClick={() => { toggleProperty(p.id); if (selectedIds.length >= 3) setShowPicker(false); }}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{p.address}</p>
                  <p className="text-xs text-slate-500">{p.city} · {formatCurrency(p.price)}</p>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {selected.length === 0 ? (
        <EmptyState
          icon={<GitCompare className="h-6 w-6" />}
          title="No properties selected"
          description="Add properties to compare their price, area, BHK, locality, and property details."
          action={properties.length > 0 ? <Button onClick={() => setShowPicker(true)}><Plus className="h-4 w-4" /> Select Properties</Button> : undefined}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 bg-white px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Metric</th>
                {selected.map((p) => (
                  <th key={p.id} className="px-4 py-3 text-left min-w-[200px]">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => onSelectProperty(p.id)} className="text-left">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-900 hover:underline">{p.address}</p>
                        <p className="text-xs text-slate-500">{p.city}</p>
                        <Badge color={statusColor(p.status)}>{p.status}</Badge>
                      </button>
                      <button onClick={() => toggleProperty(p.id)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="sticky left-0 bg-inherit px-4 py-3 text-sm font-medium text-slate-600">{row.label}</td>
                  {selected.map((p) => {
                    const isBest = row.isBest?.(p);
                    return (
                      <td key={p.id} className="px-4 py-3 text-sm">
                        <span className={`font-semibold ${isBest ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {isBest && <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-500" />}
                          {row.getValue(p)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function statusColor(status: string): 'slate' | 'emerald' | 'blue' | 'amber' | 'rose' | 'violet' {
  const map: Record<string, 'slate' | 'emerald' | 'blue' | 'amber' | 'rose' | 'violet'> = {
    'Ready to move': 'emerald',
    'Under Construction': 'blue',
    'New': 'amber',
    'Resale': 'violet',
  };
  return map[status] ?? 'slate';
}
