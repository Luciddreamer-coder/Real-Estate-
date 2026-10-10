import { useState } from 'react';
import { Calculator, IndianRupee } from 'lucide-react';
import { calculateMortgagePayment, formatCurrency, formatCurrencyDetailed } from '@/lib/finance';
import { Card, Input } from '@/components/ui';

export function MortgageCalculator() {
  const [price, setPrice] = useState(5000000);
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(8.5);
  const [term, setTerm] = useState(20);

  const downPayment = price * (downPct / 100);
  const loanAmount = price - downPayment;
  const monthlyPayment = calculateMortgagePayment(loanAmount, rate, term);
  const totalPaid = monthlyPayment * term * 12;
  const totalInterest = totalPaid - loanAmount;

  let balance = loanAmount;
  const yearlyData: { year: number; interest: number; principal: number; balance: number }[] = [];
  for (let y = 1; y <= term; y++) {
    let yearInterest = 0;
    let yearPrincipal = 0;
    for (let mo = 0; mo < 12; mo++) {
      const r = rate / 100 / 12;
      const interestPayment = balance * r;
      const principalPayment = monthlyPayment - interestPayment;
      yearInterest += interestPayment;
      yearPrincipal += principalPayment;
      balance -= principalPayment;
    }
    yearlyData.push({ year: y, interest: yearInterest, principal: yearPrincipal, balance: Math.max(0, balance) });
  }

  const maxYearlyPayment = Math.max(...yearlyData.map((d) => d.interest + d.principal), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mortgage Calculator</h1>
        <p className="mt-1 text-sm text-slate-500">Calculate monthly payments and view an amortization schedule</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Loan Details</h3>
          <Input label="Property Price" type="number" prefix="₹" value={price} onChange={(v) => setPrice(Number(v))} />
          <Input label="Down Payment" type="number" suffix="%" value={downPct} onChange={(v) => setDownPct(Number(v))} />
          <Input label="Interest Rate" type="number" suffix="%" value={rate} onChange={(v) => setRate(Number(v))} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Loan Term</label>
            <div className="flex gap-2">
              {[10, 15, 20, 30].map((t) => (
                <button
                  key={t}
                  onClick={() => setTerm(t)}
                  className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
                    term === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t} yr
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-sm font-medium text-slate-500">Monthly Payment</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrencyDetailed(monthlyPayment)}</p>
              <p className="mt-1 text-xs text-slate-400">Principal & Interest</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-medium text-slate-500">Down Payment</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(downPayment)}</p>
              <p className="mt-1 text-xs text-slate-400">{formatCurrency(loanAmount)} financed</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-medium text-slate-500">Total Interest</p>
              <p className="mt-1 text-2xl font-bold text-rose-600">{formatCurrency(totalInterest)}</p>
              <p className="mt-1 text-xs text-slate-400">Over {term} years</p>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900">Amortization Schedule</h3>
            <p className="mt-1 text-xs text-slate-400">Yearly breakdown of principal vs. interest payments</p>
            <div className="mt-4 space-y-1.5 max-h-96 overflow-y-auto pr-2">
              {yearlyData.map((d) => (
                <div key={d.year} className="flex items-center gap-3">
                  <span className="w-8 text-xs font-medium text-slate-400">Y{d.year}</span>
                  <div className="flex flex-1 gap-px h-6 rounded-lg overflow-hidden bg-slate-100">
                    <div className="bg-blue-400 transition-all" style={{ width: `${(d.principal / maxYearlyPayment) * 50}%` }} title={`Principal: ${formatCurrency(d.principal)}`} />
                    <div className="bg-rose-300 transition-all" style={{ width: `${(d.interest / maxYearlyPayment) * 50}%` }} title={`Interest: ${formatCurrency(d.interest)}`} />
                  </div>
                  <span className="w-24 text-right text-xs text-slate-500">{formatCurrency(d.balance)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-blue-400" /> Principal</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-300" /> Interest</span>
              <span className="flex items-center gap-1.5"><IndianRupee className="h-3 w-3" /> Remaining Balance</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
