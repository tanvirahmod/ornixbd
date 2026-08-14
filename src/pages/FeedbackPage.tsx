import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, MessageSquare, Send, Loader2, CheckCircle, RefreshCw, Mail, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { useNavigation } from '../lib/navigation';
import { setSEO, SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE } from '../lib/seo';

export default function FeedbackPage() {
  const onNavigate = useNavigation();
  const { t } = useLanguage();

  useEffect(() => {
    setSEO({
      title: `Feedback — ${SITE_NAME}`,
      description: DEFAULT_DESCRIPTION,
      image: DEFAULT_OG_IMAGE,
      url: '/feedback',
    });
  }, []);
  const [form, setForm] = useState({ name: '', email: '', message: '', captcha: '' });
  const [errors, setErrors] = useState({ name: '', email: '', message: '', captcha: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [captchaNumbers, setCaptchaNumbers] = useState({ a: 0, b: 0 });

  const generateCaptcha = useCallback(() => {
    setCaptchaNumbers({
      a: Math.floor(Math.random() * 9) + 1,
      b: Math.floor(Math.random() * 9) + 1,
    });
    setForm((f) => ({ ...f, captcha: '' }));
  }, []);

  useEffect(() => {
    generateCaptcha();
  }, [generateCaptcha]);

  const validate = () => {
    const next = { name: '', email: '', message: '', captcha: '' };
    if (!form.name.trim()) next.name = t('nameRequired');
    if (!form.email.trim()) next.email = t('emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = t('enterValidEmail');
    if (!form.message.trim()) next.message = t('messageRequired');
    else if (form.message.trim().length < 5) next.message = t('messageTooShort');
    if (!form.captcha.trim()) next.captcha = t('captchaRequired');
    else if (Number(form.captcha) !== captchaNumbers.a + captchaNumbers.b) next.captcha = t('wrongCaptcha');
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError('');

    const { error: submitError } = await supabase.from('feedback').insert({
      name: form.name.trim(),
      email: form.email.trim(),
      message: form.message.trim(),
    });

    if (submitError) {
      setError(t('somethingWentWrong'));
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="font-display text-2xl font-bold text-stone-900 mb-2">{t('messageSent')}</h2>
          <p className="text-stone-500 mb-2">{t('thankYou', { name: form.name })}</p>
          <p className="text-stone-400 text-sm mb-8">{t('feedbackReceived')}</p>
          <button
            onClick={() => onNavigate('home')}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3.5 rounded-2xl transition-all hover:shadow-lg"
          >
            {t('backToStore')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 pt-6 flex items-center gap-2 text-sm text-stone-500">
        <button onClick={() => onNavigate('home')} className="flex items-center gap-1 hover:text-stone-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t('homeBreadcrumb')}
        </button>
        <span className="text-stone-300">/</span>
        <span className="text-stone-700 font-medium">{t('feedback')}</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-7 h-7 text-brand-600" />
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-stone-900 mb-2 tracking-tight">{t('sendUsFeedback')}</h1>
          <p className="text-stone-500 text-sm">{t('feedbackSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 md:p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              <span className="flex items-center gap-1.5"><User className="w-4 h-4" /> {t('yourName')}</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
              placeholder={t('yourName')}
              className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errors.name ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {t('email')}</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: '' }); }}
              placeholder="you@example.com"
              className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errors.email ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">{t('message')}</label>
            <textarea
              value={form.message}
              onChange={(e) => { setForm({ ...form, message: e.target.value }); setErrors({ ...errors, message: '' }); }}
              placeholder={t('writeYourMessageHere')}
              rows={5}
              className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all resize-none ${errors.message ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
            />
            {errors.message && <p className="text-xs text-red-500 mt-1">{errors.message}</p>}
          </div>

          {/* Numeric Captcha */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">{t('securityCheck')}</label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-stone-100 rounded-2xl px-4 py-3 select-none">
                <span className="font-display font-bold text-lg text-stone-800">{captchaNumbers.a}</span>
                <span className="text-stone-500 font-bold">+</span>
                <span className="font-display font-bold text-lg text-stone-800">{captchaNumbers.b}</span>
                <span className="text-stone-500 font-bold">=</span>
              </div>
              <input
                type="number"
                value={form.captcha}
                onChange={(e) => { setForm({ ...form, captcha: e.target.value }); setErrors({ ...errors, captcha: '' }); }}
                placeholder="?"
                className={`w-20 border rounded-2xl px-4 py-3 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errors.captcha ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}
              />
              <button
                type="button"
                onClick={generateCaptcha}
                className="text-stone-400 hover:text-stone-700 transition-colors p-2"
                title={t('newCaptcha')}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {errors.captcha && <p className="text-xs text-red-500 mt-1">{errors.captcha}</p>}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-70 text-white font-bold py-4 rounded-2xl transition-all hover:shadow-xl hover:shadow-brand-500/30 hover:-translate-y-0.5"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {submitting ? t('sending') : t('sendFeedback')}
          </button>
        </form>
      </div>
    </div>
  );
}
