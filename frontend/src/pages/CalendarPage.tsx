import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { completionApi, taskApi, templateApi } from '../services/api';
import type { TaskWithCompletions, Stats } from '../types';
import { TaskModal } from '../components/TaskModal';
import { TemplateSaveModal } from '../components/TemplateSaveModal';
import { TemplateSelectModal } from '../components/TemplateSelectModal';

export const CalendarPage = () => {
  const { user, logout } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [tasks, setTasks] = useState<TaskWithCompletions[]>([]);
  const [_stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [isSelectTemplateModalOpen, setIsSelectTemplateModalOpen] = useState(false);
  const [selectedStartDays, setSelectedStartDays] = useState<Record<string, number | null>>({});
  const [hoverDays, setHoverDays] = useState<Record<string, number | null>>({});
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<Array<{
    type: 'period' | 'delete' | 'create' | 'bulkDelete';
    data: any;
  }>>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [completionsData, statsData] = await Promise.all([
        completionApi.getCompletions(year, month),
        completionApi.getStats(year, month),
      ]);
      setTasks(completionsData.tasks);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [year, month]);

  const handleAddTask = async () => {
    try {
      // 既存のタスクのdisplayOrderをすべて+1する
      for (const task of tasks) {
        await taskApi.updateTask(task.id, {
          displayOrder: task.displayOrder + 1,
        });
      }

      // 新規タスクをdisplayOrder=1で作成（一番上）空白タスク
      const response = await taskApi.createTask('', year, month, 1);
      const newTask = response.task;

      // Undo履歴に追加
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'create',
          data: {
            taskId: newTask.id,
            taskName: newTask.name,
          },
        },
      ]);

      await fetchData();

      // 追加後、そのタスクを編集モードにする
      setEditingTaskId(newTask.id);
      setEditingTaskName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの追加に失敗しました');
    }
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

  const handleBulkDelete = async () => {
    if (checkedTasks.size === 0) {
      return;
    }

    try {
      // 削除前にタスク情報を保存
      const deletedTasks = tasks.filter(task => checkedTasks.has(task.id));

      for (const taskId of checkedTasks) {
        await taskApi.deleteTask(taskId);
      }

      // Undo履歴に追加
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'bulkDelete',
          data: {
            tasks: deletedTasks,
          },
        },
      ]);

      setCheckedTasks(new Set());
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの削除に失敗しました');
    }
  };

  const _handleDeleteTask = async (taskId: string, _taskName: string) => {
    try {
      await taskApi.deleteTask(taskId);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの削除に失敗しました');
    }
  };

  const handleStartEditTaskName = (taskId: string, currentName: string) => {
    setEditingTaskId(taskId);
    setEditingTaskName(currentName);
  };

  const handleSaveTaskName = async (taskId: string) => {
    if (!editingTaskName.trim()) {
      setEditingTaskId(null);
      return;
    }

    try {
      await taskApi.updateTask(taskId, { name: editingTaskName.trim() });
      setEditingTaskId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスク名の更新に失敗しました');
    }
  };

  const handleCancelEditTaskName = () => {
    setEditingTaskId(null);
    setEditingTaskName('');
  };

  const handleCellClick = async (taskId: string, day: number) => {
    const currentStartDay = selectedStartDays[taskId];

    if (currentStartDay === null || currentStartDay === undefined) {
      // 1クリック目: 開始日を設定
      setSelectedStartDays({ ...selectedStartDays, [taskId]: day });
    } else {
      // 2クリック目: 終了日を設定してAPI呼び出し
      const startDay = Math.min(currentStartDay, day);
      const endDay = Math.max(currentStartDay, day);

      const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

      try {
        await taskApi.updateTask(taskId, {
          startDate: startDateStr,
          endDate: endDateStr,
        });

        // 期間内のすべての日にチェックを入れる
        for (let d = startDay; d <= endDay; d++) {
          const targetDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          await completionApi.upsertCompletion(taskId, targetDate, true);
        }

        // Undo履歴に追加
        setUndoStack((prev) => [
          ...prev,
          {
            type: 'period',
            data: {
              taskId,
              year,
              month,
              startDay,
              endDay,
            },
          },
        ]);

        await fetchData();
        setSelectedStartDays({ ...selectedStartDays, [taskId]: null });
        setHoverDays({ ...hoverDays, [taskId]: null });
      } catch (err) {
        setError(err instanceof Error ? err.message : '期間の設定に失敗しました');
        setSelectedStartDays({ ...selectedStartDays, [taskId]: null });
        setHoverDays({ ...hoverDays, [taskId]: null });
      }
    }
  };


  const isDateInRange = (task: TaskWithCompletions, day: number): boolean => {
    if (!task.startDate || !task.endDate) return false;

    // タイムゾーンの問題を避けるため、日付文字列から年月日を抽出して比較
    const [startYear, startMonth, startDay] = task.startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = task.endDate.split('-').map(Number);

    const checkDate = year * 10000 + month * 100 + day;
    const startDate = startYear * 10000 + startMonth * 100 + startDay;
    const endDate = endYear * 10000 + endMonth * 100 + endDay;

    return checkDate >= startDate && checkDate <= endDate;
  };

  const goToPreviousMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) {
      alert('元に戻す操作がありません');
      return;
    }

    const lastAction = undoStack[undoStack.length - 1];

    try {
      if (lastAction.type === 'period') {
        const { taskId, year, month, startDay, endDay } = lastAction.data;

        // 期間内のすべてのチェックを外す
        for (let d = startDay; d <= endDay; d++) {
          const targetDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          await completionApi.upsertCompletion(taskId, targetDate, false);
        }

        // startDate と endDate を null にリセット
        await taskApi.updateTask(taskId, {
          startDate: null,
          endDate: null,
        });

        await fetchData();
      } else if (lastAction.type === 'create') {
        // タスク作成を取り消す = タスクを削除
        const { taskId } = lastAction.data;
        await taskApi.deleteTask(taskId);
        await fetchData();
      } else if (lastAction.type === 'bulkDelete') {
        // 一括削除を取り消す = タスクを再作成
        const { tasks: deletedTasks } = lastAction.data;

        // 現在の最大displayOrderを取得
        const maxOrder = tasks.length > 0
          ? Math.max(...tasks.map(t => t.displayOrder))
          : 0;

        // 削除されたタスクを順番に再作成
        for (let i = 0; i < deletedTasks.length; i++) {
          const task = deletedTasks[i];
          await taskApi.createTask(task.name, year, month, maxOrder + i + 1);
        }
        await fetchData();
      }

      // 履歴から削除
      setUndoStack((prev) => prev.slice(0, -1));
    } catch (err: any) {
      console.error('Undo error:', err);
      const errorMessage = err?.response?.data?.error
        ? JSON.stringify(err.response.data.error)
        : err instanceof Error
        ? err.message
        : '元に戻す処理に失敗しました';
      setError(`元に戻す処理に失敗: ${errorMessage}`);
    }
  };

  const handleSortByStartDate = async () => {
    // 未完了タスクと完了タスクを分ける
    const incompleteTasks = tasks.filter(t => !t.isCompleted);
    const completedTasks = tasks.filter(t => t.isCompleted);

    // 未完了タスクのみをソート
    const sortedIncompleteTasks = incompleteTasks.sort((a, b) => {
      // startDateがない場合は後ろに配置
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;

      // startDateで比較（YYYY-MM-DD形式の文字列比較）
      return a.startDate.localeCompare(b.startDate);
    });

    // 未完了タスク + 完了タスクの順に結合
    const sorted = [...sortedIncompleteTasks, ...completedTasks];

    // 各タスクのdisplayOrderを更新
    try {
      for (let i = 0; i < sorted.length; i++) {
        await taskApi.updateTask(sorted[i].id, {
          displayOrder: i + 1,
        });
      }
      // データを再取得して最新の状態を反映
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ソートに失敗しました');
    }
  };

  const handleCompleteSelected = async () => {
    if (checkedTasks.size === 0) {
      return;
    }

    // チェックされたタスクが全て完了済みかどうかを判定
    const checkedTaskObjects = tasks.filter(t => checkedTasks.has(t.id));
    const allCompleted = checkedTaskObjects.every(t => t.isCompleted);

    try {
      if (allCompleted) {
        // 全て完了済み → 未完了に戻す
        for (const taskId of checkedTasks) {
          await taskApi.updateTask(taskId, { isCompleted: false });
        }
      } else {
        // 未完了が含まれる → 完了にする
        for (const taskId of checkedTasks) {
          await taskApi.updateTask(taskId, { isCompleted: true });
        }
      }

      // タスクを再ソート（未完了タスクを上、完了タスクを下）
      const incompleteTasks = tasks.filter(t => {
        if (checkedTasks.has(t.id)) {
          return allCompleted; // 完了→未完了に戻した場合は未完了グループへ
        }
        return !t.isCompleted;
      });

      const completedTasks = tasks.filter(t => {
        if (checkedTasks.has(t.id)) {
          return !allCompleted; // 未完了→完了にした場合は完了グループへ
        }
        return t.isCompleted;
      });

      const sortedTasks = [...incompleteTasks, ...completedTasks];

      for (let i = 0; i < sortedTasks.length; i++) {
        await taskApi.updateTask(sortedTasks[i].id, {
          displayOrder: i + 1,
        });
      }

      setCheckedTasks(new Set());
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの完了/未完了の切り替えに失敗しました');
    }
  };

  const _handleLoadSampleSchedule = async () => {
    if (!confirm('全てのタスクを削除してサンプルスケジュールを読み込みますか？')) {
      return;
    }

    try {
      // 全タスクを削除
      for (const task of tasks) {
        await taskApi.deleteTask(task.id);
      }

      // サンプルタスクを作成
      const sampleTasks = [
        { name: '日次仕訳入力', startDay: 1, endDay: 25 },
        { name: '経費精算処理', startDay: 1, endDay: 10 },
        { name: '売掛金確認', startDay: 1, endDay: 5 },
        { name: '入金確認', startDay: 1, endDay: 28 },
        { name: '給与計算', startDay: 20, endDay: 25 },
        { name: '請求書発行', startDay: 25, endDay: 28 },
        { name: '買掛金支払処理', startDay: 26, endDay: 28 },
        { name: '月次決算処理', startDay: 28, endDay: 31 },
      ];

      for (let i = 0; i < sampleTasks.length; i++) {
        const sample = sampleTasks[i];

        // タスクを作成
        const response = await taskApi.createTask(sample.name, year, month, i + 1);
        const newTask = response.task;

        // 期間を設定（月末日を考慮）
        const daysInCurrentMonth = new Date(year, month, 0).getDate();
        const actualEndDay = Math.min(sample.endDay, daysInCurrentMonth);

        const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(sample.startDay).padStart(2, '0')}`;
        const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(actualEndDay).padStart(2, '0')}`;

        // タスクの期間を更新
        await taskApi.updateTask(newTask.id, {
          startDate: startDateStr,
          endDate: endDateStr,
        });

        // 期間内の全ての日にチェックを入れる
        for (let d = sample.startDay; d <= actualEndDay; d++) {
          const targetDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          await completionApi.upsertCompletion(newTask.id, targetDate, true);
        }
      }

      await fetchData();
      alert('サンプルスケジュールを読み込みました');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'サンプルスケジュールの読み込みに失敗しました');
    }
  };

  const handleSaveTemplate = () => {
    if (tasks.length === 0) {
      alert('保存するタスクがありません');
      return;
    }
    setIsSaveTemplateModalOpen(true);
  };

  const handleSaveTemplateSubmit = async (templateName: string) => {
    try {
      const result = await templateApi.saveTemplate(templateName, year, month);
      alert(`テンプレート「${result.templateName}」を保存しました（${result.count}件のタスク）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テンプレートの保存に失敗しました');
    }
  };

  const handleApplyTemplate = () => {
    setIsSelectTemplateModalOpen(true);
  };

  const handleApplyTemplateSubmit = async (templateName: string) => {
    if (!confirm(`現在の月の全てのタスクを削除してテンプレート「${templateName}」を貼り付けますか？`)) {
      return;
    }

    try {
      const result = await templateApi.applyTemplate(templateName, year, month);
      await fetchData();
      alert(`テンプレート「${result.templateName}」を適用しました（${result.count}件のタスク）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テンプレートの適用に失敗しました');
    }
  };

  const handleCarryForward = async () => {
    // 未完了タスクの数を確認
    const incompleteTasks = tasks.filter(t => !t.isCompleted);

    if (incompleteTasks.length === 0) {
      alert('繰り越す未完了タスクがありません');
      return;
    }

    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    if (!confirm(`未完了のタスク（${incompleteTasks.length}件）を${nextYear}年${nextMonth}月に繰り越しますか？\n\n繰り越したタスクは当月から削除され、翌月の1日に開始日・終了日が設定されます。`)) {
      return;
    }

    try {
      const result = await taskApi.carryForwardTasks(year, month);

      if (result.count > 0) {
        alert(`${result.count}件のタスクを${result.nextYear}年${result.nextMonth}月に繰り越しました`);
        // 翌月に移動
        setYear(result.nextYear);
        setMonth(result.nextMonth);
      } else {
        alert('繰り越すタスクがありませんでした');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの繰り越しに失敗しました');
    }
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
            <h1 className="text-2xl font-bold text-gray-900">
              月次タスク管理
            </h1>
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
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={goToPreviousMonth}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            >
              前月
            </button>
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold">
                {year}年 {month}月
              </h2>
              <button
                onClick={goToToday}
                className="px-3 py-1 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded"
              >
                今月
              </button>
            </div>
            <button
              onClick={goToNextMonth}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            >
              次月
            </button>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={handleAddTask}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              + タスク追加
            </button>
            {(() => {
              const checkedTaskObjects = tasks.filter(t => checkedTasks.has(t.id));
              const allCheckedCompleted = checkedTaskObjects.length > 0 && checkedTaskObjects.every(t => t.isCompleted);

              return (
                <button
                  onClick={handleCompleteSelected}
                  disabled={checkedTasks.size === 0}
                  className={`px-4 py-2 text-white rounded ${
                    checkedTasks.size === 0
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {allCheckedCompleted ? '↶ 未完了に戻す' : '✓ タスク完了'} ({checkedTasks.size})
                </button>
              );
            })()}
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
              onClick={handleSortByStartDate}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              ソート
            </button>
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className={`px-4 py-2 text-white rounded ${
                undoStack.length === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              ↶ 元に戻す {undoStack.length > 0 && `(${undoStack.length})`}
            </button>
            <button
              onClick={handleCarryForward}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              ➡️ 月次繰越
            </button>
            <button
              onClick={handleSaveTemplate}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              💾 テンプレート保存
            </button>
            <button
              onClick={handleApplyTemplate}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              📋 テンプレート貼り付け
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-300 px-1 py-1 bg-gray-50 sticky left-0 z-10 w-[32px] min-w-[32px]">
                    <span className="sr-only">選択</span>
                  </th>
                  <th className="border border-gray-300 px-2 py-1 bg-gray-50 sticky left-[32px] z-10 w-[80px] min-w-[80px]" style={{ writingMode: 'horizontal-tb', whiteSpace: 'nowrap' }}>
                    タスク
                  </th>
                  {days.map((day) => {
                    const date = new Date(year, month - 1, day);
                    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][
                      date.getDay()
                    ];
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return (
                      <th
                        key={day}
                        className={`border border-gray-300 px-2 py-2 text-sm ${
                          isWeekend ? 'bg-red-50' : 'bg-gray-50'
                        }`}
                      >
                        <div>{day}</div>
                        <div className="text-xs text-gray-500">{dayOfWeek}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const taskStartDay = selectedStartDays[task.id];
                  const taskHoverDay = hoverDays[task.id];
                  const isChecked = checkedTasks.has(task.id);

                  const isCompletedTask = task.isCompleted;
                  const rowBgClass = isCompletedTask ? 'bg-gray-100' : 'bg-white';
                  const textColorClass = isCompletedTask ? 'text-gray-400' : '';

                  return (
                    <tr key={task.id} className={isCompletedTask ? 'opacity-60' : ''}>
                      <td className={`border border-gray-300 px-1 py-1 text-center sticky left-0 ${rowBgClass} z-10 w-[32px] min-w-[32px]`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTaskCheck(task.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className={`border border-gray-300 px-2 py-1 font-medium sticky left-[32px] ${rowBgClass} z-10 w-[80px] min-w-[80px] ${textColorClass}`} style={{ writingMode: 'horizontal-tb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                      {days.map((day) => {
                        const inRange = isDateInRange(task, day);
                        const date = new Date(year, month - 1, day);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
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
                            className={`border border-gray-300 px-2 py-2 text-center ${
                              isCompletedTask ? 'cursor-not-allowed bg-gray-100' : 'cursor-pointer'
                            } ${
                              !isCompletedTask && isStartDay
                                ? 'bg-blue-300'
                                : !isCompletedTask && isInPreviewRange
                                ? 'bg-yellow-200'
                                : !isCompletedTask && inRange
                                ? 'bg-yellow-200'
                                : !isCompletedTask && isWeekend
                                ? 'bg-red-50'
                                : ''
                            }`}
                            onClick={() => !isCompletedTask && handleCellClick(task.id, day)}
                            onMouseEnter={() => !isCompletedTask && setHoverDays({ ...hoverDays, [task.id]: day })}
                            onMouseLeave={() => !isCompletedTask && setHoverDays({ ...hoverDays, [task.id]: null })}
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
                      colSpan={days.length + 2}
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

      <TaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddTask}
      />
      <TemplateSaveModal
        isOpen={isSaveTemplateModalOpen}
        onClose={() => setIsSaveTemplateModalOpen(false)}
        onSubmit={handleSaveTemplateSubmit}
      />
      <TemplateSelectModal
        isOpen={isSelectTemplateModalOpen}
        onClose={() => setIsSelectTemplateModalOpen(false)}
        onSelect={handleApplyTemplateSubmit}
      />
    </div>
  );
};
