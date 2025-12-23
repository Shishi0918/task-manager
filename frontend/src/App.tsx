import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { CalendarPage } from './pages/CalendarPage';
import { MonthlyTemplateCreatorPage } from './pages/MonthlyTemplateCreatorPage';
import { YearlyTaskCreatorPage } from './pages/YearlyTaskCreatorPage';
import { SpotTaskCreatorPage } from './pages/SpotTaskCreatorPage';
import { WeeklyTaskCreatorPage } from './pages/WeeklyTaskCreatorPage';
import { DailyTemplateCreatorPage } from './pages/DailyTemplateCreatorPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { ProjectListPage } from './pages/ProjectListPage';
import { ProjectFormPage } from './pages/ProjectFormPage';
import { ProjectPage } from './pages/ProjectPage';

type Page = 'calendar' | 'templateCreator' | 'yearlyTaskCreator' | 'spotTaskCreator' | 'weeklyTaskCreator' | 'dailyTaskCreator' | 'organization' | 'projectList' | 'projectForm' | 'project';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('calendar');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);

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

  if (currentPage === 'dailyTaskCreator') {
    return (
      <DailyTemplateCreatorPage
        onBack={() => setCurrentPage('calendar')}
      />
    );
  }

  if (currentPage === 'projectList') {
    return (
      <ProjectListPage
        onBack={() => setCurrentPage('calendar')}
        onNavigateToNewProject={() => {
          setSelectedProjectId(undefined);
          setCurrentPage('projectForm');
        }}
        onNavigateToProjectSettings={(projectId) => {
          setSelectedProjectId(projectId);
          setCurrentPage('projectForm');
        }}
        onNavigateToProject={(projectId) => {
          setSelectedProjectId(projectId);
          setCurrentPage('project');
        }}
      />
    );
  }

  if (currentPage === 'projectForm') {
    return (
      <ProjectFormPage
        projectId={selectedProjectId}
        onBack={() => setCurrentPage('projectList')}
        onSuccess={(projectId) => {
          setSelectedProjectId(projectId);
          setCurrentPage('project');
        }}
      />
    );
  }

  if (currentPage === 'project' && selectedProjectId) {
    return (
      <ProjectPage
        projectId={selectedProjectId}
        onBack={() => setCurrentPage('projectList')}
        onNavigateToSettings={() => setCurrentPage('projectForm')}
      />
    );
  }

  return (
    <CalendarPage
      onNavigateToTemplateCreator={() => setCurrentPage('templateCreator')}
      onNavigateToYearlyTaskCreator={() => setCurrentPage('yearlyTaskCreator')}
      onNavigateToSpotTaskCreator={() => setCurrentPage('spotTaskCreator')}
      onNavigateToWeeklyTaskCreator={() => setCurrentPage('weeklyTaskCreator')}
      onNavigateToDailyTaskCreator={() => setCurrentPage('dailyTaskCreator')}
      onNavigateToOrganization={() => setCurrentPage('organization')}
      onNavigateToProjects={() => setCurrentPage('projectList')}
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
