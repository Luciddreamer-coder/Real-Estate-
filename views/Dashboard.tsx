import { useState, useMemo } from 'react';
import { Building2, MapPin, Maximize, Bed, Brain, IndianRupee, TrendingUp, Database, Loader2, ArrowRight, ArrowUpRight, ArrowDownRight, Filter, X } from 'lucide-react';
import type { Property, ViewName } from '@/types';
import { formatCurrency } from '@/lib/finance';
import { Card, StatCard, Button, Badge, ProgressBar } from '@/components/ui';
import { ScatterPlot } from '@/components/ScatterPlot';

interface DashboardFilters {
  locality: string;
  bhk: string;
  propertyType: string;
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
}

const EMPTY_FILTERS: DashboardFilters = {
  locality: '', bhk: '', propertyType: '', minPrice: '', maxPrice: '', minArea: '', maxArea: '',
};

export function Dashboard({
  properties,
  onNavigate,
  onAdd,
  onSelectProperty,
  loading,
}: {
  properties: Property[];
  onNavigate: (v: ViewName) => void;
  onAdd: () => void;
  onSelectProperty: (id: string) => void;
  loading?: boolean;
}) {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // ─── Extract filter options ───────────────────────────────────────────
  const localities = useMemo(() => [...new Set(properties.map((p) => p.city))].sort(), [properties]);
  const bhkOptions = useMemo(() => [...new Set(properties.map((p) => p.bedrooms).filter((b) => b > 0))].sort((a, b) => a - b), [properties]);
  const typeOptions = useMemo(() => [...new Set(properties.map((p) => p.property_type))].sort(), [properties]);

  // ─── Apply filters ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (filters.locality && p.city !== filters.locality) return false;
      if (filters.bhk && p.bedrooms !== Number(filters.bhk)) return false;
      if (filters.propertyType && p.property_type !== filters.propertyType) return false;
      if (filters.minPrice && p.price < Number(filters.minPrice)) return false;
      if (filters.maxPrice && p.price > Number(filters.maxPrice)) return false;
      if (filters.minArea && p.square_feet < Number(filters.minArea)) return false;
      if (filters.maxArea && p.square_feet > Number(filters.maxArea)) return false;
      return true;
    });
  }, [properties, filters]);

  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length;

  if (loading || properties.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-3 text-sm text-slate-500">Loading properties...</span>
      </div>
    );
  }

  // ─── KPI Calculations ─────────────────────────────────────────────────
  const totalProps = filtered.length;
  const avgPrice = totalProps > 0 ? filtered.reduce((s, p) => s + p.price, 0) / totalProps : 0;
  const avgArea = totalProps > 0 ? filtered.reduce((s, p) => s + p.square_feet, 0) / totalProps : 0;
  const avgRatePerSqft = totalProps > 0 ? filtered.reduce((s, p) => s + p.rate_per_sqft, 0) / totalProps : 0;

  // ─── Locality analysis ────────────────────────────────────────────────
  const localityMap = new Map<string, { count: number; totalPrice: number; totalRate: number }>();
  filtered.forEach((p) => {
    const e = localityMap.get(p.city) ?? { count: 0, totalPrice: 0, totalRate: 0 };
    e.count++;
    e.totalPrice += p.price;
    e.totalRate += p.rate_per_sqft;
    localityMap.set(p.city, e);
  });
  const localityAgg = Array.from(localityMap.entries()).map(([city, d]) => ({
    city, count: d.count,
    avgPrice: d.totalPrice / d.count,
    avgRate: d.totalRate / d.count,
  }));

  const mostExpensive = [...localityAgg].filter((l) => l.count >= 3).sort((a, b) => b.avgPrice - a.avgPrice)[0];
  const mostAffordable = [...localityAgg].filter((l) => l.count >= 3).sort((a, b) => a.avgPrice - b.avgPrice)[0];
  const topLocalitiesByCount = [...localityAgg].sort((a, b) => b.count - a.count).slice(0, 10);
  const topLocalitiesByPrice = [...localityAgg].sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 10);
  const maxLocalityPrice = Math.max(...topLocalitiesByPrice.map((l) => l.avgPrice), 1);
  const maxLocalityCount = Math.max(...topLocalitiesByCount.map((l) => l.count), 1);

  // ─── Property Type distribution ───────────────────────────────────────
  const typeMap = new Map<string, number>();
  filtered.forEach((p) => typeMap.set(p.property_type, (typeMap.get(p.property_type) ?? 0) + 1));
  const typeData = Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1]);
  const maxTypeCount = Math.max(...typeData.map((t) => t[1]), 1);

  // ─── BHK distribution ─────────────────────────────────────────────────
  const bhkMap = new Map<number, { count: number; totalPrice: number }>();
  filtered.forEach((p) => {
    if (p.bedrooms <= 0) return;
    const e = bhkMap.get(p.bedrooms) ?? { count: 0, totalPrice: 0 };
    e.count++;
    e.totalPrice += p.price;
    bhkMap.set(p.bedrooms, e);
  });
  const bhkData = Array.from(bhkMap.entries())
    .map(([bhk, d]) => ({ bhk, count: d.count, avgPrice: d.totalPrice / d.count }))
    .sort((a, b) => a.bhk - b.bhk);
  const maxBhkCount = Math.max(...bhkData.map((b) => b.count), 1);

  // ─── Price Distribution ───────────────────────────────────────────────
  const priceBuckets = [
    { label: 'Under ₹20L', min: 0, max: 2000000 },
    { label: '₹20L - ₹50L', min: 2000000, max: 5000000 },
    { label: '₹50L - ₹1Cr', min: 5000000, max: 10000000 },
    { label: '₹1Cr - ₹2Cr', min: 10000000, max: 20000000 },
    { label: '₹2Cr - ₹5Cr', min: 20000000, max: 50000000 },
    { label: '₹5Cr+', min: 50000000, max: Infinity },
  ];
  const bucketData = priceBuckets.map((b) => ({
    label: b.label,
    count: filtered.filter((p) => p.price >= b.min && p.price < b.max).length,
  }));
  const maxBucket = Math.max(...bucketData.map((b) => b.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gurugram Real Estate Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Analytics & Price Prediction System</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" /> Filters {activeFilterCount > 0 && <Badge color="slate">{activeFilterCount}</Badge>}
          </Button>
          <Button onClick={onAdd}>
            <Building2 className="h-4 w-4" /> Add Property
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Dashboard Filters</h3>
            {activeFilterCount > 0 && (
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Location / Sector</label>
              <select value={filters.locality} onChange={(e) => setFilters((f) => ({ ...f, locality: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900">
                <option value="">All Locations</option>
                {localities.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">BHK</label>
              <select value={filters.bhk} onChange={(e) => setFilters((f) => ({ ...f, bhk: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900">
                <option value="">All BHK</option>
                {bhkOptions.map((b) => <option key={b} value={b}>{b} BHK</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Property Type</label>
              <select value={filters.propertyType} onChange={(e) => setFilters((f) => ({ ...f, propertyType: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900">
                <option value="">All Types</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Min Price (₹)</label>
                <input type="number" placeholder="0" value={filters.minPrice} onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max Price (₹)</label>
                <input type="number" placeholder="∞" value={filters.maxPrice} onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-slate-900" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Min Area (sqft)</label>
                <input type="number" placeholder="0" value={filters.minArea} onChange={(e) => setFilters((f) => ({ ...f, minArea: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max Area (sqft)</label>
                <input type="number" placeholder="∞" value={filters.maxArea} onChange={(e) => setFilters((f) => ({ ...f, maxArea: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-slate-900" />
              </div>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <p className="mt-3 text-xs text-slate-500">Showing {totalProps.toLocaleString('en-IN')} of {properties.length.toLocaleString('en-IN')} properties</p>
          )}
        </Card>
      )}

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Properties" value={totalProps.toLocaleString('en-IN')} sublabel="Gurugram" icon={<Building2 className="h-5 w-5" />} accent="slate" />
        <StatCard label="Average Price" value={formatCurrency(avgPrice)} sublabel="All properties" icon={<IndianRupee className="h-5 w-5" />} accent="blue" />
        <StatCard label="Avg Price/sqft" value={`₹${Math.round(avgRatePerSqft).toLocaleString('en-IN')}`} sublabel="Overall average" icon={<TrendingUp className="h-5 w-5" />} accent="amber" />
        <StatCard label="Average Area" value={`${Math.round(avgArea).toLocaleString('en-IN')} sqft`} sublabel="All properties" icon={<Maximize className="h-5 w-5" />} accent="emerald" />
        <StatCard label="Locations" value={localityAgg.length.toLocaleString('en-IN')} sublabel="Sectors / areas" icon={<MapPin className="h-5 w-5" />} accent="blue" />
        <StatCard
          label="Most Expensive"
          value={mostExpensive ? formatCurrency(mostExpensive.avgPrice) : '-'}
          sublabel={mostExpensive?.city ?? ''}
          icon={<ArrowUpRight className="h-5 w-5" />}
          accent="rose"
        />
      </div>

      {/* Most Expensive + Most Affordable */}
      {mostExpensive && mostAffordable && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white"><ArrowUpRight className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-medium text-rose-600">Most Expensive Location</p>
                <p className="text-sm font-bold text-rose-900">{mostExpensive.city}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-rose-900">{formatCurrency(mostExpensive.avgPrice)}</p>
              <p className="text-xs text-rose-500">{mostExpensive.count} properties</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><ArrowDownRight className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-medium text-emerald-600">Most Affordable Location</p>
                <p className="text-sm font-bold text-emerald-900">{mostAffordable.city}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-900">{formatCurrency(mostAffordable.avgPrice)}</p>
              <p className="text-xs text-emerald-500">{mostAffordable.count} properties</p>
            </div>
          </div>
        </div>
      )}

      {/* Price Prediction CTA */}
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-5 text-white">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10"><Brain className="h-6 w-6" /></div>
          <div>
            <p className="text-sm font-semibold">ML-Powered Price Prediction</p>
            <p className="text-xs text-slate-300">Random Forest, Gradient Boosting, Decision Tree & Linear Regression</p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => onNavigate('prediction')}>
          <Brain className="h-4 w-4" /> Predict Price
        </Button>
      </div>

      {/* Area vs Price Scatter Plot + Property Type Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Area vs Price</h3>
          <p className="mt-1 text-xs text-slate-400">Each dot is a property, colored by type. Click to view details.</p>
          <ScatterPlot properties={filtered} onSelect={onSelectProperty} />
        </Card>

        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Building2 className="h-4 w-4 text-slate-400" /> Property Type Distribution
          </h3>
          <div className="mt-4 space-y-3">
            {typeData.map(([type, count]) => (
              <div key={type}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{type}</span>
                  <span className="font-semibold text-slate-900">{count.toLocaleString('en-IN')}</span>
                </div>
                <div className="mt-1"><ProgressBar value={count} max={maxTypeCount} color="blue" /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* BHK Distribution + Price Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bed className="h-4 w-4 text-slate-400" /> BHK Distribution
          </h3>
          <div className="mt-4 space-y-3">
            {bhkData.map((b) => (
              <div key={b.bhk}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{b.bhk} BHK</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{formatCurrency(b.avgPrice)}</span>
                    <span className="font-semibold text-slate-900">{b.count.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div className="mt-1"><ProgressBar value={b.count} max={maxBhkCount} color="emerald" /></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900">Price Distribution</h3>
          <p className="mt-1 text-xs text-slate-400">Number of properties in each price range</p>
          <div className="mt-6 flex items-end justify-between gap-2" style={{ height: '200px' }}>
            {bucketData.map((b) => {
              const heightPct = (b.count / maxBucket) * 100;
              return (
                <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{b.count.toLocaleString('en-IN')}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-700" style={{ height: `${heightPct}%` }} />
                  </div>
                  <span className="text-center text-xs text-slate-500">{b.label}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Location-wise Average Price + Property Count */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <IndianRupee className="h-4 w-4 text-slate-400" /> Average Price by Location (Top 10)
          </h3>
          <div className="mt-4 space-y-2">
            {topLocalitiesByPrice.map((l) => (
              <div key={l.city} className="flex items-center gap-3">
                <span className="w-28 truncate text-sm font-medium text-slate-700">{l.city}</span>
                <div className="flex-1"><ProgressBar value={l.avgPrice} max={maxLocalityPrice} color="amber" /></div>
                <span className="w-24 text-right text-sm font-semibold text-slate-900">{formatCurrency(l.avgPrice)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="h-4 w-4 text-slate-400" /> Property Count by Location (Top 10)
          </h3>
          <div className="mt-4 space-y-2">
            {topLocalitiesByCount.map((l) => (
              <div key={l.city} className="flex items-center gap-3">
                <span className="w-28 truncate text-sm font-medium text-slate-700">{l.city}</span>
                <div className="flex-1"><ProgressBar value={l.count} max={maxLocalityCount} color="blue" /></div>
                <span className="w-16 text-right text-sm font-semibold text-slate-900">{l.count.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Location-wise table */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="h-4 w-4 text-slate-400" /> Location Analysis
          </h3>
          <button onClick={() => onNavigate('analytics')} className="text-sm font-medium text-slate-500 hover:text-slate-900">Full analytics →</button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Locality</th>
                <th className="px-3 py-2 text-right">Properties</th>
                <th className="px-3 py-2 text-right">Avg Price</th>
                <th className="px-3 py-2 text-right">Avg Rate/sqft</th>
              </tr>
            </thead>
            <tbody>
              {topLocalitiesByCount.map((l) => (
                <tr key={l.city} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer" onClick={() => setFilters((f) => ({ ...f, locality: l.city }))}>
                  <td className="px-3 py-3 text-sm font-medium text-slate-900">{l.city}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{l.count.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(l.avgPrice)}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">₹{Math.round(l.avgRate).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Database Insights CTA */}
      <div className="flex cursor-pointer items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-5 transition-all hover:bg-emerald-100" onClick={() => onNavigate('insights')}>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white"><Database className="h-6 w-6" /></div>
          <div>
            <p className="text-sm font-semibold text-emerald-900">Database Insights</p>
            <p className="text-xs text-emerald-700">Aggregation pipelines, index performance, and database statistics</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-emerald-600" />
      </div>
    </div>
  );
}


