import type { Property } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ModelMetrics {
  mae: number;
  rmse: number;
  r2: number;
}

export interface ModelResult {
  name: string;
  metrics: ModelMetrics;
  predict: (features: number[]) => number;
}

export interface TrainedModels {
  models: ModelResult[];
  best: ModelResult;
  featureNames: string[];
  localities: string[];
  propertyTypes: string[];
  statuses: string[];
  priceStats: { min: number; max: number; mean: number; median: number };
}

// ─── Feature Engineering ────────────────────────────────────────────────────

export interface FeatureEncoder {
  localities: string[];
  propertyTypes: string[];
  statuses: string[];
  localityIndex: Map<string, number>;
  typeIndex: Map<string, number>;
  statusIndex: Map<string, number>;
  featureNames: string[];
}

export function buildEncoder(properties: Property[]): FeatureEncoder {
  const localitySet = new Set<string>();
  const typeSet = new Set<string>();
  const statusSet = new Set<string>();

  for (const p of properties) {
    localitySet.add(p.city);
    typeSet.add(p.property_type);
    statusSet.add(p.status);
  }

  const localities = Array.from(localitySet).sort();
  const propertyTypes = Array.from(typeSet).sort();
  const statuses = Array.from(statusSet).sort();

  const localityIndex = new Map(localities.map((l, i) => [l, i]));
  const typeIndex = new Map(propertyTypes.map((t, i) => [t, i]));
  const statusIndex = new Map(statuses.map((s, i) => [s, i]));

  const featureNames = [
    'area', 'bedrooms', 'bathrooms',
    ...localities.map((l) => `loc_${l}`),
    ...propertyTypes.map((t) => `type_${t}`),
    ...statuses.map((s) => `status_${s}`),
  ];

  return { localities, propertyTypes, statuses, localityIndex, typeIndex, statusIndex, featureNames };
}

export function encodeProperty(p: Property, encoder: FeatureEncoder): number[] {
  const features: number[] = [
    p.square_feet,
    p.bedrooms,
    p.bathrooms,
  ];

  // One-hot encode locality
  for (let i = 0; i < encoder.localities.length; i++) {
    features.push(encoder.localityIndex.get(p.city) === i ? 1 : 0);
  }
  // One-hot encode property type
  for (let i = 0; i < encoder.propertyTypes.length; i++) {
    features.push(encoder.typeIndex.get(p.property_type) === i ? 1 : 0);
  }
  // One-hot encode status
  for (let i = 0; i < encoder.statuses.length; i++) {
    features.push(encoder.statusIndex.get(p.status) === i ? 1 : 0);
  }

  return features;
}

export function encodeInput(
  area: number,
  bedrooms: number,
  bathrooms: number,
  locality: string,
  propertyType: string,
  status: string,
  encoder: FeatureEncoder,
): number[] {
  const features: number[] = [area, bedrooms, bathrooms];

  for (let i = 0; i < encoder.localities.length; i++) {
    features.push(encoder.localityIndex.get(locality) === i ? 1 : 0);
  }
  for (let i = 0; i < encoder.propertyTypes.length; i++) {
    features.push(encoder.typeIndex.get(propertyType) === i ? 1 : 0);
  }
  for (let i = 0; i < encoder.statuses.length; i++) {
    features.push(encoder.statusIndex.get(status) === i ? 1 : 0);
  }

  return features;
}

// ─── Train/Test Split ───────────────────────────────────────────────────────

export function trainTestSplit<T>(arr: T[], testRatio: number, seed = 42): { train: T[]; test: T[] } {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const splitIdx = Math.floor(shuffled.length * (1 - testRatio));
  return { train: shuffled.slice(0, splitIdx), test: shuffled.slice(splitIdx) };
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export function computeMetrics(yTrue: number[], yPred: number[]): ModelMetrics {
  const n = yTrue.length;
  if (n === 0) return { mae: 0, rmse: 0, r2: 0 };

  let sumAbsError = 0;
  let sumSqError = 0;
  const meanY = yTrue.reduce((s, y) => s + y, 0) / n;
  let totalSumSq = 0;

  for (let i = 0; i < n; i++) {
    const err = yTrue[i] - yPred[i];
    sumAbsError += Math.abs(err);
    sumSqError += err * err;
    totalSumSq += (yTrue[i] - meanY) ** 2;
  }

  const mae = sumAbsError / n;
  const rmse = Math.sqrt(sumSqError / n);
  const r2 = totalSumSq > 0 ? 1 - sumSqError / totalSumSq : 0;

  return { mae, rmse, r2 };
}

// ─── Linear Regression (Normal Equation) ────────────────────────────────────

function linearRegression(X: number[][], y: number[]): number[] {
  const n = X.length;
  const features = X[0].length;

  // Add bias term
  const Xb = X.map((row) => [1, ...row]);

  // Compute X^T * X
  const XtX: number[][] = Array(features + 1).fill(0).map(() => Array(features + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a <= features; a++) {
      for (let b = 0; b <= features; b++) {
        XtX[a][b] += Xb[i][a] * Xb[i][b];
      }
    }
  }

  // Ridge regularization for numerical stability
  const lambda = 0.01 * n;
  for (let i = 0; i <= features; i++) XtX[i][i] += lambda;

  // Compute X^T * y
  const Xty: number[] = Array(features + 1).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a <= features; a++) {
      Xty[a] += Xb[i][a] * y[i];
    }
  }

  // Solve (XtX + lambda*I) * w = Xty using Gaussian elimination
  const aug: number[][] = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col <= features; col++) {
    // Find pivot
    let maxRow = col;
    for (let r = col + 1; r <= features; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) continue;

    for (let r = 0; r <= features; r++) {
      if (r === col) continue;
      const factor = aug[r][col] / aug[col][col];
      for (let c = col; c <= features + 1; c++) {
        aug[r][c] -= factor * aug[col][c];
      }
    }
  }

  const weights: number[] = Array(features + 1).fill(0);
  for (let i = 0; i <= features; i++) {
    if (Math.abs(aug[i][i]) > 1e-12) {
      weights[i] = aug[i][features + 1] / aug[i][i];
    }
  }

  return weights;
}

function linearPredict(weights: number[], features: number[]): number {
  let result = weights[0]; // bias
  for (let i = 0; i < features.length; i++) {
    result += weights[i + 1] * features[i];
  }
  return result;
}

// ─── Decision Tree ──────────────────────────────────────────────────────────

interface TreeNode {
  isLeaf: boolean;
  value?: number;
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function computeVariance(y: number[]): number {
  if (y.length === 0) return 0;
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  return y.reduce((s, v) => s + (v - mean) ** 2, 0) / y.length;
}

function bestSplit(X: number[][], y: number[], features: number[], minSamples: number): { feature: number; threshold: number; gain: number } | null {
  const parentVariance = computeVariance(y);
  const n = y.length;
  if (n < minSamples * 2) return null;

  let best: { feature: number; threshold: number; gain: number } | null = null;

  for (const feat of features) {
    const values = X.map((row) => row[feat]).sort((a, b) => a - b);
    const uniqueValues = [...new Set(values)];

    for (let i = 0; i < uniqueValues.length - 1; i++) {
      const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;

      const leftY: number[] = [];
      const rightY: number[] = [];

      for (let j = 0; j < n; j++) {
        if (X[j][feat] <= threshold) leftY.push(y[j]);
        else rightY.push(y[j]);
      }

      if (leftY.length < minSamples || rightY.length < minSamples) continue;

      const leftVar = computeVariance(leftY);
      const rightVar = computeVariance(rightY);
      const childVariance = (leftY.length * leftVar + rightY.length * rightVar) / n;
      const gain = parentVariance - childVariance;

      if (!best || gain > best.gain) {
        best = { feature: feat, threshold, gain };
      }
    }
  }

  return best;
}

function buildTree(X: number[][], y: number[], features: number[], maxDepth: number, minSamples: number, depth: number = 0): TreeNode {
  const mean = y.reduce((s, v) => s + v, 0) / y.length;

  if (depth >= maxDepth || y.length < minSamples * 2) {
    return { isLeaf: true, value: mean };
  }

  const split = bestSplit(X, y, features, minSamples);
  if (!split || split.gain <= 0) {
    return { isLeaf: true, value: mean };
  }

  const leftIdx: number[] = [];
  const rightIdx: number[] = [];
  for (let i = 0; i < X.length; i++) {
    if (X[i][split.feature] <= split.threshold) leftIdx.push(i);
    else rightIdx.push(i);
  }

  if (leftIdx.length === 0 || rightIdx.length === 0) {
    return { isLeaf: true, value: mean };
  }

  const leftX = leftIdx.map((i) => X[i]);
  const leftY = leftIdx.map((i) => y[i]);
  const rightX = rightIdx.map((i) => X[i]);
  const rightY = rightIdx.map((i) => y[i]);

  return {
    isLeaf: false,
    feature: split.feature,
    threshold: split.threshold,
    left: buildTree(leftX, leftY, features, maxDepth, minSamples, depth + 1),
    right: buildTree(rightX, rightY, features, maxDepth, minSamples, depth + 1),
  };
}

function treePredict(node: TreeNode, features: number[]): number {
  if (node.isLeaf) return node.value ?? 0;
  if (features[node.feature!] <= node.threshold!) {
    return treePredict(node.left!, features);
  }
  return treePredict(node.right!, features);
}

// ─── Random Forest ──────────────────────────────────────────────────────────

interface RandomForestModel {
  trees: TreeNode[];
}

function buildRandomForest(
  X: number[][],
  y: number[],
  numTrees: number,
  maxDepth: number,
  minSamples: number,
  seed: number,
): RandomForestModel {
  const trees: TreeNode[] = [];
  const n = X.length;
  const numFeatures = X[0].length;
  const sqrtFeatures = Math.max(3, Math.floor(Math.sqrt(numFeatures)));
  let s = seed;

  for (let t = 0; t < numTrees; t++) {
    // Bootstrap sampling
    const sampleX: number[][] = [];
    const sampleY: number[] = [];
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const idx = s % n;
      sampleX.push(X[idx]);
      sampleY.push(y[idx]);
    }

    // Random feature subset
    const allFeatures = Array.from({ length: numFeatures }, (_, i) => i);
    for (let i = allFeatures.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [allFeatures[i], allFeatures[j]] = [allFeatures[j], allFeatures[i]];
    }
    const featureSubset = allFeatures.slice(0, sqrtFeatures);

    trees.push(buildTree(sampleX, sampleY, featureSubset, maxDepth, minSamples));
  }

  return { trees };
}

function randomForestPredict(model: RandomForestModel, features: number[]): number {
  let sum = 0;
  for (const tree of model.trees) {
    sum += treePredict(tree, features);
  }
  return sum / model.trees.length;
}

// ─── Gradient Boosting (simplified) ─────────────────────────────────────────

interface GradientBoostingModel {
  trees: { tree: TreeNode; learningRate: number }[];
  initValue: number;
}

function buildGradientBoosting(
  X: number[][],
  y: number[],
  numTrees: number,
  maxDepth: number,
  minSamples: number,
  learningRate: number,
  seed: number,
): GradientBoostingModel {
  const n = y.length;
  const initValue = y.reduce((s, v) => s + v, 0) / n;

  const trees: { tree: TreeNode; learningRate: number }[] = [];
  const residuals: number[] = new Array(n).fill(0);
  const currentPreds: number[] = new Array(n).fill(initValue);

  for (let i = 0; i < n; i++) residuals[i] = y[i] - currentPreds[i];

  const numFeatures = X[0].length;
  const sqrtFeatures = Math.max(3, Math.floor(Math.sqrt(numFeatures)));
  let s = seed;

  for (let t = 0; t < numTrees; t++) {
    // Sample features
    const allFeatures = Array.from({ length: numFeatures }, (_, i) => i);
    for (let i = allFeatures.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [allFeatures[i], allFeatures[j]] = [allFeatures[j], allFeatures[i]];
    }
    const featureSubset = allFeatures.slice(0, sqrtFeatures);

    // Build tree on residuals
    const tree = buildTree(X, residuals, featureSubset, maxDepth, minSamples);

    trees.push({ tree, learningRate });

    // Update predictions and residuals
    for (let i = 0; i < n; i++) {
      const pred = treePredict(tree, X[i]);
      currentPreds[i] += learningRate * pred;
      residuals[i] = y[i] - currentPreds[i];
    }
  }

  return { trees, initValue };
}

function gradientBoostingPredict(model: GradientBoostingModel, features: number[]): number {
  let pred = model.initValue;
  for (const { tree, learningRate } of model.trees) {
    pred += learningRate * treePredict(tree, features);
  }
  return pred;
}

// ─── Train All Models ───────────────────────────────────────────────────────

export function trainAllModels(properties: Property[]): TrainedModels {
  const encoder = buildEncoder(properties);
  const { train, test } = trainTestSplit(properties, 0.2, 42);

  const XTrain = train.map((p) => encodeProperty(p, encoder));
  const yTrain = train.map((p) => p.price);
  const XTest = test.map((p) => encodeProperty(p, encoder));
  const yTest = test.map((p) => p.price);

  const prices = properties.map((p) => p.price).sort((a, b) => a - b);
  const priceStats = {
    min: prices[0],
    max: prices[prices.length - 1],
    mean: prices.reduce((s, p) => s + p, 0) / prices.length,
    median: prices[Math.floor(prices.length / 2)],
  };

  const models: ModelResult[] = [];

  // 1. Linear Regression
  const lrWeights = linearRegression(XTrain, yTrain);
  const lrPreds = XTest.map((x) => linearPredict(lrWeights, x));
  const lrMetrics = computeMetrics(yTest, lrPreds);
  models.push({
    name: 'Linear Regression',
    metrics: lrMetrics,
    predict: (features: number[]) => linearPredict(lrWeights, features),
  });

  // 2. Decision Tree
  const allFeatures = Array.from({ length: XTrain[0].length }, (_, i) => i);
  const dtTree = buildTree(XTrain, yTrain, allFeatures, 8, 5);
  const dtPreds = XTest.map((x) => treePredict(dtTree, x));
  const dtMetrics = computeMetrics(yTest, dtPreds);
  models.push({
    name: 'Decision Tree',
    metrics: dtMetrics,
    predict: (features: number[]) => treePredict(dtTree, features),
  });

  // 3. Random Forest
  const rfModel = buildRandomForest(XTrain, yTrain, 30, 10, 3, 100);
  const rfPreds = XTest.map((x) => randomForestPredict(rfModel, x));
  const rfMetrics = computeMetrics(yTest, rfPreds);
  models.push({
    name: 'Random Forest',
    metrics: rfMetrics,
    predict: (features: number[]) => randomForestPredict(rfModel, features),
  });

  // 4. Gradient Boosting
  const gbModel = buildGradientBoosting(XTrain, yTrain, 50, 5, 3, 0.1, 200);
  const gbPreds = XTest.map((x) => gradientBoostingPredict(gbModel, x));
  const gbMetrics = computeMetrics(yTest, gbPreds);
  models.push({
    name: 'Gradient Boosting',
    metrics: gbMetrics,
    predict: (features: number[]) => gradientBoostingPredict(gbModel, features),
  });

  // Pick best by R²
  const best = models.reduce((b, m) => (m.metrics.r2 > b.metrics.r2 ? m : b), models[0]);

  return {
    models,
    best,
    featureNames: encoder.featureNames,
    localities: encoder.localities,
    propertyTypes: encoder.propertyTypes,
    statuses: encoder.statuses,
    priceStats,
  };
}
