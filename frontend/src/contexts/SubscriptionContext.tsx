import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { subscriptionApi } from '../services/api';
import { useAuth } from './AuthContext';
import type { SubscriptionStatus } from '../types';

interface SubscriptionContextType {
  subscription: SubscriptionStatus | null;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  startCheckout: () => Promise<void>;
  openPortal: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSubscription = async () => {
    if (!user) return;
    try {
      const status = await subscriptionApi.getStatus();
      setSubscription(status);
    } catch (error) {
      console.error('Failed to fetch subscription status:', error);
    }
  };

  useEffect(() => {
    if (user) {
      refreshSubscription().finally(() => setLoading(false));
    } else {
      setSubscription(null);
      setLoading(false);
    }
  }, [user]);

  const startCheckout = async () => {
    try {
      const { url } = await subscriptionApi.createCheckoutSession();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to start checkout:', error);
      alert('決済ページの開始に失敗しました');
    }
  };

  const openPortal = async () => {
    try {
      const { url } = await subscriptionApi.createPortalSession();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to open portal:', error);
      alert('サブスクリプション管理ページの開始に失敗しました');
    }
  };

  return (
    <SubscriptionContext.Provider
      value={{ subscription, loading, refreshSubscription, startCheckout, openPortal }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};
