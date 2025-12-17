import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface YearlyTask {
  id: string;
  name: string;
  displayOrder: number;
  implementationMonth: number | null;
  startDay: number | null;
  endDay: number | null;
}

interface YearlyTaskCreatorPageProps {
  onBack: () => void;
}

export const YearlyTaskCreatorPage = ({ onBack }: YearlyTaskCreatorPageProps) => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<YearlyTask[]>([]);
  const [error, _setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStartDays, setSelectedStartDays] = useState<Record<string, number | null>>({});
  const [hoverDays, setHoverDays] = useState<Record<string, number | null>>({});
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');
  const [editingMonthId, setEditingMonthId] = useState<string | null>(null);
  const [editingMonthValue, setEditingMonthValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  // 1-31日を固定で表示
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  // 初回ロード時にlocalStorageから年次タスクを読み込む
  useEffect(() => {
    try {
      const savedTasks = localStorage.getItem('yearlyTasks');
      if (savedTasks) {
        const loadedTasks: YearlyTask[] = JSON.parse(savedTasks);
        setTasks(loadedTasks);
      }
    } catch (err) {
      console.error('年次タスクの読み込みに失敗:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // タスクが変更されたらlocalStorageに保存（初回ロード後のみ）
  useEffect(() => {
    if (loading) return; // 初回ロード中はスキップ

    try {
      localStorage.setItem('yearlyTasks', JSON.stringify(tasks));
    } catch (err) {
      console.error('年次タスクの保存に失敗:', err);
    }
  }, [tasks, loading]);

  const handleAddTask = () => {
    const newTask: YearlyTask = {
      id: crypto.randomUUID(),
      name: '',
      displayOrder: tasks.length + 1,
      implementationMonth: null,
      startDay: null,
      endDay: null,
    };

    // 既存のタスクのdisplayOrderをすべて+1する
    const updatedTasks = tasks.map(t => ({
      ...t,
      displayOrder: t.displayOrder + 1,
    }));

    // 新規タスクをdisplayOrder=1で追加（一番上）
    setTasks([{ ...newTask, displayOrder: 1 }, ...updatedTasks]);

    // 追加後、そのタスクを編集モードにする
    setEditingTaskId(newTask.id);
    setEditingTaskName('');
  };

  const handleToggleTaskCheck = (taskId: string) => {
    setCheckedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleToggleAllTasks = () => {
    if (checkedTasks.size === tasks.length) {
      // 全て選択されている場合は全解除
      setCheckedTasks(new Set());
    } else {
      // 一部または何も選択されていない場合は全選択
      setCheckedTasks(new Set(tasks.map(t => t.id)));
    }
  };

  const handleBulkDelete = () => {
    if (checkedTasks.size === 0) {
      return;
    }

    setTasks(tasks.filter(task => !checkedTasks.has(task.id)));
    setCheckedTasks(new Set());
  };

  const handleStartEditTaskName = (taskId: string, currentName: string) => {
    setEditingTaskId(taskId);
    setEditingTaskName(currentName);
  };

  const handleSaveTaskName = (taskId: string) => {
    if (!editingTaskName.trim()) {
      setEditingTaskId(null);
      return;
    }

    setTasks(tasks.map(t =>
      t.id === taskId ? { ...t, name: editingTaskName.trim() } : t
    ));
    setEditingTaskId(null);
  };

  const handleCancelEditTaskName = () => {
    setEditingTaskId(null);
    setEditingTaskName('');
  };

  const handleCellClick = (taskId: string, day: number) => {
    const currentStartDay = selectedStartDays[taskId];

    if (currentStartDay === null || currentStartDay === undefined) {
      // 1クリック目: 開始日を設定
      setSelectedStartDays({ ...selectedStartDays, [taskId]: day });
    } else {
      // 2クリック目: 終了日を設定
      const startDay = Math.min(currentStartDay, day);
      const endDay = Math.max(currentStartDay, day);

      setTasks(tasks.map(t =>
        t.id === taskId ? { ...t, startDay, endDay } : t
      ));

      setSelectedStartDays({ ...selectedStartDays, [taskId]: null });
      setHoverDays({ ...hoverDays, [taskId]: null });
    }
  };

  const isDayInRange = (task: YearlyTask, day: number): boolean => {
    if (task.startDay === null || task.endDay === null) return false;
    return day >= task.startDay && day <= task.endDay;
  };

  const handleStartEditMonth = (taskId: string, currentMonth: number | null) => {
    setEditingMonthId(taskId);
    setEditingMonthValue(currentMonth !== null ? String(currentMonth) : '');
  };

  const handleSaveMonth = (taskId: string) => {
    const monthValue = parseInt(editingMonthValue);

    if (editingMonthValue === '' || isNaN(monthValue) || monthValue < 1 || monthValue > 12) {
      // 空または無効な値の場合はnullをセット
      setTasks(tasks.map(t =>
        t.id === taskId ? { ...t, implementationMonth: null } : t
      ));
    } else {
      setTasks(tasks.map(t =>
        t.id === taskId ? { ...t, implementationMonth: monthValue } : t
      ));
    }

    setEditingMonthId(null);
  };

  const handleCancelEditMonth = () => {
    setEditingMonthId(null);
    setEditingMonthValue('');
  };

  const handleSortByImplementationMonth = () => {
    const sorted = [...tasks].sort((a, b) => {
      // implementationMonthがない場合は後ろに配置
      if (a.implementationMonth === null && b.implementationMonth === null) return 0;
      if (a.implementationMonth === null) return 1;
      if (b.implementationMonth === null) return -1;

      // implementationMonthで比較
      if (a.implementationMonth !== b.implementationMonth) {
        return a.implementationMonth - b.implementationMonth;
      }

      // 同じ月の場合はstartDayで比較
      if (a.startDay === null && b.startDay === null) return 0;
      if (a.startDay === null) return 1;
      if (b.startDay === null) return -1;
      return a.startDay - b.startDay;
    });

    // displayOrderを再割り当て
    const reorderedTasks = sorted.map((task, index) => ({
      ...task,
      displayOrder: index + 1,
    }));

    setTasks(reorderedTasks);
  };

  const handleExportCSV = () => {
    // CSVヘッダーとデータを作成
    const headers = ['タスク名', '実施月', '開始日', '終了日'];
    const rows = tasks.map(task => [
      task.name,
      task.implementationMonth !== null ? String(task.implementationMonth) : '',
      task.startDay !== null ? String(task.startDay) : '',
      task.endDay !== null ? String(task.endDay) : ''
    ]);

    // CSV文字列を作成（BOM付きUTF-8）
    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // ダウンロード
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '年次タスク.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          alert('CSVファイルにデータがありません');
          return;
        }

        // ヘッダー行を検証（月次タスクのCSVでないか確認）
        const headerLine = lines[0];
        if (!headerLine.includes('実施月')) {
          alert('このファイルは月次タスク用のCSVです。\n年次タスク作成画面では年次タスク用のCSVをインポートしてください。');
          return;
        }

        // ヘッダー行をスキップしてデータを読み込む
        const newTasks: YearlyTask[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          // CSVパース（ダブルクォートを考慮）
          const matches = line.match(/("([^"]*(?:""[^"]*)*)"|[^,]*)(,|$)/g);
          if (!matches) continue;

          const cells = matches.map(m => {
            let cell = m.replace(/,$/, '');
            if (cell.startsWith('"') && cell.endsWith('"')) {
              cell = cell.slice(1, -1).replace(/""/g, '"');
            }
            return cell.trim();
          });

          const name = cells[0] || '';
          const implementationMonth = cells[1] ? parseInt(cells[1], 10) : null;
          const startDay = cells[2] ? parseInt(cells[2], 10) : null;
          const endDay = cells[3] ? parseInt(cells[3], 10) : null;

          newTasks.push({
            id: crypto.randomUUID(),
            name,
            displayOrder: newTasks.length + 1,
            implementationMonth: implementationMonth && !isNaN(implementationMonth) && implementationMonth >= 1 && implementationMonth <= 12 ? implementationMonth : null,
            startDay: startDay && !isNaN(startDay) ? startDay : null,
            endDay: endDay && !isNaN(endDay) ? endDay : null,
          });
        }

        if (newTasks.length === 0) {
          alert('インポートするタスクが見つかりませんでした');
          return;
        }

        if (confirm(`${newTasks.length}件のタスクをインポートしますか？\n※現在のタスクは全て置き換えられます`)) {
          setTasks(newTasks);
        }
      } catch (err) {
        console.error('CSVインポートエラー:', err);
        alert('CSVファイルの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);

    // inputをリセット（同じファイルを再選択可能にする）
    event.target.value = '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                ← 戻る
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                年次タスク作成
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user?.username}</span>
              <button
                onClick={logout}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={handleAddTask}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              + タスク追加
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={checkedTasks.size === 0}
              className={`px-4 py-2 text-white rounded ${
                checkedTasks.size === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              タスク削除 ({checkedTasks.size})
            </button>
            <button
              onClick={handleSortByImplementationMonth}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              ソート
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              CSVエクスポート
            </button>
            <label className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer">
              CSVインポート
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-300 px-1 py-1 bg-gray-50 sticky left-0 z-10 w-[32px] min-w-[32px]">
                    <input
                      type="checkbox"
                      checked={tasks.length > 0 && checkedTasks.size === tasks.length}
                      onChange={handleToggleAllTasks}
                      className="w-4 h-4 cursor-pointer"
                      title="全選択/全解除"
                    />
                  </th>
                  <th className="border border-gray-300 px-2 py-1 bg-gray-50 sticky left-[32px] z-10 w-[120px] min-w-[120px]" style={{ writingMode: 'horizontal-tb', whiteSpace: 'nowrap' }}>
                    タスク
                  </th>
                  <th className="border border-gray-300 px-2 py-1 bg-gray-50 sticky left-[152px] z-10 w-[60px] min-w-[60px]" style={{ writingMode: 'horizontal-tb', whiteSpace: 'nowrap' }}>
                    実施月
                  </th>
                  {days.map((day) => (
                    <th
                      key={day}
                      className="border border-gray-300 px-2 py-2 text-sm bg-gray-50"
                    >
                      <div>{day}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const taskStartDay = selectedStartDays[task.id];
                  const taskHoverDay = hoverDays[task.id];
                  const isChecked = checkedTasks.has(task.id);

                  return (
                    <tr key={task.id}>
                      <td className="border border-gray-300 px-1 py-1 text-center sticky left-0 bg-white z-10 w-[32px] min-w-[32px]">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTaskCheck(task.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="border border-gray-300 px-2 py-1 font-medium sticky left-[32px] bg-white z-10 w-[120px] min-w-[120px]" style={{ writingMode: 'horizontal-tb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {editingTaskId === task.id ? (
                          <input
                            type="text"
                            value={editingTaskName}
                            onChange={(e) => setEditingTaskName(e.target.value)}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                            onBlur={() => handleSaveTaskName(task.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isComposing) {
                                handleSaveTaskName(task.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEditTaskName();
                              }
                            }}
                            autoFocus
                            className="w-full px-1 py-0 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <div
                            onClick={() => handleStartEditTaskName(task.id, task.name)}
                            className="cursor-text min-h-[20px]"
                          >
                            {task.name || <span className="text-gray-400">タスク名</span>}
                          </div>
                        )}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center sticky left-[152px] bg-white z-10 w-[60px] min-w-[60px]">
                        {editingMonthId === task.id ? (
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={editingMonthValue}
                            onChange={(e) => setEditingMonthValue(e.target.value)}
                            onBlur={() => handleSaveMonth(task.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveMonth(task.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEditMonth();
                              }
                            }}
                            autoFocus
                            className="w-full px-1 py-0 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          />
                        ) : (
                          <div
                            onClick={() => handleStartEditMonth(task.id, task.implementationMonth)}
                            className="cursor-text min-h-[20px]"
                          >
                            {task.implementationMonth !== null ? `${task.implementationMonth}月` : <span className="text-gray-400">-</span>}
                          </div>
                        )}
                      </td>
                      {days.map((day) => {
                        const inRange = isDayInRange(task, day);
                        const isStartDay = taskStartDay === day;

                        // プレビュー範囲の判定（開始日選択後、マウスオーバー中）
                        const isInPreviewRange =
                          taskStartDay !== null &&
                          taskStartDay !== undefined &&
                          taskHoverDay !== null &&
                          taskHoverDay !== undefined &&
                          day >= Math.min(taskStartDay, taskHoverDay) &&
                          day <= Math.max(taskStartDay, taskHoverDay);

                        return (
                          <td
                            key={day}
                            className={`border border-gray-300 px-2 py-2 text-center cursor-pointer ${
                              isStartDay
                                ? 'bg-blue-300'
                                : isInPreviewRange
                                ? 'bg-yellow-200'
                                : inRange
                                ? 'bg-yellow-200'
                                : ''
                            }`}
                            onClick={() => handleCellClick(task.id, day)}
                            onMouseEnter={() => setHoverDays({ ...hoverDays, [task.id]: day })}
                            onMouseLeave={() => setHoverDays({ ...hoverDays, [task.id]: null })}
                          >
                            <div className="w-4 h-4" />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {tasks.length === 0 && (
                  <tr>
                    <td
                      colSpan={days.length + 3}
                      className="border border-gray-300 px-4 py-8 text-center text-gray-500"
                    >
                      タスクがありません。「タスク追加」ボタンから追加してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
