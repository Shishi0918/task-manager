import { useState, useEffect } from 'react';
import { projectApi } from '../services/api';
import type { Project } from '../types';

interface ProjectListPageProps {
  onBack: () => void;
  onNavigateToProject: (projectId: string) => void;
  onNavigateToNewProject: () => void;
  onNavigateToProjectSettings: (projectId: string) => void;
}

export function ProjectListPage({
  onBack,
  onNavigateToProject,
  onNavigateToNewProject,
  onNavigateToProjectSettings,
}: ProjectListPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await projectApi.getAll();
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プロジェクトの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(projects.map(p => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`${selectedIds.size}件のプロジェクトを削除しますか？`)) {
      return;
    }

    try {
      await projectApi.bulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プロジェクトの削除に失敗しました');
    }
  };

  const handleExportCSV = () => {
    const headers = ['プロジェクト名', '開始日', '終了日', 'タスク数', 'メンバー数'];
    const rows = projects.map(p => [
      p.name,
      p.startDate || '',
      p.endDate || '',
      p.taskCount.toString(),
      p.memberCount.toString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'プロジェクト一覧.csv';
    link.click();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <button
            onClick={onBack}
            className="text-blue-600 hover:text-blue-800 flex items-center"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            カレンダーに戻る
          </button>
        </div>

        <h1 className="text-2xl font-bold mb-6">プロジェクト一覧</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mb-4 flex gap-2">
          <button
            onClick={onNavigateToNewProject}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            新規プロジェクト作成
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            プロジェクト削除
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            CSVエクスポート
          </button>
        </div>

        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left w-12">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === projects.length && projects.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4"
                  />
                </th>
                <th className="px-4 py-3 text-left">プロジェクト</th>
                <th className="px-4 py-3 text-center w-32">開始日</th>
                <th className="px-4 py-3 text-center w-32">終了日</th>
                <th className="px-4 py-3 text-center w-20">設定</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    プロジェクトがありません
                  </td>
                </tr>
              ) : (
                projects.map((project) => (
                  <tr key={project.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(project.id)}
                        onChange={() => handleSelect(project.id)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onNavigateToProject(project.id)}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {project.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {formatDate(project.startDate)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {formatDate(project.endDate)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onNavigateToProjectSettings(project.id)}
                        className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded"
                        title="設定"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
