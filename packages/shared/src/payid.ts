/**
 * PayID details: checking, normalising and formatting what people enter.
 *
 * Tally only stores and shows a PayID so others can copy it into their banking app.
 * It never verifies that the PayID is registered to that person; only a bank can.
 */

export type PayIdType = 'phone' | 'email' | 'abn';

export const PAYID_TYPES: { id: PayIdType; label: string; placeholder: string }[] = [
  { id: 'phone', label: 'Mobile', placeholder: '0412 345 678' },
  { id: 'email', label: 'Email', placeholder: 'you@example.com' },
  { id: 'abn', label: 'ABN', placeholder: '51 824 753 556' },
];

export type PayIdResult = { ok: true; value: string } | { ok: false; error: string };

/** Australian mobile → +61 4XXXXXXXX. Accepts "0412 345 678", "+61 412 345 678", "61412345678". */
function normalisePhone(input: string): PayIdResult {
  const digits = input.replace(/[\s\-()]/g, '');
  let national: string | null = null;
  if (/^04\d{8}$/.test(digits)) national = digits.slice(1);
  else if (/^\+614\d{8}$/.test(digits)) national = digits.slice(3);
  else if (/^614\d{8}$/.test(digits)) national = digits.slice(2);
  if (!national) return { ok: false, error: 'Enter an Australian mobile number, like 0412 345 678.' };
  return { ok: true, value: `+61${national}` };
}

function normaliseEmail(input: string): PayIdResult {
  const value = input.trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, value };
}

/** ABN checksum (ATO): subtract 1 from the first digit, weight the digits, total must divide by 89. */
export function isValidAbn(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = digits.split('').map(Number);
  nums[0] = nums[0]! - 1;
  const total = nums.reduce((sum, d, i) => sum + d * weights[i]!, 0);
  return total % 89 === 0;
}

function normaliseAbn(input: string): PayIdResult {
  const digits = input.replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) return { ok: false, error: 'An ABN has 11 digits.' };
  if (!isValidAbn(digits)) return { ok: false, error: 'That ABN doesn’t look right. Check the digits.' };
  return { ok: true, value: digits };
}

/** Check what someone typed and return the stored form, or a plain-language error. */
export function normalisePayId(type: PayIdType, input: string): PayIdResult {
  if (!input.trim()) return { ok: false, error: 'Enter your PayID.' };
  if (type === 'phone') return normalisePhone(input);
  if (type === 'email') return normaliseEmail(input);
  return normaliseAbn(input);
}

/** How a stored PayID is shown: "0412 345 678", "51 824 753 556", or the email. */
export function formatPayId(type: PayIdType, value: string): string {
  if (type === 'phone' && /^\+614\d{8}$/.test(value)) {
    const n = `0${value.slice(3)}`;
    return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  }
  if (type === 'abn' && /^\d{11}$/.test(value)) return `${value.slice(0, 2)} ${value.slice(2, 5)} ${value.slice(5, 8)} ${value.slice(8)}`;
  return value;
}

/** What the Copy button puts on the clipboard: what banking apps accept ("0412345678", digits only for an ABN). */
export function copyablePayId(type: PayIdType, value: string): string {
  if (type === 'phone' && /^\+614\d{8}$/.test(value)) return `0${value.slice(3)}`;
  return value;
}
