import { useState, useEffect, useRef } from 'react';
import { Brain, TrendingUp, Loader2, Trophy, ArrowRight, BarChart3 } from 'lucide-react';
import type { Property } from '@/types';
import { trainAllModels, encodeInput, buildEncoder, type TrainedModels, type FeatureEncoder } from '@/lib/ml';
import { formatCurrency, formatCurrencyDetailed } from '@/lib/finance';
import { Card, Button, Badge, ProgressBar } from '@/components/ui';

interface PredictionInput {
  locality: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  status: string;
}

export function PricePrediction({ properties }: { properties: Property[] }) {
  const [trained, setTrained] = useState<TrainedModels | null>(null);
  const [encoder, setEncoder] = useState<FeatureEncoder | null>(null);
  const [loading, setLoading] = useState(true);
  const [trainingProgress, setTrainingProgress] = useState('');
  const [input, setInput] = useState<PredictionInput>({
    locality: 'Sector 79',
    area: 1800,
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'Apartment',
    status: 'Under Construction',
  });
  const [predictions, setPredictions] = useState<{ name: string; price: number; metrics: { mae: number; rmse: number; r2: number } }[]>([]);
  const workerRef = useRef<number>(0);

  useEffect(() => {
    if (properties.length === 0) return;

    const worker = workerRef.current;
    setLoading(true);

    const steps = [
      'Building feature encoder...',
      'Splitting train/test data (80/20)...',
      'Training Linear Regression...',
      'Training Decision Tree...',
      'Training Random Forest (30 trees)...',
      'Training Gradient Boosting (50 trees)...',
      'Comparing model accuracy...',
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < steps.length) {
        setTrainingProgress(steps[stepIdx]);
        stepIdx++;
      }
    }, 400);

    // Defer training to next tick so UI can render loading state
    const timeout = setTimeout(() => {
      const enc = buildEncoder(properties);
      setEncoder(enc);
      const result = trainAllModels(properties);
      setTrained(result);
      setLoading(false);
      clearInterval(interval);
    }, 100);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      workerRef.current = worker + 1;
    };
  }, [properties]);

  const handlePredict = () => {
    if (!trained || !encoder) return;
    const features = encodeInput(
      input.area,
      input.bedrooms,
      input.bathrooms,
      input.locality,
      input.propertyType,
      input.status,
      encoder,
    );
    const results = trained.models.map((m) => ({
      name: m.name,
      price: Math.max(0, m.predict(features)),
      metrics: m.metrics,
    }));
    setPredictions(results);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Brain className="h-8 w-8 animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-900">Training ML Models</p>
            <p className="mt-1 text-sm text-slate-500">{trainingProgress || 'Initializing...'}</p>
          </div>
          <div className="w-48">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full animate-pulse rounded-full bg-slate-900" style={{ width: '60%' }} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Training on {properties.length.toLocaleString('en-IN')} properties</p>
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
          <p className="mt-3 text-sm text-slate-500">No data available to train models.</p>
        </Card>
      </div>
    );
  }

  const bestModel = trained.best;
  const sortedModels = [...trained.models].sort((a, b) => b.metrics.r2 - a.metrics.r2);
  const sortedPredictions = [...predictions].sort((a, b) => b.metrics.r2 - a.metrics.r2);
  const maxR2 = Math.max(...trained.models.map((m) => m.metrics.r2), 0.01);
  const maxMAE = Math.max(...trained.models.map((m) => m.metrics.mae), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Price Prediction</h1>
        <p className="mt-1 text-sm text-slate-500">
          ML-powered property price estimation trained on {properties.length.toLocaleString('en-IN')} Gurugram listings
        </p>
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
                onChange={(e) => setInput((p) => ({ ...p, locality: e.target.value }))}
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
                onChange={(e) => setInput((p) => ({ ...p, propertyType: e.target.value }))}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Area (sqft)</label>
              <input
                type="number"
                value={input.area}
                onChange={(e) => setInput((p) => ({ ...p, area: Number(e.target.value) }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bedrooms</label>
                <input
                  type="number"
                  value={input.bedrooms}
                  onChange={(e) => setInput((p) => ({ ...p, bedrooms: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bathrooms</label>
                <input
                  type="number"
                  value={input.bathrooms}
                  onChange={(e) => setInput((p) => ({ ...p, bathrooms: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>
            <Button onClick={handlePredict} className="w-full">
              <Brain className="h-4 w-4" /> Predict Price
            </Button>
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
                  <span>Rate: ₹{Math.round(sortedPredictions[0].price / input.area).toLocaleString('en-IN')}/sqft</span>
                  <span>·</span>
                  <span>Input: {input.bedrooms} BHK, {input.area.toLocaleString('en-IN')} sqft, {input.locality}</span>
                </div>
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
                        <p className="text-xs text-slate-400">±{formatCurrency(p.metrics.mae)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Price range interpretation */}
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-xs font-medium text-blue-900">How to interpret</p>
                <p className="mt-1 text-xs text-blue-700">
                  The predicted price is an estimate based on {properties.length.toLocaleString('en-IN')} Gurugram listings.
                  The ±MAE value shows the typical error range. A property priced well below the prediction may be undervalued;
                  one priced above may be overvalued.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
