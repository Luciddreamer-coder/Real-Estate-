import { useState, useEffect } from 'react';
import { Database, Zap, BarChart3, MapPin, Building2, Bed, IndianRupee, TrendingUp, Clock, Layers, Search, CheckCircle, Gauge } from 'lucide-react';
import type { Property } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/finance';
import { Card, Badge, ProgressBar } from '@/components/ui';

interface AggregationRow {
  label: string;
  count: number;
  avgPrice: number;
  avgRate: number;
  medianPrice?: number;
  medianRate?: number;
  smallSample?: boolean;
  reviewHighRate?: boolean;
}

interface IndexInfo {
  name: string;
  field: string;
  description: string;
}

interface CoverageReports {
  all_localities: { locality: string; total_listings: number; percentage_of_dataset: number; apartments: number; plots: number; floors: number; villas: number }[];
  ml_coverage: { locality: string; by_property_type: { property_type: string; bhk_1_to_5: Record<string, number>; total_records: number }[]; missing_property_types: string[]; sparse_groups: { property_type: string; bhk: number; records: number }[] }[];
  classification: { locality: string; total_listings: number; classification: string }[];
  thresholds: { very_limited_max_records: number; limited_max_records: number };
}

interface GroupEvaluationReport {
  methodology: { random_state: number; minimum_group_total_records: number; minimum_group_test_records: number };
  overall: { mae: number; rmse: number; r2: number };
  proposed_locality_mapping: Record<string, string>;
  sufficient_groups: number;
  poor_accuracy_groups: { locality: string; property_type: string; bhk: number | null; total_records: number; test_records: number; metrics: { mae: number; r2: number } }[];
  largest_error_records: { source_locality: string; property_type: string; bhk: number | null; area: number; price_per_sqft: number; actual_price: number; predicted_price: number; absolute_error: number }[];
  sensitivity_experiment: { excluded_records: number; common_clean_test_rows: number; baseline_all_records_on_common_test: { mae: number; rmse: number; r2: number }; diagnostic_excluded_from_training: { mae: number; rmse: number; r2: number }; sector113_common_test_rows: number; sector113_baseline: { mae: number; rmse: number; r2: number } | null; sector113_diagnostic: { mae: number; rmse: number; r2: number } | null };
}

export function MongoDBInsights({ properties, refreshKey }: { properties: Property[]; refreshKey: number }) {
  const [indexDemo, setIndexDemo] = useState<{ withIndex: number; withoutIndex: number; speedup: number; indexName: string } | null>(null);
  const [insightsError, setInsightsError] = useState('');
  const [groupEvaluation, setGroupEvaluation] = useState<GroupEvaluationReport | null>(null);
  const [serverInsights, setServerInsights] = useState<{
    total_docs: number;
    collection_count: number;
    indexed_fields: string[];
    indexes: IndexInfo[];
    query: { field: string; value: string; index: string };
    top_localities: { _id: string; count: number; average_price: number; median_price: number; average_rate?: number; median_rate?: number }[];
    rate_localities: { _id: string; count: number; average_price: number; median_price: number; average_rate?: number; median_rate?: number; small_sample?: boolean; review_high_rate?: boolean }[];
    rate_locality_min_sample_size: number;
    rate_locality_small_sample_size: number;
    property_types: { _id: string; count: number; average_price: number }[];
    query_performance: { with_index: number; without_index: number; speedup: number };
    coverage_reports: CoverageReports;
  } | null>(null);

  // ─── Database Statistics ───────────────────────────────────────────────
  const totalDocs = serverInsights?.total_docs;
  const indexedFields = serverInsights?.indexed_fields ?? [];

  // ─── Aggregation: Avg Price by Locality ───────────────────────────────
  const indexes = serverInsights?.indexes ?? [];
  const localityAgg = serverInsights
    ? serverInsights.top_localities.map((row) => ({ label: row._id, count: row.count, avgPrice: row.average_price, medianPrice: row.median_price, avgRate: row.average_rate ?? 0, medianRate: row.median_rate ?? row.average_rate ?? 0 }))
    : aggregateBy(properties, (p) => p.city, 'price', 'rate_per_sqft').sort((a, b) => b.count - a.count).slice(0, 15);
  const maxLocalityCount = Math.max(...localityAgg.map((l) => l.count), 1);

  // ─── Aggregation: Property Count by BHK ───────────────────────────────
  const bhkAgg = aggregateBy(properties, (p) => `${p.bedrooms} BHK`, 'price', 'rate_per_sqft').sort((a, b) => {
    const aNum = parseInt(a.label);
    const bNum = parseInt(b.label);
    return aNum - bNum;
  });
  const maxBhkCount = Math.max(...bhkAgg.map((b) => b.count), 1);

  // ─── Aggregation: Property Count by Type ──────────────────────────────
  const typeAgg = serverInsights
    ? serverInsights.property_types.map((row) => ({ label: row._id, count: row.count, avgPrice: row.average_price, avgRate: 0 }))
    : aggregateBy(properties, (p) => p.property_type, 'price', 'rate_per_sqft').sort((a, b) => b.count - a.count);
  const maxTypeCount = Math.max(...typeAgg.map((t) => t.count), 1);

  // ─── Aggregation: Avg Price by Property Type ──────────────────────────
  const typePriceAgg = [...typeAgg].sort((a, b) => b.avgPrice - a.avgPrice);
  const maxTypePrice = Math.max(...typePriceAgg.map((t) => t.avgPrice), 1);

  // ─── Aggregation: Avg Rate/sqft by Locality ───────────────────────────
  const rateAgg = serverInsights
    ? serverInsights.rate_localities.map((row) => ({ label: row._id, count: row.count, avgPrice: row.average_price, medianPrice: row.median_price, avgRate: row.average_rate ?? 0, medianRate: row.median_rate ?? row.average_rate ?? 0, smallSample: row.small_sample ?? false, reviewHighRate: row.review_high_rate ?? false }))
    : [...localityAgg].sort((a, b) => b.avgRate - a.avgRate).slice(0, 15).map((row) => ({ ...row, smallSample: false, reviewHighRate: false }));
  const maxRate = Math.max(...rateAgg.map((l) => l.avgRate), 1);

  // ─── Index Performance Demo ───────────────────────────────────────────
  useEffect(() => {
    fetch(`${(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000').replace(/\/$/, '')}/api/insights`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Insights unavailable')))
      .then((data) => { setServerInsights(data); setInsightsError(''); setIndexDemo({ withIndex: data.query_performance.with_index, withoutIndex: data.query_performance.without_index, speedup: data.query_performance.speedup, indexName: data.query.index }); })
      .catch((error) => { setServerInsights(null); setInsightsError(error instanceof Error ? error.message : 'MongoDB insights are unavailable.'); });
    fetch(`${(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000').replace(/\/$/, '')}/api/group-evaluation`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Group evaluation unavailable')))
      .then((data) => setGroupEvaluation(data))
      .catch(() => setGroupEvaluation(null));
  }, [refreshKey]);

  if (properties.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Database Insights</h1>
        <Card className="p-8 text-center">
          <Database className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No data available.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Database className="h-7 w-7 text-emerald-600" /> Database Insights
        </h1>
        <p className="mt-1 text-sm text-slate-500">Aggregation pipelines, indexing, and analytical query performance</p>
      </div>

      {groupEvaluation && <Card className="p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"><Gauge className="h-4 w-4" /> Random Forest group evaluation</h2>
        <p className="mt-1 text-xs text-slate-500">Read-only 80/20 held-out evaluation using the existing preprocessing pipeline and random state {groupEvaluation.methodology.random_state}. {Object.keys(groupEvaluation.proposed_locality_mapping).length} locality aliases are proposed for analysis only.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Overall MAE</p><p className="font-semibold">{formatCurrency(groupEvaluation.overall.mae)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Overall RMSE</p><p className="font-semibold">{formatCurrency(groupEvaluation.overall.rmse)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Overall R²</p><p className="font-semibold">{(groupEvaluation.overall.r2 * 100).toFixed(2)}%</p></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{groupEvaluation.sufficient_groups} groups meet the minimum coverage of {groupEvaluation.methodology.minimum_group_total_records} total and {groupEvaluation.methodology.minimum_group_test_records} held-out records. Smaller groups are excluded from accuracy conclusions.</p>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-semibold">Diagnostic sensitivity experiment</p><p className="mt-1">{groupEvaluation.sensitivity_experiment.excluded_records} Sector 113 pricing-band records were excluded only from the diagnostic training run. On the same {groupEvaluation.sensitivity_experiment.common_clean_test_rows} clean test rows, baseline MAE was {formatCurrency(groupEvaluation.sensitivity_experiment.baseline_all_records_on_common_test.mae)} versus {formatCurrency(groupEvaluation.sensitivity_experiment.diagnostic_excluded_from_training.mae)} after exclusion; this is not evidence that the records are incorrect.</p>{groupEvaluation.sensitivity_experiment.sector113_baseline && groupEvaluation.sensitivity_experiment.sector113_diagnostic && <p className="mt-1">Sector 113 subset ({groupEvaluation.sensitivity_experiment.sector113_common_test_rows} test rows): MAE {formatCurrency(groupEvaluation.sensitivity_experiment.sector113_baseline.mae)} versus {formatCurrency(groupEvaluation.sensitivity_experiment.sector113_diagnostic.mae)}.</p>}</div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-xs"><thead className="border-b border-slate-200 text-left text-slate-500"><tr><th className="px-2 py-2">Highest-error group</th><th className="px-2 py-2">Total</th><th className="px-2 py-2">Test</th><th className="px-2 py-2">MAE</th><th className="px-2 py-2">R²</th></tr></thead><tbody>{groupEvaluation.poor_accuracy_groups.slice(0, 10).map((row) => <tr key={`${row.locality}-${row.property_type}-${row.bhk}`} className="border-t border-slate-100"><td className="px-2 py-2">{row.locality} · {row.property_type} · {row.bhk == null ? 'no BHK' : `${row.bhk} BHK`}</td><td className="px-2 py-2">{row.total_records}</td><td className="px-2 py-2">{row.test_records}</td><td className="px-2 py-2">{formatCurrency(row.metrics.mae)}</td><td className="px-2 py-2">{(row.metrics.r2 * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
        <p className="mt-5 text-xs font-semibold text-slate-700">Largest individual errors in the five highest-error groups</p>
        <div className="mt-2 max-h-80 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 border-b border-slate-200 bg-white text-left text-slate-500"><tr><th className="px-2 py-2">Property</th><th className="px-2 py-2">Area</th><th className="px-2 py-2">Rate/sqft</th><th className="px-2 py-2">Actual</th><th className="px-2 py-2">Predicted</th><th className="px-2 py-2">Error</th></tr></thead><tbody>{groupEvaluation.largest_error_records.map((row, index) => <tr key={`${row.source_locality}-${row.property_type}-${row.area}-${index}`} className="border-t border-slate-100"><td className="px-2 py-2">{row.source_locality} · {row.property_type} · {row.bhk == null ? 'no BHK' : `${row.bhk} BHK`}</td><td className="px-2 py-2">{row.area.toLocaleString('en-IN')}</td><td className="px-2 py-2">₹{Math.round(row.price_per_sqft).toLocaleString('en-IN')}</td><td className="px-2 py-2">{formatCurrency(row.actual_price)}</td><td className="px-2 py-2">{formatCurrency(row.predicted_price)}</td><td className="px-2 py-2 font-semibold">{formatCurrency(row.absolute_error)}</td></tr>)}</tbody></table></div>
      </Card>}

      {/* Database Statistics */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          <Layers className="h-4 w-4" /> Database Statistics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Total Documents</p>
                <p className="text-2xl font-bold text-slate-900">{totalDocs?.toLocaleString('en-IN') ?? 'Unavailable'}</p>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Collections</p>
                <p className="text-2xl font-bold text-slate-900">{serverInsights?.collection_count ?? 'Unavailable'}</p>
                <p className="text-xs text-slate-400">MongoDB collections</p>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Indexed Fields</p>
                <p className="text-2xl font-bold text-slate-900">{serverInsights ? indexedFields.length : 'Unavailable'}</p>
                <p className="text-xs text-slate-400">unique indexed fields</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Aggregation Insights */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          <BarChart3 className="h-4 w-4" /> Aggregation Insights
        </h2>
        <p className="mb-4 text-xs text-slate-500">These results are produced by $group aggregation pipelines grouped by different fields</p>

        {serverInsights?.coverage_reports && (
          <div className="mb-4 space-y-4">
            <Card className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MapPin className="h-4 w-4 text-slate-400" /> Report 1 — All localities</h3>
              <p className="mt-1 text-xs text-slate-500">Sorted from fewest to most listings. Percentages use the complete MongoDB collection.</p>
              <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">Locality</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Apartment</th><th className="px-3 py-2 text-right">Plot</th><th className="px-3 py-2 text-right">Floor</th><th className="px-3 py-2 text-right">Villa</th><th className="px-3 py-2 text-right">Dataset %</th></tr></thead>
                  <tbody>{serverInsights.coverage_reports.all_localities.map((row) => <tr key={row.locality} className="border-t border-slate-100"><td className="px-3 py-2 font-medium text-slate-700">{row.locality}</td><td className="px-3 py-2 text-right font-semibold">{row.total_listings.toLocaleString('en-IN')}</td><td className="px-3 py-2 text-right">{row.apartments.toLocaleString('en-IN')}</td><td className="px-3 py-2 text-right">{row.plots.toLocaleString('en-IN')}</td><td className="px-3 py-2 text-right">{row.floors.toLocaleString('en-IN')}</td><td className="px-3 py-2 text-right">{row.villas.toLocaleString('en-IN')}</td><td className="px-3 py-2 text-right">{row.percentage_of_dataset.toFixed(2)}%</td></tr>)}</tbody>
                </table>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Bed className="h-4 w-4 text-slate-400" /> Report 2 — Locality coverage for ML</h3>
              <p className="mt-1 text-xs text-slate-500">Counts by locality, property type and 1–5 BHK. Missing types and small comparable groups are called out.</p>
              <div className="mt-4 max-h-96 space-y-3 overflow-auto">
                {serverInsights.coverage_reports.ml_coverage.map((row) => <div key={row.locality} className="rounded-lg border border-slate-100 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-800">{row.locality}</span>{row.missing_property_types.length > 0 && <span className="text-xs text-amber-700">No examples: {row.missing_property_types.join(', ')}</span>}</div><div className="mt-2 grid gap-2 sm:grid-cols-2">{row.by_property_type.map((group) => <div key={group.property_type} className="rounded bg-slate-50 px-2 py-1.5 text-xs"><span className="font-medium">{group.property_type}</span><span className="ml-2 text-slate-500">1BHK {group.bhk_1_to_5['1']} · 2BHK {group.bhk_1_to_5['2']} · 3BHK {group.bhk_1_to_5['3']} · 4BHK {group.bhk_1_to_5['4']} · 5BHK {group.bhk_1_to_5['5']}</span></div>)}</div>{row.sparse_groups.length > 0 && <p className="mt-2 text-xs text-amber-700">Handful of records: {row.sparse_groups.map((group) => `${group.property_type} ${group.bhk}-BHK (${group.records})`).join(', ')}</p>}</div>)}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Gauge className="h-4 w-4 text-slate-400" /> Report 3 — Data coverage classification</h3>
              <p className="mt-1 text-xs text-slate-500">Configurable thresholds: Very limited ≤ {serverInsights.coverage_reports.thresholds.very_limited_max_records}; Limited ≤ {serverInsights.coverage_reports.thresholds.limited_max_records}; Better represented above that.</p>
              <div className="mt-4 grid max-h-64 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">{serverInsights.coverage_reports.classification.map((row) => <div key={row.locality} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="truncate font-medium text-slate-700">{row.locality}</span><span className="ml-2 whitespace-nowrap text-slate-500">{row.total_listings} · {row.classification}</span></div>)}</div>
            </Card>
          </div>
        )}

        {/* Avg Price by Locality */}
        <Card className="mb-4 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="h-4 w-4 text-slate-400" /> Average and Median Price by Locality
          </h3>
          <div className="mt-4 space-y-2">
            {localityAgg.map((l) => (
              <div key={l.label} className="flex items-center gap-3">
                <span className="w-28 truncate text-sm font-medium text-slate-700">{l.label}</span>
                <div className="flex-1">
                  <ProgressBar value={l.count} max={maxLocalityCount} color="blue" />
                </div>
                <span className="w-16 text-right text-xs text-slate-400">{l.count}</span>
                <span className="w-32 text-right text-xs text-slate-500">median {formatCurrency(l.medianPrice ?? l.avgPrice)}</span>
                <span className="w-24 text-right text-sm font-semibold text-slate-900">avg {formatCurrency(l.avgPrice)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Property Count by BHK */}
        <Card className="mb-4 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bed className="h-4 w-4 text-slate-400" /> Property Count by BHK ($group + $sum)
          </h3>
          <div className="mt-4 space-y-2">
            {bhkAgg.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-16 text-sm font-medium text-slate-700">{b.label}</span>
                <div className="flex-1">
                  <ProgressBar value={b.count} max={maxBhkCount} color="emerald" />
                </div>
                <span className="w-16 text-right text-sm font-semibold text-slate-900">{b.count.toLocaleString('en-IN')}</span>
                <span className="w-24 text-right text-xs text-slate-400">avg {formatCurrency(b.avgPrice)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">0 BHK may represent plots or properties without a conventional bedroom count. Other values are displayed as recorded.</p>
        </Card>

        {/* Property Count by Type */}
        <Card className="mb-4 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Building2 className="h-4 w-4 text-slate-400" /> Property Count by Type ($group + $sum)
          </h3>
          <div className="mt-4 space-y-2">
            {typeAgg.map((t) => (
              <div key={t.label} className="flex items-center gap-3">
                <span className="w-24 text-sm font-medium text-slate-700">{t.label}</span>
                <div className="flex-1">
                  <ProgressBar value={t.count} max={maxTypeCount} color="blue" />
                </div>
                <span className="w-20 text-right text-sm font-semibold text-slate-900">{t.count.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Avg Price by Property Type */}
        <Card className="mb-4 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <IndianRupee className="h-4 w-4 text-slate-400" /> Average Price by Property Type ($group + $avg)
          </h3>
          <div className="mt-4 space-y-2">
            {typePriceAgg.map((t) => (
              <div key={t.label} className="flex items-center gap-3">
                <span className="w-24 text-sm font-medium text-slate-700">{t.label}</span>
                <div className="flex-1">
                  <ProgressBar value={t.avgPrice} max={maxTypePrice} color="amber" />
                </div>
                <span className="w-24 text-right text-sm font-semibold text-slate-900">{formatCurrency(t.avgPrice)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Avg Rate/sqft by Locality */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <TrendingUp className="h-4 w-4 text-slate-400" /> Average and Median Rate/sq.ft by Locality (Top 15)
          </h3>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[920px] space-y-2">
              {rateAgg.map((l) => (
                <div
                  key={l.label}
                  className="grid grid-cols-[9rem_minmax(14rem,1fr)_9rem_8rem_4rem_15rem] items-center gap-3"
                >
                  <span className="truncate text-sm font-medium text-slate-700">{l.label}</span>
                  <ProgressBar value={l.avgRate} max={maxRate} color="emerald" />
                  <span className="text-right text-xs text-slate-500">
                    median ₹{Math.round(l.medianRate ?? l.avgRate).toLocaleString('en-IN')}
                  </span>
                  <span className="text-right text-sm font-semibold text-slate-900">
                    avg ₹{Math.round(l.avgRate).toLocaleString('en-IN')}
                  </span>
                  <span className="text-right text-xs text-slate-400">({l.count})</span>
                  <div className="flex min-h-6 items-center justify-start">
                    {l.smallSample && <Badge color="amber">Small sample</Badge>}
                    {l.reviewHighRate && <Badge color="rose">Review unusually high rate</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Index Performance */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          <Gauge className="h-4 w-4" /> Index Performance
        </h2>

        {/* Index List */}
        <Card className="mb-4 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Zap className="h-4 w-4 text-slate-400" /> Active Indexes ({indexes.length})
          </h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 text-left">Index Name</th>
                  <th className="px-3 py-2 text-left">Field</th>
                  <th className="px-3 py-2 text-left">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {indexes.map((idx) => (
                  <tr key={idx.name} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-3">
                      <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">{idx.name}</code>
                    </td>
                    <td className="px-3 py-3">
                      <code className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-mono text-emerald-700">{idx.field}</code>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">{idx.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Query Performance Comparison */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Clock className="h-4 w-4 text-slate-400" /> Query Performance: Indexed vs. Full Collection Scan
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Query: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{'{ Locality: "Sector 79" }'}</code> · measured with MongoDB explain executionStats
          </p>

          {insightsError ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              MongoDB performance data is unavailable. Check the Atlas connection and network/DNS settings, then refresh.
            </div>
          ) : indexDemo ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* With Index */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-900">With Index ({indexDemo.indexName})</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-emerald-700">{indexDemo.withIndex.toFixed(2)}ms</p>
                <p className="mt-1 text-xs text-emerald-600">Measured indexed lookup on the Locality field</p>
                <div className="mt-3">
                  <ProgressBar value={indexDemo.withIndex} max={indexDemo.withoutIndex} color="emerald" />
                </div>
              </div>

              {/* Without Index */}
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-rose-600" />
                  <p className="text-sm font-semibold text-rose-900">Without Index (COLSCAN)</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-rose-700">{indexDemo.withoutIndex.toFixed(2)}ms</p>
                <p className="mt-1 text-xs text-rose-600">Full collection scan of {totalDocs?.toLocaleString('en-IN') ?? 'the'} documents</p>
                <div className="mt-3">
                  <ProgressBar value={indexDemo.withoutIndex} max={indexDemo.withoutIndex} color="rose" />
                </div>
              </div>

              {/* Speedup */}
              <div className="sm:col-span-2 flex items-center justify-center rounded-xl bg-slate-900 p-4 text-white">
                <Gauge className="h-5 w-5 text-amber-400" />
                <span className="ml-3 text-sm">
                  Measured explain result: indexed lookup was <span className="font-bold text-amber-400">{indexDemo.speedup.toFixed(1)}x</span> faster in this run
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
              <span className="ml-3 text-sm text-slate-500">Measuring query performance...</span>
            </div>
          )}
        </Card>
      </div>

      {/* Pipeline Explanation */}
      <Card className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <BarChart3 className="h-4 w-4 text-slate-400" /> Aggregation Pipeline Example
        </h3>
        <p className="mt-2 text-xs text-slate-500">The locality chart uses the stored MongoDB field names shown below:</p>
        <div className="mt-3 rounded-xl bg-slate-900 p-4">
          <pre className="overflow-x-auto text-xs leading-relaxed text-slate-300"><code>{`db.properties.aggregate([
  { $group: {
      _id: "$Locality",
      count: { $sum: 1 },
      avgPrice: { $avg: "$Price" },
      avgRate: { $avg: "$Rate per sqft" }
  }},
  { $sort: { count: -1 } },
  { $limit: 15 }
])`}</code></pre>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-xs font-semibold text-blue-900">$group</p>
            <p className="mt-0.5 text-xs text-blue-700">Groups documents by locality field</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-900">$avg / $sum</p>
            <p className="mt-0.5 text-xs text-emerald-700">Calculates average price and counts per group</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">$sort + $limit</p>
            <p className="mt-0.5 text-xs text-amber-700">Orders by count descending, returns top 15</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Helper: Group-by aggregation ────────────────────────────────────────
function aggregateBy(
  properties: Property[],
  getKey: (p: Property) => string,
  priceField: keyof Property,
  rateField: keyof Property,
): AggregationRow[] {
  const map = new Map<string, { count: number; totalPrice: number; totalRate: number }>();
  properties.forEach((p) => {
    const key = getKey(p);
    const e = map.get(key) ?? { count: 0, totalPrice: 0, totalRate: 0 };
    e.count++;
    e.totalPrice += p[priceField] as number;
    e.totalRate += p[rateField] as number;
    map.set(key, e);
  });
  return Array.from(map.entries()).map(([label, d]) => ({
    label,
    count: d.count,
    avgPrice: d.totalPrice / d.count,
    avgRate: d.totalRate / d.count,
  }));
}
