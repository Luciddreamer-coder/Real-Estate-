import { useState, useEffect } from 'react';
import { Brain, TrendingUp, Loader2, Trophy, ArrowRight, BarChart3 } from 'lucide-react';
import type { Property } from '@/types';
import { buildEncoder, type TrainedModels, type FeatureEncoder } from '@/lib/ml';
import { formatCurrency, formatCurrencyDetailed } from '@/lib/finance';
import { Card, Button, Badge, ProgressBar } from '@/components/ui';

interface PredictionInput {
  locality: string;
  area: string;
  bhk: number;
  propertyType: string;
  status: string;
  reraApproval: string;
  society: string;
  builder: string;
}

interface ModelInputDiagnostics {
  unknown_categories?: string[];
  category_presence?: Record<string, boolean>;
  feature_order?: string[];
}

export function PricePrediction({ properties, refreshKey = 0 }: { properties: Property[]; refreshKey?: number }) {
  const [trained, setTrained] = useState<TrainedModels | null>(null);
  const [encoder, setEncoder] = useState<FeatureEncoder | null>(null);
  const [loading, setLoading] = useState(true);
  const [trainingProgress, setTrainingProgress] = useState('');
  const [error, setError] = useState('');
  const [input, setInput] = useState<PredictionInput>({
    locality: 'Sector 79',
    area: '1800',
    bhk: 3,
    propertyType: 'Apartment',
    status: 'Under Construction',
    reraApproval: 'Approved by RERA',
    society: '',
    builder: '',
  });
  const [predictions, setPredictions] = useState<{ name: string; price: number; metrics: { mae: number; rmse: number; r2: number } }[]>([]);
  const [fallbackNotice, setFallbackNotice] = useState('');
  const [coverageWarning, setCoverageWarning] = useState('');
  const [modelInputWarning, setModelInputWarning] = useState('');
  const [liveSocieties, setLiveSocieties] = useState<string[]>([]);
  const [liveBuilders, setLiveBuilders] = useState<string[]>([]);

  useEffect(() => {
    if (properties.length === 0) return;

    let cancelled = false;
    const loadModelInfo = async () => {
      setLoading(true);
      setTrainingProgress('Loading verified held-out evaluation...');
      const enc = buildEncoder(properties);
      try {
        const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000').replace(/\/$/, '')}/api/model-metrics`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Model evaluation is unavailable');
        if (cancelled) return;
        const baseline = body.models?.baseline;
        if (!baseline?.metrics) throw new Error('Baseline evaluation metrics are missing');
        const model = { name: 'Random Forest Regressor', metrics: baseline.metrics, predict: () => 0 };
        const reduced = body.models?.without_context;
        const logPrice = body.models?.log_price;
        const comparisonModels = reduced?.metrics
          ? [
            model,
            { name: 'Random Forest (without Society/Builder)', metrics: reduced.metrics, predict: () => 0 },
            ...(logPrice?.metrics ? [{ name: 'Random Forest (log price)', metrics: logPrice.metrics, predict: () => 0 }] : []),
          ]
          : [model, ...(logPrice?.metrics ? [{ name: 'Random Forest (log price)', metrics: logPrice.metrics, predict: () => 0 }] : [])];
        setEncoder(enc);
        setTrained({ models: comparisonModels, best: model, featureNames: baseline.features ?? [], localities: enc.localities, propertyTypes: enc.propertyTypes, statuses: enc.statuses, priceStats: { min: 0, max: 0, mean: 0, median: 0 } });
        setError('');
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Model evaluation is unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadModelInfo();
    return () => { cancelled = true; };
  }, [properties]);

  // A warning belongs to the input combination that produced the last result.
  // Clear it when those inputs change so an old warning cannot be mistaken for
  // the newly selected locality/type/BHK combination.
  useEffect(() => {
    setPredictions([]);
    setFallbackNotice('');
    setCoverageWarning('');
    setModelInputWarning('');
  }, [input.locality, input.propertyType, input.status, input.reraApproval, input.area, input.bhk, input.society, input.builder]);

  useEffect(() => {
    if (!input.locality) return;
    let cancelled = false;
    const apiBase = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000').replace(/\/$/, '');
    fetch(`${apiBase}/api/prediction-options?locality=${encodeURIComponent(input.locality)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Prediction options unavailable');
        if (!cancelled) {
          setLiveSocieties(Array.from(new Set([
            ...(Array.isArray(body.societies) ? body.societies : []),
            ...(Array.isArray(body.all_societies) ? body.all_societies : []),
          ])));
          setLiveBuilders(Array.from(new Set([
            ...(Array.isArray(body.builders) ? body.builders : []),
            ...(Array.isArray(body.all_builders) ? body.all_builders : []),
          ])));
        }
      })
      .catch(() => {
        // Keep the page usable if MongoDB is temporarily unavailable.
        if (!cancelled) {
          setLiveSocieties([]);
          setLiveBuilders([]);
        }
      });
    return () => { cancelled = true; };
  }, [input.locality, refreshKey]);

  const handlePredict = async () => {
    if (!trained || !encoder) return;
    const area = Number(input.area);
    if (!input.area.trim() || !Number.isFinite(area) || area <= 0) {
      setError('Area must be greater than 0 sqft.');
      return;
    }
    setError('');
    try {
      const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000').replace(/\/$/, '')}/api/predict`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Area: area, BHK_Model: input.bhk, Locality: input.locality, Status: input.status,
          'RERA Approval': input.reraApproval,
          Model_Flat_Type: input.propertyType,
          ...(input.society ? { Society: input.society } : {}),
          ...(input.builder ? { 'Builder Name': input.builder } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Prediction failed');
      setPredictions([{ name: 'Random Forest Regressor', price: body.predicted_price, metrics: trained.best.metrics }]);
      setFallbackNotice(body.fallback_notice ?? '');
      setCoverageWarning(body.coverage_warning ?? '');
      const inputDiagnostics = body.model_input_diagnostics as ModelInputDiagnostics | undefined;
      const unknownCategories = inputDiagnostics?.unknown_categories ?? [];
      setModelInputWarning(body.model_input_warning ?? (unknownCategories.length > 0
        ? `The selected ${unknownCategories.join(' and ')} value is not represented in the saved model's training categories. The prediction uses broader model patterns.`
        : ''));
    } catch (predictionError) {
      setError(predictionError instanceof Error ? predictionError.message : 'Prediction failed');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Brain className="h-8 w-8 animate-pulse" />
          </div>
          <div className="text-center">
          <p className="text-sm font-semibold text-slate-900">Loading ML Model</p>
            <p className="mt-1 text-sm text-slate-500">{trainingProgress || 'Initializing...'}</p>
          </div>
          <div className="w-48">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full animate-pulse rounded-full bg-slate-900" style={{ width: '60%' }} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Using the saved Random Forest pipeline</p>
        </div>
      </div>
    );
  }

  if (!trained || !encoder) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Price Prediction</h1>
        <Card className="p-8 text-center">
          <Brain className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No data available for prediction.</p>
        </Card>
      </div>
    );
  }

  const bestModel = trained.best;
  const sortedModels = [...trained.models].sort((a, b) => b.metrics.r2 - a.metrics.r2);
  const sortedPredictions = [...predictions].sort((a, b) => b.metrics.r2 - a.metrics.r2);
  const maxR2 = Math.max(...trained.models.map((m) => m.metrics.r2), 0.01);
  const maxMAE = Math.max(...trained.models.map((m) => m.metrics.mae), 1);
  const localityProperties = properties.filter((property) => property.city === input.locality);
  const cachedSocieties = Array.from(new Set(localityProperties.map((property) => property.society.trim()).filter(Boolean))).sort();
  const cachedBuilders = Array.from(new Set(localityProperties.map((property) => property.state.trim()).filter(Boolean))).sort();
  const societyOptions = Array.from(new Set([...liveSocieties, ...cachedSocieties])).sort();
  const builderOptions = Array.from(new Set([...liveBuilders, ...cachedBuilders])).sort();
  const isPlot = input.propertyType.toLowerCase() === 'plot';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Price Prediction</h1>
        <p className="mt-1 text-sm text-slate-500">
          ML-powered property price estimation trained on {properties.length.toLocaleString('en-IN')} Gurugram listings
        </p>
        <p className="mt-1 text-xs text-slate-400">Metrics shown below come from a reproducible 80/20 held-out evaluation (random state 42).</p>
      </div>

      {/* Best Model Badge */}
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-5 text-white">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
          <Trophy className="h-6 w-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-300">Best Performing Model</p>
          <p className="text-lg font-bold">{bestModel.name}</p>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <p className="text-xs text-slate-300">R² Score</p>
            <p className="text-lg font-bold">{(bestModel.metrics.r2 * 100).toFixed(1)}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-300">MAE</p>
            <p className="text-lg font-bold">{formatCurrency(bestModel.metrics.mae)}</p>
          </div>
        </div>
      </div>

      {/* Model Comparison Table */}
      <Card className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <BarChart3 className="h-4 w-4 text-slate-400" /> Model Comparison
        </h3>
        <p className="mt-1 text-xs text-slate-400">Lower MAE/RMSE is better. Higher R² is better.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Model</th>
                <th className="px-3 py-2 text-right">MAE</th>
                <th className="px-3 py-2 text-right">RMSE</th>
                <th className="px-3 py-2 text-right">R² Score</th>
                <th className="px-3 py-2 text-left" style={{ width: '200px' }}>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((m) => (
                <tr key={m.name} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-3 text-sm font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      {m.name === bestModel.name && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                      {m.name}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{formatCurrency(m.metrics.mae)}</td>
                  <td className="px-3 py-3 text-right text-sm text-slate-700">{formatCurrency(m.metrics.rmse)}</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-slate-900">{(m.metrics.r2 * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3">
                    <ProgressBar value={Math.max(0, m.metrics.r2) * 100} max={maxR2 * 100} color={m.name === bestModel.name ? 'emerald' : 'blue'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-slate-500">MAE</p>
            <p className="mt-0.5 text-slate-600">Mean Absolute Error — average prediction error in rupees</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-slate-500">RMSE</p>
            <p className="mt-0.5 text-slate-600">Root Mean Square Error — penalizes large errors more heavily</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-slate-500">R²</p>
            <p className="mt-0.5 text-slate-600">How much price variation the model explains (0-100%)</p>
          </div>
        </div>
      </Card>

      {/* Prediction Form */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <TrendingUp className="h-4 w-4 text-slate-400" /> Enter Property Details
          </h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Locality / Sector</label>
              <select
                value={input.locality}
                onChange={(e) => setInput((p) => ({ ...p, locality: e.target.value, society: '', builder: '' }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              >
                {encoder.localities.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Property Type</label>
              <select
                value={input.propertyType}
                onChange={(e) => setInput((p) => ({ ...p, propertyType: e.target.value, ...(e.target.value.toLowerCase() === 'plot' ? { bhk: 1 } : {}) }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              >
                {encoder.propertyTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={input.status}
                onChange={(e) => setInput((p) => ({ ...p, status: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              >
                {encoder.statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">RERA Approval</label>
              <select
                value={input.reraApproval}
                onChange={(e) => setInput((p) => ({ ...p, reraApproval: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="Approved by RERA">Approved by RERA</option>
                <option value="Not approved by RERA">Not approved by RERA</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Society <span className="font-normal text-slate-400">(optional)</span></label>
              <select
                value={input.society}
                onChange={(e) => setInput((p) => ({ ...p, society: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="">Use training-data fallback</option>
                {societyOptions.map((society) => <option key={society} value={society}>{society}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Builder <span className="font-normal text-slate-400">(optional)</span></label>
              <select
                value={input.builder}
                onChange={(e) => setInput((p) => ({ ...p, builder: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="">Use training-data fallback</option>
                {builderOptions.map((builder) => <option key={builder} value={builder}>{builder}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Area (sqft)</label>
              <input
                type="number"
                min="0"
                max="100000"
                step="1"
                value={input.area}
                onChange={(e) => setInput((p) => ({ ...p, area: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
            {!isPlot && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">BHK Count</label>
                <select
                  value={input.bhk}
                  onChange={(e) => setInput((p) => ({ ...p, bhk: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                >
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} BHK</option>)}
                </select>
              </div>
            )}
            <Button onClick={handlePredict} className="w-full">
              <Brain className="h-4 w-4" /> Predict Price
            </Button>
          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
          </div>
        </Card>

        {/* Prediction Results */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Prediction Results</h3>
          {predictions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Brain className="h-10 w-10 text-slate-200" />
              <p className="mt-3 text-sm text-slate-500">Enter property details and click "Predict Price" to see estimated values from all models.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Best prediction highlighted */}
              <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Estimated Price ({sortedPredictions[0].name})</p>
                    <p className="mt-1 text-3xl font-bold text-slate-900">{formatCurrencyDetailed(sortedPredictions[0].price)}</p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-white">
                    <Trophy className="h-7 w-7 text-amber-400" />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <span>Estimated rate: ₹{Math.round(sortedPredictions[0].price / Number(input.area)).toLocaleString('en-IN')}/sqft</span>
                  <span>·</span>
                  <span>Input: {!isPlot && `${input.bhk} BHK, `}{Number(input.area).toLocaleString('en-IN')} sqft, {input.locality}</span>
                </div>
                {fallbackNotice && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{fallbackNotice}</p>}
                {modelInputWarning && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{modelInputWarning}</p>}
                {coverageWarning && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{coverageWarning}</p>}
              </div>

              {/* All model predictions */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">All Model Predictions</p>
                {sortedPredictions.map((p) => {
                  const isBest = p.name === sortedPredictions[0].name;
                  const maxPrice = Math.max(...sortedPredictions.map((x) => x.price), 1);
                  return (
                    <div key={p.name} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                      <div className="w-40">
                        <p className="text-sm font-medium text-slate-900">{p.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Badge color={isBest ? 'emerald' : 'slate'}>R² {(p.metrics.r2 * 100).toFixed(0)}%</Badge>
                        </div>
                      </div>
                      <div className="flex-1">
                        <ProgressBar value={p.price} max={maxPrice} color={isBest ? 'emerald' : 'blue'} />
                      </div>
                      <div className="w-32 text-right">
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(p.price)}</p>
                        <p className="text-xs text-slate-400">Test MAE: {formatCurrency(p.metrics.mae)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Evaluation interpretation */}
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-xs font-medium text-blue-900">How to interpret</p>
                <p className="mt-1 text-xs text-blue-700">
                  The predicted price is an estimate based on {properties.length.toLocaleString('en-IN')} Gurugram listings.
                  Test MAE is an average evaluation metric, not a guaranteed confidence interval for this individual property.
                  Estimates may be less reliable for rare localities or unusual luxury properties.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
