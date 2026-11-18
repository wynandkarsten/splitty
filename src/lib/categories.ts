export const CATEGORIES = [
  { id: 'general', label: 'General', icon: '🧾' },
  { id: 'food', label: 'Food & drink', icon: '🍽️' },
  { id: 'groceries', label: 'Groceries', icon: '🛒' },
  { id: 'transport', label: 'Transport', icon: '🚗' },
  { id: 'fuel', label: 'Fuel', icon: '⛽' },
  { id: 'accommodation', label: 'Accommodation', icon: '🏠' },
  { id: 'utilities', label: 'Utilities', icon: '💡' },
  { id: 'rent', label: 'Rent', icon: '🔑' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { id: 'travel', label: 'Travel', icon: '✈️' },
  { id: 'gifts', label: 'Gifts', icon: '🎁' },
  { id: 'health', label: 'Health', icon: '💊' },
] as const;

export const catIcon = (id: string) => CATEGORIES.find((c) => c.id === id)?.icon ?? '🧾';
export const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'General';

export const CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'JPY', 'CHF', 'BWP', 'NAD', 'MZN'];
