
/**
 * Utility to format numbers as currency based on system settings.
 */
export function formatCurrency(amount: number, currency: string = 'RWF') {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  }
  
  // Default RWF formatting
  return `${amount.toLocaleString()} RWF`;
}
