import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  sizes: string[];
  stock_count: number;
  category_id: string | null;
  advance_optional: boolean;
  created_at: string;
  product_images?: ProductImage[];
  categories?: Category | null;
  product_sizes?: ProductSize[];
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
