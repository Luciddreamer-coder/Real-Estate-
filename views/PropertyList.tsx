import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, MapPin, Bed, Bath, Maximize, Trash2, Pencil, Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { Property, PropertyType, PropertyStatus } from '@/types';
import { calculateMetrics, formatCurrency, formatPct } from '@/lib/finance';
import { searchProperties } from '@/lib/database';
import { Card, Button, Badge, EmptyState } from '@/components/ui';

const STATUS_OPTIONS: (PropertyStatus | 'All')[] = ['All', 'Ready to move', 'Under Construction', 'New', 'Resale'];
const TYPE_OPTIONS: (PropertyType | 'All')[] = ['All', 'Apartment', 'Floor', 'Plot', 'Villa', 'House', 'Studio'];
const PAGE_SIZE = 24;

export function PropertyList({
  onAdd,
  onEdit,
  onDelete,
  onSelect,
}: {
  onAdd: () => void;
  onEdit: (p: Property) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'All'>('All');
  const [typeFilter, setTypeFilter] = useState<PropertyType | 'All'>('All');
  const [sortBy, setSortBy] = useState('price_desc');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: Property[]; total: number }>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await searchProperties(
      search,
      statusFilter,
      typeFilter,
      sortBy,
      PAGE_SIZE,
      page * PAGE_SIZE
    );
    setData(result);
    setLoading(false);
  }, [search, statusFilter, typeFilter, sortBy, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gurugram Properties</h1>
          <p className="mt-1 text-sm text-slate-500">{data.total.toLocaleString('en-IN')} properties available</p>
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
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            <option value="price_desc">Price: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="area_desc">Area: Largest First</option>
            <option value="rate_desc">Rate/sqft: Highest First</option>
            <option value="bhk_desc">BHK: Most First</option>
          </select>
        </div>
      </Card>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <span className="ml-3 text-sm text-slate-500">Loading properties...</span>
        </div>
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
              const m = calculateMetrics(p);
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
                      <Badge color={statusColor(p.status)}>{p.status}</Badge>
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
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-slate-500">Est. Rent</span>
                        <span className="font-semibold text-slate-700">{formatCurrency(p.monthly_rent)}/mo</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-slate-500">Cash Flow</span>
                        <span className={`font-semibold ${m.monthlyCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatCurrency(m.monthlyCashFlow)}/mo
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-slate-500">Cap Rate</span>
                        <span className="font-semibold text-slate-900">{formatPct(m.capRate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex border-t border-slate-100">
                    <button onClick={() => onEdit(p)} className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <div className="w-px bg-slate-100" />
                    <button
                      onClick={() => { if (confirm(`Delete this property?`)) onDelete(p.id); }}
                      className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.max(0, page - 1))}
                className={page === 0 ? 'pointer-events-none opacity-40' : ''}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-500">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                className={page >= totalPages - 1 ? 'pointer-events-none opacity-40' : ''}
              >
                Next
              </Button>
            </div>
          )}
        </>
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
