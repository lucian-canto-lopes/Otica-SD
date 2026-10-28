import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, apiUrl, setCsrf, setUnauthorizedHandler } from './api.js';

const SessionContext = createContext(null);

function readableTextColor(hex) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!match) return '#ffffff';
  const [r, g, b] = match.slice(1).map((h) => parseInt(h, 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111111' : '#ffffff';
}

export function applyBrand(color) {
  const brand = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#4f2d7f';
  document.documentElement.style.setProperty('--brand', brand);
  document.documentElement.style.setProperty('--brand-contrast', readableTextColor(brand));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brand);
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('me');
      setCsrf(data.csrf);
      setSession(data);
      applyBrand(data.company?.primary_color);
      document.title = data.company ? `${data.company.trade_name || data.company.name} · Ocular` : 'Ocular';
      return data;
    } catch {
      setSession(null);
      applyBrand(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    refresh();
  }, [refresh]);

  const value = useMemo(() => {
    const permissions = session?.permissions || [];
    return {
      session,
      loading,
      user: session?.user,
      company: session?.company,
      companies: session?.companies || [],
      role: session?.role,
      isSuperadmin: Boolean(session?.user?.is_superadmin),
      can: (permission) => permissions.includes(permission),
      refresh,
      async login(email, password) {
        await api.post('login', { email, password });
        return refresh();
      },
      async logout() {
        try {
          await api.post('logout', {});
        } finally {
          setSession(null);
          applyBrand(null);
          window.location.hash = '#/';
        }
      },
      async selectCompany(companyId) {
        const data = await api.post('select_company', { company_id: companyId });
        setCsrf(data.csrf);
        setSession(data);
        applyBrand(data.company?.primary_color);
        return data;
      },
      logoUrl: (company) => (company?.logo_path ? apiUrl('logo', { company: company.id, v: company.logo_path?.length }) : null),
    };
  }, [session, loading, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
