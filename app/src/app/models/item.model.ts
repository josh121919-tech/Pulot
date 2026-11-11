export type ItemType = 'lost' | 'found';
export type ItemStatus = 'open' | 'resolved';

// Must match ITEM_CATEGORIES in api/items.php.
export const ITEM_CATEGORIES = ['Electronics', 'ID/Cards', 'Keys', 'Bags', 'Personal Belongings', 'Others'] as const;

// Ionicons name per category, shown where a report has no photo.
export const CATEGORY_ICONS: Record<string, string> = {
  Electronics: 'phone-portrait-outline',
  'ID/Cards': 'card-outline',
  Keys: 'key-outline',
  Bags: 'bag-handle-outline',
  'Personal Belongings': 'shirt-outline',
  Others: 'cube-outline',
};

// How the reporter wants to be reached. Saved inside contact_info as "Phone: …" or
// "Facebook: …", so the database and API stay the same.
export type ContactMethod = 'phone' | 'facebook';

const CONTACT_PREFIXES: Record<ContactMethod, string> = { phone: 'Phone: ', facebook: 'Facebook: ' };

export function formatContact(method: ContactMethod, value: string): string {
  return CONTACT_PREFIXES[method] + value.trim();
}

// Splits contact_info back into its method and value. Reports saved before the
// method choice existed have no prefix, so they come back with method null.
export function parseContact(contactInfo: string): { method: ContactMethod | null; value: string } {
  for (const method of ['phone', 'facebook'] as const) {
    if (contactInfo.startsWith(CONTACT_PREFIXES[method])) {
      return { method, value: contactInfo.slice(CONTACT_PREFIXES[method].length) };
    }
  }
  return { method: null, value: contactInfo };
}

// A Philippine mobile number such as 09171234567 or +63 917 123 4567 (spaces and dashes allowed).
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  return /^(09\d{9}|\+639\d{9})$/.test(digits);
}

// One row from the `items` table, as returned by GET /api/items.php.
export interface Item {
  id: number;
  title: string;
  description: string | null;
  type: ItemType;
  category: string;
  latitude: number;
  longitude: number;
  image_path: string | null;
  image_url: string | null; // full URL built by the API from image_path
  contact_info: string;
  status: ItemStatus;
  resolved_at: string | null; // ISO 8601, UTC; set when the reporter marks it resolved
  found_contact: string | null; // "Phone: …" or "Facebook: …", left by someone who found a Lost item
  found_at: string | null; // ISO 8601, UTC; when that finder left the notice
  created_at: string; // ISO 8601, UTC
  owner_token?: string; // only in the POST reply: the secret that lets this phone change the status
}

// Optional GET filters; every one left out means "any".
export interface ItemFilters {
  type?: ItemType;
  status?: ItemStatus;
  category?: string;
  q?: string; // keyword in the title or description
  from?: string; // ISO 8601 date-time, inclusive
}

// The fields the Report form sends (the photo travels separately as a Blob).
export interface NewItem {
  title: string;
  description: string;
  type: ItemType;
  category: string;
  latitude: number;
  longitude: number;
  contact_info: string;
}

// Every API response has this shape.
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string>;
}
