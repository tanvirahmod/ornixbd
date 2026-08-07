import { useState, useEffect } from 'react';
import {
  Lock, LogOut, Plus, Pencil, Trash2, X, Loader2,
  Package, ShoppingBag, Eye, Image, Save, AlertCircle, Tag, Search,
  Bell, CheckCheck, Truck, Clock, MessageSquare, Mail
} from 'lucide-react';
import { supabase, Product, Order, Category, Feedback } from '../lib/supabase';
import { verifyAdmin } from '../lib/adminCredentials';

interface AdminPageProps {
  onNavigate: (page: string) => void;
}

type Tab = 'products' | 'categories' | 'orders' | 'feedback';
type ModalMode = 'add' | 'edit';

const EMPTY_FORM = {
  title: '',
  description: '',
  price: '',
  discount_price: '',
  sizes: '',
  stock_count: '',
  category_id: '',
};

export default function AdminPage({ onNavigate }: AdminPageProps) {
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

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalMode, setCatModalMode] = useState<ModalMode>('add');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'product' | 'category'; id: string } | null>(null);

  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [notifications, setNotifications] = useState<Order[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [updatingDelivery, setUpdatingDelivery] = useState<string | null>(null);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const [deleteFeedbackConfirm, setDeleteFeedbackConfirm] = useState<string | null>(null);

  const filteredProducts = products.filter((p) => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.product_code ?? '').toLowerCase().includes(q) ||
      (p.categories?.name ?? '').toLowerCase().includes(q)
    );
  });

  const filteredOrders = orders.filter((o) => {
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

  useEffect(() => {
    if (isAuthenticated) {
      fetchAll();
    }
  }, [isAuthenticated]);

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
          setFeedbackList((prev) => prev.filter((f) => f.id !== deleted.id));
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
    const [prodRes, catRes, ordRes, feedRes] = await Promise.all([
      supabase
        .from('products')
        .select('*, product_images(id, image_url, display_order), categories(id, name, created_at)')
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
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
    setLoading(false);
  }

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
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      title: product.title,
      description: product.description,
      price: String(product.price),
      discount_price: product.discount_price != null ? String(product.discount_price) : '',
      sizes: product.sizes.join(', '),
      stock_count: String(product.stock_count),
      category_id: product.category_id ?? '',
    });
    const imgs = product.product_images?.map((img) => img.image_url) ?? [];
    setImageUrls(imgs.length > 0 ? imgs : ['']);
    setModalMode('edit');
    setFormError('');
    setModalOpen(true);
  };

  const validateForm = () => {
    if (!form.title.trim()) return 'Product title is required.';
    if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) < 0)
      return 'Enter a valid price.';
    if (!form.stock_count.trim() || isNaN(Number(form.stock_count)) || Number(form.stock_count) < 0)
      return 'Enter a valid stock count.';
    return '';
  };

  const handleSaveProduct = async () => {
    const err = validateForm();
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError('');

    const sizes = form.sizes.split(',').map((s) => s.trim()).filter(Boolean);
    const validImages = imageUrls.map((u) => u.trim()).filter(Boolean);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      discount_price: form.discount_price.trim() !== '' ? Number(form.discount_price) : null,
      sizes,
      stock_count: Number(form.stock_count),
      category_id: form.category_id || null,
    };

    if (modalMode === 'add') {
      const { data: inserted, error: insertError } = await supabase
        .from('products').insert(payload).select().single();
      if (insertError || !inserted) { setFormError('Failed to save product.'); setSaving(false); return; }
      if (validImages.length > 0) {
        await supabase.from('product_images').insert(
          validImages.map((url, i) => ({ product_id: inserted.id, image_url: url, display_order: i }))
        );
      }
    } else if (editingProduct) {
      const { error: updateError } = await supabase
        .from('products').update(payload).eq('id', editingProduct.id);
      if (updateError) { setFormError('Failed to update product.'); setSaving(false); return; }
      await supabase.from('product_images').delete().eq('product_id', editingProduct.id);
      if (validImages.length > 0) {
        await supabase.from('product_images').insert(
          validImages.map((url, i) => ({ product_id: editingProduct.id, image_url: url, display_order: i }))
        );
      }
    }

    await fetchAll();
    setSaving(false);
    setModalOpen(false);
  };

  const openAddCatModal = () => {
    setCatName('');
    setEditingCat(null);
    setCatModalMode('add');
    setCatError('');
    setCatModalOpen(true);
  };

  const openEditCatModal = (cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatModalMode('edit');
    setCatError('');
    setCatModalOpen(true);
  };

  const handleSaveCat = async () => {
    if (!catName.trim()) { setCatError('Category name is required.'); return; }
    setCatSaving(true);
    setCatError('');
    if (catModalMode === 'add') {
      const { error } = await supabase.from('categories').insert({ name: catName.trim() });
      if (error) { setCatError(error.message.includes('unique') ? 'Category already exists.' : 'Failed to save.'); setCatSaving(false); return; }
    } else if (editingCat) {
      const { error } = await supabase.from('categories').update({ name: catName.trim() }).eq('id', editingCat.id);
      if (error) { setCatError('Failed to update.'); setCatSaving(false); return; }
    }
    await fetchAll();
    setCatSaving(false);
    setCatModalOpen(false);
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

  const toggleDelivered = async (orderId: string, current: boolean) => {
    setUpdatingDelivery(orderId);
    await supabase.from('orders').update({ delivered: !current }).eq('id', orderId);
    setUpdatingDelivery(null);
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

  // ── Login screen ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center px-4">
        <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-brand-600/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-amber-500/10 rounded-full blur-[100px]" />
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
          {(['products', 'categories', 'orders', 'feedback'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold capitalize border-b-2 transition-all whitespace-nowrap ${
                tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}>
              {t === 'products' && <Package className="w-4 h-4" />}
              {t === 'categories' && <Tag className="w-4 h-4" />}
              {t === 'orders' && <ShoppingBag className="w-4 h-4" />}
              {t === 'feedback' && <MessageSquare className="w-4 h-4" />}
              {t}
              {t === 'feedback' && unreadFeedback > 0 && (
                <span className="bg-brand-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadFeedback > 9 ? '9+' : unreadFeedback}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ── Products tab ── */}
        {tab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">Products</h2>
                <p className="text-sm text-stone-500">{products.length} total</p>
              </div>
              <button onClick={openAddModal}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                <Plus className="w-4 h-4" /> Add Product
              </button>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search by product name, code, or category..."
                className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20 text-stone-400">
                <Package className="w-12 h-12 mx-auto mb-3 text-stone-300" />
                <p>{productSearch ? 'No products match your search.' : 'No products yet. Add your first product!'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map((product) => {
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
                        {product.product_code && (
                          <p className="text-[11px] font-mono text-stone-400 mb-2">{product.product_code}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-stone-500 mb-3">
                          <span>{product.stock_count} in stock</span>
                          {product.sizes.length > 0 && <span>{product.sizes.length} sizes</span>}
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
            )}
          </div>
        )}

        {/* ── Categories tab ── */}
        {tab === 'categories' && (
          <div>
            <div className="flex items-center justify-between mb-6">
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
              <div className="text-center py-20 text-stone-400">
                <Tag className="w-12 h-12 mx-auto mb-3 text-stone-300" />
                <p>No categories yet. Add your first one!</p>
              </div>
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
                          <p className="font-semibold text-stone-900">{cat.name}</p>
                          <p className="text-xs text-stone-400">{count} product{count !== 1 ? 's' : ''}</p>
                        </div>
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
            <div className="mb-6">
              <h2 className="font-display text-xl font-bold text-stone-900">Orders</h2>
              <p className="text-sm text-stone-500">{orders.length} total</p>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search by customer name, phone, product code, or TrxID..."
                className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              />
            </div>

            {filteredOrders.length === 0 ? (
              <div className="text-center py-20 text-stone-400">
                <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-stone-300" />
                <p>{orderSearch ? 'No orders match your search.' : 'No orders yet.'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => (
                  <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-stone-900">{order.product_title}</p>
                          {order.product_code && (
                            <span className="text-[11px] font-mono bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">
                              {order.product_code}
                            </span>
                          )}
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            order.delivered
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                              : 'bg-amber-50 text-amber-600 border border-amber-200'
                          }`}>
                            {order.delivered ? <><CheckCheck className="w-3 h-3" /> Delivered</> : <><Clock className="w-3 h-3" /> Pending</>}
                          </span>
                        </div>
                        {order.selected_size && (
                          <p className="text-xs text-stone-500">Size: <span className="font-medium text-stone-700">{order.selected_size}</span></p>
                        )}
                      </div>
                      <span className="text-xs text-stone-400 flex-shrink-0">
                        {new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div><span className="text-xs text-stone-400">Customer</span><p className="font-medium text-stone-800">{order.customer_name}</p></div>
                      <div><span className="text-xs text-stone-400">Phone</span><p className="font-medium text-stone-800">{order.customer_phone}</p></div>
                      <div className="sm:col-span-2"><span className="text-xs text-stone-400">Address</span><p className="font-medium text-stone-800">{order.customer_address}</p></div>
                      <div><span className="text-xs text-stone-400">bKash Number</span><p className="font-medium text-stone-800">{order.bkash_number ?? '—'}</p></div>
                      <div><span className="text-xs text-stone-400">TrxID</span><p className="font-medium text-stone-800">{order.trx_id ?? '—'}</p></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-stone-100">
                      <button
                        onClick={() => toggleDelivered(order.id, order.delivered)}
                        disabled={updatingDelivery === order.id}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                          order.delivered
                            ? 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                            : 'bg-emerald-500 text-white hover:bg-emerald-400 hover:shadow-md'
                        } disabled:opacity-60`}
                      >
                        {updatingDelivery === order.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : order.delivered ? (
                          <Clock className="w-4 h-4" />
                        ) : (
                          <Truck className="w-4 h-4" />
                        )}
                        {order.delivered ? 'Mark as Pending' : 'Mark as Delivered'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
              <div className="text-center py-20 text-stone-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-stone-300" />
                <p>{feedbackSearch ? 'No feedback matches your search.' : 'No feedback yet.'}</p>
              </div>
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
      </div>

      {/* ── Product modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
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
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Stock *</label>
                  <input type="number" min="0" value={form.stock_count}
                    onChange={(e) => setForm({ ...form, stock_count: e.target.value })}
                    className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    placeholder="0" />
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
                <input type="text" value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                  className="w-full border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="S, M, L, XL" />
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
                    <div key={i} className="flex gap-2">
                      <input type="url" value={url}
                        onChange={(e) => { const next = [...imageUrls]; next[i] = e.target.value; setImageUrls(next); }}
                        className="flex-1 border border-stone-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                        placeholder="https://example.com/photo.jpg" />
                      {imageUrls.length > 1 && (
                        <button onClick={() => setImageUrls(imageUrls.filter((_, j) => j !== i))}
                          className="text-stone-400 hover:text-red-500 transition-colors">
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
    </div>
  );
}
