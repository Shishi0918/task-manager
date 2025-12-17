import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onNavigateToOrganization?: () => void;
  onNavigateToPlanSelection?: () => void;
}

export const SubscriptionRequiredPage = ({ onNavigateToOrganization, onNavigateToPlanSelection }: Props) => {
  const { subscription } = useSubscription();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          サブスクリプションが必要です
        </h2>
        <p className="text-gray-600 mb-6">
          {subscription?.status === 'EXPIRED'
            ? '無料トライアル期間が終了しました。'
            : subscription?.status === 'CANCELED'
            ? 'サブスクリプションがキャンセルされました。'
            : subscription?.status === 'PAST_DUE'
            ? 'お支払いの確認ができませんでした。'
            : 'ご利用を継続するにはサブスクリプションへの登録が必要です。'}
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <h3 className="font-bold text-lg mb-2">個人プラン</h3>
            <p className="text-2xl font-bold text-gray-900 mb-3">
              ¥300<span className="text-sm font-normal text-gray-600">/月</span>
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>・1ユーザー</li>
              <li>・全機能へのアクセス</li>
            </ul>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-left border border-blue-200">
            <h3 className="font-bold text-lg mb-2">組織プラン</h3>
            <p className="text-2xl font-bold text-gray-900 mb-3">
              ¥5,000<span className="text-sm font-normal text-gray-600">/月</span>
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>・最大10ユーザー</li>
              <li>・メンバー招待機能</li>
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          {onNavigateToPlanSelection && (
            <button
              onClick={onNavigateToPlanSelection}
              className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
            >
              プランを選択する
            </button>
          )}
          {onNavigateToOrganization && (
            <button
              onClick={onNavigateToOrganization}
              className="w-full py-2 px-4 text-blue-600 text-sm hover:text-blue-800"
            >
              招待で組織に参加する
            </button>
          )}
          <button
            onClick={logout}
            className="w-full py-2 px-4 text-gray-600 text-sm hover:text-gray-800"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
};
