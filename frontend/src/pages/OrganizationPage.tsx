import { useState, useEffect } from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { organizationApi, subscriptionApi } from '../services/api';
import type { Organization } from '../types';

export const OrganizationPage = () => {
  const { subscription, refreshSubscription } = useSubscription();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isOrganizationPlan = subscription?.planType === 'ORGANIZATION';
  const isAdmin = subscription?.userRole === 'ADMIN';

  const fetchOrganization = async () => {
    if (!isOrganizationPlan) {
      setLoading(false);
      return;
    }
    try {
      const { organization } = await organizationApi.get();
      setOrganization(organization);
    } catch {
      setError('組織情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganization();
  }, [isOrganizationPlan]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setActionLoading(true);
    setError(null);
    try {
      await organizationApi.create(newOrgName.trim());
      await refreshSubscription();
      showSuccess('組織を作成しました');
      setNewOrgName('');
      fetchOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : '組織の作成に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;

    setActionLoading(true);
    setError(null);
    try {
      const result = await organizationApi.acceptInvitation(inviteToken.trim());
      await refreshSubscription();
      showSuccess(`「${result.organizationName}」に参加しました`);
      setInviteToken('');
      fetchOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待の受け入れに失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setActionLoading(true);
    setError(null);
    try {
      await organizationApi.invite(inviteEmail.trim());
      showSuccess(`${inviteEmail}に招待を送信しました`);
      setInviteEmail('');
      fetchOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待の送信に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveUser = async (userId: string, username: string) => {
    if (!confirm(`${username}を組織から削除しますか？`)) return;

    setActionLoading(true);
    setError(null);
    try {
      await organizationApi.removeUser(userId);
      showSuccess(`${username}を削除しました`);
      fetchOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザーの削除に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string, email: string) => {
    if (!confirm(`${email}への招待をキャンセルしますか？`)) return;

    setActionLoading(true);
    setError(null);
    try {
      await organizationApi.cancelInvitation(invitationId);
      showSuccess('招待をキャンセルしました');
      fetchOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待のキャンセルに失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveOrganization = async () => {
    if (!confirm('組織から脱退しますか？この操作は取り消せません。')) return;

    setActionLoading(true);
    setError(null);
    try {
      await organizationApi.leave();
      await refreshSubscription();
      showSuccess('組織から脱退しました');
      setOrganization(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '脱退に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenPortal = async () => {
    try {
      const { url } = await subscriptionApi.createPortalSession();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'サブスクリプション管理ページを開けませんでした');
    }
  };

  const handleStartCheckout = async () => {
    try {
      const { url } = await subscriptionApi.createCheckoutSession();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : '決済ページを開けませんでした');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">組織管理</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {successMessage}
        </div>
      )}

      {!isOrganizationPlan ? (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">組織を作成</h2>
            <p className="text-gray-600 mb-4">
              新しい組織を作成し、チームメンバーを招待できます。
              組織プランでは月額5,000円で最大10人まで利用可能です。
            </p>
            <form onSubmit={handleCreateOrganization} className="flex gap-3">
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="組織名を入力"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={actionLoading}
              />
              <button
                type="submit"
                disabled={actionLoading || !newOrgName.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                作成
              </button>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">招待で参加</h2>
            <p className="text-gray-600 mb-4">
              招待トークンをお持ちの場合は、既存の組織に参加できます。
            </p>
            <form onSubmit={handleJoinOrganization} className="flex gap-3">
              <input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="招待トークンを入力"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={actionLoading}
              />
              <button
                type="submit"
                disabled={actionLoading || !inviteToken.trim()}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                参加
              </button>
            </form>
          </div>
        </div>
      ) : organization ? (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold">{organization.name}</h2>
                <p className="text-gray-600">
                  {organization.users.length} / {organization.maxUsers} 人
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                  organization.subscriptionStatus === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                  organization.subscriptionStatus === 'TRIALING' ? 'bg-blue-100 text-blue-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {organization.subscriptionStatus === 'ACTIVE' && '有効'}
                  {organization.subscriptionStatus === 'TRIALING' && 'トライアル中'}
                  {organization.subscriptionStatus === 'PAST_DUE' && '支払い遅延'}
                  {organization.subscriptionStatus === 'CANCELED' && 'キャンセル済み'}
                  {organization.subscriptionStatus === 'EXPIRED' && '期限切れ'}
                </span>
              </div>
            </div>

            {isAdmin && (
              <div className="flex gap-3">
                {organization.subscriptionStatus === 'ACTIVE' ? (
                  <button
                    onClick={handleOpenPortal}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    サブスクリプション管理
                  </button>
                ) : organization.subscriptionStatus === 'TRIALING' || organization.subscriptionStatus === 'EXPIRED' ? (
                  <button
                    onClick={handleStartCheckout}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    サブスクリプションを開始
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">メンバー</h3>
            <ul className="divide-y divide-gray-200">
              {organization.users.map((user) => (
                <li key={user.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{user.username}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm px-2 py-1 rounded ${
                      user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.role === 'ADMIN' ? '管理者' : 'メンバー'}
                    </span>
                    {isAdmin && user.role !== 'ADMIN' && (
                      <button
                        onClick={() => handleRemoveUser(user.id, user.username)}
                        disabled={actionLoading}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {isAdmin && organization.users.length < organization.maxUsers && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">メンバーを招待</h3>
              <form onSubmit={handleInviteUser} className="flex gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="メールアドレスを入力"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={actionLoading}
                />
                <button
                  type="submit"
                  disabled={actionLoading || !inviteEmail.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  招待
                </button>
              </form>
            </div>
          )}

          {organization.invitations.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">保留中の招待</h3>
              <ul className="divide-y divide-gray-200">
                {organization.invitations.map((invitation) => (
                  <li key={invitation.id} className="py-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium">{invitation.email}</p>
                      <p className="text-sm text-gray-500">
                        有効期限: {new Date(invitation.expiresAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                        disabled={actionLoading}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        キャンセル
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isAdmin && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">組織から脱退</h3>
              <p className="text-gray-600 mb-4">
                組織から脱退すると、個人プランに戻ります。
              </p>
              <button
                onClick={handleLeaveOrganization}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                脱退する
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
          組織情報を読み込めませんでした
        </div>
      )}
    </div>
  );
};
