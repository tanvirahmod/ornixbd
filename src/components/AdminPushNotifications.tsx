import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { supabase } from '../lib/supabase';

type PushActionResponse = {
  publicKey?: string;
  error?: string;
};

async function invokePushAction(body: Record<string, unknown>): Promise<PushActionResponse> {
  const { data, error } = await supabase.functions.invoke<PushActionResponse>('manage-push-subscription', { body });
  if (error) {
    let message = error.message;
    const context = error.context;
    if (context instanceof Response) {
      try {
        const responseBody = await context.json() as PushActionResponse;
        if (responseBody.error) message = responseBody.error;
      } catch {
        // Keep the Functions error message when the response is not JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function isIosDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalledApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function AdminPushNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const supported = typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.serviceWorker.getRegistration('/').then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setEnabled(Boolean(subscription));
    }).catch((error: unknown) => {
      console.error('Could not check this device’s push subscription.', error);
    });
    return () => { cancelled = true; };
  }, [supported]);

  const toggleNotifications = async () => {
    if (!supported || busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (enabled) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await invokePushAction({ action: 'unsubscribe', endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setEnabled(false);
        setMessage('Order notifications are off on this device.');
        return;
      }

      if (isIosDevice() && !isInstalledApp()) {
        setMessage('On iPhone, first add ORNIX to your Home Screen, open it there, then enable notifications.');
        return;
      }

      if (Notification.permission === 'denied') {
        setMessage('Notifications are blocked in this browser. Allow them in browser settings, then try again.');
        return;
      }
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('Allow notifications in the browser prompt to receive order alerts.');
        return;
      }

      const keyData = await invokePushAction({ action: 'public_key' });
      if (!keyData.publicKey) throw new Error('Push notifications are not configured on the server yet.');

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(keyData.publicKey),
      });
      try {
        await invokePushAction({ action: 'subscribe', subscription: subscription.toJSON() });
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }
      setEnabled(true);
      setMessage('This device will receive new order alerts.');
    } catch (error) {
      console.error('Could not update this device’s order notification subscription.', error);
      setMessage(error instanceof Error ? error.message : 'Could not set up order notifications. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setEnabled(false);
        throw new Error('This device is no longer subscribed. Enable notifications again.');
      }
      await invokePushAction({ action: 'test', endpoint: subscription.endpoint });
      setMessage('A test notification was sent to this device.');
    } catch (error) {
      console.error('Could not send a test order notification.', error);
      setMessage(error instanceof Error ? error.message : 'Could not send a test notification.');
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return <p className="px-4 py-3 text-xs text-stone-500">Push notifications are not supported by this browser.</p>;
  }

  return (
    <div className="border-b border-stone-100 px-4 py-3">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 shrink-0 text-stone-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-stone-800">Order alerts on this device</p>
          <p className="text-[11px] text-stone-500">
            {enabled ? 'Background notifications are enabled.' : 'Receive alerts when the admin page is closed.'}
          </p>
        </div>
        {enabled && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void toggleNotifications()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
          {enabled ? 'Turn off' : 'Enable on this device'}
        </button>
        {enabled && (
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={busy}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            Send test
          </button>
        )}
      </div>
      {message && <p role="status" className="mt-2 text-[11px] leading-4 text-stone-600">{message}</p>}
      {isIosDevice() && !isInstalledApp() && !enabled && (
        <p className="mt-2 text-[11px] leading-4 text-stone-500">iPhone: use Share → Add to Home Screen, then open the installed ORNIX app.</p>
      )}
    </div>
  );
}
