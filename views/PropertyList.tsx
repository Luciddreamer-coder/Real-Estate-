import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, MapPin, Bed, Maximize, Trash2, Pencil, Loader2, CheckCircle, XCircle, Heart, X } from 'lucide-react';
import type { Property, PropertyType, PropertyStatus } from '@/types';
import { formatCurrency } from '@/lib/finance';
import { getPropertyFilterOptions, searchProperties, type PropertyFilterOptions } from '@/lib/database';
import { Card, Button, Badge, EmptyState } from '@/components/ui';

const STATUS_OPTIONS: (PropertyStatus | 'All')[] = ['All', 'Ready to move', 'Under Construction', 'New', 'Resale'];
const TYPE_OPTIONS: (PropertyType | 'All')[] = ['All', 'Apartment', 'Floor', 'Plot', 'Villa', 'House', 'Penthouse', 'Studio'];
const PAGE_SIZE = 20;

export function PropertyList({
  onAdd,
  onEdit,
  onDelete,
  onSelect,
  refreshKey,
}: {
  onAdd: () => void;
  onEdit: (p: Property) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  refreshKey: number;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'All'>('All');
  const [typeFilter, setTypeFilter] = useState<PropertyType | 'All'>('All');
  const [locality, setLocality] = useState('');
  const [builder, setBuilder] = useState('');
  const [society, setSociety] = useState('');
  const [bhk, setBhk] = useState('');
  const [rera, setRera] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [filterOptions, setFilterOptions] = useState<PropertyFilterOptions>({ localities: [], builders: [], societies: [], bhks: [] });
  const [sortBy, setSortBy] = useState('price_desc');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: Property[]; total: number }>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('gurugram-favorite-properties') ?? '[]') as string[]; }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('gurugram-favorite-properties', JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    getPropertyFilterOptions().then(setFilterOptions).catch(() => {
      // The property list remains usable if filter metadata is temporarily unavailable.
    });
  }, [refreshKey]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await searchProperties(
        search,
        statusFilter,
        typeFilter,
        sortBy,
        PAGE_SIZE,
        page * PAGE_SIZE,
        { locality, builder, society, bhk, rera, minPrice, maxPrice, minArea, maxArea },
      );
      setData(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load properties.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, sortBy, page, refreshKey, locality, builder, society, bhk, rera, minPrice, maxPrice, minArea, maxArea]);

  // Filters and sorting define a new result set, so return to its first page.
  // Keep this separate from the page-loading effect: resetting page inside
  // the page-loading effect makes every Next click immediately jump back.
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, typeFilter, sortBy, locality, builder, society, bhk, rera, minPrice, maxPrice, minArea, maxArea]);

  // A newly created property, or an edited property whose price changed, can
  // move to another server-sorted page. Return to the first page after CRUD
  // refresh so the updated dataset is immediately visible instead of looking
  // like the property disappeared.
  useEffect(() => {
    setPage(0);
  }, [refreshKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const firstVisible = data.rows.length > 0 ? page * PAGE_SIZE + 1 : 0;
  const lastVisible = page * PAGE_SIZE + data.rows.length;
  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(search ? [{ key: 'search', label: `Search: ${search}`, clear: () => setSearch('') }] : []),
    ...(statusFilter !== 'All' ? [{ key: 'status', label: `Status: ${statusFilter}`, clear: () => setStatusFilter('All') }] : []),
    ...(typeFilter !== 'All' ? [{ key: 'type', label: `Type: ${typeFilter}`, clear: () => setTypeFilter('All') }] : []),
    ...(locality ? [{ key: 'locality', label: `Locality: ${locality}`, clear: () => setLocality('') }] : []),
    ...(builder ? [{ key: 'builder', label: `Builder: ${builder}`, clear: () => setBuilder('') }] : []),
    ...(society ? [{ key: 'society', label: `Society: ${society}`, clear: () => setSociety('') }] : []),
    ...(bhk ? [{ key: 'bhk', label: `${bhk} BHK`, clear: () => setBhk('') }] : []),
    ...(rera ? [{ key: 'rera', label: rera === 'approved' ? 'RERA approved' : 'Not RERA approved', clear: () => setRera('') }] : []),
    ...(minPrice ? [{ key: 'minPrice', label: `Min price: ${formatCurrency(Number(minPrice))}`, clear: () => setMinPrice('') }] : []),
    ...(maxPrice ? [{ key: 'maxPrice', label: `Max price: ${formatCurrency(Number(maxPrice))}`, clear: () => setMaxPrice('') }] : []),
    ...(minArea ? [{ key: 'minArea', label: `Min area: ${Number(minArea).toLocaleString('en-IN')} sqft`, clear: () => setMinArea('') }] : []),
    ...(maxArea ? [{ key: 'maxArea', label: `Max area: ${Number(maxArea).toLocaleString('en-IN')} sqft`, clear: () => setMaxArea('') }] : []),
  ];
  const clearAll = () => {
    setSearch(''); setStatusFilter('All'); setTypeFilter('All'); setLocality(''); setBuilder(''); setSociety('');
    setBhk(''); setRera(''); setMinPrice(''); setMaxPrice(''); setMinArea(''); setMaxArea(''); setSortBy('price_desc');
  };
  const toggleFavorite = (id: string) => setFavoriteIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gurugram Properties</h1>
          <p className="mt-1 text-sm text-slate-500">Showing {firstVisible.toLocaleString('en-IN')}–{lastVisible.toLocaleString('en-IN')} of {data.total.toLocaleString('en-IN')} properties</p>
        </div>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" /> Add Property
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by property name, sector, builder, or society..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-2 overflow-x-auto">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="w-px bg-slate-200" />
            <div className="flex gap-2 overflow-x-auto">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    typeFilter === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect label="Locality / Sector" value={locality} onChange={setLocality} options={filterOptions.localities} placeholder="All localities" />
            <FilterSelect label="Builder" value={builder} onChange={setBuilder} options={filterOptions.builders} placeholder="All builders" />
            <FilterSelect label="Society" value={society} onChange={setSociety} options={filterOptions.societies} placeholder="All societies" />
            <FilterSelect label="RERA approval" value={rera} onChange={setRera} options={['approved', 'not_approved']} optionLabels={{ approved: 'Approved by RERA', not_approved: 'Not approved' }} placeholder="All RERA statuses" />
            <FilterSelect label="BHK" value={bhk} onChange={setBhk} options={['1', '2', '3', '4', '5', '6+'].filter((value) => value === '6+' || filterOptions.bhks.length === 0 || filterOptions.bhks.some((n) => n === Number(value)))} optionLabels={{ '1': '1 BHK', '2': '2 BHK', '3': '3 BHK', '4': '4 BHK', '5': '5 BHK', '6+': '6+ BHK' }} placeholder="All BHK" />
            <NumberFilter label="Min price (₹)" value={minPrice} onChange={setMinPrice} placeholder="e.g. 5000000" />
            <NumberFilter label="Max price (₹)" value={maxPrice} onChange={setMaxPrice} placeholder="e.g. 10000000" />
            <NumberFilter label="Min area (sqft)" value={minArea} onChange={setMinArea} placeholder="e.g. 1000" />
            <NumberFilter label="Max area (sqft)" value={maxArea} onChange={setMaxArea} placeholder="e.g. 2000" />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            <option value="price_desc">Price: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="area_desc">Area: Largest First</option>
            <option value="rate_desc">Price/sqft: Highest First</option>
            <option value="bhk_desc">BHK: Most First</option>
          </select>
        </div>
      </Card>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active filters</span>
          {activeFilters.map((filter) => (
            <button key={filter.key} onClick={filter.clear} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
              {filter.label}<X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={clearAll} className="text-xs font-semibold text-slate-500 underline hover:text-slate-900">Clear all filters</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <span className="ml-3 text-sm text-slate-500">Loading properties...</span>
        </div>
      ) : error ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium text-rose-700">Unable to load properties</p>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={fetchData}>Try again</Button>
        </Card>
      ) : data.rows.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title="No properties found"
          description="Try adjusting your search or filters."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.rows.map((p) => {
              return (
                <Card key={p.id} className="overflow-hidden transition-all hover:shadow-md">
                  <div className="cursor-pointer p-5" onClick={() => onSelect(p.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{p.address}</h3>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" /> {p.city} · {p.state}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          aria-label={favoriteIds.includes(p.id) ? 'Remove from favourites' : 'Save property'}
                          title={favoriteIds.includes(p.id) ? 'Remove from favourites' : 'Save property'}
                          onClick={(event) => { event.stopPropagation(); toggleFavorite(p.id); }}
                          className={`rounded-full p-1.5 transition-colors ${favoriteIds.includes(p.id) ? 'bg-rose-50 text-rose-500' : 'text-slate-300 hover:bg-slate-100 hover:text-rose-400'}`}
                        >
                          <Heart className="h-4 w-4" fill={favoriteIds.includes(p.id) ? 'currentColor' : 'none'} />
                        </button>
                        <Badge color={statusColor(p.status)}>{p.status}</Badge>
                      </div>
                    </div>

                    {p.society && p.society !== 'Outside Socity' && (
                      <p className="mt-1.5 text-xs font-medium text-slate-600">{p.society}</p>
                    )}

                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                      {p.bedrooms > 0 && <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5" /> {p.bedrooms} BHK</span>}
                      <span className="flex items-center gap-1"><Maximize className="h-3.5 w-3.5" /> {p.square_feet.toLocaleString('en-IN')} sqft</span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Badge color="slate">{p.property_type}</Badge>
                      {p.rera_approved ? (
                        <Badge color="emerald"><CheckCircle className="mr-0.5 h-3 w-3" /> RERA</Badge>
                      ) : (
                        <Badge color="rose"><XCircle className="mr-0.5 h-3 w-3" /> No RERA</Badge>
                      )}
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Price</span>
                        <span className="font-bold text-slate-900">{formatCurrency(p.price)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-slate-500">Rate / sqft</span>
                        <span className="font-semibold text-slate-700">₹{p.rate_per_sqft.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex border-t border-slate-100">
                    <button onClick={() => onEdit(p)} className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <div className="w-px bg-slate-100" />
                    <button
                      onClick={() => { if (confirm(`Delete this property?`)) { setFavoriteIds((current) => current.filter((id) => id !== p.id)); onDelete(p.id); } }}
                      className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          <PaginationControls
            page={page}
            totalPages={totalPages}
            totalCount={data.total}
            visibleCount={data.rows.length}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder, optionLabels = {} }: { label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder: string; optionLabels?: Record<string, string> }) {
  return (
    <label className="text-xs font-medium text-slate-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-slate-900">
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{optionLabels[option] ?? option}</option>)}
      </select>
    </label>
  );
}

function NumberFilter({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="text-xs font-medium text-slate-500">
      {label}
      <input type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-slate-900" />
    </label>
  );
}

function PaginationControls({ page, totalPages, totalCount, visibleCount, onPageChange }: { page: number; totalPages: number; totalCount: number; visibleCount: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;

  const firstVisible = page * PAGE_SIZE + 1;
  const lastVisible = page * PAGE_SIZE + visibleCount;

  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={page === 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
      >
        Previous
      </Button>
      <span className="text-sm text-slate-500">
        Showing {firstVisible.toLocaleString('en-IN')}–{lastVisible.toLocaleString('en-IN')} of {totalCount.toLocaleString('en-IN')} · Page {page + 1} of {totalPages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
      >
        Next
      </Button>
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
