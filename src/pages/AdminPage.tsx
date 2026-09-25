import { useState, useEffect, useRef } from 'react';
import { Lock, LogOut, Plus, Pencil, Trash2, X, Loader2,
   Package, ShoppingBag, Eye, Image, Save, AlertCircle, Tag, Search,
   Bell, CheckCheck, CheckCircle2, Truck, Clock, MessageSquare, Mail, Settings, Minus, RefreshCw, ChevronDown, XCircle, Percent, Power, AlertTriangle, Banknote, EyeOff, Link2, MapPin, Printer
} from 'lucide-react';
import { supabase, Product, ProductSize, Order, OrderStatus, Category, Feedback, Announcement, SiteSetting, Coupon } from '../lib/supabase';
import { createSteadfastConsignment, checkSteadfastStatus, steadfastStatusMeta, steadfastConfigured, steadfastStageBadge, SteadfastStage } from '../lib/steadfast';
import ImageUploader from '../components/ImageUploader';
import { zoneForDistrict, type DeliveryZone } from '../components/ZoneSelect';
import { printLabels } from '../lib/parcelLabel';
import { verifyAdmin } from '../lib/adminCredentials';
import { useNavigation } from '../lib/navigation';

type Tab = 'products' | 'stock' | 'categories' | 'orders' | 'coupons' | 'feedback' | 'settings';
type ModalMode = 'add' | 'edit';

// Compact page list for pagination: 1 … 4 5 6 … 12
function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  price: '',
  discount_price: '',
  sizes: '',
  stock_count: '',
  category_id: '',
  product_code: '',
  advance_optional: false,
};

// True when every ordered line item is a no-advance (pure cash on delivery) product
const allNoAdvance = (codes: Array<string | null>, products: Product[]) => {
  const set = new Set(products.filter((p) => p.advance_optional).map((p) => (p.product_code ?? '').toUpperCase()));
  return codes.length > 0 && codes.every((c) => c && set.has(c.toUpperCase()));
};

// Pill colors per order status (used on order cards)
const ORDER_STATUS_PILL: Record<OrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-600 border border-amber-200',
  delivered: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  canceled: 'bg-red-50 text-red-600 border border-red-200',
};

// Small uppercase field label used inside order detail cards
const ORD_LBL = 'text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-0.5';

// Steadfast pipeline stages shown on order cards (must match steadfast.ts)
const STEADFAST_STAGE_ORDER: SteadfastStage[] = ['booked', 'in_review', 'picked_up', 'in_transit', 'delivered'];
const STEADFAST_STAGE_LABELS: Record<SteadfastStage, string> = {
  booked: 'Booked',
  in_review: 'In review',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// ── Toast system (replaces window.alert) ──
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
let toastSeq = 0;

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2.5 max-w-sm w-full sm:w-96 bg-white rounded-xl shadow-lg border px-4 py-3 animate-fade-in-up ${
            t.kind === 'success'
              ? 'border-emerald-200'
              : t.kind === 'error'
                ? 'border-red-200'
                : 'border-stone-200'
          }`}
        >
          <span
            className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
              t.kind === 'success'
                ? 'bg-emerald-100 text-emerald-600'
                : t.kind === 'error'
                  ? 'bg-red-100 text-red-500'
                  : 'bg-stone-100 text-stone-500'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : t.kind === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
          </span>
          <p className="flex-1 text-sm text-stone-700 leading-snug break-words">{t.text}</p>
          <button
            onClick={() => onDismiss(t.id)}
            className="flex-shrink-0 text-stone-300 hover:text-stone-500 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Consistent empty state used across tabs
function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-stone-200">
      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-stone-50 text-stone-300 flex items-center justify-center">{icon}</div>
      <p className="text-stone-500 font-medium">{title}</p>
      {hint && <p className="text-stone-400 text-sm mt-1">{hint}</p>}
    </div>
  );
}

export default function AdminPage() {
  const onNavigate = useNavigation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('admin_auth') === 'true';
  });
  const [adminId, setAdminId] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageUrls, setImageUrls] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, string>>({});

  const [catHidden, setCatHidden] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalMode, setCatModalMode] = useState<ModalMode>('add');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catBackgroundImage, setCatBackgroundImage] = useState('');
  const [catPriority, setCatPriority] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'product' | 'category'; id: string } | null>(null);

  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');
  const [productPage, setProductPage] = useState(1);
  const PRODUCT_PAGE_SIZE = 12;
  const [stockSearch, setStockSearch] = useState('');
  const [stockSelectedCategory, setStockSelectedCategory] = useState<string | null>(null);
  const [stockCatPickerOpen, setStockCatPickerOpen] = useState(false);
  const [stockCatSaving, setStockCatSaving] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');
  const [deliveryStageFilter, setDeliveryStageFilter] = useState<'all' | SteadfastStage | 'not_booked'>('all');
  const ORDER_PAGE_SIZE = 15;
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<Order[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [updatingDelivery, setUpdatingDelivery] = useState<string | null>(null);
  const [orderStatusOpen, setOrderStatusOpen] = useState<string | null>(null);
  const orderStatusRef = useRef<HTMLDivElement | null>(null);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const [deleteFeedbackConfirm, setDeleteFeedbackConfirm] = useState<string | null>(null);
  const [cancelOrderConfirm, setCancelOrderConfirm] = useState<string | null>(null);
  const [deleteOrderConfirm, setDeleteOrderConfirm] = useState<string | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<string | null>(null);

  // ── Steadfast courier booking ──
  const [sendingToSteadfast, setSendingToSteadfast] = useState<string | null>(null);
  const [checkingSteadfast, setCheckingSteadfast] = useState<string | null>(null);
  const [bulkChecking, setBulkChecking] = useState(false);

  // ── Coupons ──
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsUnavailable, setCouponsUnavailable] = useState(false);
  const [couponSearch, setCouponSearch] = useState('');
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponModalMode, setCouponModalMode] = useState<ModalMode>('add');
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [couponForm, setCouponForm] = useState({
    code: '',
    discount_type: 'percent' as 'percent' | 'fixed',
    value: '',
    min_order_amount: '',
    max_uses: '',
    expires_at: '',
    is_active: true,
  });
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [deleteCouponConfirm, setDeleteCouponConfirm] = useState<string | null>(null);
  const [couponProductCodes, setCouponProductCodes] = useState<string[]>([]);
  const [couponCodeInput, setCouponCodeInput] = useState('');

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annModalOpen, setAnnModalOpen] = useState(false);
  const [annModalMode, setAnnModalMode] = useState<ModalMode>('add');
  const [annEditing, setAnnEditing] = useState<Announcement | null>(null);
  const [annText, setAnnText] = useState('');
  const [annActive, setAnnActive] = useState(true);
  const [annSaving, setAnnSaving] = useState(false);
  const [annError, setAnnError] = useState('');
  const [deleteAnnConfirm, setDeleteAnnConfirm] = useState<string | null>(null);

  const [heroBgImage, setHeroBgImage] = useState('');
  const [heroBgMobileImage, setHeroBgMobileImage] = useState('');
  const [heroBgSaving, setHeroBgSaving] = useState(false);
  const [heroBgError, setHeroBgError] = useState('');

  // ── Steadfast courier rates per delivery zone ──
  const [steadfastRates, setSteadfastRates] = useState({ dhaka_city: '60', dhaka_suburban: '110', outside_dhaka: '130' });
  const [merchantId, setMerchantId] = useState('');
  const [labelFrom, setLabelFrom] = useState('');
  const [labelTo, setLabelTo] = useState('');
  const [printingLabels, setPrintingLabels] = useState<string | null>(null); // 'bulk' | order id
  const [steadfastSaving, setSteadfastSaving] = useState(false);

  // ── Toasts ──
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (kind: Toast['kind'], text: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };
  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ── Dashboard at-a-glance stats ──
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const deliveredOrders = orders.filter((o) => o.status === 'delivered').length;
  const canceledOrders = orders.filter((o) => o.status === 'canceled').length;
  const lowStockCount = products.filter((p) => p.stock_count <= 5).length;

  const filteredProducts = products.filter((p) => {
    if (productCategoryFilter && p.category_id !== productCategoryFilter) return false;
    const q = productSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.product_code ?? '').toLowerCase().includes(q) ||
      (p.categories?.name ?? '').toLowerCase().includes(q)
    );
  });

  const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
  const productSafePage = Math.min(productPage, productTotalPages);
  const pagedProducts = filteredProducts.slice(
    (productSafePage - 1) * PRODUCT_PAGE_SIZE,
    productSafePage * PRODUCT_PAGE_SIZE
  );

  // ── Steadfast delivery pipeline counts (booked → in review → picked up → in transit → delivered) ──
  const stageOfOrder = (o: Order): SteadfastStage | 'not_booked' => {
    if (o.tracking_code) {
      const b = steadfastStageBadge(o.steadfast_status);
      return b ? b.stage : 'booked';
    }
    return o.status === 'canceled' ? 'cancelled' : 'not_booked';
    };
  const stageCounts: Record<SteadfastStage | 'not_booked', number> = {
    not_booked: 0, booked: 0, in_review: 0, picked_up: 0, in_transit: 0, delivered: 0, cancelled: 0,
  };
  for (const o of orders) stageCounts[stageOfOrder(o)] += 1;
  const trackedCount = orders.filter((o) => o.tracking_code).length;

  const filteredOrders = orders.filter((o) => {
    if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
    if (deliveryStageFilter !== 'all' && stageOfOrder(o) !== deliveryStageFilter) return false;
    const q = orderSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (o.customer_name ?? '').toLowerCase().includes(q) ||
      (o.customer_phone ?? '').toLowerCase().includes(q) ||
      (o.product_title ?? '').toLowerCase().includes(q) ||
      (o.product_code ?? '').toLowerCase().includes(q) ||
      (o.bkash_number ?? '').toLowerCase().includes(q) ||
      (o.trx_id ?? '').toLowerCase().includes(q)
    );
  });

  // ── Parcel label printing (Steadfast-style stickers) ──
  const ordersForLabels = () =>
    orders
      .filter((o) => o.tracking_code && o.status !== 'canceled')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const labelCount = ordersForLabels().length;

  const ordersInDateRange = (from: string, to: string) => {
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return ordersForLabels().filter((o) => {
      const ts = new Date(o.created_at).getTime();
      return (fromTs == null || ts >= fromTs) && (toTs == null || ts <= toTs);
    });
  };

  const dayOffsetISO = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const handlePrintLabels = async (list: Order[], label: string) => {
    if (list.length === 0) {
      showToast('info', 'No booked parcels in that selection.');
      return;
    }
    setPrintingLabels('bulk');
    try {
      await printLabels(list, merchantId.trim() || null);
      showToast('success', `Sent ${list.length} label${list.length === 1 ? '' : 's'} to the print dialog (${label}).`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Printing failed.');
    }
    setPrintingLabels(null);
  };

  const handlePrintOrderLabel = async (order: Order) => {
    setPrintingLabels(order.id);
    try {
      await printLabels([order], merchantId.trim() || null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Printing failed.');
    }
    setPrintingLabels(null);
  };

  const orderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE));
  const orderSafePage = Math.min(orderPage, orderTotalPages);
  const pagedOrders = filteredOrders.slice(
    (orderSafePage - 1) * ORDER_PAGE_SIZE,
    orderSafePage * ORDER_PAGE_SIZE
  );

  const getOrderPricing = (order: Order) => {
    const matchingProduct = products.find((product) => product.id === order.product_id);
    const unitPrice = matchingProduct
      ? (matchingProduct.discount_price != null && matchingProduct.discount_price < matchingProduct.price
        ? Number(matchingProduct.discount_price)
        : Number(matchingProduct.price))
      : 0;
    const qty = Number(order.quantity ?? 1) || 1;
    const subtotal = unitPrice * qty;
    // Fallback fee: the order's stored fee if present, else its zone rate, else flat 150
    const zone = order.delivery_zone ? zoneForDistrict(order.delivery_zone) : null;
    const zoneRate = zone ? Number(steadfastRates[zone as DeliveryZone]) : NaN;
    const deliveryFee = Number(order.delivery_fee ?? NaN) || (isNaN(zoneRate) ? 150 : zoneRate);
    const total = subtotal + deliveryFee;

    return { unitPrice, qty, subtotal, deliveryFee, total };
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAll();
    }
  }, [isAuthenticated]);

  // Auto-refresh Steadfast statuses shortly after the orders load
  useEffect(() => {
    if (isAuthenticated && !loading && orders.some((o) => o.tracking_code)) {
      void refreshAllSteadfastStatuses(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, loading]);

  // Close the order status dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orderStatusRef.current && !orderStatusRef.current.contains(e.target as Node)) {
        setOrderStatusOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Refresh Steadfast delivery statuses for every tracked order (bounded concurrency)
  const refreshAllSteadfastStatuses = async (silent = false) => {
    const tracked = orders.filter((o) => o.tracking_code);
    if (tracked.length === 0) return;
    setBulkChecking(true);
    const updates = new Map<string, string>();
    const CONCURRENCY = 4;
    let failed = 0;
    const queue = [...tracked];
    const worker = async () => {
      const [o] = queue.splice(0, 1);      if (!o.tracking_code) return;
      const res = await checkSteadfastStatus(o.tracking_code);
      if (res.ok && res.status) updates.set(o.id, res.status);
      else failed += 1;
    };
    while (queue.length > 0) {
      const batch = queue.splice(0, CONCURRENCY);
      await Promise.all(batch.map(worker));
    }
    if (updates.size > 0) {
      setOrders((prev) => prev.map((o) => (updates.has(o.id) ? { ...o, steadfast_status: updates.get(o.id)! } : o)));
      // Flip orders the courier confirms as delivered
      const nowDelivered = [...updates.entries()].filter(([, s]) => s === 'delivered');
      for (const [orderId] of nowDelivered) {
        const o = orders.find((x) => x.id === orderId);
        if (o && o.status !== 'delivered') await applyOrderStatus(orderId, 'delivered');
      }
    }
    setBulkChecking(false);
    if (!silent) {
      if (failed > 0) showToast('error', `${failed} status check${failed > 1 ? 's' : ''} failed — Steadfast may be unreachable.`);
      else showToast('success', `Updated ${updates.size} Steadfast status${updates.size === 1 ? '' : 'es'}.`);
    }
  };

  // Real-time order notifications via Supabase subscriptions
  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel('admin-order-notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = payload.new as Order;
          setOrders((prev) => [newOrder, ...prev]);
          setNotifications((prev) => [newOrder, ...prev]);
          // Browser notification
          if (Notification.permission === 'granted') {
            new Notification('New Order on Ornix!', {
              body: `${newOrder.customer_name} ordered ${newOrder.product_title}`,
              icon: '/vite.svg',
            });
          }
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new as Order;
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feedback' },
        (payload) => {
          const newFeedback = payload.new as Feedback;
          setFeedbackList((prev) => [newFeedback, ...prev]);
          if (Notification.permission === 'granted') {
            new Notification('New Feedback on Ornix!', {
              body: `${newFeedback.name}: ${newFeedback.message.slice(0, 60)}`,
              icon: '/vite.svg',
            });
          }
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'feedback' },
        (payload) => {
          const deleted = payload.old as Feedback;
          setFeedbackList((prev) => prev.filter((f) => (f.id !== deleted.id)));
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'product_sizes' },
        (payload) => {
          const updated = payload.new as ProductSize;
          if (!updated?.id || !updated?.product_id || updated.quantity == null) return;
          setProducts((prev) => prev.map((p) => {
            if (p.id !== updated.product_id) return p;
            const newProductSizes = (p.product_sizes ?? []).map((ps) =>
              ps.id === updated.id ? { ...ps, quantity: updated.quantity } : ps
            );
            const newStock = newProductSizes.reduce((sum, ps) => sum + ps.quantity, 0);
            return { ...p, product_sizes: newProductSizes, stock_count: newStock };
          }));
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        (payload) => {
          const updated = payload.new as Product;
          if (!updated?.id || updated.stock_count == null) return;
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, stock_count: updated.stock_count } : p)));
        }
      )
      .subscribe();

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated]);

  async function fetchAll() {
    setLoading(true);
    const [prodRes, catRes, ordRes, feedRes, annRes, settingsRes, couponRes] = await Promise.all([
      supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order), categories(id, name, created_at), product_sizes(id, size, quantity)')
        .order('created_at', { ascending: false }),
       supabase.from('categories').select('*').order('priority', { ascending: true, nullsFirst: false }).order('name'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('site_settings').select('*'),
      supabase.from('coupons').select('*').order('created_at', { ascending: false }),
    ]);
    if (prodRes.data) {
      setProducts(
        prodRes.data.map((p) => ({
          ...p,
          product_images: (p.product_images as Product['product_images'])?.sort(
            (a, b) => a.display_order - b.display_order
          ),
        }))
      );
    }
    if (catRes.data) setCategories(catRes.data);
    if (ordRes.data) setOrders(ordRes.data);
    if (feedRes.data) setFeedbackList(feedRes.data);
    if (annRes.data) setAnnouncements(annRes.data);
    if (couponRes.error) setCouponsUnavailable(true);
    else if (couponRes.data) setCoupons(couponRes.data);
    if (settingsRes.data) {
      const settings = settingsRes.data as SiteSetting[];
      const heroSetting = settings.find((s) => s.key === 'hero_background_image');
      if (heroSetting) setHeroBgImage(heroSetting.value ?? '');
      const heroMobileSetting = settings.find((s) => s.key === 'hero_background_image_mobile');
      if (heroMobileSetting) setHeroBgMobileImage(heroMobileSetting.value ?? '');
      const rateKeys: Array<[string, keyof typeof steadfastRates]> = [
        ['steadfast_rate_dhaka_city', 'dhaka_city'],
        ['steadfast_rate_dhaka_suburban', 'dhaka_suburban'],
        ['steadfast_rate_outside_dhaka', 'outside_dhaka'],
      ];
      setSteadfastRates((prev) => {
        const next = { ...prev };
        for (const [key, field] of rateKeys) {
          const row = settings.find((s) => s.key === key);
          if (row?.value != null && row.value !== '') next[field] = row.value;
        }
        return next;
      });
      const merchantSetting = settings.find((s) => s.key === 'steadfast_merchant_id');
      setMerchantId(merchantSetting?.value ?? '');
    }
    setLoading(false);
  }

  // Show/hide a category on the Stock page (does NOT delete the category)
  const toggleStockCategory = async (cat: Category, show: boolean) => {
    setStockCatSaving(cat.id);
    // Optimistic update
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, show_in_stock: show } : c)));
    const { error } = await supabase.from('categories').update({ show_in_stock: show }).eq('id', cat.id);
    if (error) {
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, show_in_stock: !show } : c)));
      showToast('error', `Failed to update category: ${error.message}`);
    }
    setStockCatSaving(null);
  };

  const handleRefreshStock = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdmin(adminId, adminPass)) {
      sessionStorage.setItem('admin_auth', 'true');
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid admin ID or password.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    setIsAuthenticated(false);
  };

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setImageUrls(['']);
    setEditingProduct(null);
    setModalMode('add');
    setFormError('');
    setSizeQuantities({});
    setModalOpen(true);
  };

  const openEditModal = async (product: Product) => {
    setEditingProduct(product);
    setForm({
      title: product.title,
      description: product.description,
      price: String(product.price),
      discount_price: product.discount_price != null ? String(product.discount_price) : '',
      sizes: product.sizes.join(', '),
      stock_count: String(product.stock_count),
      category_id: product.category_id ?? '',
      product_code: product.product_code ?? '',
      advance_optional: product.advance_optional ?? false,
    });
    const imgs = product.product_images?.map((img) => img.image_url) ?? [];
    setImageUrls(imgs.length > 0 ? imgs : ['']);
    setModalMode('edit');
    setFormError('');
    const sq = product.product_sizes?.reduce((acc, ps) => {
      acc[ps.size] = String(ps.quantity);
      return acc;
    }, {} as Record<string, string>) ?? {};
    setSizeQuantities(sq);
    setModalOpen(true);
  };

  const validateForm = () => {
    if (!form.title.trim()) return 'Product title is required.';
    if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) < 0)
      return 'Enter a valid price.';
    const parsedSizes = form.sizes.split(',').map((s) => s.trim()).filter(Boolean);
    if (parsedSizes.length === 0 && (!form.stock_count.trim() || isNaN(Number(form.stock_count)) || Number(form.stock_count) < 0))
      return 'Enter a valid stock count (or add sizes with quantities).';
    const code = form.product_code.trim().toUpperCase();
    if (code) {
      const clash = products.some(
        (p) => (p.product_code ?? '').toUpperCase() === code && p.id !== editingProduct?.id
      );
      if (clash) return `Product code "${code}" is already used by another product.`;
    }
    return '';
  };

  const handleSaveProduct = async () => {
    const err = validateForm();
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError('');

    const sizes = form.sizes.split(',').map((s) => s.trim()).filter(Boolean);
    const validImages = imageUrls.map((u) => u.trim()).filter(Boolean);
    // Stock is automatic for sized products (sum of size quantities); manual entry only for sizeless products
    const totalStock =
      sizes.length > 0
        ? sizes.reduce((sum, size) => sum + (Number(sizeQuantities[size]) || 0), 0)
        : Number(form.stock_count) || 0;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      discount_price: form.discount_price.trim() !== '' ? Number(form.discount_price) : null,
      sizes,
      stock_count: totalStock,
      category_id: form.category_id || null,
      product_code: form.product_code.trim() !== '' ? form.product_code.trim().toUpperCase() : null,
      advance_optional: form.advance_optional,
    };

    let productId: string;
    if (modalMode === 'add') {
      const { data: inserted, error: insertError } = await supabase
        .from('products').insert(payload).select().single();
      if (insertError || !inserted) {
        setFormError(
          insertError?.message.includes('duplicate key')
            ? 'Product code already exists. Please choose a different code.'
            : 'Failed to save product.'
        );
        setSaving(false);
        return;
      }
      productId = inserted.id;
      if (validImages.length > 0) {
        await supabase.from('product_images').insert(
          validImages.map((url, i) => ({ product_id: inserted.id, image_url: url, display_order: i }))
        );
      }
    } else if (editingProduct) {
      productId = editingProduct.id;
      const { error: updateError } = await supabase
        .from('products').update(payload).eq('id', editingProduct.id);
      if (updateError) { setFormError('Failed to update product.'); setSaving(false); return; }
      await supabase.from('product_images').delete().eq('product_id', editingProduct.id);
      if (validImages.length > 0) {
        await supabase.from('product_images').insert(
          validImages.map((url, i) => ({ product_id: editingProduct.id, image_url: url, display_order: i }))
        );
      }
    } else {
      setSaving(false);
      return;
    }

    await supabase.from('product_sizes').delete().eq('product_id', productId);
    if (sizes.length > 0) {
      await supabase.from('product_sizes').insert(
        sizes.map((size) => ({
          product_id: productId,
          size,
          quantity: Number(sizeQuantities[size]) || 0,
        }))
      );
    }

    await fetchAll();
    setSaving(false);
    setModalOpen(false);
    showToast('success', modalMode === 'add' ? 'Product created.' : 'Product updated.');
  };

  const openAddCatModal = () => {
    setCatName('');
    setCatBackgroundImage('');
    setCatPriority('');
    setCatHidden(false);
    setEditingCat(null);
    setCatModalMode('add');
    setCatError('');
    setCatModalOpen(true);
  };

  const openEditCatModal = (cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatBackgroundImage(cat.background_image ?? '');
    setCatPriority(cat.priority?.toString() ?? '');
    setCatHidden(cat.is_hidden ?? false);
    setCatModalMode('edit');
    setCatError('');
    setCatModalOpen(true);
  };

  const handleSaveCat = async () => {
    if (!catName.trim()) { setCatError('Category name is required.'); return; }
    setCatSaving(true);
    setCatError('');
    const payload = {
      name: catName.trim(),
      background_image: catBackgroundImage.trim() || null,
      priority: catPriority.trim() ? Number(catPriority.trim()) : null,
      is_hidden: catHidden,
    };
    if (catModalMode === 'add') {
      const { error } = await supabase.from('categories').insert(payload);
      if (error) { setCatError(error.message.includes('unique') ? 'Category already exists.' : 'Failed to save.'); setCatSaving(false); return; }
    } else if (editingCat) {
      const { error } = await supabase.from('categories').update(payload).eq('id', editingCat.id);
      if (error) { setCatError('Failed to update.'); setCatSaving(false); return; }
    }
    await fetchAll();
    setCatSaving(false);
    setCatModalOpen(false);
    showToast('success', catModalMode === 'add' ? 'Category created.' : 'Category updated.');
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'product') {
      await supabase.from('products').delete().eq('id', deleteConfirm.id);
    } else {
      await supabase.from('categories').delete().eq('id', deleteConfirm.id);
    }
    setDeleteConfirm(null);
    await fetchAll();
  };

  const setOrderStatus = (orderId: string, status: OrderStatus) => {
    setOrderStatusOpen(null);
    if (status === 'canceled') {
      // Destructive action — confirm in-app instead of window.confirm
      setCancelOrderConfirm(orderId);
      return;
    }
    void applyOrderStatus(orderId, status);
  };

  const applyOrderStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingDelivery(orderId);

    const prevOrders = orders;
    const prevNotifications = notifications;
    setOrders((prev) => prev.map((order) => (
      order.id === orderId ? { ...order, status, delivered: status === 'delivered' } : order
    )));
    setNotifications((prev) => prev.map((notification) => (
      notification.id === orderId ? { ...notification, status, delivered: status === 'delivered' } : notification
    )));

    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) {
      setOrders(prevOrders);
      setNotifications(prevNotifications);
      showToast('error', `Failed to update order status: ${error.message}`);
    } else {
      showToast('success', `Order marked as ${status}.`);
    }

    setUpdatingDelivery(null);
  };

  const handleDeleteOrder = async (orderId: string) => {
    setDeletingOrder(orderId);
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) {
      showToast('error', `Failed to delete order: ${error.message}`);
      setDeletingOrder(null);
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setNotifications((prev) => prev.filter((n) => n.id !== orderId));
    setDeleteOrderConfirm(null);
    setDeletingOrder(null);
    showToast('success', 'Order deleted.');
  };

  // Book the parcel with Steadfast and store the tracking code on the order
  const handleSendToSteadfast = async (order: Order) => {
    if (order.tracking_code) return;
    setSendingToSteadfast(order.id);
    const due = order.due_amount != null ? Number(order.due_amount) : null;
    const total = order.total_amount != null ? Number(order.total_amount) : null;
    const codAmount = Math.max(0, due ?? total ?? 0);

    // Maps onto the Steadfast app's "New consignment" form:
    // required = phone, name, address, COD · optional = invoice, note.
    // App-only fields (area, alt phone, email, weight, item description,
    // exchange toggle) are unsupported by the API → ignored.
    const sizePart = order.selected_size ? ` (Size ${order.selected_size})` : '';
    const qtyPart = order.quantity > 1 ? ` × ${order.quantity}` : '';
    const result = await createSteadfastConsignment({
      invoice: order.order_code || order.id.slice(0, 12),
      recipient_name: order.customer_name || 'Customer',
      recipient_phone: order.customer_phone,
      recipient_address: order.customer_address,
      cod_amount: codAmount,
      note: `${order.product_title}${sizePart}${qtyPart}`,
    });

    if (result.ok && result.trackingCode) {
      const { error } = await supabase
        .from('orders')
        .update({ tracking_code: result.trackingCode })
        .eq('id', order.id);
      if (error) {
        showToast('error', `Booked with Steadfast (${result.trackingCode}) but saving to the order failed: ${error.message}`);
      } else {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, tracking_code: result.trackingCode } : o)));
        showToast('success', `Booked with Steadfast — tracking code ${result.trackingCode}`);
      }
    } else {
      showToast('error', result.message);
    }
    setSendingToSteadfast(null);
  };

  // Pull the latest delivery status for one order's tracking code
  const handleCheckSteadfastStatus = async (order: Order) => {
    if (!order.tracking_code) return;
    setCheckingSteadfast(order.id);
    const result = await checkSteadfastStatus(order.tracking_code);
    if (result.ok && result.status) {
      // Keep in memory only — re-fetchable from Steadfast anytime via the refresh button
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, steadfast_status: result.status } : o)));
      showToast('success', `Steadfast status: ${steadfastStatusMeta(result.status)?.label ?? result.status}`);
      // Convenience: a confirmed Steadfast delivery can flip the local order too
      if (result.status === 'delivered' && order.status !== 'delivered') {
        await applyOrderStatus(order.id, 'delivered');
      }
    } else {
      showToast('error', result.message);
    }
    setCheckingSteadfast(null);
  };

  const handleSellProduct = async (productId: string, size: string | null, currentQty: number) => {
    if (currentQty <= 0) return;
    const newQty = currentQty - 1;

    if (size) {
      setProducts((prev) => prev.map((p) => {
        if (p.id !== productId) return p;
        const newProductSizes = p.product_sizes?.map((ps) =>
          ps.size === size ? { ...ps, quantity: Math.max(0, ps.quantity - 1) } : ps
        );
        const newStock = newProductSizes?.reduce((sum, ps) => sum + ps.quantity, 0) ?? p.stock_count;
        return { ...p, product_sizes: newProductSizes, stock_count: Math.max(0, newStock) };
      }));

      const { error: sizeError } = await supabase
        .from('product_sizes')
        .update({ quantity: Math.max(0, newQty) })
        .eq('product_id', productId)
        .eq('size', size);

      if (sizeError) {
        await fetchAll();
        return;
      }
    } else {
      setProducts((prev) => prev.map((p) =>
        p.id === productId ? { ...p, stock_count: Math.max(0, p.stock_count - 1) } : p
      ));
    }

    const { data: current } = await supabase
      .from('products')
      .select('stock_count')
      .eq('id', productId)
      .maybeSingle();

    if (current) {
      const { error: productError } = await supabase
        .from('products')
        .update({ stock_count: Math.max(0, (current.stock_count ?? 0) - 1) })
        .eq('id', productId);

      if (productError) {
        await fetchAll();
      }
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    await supabase.from('feedback').delete().eq('id', id);
    setFeedbackList((prev) => prev.filter((f) => f.id !== id));
    setDeleteFeedbackConfirm(null);
  };

  const markFeedbackRead = async (id: string) => {
    await supabase.from('feedback').update({ read: true }).eq('id', id);
    setFeedbackList((prev) => prev.map((f) => (f.id === id ? { ...f, read: true } : f)));
  };

  const filteredFeedback = feedbackList.filter((f) => {
    const q = feedbackSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      f.name.toLowerCase().includes(q) ||
      f.email.toLowerCase().includes(q) ||
      f.message.toLowerCase().includes(q)
    );
  });

  const unreadFeedback = feedbackList.filter((f) => !f.read).length;

  const unreadCount = notifications.length;

  const openAddAnnouncement = () => {
    setAnnText('');
    setAnnActive(true);
    setAnnEditing(null);
    setAnnModalMode('add');
    setAnnError('');
    setAnnModalOpen(true);
  };

  const openEditAnnouncement = (ann: Announcement) => {
    setAnnText(ann.text);
    setAnnActive(ann.is_active);
    setAnnEditing(ann);
    setAnnModalMode('edit');
    setAnnError('');
    setAnnModalOpen(true);
  };

  const handleSaveAnnouncement = async () => {
    if (!annText.trim()) { setAnnError('Announcement text is required.'); return; }
    setAnnSaving(true);
    setAnnError('');
    const payload = {
      text: annText.trim(),
      is_active: annActive,
      updated_at: new Date().toISOString(),
    };
    if (annModalMode === 'add') {
      const { error } = await supabase.from('announcements').insert({ ...payload, created_at: new Date().toISOString() });
      if (error) { setAnnError('Failed to add announcement.'); setAnnSaving(false); return; }
    } else if (annEditing) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', annEditing.id);
      if (error) { setAnnError('Failed to update announcement.'); setAnnSaving(false); return; }
    }
    await fetchAll();
    setAnnSaving(false);
    setAnnModalOpen(false);
  };

  const handleDeleteAnnouncement = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id);
    setDeleteAnnConfirm(null);
    await fetchAll();
  };

  // ── Coupon CRUD ──
  const openAddCoupon = () => {
    setCouponForm({ code: '', discount_type: 'percent', value: '', min_order_amount: '', max_uses: '', expires_at: '', is_active: true });
    setCouponProductCodes([]);
    setCouponCodeInput('');
    setEditingCoupon(null);
    setCouponModalMode('add');
    setCouponError('');
    setCouponModalOpen(true);
  };

  const openEditCoupon = (coupon: Coupon) => {
    setCouponForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      value: String(coupon.value),
      min_order_amount: coupon.min_order_amount != null ? String(coupon.min_order_amount) : '',
      max_uses: coupon.max_uses != null ? String(coupon.max_uses) : '',
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 10) : '',
      is_active: coupon.is_active,
    });
    setCouponProductCodes(coupon.product_codes ?? []);
    setCouponCodeInput('');
    setEditingCoupon(coupon);
    setCouponModalMode('edit');
    setCouponError('');
    setCouponModalOpen(true);
  };

  const validateCouponForm = (): string => {
    const code = couponForm.code.trim().toUpperCase();
    if (!code) return 'Coupon code is required.';
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return 'Use 3–24 letters, numbers, hyphens or underscores (no spaces).';
    if (!couponForm.value.trim() || isNaN(Number(couponForm.value)) || Number(couponForm.value) <= 0) return 'Enter a valid discount value.';
    if (couponForm.discount_type === 'percent' && Number(couponForm.value) > 100) return 'Percent discount cannot exceed 100.';
    if (couponForm.min_order_amount && (isNaN(Number(couponForm.min_order_amount)) || Number(couponForm.min_order_amount) < 0)) return 'Enter a valid minimum order amount.';
    if (couponForm.max_uses && (isNaN(Number(couponForm.max_uses)) || Number(couponForm.max_uses) < 1)) return 'Max uses must be at least 1.';
    const clash = coupons.some((c) => c.code.toUpperCase() === code && c.id !== editingCoupon?.id);
    if (clash) return `Coupon code "${code}" already exists.`;
    const badProductCode = couponProductCodes.find((c) => !/^[A-Z0-9_-]{2,24}$/.test(c));
    if (badProductCode) return `"${badProductCode}" is not a valid product code.`;
    return '';
  };

  const handleSaveCoupon = async () => {
    const err = validateCouponForm();
    if (err) { setCouponError(err); return; }
    setCouponSaving(true);
    setCouponError('');
    const payload = {
      code: couponForm.code.trim().toUpperCase(),
      discount_type: couponForm.discount_type,
      value: Number(couponForm.value),
      min_order_amount: couponForm.min_order_amount.trim() ? Number(couponForm.min_order_amount) : null,
      max_uses: couponForm.max_uses.trim() ? Number(couponForm.max_uses) : null,
      expires_at: couponForm.expires_at ? new Date(couponForm.expires_at + 'T23:59:59').toISOString() : null,
      is_active: couponForm.is_active,
      product_codes: couponProductCodes.map((c) => c.trim().toUpperCase()).filter(Boolean),
    };
    const { error } = couponModalMode === 'add'
      ? await supabase.from('coupons').insert(payload)
      : await supabase.from('coupons').update(payload).eq('id', editingCoupon!.id);
    if (error) {
      setCouponError(error.message.includes('duplicate') ? 'A coupon with this code already exists.' : 'Failed to save coupon.');
      setCouponSaving(false);
      return;
    }
    await fetchAll();
    setCouponSaving(false);
    setCouponModalOpen(false);
    showToast('success', couponModalMode === 'add' ? 'Coupon created.' : 'Coupon updated.');
  };

  const handleToggleCoupon = async (coupon: Coupon) => {
    // Optimistic update
    setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, is_active: !c.is_active } : c)));
    const { error } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
    if (error) {
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, is_active: coupon.is_active } : c)));
      showToast('error', `Failed to update coupon: ${error.message}`);
    } else {
      showToast('success', `Coupon ${coupon.code} ${coupon.is_active ? 'deactivated' : 'activated'}.`);
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    await supabase.from('coupons').delete().eq('id', id);
    setDeleteCouponConfirm(null);
    await fetchAll();
  };

  const addCouponProductCode = () => {
    const code = couponCodeInput.trim().toUpperCase().replace(/,+$/, '');
    if (!code) return;
    if (!/^[A-Z0-9_-]{2,24}$/.test(code)) {
      setCouponError(`"${code}" is not a valid product code format.`);
      return;
    }
    setCouponError('');
    setCouponProductCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setCouponCodeInput('');
  };

  const removeCouponProductCode = (code: string) => {
    setCouponProductCodes((prev) => prev.filter((c) => c !== code));
  };

  const upsertSiteSetting = async (
    key: string,
    value: string | null,
    label: string,
    description: string,
  ) => {
    const { data, error: fetchError } = await supabase
      .from('site_settings')
      .select('id')
      .eq('key', key)
      .maybeSingle();
    if (fetchError) return fetchError;

    if (data) {
      const { error } = await supabase
        .from('site_settings')
        .update({ value, label, description, updated_at: new Date().toISOString() })
        .eq('id', data.id);
      return error ?? null;
    } else {
      const { error } = await supabase.from('site_settings').insert({
        key,
        value,
        label,
        description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return error ?? null;
    }
  };

  const handleSaveHeroBg = async () => {
    setHeroBgSaving(true);
    setHeroBgError('');

    const [desktopErr, mobileErr] = await Promise.all([
      upsertSiteSetting(
        'hero_background_image',
        heroBgImage.trim() || null,
        'Hero Background Image',
        'Background image URL for the hero banner on the homepage (desktop/large screens)',
      ),
      upsertSiteSetting(
        'hero_background_image_mobile',
        heroBgMobileImage.trim() || null,
        'Hero Background Image (Mobile)',
        'Background image URL for the hero banner on mobile/small screens. Falls back to desktop image if not set.',
      ),
    ]);

    if (desktopErr || mobileErr) {
      setHeroBgError('Failed to save one or more settings. Please try again.');
      setHeroBgSaving(false);
      return;
    }

    setHeroBgError('');
    setHeroBgSaving(false);
    await fetchAll();
  };

  // Persist the Steadfast courier rates shown on checkout
  const handleSaveSteadfastRates = async () => {
    for (const v of [steadfastRates.dhaka_city, steadfastRates.dhaka_suburban, steadfastRates.outside_dhaka]) {
      if (isNaN(Number(v)) || Number(v) < 0) {
        showToast('error', 'Courier rates must be valid, non-negative numbers.');
        return;
      }
    }
    setSteadfastSaving(true);
    const entries: Array<{ key: string; label: string; description: string; value: string }> = [
      { key: 'steadfast_rate_dhaka_city', label: 'Steadfast Rate — Inside Dhaka', description: 'Courier charge (৳) for orders delivered inside Dhaka City.', value: steadfastRates.dhaka_city },
      { key: 'steadfast_rate_dhaka_suburban', label: 'Steadfast Rate — Dhaka Suburban', description: 'Courier charge (৳) for Dhaka Suburban areas (Gazipur, Narayanganj, Savar, etc.).', value: steadfastRates.dhaka_suburban },
      { key: 'steadfast_rate_outside_dhaka', label: 'Steadfast Rate — Outside Dhaka', description: 'Courier charge (৳) for deliveries outside Dhaka and its suburbs.', value: steadfastRates.outside_dhaka },
      { key: 'steadfast_merchant_id', label: 'Steadfast Merchant ID', description: 'Shown on printed parcel labels (e.g. 8JFK3PPH). Find it in your Steadfast merchant dashboard.', value: merchantId.trim() },
    ];
    const errors: string[] = [];
    for (const entry of entries) {
      const err = await upsertSiteSetting(entry.key, entry.value, entry.label, entry.description);
      if (err) errors.push(entry.label);
    }
    if (errors.length > 0) {
      showToast('error', `Failed to save: ${errors.join(', ')}`);
    } else {
      showToast('success', 'Steadfast courier rates saved.');
    }
    setSteadfastSaving(false);
  };

  // ── Login screen ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center px-4">
        <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-brand-600/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-amber-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-fade-in-up">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-stone-900 rounded-2xl flex items-center justify-center mb-4">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h1 className="font-display text-xl font-bold text-stone-900">Ornix Admin</h1>
            <p className="text-stone-400 text-sm">Sign in with your admin credentials</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Admin ID</label>
              <input type="text" value={adminId}
                onChange={(e) => { setAdminId(e.target.value); setLoginError(''); }}
                placeholder="admin1"
                className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Password</label>
              <input type="password" value={adminPass}
                onChange={(e) => { setAdminPass(e.target.value); setLoginError(''); }}
                placeholder="••••••••"
                className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            {loginError && (
              <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {loginError}
              </div>
            )}
            <button type="submit"
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3.5 rounded-2xl transition-all hover:shadow-lg">
              Sign In
            </button>
          </form>
          <button onClick={() => onNavigate('home')}
            className="w-full text-center text-sm text-stone-400 hover:text-stone-600 mt-4 transition-colors">
            Back to Store
          </button>
        </div>
      </div>
    );
  }

  // ── Admin dashboard ──
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-stone-900 text-white">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-lg">Ornix Admin</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifPanel((v) => !v)}
                className="relative flex items-center justify-center w-9 h-9 bg-stone-800 hover:bg-stone-700 rounded-xl transition-all"
              >
                <Bell className="w-4 h-4 text-stone-300" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifPanel && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifPanel(false)} />
                  <div className="absolute right-0 top-12 z-50 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-2xl border border-stone-100 animate-fade-in-up">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 sticky top-0 bg-white">
                      <span className="font-semibold text-stone-900 text-sm">New Orders</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => { setNotifications([]); setShowNotifPanel(false); }}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-stone-400">
                        <Bell className="w-8 h-8 mx-auto mb-2 text-stone-200" />
                        No new notifications
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-100">
                        {notifications.map((n) => (
                          <div key={n.id} className="px-4 py-3 hover:bg-stone-50 transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-brand-500 rounded-full mt-1.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-stone-900 truncate">{n.product_title}</p>
                                <p className="text-xs text-stone-500 truncate">{n.customer_name} • {n.customer_phone}</p>
                                <p className="text-[11px] text-stone-400 mt-0.5">
                                  {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => onNavigate('home')}
              className="flex items-center gap-1.5 text-stone-400 hover:text-white text-sm transition-colors">
              <Eye className="w-4 h-4" /> View Store
            </button>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white text-sm px-3 py-1.5 rounded-xl transition-all">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {([
            { key: 'products' as Tab, label: 'Products', icon: <Package className="w-4 h-4" />, count: products.length },
            { key: 'stock' as Tab, label: 'Stock', icon: <Package className="w-4 h-4" />, count: lowStockCount },
            { key: 'categories' as Tab, label: 'Categories', icon: <Tag className="w-4 h-4" />, count: categories.length },
            { key: 'orders' as Tab, label: 'Orders', icon: <ShoppingBag className="w-4 h-4" />, count: orders.length, highlight: pendingOrders > 0 ? `${pendingOrders} pending` : undefined },
            { key: 'coupons' as Tab, label: 'Coupons', icon: <Percent className="w-4 h-4" />, count: couponsUnavailable ? undefined : coupons.length },
            { key: 'feedback' as Tab, label: 'Feedback', icon: <MessageSquare className="w-4 h-4" />, count: feedbackList.length, badge: unreadFeedback },
            { key: 'settings' as Tab, label: 'Settings', icon: <Settings className="w-4 h-4" />, count: undefined },
          ]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              title={t.highlight ? t.highlight : undefined}
              className={`relative flex items-center gap-2 px-4 sm:px-5 py-4 text-sm font-semibold transition-all whitespace-nowrap border-b-2 ${
                tab === t.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}>
              <span className={tab === t.key ? 'text-brand-500' : 'text-stone-400'}>{t.icon}</span>
              {t.label}
              {t.badge != null && t.badge > 0 ? (
                <span className="bg-brand-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {t.badge > 9 ? '9+' : t.badge}
                </span>
              ) : t.count != null ? (
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                  tab === t.key ? 'bg-brand-50 text-brand-600' : 'bg-stone-100 text-stone-500'
                }`}>
                  {t.count}
                </span>
              ) : null}
              {t.highlight && tab !== t.key && (
                <span className="absolute top-2.5 right-1 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ── Products tab ── */}
        {tab === 'products' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">Products</h2>
                <p className="text-sm text-stone-500">
                  {products.length} total
                  {filteredProducts.length !== products.length && ` · ${filteredProducts.length} shown`}
                </p>
              </div>
              <button onClick={openAddModal}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <Plus className="w-4 h-4" /> Add Product
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }}
                  placeholder="Search by product name, code, or category..."
                  className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                />
              </div>
              <select
                value={productCategoryFilter}
                onChange={(e) => { setProductCategoryFilter(e.target.value); setProductPage(1); }}
                className="border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-brand-400 sm:w-56"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>
            ) : filteredProducts.length === 0 ? (
              <EmptyState
                icon={<Package className="w-6 h-6" />}
                title={productSearch || productCategoryFilter ? 'No products match your search or filter.' : 'No products yet'}
                hint={productSearch || productCategoryFilter ? 'Try a different search term or clear the filter.' : 'Click "Add Product" to create your first one.'}
              />
            ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pagedProducts.map((product) => {
                  const cover = product.product_images?.[0]?.image_url
                    ?? 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=400';
                  return (
                    <div key={product.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-stone-100 hover:shadow-md transition-shadow">
                      <div className="aspect-video bg-stone-100 overflow-hidden relative">
                        <img src={cover} alt={product.title} className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=400'; }}
                        />
                        {product.categories && (
                          <span className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-stone-700 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                            {product.categories.name}
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-stone-900 text-sm leading-snug">{product.title}</h3>
                          <span className="text-brand-600 font-bold text-sm flex-shrink-0">৳{Number(product.price).toFixed(0)}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          {product.product_code && (
                            <p className="text-[11px] font-mono text-stone-400">{product.product_code}</p>
                          )}
                          {product.advance_optional && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                              COD
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-stone-500 mb-3">
                          <span>{product.stock_count} in stock</span>
                          {product.sizes.length > 0 && product.product_sizes && product.product_sizes.length > 0 && (
                            <span className="truncate">
                              {product.product_sizes.map((ps) => `${ps.size}: ${ps.quantity}`).join(' · ')}
                            </span>
                          )}
                          {product.sizes.length > 0 && (!product.product_sizes || product.product_sizes.length === 0) && (
                            <span>{product.sizes.length} sizes</span>
                          )}
                          <span className="flex items-center gap-1"><Image className="w-3 h-3" />{product.product_images?.length ?? 0}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openEditModal(product)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-stone-600 bg-stone-100 hover:bg-stone-200 text-xs font-semibold py-2 rounded-lg transition-all">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => setDeleteConfirm({ type: 'product', id: product.id })}
                            className="flex-1 flex items-center justify-center gap-1.5 text-red-500 bg-red-50 hover:bg-red-100 text-xs font-semibold py-2 rounded-lg transition-all">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {productTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
                  <button
                    onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                    disabled={productSafePage === 1}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Prev
                  </button>
                  {pageNumbers(productSafePage, productTotalPages).map((n, i) =>
                    n === '…' ? (
                      <span key={`dots-${i}`} className="px-1 text-stone-400 text-sm">…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setProductPage(n as number)}
                        className={`min-w-[2.5rem] px-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                          n === productSafePage
                            ? 'bg-stone-900 text-white shadow-md'
                            : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setProductPage((p) => Math.min(productTotalPages, p + 1))}
                    disabled={productSafePage === productTotalPages}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* ── Stock tab ── */}
        {tab === 'stock' && (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                {stockSelectedCategory === null ? (
                  <>
                    <h2 className="font-display text-xl font-bold text-stone-900">Stock Management</h2>
                    <p className="text-sm text-stone-500">Pick a category to see its products. Updates sync across all admins instantly.</p>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setStockSelectedCategory(null); setStockSearch(''); }}
                      className="flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors mb-1"
                    >
                      ← All Categories
                    </button>
                    <h2 className="font-display text-xl font-bold text-stone-900">
                      {stockSelectedCategory === '__uncategorized__'
                        ? 'Uncategorized Products'
                        : categories.find((c) => c.id === stockSelectedCategory)?.name ?? 'Products'}
                    </h2>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {stockSelectedCategory === null && (
                  <button onClick={() => setStockCatPickerOpen(true)}
                    className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-4 py-2 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 text-sm">
                    <Plus className="w-4 h-4" /> Add / Remove Categories
                  </button>
                )}
                {stockSelectedCategory === null && (
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/shop-by-size`;
                      navigator.clipboard?.writeText(url).then(() => {
                        showToast('success', 'Shop by Size link copied.');
                      }).catch(() => {
                        window.prompt('Copy this link:', url);
                      });
                    }}
                    className="flex items-center gap-2 bg-white border border-stone-200 hover:border-stone-300 text-stone-700 hover:text-stone-900 font-semibold px-4 py-2 rounded-xl transition-all text-sm"
                  >
                    <Link2 className="w-4 h-4" /> Copy Shop by Size Link
                  </button>
                )}
                <button
                  onClick={handleRefreshStock}
                  disabled={refreshing}
                  className="flex items-center gap-2 bg-white border border-stone-200 hover:border-stone-300 text-stone-700 hover:text-stone-900 font-semibold px-4 py-2 rounded-xl transition-all text-sm disabled:opacity-60"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* ── Stock page category picker modal ── */}
            {stockCatPickerOpen && (
              <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setStockCatPickerOpen(false)}>
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
                    <div>
                      <h3 className="font-display text-lg font-bold text-stone-900">Manage Stock Categories</h3>
                      <p className="text-xs text-stone-500 mt-0.5">Pick which categories appear on the Stock page. Removing one here does not delete it.</p>
                    </div>
                    <button onClick={() => setStockCatPickerOpen(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-2">
                    {categories.length === 0 ? (
                      <div className="text-center py-8 text-stone-400">
                        <Tag className="w-10 h-10 mx-auto mb-2 text-stone-300" />
                        <p className="text-sm">No categories yet. Create them in the Categories tab first.</p>
                      </div>
                    ) : (
                      categories.map((cat) => {
                        const visible = cat.show_in_stock !== false;
                        return (
                          <div key={cat.id} className="flex items-center justify-between bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Tag className="w-4 h-4 text-brand-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-stone-900 text-sm truncate">{cat.name}</p>
                                <p className="text-xs text-stone-400">
                                  {visible ? 'Shown on Stock page' : 'Hidden from Stock page'}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                              {visible ? (
                                <button
                                  onClick={() => toggleStockCategory(cat, false)}
                                  disabled={stockCatSaving === cat.id}
                                  className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                                >
                                  {stockCatSaving === cat.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                  Remove
                                </button>
                              ) : (
                                <button
                                  onClick={() => toggleStockCategory(cat, true)}
                                  disabled={stockCatSaving === cat.id}
                                  className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                                >
                                  {stockCatSaving === cat.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                  Add
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="px-6 pb-6 pt-3 border-t border-stone-100">
                    <button
                      onClick={() => setStockCatPickerOpen(false)}
                      className="w-full bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 rounded-2xl transition-all text-sm"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Category list view */}
            {stockSelectedCategory === null ? (
              categories.length === 0 && products.every((p) => p.category_id) ? (
                <EmptyState
                  icon={<Tag className="w-6 h-6" />}
                  title="No categories yet"
                  hint="Create categories in the Categories tab to organize stock."
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {categories.filter((cat) => cat.show_in_stock !== false).map((cat) => {
                    const count = products.filter((p) => p.category_id === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => { setStockSelectedCategory(cat.id); setStockSearch(''); }}
                        className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 flex items-center justify-between hover:shadow-md hover:border-brand-200 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                            <Tag className="w-5 h-5 text-brand-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-stone-900">{cat.name}</p>
                            <p className="text-xs text-stone-400">{count} product{count !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <ChevronDown className="w-5 h-5 text-stone-300 -rotate-90" />
                      </button>
                    );
                  })}
                  {products.some((p) => !p.category_id) && (
                    <button
                      onClick={() => { setStockSelectedCategory('__uncategorized__'); setStockSearch(''); }}
                      className="bg-white rounded-2xl shadow-sm border border-dashed border-stone-200 p-5 flex items-center justify-between hover:shadow-md hover:border-brand-200 transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                          <Package className="w-5 h-5 text-stone-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-stone-900">Uncategorized</p>
                          <p className="text-xs text-stone-400">{products.filter((p) => !p.category_id).length} product{products.filter((p) => !p.category_id).length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-stone-300 -rotate-90" />
                    </button>
                  )}
                </div>
              )
            ) : (
            <>
            {/* Products-in-category view */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              />
            </div>

            {(() => {
              const categoryProducts = products.filter((p) =>
                stockSelectedCategory === '__uncategorized__' ? !p.category_id : p.category_id === stockSelectedCategory
              );
              return categoryProducts.length === 0 ? (
                <EmptyState icon={<Package className="w-6 h-6" />} title="No products in this category yet" />
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryProducts.filter((p) => {
                  const q = stockSearch.trim().toLowerCase();
                  if (!q) return true;
                  return p.title.toLowerCase().includes(q) || (p.product_code ?? '').toLowerCase().includes(q);
                }).map((product) => {
                  const cover = product.product_images?.[0]?.image_url
                    ?? 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=400';
                  return (
                    <div key={product.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-stone-100">
                      <div className="aspect-video bg-stone-100 overflow-hidden relative">
                        <img src={cover} alt={product.title} className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.pexels.com/photos/5632398/pexels-photo-5632398.jpeg?auto=compress&cs=tinysrgb&w=400'; }}
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-stone-900 text-sm leading-snug mb-1">{product.title}</h3>
                        <p className="text-xs text-stone-500 mb-3">{product.stock_count} total in stock</p>

                        {product.sizes.length > 0 && product.product_sizes && product.product_sizes.length > 0 ? (
                          <div className="space-y-2">
                            {product.sizes.map((size) => {
                              const ps = product.product_sizes?.find((p) => p.size === size);
                              const qty = ps?.quantity ?? 0;
                              return (
                                <div key={size} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2">
                                  <div>
                                    <span className="text-xs font-semibold text-stone-700 uppercase">{size}</span>
                                    <span className="text-xs text-stone-500 ml-2">{qty} left</span>
                                  </div>
                                  <button
                                    onClick={() => handleSellProduct(product.id, size, qty)}
                                    disabled={qty <= 0}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSellProduct(product.id, null, product.stock_count)}
                            disabled={product.stock_count <= 0}
                            className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed font-semibold py-2.5 rounded-xl transition-all text-sm"
                          >
                            <Minus className="w-4 h-4" /> Sell (-1)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}
            </>
            )}
          </div>
        )}

        {/* ── Categories tab ── */}
        {tab === 'categories' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">Categories</h2>
                <p className="text-sm text-stone-500">{categories.length} total</p>
              </div>
              <button onClick={openAddCatModal}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <Plus className="w-4 h-4" /> Add Category
              </button>
            </div>

            {categories.length === 0 ? (
              <EmptyState
                icon={<Tag className="w-6 h-6" />}
                title="No categories yet"
                hint='Click "Add Category" to create your first one.'
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {categories.map((cat) => {
                  const count = products.filter((p) => p.category_id === cat.id).length;
                  return (
                    <div key={cat.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 flex items-center justify-between hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                          <Tag className="w-5 h-5 text-brand-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-stone-900">{cat.name}</p>
                            {cat.is_hidden && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                <EyeOff className="w-3 h-3" /> Hidden
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-400">{count} product{count !== 1 ? 's' : ''}</p>
                        </div>
                        {cat.priority !== null && cat.priority !== undefined && (
                          <span className="text-xs font-medium text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded-full">
                            Priority: {cat.priority}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => openEditCatModal(cat)}
                          className="text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 p-2 rounded-lg transition-all">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteConfirm({ type: 'category', id: cat.id })}
                          className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Orders tab ── */}
        {tab === 'orders' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">Orders</h2>
                <p className="text-sm text-stone-500">
                  {orders.length} total
                  {pendingOrders > 0 && <span className="text-amber-600 font-medium"> · {pendingOrders} pending</span>}
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => { setOrderSearch(e.target.value); setOrderPage(1); }}
                  placeholder="Search name, phone, code, TrxID..."
                  className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                />
              </div>
            </div>

            {/* Status filter bar */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
              {([
                { key: 'all' as const, label: 'All', count: orders.length, cls: 'bg-stone-900 text-white border-stone-900' },
                { key: 'pending' as const, label: 'Pending', count: pendingOrders, cls: 'bg-amber-500 text-white border-amber-500' },
                { key: 'delivered' as const, label: 'Delivered', count: deliveredOrders, cls: 'bg-emerald-500 text-white border-emerald-500' },
                { key: 'canceled' as const, label: 'Canceled', count: canceledOrders, cls: 'bg-red-500 text-white border-red-500' },
              ]).map((f) => {
                const active = orderStatusFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => { setOrderStatusFilter(f.key); setOrderPage(1); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all whitespace-nowrap ${
                      active ? f.cls : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {f.label}
                    <span className={`text-[11px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center ${
                      active ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {f.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Steadfast delivery pipeline: click a stage to see its parcels */}
            {orders.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 mb-6">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> Steadfast delivery pipeline
                  </p>
                  {steadfastConfigured && trackedCount > 0 && (
                    <button
                      onClick={() => void refreshAllSteadfastStatuses(false)}
                      disabled={bulkChecking}
                      className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-60 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${bulkChecking ? 'animate-spin' : ''}`} />
                      {bulkChecking ? 'Checking…' : 'Refresh all statuses'}
                    </button>
                    )}
                </div>
                <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
                  {([
                    { key: 'not_booked' as const, label: 'Not booked', desc: 'Awaiting pickup booking', count: stageCounts.not_booked, dot: 'bg-stone-300' },
                    { key: 'booked' as const, label: 'Booked', desc: 'Sent to Steadfast', count: stageCounts.booked, dot: 'bg-stone-400' },
                    { key: 'in_review' as const, label: 'In review', desc: 'Steadfast is approving', count: stageCounts.in_review, dot: 'bg-sky-400' },
                    { key: 'picked_up' as const, label: 'Picked up', desc: 'Parcel with the rider', count: stageCounts.picked_up, dot: 'bg-amber-400' },
                    { key: 'in_transit' as const, label: 'In transit', desc: 'On the way to the customer', count: stageCounts.in_transit, dot: 'bg-orange-400' },
                    { key: 'delivered' as const, label: 'Delivered', desc: 'Payment collected', count: stageCounts.delivered, dot: 'bg-emerald-500' },
                    { key: 'cancelled' as const, label: 'Cancelled', desc: 'Returned or cancelled', count: stageCounts.cancelled, dot: 'bg-red-400' },
                  ]).map((s, i, arr) => (
                    <div key={s.key} className="flex items-center flex-shrink-0">
                      <button
                        onClick={() => { setDeliveryStageFilter(deliveryStageFilter === s.key ? 'all' : s.key); setOrderPage(1); }}
                        title={s.desc}
                        className={`text-left rounded-xl border px-3 py-2 transition-all min-w-[92px] ${
                          deliveryStageFilter === s.key
                            ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300'
                            : 'border-stone-200 bg-stone-50 hover:border-stone-300'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${s.dot} ${s.key === 'not_booked' && stageCounts.not_booked > 0 ? 'animate-pulse' : ''}`} />
                          <span className="text-base font-bold text-stone-900">{s.count}</span>
                        </span>
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-500 mt-0.5">{s.label}</span>
                      </button>
                      {i < arr.length - 1 && <span className="text-stone-300 px-0.5">›</span>} 
                    </div>
                  ))}
                </div>
                {deliveryStageFilter !== 'all' && (
                  <p className="mt-2 text-xs text-stone-500">
                    Showing only <span className="font-semibold">{deliveryStageFilter.replace(/_/g, ' ')}</span> parcels —{' '}
                    <button onClick={() => setDeliveryStageFilter('all')} className="text-brand-600 font-semibold hover:underline">clear</button>
                  </p>
                  )}
              </div>
            )}

            {/* Bulk parcel label printing */}
            {labelCount > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 mb-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5" /> Print parcel labels ({labelCount} booked)
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => void handlePrintLabels(ordersInDateRange(dayOffsetISO(0), dayOffsetISO(0)), 'today')}
                      disabled={printingLabels === 'bulk'}
                      className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 px-3 py-1.5 rounded-full disabled:opacity-60 transition-all"
                    >
                      Today's labels
                    </button>
                    <button
                      onClick={() => void handlePrintLabels(ordersInDateRange(dayOffsetISO(-1), dayOffsetISO(-1)), 'yesterday')}
                      disabled={printingLabels === 'bulk'}
                      className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 px-3 py-1.5 rounded-full disabled:opacity-60 transition-all"
                    >
                      Yesterday's labels
                    </button>
                  </div>
                </div>
                <div className="flex items-end gap-2 flex-wrap">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-500 mb-1">From</label>
                    <input
                      type="date"
                      value={labelFrom}
                      onChange={(e) => setLabelFrom(e.target.value)}
                      className="border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-500 mb-1">To</label>
                    <input
                      type="date"
                      value={labelTo}
                      onChange={(e) => setLabelTo(e.target.value)}
                      className="border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <button
                    onClick={() => void handlePrintLabels(ordersInDateRange(labelFrom, labelTo), `${labelFrom || 'start'} → ${labelTo || 'now'}`)}
                    disabled={printingLabels === 'bulk'}
                    className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold text-sm px-4 py-2 rounded-xl transition-all shadow-sm"
                  >
                    {printingLabels === 'bulk' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                    Print range ({ordersInDateRange(labelFrom, labelTo).length})
                  </button>
                </div>
              </div>
            )}

            {filteredOrders.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="w-6 h-6" />}
                title={orders.length === 0 ? 'No orders yet' : 'No orders match your filters.'}
                hint={orders.length === 0 ? 'New orders will appear here in real time.' : 'Try a different search term or status filter.'}
              />
            ) : (
              <>
              <div className="space-y-2" ref={orderStatusRef}>
                {pagedOrders.map((order) => {
                  const pricing = getOrderPricing(order);
                  return (
                    <div key={order.id} className={`bg-white rounded-2xl border border-stone-100 border-l-4 p-4 sm:p-5 hover:shadow-md transition-shadow ${
                      order.status === 'pending'
                        ? 'border-l-amber-400'
                        : order.status === 'canceled'
                          ? 'border-l-red-300'
                          : 'border-l-emerald-400'
                    }`}>
                      {/* Header: customer identity + status + actions */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                            order.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-700'
                              : order.status === 'canceled'
                                ? 'bg-red-100 text-red-500'
                                : 'bg-amber-100 text-amber-700'
                          }`}>
                            {(order.customer_name || '?').trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-900 truncate">{order.customer_name || 'Unknown customer'}</p>
                            <a href={`tel:${order.customer_phone}`} className="text-xs text-stone-500 hover:text-brand-600 transition-colors">
                              {order.customer_phone}
                            </a>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="hidden md:block text-xs text-stone-400">
                            {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${ORDER_STATUS_PILL[order.status]}`}>
                            {order.status === 'delivered'
                              ? <><CheckCheck className="w-3.5 h-3.5" /> Delivered</>
                              : order.status === 'canceled'
                                ? <><XCircle className="w-3.5 h-3.5" /> Canceled</>
                                : <><Clock className="w-3.5 h-3.5" /> Pending</>}
                          </span>
                          <div className="relative">
                            <button
                              onClick={() => setOrderStatusOpen(orderStatusOpen === order.id ? null : order.id)}
                              disabled={updatingDelivery === order.id}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60 ${
                                order.status === 'delivered'
                                  ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                                  : order.status === 'canceled'
                                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                              }`}
                            >
                              {updatingDelivery === order.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : order.status === 'delivered' ? (
                                <Truck className="w-3.5 h-3.5" />
                              ) : order.status === 'canceled' ? (
                                <XCircle className="w-3.5 h-3.5" />
                              ) : (
                                <Clock className="w-3.5 h-3.5" />
                              )}
                              {order.status === 'delivered' ? 'Delivered' : order.status === 'canceled' ? 'Canceled' : 'Pending'}
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${orderStatusOpen === order.id ? 'rotate-180' : ''}`} />
                            </button>
                            {orderStatusOpen === order.id && (
                              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-stone-200 rounded-xl shadow-xl z-30 overflow-hidden">
                                {([
                                  { value: 'pending' as OrderStatus, label: 'Pending', icon: <Clock className="w-4 h-4" />, activeCls: 'bg-amber-50 text-amber-700' },
                                  { value: 'delivered' as OrderStatus, label: 'Delivered', icon: <Truck className="w-4 h-4" />, activeCls: 'bg-emerald-50 text-emerald-700' },
                                  { value: 'canceled' as OrderStatus, label: 'Canceled', icon: <XCircle className="w-4 h-4" />, activeCls: 'bg-red-50 text-red-700' },
                                ]).map((opt) => (
                                  <button
                                    key={opt.value}
                                    onClick={() => setOrderStatus(order.id, opt.value)}
                                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-left transition-colors hover:bg-stone-50 ${
                                      order.status === opt.value ? `${opt.activeCls} font-semibold` : 'text-stone-700'
                                    }`}
                                  >
                                    {opt.icon}
                                    {opt.label}
                                    {order.status === opt.value && <CheckCheck className="w-3.5 h-3.5 ml-auto" />}
                                  </button>
                                ))}
                                <div className="border-t border-stone-100 my-1" />
                                <button
                                  onClick={() => { setOrderStatusOpen(null); setDeleteOrderConfirm(order.id); }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 text-left transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete order
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Order line: product + variant */}
                      <div className="mt-3 pt-3 border-t border-stone-100 flex items-center gap-2 flex-wrap text-sm">
                        <span className="font-semibold text-stone-800">{order.product_title}</span>
                        {order.product_code && (
                          <span className="text-[11px] font-mono bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">{order.product_code}</span>
                        )}
                        {order.selected_size && (
                          <span className="text-[11px] font-semibold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full uppercase">Size: {order.selected_size}</span>
                        )}
                        <span className="text-[11px] text-stone-400">Qty: {order.quantity ?? 1}</span>
                        {order.delivery_zone && (
                          <span className="text-[11px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {order.delivery_zone}
                          </span>
                        )}
                      </div>

                      {/* Courier: Steadfast booking + live status */}
                      <div className="mt-3 pt-3 border-t border-stone-100 flex items-center gap-2 flex-wrap">
                        {order.tracking_code ? (
                          <>
                            <button
                              onClick={() => {
                                navigator.clipboard?.writeText(order.tracking_code!)
                                  .then(() => showToast('success', `Tracking code ${order.tracking_code} copied.`))
                                  .catch(() => showToast('info', `Tracking code: ${order.tracking_code}`));
                              }}
                              title="Click to copy tracking code"
                              className="flex items-center gap-1.5 text-[11px] font-mono bg-brand-50 text-brand-700 border border-brand-200 px-2 py-1 rounded-full hover:bg-brand-100 transition-colors"
                            >
                              <Truck className="w-3.5 h-3.5" /> {order.tracking_code}
                            </button>
                            <button
                              onClick={() => handleCheckSteadfastStatus(order)}
                              disabled={checkingSteadfast === order.id}
                              className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-brand-600 disabled:opacity-60 transition-colors"
                            >
                              {checkingSteadfast === order.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <RefreshCw className="w-3.5 h-3.5" />}
                              Refresh status
                            </button>
                            <a
                              href={`https://steadfast.com.bd/t/${order.tracking_code}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-stone-400 hover:text-brand-600 transition-colors"
                            >
                              Track ↗
                            </a>
                            <button
                              onClick={() => void handlePrintOrderLabel(order)}
                              disabled={printingLabels === order.id}
                              title="Print the Steadfast parcel sticker for this order"
                              className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-brand-600 disabled:opacity-60 transition-colors"
                            >
                              {printingLabels === order.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Printer className="w-3.5 h-3.5" />}
                              Print label
                            </button>
                          </>
                        ) : order.status === 'canceled' ? (
                          <span className="text-xs text-stone-400">Not booked with Steadfast</span>
                        ) : steadfastConfigured ? (
                          <button
                            onClick={() => handleSendToSteadfast(order)}
                            disabled={sendingToSteadfast === order.id}
                            title={order.courier_name === 'Store Pickup' ? 'Store-pickup order — no courier booking needed' : undefined}
                            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-3 py-1.5 rounded-full disabled:opacity-60 transition-all"
                          >
                            {sendingToSteadfast === order.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Truck className="w-3.5 h-3.5" />}
                            {sendingToSteadfast === order.id ? 'Booking…' : 'Book Steadfast pickup'}
                          </button>
                        ) : (
                          <span className="text-xs text-stone-400">Steadfast API keys not configured — add them to .env to book pickups.</span>
                        )}
                      </div>

                      {/* Delivery pipeline tracker (only for booked parcels) */}
                      {order.tracking_code && (() => {
                        const stageInfo = steadfastStageBadge(order.steadfast_status);
                        const stage = stageInfo?.stage ?? 'booked';
                        const activeIdx = stage === 'cancelled' ? -1 : STEADFAST_STAGE_ORDER.indexOf(stage as SteadfastStage);
                        return (
                          <div className={`mt-2 flex items-center gap-1 rounded-xl px-3 py-2 ${stage === 'cancelled' ? 'bg-red-50/60' : 'bg-stone-50/70'}`}>
                            {STEADFAST_STAGE_ORDER.map((s, i) => {
                              const done = activeIdx >= 0 && i < activeIdx;
                              const active = i === activeIdx;
                              return (
                                <div key={s} className="flex items-center flex-1 min-w-0">
                                  <div className="flex flex-col items-center flex-1 min-w-0">
                                    <span className={`w-2 h-2 rounded-full transition-colors ${
                                      done ? 'bg-emerald-500' : active ? (stage === 'delivered' ? 'bg-emerald-500' : 'bg-brand-500') : 'bg-stone-300'
                                    } ${active && stage !== 'delivered' ? 'animate-pulse' : ''}`} />
                                    <span className={`text-[9px] font-semibold uppercase tracking-wide mt-1 truncate w-full text-center ${
                                      done || active ? 'text-stone-700' : 'text-stone-400'
                                    }`}>
                                      {STEADFAST_STAGE_LABELS[s]}
                                    </span>
                                  </div>
                                  {i < STEADFAST_STAGE_ORDER.length - 1 && (
                                    <span className={`h-0.5 flex-1 max-w-[28px] rounded-full -mt-3 ${done ? 'bg-emerald-400' : 'bg-stone-200'}`} />
                                  )}
                                </div>
                              );
                            })}
                            {stage === 'cancelled' && (
                              <span className="text-[10px] font-bold text-red-500 uppercase ml-1 flex-shrink-0">Cancelled</span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Details: money + payment */}
                      <div className="mt-3 pt-3 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
                        <div>
                          <p className={ORD_LBL}>Total</p>
                          <p className="font-bold text-stone-900 text-sm">{order.total_amount != null ? `৳${Number(order.total_amount).toFixed(0)}` : `৳${pricing.total.toFixed(0)}`}</p>
                        </div>
                        <div>
                          <p className={ORD_LBL}>Due</p>
                          <p className={`font-bold text-sm ${order.due_amount != null && Number(order.due_amount) > 0 ? 'text-amber-600' : 'text-stone-900'}`}>
                            {order.due_amount != null ? `৳${Number(order.due_amount).toFixed(0)}` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className={ORD_LBL}>bKash</p>
                          <p className="font-medium text-stone-800 text-sm truncate">{order.bkash_number ?? '—'}</p>
                        </div>
                        <div>
                          <p className={ORD_LBL}>TrxID</p>
                          <p className="font-medium text-stone-800 text-sm truncate">{order.trx_id ?? '—'}</p>
                        </div>
                        <div>
                          <p className={ORD_LBL}>Payment</p>
                          <p className="font-medium text-stone-800 text-sm">
                            {order.payment_method === 'full_advance'
                              ? 'Full advance'
                              : order.payment_method === 'advance_partial'
                                ? 'COD + advance'
                                : order.payment_method === 'cash_on_delivery'
                                  ? 'Cash on delivery'
                                  : allNoAdvance([order.product_code], products)
                                    ? 'Cash on delivery'
                                    : '—'}
                            {order.advance_amount != null && Number(order.advance_amount) > 0 ? ` (৳${Number(order.advance_amount).toFixed(0)})` : ''}
                          </p>
                        </div>
                        <div>
                          <p className={ORD_LBL}>Delivery</p>
                          <p className="font-medium text-stone-800 text-sm truncate">{order.courier_name ?? '—'}</p>
                        </div>
                        {order.coupon_code && (
                          <div>
                            <p className={ORD_LBL}>Coupon</p>
                            <p className="font-medium text-emerald-600 text-sm">
                              {order.coupon_code}{order.discount_amount != null ? ` (−৳${Number(order.discount_amount).toFixed(0)})` : ''}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Address */}
                      <div className="mt-3 pt-3 border-t border-stone-100 flex items-start gap-3">
                        <p className={`${ORD_LBL} mt-0.5 flex-shrink-0`}>Address</p>
                        <p className="text-sm text-stone-700 break-words">{order.customer_address}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {orderTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
                  <button
                    onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                    disabled={orderSafePage === 1}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Prev
                  </button>
                  {pageNumbers(orderSafePage, orderTotalPages).map((n, i) =>
                    n === '…' ? (
                      <span key={`dots-${i}`} className="px-1 text-stone-400 text-sm">…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setOrderPage(n as number)}
                        className={`min-w-[2.5rem] px-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                          n === orderSafePage
                            ? 'bg-stone-900 text-white shadow-md'
                            : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setOrderPage((p) => Math.min(orderTotalPages, p + 1))}
                    disabled={orderSafePage === orderTotalPages}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* ── Coupons tab ── */}
        {tab === 'coupons' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">Coupon Codes</h2>
                <p className="text-sm text-stone-500 mt-0.5">Discount codes customers can apply on the checkout page.</p>
              </div>
              <button onClick={openAddCoupon}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <Plus className="w-4 h-4" /> Add Coupon
              </button>
            </div>

            {couponsUnavailable ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl px-4 py-3 text-sm">
                The coupons table doesn't exist yet. Run the migration
                <span className="font-mono text-xs"> 20260924000000_add_checkout_fields_and_coupons.sql</span> in the Supabase SQL editor first.
              </div>
            ) : (
              <>
                <div className="relative mb-6">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    value={couponSearch}
                    onChange={(e) => setCouponSearch(e.target.value)}
                    placeholder="Search by code..."
                    className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                  />
                </div>

                {coupons.filter((c) =>
                  c.code.toLowerCase().includes(couponSearch.trim().toLowerCase())
                ).length === 0 ? (
                  <EmptyState
                    icon={<Percent className="w-6 h-6" />}
                    title={couponSearch ? 'No coupons match your search.' : 'No coupons yet'}
                    hint={couponSearch ? 'Try a different search term.' : 'Add one to offer discounts at checkout.'}
                  />
                ) : (
                  <div className="space-y-3">
                    {coupons
                      .filter((c) => c.code.toLowerCase().includes(couponSearch.trim().toLowerCase()))
                      .map((coupon) => {
                        const expired = coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now();
                        const exhausted = coupon.max_uses != null && (coupon.times_used ?? 0) >= coupon.max_uses;
                        return (
                          <div key={coupon.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <p className="font-mono font-bold text-stone-900 text-sm tracking-wide">{coupon.code}</p>
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                    !coupon.is_active
                                      ? 'bg-stone-100 text-stone-500'
                                      : expired
                                        ? 'bg-red-50 text-red-500'
                                        : exhausted
                                          ? 'bg-amber-50 text-amber-600'
                                          : 'bg-emerald-100 text-emerald-600'
                                  }`}>
                                    {!coupon.is_active ? 'Inactive' : expired ? 'Expired' : exhausted ? 'Used up' : 'Active'}
                                  </span>
                                </div>
                                <p className="text-sm text-stone-700">
                                  {coupon.discount_type === 'percent' ? `${Number(coupon.value).toFixed(0)}% off` : `৳${Number(coupon.value).toFixed(0)} off`}
                                  {coupon.min_order_amount != null && <span className="text-stone-400"> · min order ৳{Number(coupon.min_order_amount).toFixed(0)}</span>}
                                </p>
                                {(coupon.product_codes?.length ?? 0) > 0 && (
                                  <p className="text-[11px] text-brand-600 mt-0.5 font-mono truncate">
                                    Only: {coupon.product_codes!.join(', ')}
                                  </p>
                                )}
                                <p className="text-[11px] text-stone-400 mt-0.5">
                                  Used {coupon.times_used ?? 0}{coupon.max_uses != null ? ` / ${coupon.max_uses}` : ''} times
                                  {coupon.expires_at && ` · expires ${new Date(coupon.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`}
                                </p>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button onClick={() => handleToggleCoupon(coupon)}
                                  title={coupon.is_active ? 'Deactivate' : 'Activate'}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    coupon.is_active
                                      ? 'text-emerald-500 bg-emerald-50 hover:bg-emerald-100'
                                      : 'text-stone-400 bg-stone-100 hover:bg-stone-200'
                                  }`}>
                                  <Power className="w-4 h-4" />
                                </button>
                                <button onClick={() => openEditCoupon(coupon)}
                                  className="p-1.5 text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-all">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDeleteCouponConfirm(coupon.id)}
                                  className="p-1.5 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Feedback tab ── */}
        {tab === 'feedback' && (
          <div>
            <div className="mb-6">
              <h2 className="font-display text-xl font-bold text-stone-900">Customer Feedback</h2>
              <p className="text-sm text-stone-500">
                {feedbackList.length} total{unreadFeedback > 0 && <span className="text-brand-600 font-medium"> • {unreadFeedback} unread</span>}
              </p>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={feedbackSearch}
                onChange={(e) => setFeedbackSearch(e.target.value)}
                placeholder="Search by name, email, or message..."
                className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              />
            </div>

            {filteredFeedback.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="w-6 h-6" />}
                title={feedbackSearch ? 'No feedback matches your search.' : 'No feedback yet'}
                hint={feedbackSearch ? 'Try a different search term.' : 'Customer messages will appear here.'}
              />
            ) : (
              <div className="space-y-3">
                {filteredFeedback.map((fb) => (
                  <div
                    key={fb.id}
                    className={`bg-white rounded-2xl shadow-sm border p-5 transition-shadow hover:shadow-md ${
                      fb.read ? 'border-stone-100' : 'border-brand-200 bg-brand-50/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          fb.read ? 'bg-stone-100' : 'bg-brand-100'
                        }`}>
                          <span className={`font-bold text-sm ${fb.read ? 'text-stone-500' : 'text-brand-600'}`}>
                            {fb.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-stone-900">{fb.name}</p>
                            {!fb.read && (
                              <span className="text-[10px] font-bold text-brand-600 bg-brand-100 px-2 py-0.5 rounded-full uppercase tracking-wide">New</span>
                            )}
                          </div>
                          <a href={`mailto:${fb.email}`} className="text-xs text-stone-500 hover:text-brand-600 transition-colors flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3" /> {fb.email}
                          </a>
                        </div>
                      </div>
                      <span className="text-xs text-stone-400 flex-shrink-0">
                        {new Date(fb.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-stone-100">
                      <p className={`text-sm text-stone-700 leading-relaxed ${expandedFeedback === fb.id ? '' : 'line-clamp-2'}`}>
                        {fb.message}
                      </p>
                      {fb.message.length > 100 && (
                        <button
                          onClick={() => setExpandedFeedback(expandedFeedback === fb.id ? null : fb.id)}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium mt-1"
                        >
                          {expandedFeedback === fb.id ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-stone-100 flex gap-2">
                      {!fb.read && (
                        <button
                          onClick={() => markFeedbackRead(fb.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 px-3 py-2 rounded-lg transition-all"
                        >
                          <CheckCheck className="w-3.5 h-3.5" /> Mark as read
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteFeedbackConfirm(fb.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
                 )}
           </div>
         )}

         {/* ── Settings tab ── */}
         {tab === 'settings' && (
           <div className="space-y-8">
             {/* ── Announcement Bar section ── */}
             <div>
               <div className="flex items-center justify-between mb-4">
                 <div>
                   <h2 className="font-display text-xl font-bold text-stone-900">Top Announcement Bar</h2>
                   <p className="text-sm text-stone-500 mt-1">Manage the text displayed in the scrolling announcement bar at the top of every page.</p>
                 </div>
                 <button onClick={openAddAnnouncement}
                   className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                   <Plus className="w-4 h-4" /> Add Announcement
                 </button>
               </div>

               {announcements.length === 0 ? (
                 <EmptyState
                   icon={<Bell className="w-6 h-6" />}
                   title="No announcements yet"
                   hint="Add one to display in the scrolling top bar."
                 />
               ) : (
                 <div className="space-y-3">
                   {announcements.map((ann) => (
                     <div key={ann.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 flex items-start justify-between gap-4 hover:shadow-md transition-shadow">
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-1.5">
                           <p className="font-medium text-stone-900 text-sm line-clamp-1">{ann.text}</p>
                           <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                             ann.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-500'
                           }`}>
                             {ann.is_active ? 'Active' : 'Inactive'}
                           </span>
                         </div>
                         <p className="text-[11px] text-stone-400">
                           {new Date(ann.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                         </p>
                       </div>
                       <div className="flex gap-1 flex-shrink-0">
                         <button onClick={() => openEditAnnouncement(ann)}
                           className="p-1.5 text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-all">
                           <Pencil className="w-4 h-4" />
                         </button>
                         <button onClick={() => setDeleteAnnConfirm(ann.id)}
                           className="p-1.5 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all">
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             {/* ── Hero Banner section ── */}
             <div>
               <h2 className="font-display text-xl font-bold text-stone-900">Hero Banner Background Images</h2>
               <p className="text-sm text-stone-500 mt-1">Set separate background images for the hero banner — one for mobile screens, one for desktop/laptop screens.</p>

               <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mt-4 space-y-6">

                 {/* Desktop image */}
                 <div className="space-y-3">
                   <div className="flex items-center gap-2">
                     <div className="w-7 h-7 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                       <Image className="w-4 h-4 text-brand-600" />
                     </div>
                     <div>
                       <p className="text-sm font-semibold text-stone-800">Desktop / Laptop Image</p>
                       <p className="text-xs text-stone-400">Shown on screens wider than 768px</p>
                     </div>
                   </div>
                   <ImageUploader
                     value={heroBgImage}
                     onChange={(url) => { setHeroBgImage(url); setHeroBgError(''); }}
                     folder="hero"
                     variant="block"
                     label="Desktop / Laptop Image"
                   />
                   <p className="text-xs text-stone-400">Recommended: <span className="font-medium">1600×900px</span> (landscape)</p>
                 </div>

                 <div className="border-t border-stone-100" />

                 {/* Mobile image */}
                 <div className="space-y-3">
                   <div className="flex items-center gap-2">
                     <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                       <Image className="w-4 h-4 text-amber-600" />
                     </div>
                     <div>
                       <p className="text-sm font-semibold text-stone-800">Mobile Image</p>
                       <p className="text-xs text-stone-400">Shown on screens up to 768px wide. Falls back to desktop image if left blank.</p>
                     </div>
                   </div>
                   <ImageUploader
                     value={heroBgMobileImage}
                     onChange={(url) => { setHeroBgMobileImage(url); setHeroBgError(''); }}
                     folder="hero"
                     variant="block"
                     label="Mobile Image"
                   />
                   <p className="text-xs text-stone-400">Recommended: <span className="font-medium">750×1000px</span> (portrait)</p>
                 </div>

                 {heroBgError && (
                   <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-2xl px-4 py-3">
                     <AlertCircle className="w-4 h-4 flex-shrink-0" /> {heroBgError}
                   </div>
                 )}

                 <button onClick={handleSaveHeroBg} disabled={heroBgSaving}
                   className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm">
                   {heroBgSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                   {heroBgSaving ? 'Saving...' : 'Save Hero Images'}
                 </button>
               </div>
             </div>

             {/* ── Steadfast courier rates ── */}
             <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
               <div className="px-6 py-5 border-b border-stone-100">
                 <h3 className="font-display text-lg font-bold text-stone-900">Steadfast Courier Rates</h3>
                 <p className="text-sm text-stone-500 mt-0.5">
                   Customers are charged by their district's zone at checkout. The advance they send via bKash equals this fee.
                 </p>
               </div>
               <div className="p-6 space-y-4">
                 {([
                   { key: 'dhaka_city' as const, label: 'Inside Dhaka', hint: 'Dhaka City', fallback: '60' },
                   { key: 'dhaka_suburban' as const, label: 'Dhaka Suburban', hint: 'Gazipur, Narayanganj, Savar, Munshiganj…', fallback: '110' },
                   { key: 'outside_dhaka' as const, label: 'Outside Dhaka', hint: 'Chattogram, Sylhet, Khulna, Rajshahi…', fallback: '130' },
                 ]).map((z) => (
                   <div key={z.key}>
                     <label className="block text-sm font-medium text-stone-700 mb-1.5">{z.label}</label>
                     <div className="relative">
                       <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">৳</span>
                       <input
                         type="number"
                         min="0"
                         value={steadfastRates[z.key]}
                         onChange={(e) => setSteadfastRates({ ...steadfastRates, [z.key]: e.target.value })}
                         className="w-full border border-stone-200 rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                       />
                     </div>
                     <p className="text-xs text-stone-400 mt-1">{z.hint}{steadfastRates[z.key] === '' ? ` — defaults to ৳${z.fallback} if left blank` : ''}</p>
                   </div>
                 ))}
                 <div>
                   <label className="block text-sm font-medium text-stone-700 mb-1.5">Merchant ID</label>
                   <input
                     type="text"
                     value={merchantId}
                     onChange={(e) => setMerchantId(e.target.value)}
                     placeholder="e.g. 8JFK3PPH"
                     className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-400"
                   />
                   <p className="text-xs text-stone-400 mt-1">Printed on parcel labels ("Merchant ID: …"). Find it in your Steadfast merchant dashboard or on any old sticker.</p>
                 </div>
                 <button onClick={handleSaveSteadfastRates} disabled={steadfastSaving}
                   className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm">
                   {steadfastSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                   {steadfastSaving ? 'Saving...' : 'Save Courier Rates'}
                 </button>
               </div>
             </div>
           </div>
         )}
       </div>

      {/* ── Product modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-4 animate-fade-in-up">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
              <h3 className="font-display text-lg font-bold text-stone-900">
                {modalMode === 'add' ? 'Add New Product' : 'Edit Product'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Title *</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="Product name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Product Code <span className="text-stone-400 font-normal">(optional — auto-generated if left blank, e.g. PRD-00001)</span>
                </label>
                <input type="text" value={form.product_code} onChange={(e) => setForm({ ...form, product_code: e.target.value })}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="e.g. PRD-00001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3} placeholder="Describe your product..."
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Price (৳) *</label>
                  <input type="number" min="0" step="1" value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Stock <span className="text-stone-400 font-normal">(optional)</span>
                  </label>
                  {(() => {
                    const parsedSizes = form.sizes.split(',').map((s) => s.trim()).filter(Boolean);
                    const computed = parsedSizes.reduce((sum, size) => sum + (Number(sizeQuantities[size]) || 0), 0);
                    const isSized = parsedSizes.length > 0;
                    return (
                      <>
                        <input type="number" min="0" value={isSized ? String(computed) : form.stock_count}
                          onChange={(e) => setForm({ ...form, stock_count: e.target.value })}
                          disabled={isSized}
                          className={`w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 ${isSized ? 'bg-stone-100 text-stone-500' : ''}`}
                          placeholder="0" />
                        <p className="text-xs text-stone-400 mt-1">
                          {isSized
                            ? 'Auto-calculated from size quantities above'
                            : 'Only for products without sizes — sized products calculate this automatically'}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Discount Price (৳) <span className="text-stone-400 font-normal">(optional — leave blank for no discount)</span>
                </label>
                <input type="number" min="0" step="1" value={form.discount_price}
                  onChange={(e) => setForm({ ...form, discount_price: e.target.value })}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="Leave blank for no discount" />
                {form.discount_price && form.price && Number(form.discount_price) < Number(form.price) && (
                  <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Customer saves ৳{(Number(form.price) - Number(form.discount_price)).toFixed(0)}
                    ({Math.round((1 - Number(form.discount_price) / Number(form.price)) * 100)}% off)
                  </p>
                )}
              </div>
              {/* No-advance (pure cash on delivery) toggle */}
              <div className={`rounded-2xl border p-4 transition-colors ${
                form.advance_optional ? 'border-emerald-200 bg-emerald-50/50' : 'border-stone-200 bg-stone-50/50'
              }`}>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.advance_optional}
                    onChange={(e) => setForm({ ...form, advance_optional: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-400 accent-emerald-500"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      No advance payment — cash on delivery only
                    </span>
                    <span className="block text-xs text-stone-500 mt-1 leading-relaxed">
                      Customers can order this product without sending any bKash advance — no bKash number or TrxID asked at checkout. They pay the full amount in cash on delivery.
                    </span>
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                  <option value="">-- No category --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <p className="text-xs text-stone-400 mt-1">
                    No categories yet. Add them in the Categories tab first.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Sizes <span className="text-stone-400 font-normal">(comma-separated, e.g. S, M, L, XL)</span>
                </label>
                <input type="text" value={form.sizes} onChange={(e) => {
                  const val = e.target.value;
                  setForm({ ...form, sizes: val });
                  const parsed = val.split(',').map((s) => s.trim()).filter(Boolean);
                  setSizeQuantities((prev) => {
                    const next: Record<string, string> = {};
                    parsed.forEach((size) => {
                      next[size] = prev[size] ?? '0';
                    });
                    return next;
                  });
                }}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="S, M, L, XL" />
                {form.sizes.trim() && (() => {
                  const parsed = form.sizes.split(',').map((s) => s.trim()).filter(Boolean);
                  return parsed.length > 0 ? (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {parsed.map((size) => (
                        <div key={size} className="flex items-center gap-2 bg-stone-50 rounded-xl px-3 py-2 border border-stone-100">
                          <span className="text-xs font-semibold text-stone-600 uppercase w-8">{size}</span>
                          <input type="number" min="0" value={sizeQuantities[size] ?? '0'}
                            onChange={(e) => setSizeQuantities((prev) => ({ ...prev, [size]: e.target.value }))}
                            className="w-full border border-stone-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-brand-400"
                            placeholder="Qty" />
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-stone-700">
                    Product Images <span className="text-stone-400 font-normal">(image URLs)</span>
                  </label>
                  <button onClick={() => setImageUrls([...imageUrls, ''])}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add image
                  </button>
                </div>
                <div className="space-y-2">
                  {imageUrls.map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <ImageUploader
                        value={url}
                        onChange={(newUrl) => {
                          const next = [...imageUrls];
                          next[i] = newUrl;
                          setImageUrls(next);
                        }}
                        folder="products"
                      />
                      {imageUrls.length > 1 && (
                        <button onClick={() => setImageUrls(imageUrls.filter((_, j) => j !== i))}
                          className="text-stone-400 hover:text-red-500 transition-colors flex-shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {formError && (
                <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-2xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {formError}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 pt-4 border-t border-stone-100 flex gap-3">
              <button onClick={() => setModalOpen(false)}
                className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-3 rounded-2xl transition-all text-sm">
                Cancel
              </button>
              <button onClick={handleSaveProduct} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold py-3 rounded-2xl transition-all text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category modal ── */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-fade-in-up">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
              <h3 className="font-display text-lg font-bold text-stone-900">
                {catModalMode === 'add' ? 'Add Category' : 'Edit Category'}
              </h3>
              <button onClick={() => setCatModalOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Category Name *</label>
                <input type="text" value={catName} onChange={(e) => { setCatName(e.target.value); setCatError(''); }}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="e.g. T-Shirt, Hoodie, Shirt" autoFocus />
              </div>

              <div>
                <ImageUploader
                  value={catBackgroundImage}
                  onChange={setCatBackgroundImage}
                  folder="categories"
                  variant="block"
                  label="Background Image"
                />
                <p className="text-xs text-stone-500 mt-1.5">
                  Recommended size: <span className="font-medium">800×1000px</span> (3:4 aspect ratio, portrait)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Priority
                </label>
                <input
                  type="number"
                  value={catPriority}
                  onChange={(e) => setCatPriority(e.target.value)}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="Lower number = higher priority (e.g. 1, 2, 3)"
                  min="0"
                />
                <p className="text-xs text-stone-500 mt-1.5">
                  Optional — categories with lower numbers appear first on the collections page.
                </p>
              </div>

              {/* Hide from storefront */}
              <div className={`rounded-2xl border p-4 transition-colors ${
                catHidden ? 'border-amber-200 bg-amber-50/50' : 'border-stone-200 bg-stone-50/50'
              }`}>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={catHidden}
                    onChange={(e) => { setCatHidden(e.target.checked); setCatError(''); }}
                    className="mt-0.5 w-4 h-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400 accent-amber-500"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
                      <EyeOff className="w-4 h-4 text-amber-600" />
                      Hide this category from the store
                    </span>
                    <span className="block text-xs text-stone-500 mt-1 leading-relaxed">
                      Hidden categories disappear from the navbar, home page and shop filters. Anyone with a direct link can still view the collection, and you can unhide it anytime.
                    </span>
                  </span>
                </label>
              </div>

              {catError && (
                <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-2xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {catError}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 pt-2 border-t border-stone-100 flex gap-3">
              <button onClick={() => setCatModalOpen(false)}
                className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-3 rounded-2xl transition-all text-sm">
                Cancel
              </button>
              <button onClick={handleSaveCat} disabled={catSaving}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold py-3 rounded-2xl transition-all text-sm">
                {catSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {catSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center animate-fade-in-up">
            <div className="flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="font-display text-lg font-bold text-stone-900 mb-2">
              Delete {deleteConfirm.type === 'category' ? 'Category' : 'Product'}?
            </h3>
            <p className="text-stone-400 text-sm mb-6">
              {deleteConfirm.type === 'category'
                ? 'Products in this category will become uncategorized.'
                : 'This will permanently remove the product and all its images.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-2.5 rounded-2xl transition-all text-sm">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-2xl transition-all text-sm">
                Delete
              </button>
            </div>
          </div>
          </div>
        )}

        {/* ── Cancel order confirm ── */}
        {cancelOrderConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center animate-fade-in-up">
              <div className="flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mx-auto mb-4">
                <XCircle className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-stone-900 mb-2">Cancel this order?</h3>
              <p className="text-stone-400 text-sm mb-6">
                The customer's order will be marked as canceled. You can set it back to pending later if needed.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setCancelOrderConfirm(null)}
                  className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-2.5 rounded-2xl transition-all text-sm">
                  Keep Order
                </button>
                <button
                  onClick={() => { const id = cancelOrderConfirm; setCancelOrderConfirm(null); if (id) void applyOrderStatus(id, 'canceled'); }}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-2xl transition-all text-sm">
                  Cancel Order
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete order confirm ── */}
        {deleteOrderConfirm && (() => {
          const target = orders.find((o) => o.id === deleteOrderConfirm);
          return (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center animate-fade-in-up">
                <div className="flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mx-auto mb-4">
                  <Trash2 className="w-7 h-7 text-red-500" />
                </div>
                <h3 className="font-display text-lg font-bold text-stone-900 mb-2">Delete this order?</h3>
                <p className="text-stone-400 text-sm mb-1">
                  {target ? (
                    <>
                      <span className="font-medium text-stone-600">{target.customer_name}</span>
                      {' '}— {target.product_title}
                    </>
                  ) : (
                    'This order'
                  )}
                </p>
                <p className="text-stone-400 text-sm mb-6">This permanently removes the order record. This cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={() => setDeleteOrderConfirm(null)}
                    className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-2.5 rounded-2xl transition-all text-sm">
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteOrder(deleteOrderConfirm)}
                    disabled={deletingOrder === deleteOrderConfirm}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-70 text-white font-semibold py-2.5 rounded-2xl transition-all text-sm"
                  >
                    {deletingOrder === deleteOrderConfirm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {deletingOrder === deleteOrderConfirm ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Delete feedback confirm ── */}
        {deleteFeedbackConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center animate-fade-in-up">
              <div className="flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-stone-900 mb-2">Delete Feedback?</h3>
              <p className="text-stone-400 text-sm mb-6">This message will be permanently removed.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteFeedbackConfirm(null)}
                  className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-2.5 rounded-2xl transition-all text-sm">
                  Cancel
                </button>
                <button onClick={() => handleDeleteFeedback(deleteFeedbackConfirm)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-2xl transition-all text-sm">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Coupon modal ── */}
        {couponModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-fade-in-up">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
                <h3 className="font-display text-lg font-bold text-stone-900">
                  {couponModalMode === 'add' ? 'Add Coupon' : 'Edit Coupon'}
                </h3>
                <button onClick={() => setCouponModalOpen(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Coupon Code *</label>
                  <input
                    type="text"
                    value={couponForm.code}
                    onChange={(e) => { setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() }); setCouponError(''); }}
                    placeholder="e.g. SUMMER20"
                    maxLength={24}
                    className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm font-mono uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <p className="text-xs text-stone-500 mt-1.5">3–24 characters — letters, numbers, hyphens or underscores. Customers type this at checkout.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Discount Type *</label>
                    <select
                      value={couponForm.discount_type}
                      onChange={(e) => { setCouponForm({ ...couponForm, discount_type: e.target.value as 'percent' | 'fixed' }); setCouponError(''); }}
                      className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <option value="percent">Percentage (%)</option>
                      <option value="fixed">Fixed amount (৳)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      {couponForm.discount_type === 'percent' ? 'Percent Off *' : 'Amount Off (৳) *'}
                    </label>
                    <input
                      type="number"
                      value={couponForm.value}
                      onChange={(e) => { setCouponForm({ ...couponForm, value: e.target.value }); setCouponError(''); }}
                      placeholder={couponForm.discount_type === 'percent' ? 'e.g. 20' : 'e.g. 100'}
                      min="0"
                      step={couponForm.discount_type === 'percent' ? '1' : '0.01'}
                      className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Min Order (৳)</label>
                    <input
                      type="number"
                      value={couponForm.min_order_amount}
                      onChange={(e) => setCouponForm({ ...couponForm, min_order_amount: e.target.value })}
                      placeholder="Optional"
                      min="0"
                      className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Max Uses</label>
                    <input
                      type="number"
                      value={couponForm.max_uses}
                      onChange={(a) => setCouponForm({ ...couponForm, max_uses: a.target.value })}
                      placeholder="Optional — unlimited"
                      min="1"
                      className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={couponForm.expires_at}
                    onChange={(e) => setCouponForm({ ...couponForm, expires_at: e.target.value })}
                    className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <p className="text-xs text-stone-500 mt-1.5">Optional — coupon works until end of this day (Bangladesh time).</p>
                </div>

                {/* Product restriction */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Apply To Products</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCodeInput}
                      onChange={(e) => { setCouponCodeInput(e.target.value.toUpperCase()); setCouponError(''); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addCouponProductCode();
                        }
                      }}
                      placeholder="Product code, e.g. PRD-1001"
                      className="flex-1 min-w-0 border border-stone-200 rounded-2xl px-4 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <button
                      type="button"
                      onClick={addCouponProductCode}
                      className="px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-sm font-semibold transition-all flex-shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  {couponProductCodes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {couponProductCodes.map((code) => (
                        <span key={code} className="inline-flex items-center gap-1 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-mono font-semibold px-2.5 py-1 rounded-full">
                          {code}
                          <button type="button" onClick={() => removeCouponProductCode(code)} className="text-brand-400 hover:text-brand-700 transition-colors" aria-label={`Remove ${code}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCouponProductCodes([])}
                        className="text-xs text-stone-400 hover:text-red-500 underline underline-offset-2 transition-colors"
                      >
                        Clear all
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-500 mt-1.5">
                      Leave empty for the coupon to work on <span className="font-semibold">all products</span>. Add product codes (like PRD-1001) to restrict it to specific items.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="coupon-active"
                    checked={couponForm.is_active}
                    onChange={(e) => setCouponForm({ ...couponForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-stone-300 text-brand-500 focus:ring-brand-400"
                  />
                  <label htmlFor="coupon-active" className="text-sm font-medium text-stone-700 cursor-pointer">
                    Active — customers can use this coupon
                  </label>
                </div>

                {couponError && (
                  <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-2xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {couponError}
                  </div>
                )}
              </div>
              <div className="px-6 pb-6 pt-4 border-t border-stone-100 flex gap-3">
                <button onClick={() => setCouponModalOpen(false)}
                  className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-3 rounded-2xl transition-all text-sm">
                  Cancel
                </button>
                <button onClick={handleSaveCoupon} disabled={couponSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold py-3 rounded-2xl transition-all text-sm">
                  {couponSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {couponSaving ? 'Saving...' : 'Save Coupon'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete coupon confirm ── */}
        {deleteCouponConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center animate-fade-in-up">
              <div className="flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-stone-900 mb-2">Delete Coupon?</h3>
              <p className="text-stone-400 text-sm mb-6">Customers will no longer be able to use this code.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteCouponConfirm(null)}
                  className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-2.5 rounded-2xl transition-all text-sm">
                  Cancel
                </button>
                <button onClick={() => handleDeleteCoupon(deleteCouponConfirm)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-2xl transition-all text-sm">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Announcement modal ── */}
        {annModalOpen && (
         <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-fade-in-up">
             <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
               <h3 className="font-display text-lg font-bold text-stone-900">
                 {annModalMode === 'add' ? 'Add Announcement' : 'Edit Announcement'}
               </h3>
               <button onClick={() => setAnnModalOpen(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                 <X className="w-5 h-5" />
               </button>
             </div>
             <div className="px-6 py-5 space-y-4">
               <div>
                 <label className="block text-sm font-medium text-stone-700 mb-1.5">Announcement Text *</label>
                 <textarea
                   value={annText}
                   onChange={(e) => { setAnnText(e.target.value); setAnnError(''); }}
                   rows={3}
                   placeholder="e.g. ⚡ FREE SHIPPING NATIONWIDE ⚡  •  NEW ARRIVALS EVERY WEEK  •"
                   className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                 />
                 <p className="text-xs text-stone-500 mt-1.5">
                   This text will scroll continuously in the top announcement bar on all pages.
                 </p>
               </div>

               <div className="flex items-center gap-3">
                 <input
                   type="checkbox"
                   id="ann-active"
                   checked={annActive}
                   onChange={(e) => setAnnActive(e.target.checked)}
                   className="w-4 h-4 rounded border-stone-300 text-brand-500 focus:ring-brand-400"
                 />
                 <label htmlFor="ann-active" className="text-sm font-medium text-stone-700 cursor-pointer">
                   Active — show this announcement in the bar
                 </label>
               </div>

               {annError && (
                 <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-2xl px-4 py-3">
                   <AlertCircle className="w-4 h-4 flex-shrink-0" /> {annError}
                 </div>
               )}
             </div>
             <div className="px-6 pb-6 pt-4 border-t border-stone-100 flex gap-3">
               <button onClick={() => setAnnModalOpen(false)}
                 className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-3 rounded-2xl transition-all text-sm">
                 Cancel
               </button>
               <button onClick={handleSaveAnnouncement} disabled={annSaving}
                 className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold py-3 rounded-2xl transition-all text-sm">
                 {annSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                 {annSaving ? 'Saving...' : 'Save Announcement'}
               </button>
             </div>
           </div>
         </div>
       )}

       {/* ── Delete announcement confirm ── */}
       {deleteAnnConfirm && (
         <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center animate-fade-in-up">
             <div className="flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mx-auto mb-4">
               <Trash2 className="w-7 h-7 text-red-500" />
             </div>
             <h3 className="font-display text-lg font-bold text-stone-900 mb-2">Delete Announcement?</h3>
             <p className="text-stone-400 text-sm mb-6">This announcement will be permanently removed from the bar.</p>
             <div className="flex gap-3">
               <button onClick={() => setDeleteAnnConfirm(null)}
                 className="flex-1 border border-stone-200 text-stone-600 hover:bg-stone-50 font-semibold py-2.5 rounded-2xl transition-all text-sm">
                 Cancel
               </button>
               <button onClick={() => handleDeleteAnnouncement(deleteAnnConfirm)}
                 className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-2xl transition-all text-sm">
                 Delete
               </button>
             </div>
           </div>
         </div>
       )}

      {/* ── Toasts ── */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
     </div>
  );
}
