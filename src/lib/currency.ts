
/**
 * Formats a number as a human-readable currency string based on system settings.
 *
 * - For currencies that use decimal places (USD, EUR, GBP, etc.) we use Intl.NumberFormat
 *   so the correct symbol and formatting conventions are applied.
 * - For whole-unit African currencies (RWF, UGX, BIF, TZS, KES, etc.) we produce a clean
 *   "SYMBOL AMOUNT" string using a whitelist so the output is always predictable across
 *   browser locales.
 */

const WHOLE_UNIT_CURRENCIES: Record<string, string> = {
  RWF: 'RWF',   // Rwanda Franc
  UGX: 'UGX',   // Uganda Shilling
  BIF: 'BIF',   // Burundi Franc
  TZS: 'TZS',   // Tanzania Shilling
  CDF: 'CDF',   // Congo Franc
  XOF: 'XOF',   // West African CFA
  XAF: 'XAF',   // Central African CFA
  KES: 'KES',   // Kenya Shilling (often shown with decimals, but allow whole)
};

const DECIMAL_CURRENCIES: string[] = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'CNY', 'JPY',
  'INR', 'ZAR', 'NGN', 'GHS', 'ETB',
];

export function formatCurrency(amount: number, currency: string = 'RWF'): string {
  const safeAmount = isNaN(amount) || !isFinite(amount) ? 0 : amount;
  const code = (currency || 'RWF').toUpperCase().trim();

  // Whole-unit African currencies — render as "RWF 50,000"
  if (Object.prototype.hasOwnProperty.call(WHOLE_UNIT_CURRENCIES, code)) {
    const symbol = WHOLE_UNIT_CURRENCIES[code];
    const formatted = Math.round(safeAmount).toLocaleString('en-US');
    return `${symbol} ${formatted}`;
  }

  // Standard decimal currencies — use Intl for correct symbol + locale formatting
  if (DECIMAL_CURRENCIES.includes(code)) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(safeAmount);
    } catch {
      // Fallback if the browser doesn't know this code
      return `${code} ${safeAmount.toLocaleString('en-US')}`;
    }
  }

  // Generic fallback for any unrecognised currency code
  return `${code} ${safeAmount.toLocaleString('en-US')}`;
}
