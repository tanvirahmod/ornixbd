import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/LanguageContext';
import { useNavigation } from '../lib/navigation';
import { useCart } from '../lib/CartContext';
import { COVER_FALLBACK, productParam } from '../lib/utils';

const DELIVERY_FEE = 150;
const FREE_DELIVERY_THRESHOLD = 1000;

export default function CartPage() {
  const { t } = useLanguage();
  const onNavigate = useNavigation();
  const navigate = useNavigate();
  const { items, itemCount, subtotal, updateQuantity, removeItem, clearCart } = useCart();

  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD || subtotal === 0 ? 0 : DELIVERY_FEE;
  const total = subtotal + deliveryFee;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center">
          <ShoppingBag className="w-10 h-10 text-stone-300" />
        </div>
        <h1 className="font-display text-2xl font-bold text-stone-900">{t('cartEmpty')}</h1>
        <p className="text-stone-500 text-sm">{t('cartEmptySubtitle')}</p>
        <button
          onClick={() => onNavigate('shop')}
          className="mt-2 bg-stone-900 hover:bg-stone-800 text-white font-bold py-3.5 px-8 rounded-2xl transition-all hover:shadow-lg"
        >
          {t('continueShopping')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 pt-6 flex items-center gap-2 text-sm text-stone-500">
        <button onClick={() => onNavigate('home')} className="flex items-center gap-1 hover:text-stone-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t('homeBreadcrumb')}
        </button>
        <span className="text-stone-300">/</span>
        <span className="text-stone-700 font-medium">{t('cartTitle')}</span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
            {t('cartTitle')}
            <span className="text-stone-400 text-lg font-semibold ml-2">({t('itemsCountMany', { count: itemCount })})</span>
          </h1>
          <button
            onClick={clearCart}
            className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
          >
            {t('clearCart')}
          </button>
        </div>

        <div className="grid md:grid-cols-5 gap-6 lg:gap-10">
          {/* Cart items */}
          <div className="md:col-span-3 space-y-4">
            {items.map((item) => (
              <div
                key={`${item.productId}__${item.size ?? 'none'}`}
                className="bg-white rounded-3xl shadow-sm border border-stone-100 p-4 flex gap-4"
              >
                <button
                  onClick={() => navigate(`/product/${productParam(item.title, item.productCode ?? item.productId)}`)}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-stone-100 flex-shrink-0"
                  aria-label={item.title}
                >
                  <img
                    src={item.imageUrl ?? COVER_FALLBACK}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = COVER_FALLBACK; }}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 text-sm leading-snug line-clamp-2">{item.title}</p>
                      {item.productCode && (
                        <p className="text-[11px] font-mono text-stone-400 mt-0.5">{item.productCode}</p>
                      )}
                      {item.size && (
                        <p className="text-xs text-stone-500 mt-1">
                          {t('sizeLabel')}: <span className="font-medium text-stone-700">{item.size}</span>
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.productId, item.size)}
                      className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"
                      aria-label={t('removeItem')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
                        aria-label={t('decreaseQuantity')}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-semibold text-stone-900">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
                        aria-label={t('increaseQuantity')}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="font-display font-bold text-stone-900">
                      ৳{(item.unitPrice * item.quantity).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5 sticky top-20">
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">{t('orderSummary')}</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">{t('subtotal')}</span>
                  <span className="font-medium text-stone-700">৳{subtotal.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">{t('deliveryFee')}</span>
                  <span className={`font-medium ${deliveryFee === 0 ? 'text-emerald-600' : 'text-stone-700'}`}>
                    {deliveryFee === 0 ? t('freeDeliveryShort') : `৳${deliveryFee}`}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-stone-100">
                  <span className="font-semibold text-stone-900">{t('totalToPay')}</span>
                  <span className="font-display font-bold text-stone-900 text-lg">৳{total.toFixed(0)}</span>
                </div>
              </div>
              <button
                onClick={() => navigate('/checkout/cart')}
                className="mt-5 w-full bg-brand-500 hover:bg-brand-400 text-white font-bold py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5"
              >
                {t('proceedToCheckout')}
              </button>
              <p className="mt-3 text-xs text-stone-400 text-center">{t('freeDelivery')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
