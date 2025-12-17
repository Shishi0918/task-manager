import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscriptionApi, organizationApi } from '../services/api';
import { useSubscription } from '../contexts/SubscriptionContext';

export const PlanSelectionPage = () => {
  const navigate = useNavigate();
  const { refreshSubscription } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<'individual' | 'organization' | null>(null);
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectIndividual = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await subscriptionApi.createCheckoutSession();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : '決済ページを開けませんでした');
      setLoading(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await organizationApi.create(orgName.trim());
      await refreshSubscription();
      navigate('/organization');
    } catch (err) {
      setError(err instanceof Error ? err.message : '組織の作成に失敗しました');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">プランを選択</h1>
          <p className="text-gray-600">
            用途に合わせて最適なプランをお選びください
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Individual Plan */}
          <div
            className={`bg-white rounded-xl shadow-lg p-6 cursor-pointer transition-all ${
              selectedPlan === 'individual'
                ? 'ring-2 ring-blue-500 transform scale-[1.02]'
                : 'hover:shadow-xl'
            }`}
            onClick={() => setSelectedPlan('individual')}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">個人プラン</h2>
                <p className="text-gray-500">個人での利用に最適</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 ${
                selectedPlan === 'individual'
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-300'
              }`}>
                {selectedPlan === 'individual' && (
                  <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">¥300</span>
              <span className="text-gray-500">/月</span>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                1ユーザー
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                全機能利用可能
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                いつでもキャンセル可能
              </li>
            </ul>

            {selectedPlan === 'individual' && (
              <button
                onClick={handleSelectIndividual}
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '処理中...' : 'このプランで始める'}
              </button>
            )}
          </div>

          {/* Organization Plan */}
          <div
            className={`bg-white rounded-xl shadow-lg p-6 cursor-pointer transition-all ${
              selectedPlan === 'organization'
                ? 'ring-2 ring-blue-500 transform scale-[1.02]'
                : 'hover:shadow-xl'
            }`}
            onClick={() => setSelectedPlan('organization')}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">組織プラン</h2>
                <p className="text-gray-500">チームでの利用に最適</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 ${
                selectedPlan === 'organization'
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-gray-300'
              }`}>
                {selectedPlan === 'organization' && (
                  <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">¥5,000</span>
              <span className="text-gray-500">/月</span>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                最大10ユーザー
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                全機能利用可能
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                メンバー招待機能
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                いつでもキャンセル可能
              </li>
            </ul>

            {selectedPlan === 'organization' && (
              <form onSubmit={handleCreateOrganization}>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="組織名を入力"
                  className="w-full mb-3 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !orgName.trim()}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '処理中...' : '組織を作成して始める'}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>7日間の無料トライアル付き。クレジットカード不要で開始できます。</p>
        </div>
      </div>
    </div>
  );
};
