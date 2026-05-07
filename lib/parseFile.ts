import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Account } from './types';

// Maps raw CSV/Excel column headers to normalized field names
function normalizeKey(key: string): string {
  const k = key.toLowerCase().replace(/[_\-\s]+/g, ' ').trim();

  if (k === 'id' || k.includes('account id') || k.includes('customer id') || k.includes('client id')) return 'id';
  if (k === 'first name' || k === 'firstname' || k === 'first') return 'firstName';
  if (k === 'last name' || k === 'lastname' || k === 'last') return 'lastName';
  if (k === 'name' || k === 'full name' || k === 'contact name' || k === 'contact') return 'name';
  if (k.includes('company') || k.includes('business name') || k.includes('organization') || k.includes('org name')) return 'company';
  if (k.includes('email')) return 'email';
  if (k.includes('website') || k.includes('web site') || k.includes('url') || k.includes('domain')) return 'website';
  if (k.includes('phone') || k.includes('tel') || k.includes('mobile') || k.includes('cell')) return 'phone';
  if ((k.includes('address') || k.includes('street')) && !k.includes('city') && !k.includes('state') && !k.includes('province') && !k.includes('postal') && !k.includes('zip') && !k.includes('country')) return 'address';
  if (k === 'city' || k.includes('city')) return 'city';
  if (k.includes('province') || k === 'state' || k === 'province state') return 'province';
  if (k.includes('country')) return 'country';
  if (k.includes('postal') || k.includes('zip')) return 'postalCode';
  if (k.includes('business type') || k.includes('type') || k.includes('category') || k.includes('industry') || k.includes('segment')) return 'businessType';

  // Return the original key if no match (preserves unknown columns)
  return key.trim();
}

function normalizeRow(row: Record<string, unknown>): Account {
  const account: Account = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined || value === '') continue;
    const normalizedKey = normalizeKey(key);
    account[normalizedKey] = String(value).trim();
  }

  // Combine first + last name if we have them but no full name
  if (!account.name && (account.firstName || account.lastName)) {
    account.name = [account.firstName, account.lastName].filter(Boolean).join(' ');
  }

  return account;
}

export async function parseCSV(file: File): Promise<Account[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const accounts = (results.data as Record<string, unknown>[]).map(normalizeRow);
        resolve(accounts.filter(a => Object.keys(a).length > 0));
      },
      error: (error) => reject(new Error(error.message)),
    });
  });
}

export async function parseExcel(file: File): Promise<Account[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { raw: false, defval: '' });
        const accounts = rows.map(normalizeRow);
        resolve(accounts.filter(a => Object.keys(a).length > 0));
      } catch (err) {
        reject(new Error(`Failed to parse Excel file: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseFile(file: File): Promise<Account[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return parseCSV(file);
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
  throw new Error(`Unsupported file type ".${ext}". Please upload a .csv or .xlsx file.`);
}
