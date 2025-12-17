import { useSubscription } from '../contexts/SubscriptionContext';

export const TrialBanner = () => {
  const { subscription, startCheckout } = useSubscription();

  if (!subscription) return null;
  if (subscription.status !== 'TRIALING') return null;

  const daysRemaining = subscription.trialDaysRemaining;
  const isUrgent = daysRemaining <= 3;

  return (
    <div
      className={`px-4 py-2 text-center text-sm ${
        isUrgent ? 'bg-red-500 text-white' : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      <span>
        無料トライアル期間：残り{daysRemaining}日
        {isUrgent && ' - 継続してご利用いただくにはサブスクリプションが必要です'}
      </span>
      <button
        onClick={startCheckout}
        className={`ml-4 px-3 py-1 rounded text-sm font-medium ${
          isUrgent
            ? 'bg-white text-red-600 hover:bg-red-50'
            : 'bg-yellow-600 text-white hover:bg-yellow-700'
        }`}
      >
        今すぐ登録（月額5,000円）
      </button>
    </div>
  );
};
