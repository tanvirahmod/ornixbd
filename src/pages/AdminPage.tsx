import { useState, useEffect, useMemo, useRef } from 'react';import {
  Lock, LogOut, Plus, Pencil, Trash2, X, Loader2, Ruler, ShieldCheck,
   Package, ShoppingBag, Eye, Image, Save, AlertCircle, Tag, Search,
   Bell, CheckCheck, CheckCircle2, Truck, Clock, MessageSquare, Mail, Settings, Minus, RefreshCw, ChevronDown, XCircle, Percent, Power, AlertTriangle, Banknote, EyeOff, Link2, MapPin, Printer, ChevronRight, Download, TrendingUp, TrendingDown, Users, Store, FileDown
} from 'lucide-react';
import { supabase, Product, ProductSize, Order, OrderStatus, Category, Feedback, Announcement, SiteSetting, Coupon, AdminLog, StockMovement, Expense, Seller, SizeChartTemplate } from '../lib/supabase';
import { createSteadfastConsignment, checkSteadfastStatus, steadfastStatusMeta, steadfastConfigured, steadfastStageBadge, SteadfastStage, getSteadfastBalance } from '../lib/steadfast';
import ImageUploader from '../components/ImageUploader';
import { zoneForDistrict, DELIVERY_ZONES, type DeliveryZone } from '../components/ZoneSelect';
import { DISTRICT_NAMES_BN } from '../lib/districtNamesBn';
import ThanaSelect from '../components/ThanaSelect';
import { formatBDT, ORD_LBL, ORDER_STATUS_PILL, FinCard, FinDelta, DailyBars, EmptyState, ToastStack, nextToastId, type Toast } from '../admin/ui';
import { printLabels } from '../lib/parcelLabel';
import { toAsciiDigits } from './CheckoutPage';
import { printManualOrdersReport, manualOrderInDateRange } from '../lib/manualOrdersReport';
import { useAdminAuth, ALL_CAPABILITIES } from '../lib/useAdminAuth';
import { useNavigation } from '../lib/navigation';
import { WHATSAPP_ORDER_KEY, WHATSAPP_CHAT_KEY, normalizeWhatsAppNumber } from '../lib/whatsapp';

type Tab = 'products' | 'stock' | 'categories' | 'orders' | 'manual' | 'finance' | 'coupons' | 'feedback' | 'settings';
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
  cost_price: '',
  sizes: '',
  stock_count: '',
  category_id: '',
  product_code: '',
  advance_optional: false,
  size_chart_template_id: '',
};

// True when every ordered line item is a no-advance (pure cash on delivery) product
const allNoAdvance = (codes: Array<string | null>, products: Product[]) => {
  const set = new Set(products.filter((p) => p.advance_optional).map((p) => (p.product_code ?? '').toUpperCase()));
  return codes.length > 0 && codes.every((c) => c && set.has(c.toUpperCase()));
};

// Zone group headings for the manual-order district dropdown (same grouping as checkout)
const ZONE_GROUP_LABELS: Record<DeliveryZone, string> = {
  dhaka_city: 'Inside Dhaka',
  dhaka_suburban: 'Dhaka Suburban',
  outside_dhaka: 'Outside Dhaka',
};

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


export default function AdminPage() {
  const onNavigate = useNavigation();
  // ── Supabase Auth login (session + admin allowlist enforced server-side) ──
  const { authReady, isAuthenticated, adminEmail, isSuperAdmin, isAdminOf, reloadPermissions, signIn, signOut } = useAdminAuth();
  const [currentAdminId, setCurrentAdminId] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [loginError, setLoginError] = useState('');
  useEffect(() => {
    if (adminEmail) setCurrentAdminId(adminEmail);
  }, [adminEmail]);

  const [tab, setTab] = useState<Tab>('products');

  // If the signed-in admin lacks permission for the current tab, fall back to
  // the first tab they can use (e.g. after the super admin restricts them).
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (!isAdminOf(tab)) {
      const fallback = (['products', 'stock', 'categories', 'orders', 'manual', 'finance', 'coupons', 'feedback', 'settings'] as Tab[])
        .find((t) => isAdminOf(t));
      if (fallback) setTab(fallback);
    }
  }, [authReady, isAuthenticated, tab, isAdminOf]);
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

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'product' | 'category' | 'size_chart'; id: string } | null>(null);

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

  // ── Finance tab state ──
  const [finRange, setFinRange] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('all');
  const [finFrom, setFinFrom] = useState('');
  const [finTo, setFinTo] = useState('');
  const [expandedLedger, setExpandedLedger] = useState<string | null>(null);

  // ── Bulk order actions ──
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | 'book' | 'deliver' | 'cancel' | 'delete'>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // ── COD reconciliation ──
  const [sfBalance, setSfBalance] = useState<number | null>(null);
  const [sfBalanceLoading, setSfBalanceLoading] = useState(false);
  const [sfBalanceError, setSfBalanceError] = useState('');

  // ── Expenses (Finance tab) ──
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseForm, setExpenseForm] = useState({ title: '', amount: '', note: '', spent_at: '' });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  // ── Activity log & stock movement history ──
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [activityAdminFilter, setActivityAdminFilter] = useState('all');
  // ── Settings sub-tabs (organized sections) ──
  const [settingsTab, setSettingsTab] = useState<'storefront' | 'delivery' | 'inventory' | 'activity' | 'team'>('storefront');

  // ── Team management (super admin only) ──
  const [teamRows, setTeamRows] = useState<{ email: string; role: 'super_admin' | 'admin'; permissions: Record<string, boolean> }[]>([]);
  const [teamBusy, setTeamBusy] = useState('');
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [newTeamRole, setNewTeamRole] = useState<'admin' | 'super_admin'>('admin');
  // Activity log narrowed by the Settings "filter by admin" dropdown
  const filteredActivityLogs = useMemo(() => {
    if (activityAdminFilter === 'all') return adminLogs;
    return adminLogs.filter((l) => (l.admin_id ?? '').trim() === activityAdminFilter);
  }, [adminLogs, activityAdminFilter]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [movementProductId, setMovementProductId] = useState<string | null>(null);
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
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [thresholdInput, setThresholdInput] = useState('5');
  const [thresholdSaving, setThresholdSaving] = useState(false);

  // ── WhatsApp numbers (storefront chat bubble + product-page order button) ──
  const [waNumbers, setWaNumbers] = useState({ order: '', chat: '' });
  const [waSaving, setWaSaving] = useState(false);

  // ── Manual (in-store) orders ──
  // One line per product: a sale can mix several products / sizes.
  type ManualLine = { product_id: string; product_code: string; size: string; quantity: string; amount: string };
  const [manualLines, setManualLines] = useState<ManualLine[]>([{ product_id: '', product_code: '', size: '', quantity: '1', amount: '' }]);
  const [manualForm, setManualForm] = useState({
    customer_name: '', customer_phone: '',
    seller_name: '', bkash: '',
    district: '', thana: '', address: '',
  });
  // ── Size chart templates (reusable measurement charts) ──
  const [sizeCharts, setSizeCharts] = useState<SizeChartTemplate[]>([]);
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [chartModalMode, setChartModalMode] = useState<'add' | 'edit'>('add');
  const [editingChart, setEditingChart] = useState<SizeChartTemplate | null>(null);
  const [chartName, setChartName] = useState('');
  const [chartNote, setChartNote] = useState('');
  const [chartRows, setChartRows] = useState<string[]>(['Chest', 'Length']);
  const [chartSizes, setChartSizes] = useState<string[]>(['M', 'L', 'XL']);
  const [chartValues, setChartValues] = useState<Record<string, Record<string, string>>>({});
  const [chartSaving, setChartSaving] = useState(false);
  const [chartError, setChartError] = useState('');
  const [chartManagerOpen, setChartManagerOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  // Saved seller names for the Manual Orders dropdown (sellers table)
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [deletingSeller, setDeletingSeller] = useState<string | null>(null); // seller id while deleting
  const [hiddenSellers, setHiddenSellers] = useState<Set<string>>(new Set()); // unsaved names hidden via ✕
  // PDF report filters (seller + date range)
  const [reportSeller, setReportSeller] = useState(''); // '' = all sellers
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [sellerDropdownOpen, setSellerDropdownOpen] = useState(false);
  const [merchantId, setMerchantId] = useState('');
  // bKash number shown on checkout for the delivery-fee advance (site_settings)
  const [checkoutBkash, setCheckoutBkash] = useState('');
  const [checkoutNagad, setCheckoutNagad] = useState('');
  const [labelFrom, setLabelFrom] = useState('');
  const [labelTo, setLabelTo] = useState('');
  const [printingLabels, setPrintingLabels] = useState<string | null>(null); // 'bulk' | order id
  const [steadfastSaving, setSteadfastSaving] = useState(false);

  // ── Toasts ──
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (kind: Toast['kind'], text: string) => {
    const id = nextToastId();
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };
  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ── Audit trail helpers (best-effort: never block the action itself) ──
  const logAdmin = async (action: string, target?: string | null, detail?: string | null) => {
    if (!currentAdminId) return;
    try {
      // SECURITY DEFINER RPC: works for every allowlisted admin (a direct
      // insert is RLS-blocked without the Settings capability) and forces
      // admin_id to the caller's own email so trails can't be forged.
      const { error } = await supabase.rpc('log_admin_activity', { p_action: action, p_target: target ?? null, p_detail: detail ?? null });
      if (error) {
        console.warn('Activity log insert failed:', error.message);
        return; // realtime insert will be missing too — but logging never blocks the action
      }
      setAdminLogs((prev) => [
        { id: `local-${Date.now()}-${Math.random()}`, admin_id: currentAdminId, action, target: target ?? null, detail: detail ?? null, created_at: new Date().toISOString() },
        ...prev,
      ]);
    } catch {
      // logging must never break the underlying action
    }
  };

  // Record a stock change (fires only once the stock_movements table exists)
  const stockDelta = async (productId: string, size: string | null, delta: number, reason: string, note?: string | null) => {
    try {
      await supabase.from('stock_movements').insert({ product_id: productId, size, delta, reason, note: note ?? null, admin_id: currentAdminId || null });
      setStockMovements((prev) => [
        { id: `local-${Date.now()}-${Math.random()}`, product_id: productId, size, delta, reason, note: note ?? null, admin_id: currentAdminId || null, created_at: new Date().toISOString() },
        ...prev,
      ]);
    } catch {
      // movement history is best-effort until the migration runs
    }
  };

  // Website orders only — in-store sales have their own tab and must not
  // clutter the Orders tab (Finance still counts every order).
  const storeOrders = useMemo(
    () => orders.filter((o) => o.order_source !== 'manual'),
    [orders]
  );
  // ── Dashboard at-a-glance stats (Orders tab is website orders only) ──
  const pendingOrders = storeOrders.filter((o) => o.status === 'pending').length;
  const deliveredOrders = storeOrders.filter((o) => o.status === 'delivered').length;
  const canceledOrders = storeOrders.filter((o) => o.status === 'canceled').length;
  const manualOrders = orders.filter((o) => o.order_source === 'manual');
  const manualToday = manualOrders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString());
  // Dropdown names = saved sellers table + anyone already on an order (de-duped, A→Z)
  const knownSellers = useMemo(() => {
    const seen = new Set<string>();
    const out: Seller[] = sellers.map((s) => ({ ...s }));
    for (const s of sellers) seen.add(s.name.toLowerCase());
    for (const o of manualOrders) {
      const name = (o.seller_name ?? '').trim();
      if (name && !seen.has(name.toLowerCase()) && !hiddenSellers.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        out.push({ id: `order-${o.id}`, name, created_at: o.created_at });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [sellers, manualOrders, hiddenSellers]);
  // Apply the PDF report filters
  const reportOrders = useMemo(() => {
    const parseDay = (v: string, endOfDay: boolean) => {
      if (!v) return null;
      const d = new Date(`${v}T00:00:00`);
      if (isNaN(d.getTime())) return null;
      return endOfDay ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : d;
    };
    const from = parseDay(reportFrom, false);
    const to = parseDay(reportTo, true);
    return manualOrders.filter(
      (o) =>
        (!reportSeller || (o.seller_name ?? '').trim() === reportSeller) &&
        manualOrderInDateRange(o, from, to)
    );
  }, [manualOrders, reportSeller, reportFrom, reportTo]);

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
  for (const o of storeOrders) stageCounts[stageOfOrder(o)] += 1;
  const trackedCount = storeOrders.filter((o) => o.tracking_code).length;

  // ── Inventory aggregates (Finance tab) ──
  const lowStockProducts = useMemo(
    () => products.filter((p) => p.stock_count <= lowStockThreshold).sort((a, b) => a.stock_count - b.stock_count),
    [products, lowStockThreshold]
  );
  // Badge on the Stock tab: same definition as the Finance "Low stock items" card
  const lowStockCount = lowStockProducts.length;
  const stockValue = useMemo(
    () => products.reduce((sum, p) => {
      const unit = p.discount_price != null && p.discount_price < p.price ? Number(p.discount_price) : Number(p.price);
      return sum + unit * p.stock_count;
    }, 0),
    [products]
  );
  // Cash currently riding with the courier: booked, not yet delivered/cancelled
  const pendingCod = useMemo(() => {
    let amount = 0;
    let count = 0;
    for (const o of orders) {
      if (!o.tracking_code || o.status === 'canceled' || o.status === 'delivered') continue;
      const b = steadfastStageBadge(o.steadfast_status);
      if (b && (b.stage === 'delivered' || b.stage === 'cancelled')) continue;
      amount += Number(o.due_amount ?? 0);
      count += 1;
    }
    return { amount, count };
  }, [orders]);
  void pendingCod; // reserved for the courier-cash section header

  // ── COD reconciliation: where is the cash? ──
  const codRecon = useMemo(() => {
    let collected = 0;     // delivered & paid (cash received or confirmed by courier)
    let collectedCount = 0;
    let pending = 0;       // booked, in transit — cash with the courier
    let pendingCount = 0;
    let returned = 0;      // cancelled parcels — no cash
    let returnedCount = 0;
    for (const o of orders) {
      if (!o.tracking_code || o.status === 'canceled') continue;
      const cod = Math.max(0, Number(o.due_amount ?? 0));
      const b = steadfastStageBadge(o.steadfast_status);
      const stage = b?.stage ?? 'booked';
      if (stage === 'delivered' || o.status === 'delivered') {
        collected += cod;
        collectedCount += 1;
      } else if (stage === 'cancelled') {
        returned += cod;
        returnedCount += 1;
      } else {
        pending += cod;
        pendingCount += 1;
      }
    }
    return { collected, collectedCount, pending, pendingCount, returned, returnedCount };
  }, [orders]);

  const filteredOrders = storeOrders.filter((o) => {
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
    storeOrders
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

  // First day (ISO) of the selected finance range — '' for all-time/custom
  const rangeStartISO = () => {
    if (finRange === 'today') return dayOffsetISO(0);
    if (finRange === 'week') { const d = new Date(); return dayOffsetISO(-d.getDay()); }
    if (finRange === 'month') { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
    return '';
  };

  // ── Finance & inventory aggregates (all derived from already-fetched orders/products) ──
  const financeOrders = useMemo(() => {
    if (finRange === 'all') return orders.filter((o) => o.status !== 'canceled');
    let fromTs: number | null = null;
    let toTs: number | null = null;
    if (finRange === 'custom') {
      fromTs = finFrom ? new Date(`${finFrom}T00:00:00`).getTime() : null;
      toTs = finTo ? new Date(`${finTo}T23:59:59.999`).getTime() : null;
    } else {
      // today → today 00:00 · week → Sunday · month → 1st of current month
      toTs = new Date(`${dayOffsetISO(0)}T23:59:59.999`).getTime();
      fromTs = new Date(`${rangeStartISO()}T00:00:00`).getTime();
    }
    return orders.filter((o) => {
      if (o.status === 'canceled') return false;
      const ts = new Date(o.created_at).getTime();
      return (fromTs == null || ts >= fromTs) && (toTs == null || ts <= toTs);
    });
  }, [orders, finRange, finFrom, finTo]);


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
    // Stored fee wins (0 = free delivery / in-store sale); fall back to zone rate, then flat 150
    const zone = order.delivery_zone ? zoneForDistrict(order.delivery_zone) : null;
    const zoneRate = zone ? Number(steadfastRates[zone as DeliveryZone]) : NaN;
    const deliveryFee = order.delivery_fee != null ? Number(order.delivery_fee) : (isNaN(zoneRate) ? 150 : zoneRate);
    const total = subtotal + deliveryFee;

    return { unitPrice, qty, subtotal, deliveryFee, total };
  };

  // Flat financial statement for one order (Finance tab ledger + CSV export)
  const buildLedgerRow = (o: Order) => {
    const pricing = getOrderPricing(o);
    const storedTotal = o.total_amount != null ? Number(o.total_amount) : pricing.total;
    const storedDiscount = o.discount_amount != null ? Number(o.discount_amount) : 0;
    const storedSubtotal = o.subtotal != null ? Number(o.subtotal) : Math.max(0, storedTotal - pricing.deliveryFee);
    const matchedProduct = products.find((p) => p.id === o.product_id);
    const unitCost = matchedProduct?.cost_price != null ? Number(matchedProduct.cost_price) : null;
    const payLabel =
      o.payment_method === 'in_store' ? 'In-store sale'
        : o.payment_method === 'full_advance' ? 'Full advance'
          : o.payment_method === 'advance_partial' ? 'COD + advance'
            : o.payment_method === 'cash_on_delivery' ? 'Cash on delivery'
              : o.order_source === 'manual' ? 'In-store sale'
                : o.courier_name === 'Store Pickup' ? 'Store pickup'
                  : allNoAdvance([o.product_code], products) ? 'Cash on delivery' : '';
    return {
      orderCode: o.order_code ?? o.id.slice(0, 8).toUpperCase(),
      customer: o.customer_name || 'Unknown',
      phone: o.customer_phone ?? '',
      dateLabel: new Date(o.created_at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }),
      coupon: o.coupon_code ?? '',
      payLabel,
      size: o.selected_size ?? '',
      qty: Number(o.quantity ?? 1) || 1,
      unitPrice: pricing.unitPrice,
      subtotal: storedSubtotal,
      discount: storedDiscount,
      deliveryFee: pricing.deliveryFee,
      total: storedTotal,
      advance: Number(o.advance_amount ?? 0),
      due: Number(o.due_amount ?? 0),
      zone: o.delivery_zone ?? '—',
      courier: o.courier_name ?? '',
      trackingCode: o.tracking_code ?? '',
      status: o.status as string,
      unitCost,
      costTotal: unitCost != null ? unitCost * (Number(o.quantity ?? 1) || 1) : null,
      orderSource: o.order_source === 'manual' ? 'manual' : 'checkout',
      sellerName: o.seller_name ?? '',
    };
  };

  const finStats = useMemo(() => {
    const count = financeOrders.length;
    let grossRevenue = 0;   // product value (subtotal − discounts)
    let deliveryCollected = 0;
    let grossTotal = 0;
    let advance = 0;
    let due = 0;
    let discounts = 0;
    let courierEst = 0;
    const couponSpend: Record<string, { count: number; amount: number }> = {};
    for (const o of financeOrders) {
      const pricing = getOrderPricing(o);
      const storedTotal = o.total_amount != null ? Number(o.total_amount) : pricing.total;
      const storedDiscount = o.discount_amount != null ? Number(o.discount_amount) : 0;
      // storedTotal already has the discount baked in — don't subtract it twice
      const subtotal = Math.max(0, storedTotal - pricing.deliveryFee);
      grossRevenue += subtotal;
      deliveryCollected += pricing.deliveryFee;
      grossTotal += storedTotal;
      advance += Number(o.advance_amount ?? 0);
      due += Number(o.due_amount ?? 0);
      discounts += storedDiscount;
      courierEst += pricing.deliveryFee;
      if (o.coupon_code) {
        const c = couponSpend[o.coupon_code] ?? { count: 0, amount: 0 };
        c.count += 1;
        c.amount += storedDiscount;
        couponSpend[o.coupon_code] = c;
      }
    }
    return { count, grossRevenue, deliveryCollected, grossTotal, advance, due, discounts, courierEst, couponSpend };
  }, [financeOrders, products, steadfastRates]);

  // ── In-store (manual) sales for the selected range ──
  const manualFin = useMemo(() => {
    const rows = financeOrders.filter((o) => o.order_source === 'manual');
    let amount = 0;
    let items = 0;
    const bySeller = new Map<string, { count: number; amount: number }>();
    for (const o of rows) {
      const amt = Number(o.total_amount ?? 0);
      amount += amt;
      items += Number(o.quantity ?? 1) || 1;
      const seller = (o.seller_name ?? '').trim() || 'Unknown';
      const agg = bySeller.get(seller) ?? { count: 0, amount: 0 };
      agg.count += 1;
      agg.amount += amt;
      bySeller.set(seller, agg);
    }
    let topSeller = { name: '', count: 0, amount: 0 };
    for (const [name, agg] of bySeller) {
      if (agg.amount > topSeller.amount) topSeller = { name, ...agg };
    }
    return { count: rows.length, amount, items, topSeller };
  }, [financeOrders]);

  // ── Profit: product cost + expenses for the selected range ──
  const cogs = useMemo(() => {
    let total = 0;
    let known = true; // false when any order's product has no cost_price set
    for (const o of financeOrders) {
      const p = products.find((x) => x.id === o.product_id);
      if (p?.cost_price != null) {
        total += Number(p.cost_price) * (Number(o.quantity ?? 1) || 1);
      } else {
        known = false;
      }
    }
    return { total, known };
  }, [financeOrders, products]);

  const rangeExpenses = useMemo(() => {
    const startISO = finRange === 'all' ? '' : rangeStartISO();
    return expenses.filter((e) => {
      if (!startISO) return true;
      const d = e.spent_at ?? (e.created_at ?? '').slice(0, 10);
      return d >= startISO;
    }).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  }, [expenses, finRange, rangeStartISO]);

  // Revenue is already net of discounts — only costs are subtracted here.
  // (Delivery fees cancel out: collected ≈ courier cost, so both are excluded.)
  const netProfit = finStats.grossRevenue - cogs.total - finStats.courierEst - rangeExpenses;

  // ── Previous-period twin of financeOrders (same length immediately before),
  // for the ▲/▼ comparison on the hero band. Null when the range is open-ended
  // (all-time / custom-with-no-start) — no fair baseline to compare against.
  const prevFinanceOrders = useMemo(() => {
    if (finRange === 'all') return [];
    let fromTs: number, toTs: number;
    if (finRange === 'custom') {
      if (!finFrom) return [];
      const from = new Date(`${finFrom}T00:00:00`).getTime();
      const to = finTo ? new Date(`${finTo}T23:59:59.999`).getTime() : Date.now();
      const span = to - from;
      fromTs = from - span - 1;
      toTs = from - 1;
    } else {
      const from = new Date(`${rangeStartISO()}T00:00:00`).getTime();
      const to = new Date(`${dayOffsetISO(0)}T23:59:59.999`).getTime();
      const span = to - from;
      fromTs = from - span - 1;
      toTs = from - 1;
   }
    return orders.filter((o) => {
      if (o.status === 'canceled') return false;
      const ts = new Date(o.created_at).getTime();
      return ts >= fromTs && ts <= toTs;
    });
  }, [orders, finRange, finFrom, finTo]);

  const prevStats = useMemo(() => {
    let revenue = 0;
    for (const o of prevFinanceOrders) {
      const pricing = getOrderPricing(o);
      const storedTotal = o.total_amount != null ? Number(o.total_amount) : pricing.total;
      revenue += Math.max(0, storedTotal - pricing.deliveryFee);
    }
    return { count: prevFinanceOrders.length, revenue };
  }, [prevFinanceOrders, products, steadfastRates]);

  // ── Daily revenue buckets for the mini bar chart on the hero band ──
  const dailyBuckets = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const o of financeOrders) {
      const day = (o.created_at ?? '').slice(0, 10);
      if (!day) continue;
      const pricing = getOrderPricing(o);
      const storedTotal = o.total_amount != null ? Number(o.total_amount) : pricing.total;
      byDay.set(day, (byDay.get(day) ?? 0) + Math.max(0, storedTotal - pricing.deliveryFee));
    }
    if (byDay.size === 0) return [];
    const days: Array<{ label: string; amount: number }> = [];
    // Build the actual calendar days of the range so empty days show as gaps
    let startISO: string;
    if (finRange === 'custom' && finFrom) startISO = finFrom;
    else if (finRange === 'all') {
      const allDays = [...byDay.keys()].sort();
      startISO = allDays[0];
    } else startISO = rangeStartISO();
    const endISO = finRange === 'custom' && finTo ? finTo : dayOffsetISO(0);
    const cursor = new Date(`${startISO}T00:00:00`);
    const end = new Date(`${endISO}T00:00:00`);
    // All-time ranges cap the chart at the last 30 days for readability
    const hardStart = finRange === 'all' && byDay.size > 30
      ? new Date(new Date(`${endISO}T00:00:00`).getTime() - 29 * 86400000)
      : cursor;
    for (let d = hardStart; d <= end; d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ label: iso.slice(8), amount: byDay.get(iso) ?? 0 });
    }
    return days.slice(-31);
  }, [financeOrders, finRange, finFrom, finTo]);

  const grossMargin = finStats.grossRevenue > 0 && cogs.total > 0
    ? Math.round(((finStats.grossRevenue - cogs.total) / finStats.grossRevenue) * 100)
    : null;

  // Performance lists for the selected range: best sellers, slow movers, top customers
  const perf = useMemo(() => {
    type ProdRow = { key: string; name: string; orders: number; qty: number; revenue: number };
    type CustRow = { key: string; name: string; phone: string; orders: number; spend: number };
    const byProduct = new Map<string, ProdRow>();
    const byCustomer = new Map<string, CustRow>();
    for (const o of financeOrders) {
      const pricing = getOrderPricing(o);
      const storedTotal = o.total_amount != null ? Number(o.total_amount) : pricing.total;
      const revenue = Math.max(0, storedTotal - pricing.deliveryFee);
      const pkey = o.product_id ?? o.product_title;
      const prow = byProduct.get(pkey) ?? { key: pkey, name: o.product_title, orders: 0, qty: 0, revenue: 0 };
      prow.orders += 1;
      prow.qty += Number(o.quantity ?? 1) || 1;
      prow.revenue += revenue;
      byProduct.set(pkey, prow);
      const ckey = o.customer_phone || o.customer_name || 'unknown';
      const crow = byCustomer.get(ckey) ?? { key: ckey, name: o.customer_name || 'Unknown', phone: o.customer_phone ?? '', orders: 0, spend: 0 };
      crow.orders += 1;
      crow.spend += storedTotal;
      byCustomer.set(ckey, crow);
    }
    // Catalogue products with zero sales also count as least performing
    const soldKeys = new Set(byProduct.keys());
    for (const p of products) {
      if (!soldKeys.has(p.id)) byProduct.set(p.id, { key: p.id, name: p.title, orders: 0, qty: 0, revenue: 0 });
    }
    const all = [...byProduct.values()];
    const topProducts = all.filter((p) => p.orders > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const leastProducts = all.sort((a, b) => a.revenue - b.revenue || a.orders - b.orders).slice(0, 5);
    const topCustomers = [...byCustomer.values()].sort((a, b) => b.spend - a.spend).slice(0, 5);
    return { topProducts, leastProducts, topCustomers };
  }, [financeOrders, products]);

  // Download the currently selected finance range as a CSV file
  const exportFinanceCsv = () => {
    if (financeOrders.length === 0) return;
    const headers = [
      'Order code', 'Date', 'Customer', 'Phone', 'Product', 'Size', 'Qty',
      'Unit price', 'Subtotal', 'Discount', 'Coupon', 'Delivery fee', 'Total',
      'Advance paid', 'Due', 'Payment method', 'Zone', 'Courier', 'Tracking code', 'Status',
      'Unit cost', 'Order cost', 'Order profit', 'Source', 'Seller',
    ];
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(','),
      ...financeOrders
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .map((o) => {
          const r = buildLedgerRow(o);
          const profit = r.unitCost != null && r.costTotal != null ? r.subtotal - r.discount - r.costTotal : '';
          return [
            r.orderCode, r.dateLabel, r.customer, r.phone, o.product_title, r.size, r.qty,
            r.unitPrice, r.subtotal, r.discount, r.coupon, r.deliveryFee, r.total,
            r.advance, r.due, r.payLabel, r.zone, r.courier, r.trackingCode, r.status,
            r.unitCost ?? '', r.costTotal ?? '', profit, r.orderSource, r.sellerName,
          ].map(esc).join(',');
        }),
    ];
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ornix-finance-${finRange === 'custom' ? `${finFrom || 'start'}_to_${finTo || 'now'}` : finRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', `Exported ${financeOrders.length} order${financeOrders.length === 1 ? '' : 's'} to CSV.`);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAll();
    }
  }, [isAuthenticated]);

  // Live Steadfast balance for the Finance tab's COD reconciliation card
  useEffect(() => {
    if (!isAuthenticated || !steadfastConfigured) return;
    let cancelled = false;
    setSfBalanceLoading(true);
    setSfBalanceError('');
    getSteadfastBalance()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setSfBalance(res.balance);
        else setSfBalanceError(res.message);
      })
      .finally(() => {
        if (!cancelled) setSfBalanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, tab]);

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
    const deletedPickups: string[] = []; // orders whose consignment vanished from Steadfast
    const queue = [...tracked];
    // Each worker pulls its own items until the queue drains. The optional
    // chaining on tracking_code guards the empty-queue case that used to throw
    // and leave the "Checking…" spinner stuck forever.
    const worker = async () => {
      while (queue.length > 0) {
        const o = queue.shift();
        if (!o?.tracking_code) return;
        const res = await checkSteadfastStatus(o.tracking_code);
        if (res.ok && res.status) updates.set(o.id, res.status);
        else if (res.notFound) deletedPickups.push(o.id);
        else failed += 1;
      }
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
      );
      // Consignments deleted from the Steadfast portal: drop the stale tracking
      // code so those orders become bookable again.
      if (deletedPickups.length > 0) {
        const { error } = await supabase.from('orders').update({ tracking_code: null }).in('id', deletedPickups);
        if (error) {
          showToast('error', `Could not clear deleted pickup${deletedPickups.length > 1 ? 's' : ''}: ${error.message}`);
        } else {
          setOrders((prev) => prev.map((o) => (deletedPickups.includes(o.id) ? { ...o, tracking_code: null, steadfast_status: null } : o)));
          if (!silent) showToast('info', `${deletedPickups.length} pickup${deletedPickups.length > 1 ? 's were' : ' was'} deleted from Steadfast — the order${deletedPickups.length > 1 ? 's are' : ' is'} unbooked again.`);
        }
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
    } finally {
      // Always clear the spinner — even if a status check throws unexpectedly.
      setBulkChecking(false);
    }
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
      // Live activity trail: every admin's log entries stream in as they act,
      // so the super admin sees all admins' activity without a refresh.
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_log' },
        (payload) => {
          const entry = payload.new as AdminLog;
          if (!entry?.id) return;
          setAdminLogs((prev) => (prev.some((l) => l.id === entry.id) ? prev : [entry, ...prev]));
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
    const [prodRes, catRes, ordRes, feedRes, annRes, settingsRes, couponRes, expensesRes, adminLogRes, stockMovesRes, sizeChartRes, sellersRes] = await Promise.all([
      supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order), categories(id, name, created_at), product_sizes(id, size, quantity), size_chart_templates(id, name, measurements, created_at, updated_at)')
        .order('created_at', { ascending: false }),
       supabase.from('categories').select('*').order('priority', { ascending: true, nullsFirst: false }).order('name'),
      // Cap the orders fetch: full history in one request gets slow as the shop
      // grows. The newest 2,000 orders cover all tabs; export/CSV stays accurate
      // for any filtered range within that window.
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('site_settings').select('*'),
      supabase.from('coupons').select('*').order('created_at', { ascending: false }),
      // Admin-expansion tables (may not exist until the migration is applied)
      supabase.from('expenses').select('*').order('spent_at', { ascending: false }).limit(200),
      supabase.from('admin_log').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(500),
      // Size chart templates (may not exist until the size-chart migration is applied)
      supabase.from('size_chart_templates').select('*').order('name', { ascending: true }),
      // Saved seller names (may not exist until the sellers migration is applied)
      supabase.from('sellers').select('*').order('name', { ascending: true }),
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
    if (expensesRes.data) setExpenses(expensesRes.data as Expense[]);
    if (adminLogRes.data) setAdminLogs(adminLogRes.data as AdminLog[]);
    if (stockMovesRes.data) setStockMovements(stockMovesRes.data as StockMovement[]);
    if (sizeChartRes.error) setSizeCharts([]);
    else if (sizeChartRes.data) setSizeCharts(sizeChartRes.data as SizeChartTemplate[]);
    if (sellersRes.error) setSellers([]);
    else if (sellersRes.data) setSellers(sellersRes.data as Seller[]);
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
      const checkoutBkashSetting = settings.find((s) => s.key === 'checkout_bkash_number');
      setCheckoutBkash(checkoutBkashSetting?.value ?? '');
      const checkoutNagadSetting = settings.find((s) => s.key === 'checkout_nagad_number');
      setCheckoutNagad(checkoutNagadSetting?.value ?? '');
      const thresholdSetting = settings.find((s) => s.key === 'low_stock_threshold');
      const parsedThreshold = Number(thresholdSetting?.value);
      if (thresholdSetting?.value != null && thresholdSetting.value !== '' && !isNaN(parsedThreshold)) {
        setLowStockThreshold(Math.max(0, Math.floor(parsedThreshold)));
        setThresholdInput(String(Math.max(0, Math.floor(parsedThreshold))));
      }
      const waOrderSetting = settings.find((s) => s.key === WHATSAPP_ORDER_KEY);
      const waChatSetting = settings.find((s) => s.key === WHATSAPP_CHAT_KEY);
      setWaNumbers({ order: waOrderSetting?.value ?? '', chat: waChatSetting?.value ?? '' });
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    const err = await signIn(adminId, adminPass);
    if (err) {
      setLoginError(err);
      // Best-effort audit of the failed attempt (inserts are admin-only after
      // the security migration, so this usually no-ops — harmless)
      try {
        await supabase.from('admin_log').insert({ admin_id: adminId.trim() || '(blank)', action: 'login_failed', detail: err });
      } catch { /* locked down — expected */ }
    }
    setLoggingIn(false);
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentAdminId('');
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
      cost_price: product.cost_price != null ? String(product.cost_price) : '',
      advance_optional: product.advance_optional ?? false,
      size_chart_template_id: product.size_chart_template_id ?? '',
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
      cost_price: form.cost_price.trim() !== '' ? Number(form.cost_price) : null,
      sizes,
      stock_count: totalStock,
      category_id: form.category_id || null,
      product_code: form.product_code.trim() !== '' ? form.product_code.trim().toUpperCase() : null,
      advance_optional: form.advance_optional,
      size_chart_template_id: form.size_chart_template_id || null,
    };

    let productId: string;
    if (modalMode === 'add') {
      let { data: inserted, error: insertError } = await supabase
        .from('products').insert(payload).select().single();
      if ((insertError || !inserted) && insertError?.message.includes('cost_price')) {
        // Pre-migration schema: retry without cost_price
        const { cost_price: _omit, ...rest } = payload;
        const retry = await supabase.from('products').insert(rest).select().single();
        inserted = retry.data;
        insertError = retry.error;
      }
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
      let { error: updateError } = await supabase
        .from('products').update(payload).eq('id', editingProduct.id);
      if (updateError?.message.includes('cost_price')) {
        // Pre-migration schema: retry without cost_price
        const { cost_price: _omit, ...rest } = payload;
        updateError = (await supabase.from('products').update(rest).eq('id', editingProduct.id)).error;
      }
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

    // Stock movement history: record the net change from this save
    if (editingProduct) {
      const before = editingProduct.stock_count ?? 0;
      const delta = totalStock - before;
      if (delta !== 0) {
        void stockDelta(productId, null, delta, delta > 0 ? 'restock' : 'adjustment', `Product form save (${before} → ${totalStock})`);
        void logAdmin('stock_adjust', productId, `${delta > 0 ? '+' : ''}${delta} units (${before} → ${totalStock})`);
      }
    } else if (totalStock > 0) {
      void stockDelta(productId, null, totalStock, 'restock', 'Initial stock');
    }

    await fetchAll();
    setSaving(false);
    setModalOpen(false);
    if (modalMode === 'add') {
      void logAdmin('product_create', productId, form.title.trim());
    } else {
      void logAdmin('product_update', productId, form.title.trim());
    }
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
      void logAdmin('product_delete', deleteConfirm.id);
      await supabase.from('products').delete().eq('id', deleteConfirm.id);
    } else if (deleteConfirm.type === 'size_chart') {
      void logAdmin('size_chart_delete', deleteConfirm.id);
      await supabase.from('size_chart_templates').delete().eq('id', deleteConfirm.id);
    } else {
      void logAdmin('category_delete', deleteConfirm.id);
      await supabase.from('categories').delete().eq('id', deleteConfirm.id);
    }
    setDeleteConfirm(null);
    await fetchAll();
  };

  // ── Size chart templates ──
  const openAddChartModal = () => {
    setEditingChart(null);
    setChartModalMode('add');
    setChartName('');
    setChartNote('Measurements in inches');
    setChartRows(['Chest', 'Length']);
    setChartSizes(['M', 'L', 'XL']);
    setChartValues({});
    setChartError('');
    setChartModalOpen(true);
  };

  const openEditChartModal = (tpl: SizeChartTemplate) => {
    setEditingChart(tpl);
    setChartModalMode('edit');
    setChartName(tpl.name);
    setChartNote(tpl.measurements?.note ?? '');
    setChartRows(tpl.measurements?.rows?.length ? tpl.measurements.rows : ['Chest']);
    setChartSizes(tpl.measurements?.sizes?.length ? tpl.measurements.sizes : ['M']);
    setChartValues(tpl.measurements?.values ?? {});
    setChartError('');
    setChartModalOpen(true);
  };

  const handleSaveChart = async () => {
    const name = chartName.trim();
    const rows = chartRows.map((r) => r.trim()).filter(Boolean);
    const sizes = chartSizes.map((s) => s.trim()).filter(Boolean);
    if (!name) { setChartError('Give the chart a name, e.g. "Round Neck Tee — Relaxed".'); return; }
    if (rows.length === 0 || sizes.length === 0) { setChartError('Add at least one measurement row and one size.'); return; }
    // De-duplicate rows/sizes (case-insensitive) so values keys stay consistent
    const seenR = new Set<string>(); const seenS = new Set<string>();
    const cleanRows = rows.filter((r) => { const k = r.toLowerCase(); if (seenR.has(k)) return false; seenR.add(k); return true; });
    const cleanSizes = sizes.filter((s) => { const k = s.toLowerCase(); if (seenS.has(k)) return false; seenS.add(k); return true; });
    const values: Record<string, Record<string, string>> = {};
    for (const r of cleanRows) {
      values[r] = {};
      for (const s of cleanSizes) values[r][s] = chartValues[r]?.[s] ?? '';
    }
    setChartSaving(true);
    setChartError('');
    const payload = { name, measurements: { rows: cleanRows, sizes: cleanSizes, values, note: chartNote.trim() || undefined } };
    const { error } = chartModalMode === 'add'
      ? await supabase.from('size_chart_templates').insert(payload)
      : await supabase.from('size_chart_templates').update(payload).eq('id', editingChart!.id);
    if (error) {
      setChartError(error.message.includes('duplicate key') ? 'A chart with this name already exists.' : 'Failed to save the chart.');
      setChartSaving(false);
      return;
    }
    setChartSaving(false);
    setChartModalOpen(false);
    void logAdmin(chartModalMode === 'add' ? 'size_chart_create' : 'size_chart_update', null, name);
    await fetchAll();
    showToast('success', chartModalMode === 'add' ? 'Size chart created.' : 'Size chart updated — every product using it is updated too.');
  };

  const handleDeleteChart = async (tpl: SizeChartTemplate) => {
    const inUse = products.filter((p) => p.size_chart_template_id === tpl.id).length;
    if (inUse > 0) {
      showToast('error', `This chart is used by ${inUse} product${inUse === 1 ? '' : 's'}. Unlink it from them first.`);
      return;
    } else {
      setDeleteConfirm({ type: 'size_chart', id: tpl.id });
    }
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

  const applyOrderStatus = async (orderId: string, status: OrderStatus, opts?: { via?: string }) => {
    setUpdatingDelivery(orderId);
    void logAdmin('order_status', orderId, `${status}${opts?.via ? ` (${opts.via})` : ''}`);

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
    void logAdmin('order_delete', orderId);
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

  // ── Bulk order actions ──
  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrderIds.has(o.id));

  const toggleSelectAllVisible = () => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredOrders.forEach((o) => next.delete(o.id));
      else filteredOrders.forEach((o) => next.add(o.id));
      return next;
    });
  };

  const bulkSetStatus = async (status: OrderStatus) => {
    const ids = [...selectedOrderIds];
    if (ids.length === 0) return;
    setBulkBusy(status === 'delivered' ? 'deliver' : 'cancel');
    const { error } = await supabase.from('orders').update({ status }).in('id', ids);
    if (error) {
      showToast('error', `Failed to update orders: ${error.message}`);
    } else {
      setOrders((prev) => prev.map((o) => (selectedOrderIds.has(o.id) ? { ...o, status, delivered: status === 'delivered' } : o)));
      setNotifications((prev) => prev.map((n) => (selectedOrderIds.has(n.id) ? { ...n, status, delivered: status === 'delivered' } : n)));
      void logAdmin('bulk_status', null, `${ids.length} order(s) → ${status}`);
      showToast('success', `${ids.length} order${ids.length === 1 ? '' : 's'} marked ${status}.`);
    }
    setSelectedOrderIds(new Set());
    setBulkBusy(null);
  };

  const bulkBookSteadfast = async () => {
    const targets = orders.filter((o) => selectedOrderIds.has(o.id) && !o.tracking_code && o.status !== 'canceled' && o.courier_name !== 'Store Pickup');
    if (targets.length === 0) {
      showToast('info', 'Nothing to book — selected orders are already booked, canceled, or store pickups.');
      return;
    }
    setBulkBusy('book');
    let ok = 0;
    let failed = 0;
    for (const order of targets) {
      const due = order.due_amount != null ? Number(order.due_amount) : null;
      const total = order.total_amount != null ? Number(order.total_amount) : null;
      const codAmount = Math.max(0, due ?? total ?? 0);
      const sizePart = order.selected_size ? ` (Size ${order.selected_size})` : '';
      const qtyPart = order.quantity > 1 ? ` × ${order.quantity}` : '';
      const codePart = order.product_code ? ` [${order.product_code}]` : '';
      const result = await createSteadfastConsignment({
        invoice: order.order_code || order.id.slice(0, 12),
        recipient_name: order.customer_name || 'Customer',
        recipient_phone: order.customer_phone,
        recipient_address: order.customer_address,
        cod_amount: codAmount,
        weight: 1.5, // declared parcel weight in kg (matches single booking)
        note: `${order.product_title}${sizePart}${qtyPart}${codePart}`,
      });
      if (result.ok && result.trackingCode) {
        const { error } = await supabase.from('orders').update({ tracking_code: result.trackingCode }).eq('id', order.id);
        if (!error) {
          const code = result.trackingCode;
          setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, tracking_code: code } : o)));
          void logAdmin('steadfast_book', order.id, `Tracking ${code} · COD ৳${codAmount}`);
          ok += 1;
        } else {
          failed += 1;
        }
      } else {
        failed += 1;
        showToast('error', `${order.order_code ?? order.id.slice(0, 8)}: ${result.message}`);
      }
    }
    if (ok > 0) showToast('success', `Booked ${ok} pickup${ok === 1 ? '' : 's'} with Steadfast.${failed > 0 ? ` ${failed} failed.` : ''}`);
    setSelectedOrderIds(new Set());
    setBulkBusy(null);
  };

  const bulkDeleteOrders = async () => {
    const ids = [...selectedOrderIds];
    if (ids.length === 0) return;
    setBulkBusy('delete');
    const { error } = await supabase.from('orders').delete().in('id', ids);
    if (error) {
      showToast('error', `Failed to delete orders: ${error.message}`);
    } else {
      setOrders((prev) => prev.filter((o) => !selectedOrderIds.has(o.id)));
      setNotifications((prev) => prev.filter((n) => !selectedOrderIds.has(n.id)));
      void logAdmin('bulk_delete', null, `${ids.length} order(s) deleted`);
      showToast('success', `${ids.length} order${ids.length === 1 ? '' : 's'} deleted.`);
    }
    setBulkDeleteConfirm(false);
    setSelectedOrderIds(new Set());
    setBulkBusy(null);
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
    const codePart = order.product_code ? ` [${order.product_code}]` : '';
    const result = await createSteadfastConsignment({
      invoice: order.order_code || order.id.slice(0, 12),
      recipient_name: order.customer_name || 'Customer',
      recipient_phone: order.customer_phone,
      recipient_address: order.customer_address,
      cod_amount: codAmount,
      weight: 1.5, // declared parcel weight in kg
      note: `${order.product_title}${sizePart}${qtyPart}${codePart}`,
    });

    if (result.ok && result.trackingCode) {
      void logAdmin('steadfast_book', order.id, `Tracking ${result.trackingCode} · COD ৳${codAmount}`);
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
    } else if (result.notFound) {
      // The consignment no longer exists on Steadfast (deleted from their
      // portal) — drop the stale tracking code so the order can be re-booked.
      const { error } = await supabase.from('orders').update({ tracking_code: null }).eq('id', order.id);
      if (error) {
        showToast('error', `Steadfast has no record of this tracking code, but clearing it failed: ${error.message}`);
      } else {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, tracking_code: null, steadfast_status: null } : o)));
        showToast('info', 'Steadfast has no record of this pickup (it was likely deleted from their portal). The order is now unbooked — you can book it again.');
      }
    } else {
      showToast('error', result.message);
    }
    setCheckingSteadfast(null);
  };

  const handleSellProduct = async (productId: string, size: string | null, currentQty: number) => {
    if (currentQty <= 0) return;
    const newQty = currentQty - 1;
    void stockDelta(productId, size, -1, 'manual_sell');
    void logAdmin('stock_sell', productId, size ? `1 unit of size ${size}` : '1 unit');

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

  // Persist the Steadfast courier rates + checkout bKash number
  const handleSaveSteadfastRates = async () => {
    for (const v of [steadfastRates.dhaka_city, steadfastRates.dhaka_suburban, steadfastRates.outside_dhaka]) {
      if (isNaN(Number(v)) || Number(v) < 0) {
        showToast('error', 'Courier rates must be valid, non-negative numbers.');
        return;
      }
    }
    if (checkoutBkash.trim() && checkoutBkash.replace(/\D/g, '').length < 11) {
      showToast('error', 'The checkout bKash number should be a valid BD mobile number (11 digits).');
      return;
    }
    if (checkoutNagad.trim() && checkoutNagad.replace(/\D/g, '').length < 11) {
      showToast('error', 'The checkout Nagad number should be a valid BD mobile number (11 digits).');
      return;
    }
    setSteadfastSaving(true);
    const entries: Array<{ key: string; label: string; description: string; value: string }> = [
      { key: 'steadfast_rate_dhaka_city', label: 'Steadfast Rate — Inside Dhaka', description: 'Courier charge (৳) for orders delivered inside Dhaka City.', value: steadfastRates.dhaka_city },
      { key: 'steadfast_rate_dhaka_suburban', label: 'Steadfast Rate — Dhaka Suburban', description: 'Courier charge (৳) for Dhaka Suburban areas (Gazipur, Narayanganj, Savar, etc.).', value: steadfastRates.dhaka_suburban },
      { key: 'steadfast_rate_outside_dhaka', label: 'Steadfast Rate — Outside Dhaka', description: 'Courier charge (৳) for deliveries outside Dhaka and its suburbs.', value: steadfastRates.outside_dhaka },
      { key: 'steadfast_merchant_id', label: 'Steadfast Merchant ID', description: 'Shown on printed parcel labels (e.g. 8JFK3PPH). Find it in your Steadfast merchant dashboard.', value: merchantId.trim() },
      { key: 'checkout_bkash_number', label: 'Checkout bKash Number', description: 'Personal bKash number shown on checkout — customers send the delivery-fee advance here.', value: checkoutBkash.trim() },
      { key: 'checkout_nagad_number', label: 'Checkout Nagad Number', description: 'Personal Nagad number shown on checkout. Leave blank to hide the Nagad option from customers.', value: checkoutNagad.trim() },
    ];
    const errors: string[] = [];
    for (const entry of entries) {
      const err = await upsertSiteSetting(entry.key, entry.value, entry.label, entry.description);
      if (err) errors.push(entry.label);
    }
    if (errors.length > 0) {
      showToast('error', `Failed to save: ${errors.join(', ')}`);
    } else {
      showToast('success', 'Courier rates & payment settings saved.');
    }
    setSteadfastSaving(false);
  };

  // ── Team management (super admin) ──
  const fetchTeam = async () => {
    if (!isSuperAdmin) return;
    // SECURITY DEFINER RPC — returns the team only for super admins
    const { data, error } = await supabase.rpc('super_admin_list_admins');
    if (error) {
      showToast('error', `Could not load the admin team: ${error.message}`);
      return;
    }
    setTeamRows((data ?? []) as typeof teamRows);
  };

  useEffect(() => {
    void fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  // Refresh the activity log whenever the super admin opens its sub-tab
  useEffect(() => {
    if (tab === 'settings' && settingsTab === 'activity') {
      void fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, settingsTab]);

  const handleAddTeamMember = async () => {
    const email = newTeamEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('error', 'Enter a valid email address.');
      return;
    }
    setTeamBusy(email);
    const { error } = await supabase.rpc('super_admin_add_admin', { p_email: email, p_role: newTeamRole });
    if (error) {
      showToast('error', `Could not add admin: ${error.message}`);
    } else {
      showToast('success', `${email} added as ${newTeamRole === 'super_admin' ? 'a super admin' : 'an admin'} — they can sign in once you create their password in Supabase (Authentication → Users).`);
      setNewTeamEmail('');
      await fetchTeam();
    }
    setTeamBusy('');
  };

  const handleRemoveTeamMember = async (email: string) => {
    if (!window.confirm(`Remove ${email} from the admin team? They lose panel access immediately.`)) return;
    setTeamBusy(email);
    const { error } = await supabase.rpc('super_admin_remove_admin', { p_email: email });
    if (error) {
      showToast('error', `Could not remove: ${error.message}`);
    } else {
      showToast('success', `${email} removed from the admin team.`);
      await fetchTeam();
    }
    setTeamBusy('');
  };

  const handleToggleCapability = async (email: string, capability: string, current: boolean) => {
    const row = teamRows.find((r) => r.email === email);
    if (!row) return;
    const next = { ...row.permissions, [capability]: !current };
    setTeamBusy(email + capability);
    const { error } = await supabase.rpc('super_admin_set_permissions', { p_email: email, p_permissions: next });
    if (error) {
      showToast('error', `Could not update: ${error.message}`);
    } else {
      setTeamRows((rows) => rows.map((r) => (r.email === email ? { ...r, permissions: next } : r)));
      if (email === adminEmail) await reloadPermissions();
    }
    setTeamBusy('');
  };

  // ── Expenses (Finance tab) ──
  const handleAddExpense = async () => {
    const title = expenseForm.title.trim();
    const amount = Number(expenseForm.amount);
    if (!title) { showToast('error', 'Give the expense a title.'); return; }
    if (!expenseForm.amount.trim() || isNaN(amount) || amount <= 0) { showToast('error', 'Enter a valid amount.'); return; }
    setExpenseSaving(true);
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        title,
        amount,
        note: expenseForm.note.trim() || null,
        spent_at: expenseForm.spent_at || dayOffsetISO(0),
      })
      .select()
      .single();
    if (error || !data) {
      const missing = error?.message.includes('does not exist') || error?.message.includes('schema cache');
      showToast('error', missing
        ? 'Could not save — run the admin-expansion SQL migration in Supabase first (adds the expenses table).'
        : `Failed to save expense: ${error?.message ?? 'unknown error'}`);
    } else {
      setExpenses((prev) => [data as Expense, ...prev]);
      void logAdmin('expense_add', null, `${title} · ৳${amount}`);
      setExpenseForm({ title: '', amount: '', note: '', spent_at: expenseForm.spent_at || dayOffsetISO(0) });
      showToast('success', 'Expense added.');
    }
    setExpenseSaving(false);
  };

  const handleDeleteExpense = async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) {
      showToast('error', `Failed to delete expense: ${error.message}`);
      return;
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setDeleteExpenseId(null);
    showToast('success', 'Expense removed.');
  };

  // Persist the low-stock alert threshold (Finance & inventory)
  const handleSaveThreshold = async () => {
    const parsed = Number(thresholdInput);
    if (thresholdInput.trim() === '' || isNaN(parsed) || Number(parsed) < 0 || !Number.isInteger(parsed)) {
      showToast('error', 'Threshold must be a whole number, 0 or more.');
      return;
    }
    setThresholdSaving(true);
    const err = await upsertSiteSetting(
      'low_stock_threshold',
      String(parsed),
      'Low Stock Alert Threshold',
      'Products with stock at or below this number are flagged as low stock in Products/Stock tabs and on the Finance tab.',
    );
    if (err) {
      showToast('error', `Failed to save threshold: ${err.message}`);
    } else {
      setLowStockThreshold(parsed);
      showToast('success', `Low-stock threshold set to ${parsed}.`);
    }
    setThresholdSaving(false);
  };

  // Persist the storefront WhatsApp numbers
  const handleSaveWhatsApp = async () => {
    const order = normalizeWhatsAppNumber(waNumbers.order);
    const chat = normalizeWhatsAppNumber(waNumbers.chat);
    if (!order || !chat) {
      showToast('error', 'Both numbers are required (e.g. 01410423299 or 8801410423299).');
      return;
    }
    setWaSaving(true);
    const [orderErr, chatErr] = await Promise.all([
      upsertSiteSetting(WHATSAPP_ORDER_KEY, order, 'WhatsApp Order Number', 'Number used by the "Order on WhatsApp" button on product pages (international format).'),
      upsertSiteSetting(WHATSAPP_CHAT_KEY, chat, 'WhatsApp Chat Number', 'Number used by the floating chat bubble and the footer social link (international format).'),
    ]);
    if (orderErr || chatErr) {
      showToast('error', `Failed to save: ${[orderErr?.message, chatErr?.message].filter(Boolean).join(', ')}`);
    } else {
      setWaNumbers({ order, chat });
      void logAdmin('settings_update', null, `WhatsApp numbers updated`);
      showToast('success', 'WhatsApp numbers saved — live on the storefront immediately.');
    }
    setWaSaving(false);
  };

  // ── Manual (in-store) order: save + decrement stock ──
  // A sale can hold several product lines (e.g. two items in different sizes);
  // every line becomes its own order row, all sharing one order_code so the
  // purchase stays traceable as a single sale — same pattern as website checkout.
  const handleSaveManualOrder = async () => {
    if (manualLines.length === 0) { showToast('error', 'Add at least one product.'); return; }

    // Validate every line up-front so a bad row never half-saves.
    const resolved: { product: Product; qty: number; amount: number; size: string | null }[] = [];
    for (let i = 0; i < manualLines.length; i++) {
      const line = manualLines[i];
      const label = manualLines.length > 1 ? `Line ${i + 1}: ` : '';
      const product = products.find((p) => p.id === line.product_id);
      if (!product) { showToast('error', `${label}pick a product.`); return; }
      const qty = Math.max(1, Number(line.quantity) || 1);
      if (!line.amount.trim() || isNaN(Number(line.amount)) || Number(line.amount) < 0) {
        showToast('error', `${label}enter the amount the customer paid.`); return;
      }
      if (product.sizes.length > 0 && !line.size) { showToast('error', `${label}pick a size for ${product.title}.`); return; }
      resolved.push({ product, qty, amount: Number(line.amount), size: line.size || null });
    }
    const seller = manualForm.seller_name.trim();
    if (!seller) { showToast('error', 'Seller name is required (who recorded this sale).'); return; }
    const bkashDigits = manualForm.bkash.replace(/\D/g, '');
    if (manualForm.bkash.trim() !== '' && bkashDigits.length < 4) {
      showToast('error', 'bKash number needs at least the last 4 digits.');
      return;
    }
    // Customer phone: optional, but when given it must be a real BD mobile
    // (orders.customer_phone is NOT NULL — checkout rows always carry one).
    // Accepts 01712345678 / +8801712345678 / 8801712345678 / Bangla digits.
    const phoneRaw = manualForm.customer_phone.trim();
    let phoneDigits = '';
    if (phoneRaw !== '') {
      phoneDigits = '0' + toAsciiDigits(phoneRaw).replace(/[\s\-()]/g, '').replace(/^\+?88/, '').replace(/^0+/, '');
      if (!/^01[3-9]\d{8}$/.test(phoneDigits)) {
        showToast('error', 'Customer phone must be a valid BD mobile, e.g. 01712345678.');
        return;
      }
    }
    // Stock guard — aggregate demand per product+size so two lines of the same
    // item can't sneak past the available quantity.
    const demand = new Map<string, { product: Product; size: string | null; qty: number }>();
    for (const r of resolved) {
      const key = `${r.product.id}|${r.size ?? ''}`;
      const d = demand.get(key);
      if (d) d.qty += r.qty;
      else demand.set(key, { product: r.product, size: r.size, qty: r.qty });
    }
    for (const d of demand.values()) {
      const sizeEntry = d.size ? d.product.product_sizes?.find((ps) => ps.size === d.size) : null;
      const available = sizeEntry ? sizeEntry.quantity : d.product.stock_count;
      if (available < d.qty) {
        showToast('error', `Not enough stock for ${d.product.title} — only ${available} left${d.size ? ` in size ${d.size}` : ''}.`);
        return;
      }
    }

    setManualSaving(true);

    // Remember the seller so they show up in the dropdown next time (new names only)
    if (!sellers.some((s) => s.name.toLowerCase() === seller.toLowerCase())) {
      try {
        const { data: sellerRow, error: sellerErr } = await supabase
          .from('sellers')
          .insert({ name: seller })
          .select()
          .single();
        if (!sellerErr && sellerRow) setSellers((prev) => [...prev, sellerRow as Seller]);
      } catch {
        // Sellers table may not exist yet (migration pending) — the sale must still go through.
      }
    }

    const customer = manualForm.customer_name.trim() || 'Walk-in customer';
    // Optional delivery details — composed into the order's address line:
    // "detail, thana, district" (kept as "In-store purchase" when left blank).
    const addressParts = [manualForm.address.trim(), manualForm.thana.trim(), manualForm.district].filter(Boolean);
    const composedAddress = addressParts.length ? addressParts.join(', ') : 'In-store purchase';
    const manualZone = manualForm.district ? zoneForDistrict(manualForm.district) : null;
    const orderCode = `ORN-${Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 6)
      .toUpperCase()}`;

    const inserted: Order[] = [];
    let firstError: string | null = null;
    for (const r of resolved) {
      const { data, error } = await supabase
        .from('orders')
        .insert({
          order_code: orderCode,
          product_id: r.product.id,
          product_title: r.product.title,
          product_code: r.product.product_code,
          selected_size: r.size,
          quantity: r.qty,
          customer_name: customer,
          customer_phone: phoneDigits || '—',
          customer_address: composedAddress,
          subtotal: r.amount,
          delivery_fee: 0,
          discount_amount: 0,
          total_amount: r.amount,
          payment_method: 'in_store',
          advance_amount: r.amount,
          due_amount: 0,
          courier_name: 'Store Pickup',
          delivery_zone: manualZone,
          status: 'delivered',
          delivered: true,
          order_source: 'manual',
          seller_name: seller,
          bkash_number: bkashDigits || null,
        })
        .select()
        .single();
      if (error || !data) { firstError = error?.message ?? 'unknown error'; break; }
      inserted.push(data as Order);
    }

    if (firstError || inserted.length === 0) {
      const missing = firstError?.includes('order_source') || firstError?.includes('seller_name');
      showToast('error', missing
        ? 'Could not save — run the manual-orders SQL migration first (adds order_source / seller_name).'
        : `Failed to save: ${firstError ?? 'unknown error'}`);
      setManualSaving(false);
      return;
    }

    // Stock: decrement totals and size quantities. Aggregate per product first
    // (a product can appear on two lines, e.g. M and L of the same shirt).
    const byProduct = new Map<string, { product: Product; totalQty: number; amount: number; sizeDeltas: { size: string; qty: number }[] }>();
    for (const r of resolved) {
      const agg = byProduct.get(r.product.id);
      if (agg) {
        agg.totalQty += r.qty;
        agg.amount += r.amount;
        if (r.size) {
          const existing = agg.sizeDeltas.find((sd) => sd.size === r.size);
          if (existing) existing.qty += r.qty;
          else agg.sizeDeltas.push({ size: r.size, qty: r.qty });
        }
      } else {
        byProduct.set(r.product.id, {
          product: r.product, totalQty: r.qty, amount: r.amount,
          sizeDeltas: r.size ? [{ size: r.size, qty: r.qty }] : [],
        });
      }
    }
    for (const agg of byProduct.values()) {
      const newStock = Math.max(0, agg.product.stock_count - agg.totalQty);
      await supabase.from('products').update({ stock_count: newStock }).eq('id', agg.product.id);
      for (const sd of agg.sizeDeltas) {
        const entry = agg.product.product_sizes?.find((ps) => ps.size === sd.size);
        if (entry) {
          await supabase.from('product_sizes')
            .update({ quantity: Math.max(0, entry.quantity - sd.qty) })
            .eq('product_id', agg.product.id)
            .eq('size', sd.size);
        }
      }
      void stockDelta(agg.product.id, agg.sizeDeltas.length === 1 ? agg.sizeDeltas[0].size : null, -agg.totalQty, 'in_store_sale', `Manual order by ${seller}`);
      void logAdmin('manual_order', inserted.find((o) => o.product_id === agg.product.id)?.id ?? null, `${agg.product.title}${agg.sizeDeltas.length === 1 && agg.sizeDeltas[0].size ? ` (${agg.sizeDeltas[0].size})` : ''} × ${agg.totalQty} · ৳${agg.amount} · seller ${seller}`);
    }

    const saleTotal = resolved.reduce((s, r) => s + r.amount, 0);
    setOrders((prev) => [...inserted, ...prev]);
    setNotifications((prev) => [...inserted, ...prev]);
    setProducts((prev) => prev.map((p) => {
      const agg = byProduct.get(p.id);
      if (!agg) return p;
      let newSizes = p.product_sizes;
      for (const sd of agg.sizeDeltas) {
        if (newSizes) {
          newSizes = newSizes.map((ps) => (ps.size === sd.size ? { ...ps, quantity: Math.max(0, ps.quantity - sd.qty) } : ps));
        }
      }
      return { ...p, stock_count: Math.max(0, p.stock_count - agg.totalQty), product_sizes: newSizes };
    }));
    setManualLines([{ product_id: '', product_code: '', size: '', quantity: '1', amount: '' }]);
    setManualForm(f => ({ ...f, customer_name: '', customer_phone: '', bkash: '', district: '', thana: '', address: '' }));
    setManualSaving(false);
    showToast('success', `In-store sale recorded — ৳${saleTotal.toLocaleString('en-IN')} · ${inserted.length} item${inserted.length === 1 ? '' : 's'}.`);
  };

  // ── Saved sellers: remove a name from the dropdown (does not touch past orders) ──
  const handleDeleteSeller = async (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from the seller dropdown?\nPast orders keep their seller name — only the saved entry goes away.`)) return;
    setDeletingSeller(id);
    // Synthetic entries (sellers seen only on orders, no saved row yet) hide until reload
    if (id.startsWith('order-')) {
      setHiddenSellers((prev) => new Set(prev).add(name.toLowerCase()));
      setDeletingSeller(null);
      showToast('info', `"${name}" hidden from the list — it was never saved as a seller.`);
      return;
    }
    const { error } = await supabase.from('sellers').delete().eq('id', id);
    if (error) {
      const missing = error.message.includes('sellers') || error.message.includes('relation');
      showToast('error', missing
        ? 'Could not delete — run the sellers SQL migration first (creates the sellers table).'
        : `Failed to delete seller: ${error.message}`);
    } else {
      setSellers((prev) => prev.filter((s) => s.id !== id));
      if (reportSeller === name) setReportSeller('');
      showToast('success', `Removed "${name}" from the seller list.`);
    }
    setDeletingSeller(null);
  };

  // ── Manual orders PDF report (filtered by seller + date range) ──
  const handleDownloadReport = async () => {
    setReportBusy(true);
    try {
      const from = reportFrom ? new Date(`${reportFrom}T00:00:00`) : null;
      const to = reportTo ? new Date(`${reportTo}T00:00:00`) : null;
      if (to) to.setDate(to.getDate() + 1); // exclusive end-of-day
      await printManualOrdersReport(reportOrders, {
        sellerFilter: reportSeller || null,
        from: from && !isNaN(from.getTime()) ? from : null,
        to: to && !isNaN(to.getTime()) ? to : null,
      });
    } catch (err) {
      showToast('error', `Could not build the report: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    setReportBusy(false);
  };

  // ── Login screen ──
  if (!authReady) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

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
            <p className="text-stone-400 text-sm">Sign in with your admin account</p>
          </div>
          <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Email</label>
              <input type="email" value={adminId} autoComplete="username"
                onChange={(e) => { setAdminId(e.target.value); setLoginError(''); }}
                placeholder="admin@ornix.com.bd"
                className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Password</label>
              <input type="password" value={adminPass} autoComplete="current-password"
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
            <button type="submit" disabled={loggingIn}
              className="w-full bg-stone-900 hover:bg-stone-800 disabled:opacity-70 text-white font-bold py-3.5 rounded-2xl transition-all hover:shadow-lg flex items-center justify-center gap-2">
              {loggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
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
            {adminEmail && (
              <span className="hidden sm:inline text-xs text-stone-400" title={adminEmail}>{adminEmail}</span>
            )}
            <button onClick={() => void handleLogout()}
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
            { key: 'products' as Tab, label: 'Products', icon: <Package className="w-4 h-4" />, count: products.length, cap: 'products' as const },
            { key: 'stock' as Tab, label: 'Stock', icon: <Package className="w-4 h-4" />, count: lowStockCount, cap: 'stock' as const },
            { key: 'categories' as Tab, label: 'Categories', icon: <Tag className="w-4 h-4" />, count: categories.length, cap: 'categories' as const },
            { key: 'orders' as Tab, label: 'Orders', icon: <ShoppingBag className="w-4 h-4" />, count: storeOrders.length, highlight: pendingOrders > 0 ? `${pendingOrders} pending` : undefined, cap: 'orders' as const },
            { key: 'manual' as Tab, label: 'Manual Orders', icon: <Store className="w-4 h-4" />, count: manualOrders.length, cap: 'manual' as const },
            { key: 'finance' as Tab, label: 'Finance', icon: <Banknote className="w-4 h-4" />, cap: 'finance' as const },
            { key: 'coupons' as Tab, label: 'Coupons', icon: <Percent className="w-4 h-4" />, count: couponsUnavailable ? undefined : coupons.length, cap: 'coupons' as const },
            { key: 'feedback' as Tab, label: 'Feedback', icon: <MessageSquare className="w-4 h-4" />, count: feedbackList.length, badge: unreadFeedback, cap: 'feedback' as const },
            { key: 'settings' as Tab, label: 'Settings', icon: <Settings className="w-4 h-4" />, count: undefined, cap: 'settings' as const },
          ]).filter((t) => isAdminOf(t.cap)).map((t) => (
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
              <div className="flex items-center gap-2">
                <button onClick={() => setChartManagerOpen(true)}
                  className="flex items-center gap-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm">
                  <Ruler className="w-4 h-4" /> Size Charts ({sizeCharts.length})
                </button>
                <button onClick={openAddModal}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                  <Plus className="w-4 h-4" /> Add Product
                </button>
              </div>
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
                                <div key={size} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2">                <div>
                                  <span className="text-xs font-semibold text-stone-700 uppercase">{size}</span>
                                  <span className="text-xs text-stone-500 ml-2">{qty} left</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => setMovementProductId(product.id)}
                                      title="View stock movement history for this product"
                                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-500 transition-all"
                                    >
                                      <Clock className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleSellProduct(product.id, size, qty)}
                                      disabled={qty <= 0}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </button>
                                  </div>
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
          <div>              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">Orders</h2>
                <p className="text-sm text-stone-500">
                  {orders.length} total{orders.length >= 2000 && <span className="text-amber-600 font-medium"> · showing newest 2,000</span>}
                  {pendingOrders > 0 && <span className="text-amber-600 font-medium"> · {pendingOrders} pending</span>}
                  <span className="text-stone-300"> · </span>
                  <button onClick={toggleSelectAllVisible} className="text-brand-600 font-medium hover:underline">
                    {allVisibleSelected ? 'Clear page selection' : 'Select all shown'}
                  </button>
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

            {/* Bulk actions bar — appears when orders are ticked */}
            {selectedOrderIds.size > 0 && (
              <div className="bg-stone-900 text-white rounded-2xl shadow-md p-4 mb-6 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold mr-1">{selectedOrderIds.size} selected</span>
                <button
                  onClick={() => void bulkBookSteadfast()}
                  disabled={bulkBusy !== null}
                  title="Book Steadfast pickups for every selected unbooked, non-canceled order"
                  className="flex items-center gap-1.5 text-xs font-semibold bg-brand-500 hover:bg-brand-400 disabled:opacity-60 px-3 py-2 rounded-lg transition-all"
                >
                  {bulkBusy === 'book' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
                  Book pickups
                </button>
                <button
                  onClick={() => void bulkSetStatus('delivered')}
                  disabled={bulkBusy !== null}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 px-3 py-2 rounded-lg transition-all"
                >
                  {bulkBusy === 'deliver' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                  Mark delivered
                </button>
                <button
                  onClick={() => void bulkSetStatus('canceled')}
                  disabled={bulkBusy !== null}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-60 px-3 py-2 rounded-lg transition-all"
                >
                  {bulkBusy === 'cancel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Cancel
                </button>
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  disabled={bulkBusy !== null}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-red-500/90 hover:bg-red-500 disabled:opacity-60 px-3 py-2 rounded-lg transition-all"
                >
                  {bulkBusy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
                <button
                  onClick={() => setSelectedOrderIds(new Set())}
                  className="ml-auto text-xs font-semibold text-stone-300 hover:text-white px-2 py-2 transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}

            {filteredOrders.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="w-6 h-6" />}
                title={storeOrders.length === 0 ? 'No orders yet' : 'No orders match your filters.'}
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
                      {/* Header: customer identity + status + actions.
                          Stacks on mobile so the customer name never gets
                          squeezed by the status pill / status dropdown. */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.has(order.id)}
                            onChange={() => toggleOrderSelection(order.id)}
                            title="Select for bulk actions"
                            className="w-4 h-4 accent-brand-500 flex-shrink-0 cursor-pointer"
                          />
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
                        {order.payment_channel === 'nagad' && (
                          <div>
                            <p className={ORD_LBL}>Channel</p>
                            <p className="font-medium text-orange-600 text-sm">Nagad</p>
                          </div>
                        )}
                        <div>
                          <p className={ORD_LBL}>Payment</p>
                          <p className="font-medium text-stone-800 text-sm">
                            {order.payment_method === 'in_store' || order.order_source === 'manual'
                              ? 'In-store sale'
                              : order.payment_method === 'full_advance'
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
                        {order.order_source === 'manual' && (
                          <div>
                            <p className={ORD_LBL}>Sold by</p>
                            <p className="font-medium text-stone-800 text-sm">{order.seller_name ?? '—'}</p>
                          </div>
                        )}
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

        {/* ── Manual Orders tab (in-store sales) ── */}
        {tab === 'manual' && (() => {
          const knownSellersFiltered = sellerDropdownOpen && manualForm.seller_name.trim()
            ? knownSellers.filter((s) => s.name.toLowerCase().includes(manualForm.seller_name.trim().toLowerCase()))
            : knownSellers;
          const unitPriceOf = (p: Product | undefined | null) =>
            p ? (p.discount_price != null && p.discount_price < p.price ? Number(p.discount_price) : Number(p.price)) : 0;
          const saleTotal = manualLines.reduce((s, l) => {
            const p = products.find((x) => x.id === l.product_id);
            return s + (l.amount.trim() !== '' && !isNaN(Number(l.amount)) ? Number(l.amount) : unitPriceOf(p) * (Number(l.quantity) || 0));
          }, 0);
          const manualHistory = [...manualOrders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          const todaySum = manualToday.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
          return (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-stone-900">Manual Orders</h2>
                  <p className="text-sm text-stone-500">
                    Record walk-in purchases. They count in Finance, top products, and top customers like website orders.
                    {manualToday.length > 0 && <span className="text-emerald-600 font-medium"> · Today: {manualToday.length} sale{manualToday.length === 1 ? '' : 's'} · ৳{todaySum.toLocaleString('en-IN')}</span>}
                  </p>
                </div>
              </div>

              {/* Entry form */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">New in-store sale</p>
                {/* Product lines — one row per product so a customer can buy several different items */}
                <div className="space-y-3 mb-4">
                  {manualLines.map((line, idx) => {
                    const lineProduct = products.find((p) => p.id === line.product_id) ?? null;
                    const lineUnit = unitPriceOf(lineProduct);
                    const lineQty = Math.max(1, Number(line.quantity) || 1);
                    const lineSizeEntry = lineProduct && line.size
                      ? lineProduct.product_sizes?.find((ps) => ps.size === line.size)
                      : null;
                    const lineAvailable = lineSizeEntry ? lineSizeEntry.quantity : (lineProduct?.stock_count ?? 0);
                    const updateLine = (patch: Partial<ManualLine>) =>
                      setManualLines((lines) => lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
                    return (
                    <div key={idx} className="rounded-2xl border border-stone-100 bg-stone-50/60 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Item {idx + 1}</p>
                        {manualLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setManualLines((lines) => lines.filter((_, i) => i !== idx))}
                            title="Remove this item"
                            className="p-1.5 text-stone-300 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                        </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-stone-700 mb-1.5">Product *</label>
                        <select
                          value={line.product_id}
                          onChange={(e) => {
                            const p = products.find((x) => x.id === e.target.value);
                            const unit = unitPriceOf(p);
                            updateLine({
                              product_id: e.target.value,
                              product_code: p?.product_code ?? '',
                              size: '',
                              amount: unit > 0 ? String(unit * lineQty) : '',
                            });
                          }}
                          className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                        >
                          <option value="">Select a product…</option>
                          {[...products].sort((a, b) => a.title.localeCompare(b.title)).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title} — ৳{Number(p.discount_price ?? p.price).toFixed(0)} ({p.stock_count} in stock)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1.5">Size {lineProduct && lineProduct.sizes.length > 0 ? '*' : ''}</label>
                        <select
                          value={line.size}
                          onChange={(e) => updateLine({ size: e.target.value })}
                          disabled={!lineProduct || lineProduct.sizes.length === 0}
                          className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white disabled:bg-stone-50 disabled:text-stone-400"
                        >
                          <option value="">{lineProduct && lineProduct.sizes.length > 0 ? 'Select size…' : '—'}</option>
                          {(lineProduct?.sizes ?? []).map((size) => {
                            const qty = lineProduct?.product_sizes?.find((ps) => ps.size === size)?.quantity ?? 0;
                            return (
                              <option key={size} value={size} disabled={qty <= 0}>
                                {size} ({qty} left)
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1.5">Product code</label>
                        <input
                          type="text"
                          value={line.product_code}
                          readOnly
                          placeholder="Auto from product"
                          className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm font-mono bg-stone-50 text-stone-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1.5">Quantity *</label>
                        <input
                          type="number" min="1" value={line.quantity}
                          onChange={(e) => {
                            const prevQty = lineQty;
                            const newQty = Math.max(1, Number(e.target.value) || 1);
                            // Auto-fill the amount while it still holds the auto value
                            // (unit × qty); never clobber a manually-edited amount.
                            const wasAuto = line.amount === '' || Number(line.amount) === lineUnit * prevQty;
                            updateLine({ quantity: e.target.value, amount: lineUnit > 0 && wasAuto ? String(lineUnit * newQty) : line.amount });
                          }}
                          className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1.5">Amount (৳) *</label>
                        <input
                          type="number" min="0" value={line.amount}
                          onChange={(e) => updateLine({ amount: e.target.value })}
                          placeholder={lineUnit ? `e.g. ${lineUnit * lineQty}` : 'What the customer paid'}
                          className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>
                      </div>
                      {lineProduct && (
                        <p className="text-sm text-stone-500 mt-3">
                          Stock available: <span className={`font-bold ${lineAvailable >= lineQty ? 'text-emerald-600' : 'text-red-500'}`}>{lineAvailable}</span>
                        </p>
                      )}
                    </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setManualLines((lines) => [...lines, { product_id: '', product_code: '', size: '', quantity: '1', amount: '' }])}
                    className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-500 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add another product
                  </button>
                </div>

                {/* Customer, seller & delivery details — shared across every item in the sale */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-stone-100">
                  <div className="relative">
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Seller name *</label>
                    <input
                      type="text" value={manualForm.seller_name}
                      onChange={(e) => { setManualForm((f) => ({ ...f, seller_name: e.target.value })); setSellerDropdownOpen(true); }}
                      onFocus={() => setSellerDropdownOpen(true)}
                      placeholder="Who made this sale? e.g. admin1"
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    {sellerDropdownOpen && knownSellersFiltered.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-stone-200 rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
                        {knownSellersFiltered.map((s) => (
                          <div key={s.id} className="flex items-center hover:bg-stone-50">
                            <button
                              type="button"
                              onClick={() => {
                                setManualForm((f) => ({ ...f, seller_name: s.name }));
                                setSellerDropdownOpen(false);
                              }}
                              className="flex-1 text-left px-3 py-2 text-sm text-stone-700 truncate"
                            >
                              {s.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSeller(s.id, s.name)}
                              title={`Delete "${s.name}" from the seller list`}
                              disabled={deletingSeller === s.id}
                              className="flex-shrink-0 mr-1.5 p-1.5 text-stone-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                            >
                              {deletingSeller === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      Customer name <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text" value={manualForm.customer_name}
                      onChange={(e) => setManualForm((f) => ({ ...f, customer_name: e.target.value }))}
                      placeholder="Defaults to Walk-in customer"
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      Customer phone <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="tel" value={manualForm.customer_phone}
                      onChange={(e) => setManualForm((f) => ({ ...f, customer_phone: toAsciiDigits(e.target.value) }))}
                      placeholder="e.g. 01712345678"
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      bKash number <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text" value={manualForm.bkash}
                      onChange={(e) => setManualForm((f) => ({ ...f, bkash: e.target.value }))}
                      placeholder="Last 4 digits or full number"
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      District <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <select
                      value={manualForm.district}
                      onChange={(e) => setManualForm((f) => ({ ...f, district: e.target.value, thana: '' }))}
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                    >
                      <option value="">— none —</option>
                      {DELIVERY_ZONES.map((zone) => (
                        <optgroup key={zone.id} label={ZONE_GROUP_LABELS[zone.id]}>
                          {zone.districts.map((d) => (
                            <option key={d} value={d}>{d} · {DISTRICT_NAMES_BN[d] ?? d}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      Thana <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <ThanaSelect
                      district={manualForm.district}
                      value={manualForm.thana}
                      onChange={(thana) => setManualForm((f) => ({ ...f, thana }))}
                      variant="admin"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">
                      Address <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={manualForm.address}
                      onChange={(e) => setManualForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="House / road / area details"
                      rows={2}
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-5 pt-4 border-t border-stone-100">
                  <p className="text-sm text-stone-500">
                    {manualLines.some((l) => l.product_id) ? (
                      <>
                        {manualLines.filter((l) => l.product_id).length} item{manualLines.filter((l) => l.product_id).length === 1 ? '' : 's'} in this sale
                        {saleTotal > 0 && <> · Sale total: <span className="font-bold text-stone-900">৳{saleTotal.toLocaleString('en-IN')}</span></>}
                      </>
                    ) : (
                      'Add the products the customer bought.'
                    )}
                  </p>
                  <button
                    onClick={() => void handleSaveManualOrder()}
                    disabled={manualSaving || !manualLines.some((l) => l.product_id)}
                    className="ml-auto flex items-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm"
                  >
                    {manualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                    {manualSaving ? 'Saving...' : 'Record sale'}
                  </button>
                </div>
              </div>

              {/* PDF report: filter by seller and/or date range, then print → Save as PDF */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4 flex items-center gap-1.5">
                  <FileDown className="w-3.5 h-3.5" /> PDF report
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">Seller</label>
                    <select
                      value={reportSeller}
                      onChange={(e) => setReportSeller(e.target.value)}
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                    >
                      <option value="">All sellers</option>
                      {knownSellers.map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">From <span className="text-stone-400 font-normal">(optional)</span></label>
                    <input
                      type="date" value={reportFrom}
                      onChange={(e) => setReportFrom(e.target.value)}
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5">To <span className="text-stone-400 font-normal">(optional)</span></label>
                    <input
                      type="date" value={reportTo}
                      onChange={(e) => setReportTo(e.target.value)}
                      min={reportFrom || undefined}
                      className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => void handleDownloadReport()}
                      disabled={reportBusy || reportOrders.length === 0}
                      className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm"
                    >
                      {reportBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {reportBusy ? 'Preparing…' : 'Download PDF'}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-stone-500 mt-4">
                  {reportOrders.length === 0 ? (
                    'No in-store sales match — widen the filters.'
                  ) : (
                    <>
                      {reportOrders.length} sale{reportOrders.length === 1 ? '' : 's'} ·{' '}
                      <span className="font-bold text-stone-900">
                        ৳{reportOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0).toLocaleString('en-IN')}
                      </span>{' '}
                      in the selected range. Click “Download PDF”, then choose <b>Save as PDF</b> in the print dialog.
                    </>
                  )}
                </p>
              </div>

              {/* History */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5" /> Recorded in-store sales ({manualHistory.length})
                  </p>
                </div>
                {manualHistory.length === 0 ? (
                  <div className="px-5 pb-6">
                    <p className="text-sm text-stone-400">No in-store sales recorded yet. Use the form above for walk-in purchases.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {manualHistory.slice(0, 30).map((o) => (
                      <div key={o.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-stone-800">{o.order_code ?? o.id.slice(0, 8).toUpperCase()}</span>
                            <span className="text-sm font-medium text-stone-800 truncate">{o.product_title}</span>
                            {o.selected_size && <span className="text-[11px] font-semibold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full uppercase">{o.selected_size}</span>}
                            <span className="text-[11px] text-stone-400">× {o.quantity ?? 1}</span>
                          </div>
                          <p className="text-[11px] text-stone-400 mt-0.5">
                            {o.customer_name} · sold by <span className="font-semibold text-stone-500">{o.seller_name ?? '—'}</span>
                            {o.bkash_number ? ` · bKash ··${o.bkash_number.slice(-4)}` : ' · cash'}
                            {' · '}{new Date(o.created_at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-stone-900 flex-shrink-0">৳{Number(o.total_amount ?? 0).toLocaleString('en-IN')}</span>
                        <button
                          onClick={() => setDeleteOrderConfirm(o.id)}
                          title="Delete this record"
                          className="text-stone-300 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Finance tab ── */}
        {tab === 'finance' && (
          <div className="space-y-6">
            {/* Range selector */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">Finance Overview</h2>
                <p className="text-sm text-stone-500">
                  {financeOrders.length} order{financeOrders.length === 1 ? '' : 's'} in range · canceled orders excluded
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { key: 'today' as const, label: 'Today' },
                  { key: 'week' as const, label: 'This week' },
                  { key: 'month' as const, label: 'This month' },
                  { key: 'all' as const, label: 'All time' },
                  { key: 'custom' as const, label: 'Custom' },
                  { key: 'csv' as const, label: '' },
                ]).map((r) =>
                  r.key === 'csv' ? (
                    <button
                      key="csv"
                      onClick={exportFinanceCsv}
                      disabled={financeOrders.length === 0}
                      title="Download the currently selected range as CSV"
                      className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-200 hover:border-stone-300 px-3 py-2 rounded-xl disabled:opacity-50 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                  ) : (
                    <button
                      key={r.key}
                      onClick={() => setFinRange(r.key)}
                      className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-all whitespace-nowrap ${
                        finRange === r.key
                          ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Custom range inputs */}
            {finRange === 'custom' && (
              <div className="flex flex-wrap items-end gap-2 bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1">From</label>
                  <input
                    type="date"
                    value={finFrom}
                    onChange={(e) => setFinFrom(e.target.value)}
                    className="border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1">To</label>
                  <input
                    type="date"
                    value={finTo}
                    onChange={(e) => setFinTo(e.target.value)}
                    className="border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <p className="text-xs text-stone-400 pb-2.5">Leave a field empty for an open-ended range.</p>
              </div>
            )}            {/* ── Hero: how are we doing? ── */}
            <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-6">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-[180px]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Net profit · selected range</p>
                  <p className={`font-display text-4xl font-bold mt-1 leading-none ${netProfit >= 0 ? 'text-stone-900' : 'text-red-500'}`}>{formatBDT(netProfit)}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {grossMargin != null && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{grossMargin}% margin</span>
                    )}
                    {!cogs.known && (
                      <span className="text-[11px] font-medium text-amber-600">· some products have no cost price set</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-8 gap-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Revenue</p>
                    <p className="font-display text-xl font-bold text-stone-900">{formatBDT(finStats.grossRevenue)}</p>
                    <FinDelta current={finStats.grossRevenue} previous={prevStats.revenue} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Orders</p>
                    <p className="font-display text-xl font-bold text-stone-900">{finStats.count}</p>
                    <FinDelta current={finStats.count} previous={prevStats.count} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Avg order</p>
                    <p className="font-display text-xl font-bold text-stone-900">{formatBDT(finStats.count ? finStats.grossRevenue / finStats.count : 0)}</p>
                  </div>
                </div>
              </div>
              {dailyBuckets.length > 0 && (
                <div className="mt-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mb-1.5">Revenue by day</p>
                  <DailyBars buckets={dailyBuckets} />
                </div>
              )}
              {/* Cash strip: money in hand vs money still out there (range-based) */}
              <div className="mt-5 pt-4 border-t border-stone-100 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <FinCard label="In hand (bKash advance)" value={formatBDT(finStats.advance)} sub="Paid up front by customers" tone="emerald" icon={CheckCircle2} />
                <FinCard label="To collect on delivery" value={formatBDT(finStats.due)} sub="Customer pays the courier" tone={finStats.due > 0 ? 'amber' : 'stone'} icon={Clock} />
                <FinCard label="Delivery fees charged" value={formatBDT(finStats.deliveryCollected)} sub="Added to customer bills" tone="sky" icon={Truck} />
                <FinCard label="Discounts given" value={`−${formatBDT(finStats.discounts)}`} sub={`${Object.keys(finStats.couponSpend).length} coupon(s) used`} tone="amber" icon={Percent} />
              </div>
            </div>

            {/* In-store sales — walk-in purchases recorded by sellers */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5" /> In-store sales · Manual orders
                  </p>
                  <p className="text-sm text-stone-500 mt-0.5">
                    Products sold in the shop {finRange === 'all' ? 'all time' : 'in the selected range'} — how much and how many.
                  </p>
                </div>
                <button onClick={() => setTab('manual')} className="text-xs font-semibold text-brand-600 hover:text-brand-500 transition-colors">
                  Open Manual Orders →
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <FinCard label="Amount sold" value={formatBDT(manualFin.amount)} sub={`${manualFin.count} sale${manualFin.count === 1 ? '' : 's'} recorded`} tone="emerald" icon={Banknote} />
                <FinCard label="Items sold" value={String(manualFin.items)} sub="Total units sold in store" tone="sky" icon={Package} />
                <FinCard label="Top seller" value={manualFin.topSeller.name || '—'} sub={manualFin.topSeller.name ? `${manualFin.topSeller.count} sale(s) · ${formatBDT(manualFin.topSeller.amount)}` : 'No sales in this range'} tone="brand" icon={Users} />
                <FinCard label="Share of revenue" value={`${finStats.grossRevenue > 0 ? Math.round((manualFin.amount / (manualFin.amount + finStats.grossRevenue)) * 100) : 0}%`} sub="In-store vs website revenue" tone="stone" icon={TrendingUp} />
              </div>
            </div>

            {/* COD reconciliation — where is the cash right now? */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5" /> Courier cash · Steadfast
                  </p>
                  <p className="text-sm text-stone-500 mt-0.5">Where every parcel's cash sits right now — all time, not just this range.</p>
                </div>
                <button
                  onClick={() => {
                    setSfBalanceLoading(true);
                    setSfBalanceError('');
                    getSteadfastBalance()
                      .then((res) => {
                        if (res.ok) setSfBalance(res.balance);
                        else setSfBalanceError(res.message);
                      })
                      .finally(() => setSfBalanceLoading(false));
                  }}
                  disabled={sfBalanceLoading || !steadfastConfigured}
                  title={steadfastConfigured ? 'Fetch your live Steadfast account balance' : 'Add Steadfast API keys to .env to enable'}
                  className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-brand-600 disabled:opacity-60 transition-colors"
                >
                  {sfBalanceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Refresh courier balance
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <FinCard label="Cash collected" value={formatBDT(codRecon.collected)} sub={`${codRecon.collectedCount} delivered parcel${codRecon.collectedCount === 1 ? '' : 's'}`} tone="emerald" icon={CheckCircle2} />
                <FinCard label="Cash with courier" value={formatBDT(codRecon.pending)} sub={`${codRecon.pendingCount} in transit`} tone={codRecon.pendingCount > 0 ? 'amber' : 'stone'} icon={Truck} />
                <FinCard label="Steadfast balance" value={sfBalance != null ? formatBDT(sfBalance) : '—'} sub={sfBalanceError || 'Live from Steadfast API'} tone="brand" icon={Banknote} />
                <FinCard label="Returned / lost COD" value={formatBDT(codRecon.returned)} sub={`${codRecon.returnedCount} cancelled parcel${codRecon.returnedCount === 1 ? '' : 's'}`} tone={codRecon.returnedCount > 0 ? 'red' : 'stone'} icon={XCircle} />
              </div>
            </div>

            {/* Profit ledger — the story of the range in five lines */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> Where the money went · selected range
                  </p>
                  <p className="text-sm text-stone-500 mt-0.5">From revenue to net profit, line by line.</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 max-w-xl">
                {([
                  { label: 'Revenue (after discounts)', amount: finStats.grossRevenue, sign: '+', tone: 'text-emerald-600' },
                  { label: 'Product cost', amount: -cogs.total, sign: '−', tone: 'text-stone-600', warn: !cogs.known ? 'some products have no cost price — counted as ৳0' : '' },
                  { label: 'Courier cost (est.)', amount: -finStats.courierEst, sign: '−', tone: 'text-stone-600' },
                  { label: 'Expenses', amount: -rangeExpenses, sign: '−', tone: 'text-stone-600' },
                ] as Array<{ label: string; amount: number; sign: string; tone: string; warn?: string }>).map((line) => (
                  <div key={line.label} className="flex items-center justify-between text-sm py-1.5 border-b border-stone-100 last:border-0">
                    <span className="text-stone-600">
                      <span className={`font-bold mr-1.5 ${line.tone}`}>{line.sign}</span>{line.label}
                      {line.warn && <span className="block text-[11px] text-amber-600">{line.warn}</span>}
                    </span>
                    <span className={`font-semibold tabular-nums ${line.amount < 0 ? 'text-stone-700' : line.tone}`}>{formatBDT(Math.abs(line.amount))}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2.5 mt-1 border-t-2 border-stone-200">
                  <span className="font-bold text-stone-900">= Net profit</span>
                  <span className={`font-display text-xl font-bold tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatBDT(netProfit)}</span>
                </div>
              </div>

              {/* Quick expense logger */}
              <div className="mt-5 pt-4 border-t border-stone-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">Log an expense</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[140px] flex-1">
                    <input
                      type="text"
                      value={expenseForm.title}
                      onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                      placeholder="What was it? e.g. Facebook ads"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      min="0"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      placeholder="৳ Amount"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <input
                      type="date"
                      value={expenseForm.spent_at || dayOffsetISO(0)}
                      onChange={(e) => setExpenseForm({ ...expenseForm, spent_at: e.target.value })}
                      className="border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <button
                    onClick={() => void handleAddExpense()}
                    disabled={expenseSaving}
                    className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold text-sm px-4 py-2 rounded-xl transition-all shadow-sm"
                  >
                    {expenseSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                  </button>
                </div>
                {expenses.length > 0 && (
                  <div className="mt-3 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {expenses.slice(0, 30).map((e) => (
                      <div key={e.id} className="flex items-center justify-between bg-stone-50 rounded-xl px-3.5 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate">{e.title}</p>
                          <p className="text-[11px] text-stone-400">{e.spent_at ?? (e.created_at ?? '').slice(0, 10)}{e.note ? ` · ${e.note}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-semibold text-red-500">−{formatBDT(Number(e.amount))}</span>
                          <button
                            onClick={() => setDeleteExpenseId(e.id)}
                            title="Remove expense"
                            className="text-stone-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Inventory snapshot */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" /> Inventory snapshot
                  </p>
                  <p className="text-sm text-stone-500 mt-0.5">Current stock across all products, valued at current selling price.</p>
                </div>
                <button
                  onClick={() => setTab('stock')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Manage stock →
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <FinCard label="Stock value" value={formatBDT(stockValue)} sub={`${products.length} products`} tone="brand" icon={Package} />
                <FinCard label="Low stock items" value={String(lowStockProducts.length)} sub={`Alert threshold: ${lowStockThreshold}`} tone={lowStockProducts.length > 0 ? 'amber' : 'stone'} icon={AlertTriangle} />
                <FinCard label="Out of stock" value={String(products.filter((p) => p.stock_count === 0).length)} sub="Hide from storefront or restock" tone={products.some((p) => p.stock_count === 0) ? 'red' : 'stone'} icon={XCircle} />
                <FinCard label="Units in stock" value={String(products.reduce((s, p) => s + p.stock_count, 0))} sub="Across all products" tone="stone" icon={Package} />
              </div>

              {lowStockProducts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-stone-100">
                  <p className="text-xs font-semibold text-amber-600 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Low stock — restock soon ({lowStockProducts.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lowStockProducts.map((p) => (
                      <span
                        key={p.id}
                        title={`৳${Number(p.discount_price ?? p.price).toFixed(0)} each`}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border ${
                          p.stock_count === 0
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : 'bg-amber-50 text-amber-600 border-amber-200'
                        }`}
                      >
                        {p.title} · {p.stock_count} left
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-2">
                    Threshold is adjustable in Settings → Finance &amp; inventory.
                  </p>
                </div>
              )}
            </div>

            {/* Performance: best sellers, slow movers, top customers */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5 mb-3">
                  <TrendingUp className="w-3.5 h-3.5" /> Top products
                </p>
                {perf.topProducts.length === 0 ? (
                  <p className="text-sm text-stone-400">No sales in this range yet.</p>
                ) : (
                  <div className="space-y-2">
                    {perf.topProducts.map((p, i) => (
                      <div key={p.key} className="flex items-center gap-2.5 bg-stone-50 rounded-xl px-3 py-2">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-600' : 'bg-stone-200 text-stone-500'}`}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-stone-800 truncate">{p.name}</p>
                          <p className="text-[11px] text-stone-400">{p.qty} sold · {p.orders} order{p.orders === 1 ? '' : 's'}</p>
                        </div>
                        <span className="text-sm font-bold text-stone-900 flex-shrink-0">{formatBDT(p.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5 mb-3">
                  <TrendingDown className="w-3.5 h-3.5" /> Least performing
                </p>
                {perf.leastProducts.length === 0 ? (
                  <p className="text-sm text-stone-400">No products yet.</p>
                ) : (
                  <div className="space-y-2">
                    {perf.leastProducts.map((p) => (
                      <div key={p.key} className="flex items-center gap-2.5 bg-stone-50 rounded-xl px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-stone-800 truncate">{p.name}</p>
                          <p className="text-[11px] text-stone-400">{p.revenue > 0 ? `${p.qty} sold · ${p.orders} order${p.orders === 1 ? '' : 's'}` : 'No sales in this range'}</p>
                        </div>
                        <span className="text-sm font-bold text-stone-900 flex-shrink-0">{p.revenue > 0 ? formatBDT(p.revenue) : '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5 mb-3">
                  <Users className="w-3.5 h-3.5" /> Top customers
                </p>
                {perf.topCustomers.length === 0 ? (
                  <p className="text-sm text-stone-400">No customers in this range yet.</p>
                ) : (
                  <div className="space-y-2">
                    {perf.topCustomers.map((c) => (
                      <div key={c.key} className="flex items-center gap-2.5 bg-stone-50 rounded-xl px-3 py-2">
                        <span className="w-6 h-6 rounded-full bg-stone-900 text-white text-[10px] font-bold flex-shrink-0 flex items-center justify-center">{(c.name || '?').trim().charAt(0).toUpperCase()}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-stone-800 truncate">{c.name}</p>
                          <p className="text-[11px] text-stone-400">{c.phone || '—'} · {c.orders} order{c.orders === 1 ? '' : 's'}</p>
                        </div>
                        <span className="text-sm font-bold text-stone-900 flex-shrink-0">{formatBDT(c.spend)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Coupon usage breakdown */}
            {Object.keys(finStats.couponSpend).length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5 mb-3">
                  <Percent className="w-3.5 h-3.5" /> Coupon usage in range
                </p>
                <div className="space-y-2">
                  {Object.entries(finStats.couponSpend)
                    .sort((a, b) => b[1].amount - a[1].amount)
                    .map(([code, s]) => (
                      <div key={code} className="flex items-center justify-between bg-stone-50 rounded-xl px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-bold bg-stone-900 text-white px-2 py-0.5 rounded-md">{code}</span>
                          <span className="text-xs text-stone-500">{s.count} order{s.count === 1 ? '' : 's'}</span>
                        </div>
                        <span className="text-sm font-semibold text-emerald-600">−{formatBDT(s.amount)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Per-order ledger — every order's complete financial statement */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" /> Order ledger ({financeOrders.length})
                </p>
                <p className="text-sm text-stone-500 mt-0.5">Newest first. Click a row to expand its full financial breakdown.</p>
              </div>
              <div className="divide-y divide-stone-100">
                {financeOrders.slice(0, 60).map((o) => {
                  const ledger = buildLedgerRow(o);
                  const open = expandedLedger === o.id;
                  return (
                    <div key={o.id}>
                      <button
                        onClick={() => setExpandedLedger(open ? null : o.id)}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-stone-50 transition-colors"
                      >
                        <ChevronRight className={`w-4 h-4 text-stone-300 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-stone-800">{ledger.orderCode}</span>
                            <span className="text-sm text-stone-600 truncate">{ledger.customer}</span>
                            {ledger.coupon && (
                              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">{ledger.coupon}</span>
                            )}
                            {ledger.payLabel && (
                              <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-full">{ledger.payLabel}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-400 mt-0.5">
                            {ledger.dateLabel} · {o.product_title}{ledger.size ? ` · ${ledger.size}` : ''} · Qty {ledger.qty}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-stone-900">{formatBDT(ledger.total)}</p>
                          <p className={`text-[11px] font-semibold ${ledger.due > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {ledger.due > 0 ? `${formatBDT(ledger.due)} due` : 'Fully paid'}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            o.status === 'delivered' ? 'bg-emerald-100 text-emerald-600'
                              : o.status === 'canceled' ? 'bg-red-100 text-red-600'
                                : 'bg-amber-100 text-amber-600'
                          }`}>
                          {o.status === 'delivered' ? 'Delivered' : o.status === 'canceled' ? 'Canceled' : 'Pending'}
                        </span>
                      </button>
                      {open && (
                        <div className="px-5 pb-4 pt-1 bg-stone-50/60">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                            <div>
                              <p className={ORD_LBL}>Unit price</p>
                              <p className="text-sm font-semibold text-stone-800">{formatBDT(ledger.unitPrice)} × {ledger.qty}</p>
                            </div>
                            <div>
                              <p className={ORD_LBL}>Subtotal</p>
                              <p className="text-sm font-semibold text-stone-800">{formatBDT(ledger.subtotal)}</p>
                            </div>
                            <div>
                              <p className={ORD_LBL}>Discount</p>
                              <p className="text-sm font-semibold text-emerald-600">{ledger.discount > 0 ? `−${formatBDT(ledger.discount)}` : '—'}</p>
                            </div>
                            <div>
                              <p className={ORD_LBL}>Delivery fee</p>
                              <p className="text-sm font-semibold text-stone-800">{formatBDT(ledger.deliveryFee)}</p>
                            </div>
                            <div>
                              <p className={ORD_LBL}>Order total</p>
                              <p className="text-sm font-bold text-stone-900">{formatBDT(ledger.total)}</p>
                            </div>                            <div>
                              <p className={ORD_LBL}>Advance paid</p>
                              <p className="text-sm font-semibold text-emerald-600">{formatBDT(ledger.advance)}</p>
                            </div>
                            <div>
                              <p className={ORD_LBL}>Due on delivery</p>
                              <p className={`text-sm font-semibold ${ledger.due > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatBDT(ledger.due)}</p>
                            </div>
                            <div>
                              <p className={ORD_LBL}>Zone</p>
                              <p className="text-sm font-semibold text-stone-800">{ledger.zone}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Stock movement history modal ── */}
        {movementProductId && (() => {
          const product = products.find((p) => p.id === movementProductId);
          const moves = stockMovements.filter((m) => m.product_id === movementProductId);
          const productName = product?.title ?? 'Product';
          return (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setMovementProductId(null)}>
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
                  <div>
                    <h3 className="font-display text-lg font-bold text-stone-900">Stock history — {productName}</h3>
                    <p className="text-xs text-stone-500 mt-0.5">Every recorded stock change, newest first.</p>
                  </div>
                  <button onClick={() => setMovementProductId(null)} className="text-stone-400 hover:text-stone-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                  {moves.length === 0 ? (
                    <div className="text-center py-8 text-stone-400">
                      <Clock className="w-10 h-10 mx-auto mb-2 text-stone-300" />
                      <p className="text-sm">No movements recorded yet.</p>
                      <p className="text-xs mt-1">History starts once the SQL migration is applied — then every order, sell, and restock is logged.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {moves.map((m) => (
                        <div key={m.id} className="flex items-center justify-between bg-stone-50 rounded-xl px-3.5 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-800">
                              {m.size ? <span className="text-[11px] font-bold uppercase text-stone-500 mr-1.5">{m.size}</span> : null}
                              {m.reason.replace(/_/g, ' ')}{m.note ? <span className="text-xs text-stone-400"> · {m.note}</span> : null}
                            </p>
                            <p className="text-[11px] text-stone-400">
                              {new Date(m.created_at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                              {m.admin_id ? ` · by ${m.admin_id}` : ' · customer order'}
                            </p>
                          </div>
                          <span className={`text-sm font-bold ${m.delta < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {m.delta > 0 ? `+${m.delta}` : m.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Bulk delete orders confirm modal ── */}
        {bulkDeleteConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setBulkDeleteConfirm(false)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-up p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-stone-900">Delete {selectedOrderIds.size} order{selectedOrderIds.size === 1 ? '' : 's'}?</h3>
                  <p className="text-xs text-stone-500">This permanently removes them and cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-5">
                <button onClick={() => setBulkDeleteConfirm(false)} className="px-4 py-2 text-sm font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-all">Keep orders</button>
                <button
                  onClick={() => void bulkDeleteOrders()}
                  disabled={bulkBusy === 'delete'}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-400 disabled:opacity-60 rounded-xl transition-all"
                >
                  {bulkBusy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete forever
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete expense confirm modal ── */}
        {deleteExpenseId && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteExpenseId(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-up p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold text-stone-900">Remove this expense?</h3>
              <p className="text-xs text-stone-500 mt-1">It will no longer count against net profit.</p>
              <div className="flex gap-2 justify-end mt-5">
                <button onClick={() => setDeleteExpenseId(null)} className="px-4 py-2 text-sm font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-all">Cancel</button>
                <button onClick={() => void handleDeleteExpense(deleteExpenseId)} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-400 rounded-xl transition-all">Remove</button>
              </div>
            </div>
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
           <div className="space-y-6">
             {/* Settings sub-tab navigation */}
             <div className="flex flex-wrap gap-2 bg-white rounded-2xl border border-stone-100 shadow-sm p-2">
               {([
                 { id: 'storefront' as const, label: 'Storefront', icon: <Image className="w-4 h-4" /> },
                 { id: 'delivery' as const, label: 'Delivery & Payments', icon: <Truck className="w-4 h-4" /> },
                 { id: 'inventory' as const, label: 'Inventory', icon: <Package className="w-4 h-4" /> },
                 { id: 'activity' as const, label: 'Activity Log', icon: <Clock className="w-4 h-4" /> },
                 ...(isSuperAdmin ? [{ id: 'team' as const, label: 'Admin Team', icon: <Users className="w-4 h-4" /> }] : []),
               ]).map((st) => (
                 <button
                   key={st.id}
                   onClick={() => setSettingsTab(st.id)}
                   className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                     settingsTab === st.id ? 'bg-stone-900 text-white shadow-md' : 'text-stone-600 hover:bg-stone-100'
                   }`}
                 >
                   {st.icon} {st.label}
                 </button>
               ))}
             </div>

             {settingsTab === 'inventory' && (
             <>
             {/* ── Finance & inventory settings ── */}
             <div>
               <h2 className="font-display text-xl font-bold text-stone-900">Finance &amp; Inventory</h2>
               <p className="text-sm text-stone-500 mt-1">Tune the numbers shown on the Finance tab.</p>
               <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mt-4">
                 <div className="max-w-xs">
                   <label className="block text-sm font-medium text-stone-700 mb-1.5">Low-stock alert threshold</label>
                   <input
                     type="number"
                     min="0"
                     step="1"
                     value={thresholdInput}
                     onChange={(e) => setThresholdInput(e.target.value)}
                     placeholder="5"
                     className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                   />
                   <p className="text-xs text-stone-400 mt-1">
                     Products with stock at or below this are flagged as low stock. 0 turns alerts off.
                   </p>
                 </div>
                 <button onClick={handleSaveThreshold} disabled={thresholdSaving}
                   className="mt-4 flex items-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm">
                   {thresholdSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                   {thresholdSaving ? 'Saving...' : 'Save Threshold'}
                 </button>
               </div>
             </div>

             </>
             )}

             {settingsTab === 'storefront' && (
             <>
             {/* ── WhatsApp numbers ── */}
             <div>
               <h2 className="font-display text-xl font-bold text-stone-900">WhatsApp Numbers</h2>
               <p className="text-sm text-stone-500 mt-1">Where customers reach you on WhatsApp. Both numbers go live on the storefront as soon as you save.</p>
               <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mt-4 space-y-5">
                 <div>
                   <label className="block text-sm font-medium text-stone-700 mb-1.5">Order number <span className="text-stone-400 font-normal">(product pages)</span></label>
                   <div className="relative">
                     <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">+88</span>
                     <input
                       type="tel"
                       value={waNumbers.order}
                       onChange={(e) => setWaNumbers({ ...waNumbers, order: e.target.value })}
                       placeholder="e.g. 01410423299"
                       className="w-full border border-stone-200 rounded-xl pl-11 pr-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
                     />
                   </div>
                   <p className="text-xs text-stone-400 mt-1">Used by the green "Order on WhatsApp" button on every product page. Local (01…) or international (880…) format both work.</p>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-stone-700 mb-1.5">Chat number <span className="text-stone-400 font-normal">(floating bubble + footer)</span></label>
                   <div className="relative">
                     <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">+88</span>
                     <input
                       type="tel"
                       value={waNumbers.chat}
                       onChange={(e) => setWaNumbers({ ...waNumbers, chat: e.target.value })}
                       placeholder="e.g. 01305827996"
                       className="w-full border border-stone-200 rounded-xl pl-11 pr-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
                     />
                   </div>
                   <p className="text-xs text-stone-400 mt-1">Used by the always-visible chat bubble in the bottom-right corner and the WhatsApp link in the footer.</p>
                 </div>
                 <button onClick={handleSaveWhatsApp} disabled={waSaving}
                   className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm">
                   {waSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                   {waSaving ? 'Saving...' : 'Save WhatsApp Numbers'}
                 </button>
               </div>
             </div>

             </>
             )}

             {settingsTab === 'activity' && (
             <>
             {/* ── Admin activity log ── */}
             <div>
               <div className="flex flex-wrap items-center justify-between gap-3">
                 <div>
                   <h2 className="font-display text-xl font-bold text-stone-900">Admin Activity Log</h2>
                   <p className="text-sm text-stone-500 mt-1">Who did what — status changes, bookings, deletions, product edits, stock changes. Newest first.</p>
                 </div>
                 <div className="flex items-center gap-2">
                   <label className="text-sm font-medium text-stone-700">Filter by admin</label>
                   <select
                     value={activityAdminFilter}
                     onChange={(e) => setActivityAdminFilter(e.target.value)}
                     className="border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                   >
                     <option value="all">All admins</option>
                     {[...new Set(adminLogs.map((l) => (l.admin_id ?? '').trim()).filter(Boolean))]
                       .sort((a, b) => a.localeCompare(b))
                       .map((admin) => (
                         <option key={admin} value={admin}>{admin}</option>
                       ))}
                   </select>
                 </div>
               </div>
               {adminLogs.length === 0 ? (
                 <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mt-4">
                   <p className="text-sm text-stone-400">
                     No activity recorded yet. Actions start appearing once the admin-expansion SQL migration is applied and admins use the panel.
                   </p>
                 </div>
               ) : filteredActivityLogs.length === 0 ? (
                 <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mt-4">
                   <p className="text-sm text-stone-400">
                     No activity by "{activityAdminFilter}" in the loaded log — try another admin or "All admins".
                   </p>
                 </div>
               ) : (
                 <div className="bg-white rounded-2xl shadow-sm border border-stone-100 divide-y divide-stone-100 mt-4 max-h-96 overflow-y-auto">
                   {filteredActivityLogs.slice(0, 80).map((log) => (
                     <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                       <span className="text-[10px] font-bold uppercase bg-stone-900 text-white px-2 py-0.5 rounded-md flex-shrink-0">{log.admin_id}</span>
                       <span className="text-xs font-semibold text-brand-600 flex-shrink-0">{log.action.replace(/_/g, ' ')}</span>
                       <span className="text-xs text-stone-500 truncate min-w-0 flex-1">{log.detail ?? log.target ?? ''}</span>
                       <span className="text-[11px] text-stone-400 flex-shrink-0">
                         {new Date(log.created_at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                       </span>
                     </div>
                   ))}
                   {filteredActivityLogs.length > 80 && (
                     <div className="px-4 py-2 text-[11px] text-stone-400">
                       Showing newest 80 of {filteredActivityLogs.length} matching entries — filter by admin to narrow further.
                     </div>
                   )}
                 </div>
               )}
             </div>
             </>
             )}

             {settingsTab === 'storefront' && (
             <>
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

             </>
             )}

             {settingsTab === 'delivery' && (
             <>
             {/* ── Steadfast courier rates + checkout payment ── */}
             <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
               <div className="px-6 py-5 border-b border-stone-100">
                 <h3 className="font-display text-lg font-bold text-stone-900">Steadfast Courier Rates & Checkout Payment</h3>
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
                 <div>
                   <label className="block text-sm font-medium text-stone-700 mb-1.5">Checkout bKash number (advance payment)</label>
                   <input
                     type="tel"
                     value={checkoutBkash}
                     onChange={(e) => setCheckoutBkash(e.target.value)}
                     placeholder="e.g. 01712-345678"
                     className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
                   />
                   <p className="text-xs text-stone-400 mt-1">Shown on checkout as the personal bKash number customers send the delivery-fee advance to. Falls back to the built-in placeholder if left blank.</p>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-stone-700 mb-1.5">Checkout Nagad number (advance payment)</label>
                   <input
                     type="tel"
                     value={checkoutNagad}
                     onChange={(e) => setCheckoutNagad(e.target.value)}
                     placeholder="e.g. 01812-345678"
                     className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
                   />
                   <p className="text-xs text-stone-400 mt-1">Adds a bKash / Nagad switch on checkout and shows this as the personal Nagad number. Leave blank to offer bKash only.</p>
                 </div>
                 <button onClick={handleSaveSteadfastRates} disabled={steadfastSaving}
                   className="flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm">
                   {steadfastSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                   {steadfastSaving ? 'Saving...' : 'Save Courier Rates'}
                 </button>
               </div>
             </div>
             </>
             )}

             {settingsTab === 'team' && isSuperAdmin && (
               <div className="space-y-4">
                 <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
                   <h3 className="font-display text-lg font-bold text-stone-900">Add an admin</h3>
                   <p className="text-sm text-stone-500 mt-0.5">
                     The email must already exist as a user in Supabase (Dashboard → Authentication → Users) with a password — access is granted here.
                   </p>
                   <div className="flex flex-wrap items-end gap-3 mt-4">
                     <div className="flex-1 min-w-[220px]">
                       <label className="block text-sm font-medium text-stone-700 mb-1.5">Email</label>
                       <input
                         type="email"
                         value={newTeamEmail}
                         onChange={(e) => setNewTeamEmail(e.target.value)}
                         placeholder="admin2@ornix.com.bd"
                         className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-stone-700 mb-1.5">Role</label>
                       <select
                         value={newTeamRole}
                         onChange={(e) => setNewTeamRole(e.target.value as 'admin' | 'super_admin')}
                         className="border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                       >
                         <option value="admin">Admin</option>
                         <option value="super_admin">Super admin</option>
                       </select>
                     </div>
                     <button
                       onClick={() => void handleAddTeamMember()}
                       disabled={teamBusy !== '' && teamBusy === newTeamEmail.trim().toLowerCase()}
                       className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm"
                     >
                       {teamBusy !== '' && teamBusy === newTeamEmail.trim().toLowerCase() ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                       Add admin
                     </button>
                   </div>
                 </div>

                 <div className="space-y-3">
                   {teamRows.map((row) => (
                     <div key={row.email} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
                       <div className="flex flex-wrap items-center justify-between gap-3">
                         <div className="flex items-center gap-3 min-w-0">
                           <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                             row.role === 'super_admin' ? 'bg-purple-100 text-purple-600' : 'bg-stone-100 text-stone-500'
                           }`}>
                             <ShieldCheck className="w-4.5 h-4.5" />
                           </div>
                           <div className="min-w-0">
                             <p className="font-semibold text-stone-900 text-sm truncate">{row.email}</p>
                             <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                               row.role === 'super_admin' ? 'bg-purple-100 text-purple-600' : 'bg-stone-100 text-stone-500'
                             }`}>
                               {row.role === 'super_admin' ? 'Super admin' : 'Admin'}
                             </span>
                           </div>
                         </div>
                         {row.email !== adminEmail && (
                           <button
                             onClick={() => void handleRemoveTeamMember(row.email)}
                             disabled={teamBusy === row.email}
                             title="Remove from the admin team"
                             className="p-2 text-stone-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                           >
                             {teamBusy === row.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                           </button>
                         )}
                       </div>
                       {row.role === 'super_admin' ? (
                         <p className="text-xs text-stone-400 mt-3">Super admins have full access to every tab and manage this team.</p>
                       ) : (
                         <div className="mt-4 pt-4 border-t border-stone-100">
                           <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Tab access</p>
                           <div className="flex flex-wrap gap-2">
                             {ALL_CAPABILITIES.filter((c) => c.key !== 'team').map((c) => {
                               const allowed = row.permissions[c.key] !== false;
                               return (
                                 <button
                                   key={c.key}
                                   onClick={() => void handleToggleCapability(row.email, c.key, allowed)}
                                   disabled={teamBusy === row.email + c.key}
                                   title={allowed ? `Click to hide ${c.label} from ${row.email}` : `Click to allow ${c.label} for ${row.email}`}
                                   className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50 ${
                                     allowed
                                       ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                       : 'bg-stone-100 text-stone-400 border border-stone-200 hover:bg-stone-200'
                                   }`}
                                 >
                                   {allowed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                   {c.label}
                                 </button>
                               );
                             })}
                           </div>
                           <p className="text-[11px] text-stone-400 mt-2">Green = tab visible & writes allowed. Grey = hidden and blocked server-side too.</p>
                         </div>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
             )}
           </div>
         )}
       </div>

      {/* ── Size chart manager modal ── */}
      {chartManagerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-4 animate-fade-in-up">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
              <div>
                <h3 className="font-display text-lg font-bold text-stone-900">Size Charts</h3>
                <p className="text-sm text-stone-500 mt-0.5">Reusable measurement tables — attach one to any product; edit once, updates everywhere.</p>
              </div>
              <button onClick={() => setChartManagerOpen(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {sizeCharts.length === 0 ? (
                <p className="text-sm text-stone-500 py-6 text-center">No size charts yet — create one to show measurements on product pages.</p>
              ) : (
                sizeCharts.map((tpl) => {
                  const inUse = products.filter((p) => p.size_chart_template_id === tpl.id).length;
                  return (
                    <div key={tpl.id} className="border border-stone-200 rounded-2xl px-4 py-3.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 text-sm">{tpl.name}</p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {(tpl.measurements?.rows ?? []).join(' · ') || '—'} across {(tpl.measurements?.sizes ?? []).length} sizes
                          {inUse > 0 && <span className="text-emerald-600 font-medium"> · used by {inUse} product{inUse === 1 ? '' : 's'}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEditChartModal(tpl)} className="p-2 text-stone-400 hover:text-stone-700 transition-colors" aria-label="Edit chart">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => void handleDeleteChart(tpl)} className="p-2 text-stone-400 hover:text-red-500 transition-colors" aria-label="Delete chart">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <button onClick={openAddChartModal}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-stone-200 hover:border-brand-400 text-stone-500 hover:text-brand-600 font-semibold py-3 rounded-2xl transition-all">
                <Plus className="w-4 h-4" /> New size chart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Size chart editor modal ── */}
      {chartModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-4 animate-fade-in-up">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
              <h3 className="font-display text-lg font-bold text-stone-900">
                {chartModalMode === 'add' ? 'New Size Chart' : `Edit — ${editingChart?.name}`}
              </h3>
              <button onClick={() => setChartModalOpen(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Chart name *</label>
                  <input type="text" value={chartName} onChange={(e) => setChartName(e.target.value)}
                    placeholder="e.g. Round Neck Tee — Relaxed"
                    className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Note <span className="text-stone-400 font-normal">(optional)</span>
                  </label>
                  <input type="text" value={chartNote} onChange={(e) => setChartNote(e.target.value)}
                    placeholder="e.g. Measurements in inches"
                    className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
              </div>

              {/* Sizes (columns) */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Sizes (columns)</label>
                <div className="flex flex-wrap items-center gap-2">
                  {chartSizes.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-stone-100 rounded-full pl-3 pr-1.5 py-1">
                      <input type="text" value={s}
                        onChange={(e) => setChartSizes(chartSizes.map((x, j) => (j === i ? e.target.value : x)))}
                        className="bg-transparent w-14 text-sm focus:outline-none" />
                      <button onClick={() => { setChartSizes(chartSizes.filter((_, j) => j !== i)); }}
                        className="text-stone-400 hover:text-red-500" aria-label="Remove size"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  ))}
                  <button onClick={() => setChartSizes([...chartSizes, ''])}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                    <Plus className="w-3.5 h-3.5" /> Add size
                  </button>
                </div>
              </div>

              {/* Measurement rows */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-stone-700">Measurements (rows)</label>
                  <button onClick={() => setChartRows([...chartRows, ''])}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                    <Plus className="w-3.5 h-3.5" /> Add row
                  </button>
                </div>
                <div className="border border-stone-200 rounded-2xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">Measurement</th>
                        {chartSizes.map((s, i) => (
                          <th key={i} className="px-3 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">{s || '—'}</th>
                        ))}
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {chartRows.map((row, ri) => (
                        <tr key={ri} className="border-b border-stone-100 last:border-0">
                          <td className="px-3 py-2">
                            <input type="text" value={row}
                              onChange={(e) => setChartRows(chartRows.map((x, j) => (j === ri ? e.target.value : x)))}
                              placeholder="e.g. Chest"
                              className="w-full bg-transparent font-medium text-stone-800 focus:outline-none min-w-[6rem]" />
                          </td>
                          {chartSizes.map((s, si) => (
                            <td key={si} className="px-2 py-2">
                              <input type="text" value={chartValues[row]?.[s] ?? ''}
                                onChange={(e) => setChartValues((prev) => ({
                                  ...prev,
                                  [row]: { ...(prev[row] ?? {}), [s]: e.target.value },
                                }))}
                                className="w-16 bg-transparent text-center focus:outline-none focus:bg-brand-50 rounded" />
                            </td>
                          ))}
                          <td className="px-2">
                            <button onClick={() => setChartRows(chartRows.filter((_, j) => j !== ri))}
                              className="text-stone-300 hover:text-red-500" aria-label="Remove row"><X className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                      {chartRows.length === 0 && (
                        <tr><td colSpan={chartSizes.length + 2} className="px-3 py-4 text-center text-stone-400 text-sm">Add a measurement row to begin.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-stone-400 mt-1.5">Values are free text — “40”, “40 in”, “28.5”, or “—” if not applicable.</p>
              </div>

              {chartError && <p className="text-sm text-red-500">{chartError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setChartModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl border-2 border-stone-200 hover:border-stone-400 text-stone-700 font-semibold text-sm transition-all">Cancel</button>
                <button onClick={handleSaveChart} disabled={chartSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-semibold py-2.5 rounded-xl transition-all">
                  {chartSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {chartSaving ? 'Saving...' : chartModalMode === 'add' ? 'Create Chart' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Size chart <span className="text-stone-400 font-normal">(optional — measurement table shown on the product page)</span>
                </label>
                <select
                  value={form.size_chart_template_id}
                  onChange={(e) => setForm({ ...form, size_chart_template_id: e.target.value })}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                >
                  <option value="">No size chart</option>
                  {sizeCharts.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
                {(() => {
                  const linked = sizeCharts.find((tpl) => tpl.id === form.size_chart_template_id);
                  if (!linked) return <p className="text-xs text-stone-400 mt-1">Create reusable charts under “Size Charts” — many products can share one.</p>;
                  const m = linked.measurements;
                  return <p className="text-xs text-stone-400 mt-1">{m?.rows?.join(' · ') ?? ''} across {m?.sizes?.length ?? 0} sizes — edit it under “Size Charts”.</p>;
                })()}
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
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Cost Price (৳) <span className="text-stone-400 font-normal">(optional — what you pay your supplier; powers profit reports)</span>
                </label>
                <input type="number" min="0" step="1" value={form.cost_price}
                  onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="Leave blank if unknown" />
                {form.cost_price && form.price && Number(form.cost_price) > 0 && (
                  <p className="text-xs text-stone-500 mt-1.5">
                    Margin: <span className="text-emerald-600 font-semibold">৳{(Number(form.price) - Number(form.cost_price)).toFixed(0)}/unit</span>
                    {' '}({Math.round(((Number(form.price) - Number(form.cost_price)) / Number(form.price)) * 100)}%)
                    {form.discount_price && Number(form.discount_price) < Number(form.price) && Number(form.cost_price) < Number(form.discount_price) && (
                      <span className="text-stone-400"> · at discount price: ৳{(Number(form.discount_price) - Number(form.cost_price)).toFixed(0)}/unit</span>
                    )}
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
