import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { CalendarPage } from './pages/CalendarPage';
import { MonthlyTemplateCreatorPage } from './pages/MonthlyTemplateCreatorPage';
import { YearlyTaskCreatorPage } from './pages/YearlyTaskCreatorPage';
import { SpotTaskCreatorPage } from './pages/SpotTaskCreatorPage';
import { WeeklyTaskCreatorPage } from './pages/WeeklyTaskCreatorPage';
import { OrganizationPage } from './pages/OrganizationPage';

type Page = 'calendar' | 'templateCreator' | 'yearlyTaskCreator' | 'spotTaskCreator' | 'weeklyTaskCreator' | 'organization';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('calendar');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (currentPage === 'organization') {
    return (
      <>
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
      <MonthlyTemplateCreatorPage
        onBack={() => setCurrentPage('calendar')}
      />
    );
  }

  if (currentPage === 'yearlyTaskCreator') {
    return (
      <YearlyTaskCreatorPage
        onBack={() => setCurrentPage('calendar')}
      />
    );
  }

  if (currentPage === 'spotTaskCreator') {
    return (
      <SpotTaskCreatorPage
        onBack={() => setCurrentPage('calendar')}
      />
    );
  }

  if (currentPage === 'weeklyTaskCreator') {
    return (
      <WeeklyTaskCreatorPage
        onBack={() => setCurrentPage('calendar')}
      />
    );
  }

  return (
    <CalendarPage
      onNavigateToTemplateCreator={() => setCurrentPage('templateCreator')}
      onNavigateToYearlyTaskCreator={() => setCurrentPage('yearlyTaskCreator')}
      onNavigateToSpotTaskCreator={() => setCurrentPage('spotTaskCreator')}
      onNavigateToWeeklyTaskCreator={() => setCurrentPage('weeklyTaskCreator')}
      onNavigateToOrganization={() => setCurrentPage('organization')}
    />
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
