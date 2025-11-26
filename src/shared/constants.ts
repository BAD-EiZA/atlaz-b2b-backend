export const ALLOWED_CURRENCIES = [
  'IDR',
  'USD',
  'MMK',
  'VND',
  'THB',
  'MYR',
] as const;
export type Currency = (typeof ALLOWED_CURRENCIES)[number];

export const ALLOWED_METHODS = ['va', 'ewallet', 'qr', 'card'] as const;
export type PayMethod = (typeof ALLOWED_METHODS)[number];

export const SUCCESS_STATUSES = [
  'PAID',
  'SUCCEEDED',
  'CAPTURED',
  'SETTLED',
] as const;

export enum B2bRole {
  Admin = 'Admin',
  User = 'User',
}
