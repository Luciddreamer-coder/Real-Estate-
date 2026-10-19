export type PropertyType = 'Apartment' | 'Floor' | 'Plot' | 'Villa' | 'House' | 'Penthouse' | 'Studio';

export type PropertyStatus =
  | 'Ready to move'
  | 'Under Construction'
  | 'New'
  | 'Resale';

export interface Property {
  id: string;
  address: string;       // Property Type description (e.g. "3 BHK Apartment in M3M Antalya Hills")
  city: string;          // Locality / Sector
  state: string;         // Builder Name
  zip: string;           // Company Name
  property_type: PropertyType;
  status: PropertyStatus;
  price: number;         // in INR
  bedrooms: number;      // BHK count
  bathrooms: number;     // same as bedrooms for now
  square_feet: number;   // Area
  lot_size: number;      // 0
  year_built: number;    // 0 if unknown
  monthly_rent: number;  // estimated rental yield
  property_tax_annual: number;
  insurance_annual: number;
  hoa_monthly: number;
  vacancy_rate: number;
  maintenance_rate: number;
  management_rate: number;
  down_payment_pct: number;
  interest_rate: number;
  loan_term_years: number;
  closing_costs: number;
  rehab_cost: number;
  notes: string;
  created_at: string;
  // Extra fields for Indian real estate
  rate_per_sqft: number;
  rera_approved: boolean;
  society: string;
}

export interface InvestmentMetrics {
  monthlyPayment: number;
  totalMonthlyExpenses: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  cashOnCashReturn: number;
  capRate: number;
  onePercentRule: boolean;
  totalInvestment: number;
  noi: number;
  grossRentMultiplier: number;
  debtCoverageRatio: number;
  ltv: number;
  breakEvenRatio: number;
  monthlyIncome: number;
  monthlyDebtService: number;
  monthlyPrincipalInterest: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyMaintenance: number;
  monthlyManagement: number;
  monthlyVacancyLoss: number;
}

export interface PortfolioSummary {
  totalProperties: number;
  totalValue: number;
  totalInvested: number;
  totalMonthlyCashFlow: number;
  totalAnnualCashFlow: number;
  avgCashOnCash: number;
  avgCapRate: number;
  totalMonthlyRent: number;
  totalSqft: number;
  totalUnits: number;
}

export type ViewName = 'dashboard' | 'properties' | 'analytics' | 'prediction' | 'insights' | 'detail';
