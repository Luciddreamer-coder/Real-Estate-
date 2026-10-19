import { useState, useMemo, useEffect } from 'react';
import { Building2, MapPin, Maximize, Bed, IndianRupee, TrendingUp, Database, Loader2, ArrowUpRight, ArrowDownRight, Filter, X } from 'lucide-react';
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

interface DashboardAggregation {
  overall: { count: number; average_price: number; min_price: number; max_price: number }[];
  by_locality: { _id: string; count: number; average_price: number | null; median_price: number | null }[];
  by_locality_count: { _id: string; count: number; average_price: number; average_rate?: number }[];
  locality_min_sample_size?: number;
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
  refreshKey,
}: {
  properties: Property[];
  onNavigate: (v: ViewName) => void;
  onAdd: () => void;
  onSelectProperty: (id: string) => void;
  loading?: boolean;
  refreshKey: number;
}) {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardAggregation | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  const loadDashboardData = () => {
    setDashboardLoading(true);
    setDashboardError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    fetch(`${(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000').replace(/\/$/, '')}/api/dashboard`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error ?? 'Dashboard aggregation failed'))))
      .then((data: DashboardAggregation) => setDashboardData(data))
      .catch((error) => {
        setDashboardError(error instanceof DOMException && error.name === 'AbortError'
          ? 'The dashboard request timed out. Check Flask and MongoDB Atlas.'
          : error instanceof Error ? error.message : 'Dashboard aggregation failed');
      })
      .finally(() => {
        window.clearTimeout(timeout);
        setDashboardLoading(false);
      });
  };

  useEffect(() => { loadDashboardData(); }, [refreshKey]);

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

  if (loading || dashboardLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-3 text-sm text-slate-500">{dashboardLoading && !loading ? 'Loading MongoDB dashboard aggregations...' : 'Loading properties...'}</span>
      </div>
    );
  }

  if (dashboardError || !dashboardData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Database className="h-10 w-10 text-rose-300" />
        <p className="mt-3 text-sm font-medium text-slate-900">Dashboard aggregation unavailable</p>
        <p className="mt-1 max-w-md text-xs text-slate-500">{dashboardError || 'The MongoDB dashboard response was empty.'}</p>
        <Button className="mt-4" onClick={loadDashboardData}>Retry</Button>
      </div>
    );
  }

  // ─── KPI Calculations ─────────────────────────────────────────────────
  const overall = dashboardData.overall[0];
  const totalProps = activeFilterCount === 0 ? (overall?.count ?? filtered.length) : filtered.length;
  const avgPrice = activeFilterCount === 0 ? (overall?.average_price ?? 0) : totalProps > 0 ? filtered.reduce((s, p) => s + p.price, 0) / totalProps : 0;
  const avgArea = totalProps > 0 ? filtered.reduce((s, p) => s + p.square_feet, 0) / totalProps : 0;
  const avgRatePerSqft = totalProps > 0 ? filtered.reduce((s, p) => s + p.rate_per_sqft, 0) / totalProps : 0;

  // Locality data comes directly from MongoDB aggregation pipelines.
  const localityAgg = dashboardData.by_locality.map((row) => {
    const medianPrice = row.median_price;
    return {
      city: row._id,
      count: Number.isFinite(row.count) ? row.count : 0,
      avgPrice: Number.isFinite(row.average_price) ? row.average_price : null,
      medianPrice: typeof medianPrice === 'number' && Number.isFinite(medianPrice) && medianPrice > 0 ? medianPrice : null,
      avgRate: 0,
    };
  });
  const localityCountAgg = dashboardData.by_locality_count.map((row) => ({
    city: row._id, count: row.count, avgPrice: row.average_price, avgRate: row.average_rate ?? 0,
  }));

  const localityMinimum = dashboardData.locality_min_sample_size ?? 3;
  const eligibleLocalities = localityAgg
    .filter((l) => l.count >= localityMinimum && l.medianPrice !== null && Number.isFinite(l.medianPrice))
    .map((l) => ({ ...l, medianPrice: l.medianPrice as number }));
  const mostExpensive = [...eligibleLocalities].sort((a, b) => b.medianPrice - a.medianPrice)[0];
  const mostAffordable = [...eligibleLocalities].sort((a, b) => a.medianPrice - b.medianPrice)[0];
  const topLocalitiesByCount = localityCountAgg;
  const topLocalitiesByPrice = eligibleLocalities.slice(0, 10);
  const maxLocalityPrice = Math.max(...topLocalitiesByPrice.map((l) => l.medianPrice ?? 0), 1);
  const maxLocalityCount = Math.max(...topLocalitiesByCount.map((l) => l.count), 1);

  // ─── Property Type distribution ───────────────────────────────────────
  const typeMap = new Map<string, number>();
  const typePriceMap = new Map<string, { count: number; total: number }>();
  filtered.forEach((p) => typeMap.set(p.property_type, (typeMap.get(p.property_type) ?? 0) + 1));
  const typeData = Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1]);
  const maxTypeCount = Math.max(...typeData.map((t) => t[1]), 1);
  filtered.forEach((p) => {
    const current = typePriceMap.get(p.property_type) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += p.price;
    typePriceMap.set(p.property_type, current);
  });
  const typePriceData = Array.from(typePriceMap.entries())
    .map(([type, value]) => ({ type, count: value.count, avgPrice: value.total / value.count }))
    .sort((a, b) => b.avgPrice - a.avgPrice);
  const maxTypePrice = Math.max(...typePriceData.map((t) => t.avgPrice), 1);

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
                <label className="block text-xs font-medium text-slate-600 mb-1">Min Area (sq ft)</label>
                <input type="number" placeholder="0" value={filters.minArea} onChange={(e) => setFilters((f) => ({ ...f, minArea: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max Area (sq ft)</label>
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
        <StatCard label="Avg Price/sq ft" value={`₹${Math.round(avgRatePerSqft).toLocaleString('en-IN')}`} sublabel="Overall average" icon={<TrendingUp className="h-5 w-5" />} accent="amber" />
        <StatCard label="Average Area" value={`${Math.round(avgArea).toLocaleString('en-IN')} sq ft`} sublabel="All properties" icon={<Maximize className="h-5 w-5" />} accent="emerald" />
        <StatCard label="Locations" value={localityAgg.length.toLocaleString('en-IN')} sublabel="Sectors / areas" icon={<MapPin className="h-5 w-5" />} accent="blue" />
        <StatCard
          label="Most Expensive"
          value={mostExpensive ? formatCurrency(mostExpensive.medianPrice) : 'Insufficient data'}
          sublabel={mostExpensive?.city ?? `Need ${localityMinimum}+ valid prices`}
          icon={<ArrowUpRight className="h-5 w-5" />}
          accent="rose"
        />
      </div>

      {/* Most Expensive + Most Affordable */}
      {mostExpensive && mostAffordable ? (
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
              <p className="text-lg font-bold text-rose-900">{formatCurrency(mostExpensive.medianPrice)}</p>
              <p className="text-xs text-rose-500">Median property price · {mostExpensive.count} properties</p>
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
              <p className="text-lg font-bold text-emerald-900">{formatCurrency(mostAffordable.medianPrice)}</p>
              <p className="text-xs text-emerald-500">Median property price · {mostAffordable.count} properties</p>
            </div>
          </div>
        </div>
      ) : (
        <Card className="p-5">
          <p className="text-sm font-semibold text-slate-900">Locality price rankings unavailable</p>
          <p className="mt-1 text-xs text-slate-500">Insufficient data: each locality needs at least {localityMinimum} valid property prices.</p>
        </Card>
      )}

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
            {typePriceData.map(({ type, count, avgPrice }) => (
              <div key={type}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{type}</span>
                  <span className="text-right"><span className="font-semibold text-slate-900">{formatCurrency(avgPrice)}</span><span className="ml-2 text-xs text-slate-400">({count.toLocaleString('en-IN')})</span></span>
                </div>
                <div className="mt-1"><ProgressBar value={avgPrice} max={maxTypePrice} color="amber" /></div>
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
          <div className="mt-6 flex h-56 items-stretch justify-between gap-2 border-b border-slate-200 px-1 pt-3">
            {bucketData.map((b) => {
              const heightPct = (b.count / maxBucket) * 100;
              return (
                <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-semibold text-slate-700">{b.count.toLocaleString('en-IN')}</span>
                  <div className="flex h-36 w-full items-end">
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-700" style={{ height: `${Math.max(heightPct, b.count > 0 ? 3 : 0)}%` }} title={`${b.label}: ${b.count.toLocaleString('en-IN')} properties`} />
                  </div>
                  <span className="text-center text-[10px] leading-tight text-slate-500">{b.label}</span>
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
            <IndianRupee className="h-4 w-4 text-slate-400" /> Median Property Price by Location (Top 10)
          </h3>
          <div className="mt-4 space-y-2">
            {topLocalitiesByPrice.map((l) => (
              <div key={l.city} className="flex items-center gap-3">
                <span className="w-28 truncate text-sm font-medium text-slate-700">{l.city}</span>
                <div className="flex-1"><ProgressBar value={l.medianPrice} max={maxLocalityPrice} color="amber" /></div>
                <span className="w-24 text-right text-sm font-semibold text-slate-900">{formatCurrency(l.medianPrice)}</span>
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
                <th className="px-3 py-2 text-right">Avg Rate/sq ft</th>
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

    </div>
  );
}


