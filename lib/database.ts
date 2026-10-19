import type { Property } from '@/types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000').replace(/\/$/, '');
type ApiDocument = Record<string, unknown> & { id?: string; _id?: string };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  // Keep the UI responsive when Flask cannot reach Atlas (for example,
  // unavailable network/DNS). The backend still reports the detailed error.
  // The paginated list is small, but dashboard/analytics refreshes may load
  // the complete MongoDB dataset. Give the larger request enough time.
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
      ...options,
      signal: options?.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The backend request timed out. Check that Flask and MongoDB Atlas are reachable.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `API request failed (${response.status})`);
  return body as T;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toProperty(document: ApiDocument): Property {
  const rera = String(document['RERA Approval'] ?? '').trim().toLowerCase().startsWith('approved');
  const price = number(document.Price);
  return {
    id: String(document.id ?? document._id ?? ''), address: String(document['Property Type'] ?? ''),
    city: String(document.Locality ?? 'Gurugram'), state: String(document['Builder Name'] ?? ''), zip: String(document['Company Name'] ?? ''),
    property_type: String(document['Flat Type'] ?? 'Apartment') as Property['property_type'], status: String(document.Status ?? 'New') as Property['status'],
    price, bedrooms: number(document.BHK_Count), bathrooms: number(document.BHK_Count), square_feet: number(document.Area),
    lot_size: 0, year_built: 0, monthly_rent: Math.round((price * 0.025) / 12), property_tax_annual: Math.round(price * 0.001), insurance_annual: Math.round(price * 0.0005),
    hoa_monthly: String(document['Flat Type'] ?? '').toLowerCase().includes('apartment') ? 2000 : 0, vacancy_rate: 5, maintenance_rate: 5, management_rate: 8,
    down_payment_pct: 20, interest_rate: 8.5, loan_term_years: 20, closing_costs: Math.round(price * 0.02), rehab_cost: 0, notes: rera ? 'RERA Approved' : 'Not RERA Approved',
    created_at: new Date().toISOString(), rate_per_sqft: number(document['Rate per sqft']), rera_approved: rera, society: String(document.Society ?? ''),
  };
}

export async function loadCsvData(): Promise<void> { await api('/api/health'); }

export async function getAllProperties(offset = 0, limit = 20000): Promise<Property[]> {
  const page = Math.floor(offset / Math.max(limit, 1));
  const result = await api<{ rows: ApiDocument[] }>(`/api/properties?page=${page}&limit=${limit}&sort=price_desc`);
  return result.rows.map(toProperty);
}

export async function getPropertyCount(): Promise<number> {
  return (await api<{ total: number }>('/api/properties?page=0&limit=1')).total;
}

export interface PropertyFilterOptions {
  localities: string[];
  builders: string[];
  societies: string[];
  bhks: number[];
}

export async function getPropertyFilterOptions(): Promise<PropertyFilterOptions> {
  return api<PropertyFilterOptions>('/api/property-filters');
}

export async function getProperty(id: string): Promise<Property | null> {
  try { return toProperty(await api<ApiDocument>(`/api/properties/${encodeURIComponent(id)}`)); }
  catch (error) { if (error instanceof Error && error.message === 'Property not found') return null; throw error; }
}

export async function saveProperty(p: Property): Promise<Property> {
  const isMongoId = /^[a-f\d]{24}$/i.test(p.id);
  const result = isMongoId
    ? await api<ApiDocument>(`/api/properties/${p.id}`, { method: 'PUT', body: JSON.stringify(p) })
    : await api<ApiDocument>('/api/properties', { method: 'POST', body: JSON.stringify(p) });
  return toProperty(result);
}

export async function deleteProperty(id: string): Promise<void> { await api(`/api/properties/${encodeURIComponent(id)}`, { method: 'DELETE' }); }

export async function searchProperties(
  search: string,
  statusFilter: string,
  typeFilter: string,
  sortBy: string,
  limit: number,
  offset: number,
  filters: { locality: string; builder: string; society: string; bhk: string; rera: string; minPrice: string; maxPrice: string; minArea: string; maxArea: string },
): Promise<{ rows: Property[]; total: number }> {
  const params = new URLSearchParams({ search, status: statusFilter, type: typeFilter, sort: sortBy, limit: String(limit), page: String(Math.floor(offset / Math.max(limit, 1))) });
  const optionalFilters: Record<string, string> = {
    locality: filters.locality, builder: filters.builder, society: filters.society, bhk: filters.bhk,
    rera: filters.rera, min_price: filters.minPrice, max_price: filters.maxPrice,
    min_area: filters.minArea, max_area: filters.maxArea,
  };
  Object.entries(optionalFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
  const result = await api<{ rows: ApiDocument[]; total: number }>(`/api/properties?${params}`);
  return { rows: result.rows.map(toProperty), total: result.total };
}
