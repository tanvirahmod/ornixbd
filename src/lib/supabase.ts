import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Category = {
  id: string;
  name: string;
  created_at: string;
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
  created_at: string;
  product_images?: ProductImage[];
  categories?: Category | null;
};

export type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  display_order: number;
};

export type Order = {
  id: string;
  product_id: string | null;
  product_title: string;
  product_code: string | null;
  selected_size: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  bkash_number: string | null;
  trx_id: string | null;
  delivered: boolean;
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
