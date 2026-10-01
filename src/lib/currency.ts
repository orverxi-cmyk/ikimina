
/**
 * Utility to format numbers as currency based on system settings.
 * Uses Intl.NumberFormat for all recognized ISO 4217 currencies.
 */
export function formatCurrency(amount: number, currency: string = 'RWF') {
  const safeAmount = isNaN(amount) ? 0 : amount;
  const upperCurrency = (currency || 'RWF').toUpperCase().trim();

  // List of currencies that Intl.NumberFormat handles natively
  const intlSupported = [
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY',
    'INR', 'KES', 'UGX', 'TZS', 'ZAR', 'NGN', 'GHS', 'ETB',
    'RWF', 'BIF', 'CDF', 'XOF', 'XAF',
  ];

  if (intlSupported.includes(upperCurrency)) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: upperCurrency,
        minimumFractionDigits: 0,
        maximumFractionDigits: upperCurrency === 'RWF' || upperCurrency === 'UGX' || upperCurrency === 'BIF' ? 0 : 2,
      }).format(safeAmount);
    } catch {
      // Fallback if Intl doesn't know the currency code
      return `${safeAmount.toLocaleString('en-US')} ${upperCurrency}`;
    }
  }

  // Generic fallback for any other currency code
  return `${safeAmount.toLocaleString('en-US')} ${upperCurrency}`;
}
