import { useState, useMemo, useRef } from 'react';
import type { Property } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/finance';

const TYPE_COLORS: Record<string, string> = {
  Apartment: '#3b82f6',
  Floor: '#10b981',
  Plot: '#f59e0b',
  Villa: '#8b5cf6',
  House: '#ef4444',
  Penthouse: '#ec4899',
  Studio: '#06b6d4',
};

const TYPE_OPTIONS = ['All', 'Apartment', 'Floor', 'Plot', 'Villa', 'House', 'Penthouse', 'Studio'];
const VIEW_OPTIONS = ['All Properties', 'Typical Properties'] as const;

interface Point {
  id: string;
  area: number;
  price: number;
  type: string;
  city: string;
  bhk: number;
  ratePerSqft: number;
}

function formatPriceAxis(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(0)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value}`;
}

function formatAreaAxis(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const range = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(range / count)));
  const error = (count * step) / range;
  let niceStep: number;
  if (error <= 0.15) niceStep = step * 10;
  else if (error <= 0.3) niceStep = step * 5;
  else if (error <= 0.5) niceStep = step * 2;
  else niceStep = step;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function ScatterPlot({ properties, onSelect }: { properties: Property[]; onSelect: (id: string) => void }) {
  const [typeFilter, setTypeFilter] = useState('All');
  const [viewMode, setViewMode] = useState<(typeof VIEW_OPTIONS)[number]>('Typical Properties');
  const [hovered, setHovered] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Build points from properties
  const allPoints: Point[] = useMemo(() => {
    return properties
      .filter((p) => p.square_feet > 0 && p.price > 0)
      .map((p) => ({
        id: p.id,
        area: p.square_feet,
        price: p.price,
        type: p.property_type,
        city: p.city,
        bhk: p.bedrooms,
        ratePerSqft: p.rate_per_sqft,
      }));
  }, [properties]);

  // Filter by type
  const typeFiltered = useMemo(() => {
    if (typeFilter === 'All') return allPoints;
    return allPoints.filter((p) => p.type === typeFilter);
  }, [allPoints, typeFilter]);

  // Filter outliers for "Typical Properties" using IQR on both area and price
  const visiblePoints = useMemo(() => {
    if (viewMode === 'All Properties') return typeFiltered;
    if (typeFiltered.length < 10) return typeFiltered;

    const areas = typeFiltered.map((p) => p.area).sort((a, b) => a - b);
    const prices = typeFiltered.map((p) => p.price).sort((a, b) => a - b);
    const q1 = (arr: number[]) => arr[Math.floor(arr.length * 0.25)];
    const q3 = (arr: number[]) => arr[Math.floor(arr.length * 0.75)];
    const iqrArea = q3(areas) - q1(areas);
    const iqrPrice = q3(prices) - q1(prices);
    const areaMin = q1(areas) - 1.5 * iqrArea;
    const areaMax = q3(areas) + 1.5 * iqrArea;
    const priceMin = q1(prices) - 1.5 * iqrPrice;
    const priceMax = q3(prices) + 1.5 * iqrPrice;

    return typeFiltered.filter((p) => p.area >= areaMin && p.area <= areaMax && p.price >= priceMin && p.price <= priceMax);
  }, [typeFiltered, viewMode]);

  // Sample if too many points for performance
  const sampledPoints = useMemo(() => {
    if (visiblePoints.length > 1500) {
      const step = Math.ceil(visiblePoints.length / 1500);
      return visiblePoints.filter((_, i) => i % step === 0);
    }
    return visiblePoints;
  }, [visiblePoints]);

  // Calculate ranges
  const areas = sampledPoints.map((p) => p.area);
  const prices = sampledPoints.map((p) => p.price);
  const minArea = Math.min(...areas, 0);
  const maxArea = Math.max(...areas, 1);
  const minPrice = Math.min(...prices, 0);
  const maxPrice = Math.max(...prices, 1);

  // Recalculate the trend line from the full currently visible dataset.
  // Rendering may sample dots for performance, but the regression must still
  // reflect the selected property type and view mode accurately.
  const regression = useMemo(() => {
    return linearRegression(visiblePoints.map((p) => ({ x: p.area, y: p.price })));
  }, [visiblePoints]);

  // SVG dimensions
  const W = 800;
  const H = 400;
  const padL = 70;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (val: number) => padL + ((val - minArea) / (maxArea - minArea || 1)) * plotW;
  const toY = (val: number) => padT + plotH - ((val - minPrice) / (maxPrice - minPrice || 1)) * plotH;

  const areaTicks = niceTicks(minArea, maxArea, 6);
  const priceTicks = niceTicks(minPrice, maxPrice, 6);

  // Present types in legend
  const presentTypes = useMemo(() => {
    const types = new Set(sampledPoints.map((p) => p.type));
    return TYPE_OPTIONS.filter((t) => t === 'All' || types.has(t)).filter((t) => t !== 'All');
  }, [sampledPoints]);

  const handleMouseMove = (e: React.MouseEvent<SVGCircleElement>, point: Point) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setHovered({ ...point, _x: x, _y: y } as Point & { _x: number; _y: number });
  };

  const tooltipPos = hovered as (Point & { _x?: number; _y?: number }) | null;
  const tooltipX = tooltipPos?._x ?? 0;
  const tooltipY = tooltipPos?._y ?? 0;
  const tooltipFlip = tooltipX > W * 0.65;

  return (
    <div className="mt-4">
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-slate-900"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">View:</label>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as (typeof VIEW_OPTIONS)[number])}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-slate-900"
          >
            {VIEW_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-slate-400">
          {sampledPoints.length.toLocaleString('en-IN')} properties shown of {allPoints.length.toLocaleString('en-IN')} loaded
          {viewMode === 'Typical Properties' && typeFiltered.length > sampledPoints.length && (
            <span className="ml-1">(current type/view filters applied; dots may be sampled)</span>
          )}
        </span>
      </div>

      {/* Chart */}
      <div className="relative w-full">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: `${W} / ${H}` }} preserveAspectRatio="xMidYMid meet">
          {/* Grid + ticks */}
          {priceTicks.map((tick) => (
            <g key={`h${tick}`}>
              <line x1={padL} y1={toY(tick)} x2={W - padR} y2={toY(tick)} stroke="#f1f5f9" strokeWidth={1} />
              <text x={padL - 8} y={toY(tick) + 4} textAnchor="end" className="fill-slate-400" style={{ fontSize: '11px' }}>
                {formatPriceAxis(tick)}
              </text>
            </g>
          ))}
          {areaTicks.map((tick) => (
            <g key={`v${tick}`}>
              <line x1={toX(tick)} y1={padT} x2={toX(tick)} y2={padT + plotH} stroke="#f1f5f9" strokeWidth={1} />
              <text x={toX(tick)} y={H - padB + 18} textAnchor="middle" className="fill-slate-400" style={{ fontSize: '11px' }}>
                {formatAreaAxis(tick)}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#cbd5e1" strokeWidth={1.5} />
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#cbd5e1" strokeWidth={1.5} />

          {/* Axis labels */}
          <text x={padL + plotW / 2} y={H - 8} textAnchor="middle" className="fill-slate-600 font-medium" style={{ fontSize: '12px' }}>
            Area (sq ft)
          </text>
          <text x={16} y={padT + plotH / 2} textAnchor="middle" className="fill-slate-600 font-medium" style={{ fontSize: '12px', transform: `rotate(-90, 16, ${padT + plotH / 2})` }}>
            Price
          </text>

          {/* Trend line */}
          {regression && (
            <line
              x1={toX(minArea)}
              y1={toY(regression.intercept + regression.slope * minArea)}
              x2={toX(maxArea)}
              y2={toY(regression.intercept + regression.slope * maxArea)}
              stroke="#64748b"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.5}
            />
          )}

          {/* Data points */}
          {sampledPoints.map((p) => (
            <circle
              key={p.id}
              cx={toX(p.area)}
              cy={toY(p.price)}
              r={3}
              fill={TYPE_COLORS[p.type] ?? '#3b82f6'}
              opacity={hovered?.id === p.id ? 1 : 0.45}
              className="cursor-pointer transition-opacity"
              onMouseEnter={(e) => handleMouseMove(e, p)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(p.id)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(tooltipFlip ? tooltipX - 200 : tooltipX + 12) / W * 100}%`,
              top: `${Math.max(tooltipY - 80, 0) / H * 100}%`,
            }}
          >
            <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[hovered.type] ?? '#3b82f6' }} />
              <span className="font-semibold text-slate-900">{hovered.type}</span>
            </div>
            <div className="mt-1.5 space-y-0.5 text-slate-600">
              <div className="flex justify-between gap-4"><span>Location:</span><span className="font-medium text-slate-900">{hovered.city}</span></div>
              {hovered.bhk > 0 && <div className="flex justify-between gap-4"><span>BHK:</span><span className="font-medium text-slate-900">{hovered.bhk} BHK</span></div>}
              <div className="flex justify-between gap-4"><span>Area:</span><span className="font-medium text-slate-900">{formatNumber(hovered.area)} sq ft</span></div>
              <div className="flex justify-between gap-4"><span>Price:</span><span className="font-medium text-slate-900">{formatCurrency(hovered.price)}</span></div>
              <div className="flex justify-between gap-4"><span>₹/sqft:</span><span className="font-medium text-slate-900">₹{Math.round(hovered.ratePerSqft).toLocaleString('en-IN')}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {presentTypes.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] ?? '#3b82f6' }} />
            <span className="text-xs text-slate-600">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-6 border-t-2 border-dashed border-slate-500" />
          <span className="text-xs text-slate-600">Trend line</span>
        </div>
      </div>
    </div>
  );
}
