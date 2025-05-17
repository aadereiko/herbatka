import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '@/api/api';

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  password2: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('accessToken'));
  const [refreshToken, setRefreshToken] = useState<string | null>(localStorage.getItem('refreshToken'));

  useEffect(() => {
    // Set up axios interceptor for token refresh
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry && refreshToken) {
          originalRequest._retry = true;
          try {
            const response = await api.post('auth/refresh/', { refresh: refreshToken });
            const { access } = response.data;
            setAccessToken(access);
            localStorage.setItem('accessToken', access);
            originalRequest.headers['Authorization'] = `Bearer ${access}`;
            return api(originalRequest);
          } catch (refreshError) {
            logout();
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );

    // Set up axios interceptor for adding token to requests
    api.interceptors.request.use((config) => {
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    });

    // Load user profile if we have a token
    if (accessToken) {
      loadUserProfile();
    }

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, [accessToken, refreshToken]);

  const loadUserProfile = async () => {
    try {
      const response = await api.get('auth/profile/');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      logout();
    }
  };

  const login = async (username: string, password: string) => {
    const response = await api.post('auth/login/', { username, password });
    const { access, refresh, user: userData } = response.data;
    setAccessToken(access);
    setRefreshToken(refresh);
    setUser(userData);
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  };

  const register = async (userData: RegisterData) => {
    const response = await api.post('auth/register/', userData);
    const { access, refresh, user: newUser } = response.data;
    setAccessToken(access);
    setRefreshToken(refresh);
    setUser(newUser);
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 