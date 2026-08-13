import { useState, useEffect } from 'react';
import { supabase, Announcement, Category } from './supabase';

const ANNOUNCEMENT_FALLBACK = '⚡ FREE SHIPPING NATIONWIDE ⚡  •  QUALITY STREETWEAR FROM BANGLADESH  •  NEW ARRIVALS EVERY WEEK  •';

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!error && data) setAnnouncements(data);
      setLoading(false);
    };

    fetchAnnouncements();

    // Real-time: re-fetch whenever any announcement row changes
    const channel = supabase
      .channel('public-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchAnnouncements();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { announcements, loading };
}

export function useSiteSetting(key: string) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSetting = async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (!error && data) setValue(data.value);
      setLoading(false);
    };
    fetchSetting();
  }, [key]);

  return { value, loading };
}

/** Fetches multiple site_settings keys in one query. Returns a map of key → value. */
export function useSiteSettings(keys: string[]) {
  const [values, setValues] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  // Stable serialised key list so the effect doesn't re-run on every render
  const keysSerialized = keys.join(',');

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', keys);

      if (!error && data) {
        const map: Record<string, string | null> = {};
        for (const row of data) map[row.key] = row.value;
        setValues(map);
      }
      setLoading(false);
    };
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSerialized]);

  return { values, loading };
}

/** Fetches all categories ordered by priority then name. */
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('priority', { ascending: true, nullsFirst: false })
        .order('name');

      if (!error && data) setCategories(data);
      setLoading(false);
    };
    fetchCategories();

    // Real-time: re-fetch when categories table changes
    const channel = supabase
      .channel('public-categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        fetchCategories();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { categories, loading };
}

/**
 * Returns the combined announcement text for active announcements,
 * or null if there are none (so the bar can be hidden entirely).
 * Falls back to a default string only when loading hasn't completed yet.
 */
export function getAnnouncementText(announcements: Announcement[], loading: boolean): string | null {
  if (loading) return ANNOUNCEMENT_FALLBACK;
  const active = announcements.filter((a) => a.is_active);
  if (active.length === 0) return null;
  return active.map((a) => a.text).join('  •  ');
}

export function getHeroBgImage(value: string | null): string {
  return value || '';
}
