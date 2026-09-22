import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { api, setSession, clearSession, loadSession } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(() => loadSession());

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password }, { auth: false });
    setSession(data.token, data.user, data.permissions);
    setSessionState({ user: data.user, permissions: data.permissions });
    return data.user;
  }, []);

  const patientAccess = useCallback(async (patientId, accessCode) => {
    const data = await api.post('/auth/patient-access', { patientId, accessCode }, { auth: false });
    setSession(data.token, data.user, data.permissions);
    setSessionState({ user: data.user, permissions: data.permissions });
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSessionState(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setSession(null, data.user, data.permissions);
      setSessionState({ user: data.user, permissions: data.permissions });
    } catch {
      logout();
    }
  }, [logout]);

  const value = useMemo(() => {
    const permissions = session?.permissions || [];
    const isAdmin = permissions.includes('*');
    const can = (perm) => isAdmin || permissions.includes(perm);
    const canAny = (perms) => isAdmin || perms.some((p) => permissions.includes(p));
    return {
      user: session?.user || null,
      permissions,
      isAuthenticated: Boolean(session?.user),
      login,
      patientAccess,
      logout,
      refresh,
      can,
      canAny,
    };
  }, [session, login, patientAccess, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
