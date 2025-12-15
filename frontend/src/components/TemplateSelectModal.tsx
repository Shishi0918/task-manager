import { useEffect, useState } from 'react';
import { templateApi } from '../services/api';

interface TemplateSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (templateName: string) => void;
}

export const TemplateSelectModal = ({
  isOpen,
  onClose,
  onSelect,
}: TemplateSelectModalProps) => {
  const [templates, setTemplates] = useState<
    Array<{ templateName: string; createdAt: string; updatedAt: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  const fetchTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await templateApi.getTemplates();
      setTemplates(result.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テンプレートの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (templateName: string) => {
    onSelect(templateName);
    onClose();
  };

  const handleDelete = async (templateName: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`テンプレート「${templateName}」を削除しますか？`)) {
      return;
    }

    try {
      await templateApi.deleteTemplate(templateName);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テンプレートの削除に失敗しました');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[500px] max-h-[600px] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">テンプレートを選択</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-gray-600">読み込み中...</div>
        ) : templates.length === 0 ? (
          <div className="py-8 text-center text-gray-600">
            保存されているテンプレートがありません
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {templates.map((template) => (
              <div
                key={template.templateName}
                className="flex items-center gap-2 border border-gray-300 rounded hover:bg-purple-50 hover:border-purple-500 transition"
              >
                <button
                  onClick={() => handleSelect(template.templateName)}
                  className="flex-1 p-4 text-left"
                >
                  <div className="font-medium text-gray-900">
                    {template.templateName}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    最終更新: {new Date(template.updatedAt).toLocaleString('ja-JP')}
                  </div>
                </button>
                <button
                  onClick={(e) => handleDelete(template.templateName, e)}
                  className="px-3 py-2 mr-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                  title="削除"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};
