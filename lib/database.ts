import { PGlite } from '@electric-sql/pglite';
import type { Property } from '@/types';

let dbInstance: PGlite | null = null;
let csvLoaded = false;

export async function getDb(): Promise<PGlite> {
  if (dbInstance) return dbInstance;

  dbInstance = new PGlite('idb://gurugram-analyzer');
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT NOT NULL,
      property_type TEXT NOT NULL,
      status TEXT NOT NULL,
      price REAL NOT NULL,
      bedrooms INTEGER NOT NULL,
      bathrooms REAL NOT NULL,
      square_feet INTEGER NOT NULL,
      lot_size REAL NOT NULL,
      year_built INTEGER NOT NULL,
      monthly_rent REAL NOT NULL,
      property_tax_annual REAL NOT NULL,
      insurance_annual REAL NOT NULL,
      hoa_monthly REAL NOT NULL,
      vacancy_rate REAL NOT NULL,
      maintenance_rate REAL NOT NULL,
      management_rate REAL NOT NULL,
      down_payment_pct REAL NOT NULL,
      interest_rate REAL NOT NULL,
      loan_term_years INTEGER NOT NULL,
      closing_costs REAL NOT NULL,
      rehab_cost REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      rate_per_sqft REAL NOT NULL DEFAULT 0,
      rera_approved INTEGER NOT NULL DEFAULT 0,
      society TEXT NOT NULL DEFAULT ''
    );
  `);
  return dbInstance;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseNumber(s: string): number {
  const cleaned = s.replace(/"/g, '').replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function mapPropertyType(flatType: string): Property['property_type'] {
  const t = flatType.toLowerCase();
  if (t.includes('apartment')) return 'Apartment';
  if (t.includes('floor')) return 'Floor';
  if (t.includes('plot')) return 'Plot';
  if (t.includes('villa')) return 'Villa';
  if (t.includes('house')) return 'House';
  if (t.includes('studio')) return 'Studio';
  return 'Apartment';
}

function mapStatus(status: string): Property['status'] {
  const s = status.toLowerCase();
  if (s.includes('ready')) return 'Ready to move';
  if (s.includes('under') || s.includes('construction')) return 'Under Construction';
  if (s.includes('resale')) return 'Resale';
  if (s.includes('new')) return 'New';
  return 'Ready to move';
}

function csvRowToProperty(row: string[], index: number): Property | null {
  if (row.length < 12) return null;
  const [
    priceStr, status, areaStr, rateStr, propType, locality,
    builder, rera, bhkStr, society, company, flatType,
  ] = row;

  const price = parseNumber(priceStr);
  const area = parseNumber(areaStr);
  const bhk = parseNumber(bhkStr);
  const ratePerSqft = parseNumber(rateStr);

  if (price <= 0 || area <= 0) return null;

  // Estimate monthly rent at ~2.5% gross rental yield annually
  const monthlyRent = Math.round((price * 0.025) / 12);
  const propertyTax = Math.round(price * 0.001); // 0.1% of price annually
  const insurance = Math.round(price * 0.0005); // 0.05% of price annually
  const hoa = flatType.toLowerCase().includes('apartment') ? 2000 : 0;

  return {
    id: `csv-${index}`,
    address: propType || 'Unknown',
    city: locality || 'Gurugram',
    state: builder || 'Unknown Builder',
    zip: company || '',
    property_type: mapPropertyType(flatType),
    status: mapStatus(status),
    price,
    bedrooms: bhk,
    bathrooms: bhk,
    square_feet: area,
    lot_size: 0,
    year_built: 0,
    monthly_rent: monthlyRent,
    property_tax_annual: propertyTax,
    insurance_annual: insurance,
    hoa_monthly: hoa,
    vacancy_rate: 5,
    maintenance_rate: 5,
    management_rate: 8,
    down_payment_pct: 20,
    interest_rate: 8.5, // typical Indian home loan rate
    loan_term_years: 20,
    closing_costs: Math.round(price * 0.02),
    rehab_cost: 0,
    notes: rera.includes('Approved') ? 'RERA Approved' : 'Not RERA Approved',
    created_at: new Date().toISOString(),
    rate_per_sqft: ratePerSqft,
    rera_approved: rera.includes('Approved'),
    society: society.trim(),
  };
}

export async function loadCsvData(): Promise<void> {
  if (csvLoaded) return;
  const db = await getDb();

  // Check if data already loaded
  const countResult = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM properties');
  const count = (countResult.rows as unknown as { count: number }[])[0]?.count ?? 0;
  if (count > 0) {
    csvLoaded = true;
    return;
  }

  // Fetch CSV from public folder
  const response = await fetch('/gurugram_data.csv');
  if (!response.ok) {
    csvLoaded = true; // mark as loaded so we don't keep retrying
    return;
  }
  const text = await response.text();
  const lines = text.split('\n').filter((l) => l.trim());

  // Skip header (line 0)
  let inserted = 0;
  const batchSize = 500;
  const batch: Property[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const prop = csvRowToProperty(row, i);
    if (prop) {
      batch.push(prop);
      inserted++;
    }

    if (batch.length >= batchSize) {
      await insertBatch(db, batch);
      batch.length = 0;
    }
  }
  if (batch.length > 0) {
    await insertBatch(db, batch);
  }

  csvLoaded = true;
}

async function insertBatch(db: PGlite, batch: Property[]): Promise<void> {
  for (const p of batch) {
    await db.query(
      `INSERT INTO properties (id, address, city, state, zip, property_type, status, price,
        bedrooms, bathrooms, square_feet, lot_size, year_built, monthly_rent,
        property_tax_annual, insurance_annual, hoa_monthly, vacancy_rate,
        maintenance_rate, management_rate, down_payment_pct, interest_rate,
        loan_term_years, closing_costs, rehab_cost, notes, created_at,
        rate_per_sqft, rera_approved, society)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      ON CONFLICT (id) DO NOTHING`,
      [
        p.id, p.address, p.city, p.state, p.zip, p.property_type, p.status, p.price,
        p.bedrooms, p.bathrooms, p.square_feet, p.lot_size, p.year_built, p.monthly_rent,
        p.property_tax_annual, p.insurance_annual, p.hoa_monthly, p.vacancy_rate,
        p.maintenance_rate, p.management_rate, p.down_payment_pct, p.interest_rate,
        p.loan_term_years, p.closing_costs, p.rehab_cost, p.notes, p.created_at,
        p.rate_per_sqft, p.rera_approved ? 1 : 0, p.society,
      ]
    );
  }
}

export async function getAllProperties(offset = 0, limit = 10000): Promise<Property[]> {
  const db = await getDb();
  const result = await db.query<Property>(
    `SELECT * FROM properties ORDER BY price DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows as unknown as Property[];
}

export async function getPropertyCount(): Promise<number> {
  const db = await getDb();
  const result = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM properties');
  return (result.rows as unknown as { count: number }[])[0]?.count ?? 0;
}

export async function getProperty(id: string): Promise<Property | null> {
  const db = await getDb();
  const result = await db.query<Property>(`SELECT * FROM properties WHERE id = $1`, [id]);
  return (result.rows as unknown as Property[])[0] ?? null;
}

export async function saveProperty(p: Property): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO properties (id, address, city, state, zip, property_type, status, price,
      bedrooms, bathrooms, square_feet, lot_size, year_built, monthly_rent,
      property_tax_annual, insurance_annual, hoa_monthly, vacancy_rate,
      maintenance_rate, management_rate, down_payment_pct, interest_rate,
      loan_term_years, closing_costs, rehab_cost, notes, created_at,
      rate_per_sqft, rera_approved, society)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
    ON CONFLICT(id) DO UPDATE SET
      address=EXCLUDED.address, city=EXCLUDED.city, state=EXCLUDED.state, zip=EXCLUDED.zip,
      property_type=EXCLUDED.property_type, status=EXCLUDED.status, price=EXCLUDED.price,
      bedrooms=EXCLUDED.bedrooms, bathrooms=EXCLUDED.bathrooms, square_feet=EXCLUDED.square_feet,
      lot_size=EXCLUDED.lot_size, year_built=EXCLUDED.year_built, monthly_rent=EXCLUDED.monthly_rent,
      property_tax_annual=EXCLUDED.property_tax_annual, insurance_annual=EXCLUDED.insurance_annual,
      hoa_monthly=EXCLUDED.hoa_monthly, vacancy_rate=EXCLUDED.vacancy_rate,
      maintenance_rate=EXCLUDED.maintenance_rate, management_rate=EXCLUDED.management_rate,
      down_payment_pct=EXCLUDED.down_payment_pct, interest_rate=EXCLUDED.interest_rate,
      loan_term_years=EXCLUDED.loan_term_years, closing_costs=EXCLUDED.closing_costs,
      rehab_cost=EXCLUDED.rehab_cost, notes=EXCLUDED.notes,
      rate_per_sqft=EXCLUDED.rate_per_sqft, rera_approved=EXCLUDED.rera_approved, society=EXCLUDED.society`,
    [
      p.id, p.address, p.city, p.state, p.zip, p.property_type, p.status, p.price,
      p.bedrooms, p.bathrooms, p.square_feet, p.lot_size, p.year_built, p.monthly_rent,
      p.property_tax_annual, p.insurance_annual, p.hoa_monthly, p.vacancy_rate,
      p.maintenance_rate, p.management_rate, p.down_payment_pct, p.interest_rate,
      p.loan_term_years, p.closing_costs, p.rehab_cost, p.notes, p.created_at,
      p.rate_per_sqft, p.rera_approved ? 1 : 0, p.society,
    ]
  );
}

export async function deleteProperty(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM properties WHERE id = $1`, [id]);
}

export async function searchProperties(
  search: string,
  statusFilter: string,
  typeFilter: string,
  sortBy: string,
  limit: number,
  offset: number
): Promise<{ rows: Property[]; total: number }> {
  const db = await getDb();
  let where = 'WHERE 1=1';
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (search) {
    where += ` AND (address ILIKE $${paramIdx} OR city ILIKE $${paramIdx} OR state ILIKE $${paramIdx} OR society ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }
  if (statusFilter && statusFilter !== 'All') {
    where += ` AND status = $${paramIdx}`;
    params.push(statusFilter);
    paramIdx++;
  }
  if (typeFilter && typeFilter !== 'All') {
    where += ` AND property_type = $${paramIdx}`;
    params.push(typeFilter);
    paramIdx++;
  }

  let orderBy = 'ORDER BY price DESC';
  switch (sortBy) {
    case 'price_asc': orderBy = 'ORDER BY price ASC'; break;
    case 'price_desc': orderBy = 'ORDER BY price DESC'; break;
    case 'area_desc': orderBy = 'ORDER BY square_feet DESC'; break;
    case 'rate_desc': orderBy = 'ORDER BY rate_per_sqft DESC'; break;
    case 'bhk_desc': orderBy = 'ORDER BY bedrooms DESC'; break;
  }

  const countQuery = `SELECT COUNT(*) as count FROM properties ${where}`;
  const countResult = await db.query<{ count: number }>(countQuery, params);
  const total = (countResult.rows as unknown as { count: number }[])[0]?.count ?? 0;

  const dataQuery = `SELECT * FROM properties ${where} ${orderBy} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(limit, offset);
  const result = await db.query<Property>(dataQuery, params);
  return { rows: result.rows as unknown as Property[], total };
}
