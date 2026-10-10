import { ArrowLeft, MapPin, Bed, Maximize, IndianRupee, Pencil, CheckCircle, XCircle, Building2, TrendingUp, Home } from 'lucide-react';
import type { Property } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/finance';
import { Card, Button, Badge, ProgressBar } from '@/components/ui';

export function PropertyDetail({
  property,
  allProperties,
  onBack,
  onEdit,
  onSelectProperty,
}: {
  property: Property;
  allProperties: Property[];
  onBack: () => void;
  onEdit: () => void;
  onSelectProperty: (id: string) => void;
}) {
  const pricePerSqft = property.square_feet > 0 ? Math.round(property.price / property.square_feet) : 0;

  // ─── Similar properties: same locality + same BHK, exclude current ────
  const similar = allProperties
    .filter((p) => p.id !== property.id && p.city === property.city && p.bedrooms === property.bedrooms)
    .sort((a, b) => Math.abs(b.price - property.price) - Math.abs(a.price - property.price))
    .slice(0, 5);

  // ─── Location price comparison ────────────────────────────────────────
  const sameLocation = allProperties.filter((p) => p.city === property.city);
  const locPrices = sameLocation.map((p) => p.price).sort((a, b) => a - b);
  const locAvg = locPrices.reduce((s, p) => s + p, 0) / locPrices.length;
  const locMin = locPrices[0] ?? 0;
  const locMax = locPrices[locPrices.length - 1] ?? 0;
  const locMedian = locPrices.length > 0 ? locPrices[Math.floor(locPrices.length / 2)] : 0;
  const isAboveAvg = property.price > locAvg;
  const pricePosition = locMax > locMin ? ((property.price - locMin) / (locMax - locMin)) * 100 : 50;

  // ─── Same BHK comparison across localities ────────────────────────────
  const sameBhk = allProperties.filter((p) => p.bedrooms === property.bedrooms && p.bedrooms > 0);
  const bhkAvg = sameBhk.length > 0 ? sameBhk.reduce((s, p) => s + p.price, 0) / sameBhk.length : 0;

  return (
    <div className="space-y-6">
      {/* Back + Edit */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to Properties
        </button>
        <Button variant="secondary" onClick={onEdit}>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </div>

      {/* Title */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{property.address}</h1>
          <Badge color={statusColor(property.status)}>{property.status}</Badge>
          {property.rera_approved ? (
            <Badge color="emerald"><CheckCircle className="mr-0.5 h-3 w-3" /> RERA Approved</Badge>
          ) : (
            <Badge color="rose"><XCircle className="mr-0.5 h-3 w-3" /> Not RERA</Badge>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
          <MapPin className="h-4 w-4" /> {property.city} · {property.state}
        </p>
        {property.society && property.society !== 'Outside Socity' && (
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <Building2 className="h-4 w-4" /> {property.society}
          </p>
        )}
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Price</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(property.price)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Price / sqft</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">₹{pricePerSqft.toLocaleString('en-IN')}</p>
          {property.rate_per_sqft > 0 && <p className="mt-1 text-xs text-slate-400">Listed: ₹{property.rate_per_sqft.toLocaleString('en-IN')}</p>}
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Area</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatNumber(property.square_feet)} sqft</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">BHK</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{property.bedrooms > 0 ? `${property.bedrooms} BHK` : '-'}</p>
        </Card>
      </div>

      {/* Property Info + Location Comparison */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Property Info */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900">Property Information</h3>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {property.bedrooms > 0 && <InfoRow icon={<Bed className="h-4 w-4" />} label="BHK" value={`${property.bedrooms} BHK`} />}
            <InfoRow icon={<Maximize className="h-4 w-4" />} label="Area" value={`${formatNumber(property.square_feet)} sqft`} />
            <InfoRow icon={<IndianRupee className="h-4 w-4" />} label="Price / sqft" value={`₹${pricePerSqft.toLocaleString('en-IN')}`} />
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Property Type" value={property.property_type} />
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Builder" value={property.state} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Locality" value={property.city} />
            <InfoRow icon={<Home className="h-4 w-4" />} label="Society" value={property.society || '-'} />
            <InfoRow icon={<IndianRupee className="h-4 w-4" />} label="Company" value={property.zip || '-'} />
          </div>
          {property.notes && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p>
              <p className="mt-1 text-sm text-slate-600">{property.notes}</p>
            </div>
          )}
        </Card>

        {/* Location Price Comparison */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <TrendingUp className="h-4 w-4 text-slate-400" /> Location Price Comparison
          </h3>
          <p className="mt-1 text-xs text-slate-400">How this property compares to others in {property.city}</p>
          <div className="mt-4 space-y-3">
            <ComparisonRow label="This Property" value={formatCurrency(property.price)} highlight />
            <ComparisonRow label={`${property.city} Average`} value={formatCurrency(locAvg)} />
            <ComparisonRow label={`${property.city} Median`} value={formatCurrency(locMedian)} />
            <ComparisonRow label={`${property.city} Minimum`} value={formatCurrency(locMin)} />
            <ComparisonRow label={`${property.city} Maximum`} value={formatCurrency(locMax)} />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Price position in {property.city}</span>
              <span className={`font-semibold ${isAboveAvg ? 'text-amber-600' : 'text-emerald-600'}`}>
                {isAboveAvg ? 'Above average' : 'Below average'}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar value={pricePosition} max={100} color={isAboveAvg ? 'amber' : 'emerald'} />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {sameLocation.length.toLocaleString('en-IN')} properties in {property.city}
            </p>
          </div>
          {property.bedrooms > 0 && bhkAvg > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Avg for {property.bedrooms} BHK (all locations)</span>
                <span className="font-semibold text-slate-900">{formatCurrency(bhkAvg)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {property.price < bhkAvg ? `${formatCurrency(bhkAvg - property.price)} below BHK average` : `${formatCurrency(property.price - bhkAvg)} above BHK average`}
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Similar Properties */}
      {similar.length > 0 && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900">Similar Properties in {property.city} ({property.bedrooms} BHK)</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((p) => {
              const pPricePerSqft = p.square_feet > 0 ? Math.round(p.price / p.square_feet) : 0;
              const priceDiff = ((p.price - property.price) / property.price) * 100;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProperty(p.id)}
                  className="cursor-pointer rounded-xl border border-slate-200 p-4 transition-all hover:border-slate-300 hover:shadow-sm"
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{p.address}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="h-3 w-3" /> {p.city}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Maximize className="h-3 w-3" /> {formatNumber(p.square_feet)}</span>
                    <span>·</span>
                    <span>₹{pPricePerSqft.toLocaleString('en-IN')}/sqft</span>
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-slate-900">{formatCurrency(p.price)}</span>
                      <span className={`text-xs font-medium ${priceDiff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function ComparisonRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${highlight ? 'rounded-lg bg-slate-900 px-3 py-2 text-white' : ''}`}>
      <span className={highlight ? 'text-slate-200' : 'text-slate-500'}>{label}</span>
      <span className={`${highlight ? 'font-bold text-white' : 'font-semibold text-slate-900'}`}>{value}</span>
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
