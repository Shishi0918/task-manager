import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SubscriptionProvider, useSubscription } from './contexts/SubscriptionContext';
import { LoginPage } from './pages/LoginPage';
import { CalendarPage } from './pages/CalendarPage';
import { MonthlyTemplateCreatorPage } from './pages/MonthlyTemplateCreatorPage';
import { YearlyTaskCreatorPage } from './pages/YearlyTaskCreatorPage';
import { SpotTaskCreatorPage } from './pages/SpotTaskCreatorPage';
import { SubscriptionRequiredPage } from './pages/SubscriptionRequiredPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { PlanSelectionPage } from './pages/PlanSelectionPage';
import { TrialBanner } from './components/TrialBanner';

type Page = 'calendar' | 'templateCreator' | 'yearlyTaskCreator' | 'spotTaskCreator' | 'organization' | 'planSelection';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading } = useSubscription();
  const [currentPage, setCurrentPage] = useState<Page>('calendar');

  // Handle subscription success/cancel URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      alert('サブスクリプションが有効になりました！');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('subscription') === 'cancelled') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Check subscription status - allow organization page even without active subscription
  if (!subscription?.isActive && currentPage !== 'organization' && currentPage !== 'planSelection') {
    return (
      <SubscriptionRequiredPage
        onNavigateToOrganization={() => setCurrentPage('organization')}
        onNavigateToPlanSelection={() => setCurrentPage('planSelection')}
      />
    );
  }

  if (currentPage === 'planSelection') {
    return <PlanSelectionPage onBack={() => setCurrentPage('calendar')} />;
  }

  if (currentPage === 'organization') {
    return (
      <>
        <TrialBanner />
        <div className="mb-4 p-4">
          <button
            onClick={() => setCurrentPage('calendar')}
            className="text-blue-600 hover:text-blue-800 flex items-center"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            カレンダーに戻る
          </button>
        </div>
        <OrganizationPage />
      </>
    );
  }

  if (currentPage === 'templateCreator') {
    return (
      <>
        <TrialBanner />
        <MonthlyTemplateCreatorPage
          onBack={() => setCurrentPage('calendar')}
        />
      </>
    );
  }

  if (currentPage === 'yearlyTaskCreator') {
    return (
      <>
        <TrialBanner />
        <YearlyTaskCreatorPage
          onBack={() => setCurrentPage('calendar')}
        />
      </>
    );
  }

  if (currentPage === 'spotTaskCreator') {
    return (
      <>
        <TrialBanner />
        <SpotTaskCreatorPage
          onBack={() => setCurrentPage('calendar')}
        />
      </>
    );
  }

  return (
    <>
      <TrialBanner />
      <CalendarPage
        onNavigateToTemplateCreator={() => setCurrentPage('templateCreator')}
        onNavigateToYearlyTaskCreator={() => setCurrentPage('yearlyTaskCreator')}
        onNavigateToSpotTaskCreator={() => setCurrentPage('spotTaskCreator')}
        onNavigateToOrganization={() => setCurrentPage('organization')}
      />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <AppContent />
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
