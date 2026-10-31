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
