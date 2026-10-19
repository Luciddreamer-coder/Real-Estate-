import { BarChart3, TrendingUp, MapPin, Building2, Bed, IndianRupee, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { Property } from '@/types';
import { formatCurrency } from '@/lib/finance';
import { Card, EmptyState, ProgressBar, Badge } from '@/components/ui';

interface LocalityAgg {
  locality: string;
  count: number;
  avgPrice: number;
  avgRatePerSqft: number;
  medianPrice: number;
  totalValue: number;
}

interface TypeAgg {
  type: string;
  count: number;
  avgPrice: number;
  avgRatePerSqft: number;
  avgArea: number;
}

interface BedroomAgg {
  bedrooms: number;
  count: number;
  avgPrice: number;
  avgArea: number;
  avgRatePerSqft: number;
}

interface StatusAgg {
  status: string;
  count: number;
  avgPrice: number;
}

export function Analytics({ properties }: { properties: Property[] }) {
  if (properties.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No data to analyze" description="Add properties to see analytics, charts, and performance insights." />
      </div>
    );
  }

  // ─── Aggregation: By Locality ─────────────────────────────────────────
  const localityMap = new Map<string, { prices: number[]; rates: number[]; totalValue: number }>();
  properties.forEach((p) => {
    const existing = localityMap.get(p.city) ?? { prices: [], rates: [], totalValue: 0 };
    existing.prices.push(p.price);
    existing.rates.push(p.rate_per_sqft);
    existing.totalValue += p.price;
    localityMap.set(p.city, existing);
  });

  const localityAggs: LocalityAgg[] = Array.from(localityMap.entries())
    .map(([locality, d]) => {
      const sortedPrices = [...d.prices].sort((a, b) => a - b);
      const avgPrice = d.prices.reduce((s, p) => s + p, 0) / d.prices.length;
      const avgRate = d.rates.reduce((s, r) => s + r, 0) / d.rates.length;
      return {
        locality,
        count: d.prices.length,
        avgPrice,
        avgRatePerSqft: avgRate,
        medianPrice: sortedPrices[Math.floor(sortedPrices.length / 2)],
        totalValue: d.totalValue,
      };
    })
    .sort((a, b) => b.count - a.count);

  const topLocalities = localityAggs.slice(0, 15);
  const mostExpensive = [...localityAggs].filter((l) => l.count >= 3).sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 10);
  const leastExpensive = [...localityAggs].filter((l) => l.count >= 3).sort((a, b) => a.avgPrice - b.avgPrice).slice(0, 10);
  const highestRatePerSqft = [...localityAggs].filter((l) => l.count >= 3).sort((a, b) => b.avgRatePerSqft - a.avgRatePerSqft).slice(0, 10);

  // ─── Aggregation: By Property Type ────────────────────────────────────
  const typeMap = new Map<string, { prices: number[]; rates: number[]; areas: number[] }>();
  properties.forEach((p) => {
    const existing = typeMap.get(p.property_type) ?? { prices: [], rates: [], areas: [] };
    existing.prices.push(p.price);
    existing.rates.push(p.rate_per_sqft);
    existing.areas.push(p.square_feet);
    typeMap.set(p.property_type, existing);
  });

  const typeAggs: TypeAgg[] = Array.from(typeMap.entries())
    .map(([type, d]) => ({
      type,
      count: d.prices.length,
      avgPrice: d.prices.reduce((s, p) => s + p, 0) / d.prices.length,
      avgRatePerSqft: d.rates.reduce((s, r) => s + r, 0) / d.rates.length,
      avgArea: d.areas.reduce((s, a) => s + a, 0) / d.areas.length,
    }))
    .sort((a, b) => b.count - a.count);

  // ─── Aggregation: By Bedroom Count ────────────────────────────────────
  const bedroomMap = new Map<number, { prices: number[]; areas: number[]; rates: number[] }>();
  properties.forEach((p) => {
    if (p.bedrooms <= 0) return;
    const existing = bedroomMap.get(p.bedrooms) ?? { prices: [], areas: [], rates: [] };
    existing.prices.push(p.price);
    existing.areas.push(p.square_feet);
    existing.rates.push(p.rate_per_sqft);
    bedroomMap.set(p.bedrooms, existing);
  });

  const bedroomAggs: BedroomAgg[] = Array.from(bedroomMap.entries())
    .map(([bedrooms, d]) => ({
      bedrooms,
      count: d.prices.length,
      avgPrice: d.prices.reduce((s, p) => s + p, 0) / d.prices.length,
      avgArea: d.areas.reduce((s, a) => s + a, 0) / d.areas.length,
      avgRatePerSqft: d.rates.reduce((s, r) => s + r, 0) / d.rates.length,
    }))
    .sort((a, b) => a.bedrooms - b.bedrooms);

  // ─── Aggregation: By Status ───────────────────────────────────────────
  const statusMap = new Map<string, { prices: number[]; count: number }>();
  properties.forEach((p) => {
    const existing = statusMap.get(p.status) ?? { prices: [], count: 0 };
    existing.prices.push(p.price);
    existing.count++;
    statusMap.set(p.status, existing);
  });

  const statusAggs: StatusAgg[] = Array.from(statusMap.entries())
    .map(([status, d]) => ({
      status,
      count: d.count,
      avgPrice: d.prices.reduce((s, p) => s + p, 0) / d.prices.length,
    }))
    .sort((a, b) => b.count - a.count);

  // ─── Dataset-backed summary metrics ──────────────────────────────────
  const avgRatePerSqft = properties.reduce((s, p) => s + p.rate_per_sqft, 0) / properties.length;
  const avgPrice = properties.reduce((s, p) => s + p.price, 0) / properties.length;
  const avgArea = properties.reduce((s, p) => s + p.square_feet, 0) / properties.length;

  // ─── Price distribution ───────────────────────────────────────────────
  const priceBuckets = [
    { label: 'Under ₹50L', min: 0, max: 5000000 },
    { label: '₹50L - ₹1Cr', min: 5000000, max: 10000000 },
    { label: '₹1Cr - ₹2Cr', min: 10000000, max: 20000000 },
    { label: '₹2Cr - ₹5Cr', min: 20000000, max: 50000000 },
    { label: '₹5Cr - ₹10Cr', min: 50000000, max: 100000000 },
    { label: 'Above ₹10Cr', min: 100000000, max: Infinity },
  ];
  const bucketData = priceBuckets.map((b) => ({
    label: b.label,
    count: properties.filter((p) => p.price >= b.min && p.price < b.max).length,
  }));
  const maxBucket = Math.max(...bucketData.map((b) => b.count), 1);

  // ─── Helpers ──────────────────────────────────────────────────────────
  const maxLocalityCount = Math.max(...topLocalities.map((l) => l.count), 1);
  const maxAvgPrice = Math.max(...mostExpensive.map((l) => l.avgPrice), 1);
  const maxRatePerSqft = Math.max(...highestRatePerSqft.map((l) => l.avgRatePerSqft), 1);
  const maxBedroomPrice = Math.max(...bedroomAggs.map((b) => b.avgPrice), 1);
  const maxTypeCount = Math.max(...typeAggs.map((t) => t.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Gurugram Market Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">Aggregated market insights across {properties.length.toLocaleString('en-IN')} properties</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Total Properties</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{properties.length.toLocaleString('en-IN')}</p>
          <p className="mt-1 text-xs text-slate-400">All listings</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Average Price</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(avgPrice)}</p>
          <p className="mt-1 text-xs text-slate-400">Across all listings</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Avg Rate / sqft</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">₹{Math.round(avgRatePerSqft).toLocaleString('en-IN')}</p>
          <p className="mt-1 text-xs text-slate-400">Price per square foot</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Average Area</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{Math.round(avgArea).toLocaleString('en-IN')} sqft</p>
          <p className="mt-1 text-xs text-slate-400">Across all listings</p>
        </Card>
      </div>

      {/* Price Distribution */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900">Price Distribution</h3>
        <div className="mt-4 space-y-2">
          {bucketData.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-28 text-sm text-slate-600">{b.label}</span>
              <div className="flex-1">
                <ProgressBar value={b.count} max={maxBucket} color="blue" />
              </div>
              <span className="w-12 text-right text-sm font-semibold text-slate-900">{b.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Average Price by Locality (Top 15 by count) */}
      <Card className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MapPin className="h-4 w-4 text-slate-400" /> Average Price by Locality (Top 15 by count)
        </h3>
        <div className="mt-4 space-y-2">
          {topLocalities.map((l) => (
            <div key={l.locality} className="flex items-center gap-3">
              <span className="w-32 truncate text-sm font-medium text-slate-700">{l.locality}</span>
              <div className="flex-1">
                <ProgressBar value={l.avgPrice} max={maxAvgPrice} color="blue" />
              </div>
              <span className="w-24 text-right text-sm font-semibold text-slate-900">{formatCurrency(l.avgPrice)}</span>
              <span className="w-16 text-right text-xs text-slate-400">({l.count})</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Most / Least Expensive Areas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <ArrowUpRight className="h-4 w-4" /> Most Expensive Areas (avg price)
          </h3>
          <div className="mt-4 space-y-2">
            {mostExpensive.map((l, i) => (
              <div key={l.locality} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{i + 1}</span>
                <span className="flex-1 truncate text-sm font-medium text-slate-700">{l.locality}</span>
                <span className="text-sm font-semibold text-slate-900">{formatCurrency(l.avgPrice)}</span>
                <span className="text-xs text-slate-400">({l.count})</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <ArrowDownRight className="h-4 w-4" /> Least Expensive Areas (avg price)
          </h3>
          <div className="mt-4 space-y-2">
            {leastExpensive.map((l, i) => (
              <div key={l.locality} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{i + 1}</span>
                <span className="flex-1 truncate text-sm font-medium text-slate-700">{l.locality}</span>
                <span className="text-sm font-semibold text-slate-900">{formatCurrency(l.avgPrice)}</span>
                <span className="text-xs text-slate-400">({l.count})</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Price per sqft by Locality */}
      <Card className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <IndianRupee className="h-4 w-4 text-slate-400" /> Highest Price per sqft (Top 10)
        </h3>
        <div className="mt-4 space-y-2">
          {highestRatePerSqft.map((l, i) => (
            <div key={l.locality} className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
              <span className="w-32 truncate text-sm font-medium text-slate-700">{l.locality}</span>
              <div className="flex-1">
                <ProgressBar value={l.avgRatePerSqft} max={maxRatePerSqft} color="amber" />
              </div>
              <span className="w-28 text-right text-sm font-semibold text-slate-900">₹{Math.round(l.avgRatePerSqft).toLocaleString('en-IN')}/sqft</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Bedroom-wise Price Analysis */}
      <Card className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Bed className="h-4 w-4 text-slate-400" /> Bedroom-wise Price Analysis
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">BHK</th>
                <th className="px-3 py-2 text-right">Count</th>
                <th className="px-3 py-2 text-right">Avg Price</th>
                <th className="px-3 py-2 text-right">Avg Area</th>
                <th className="px-3 py-2 text-right">Avg Rate/sqft</th>
                <th className="px-3 py-2 text-left" style={{ width: '150px' }}>Avg Price</th>
              </tr>
            </thead>
            <tbody>
              {bedroomAggs.map((b) => (
                <tr key={b.bedrooms} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-3 text-sm font-medium text-slate-900">{b.bedrooms} BHK</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{b.count.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(b.avgPrice)}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{Math.round(b.avgArea).toLocaleString('en-IN')} sqft</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">₹{Math.round(b.avgRatePerSqft).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3">
                    <ProgressBar value={b.avgPrice} max={maxBedroomPrice} color="blue" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* By Property Type */}
      <Card className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Building2 className="h-4 w-4 text-slate-400" /> Average Price by Property Type
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Count</th>
                <th className="px-3 py-2 text-right">Avg Price</th>
                <th className="px-3 py-2 text-right">Avg Area</th>
                <th className="px-3 py-2 text-right">Avg Rate/sqft</th>
                <th className="px-3 py-2 text-left" style={{ width: '120px' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {typeAggs.map((t) => (
                <tr key={t.type} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-3 text-sm font-medium text-slate-900">{t.type}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{t.count.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(t.avgPrice)}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{Math.round(t.avgArea).toLocaleString('en-IN')} sqft</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">₹{Math.round(t.avgRatePerSqft).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3">
                    <ProgressBar value={t.count} max={maxTypeCount} color="blue" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Status Breakdown */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900">Status Breakdown</h3>
        <div className="mt-4 space-y-2">
          {statusAggs.map((s) => (
            <div key={s.status} className="flex items-center gap-3">
              <span className="w-40">
                <Badge color={statusColor(s.status)}>{s.status}</Badge>
              </span>
              <div className="flex-1">
                <ProgressBar value={s.count} max={Math.max(...statusAggs.map((x) => x.count), 1)} color="blue" />
              </div>
              <span className="w-20 text-right text-sm font-semibold text-slate-900">{s.count.toLocaleString('en-IN')}</span>
              <span className="w-24 text-right text-xs text-slate-400">avg {formatCurrency(s.avgPrice)}</span>
            </div>
          ))}
        </div>
      </Card>

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
