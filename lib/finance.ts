import type { Property, InvestmentMetrics, PortfolioSummary } from '@/types';

export function calculateMortgagePayment(
  principal: number,
  annualRatePct: number,
  years: number
): number {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export function calculateMetrics(p: Property): InvestmentMetrics {
  const loanAmount = p.price * (1 - p.down_payment_pct / 100);
  const downPayment = p.price * (p.down_payment_pct / 100);
  const monthlyPI = calculateMortgagePayment(loanAmount, p.interest_rate, p.loan_term_years);

  const monthlyTaxes = p.property_tax_annual / 12;
  const monthlyInsurance = p.insurance_annual / 12;
  const monthlyVacancyLoss = p.monthly_rent * (p.vacancy_rate / 100);
  const monthlyMaintenance = p.monthly_rent * (p.maintenance_rate / 100);
  const monthlyManagement = p.monthly_rent * (p.management_rate / 100);

  const effectiveMonthlyIncome = p.monthly_rent - monthlyVacancyLoss;
  const monthlyExpenses =
    monthlyTaxes + monthlyInsurance + p.hoa_monthly + monthlyMaintenance + monthlyManagement;

  const monthlyCashFlow = effectiveMonthlyIncome - monthlyExpenses - monthlyPI;
  const annualCashFlow = monthlyCashFlow * 12;

  const totalInvestment = downPayment + p.closing_costs + p.rehab_cost;
  const cashOnCashReturn = totalInvestment > 0 ? (annualCashFlow / totalInvestment) * 100 : 0;

  const noi = (effectiveMonthlyIncome - monthlyExpenses) * 12;
  const capRate = p.price > 0 ? (noi / p.price) * 100 : 0;

  const onePercentRule = p.monthly_rent >= p.price * 0.01;

  const grm = p.monthly_rent > 0 ? p.price / (p.monthly_rent * 12) : 0;

  const debtCoverageRatio = monthlyPI > 0 ? noi / (monthlyPI * 12) : 0;

  const ltv = p.price > 0 ? (loanAmount / p.price) * 100 : 0;

  const breakEvenRatio =
    p.monthly_rent > 0
      ? ((monthlyExpenses + monthlyPI) / p.monthly_rent) * 100
      : 0;

  return {
    monthlyPayment: monthlyPI,
    monthlyPrincipalInterest: monthlyPI,
    totalMonthlyExpenses: monthlyExpenses + monthlyPI,
    monthlyCashFlow,
    annualCashFlow,
    cashOnCashReturn,
    capRate,
    onePercentRule,
    totalInvestment,
    noi,
    grossRentMultiplier: grm,
    debtCoverageRatio,
    ltv,
    breakEvenRatio,
    monthlyIncome: effectiveMonthlyIncome,
    monthlyDebtService: monthlyPI,
    monthlyTaxes,
    monthlyInsurance,
    monthlyHoa: p.hoa_monthly,
    monthlyMaintenance,
    monthlyManagement,
    monthlyVacancyLoss,
  };
}

export function calculatePortfolioSummary(properties: Property[]): PortfolioSummary {
  if (properties.length === 0) {
    return {
      totalProperties: 0, totalValue: 0, totalInvested: 0, totalMonthlyCashFlow: 0,
      totalAnnualCashFlow: 0, avgCashOnCash: 0, avgCapRate: 0, totalMonthlyRent: 0,
      totalSqft: 0, totalUnits: 0,
    };
  }

  let totalValue = 0;
  let totalInvested = 0;
  let totalMonthlyCashFlow = 0;
  let totalCashOnCash = 0;
  let totalCapRate = 0;
  let totalMonthlyRent = 0;
  let totalSqft = 0;
  let totalUnits = 0;

  for (const p of properties) {
    const m = calculateMetrics(p);
    totalValue += p.price;
    totalInvested += m.totalInvestment;
    totalMonthlyCashFlow += m.monthlyCashFlow;
    totalCashOnCash += m.cashOnCashReturn;
    totalCapRate += m.capRate;
    totalMonthlyRent += p.monthly_rent;
    totalSqft += p.square_feet;
    totalUnits += p.bedrooms;
  }

  return {
    totalProperties: properties.length,
    totalValue,
    totalInvested,
    totalMonthlyCashFlow,
    totalAnnualCashFlow: totalMonthlyCashFlow * 12,
    avgCashOnCash: totalCashOnCash / properties.length,
    avgCapRate: totalCapRate / properties.length,
    totalMonthlyRent,
    totalSqft,
    totalUnits,
  };
}

export function formatCurrency(n: number): string {
  if (Math.abs(n) >= 10000000) {
    return `₹${(n / 10000000).toFixed(2)} Cr`;
  }
  if (Math.abs(n) >= 100000) {
    return `₹${(n / 100000).toFixed(2)} L`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatCurrencyDetailed(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}
