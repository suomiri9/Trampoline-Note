import { useState, useEffect } from 'react';

export interface AuthUser {
  id: number;
  email: string;
  displayName?: string | null;
  isAdmin: boolean;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}

export function useAuth(): AuthState & { refetch: () => void } {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
  });

  const fetchUser = () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    fetch('/api/auth/user', { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) {
          setState({ user: null, isLoading: false, error: null });
          return;
        }
        if (!res.ok) {
          const text = await res.text();
          setState({ user: null, isLoading: false, error: text });
          return;
        }
        const data: AuthUser = await res.json();
        setState({ user: data, isLoading: false, error: null });
      })
      .catch((err) => {
        setState({ user: null, isLoading: false, error: String(err) });
      });
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return { ...state, refetch: fetchUser };
}
