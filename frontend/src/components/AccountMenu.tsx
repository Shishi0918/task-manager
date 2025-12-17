import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';

interface Props {
  onNavigateToOrganization?: () => void;
}

export const AccountMenu = ({ onNavigateToOrganization }: Props = {}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();
  const { subscription, openPortal } = useSubscription();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 text-gray-700 hover:text-gray-900"
      >
        <span>{user?.username}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-20 border">
            <div className="p-4 border-b">
              <p className="text-sm text-gray-500">サブスクリプション</p>
              <p className="font-medium">
                {subscription?.status === 'ACTIVE' && '有効'}
                {subscription?.status === 'TRIALING' && `トライアル中（残り${subscription.trialDaysRemaining}日）`}
                {subscription?.status === 'PAST_DUE' && '支払い遅延'}
                {subscription?.status === 'CANCELED' && 'キャンセル済み'}
                {subscription?.status === 'EXPIRED' && '期限切れ'}
              </p>
              {subscription?.currentPeriodEnd && (
                <p className="text-xs text-gray-500">
                  次回更新日: {formatDate(subscription.currentPeriodEnd)}
                </p>
              )}
            </div>
            <div className="p-2">
              {onNavigateToOrganization && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onNavigateToOrganization();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                >
                  組織管理
                </button>
              )}
              {subscription?.status === 'ACTIVE' && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    openPortal();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                >
                  サブスクリプション管理
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  logout();
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 rounded"
              >
                ログアウト
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
