import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Keep admins signed in across browser restarts: the session (incl. the
    // refresh token) persists in localStorage, so closing the browser for an
    // hour — or a week — no longer means signing in again. useAdminAuth adds
    // a keep-alive that refreshes the short-lived access token on top of this.
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Category = {
  id: string;
  name: string;
  background_image: string | null;
  priority: number | null;
  show_in_stock: boolean;
  is_hidden: boolean;
  created_at: string;
};

export type Announcement = {
  id: string;
  text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SiteSetting = {
  id: string;
  key: string;
  value: string | null;
  label: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  product_code: string | null;
  title: string;
  description: string;
  price: number;
  discount_price: number | null;
  /** What the product costs you — powers margin/net-profit on the Finance tab. */
  cost_price: number | null;
  sizes: string[];
  stock_count: number;
  category_id: string | null;
  advance_optional: boolean;
  size_chart_template_id?: string | null;
  created_at: string;
  product_images?: ProductImage[];
  categories?: Category | null;
  product_sizes?: ProductSize[];
  /** Embedded measurement chart (when a template is linked) */
  size_chart_templates?: SizeChartTemplate | null;
};

/** Per-product size chart data: measurement rows × size columns, values as free text. */
export type SizeChartMeasurements = {
  rows: string[];
  sizes: string[];
  values: Record<string, Record<string, string>>;
  note?: string;
};

/** Reusable measurement chart — many products can share one. */
export type SizeChartTemplate = {
  id: string;
  name: string;
  measurements: SizeChartMeasurements;
  created_at: string;
  updated_at: string;
};

export type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  display_order: number;
};

export type ProductSize = {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
};

export type OrderStatus = 'pending' | 'delivered' | 'canceled';

export type Order = {
  id: string;
  order_code: string | null;
  product_id: string | null;
  product_title: string;
  product_code: string | null;
  selected_size: string | null;
  quantity: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  bkash_number: string | null;
  trx_id: string | null;
  /** Which mobile wallet the advance was sent through: 'bkash' | 'nagad' (not yet migrated — may be null). */
  payment_channel: 'bkash' | 'nagad' | null;
  subtotal: number | null;
  delivery_fee: number | null;
  discount_amount: number | null;
  total_amount: number | null;
  coupon_code: string | null;
  payment_method: string | null;
  advance_amount: number | null;
  due_amount: number | null;
  courier_name: string | null;
  delivery_zone: string | null;
  tracking_code: string | null;
  /** Latest Steadfast delivery status fetched on the fly (not persisted). */
  steadfast_status?: string | null;
  delivered: boolean;
  status: OrderStatus;
  /** 'checkout' (website) or 'manual' (in-store purchase recorded by staff). */
  order_source?: 'checkout' | 'manual' | null;
  /** For manual orders: the staff member who made the sale. */
  seller_name?: string | null;
  created_at: string;
};/** Audit trail: which admin did what (statuses, bookings, deletes, restocks…). */
export type AdminLog = {
  id: string;
  admin_id: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
};

/** One row per admin sign-in (logout_at set on sign-out) — Login sessions panel. */
export type AdminLogin = {
  id: string;
  admin_id: string;
  login_at: string;
  logout_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

/** One row per stock change — orders decrement, manual sells, restocks, adjustments. */
export type StockMovement = {
  id: string;
  product_id: string;
  size: string | null;
  delta: number;
  reason: string;
  note: string | null;
  admin_id: string | null;
  created_at: string;
};

/** Saved seller names for the Manual Orders dropdown (each deletable from admin). */
export type Seller = {
  id: string;
  name: string;
  created_at: string;
};

/** Business expenses (ads, packaging, rent, courier top-ups…) for net profit. */
export type Expense = {
  id: string;
  title: string;
  amount: number;
  note: string | null;
  spent_at: string;
  created_at: string;
};

export type Coupon = {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  times_used: number | null;
  is_active: boolean;
  product_codes: string[] | null;
  expires_at: string | null;
  created_at: string;
};

export type Feedback = {
  id: string;
  name: string;
  email: string;
  message: string;
  read: boolean;
  created_at: string;
};
