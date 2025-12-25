import { useState, useEffect } from 'react';
import { projectApi } from '../services/api';
import type { ProjectMember } from '../types';

interface MemberInput {
  id?: string;
  name: string;
  color: string;
}

interface ProjectFormPageProps {
  projectId?: string; // undefined = 新規作成, string = 編集
  onBack: () => void;
  onSuccess: (projectId: string) => void;
}

const DEFAULT_COLORS = [
  '#FFB6C1', // Light Pink
  '#98FB98', // Pale Green
  '#87CEEB', // Sky Blue
  '#DDA0DD', // Plum
  '#F0E68C', // Khaki
  '#FFA07A', // Light Salmon
  '#20B2AA', // Light Sea Green
  '#778899', // Light Slate Gray
];

export function ProjectFormPage({ projectId, onBack, onSuccess }: ProjectFormPageProps) {
  const [projectName, setProjectName] = useState('');
  const [members, setMembers] = useState<MemberInput[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(!!projectId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!projectId;

  useEffect(() => {
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  const fetchProject = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await projectApi.get(projectId);
      setProjectName(data.project.name);
      setMembers(
        data.project.members.map((m: ProjectMember) => ({
          id: m.id,
          name: m.name,
          color: m.color,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プロジェクトの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = () => {
    const usedColors = new Set(members.map(m => m.color));
    const availableColor = DEFAULT_COLORS.find(c => !usedColors.has(c)) || DEFAULT_COLORS[0];
    setMembers([...members, { name: '', color: availableColor }]);
  };

  const handleDeleteMembers = () => {
    const newMembers = members.filter((_, i) => !selectedMemberIds.has(i));
    setMembers(newMembers);
    setSelectedMemberIds(new Set());
  };

  const handleMemberNameChange = (index: number, name: string) => {
    const newMembers = [...members];
    newMembers[index].name = name;
    setMembers(newMembers);
  };

  const handleMemberColorChange = (index: number, color: string) => {
    const newMembers = [...members];
    newMembers[index].color = color;
    setMembers(newMembers);
  };

  const handleSelectMember = (index: number) => {
    const newSelected = new Set(selectedMemberIds);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedMemberIds(newSelected);
  };

  const handleSubmit = async () => {
    if (!projectName.trim()) {
      setError('プロジェクト名を入力してください');
      return;
    }

    const validMembers = members.filter(m => m.name.trim());

    try {
      setSaving(true);
      setError(null);

      if (isEdit && projectId) {
        // Update project name
        await projectApi.update(projectId, { name: projectName });
        // Update members
        await projectApi.bulkSaveMembers(
          projectId,
          validMembers.map(m => ({ id: m.id, name: m.name, color: m.color }))
        );
        onSuccess(projectId);
      } else {
        // Create new project
        const result = await projectApi.create({
          name: projectName,
          members: validMembers.map(m => ({ name: m.name, color: m.color })),
        });
        onSuccess(result.project.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プロジェクトの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleImportCSV = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      // Skip header if exists
      const startIndex = lines[0].includes('メンバー') ? 1 : 0;

      const importedMembers: MemberInput[] = [];
      for (let i = startIndex; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
        if (cols[0]) {
          importedMembers.push({
            name: cols[0],
            color: cols[1] && cols[1].startsWith('#') ? cols[1] : DEFAULT_COLORS[i % DEFAULT_COLORS.length],
          });
        }
      }

      setMembers([...members, ...importedMembers]);
    };
    input.click();
  };

  const handleExportCSV = () => {
    const headers = ['メンバー', 'カラー'];
    const rows = members.map(m => [m.name, m.color]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'メンバー.csv';
    link.click();
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
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">
          {isEdit ? 'プロジェクト設定' : 'プロジェクト新規追加'}
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="bg-white rounded shadow p-6 mb-6">
          <div className="mb-4 flex gap-2">
            <button
              onClick={handleImportCSV}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              CSVインポート
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              CSVエクスポート
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              プロジェクト名
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="プロジェクト名を入力"
            />
          </div>

          <div className="mb-4">
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleAddMember}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                メンバー追加
              </button>
              <button
                onClick={handleDeleteMembers}
                disabled={selectedMemberIds.size === 0}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                メンバー削除
              </button>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left w-12 border-b"></th>
                  <th className="px-4 py-2 text-left border-b">メンバー</th>
                  <th className="px-4 py-2 text-left w-32 border-b">カラー</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-gray-500 border-b">
                      メンバーを追加してください
                    </td>
                  </tr>
                ) : (
                  members.map((member, index) => (
                    <tr key={index} className="border-b">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.has(index)}
                          onChange={() => handleSelectMember(index)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) => handleMemberNameChange(index, e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="メンバー名"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={member.color}
                            onChange={(e) => handleMemberColorChange(index, e.target.value)}
                            className="w-10 h-8 cursor-pointer border border-gray-300 rounded"
                          />
                          <div
                            className="w-16 h-6 rounded"
                            style={{ backgroundColor: member.color }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onBack}
            className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {saving ? '保存中...' : '登録'}
          </button>
        </div>
      </div>
    </div>
  );
}
