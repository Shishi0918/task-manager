import { useState, useEffect, useRef, useMemo } from 'react';
import { completionApi, taskApi, spotTaskApi, templateApi, yearlyTaskApi, weeklyTaskApi, dailyTaskApi, type WeeklyTask, type DailyTask } from '../services/api';
import type { TaskWithCompletions, Stats } from '../types';
import { TaskModal } from '../components/TaskModal';
import { AccountMenu } from '../components/AccountMenu';
import { useAuth } from '../contexts/AuthContext';
import { getHolidaysForMonth } from '../utils/holidays';

// 階層タスクをフラット化する関数
const flattenTasks = (
  tasks: TaskWithCompletions[],
  level: number = 0
): TaskWithCompletions[] => {
  const result: TaskWithCompletions[] = [];
  for (const task of tasks) {
    result.push({ ...task, level });
    if (task.children && task.children.length > 0) {
      result.push(...flattenTasks(task.children, level + 1));
    }
  }
  return result;
};

interface CalendarPageProps {
  onNavigateToTemplateCreator: () => void;
  onNavigateToYearlyTaskCreator: () => void;
  onNavigateToSpotTaskCreator: () => void;
  onNavigateToWeeklyTaskCreator: () => void;
  onNavigateToDailyTaskCreator: () => void;
  onNavigateToOrganization?: () => void;
}

export const CalendarPage = ({ onNavigateToTemplateCreator, onNavigateToYearlyTaskCreator, onNavigateToSpotTaskCreator, onNavigateToWeeklyTaskCreator, onNavigateToDailyTaskCreator, onNavigateToOrganization }: CalendarPageProps) => {
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [tasks, setTasks] = useState<TaskWithCompletions[]>([]);
  const [_stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStartDays, setSelectedStartDays] = useState<Record<string, number | null>>({});
  const [hoverDays, setHoverDays] = useState<Record<string, number | null>>({});
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [lastCheckedTaskId, setLastCheckedTaskId] = useState<string | null>(null); // Shift+クリック用
  const [copiedTasks, setCopiedTasks] = useState<TaskWithCompletions[]>([]); // コピーしたタスク
  const [undoStack, setUndoStack] = useState<Array<{
    type: 'period' | 'delete' | 'create' | 'bulkDelete';
    data: any;
  }>>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [lastSavedTaskId, setLastSavedTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverBottom, setDragOverBottom] = useState(false); // 最後の行の下にドロップする場合
  const [dragMode, setDragMode] = useState<'reorder' | 'nest' | 'unnest'>('reorder'); // ドラッグモード
  const [nestTargetTaskId, setNestTargetTaskId] = useState<string | null>(null); // 子にする親タスク
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 祝日データを取得
  const holidays = useMemo(() => getHolidaysForMonth(year, month), [year, month]);

  const fetchData = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError('');
    try {
      const [completionsData, statsData] = await Promise.all([
        completionApi.getCompletions(year, month),
        completionApi.getStats(year, month),
      ]);
      // 階層タスクをフラット化して表示用に変換
      const flattenedTasks = flattenTasks(completionsData.tasks);
      setTasks(flattenedTasks);
      setStats(statsData);

      // ローカルストレージにキャッシュ（ユーザーIDを含める）
      if (user?.id) {
        const cacheKey = `tasks_${user.id}_${year}_${month}`;
        localStorage.setItem(cacheKey, JSON.stringify(flattenedTasks));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // キャッシュから先にデータを読み込み（即座に表示）
    let hasCachedData = false;

    if (user?.id) {
      const cacheKey = `tasks_${user.id}_${year}_${month}`;
      const cachedData = localStorage.getItem(cacheKey);

      if (cachedData) {
        try {
          const cachedTasks = JSON.parse(cachedData);
          setTasks(cachedTasks);
          setLoading(false); // キャッシュがあれば即座にロード完了
          hasCachedData = true;
        } catch {
          // キャッシュが壊れている場合は無視
        }
      }
    }

    // バックグラウンドで最新データを取得（キャッシュがあればローディング表示なし）
    fetchData(!hasCachedData);
  }, [year, month, user?.id]);

  // Enterキーで次のタスクを編集、または新規タスク追加するためのフラグ
  const [shouldAddNewTask, setShouldAddNewTask] = useState(false);

  // Enterキーで次のタスクを編集するためのキーボードリスナー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 編集中でなく、最後に保存したタスクがある場合
      if (e.key === 'Enter' && !editingTaskId && lastSavedTaskId) {
        e.preventDefault();

        // 最後に保存したタスクの次のタスクを見つける
        const lastSavedIndex = tasks.findIndex(t => t.id === lastSavedTaskId);
        if (lastSavedIndex !== -1) {
          // 完了済みタスクはスキップして次の未完了タスクを探す
          let nextIndex = lastSavedIndex + 1;
          while (nextIndex < tasks.length && tasks[nextIndex].isCompleted) {
            nextIndex++;
          }
          if (nextIndex < tasks.length) {
            // 次の未完了タスクがある場合は編集モードに入る
            const targetTask = tasks[nextIndex];
            setEditingTaskId(targetTask.id);
            setEditingTaskName(targetTask.name);
            setLastSavedTaskId(null);
          } else {
            // 下にタスクがない場合は新しいタスクを追加
            setLastSavedTaskId(null);
            setShouldAddNewTask(true);
          }
        } else {
          setLastSavedTaskId(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingTaskId, lastSavedTaskId, tasks]);

  // 新規タスク追加のトリガー
  useEffect(() => {
    if (shouldAddNewTask) {
      setShouldAddNewTask(false);
      handleAddTask();
    }
  }, [shouldAddNewTask]);

  // Ctrl+C / Ctrl+V でタスクをコピー＆ペースト
  useEffect(() => {
    const handleCopyPaste = async (e: KeyboardEvent) => {
      // Ctrl+C: コピー（編集中は無視）
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !editingTaskId && checkedTasks.size > 0) {
        e.preventDefault();
        const tasksToCopy = tasks.filter(t => checkedTasks.has(t.id));
        setCopiedTasks(tasksToCopy);
        console.log(`${tasksToCopy.length}件のタスクをコピーしました`);
      }

      // Ctrl+V: ペースト
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedTasks.length > 0) {
        e.preventDefault();

        try {
          const newTasks: TaskWithCompletions[] = [];

          if (editingTaskId) {
            // 編集中の場合: その行の上に挿入
            const editingIndex = tasks.findIndex(t => t.id === editingTaskId);
            if (editingIndex === -1) return;

            const editingTask = tasks[editingIndex];
            const insertBaseLevel = editingTask.level ?? 0;

            // コピー元の最小レベルを取得（相対レベル計算用）
            const minCopiedLevel = Math.min(...copiedTasks.map(t => t.level ?? 0));

            // 挿入位置のdisplayOrderを計算
            const baseDisplayOrder = editingIndex === 0
              ? 1
              : (tasks[editingIndex - 1]?.displayOrder ?? 0) + 1;

            // 旧IDと新IDのマッピング
            const oldIdToNewId = new Map<string, string>();
            const copiedTaskIds = new Set(copiedTasks.map(t => t.id));

            // コピーしたタスクを作成
            for (let i = 0; i < copiedTasks.length; i++) {
              const sourceTask = copiedTasks[i];
              const relativeLevel = (sourceTask.level ?? 0) - minCopiedLevel;
              const newLevel = insertBaseLevel + relativeLevel;

              const result = await taskApi.createTask(
                sourceTask.name,
                year,
                month,
                baseDisplayOrder + i,
                sourceTask.startDate ?? undefined,
                sourceTask.endDate ?? undefined
              );

              oldIdToNewId.set(sourceTask.id, result.task.id);

              // parentIdを決定
              let newParentId: string | null = null;
              if (sourceTask.parentId && copiedTaskIds.has(sourceTask.parentId)) {
                // 親がコピー対象に含まれていれば、新しいIDに変換
                newParentId = oldIdToNewId.get(sourceTask.parentId) ?? null;
              } else if (relativeLevel === 0) {
                // 最上位レベルのタスクは挿入位置の親を継承
                newParentId = editingTask.parentId ?? null;
              }

              newTasks.push({
                id: result.task.id,
                name: result.task.name,
                year: result.task.year,
                month: result.task.month,
                displayOrder: result.task.displayOrder,
                startDate: sourceTask.startDate,
                endDate: sourceTask.endDate,
                isCompleted: false,
                parentId: newParentId,
                completions: {},
                level: newLevel,
              });

              // 親IDをAPIで更新
              if (newParentId) {
                await taskApi.updateTask(result.task.id, { parentId: newParentId });
              }
            }

            // ローカル状態を更新: 編集中のタスクの前に挿入
            setTasks(prevTasks => {
              const newTaskList = [...prevTasks];
              newTaskList.splice(editingIndex, 0, ...newTasks);
              return newTaskList;
            });

            // 編集状態を解除
            setEditingTaskId(null);
            setEditingTaskName('');

            console.log(`${newTasks.length}件のタスクを挿入しました`);
          } else {
            // 編集中でない場合: 末尾に追加（階層関係を保持）
            const maxDisplayOrder = tasks.length > 0
              ? Math.max(...tasks.map(t => t.displayOrder))
              : 0;

            // コピー元の最小レベルを取得
            const minCopiedLevel = Math.min(...copiedTasks.map(t => t.level ?? 0));

            // 旧IDと新IDのマッピング
            const oldIdToNewId = new Map<string, string>();
            const copiedTaskIds = new Set(copiedTasks.map(t => t.id));

            for (let i = 0; i < copiedTasks.length; i++) {
              const sourceTask = copiedTasks[i];
              const newDisplayOrder = maxDisplayOrder + 1 + i;
              const relativeLevel = (sourceTask.level ?? 0) - minCopiedLevel;

              const result = await taskApi.createTask(
                sourceTask.name,
                year,
                month,
                newDisplayOrder,
                sourceTask.startDate ?? undefined,
                sourceTask.endDate ?? undefined
              );

              oldIdToNewId.set(sourceTask.id, result.task.id);

              // parentIdを決定
              let newParentId: string | null = null;
              if (sourceTask.parentId && copiedTaskIds.has(sourceTask.parentId)) {
                newParentId = oldIdToNewId.get(sourceTask.parentId) ?? null;
              }

              newTasks.push({
                id: result.task.id,
                name: result.task.name,
                year: result.task.year,
                month: result.task.month,
                displayOrder: result.task.displayOrder,
                startDate: sourceTask.startDate,
                endDate: sourceTask.endDate,
                isCompleted: false,
                parentId: newParentId,
                completions: {},
                level: relativeLevel,
              });

              // 親IDをAPIで更新
              if (newParentId) {
                await taskApi.updateTask(result.task.id, { parentId: newParentId });
              }
            }

            setTasks(prevTasks => [...prevTasks, ...newTasks]);
            console.log(`${newTasks.length}件のタスクを貼り付けました`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'タスクの貼り付けに失敗しました');
        }
      }
    };

    document.addEventListener('keydown', handleCopyPaste);
    return () => document.removeEventListener('keydown', handleCopyPaste);
  }, [editingTaskId, checkedTasks, copiedTasks, tasks, year, month]);

  const handleAddTask = async () => {
    // 一時的なIDを生成（APIレスポンス前に画面に表示するため）
    const tempId = `temp_${Date.now()}`;

    // 編集中のタスクがある場合、その直下に同じ階層で追加
    let insertIndex = tasks.length;
    let parentId: string | null = null;
    let level = 0;
    let displayOrder: number;

    if (editingTaskId) {
      const editingIndex = tasks.findIndex(t => t.id === editingTaskId);
      if (editingIndex !== -1) {
        const editingTask = tasks[editingIndex];
        parentId = editingTask.parentId ?? null;
        level = editingTask.level ?? 0;

        // 編集中のタスクとその子孫を全てスキップして挿入位置を決定
        let nextIndex = editingIndex + 1;
        while (nextIndex < tasks.length) {
          const nextTask = tasks[nextIndex];
          const nextLevel = nextTask.level ?? 0;
          // 同じ階層以下に戻ったらそこが挿入位置
          if (nextLevel <= level) {
            break;
          }
          nextIndex++;
        }
        insertIndex = nextIndex;
        displayOrder = insertIndex + 1;
      } else {
        displayOrder = tasks.length + 1;
      }
    } else {
      displayOrder = tasks.length > 0
        ? Math.max(...tasks.map(t => t.displayOrder)) + 1
        : 1;
    }

    // 即座にUIに追加（楽観的更新）
    const tempTask: TaskWithCompletions = {
      id: tempId,
      name: '',
      year,
      month,
      displayOrder,
      startDate: null,
      endDate: null,
      isCompleted: false,
      parentId,
      completions: {},
      level,
    };

    // 挿入位置にタスクを追加し、後続タスクのdisplayOrderを更新
    setTasks(prevTasks => {
      const newTasks = [...prevTasks];
      newTasks.splice(insertIndex, 0, tempTask);
      // displayOrderを再割り当て
      return newTasks.map((t, i) => ({ ...t, displayOrder: i + 1 }));
    });
    setEditingTaskId(tempId);
    setEditingTaskName('');

    // バックグラウンドでAPI呼び出し
    try {
      const response = await taskApi.createTask('', year, month, displayOrder);
      const newTask = response.task;

      // 一時IDを実際のIDに置き換え、名前も取得
      let savedName = '';
      setTasks(prevTasks => prevTasks.map(t => {
        if (t.id === tempId) {
          savedName = t.name; // 一時タスクに設定された名前を保存
          return { ...t, id: newTask.id };
        }
        return t;
      }));

      // 編集中のIDも更新
      setEditingTaskId(prevId => prevId === tempId ? newTask.id : prevId);

      // parentIdがある場合は更新
      if (parentId) {
        await taskApi.updateTask(newTask.id, { parentId });
      }

      // 一時タスクに名前が設定されていた場合、APIで保存
      if (savedName) {
        taskApi.updateTask(newTask.id, { name: savedName }).catch(err => {
          console.error('Failed to save task name:', err);
        });
      }

      // Undo履歴に追加
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'create',
          data: {
            taskId: newTask.id,
            taskName: savedName || newTask.name,
          },
        },
      ]);
    } catch (err) {
      // エラー時は一時タスクを削除
      setTasks(prevTasks => prevTasks.filter(t => t.id !== tempId));
      setEditingTaskId(null);
      setError(err instanceof Error ? err.message : 'タスクの追加に失敗しました');
    }
  };

  const handleToggleTaskCheck = (taskId: string, event?: React.MouseEvent) => {
    const isShiftClick = event?.shiftKey ?? false;

    if (isShiftClick && lastCheckedTaskId) {
      // Shift+クリック: 範囲選択
      const lastIndex = tasks.findIndex(t => t.id === lastCheckedTaskId);
      const currentIndex = tasks.findIndex(t => t.id === taskId);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const startIndex = Math.min(lastIndex, currentIndex);
        const endIndex = Math.max(lastIndex, currentIndex);

        setCheckedTasks((prev) => {
          const newSet = new Set(prev);
          for (let i = startIndex; i <= endIndex; i++) {
            newSet.add(tasks[i].id);
          }
          return newSet;
        });
      }
    } else {
      // 通常クリック: トグル
      setCheckedTasks((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(taskId)) {
          newSet.delete(taskId);
        } else {
          newSet.add(taskId);
        }
        return newSet;
      });
      setLastCheckedTaskId(taskId);
    }
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

  const handleBulkDelete = async () => {
    if (checkedTasks.size === 0) {
      return;
    }

    try {
      // 削除前にタスク情報を保存
      const deletedTasks = tasks.filter(task => checkedTasks.has(task.id));
      const checkedTaskIds = Array.from(checkedTasks);

      // ローカル状態を即座に更新（楽観的更新）
      setTasks(prevTasks => prevTasks.filter(task => !checkedTasks.has(task.id)));
      setCheckedTasks(new Set());

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

      // APIは並列で実行（バックグラウンド）
      await Promise.all(checkedTaskIds.map(taskId => taskApi.deleteTask(taskId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの削除に失敗しました');
      // エラー時はデータを再取得
      await fetchData();
    }
  };

  const handleStartEditTaskName = (taskId: string, currentName: string) => {
    setEditingTaskId(taskId);
    setEditingTaskName(currentName);
    setLastSavedTaskId(null);
  };

  const handleSaveTaskName = async (taskId: string) => {
    if (!editingTaskName.trim()) {
      setEditingTaskId(null);
      setLastSavedTaskId(null);
      return;
    }

    const trimmedName = editingTaskName.trim();

    // ローカル状態を即座に更新（楽観的更新）
    setTasks(prevTasks =>
      prevTasks.map(t =>
        t.id === taskId ? { ...t, name: trimmedName } : t
      )
    );
    setEditingTaskId(null);
    setLastSavedTaskId(taskId);

    // 一時IDの場合はAPI呼び出しをスキップ（createTask完了後に名前が設定される）
    if (taskId.startsWith('temp_')) {
      return;
    }

    // バックグラウンドでAPI呼び出し
    taskApi.updateTask(taskId, { name: trimmedName }).catch(err => {
      setError(err instanceof Error ? err.message : 'タスク名の更新に失敗しました');
    });
  };

  const handleCancelEditTaskName = () => {
    setEditingTaskId(null);
    setEditingTaskName('');
    setLastSavedTaskId(null);
  };

  const handleUpdateTaskTime = async (taskId: string, startTime: string | null, endTime: string | null) => {
    // 一時IDの場合はスキップ
    if (taskId.startsWith('temp_')) {
      return;
    }

    // ローカル状態を即座に更新（楽観的更新）
    setTasks(prevTasks =>
      prevTasks.map(t =>
        t.id === taskId ? { ...t, startTime, endTime } : t
      )
    );

    // バックグラウンドでAPI呼び出し
    taskApi.updateTask(taskId, { startTime, endTime }).catch(err => {
      setError(err instanceof Error ? err.message : '時間の更新に失敗しました');
    });
  };

  const handleCellClick = async (taskId: string, day: number) => {
    // 他のタスクが日付選択中の場合は操作不可
    const selectingTaskId = Object.keys(selectedStartDays).find(
      id => selectedStartDays[id] !== null && selectedStartDays[id] !== undefined
    );
    if (selectingTaskId && selectingTaskId !== taskId) {
      return; // 他のタスクが選択中なので無視
    }

    const task = tasks.find(t => t.id === taskId);
    const currentStartDay = selectedStartDays[taskId];

    // 親タスクの日付範囲をチェック
    if (task?.parentId) {
      const parentTask = tasks.find(t => t.id === task.parentId);
      if (parentTask) {
        // 親に日付範囲がない場合は子も日付設定不可
        if (!parentTask.startDate || !parentTask.endDate) {
          return;
        }
        // 親の日付範囲を取得（日のみ）
        const parentStartDay = parseInt(parentTask.startDate.split('-')[2], 10);
        const parentEndDay = parseInt(parentTask.endDate.split('-')[2], 10);
        // クリックした日が親の範囲外なら無視
        if (day < parentStartDay || day > parentEndDay) {
          return;
        }
      }
    }

    // 既に確定した範囲内をクリックした場合はクリア
    if (task && isDateInRange(task, day) && (currentStartDay === null || currentStartDay === undefined)) {
      // ローカル状態を即座に更新
      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId ? { ...t, startDate: null, endDate: null } : t
      ));

      // 一時IDの場合はAPI呼び出しをスキップ
      if (!taskId.startsWith('temp_')) {
        try {
          await taskApi.updateTask(taskId, { startDate: null, endDate: null });
        } catch (err) {
          setError(err instanceof Error ? err.message : '日付のクリアに失敗しました');
        }
      }
      return;
    }

    if (currentStartDay === null || currentStartDay === undefined) {
      // 1クリック目: 開始日を設定
      setSelectedStartDays({ ...selectedStartDays, [taskId]: day });
    } else {
      // 2クリック目: 終了日を設定してAPI呼び出し
      // 開始日より前の日付は選択不可
      if (day < currentStartDay) {
        return;
      }
      const startDay = currentStartDay;
      const endDay = day;

      const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

      // ローカル状態を即座に更新（楽観的更新）
      const newCompletions: Record<string, boolean> = {};
      for (let d = startDay; d <= endDay; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        newCompletions[dateStr] = true;
      }

      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId
          ? { ...t, startDate: startDateStr, endDate: endDateStr, completions: { ...t.completions, ...newCompletions } }
          : t
      ));
      setSelectedStartDays({ ...selectedStartDays, [taskId]: null });
      setHoverDays({ ...hoverDays, [taskId]: null });

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

      try {
        // APIは並列で実行（バックグラウンド）
        const completionPromises = [];
        for (let d = startDay; d <= endDay; d++) {
          const targetDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          completionPromises.push(completionApi.upsertCompletion(taskId, targetDate, true));
        }

        await Promise.all([
          taskApi.updateTask(taskId, { startDate: startDateStr, endDate: endDateStr }),
          ...completionPromises
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : '期間の設定に失敗しました');
        // エラー時はデータを再取得
        await fetchData();
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

  // ドラッグ&ドロップ関連のハンドラー
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    // ドラッグ中はスクロールを無効化
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'hidden';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    // マウス位置から最も近い行を特定
    const target = e.target as HTMLElement;
    const tr = target.closest('tr');
    if (!tr) return;

    const rect = tr.getBoundingClientRect();
    const mouseY = e.clientY;
    const mouseX = e.clientX;
    const taskId = tr.getAttribute('data-task-id');

    // テーブルの左端を基準に階層操作を判定
    const tableRect = tableRef.current?.getBoundingClientRect();
    const leftEdge = tableRect?.left ?? 0;

    // ドラッグ中のタスクを取得
    const draggedTask = tasks.find(t => t.id === draggedTaskId);
    const hoveredTask = taskId ? tasks.find(t => t.id === taskId) : null;

    // 左端に近い場合（50px以内）は階層解除モード
    if (mouseX < leftEdge + 50 && draggedTask && (draggedTask.level ?? 0) > 0) {
      setDragMode('unnest');
      setDragOverTaskId(null);
      setNestTargetTaskId(null);
      setDragOverBottom(false);
      return;
    }

    // タスク名セル上の中央部分にドラッグした場合のみ階層化モード
    // 行の上下30%はリオーダー用、中央40%がネスト用
    const rowRelativeY = (mouseY - rect.top) / rect.height;
    const isInMiddleZone = rowRelativeY > 0.3 && rowRelativeY < 0.7;

    const taskNameCell = tr.querySelector('td:nth-child(1)');
    if (taskNameCell && taskId && taskId !== draggedTaskId && isInMiddleZone) {
      const cellRect = taskNameCell.getBoundingClientRect();
      // セルの右側60%のみをネスト対象エリアとする（左側はドラッグハンドル用）
      const nestAreaLeft = cellRect.left + cellRect.width * 0.4;
      const isOverNestArea = mouseX >= nestAreaLeft && mouseX <= cellRect.right;

      if (isOverNestArea && hoveredTask) {
        // 階層レベルのチェック（最大2階層まで）
        const targetLevel = hoveredTask.level ?? 0;

        // ターゲットが既に2階層目の場合、または自分の子孫にはドロップできない
        if (targetLevel < 2 && !isDescendantOf(draggedTaskId, taskId)) {
          setDragMode('nest');
          setNestTargetTaskId(taskId);
          setDragOverTaskId(null);
          setDragOverBottom(false);
          return;
        }
      }
    }

    // 通常の並び替えモード
    setDragMode('reorder');
    setNestTargetTaskId(null);

    // ドラッグ方向を判定して閾値を調整
    const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
    const hoveredIndex = taskId ? tasks.findIndex(t => t.id === taskId) : -1;
    const isDraggingUp = draggedIndex > hoveredIndex;

    // 下から上にドラッグする時は70%、上から下は30%を閾値とする
    const thresholdRatio = isDraggingUp ? 0.7 : 0.3;
    const threshold = rect.top + rect.height * thresholdRatio;

    let targetTaskId: string | null = null;
    let isBottom = false;

    if (taskId) {
      const currentIndex = tasks.findIndex(t => t.id === taskId);
      if (mouseY < threshold) {
        // 上部 - この行の上に挿入
        targetTaskId = taskId;
      } else {
        // 下部 - 次の行の上に挿入（= 次の行をターゲットに）
        if (currentIndex < tasks.length - 1) {
          targetTaskId = tasks[currentIndex + 1].id;
        } else {
          // 最後の行の下部 - 最後に移動
          isBottom = true;
        }
      }
    }

    // 最後の行の下へのドロップを処理
    if (isBottom) {
      // ドラッグ中のアイテムが最後の行でない場合のみ表示
      if (draggedIndex !== tasks.length - 1) {
        setDragOverTaskId(null);
        setDragOverBottom(true);
        return;
      }
    }

    setDragOverBottom(false);

    if (targetTaskId && targetTaskId !== draggedTaskId) {
      // ドラッグ中のアイテムのすぐ下には線を表示しない
      const targetIndex = tasks.findIndex(t => t.id === targetTaskId);
      if (draggedIndex !== -1 && targetIndex === draggedIndex + 1) {
        setDragOverTaskId(null);
        return;
      }
      setDragOverTaskId(targetTaskId);
    } else {
      setDragOverTaskId(null);
    }
  };

  // タスクが別のタスクの子孫かどうかをチェック（フラット化された配列用）
  const isDescendantOf = (taskId: string, potentialAncestorId: string): boolean => {
    // potentialAncestorIdの子孫にtaskIdがあるかチェック
    const ancestorIndex = tasks.findIndex(t => t.id === potentialAncestorId);
    if (ancestorIndex === -1) return false;

    const ancestorLevel = tasks[ancestorIndex].level ?? 0;

    // ancestor以降のタスクをチェックし、ancestorより深い階層のタスクを探す
    for (let i = ancestorIndex + 1; i < tasks.length; i++) {
      const currentLevel = tasks[i].level ?? 0;
      // ancestorと同じかそれより浅い階層に達したら終了
      if (currentLevel <= ancestorLevel) break;
      // taskIdが見つかったら子孫である
      if (tasks[i].id === taskId) return true;
    }
    return false;
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // tbody外に出た場合のみクリア
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !relatedTarget.closest('tbody')) {
      setDragOverTaskId(null);
      setDragOverBottom(false);
      setDragMode('reorder');
      setNestTargetTaskId(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId?: string) => {
    e.preventDefault();

    const currentDragMode = dragMode;
    const currentNestTarget = nestTargetTaskId;

    // 最後の行の下にドロップする場合
    const isDropToBottom = dragOverBottom;
    // 青い線が表示されている行をドロップ先として使用
    const effectiveTargetId = dragOverTaskId || targetTaskId;

    // ステートをリセット
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);

    if (!draggedTaskId) {
      setDraggedTaskId(null);
      return;
    }

    // 階層解除モード
    if (currentDragMode === 'unnest') {
      const draggedTask = tasks.find(t => t.id === draggedTaskId);
      if (draggedTask && draggedTask.parentId) {
        // 親タスクの親を取得（1階層上）
        const parentTask = tasks.find(t => t.id === draggedTask.parentId);
        const newParentId = parentTask?.parentId ?? null;

        // ローカル状態を即座に更新（楽観的更新）
        setTasks(prevTasks => {
            const newTasks = [...prevTasks];
            const draggedIndex = newTasks.findIndex(t => t.id === draggedTaskId);
            if (draggedIndex === -1) return prevTasks;

            const draggedLevel = newTasks[draggedIndex].level ?? 0;

            // 子孫タスクも含めて取得
            let descendantCount = 0;
            for (let i = draggedIndex + 1; i < newTasks.length; i++) {
              if ((newTasks[i].level ?? 0) > draggedLevel) {
                descendantCount++;
              } else {
                break;
              }
            }

            // 移動するグループを抽出
            const movedGroup = newTasks.splice(draggedIndex, 1 + descendantCount);

            // レベルを1つ下げる
            movedGroup.forEach(task => {
              task.level = Math.max(0, (task.level ?? 0) - 1);
            });
            movedGroup[0].parentId = newParentId;

            // 新しい親の後に挿入する位置を見つける
            if (newParentId === null) {
              // ルートレベルに戻す場合、元の親の位置に挿入
              const oldParentIndex = newTasks.findIndex(t => t.id === parentTask?.id);
              if (oldParentIndex !== -1) {
                // 元の親とその子孫の後ろに挿入
                const oldParentLevel = newTasks[oldParentIndex].level ?? 0;
                let insertIndex = oldParentIndex + 1;
                for (let i = oldParentIndex + 1; i < newTasks.length; i++) {
                  if ((newTasks[i].level ?? 0) <= oldParentLevel) {
                    break;
                  }
                  insertIndex = i + 1;
                }
                newTasks.splice(insertIndex, 0, ...movedGroup);
              } else {
                newTasks.push(...movedGroup);
              }
            } else {
              // 新しい親の子孫の後ろに挿入
              const newParentIndex = newTasks.findIndex(t => t.id === newParentId);
              if (newParentIndex !== -1) {
                const newParentLevel = newTasks[newParentIndex].level ?? 0;
                let insertIndex = newParentIndex + 1;
                for (let i = newParentIndex + 1; i < newTasks.length; i++) {
                  if ((newTasks[i].level ?? 0) <= newParentLevel) {
                    break;
                  }
                  insertIndex = i + 1;
                }
                newTasks.splice(insertIndex, 0, ...movedGroup);
              } else {
                newTasks.push(...movedGroup);
              }
            }

            return newTasks;
          });

        // APIをバックグラウンドで実行
        setDraggedTaskId(null);
        taskApi.updateTask(draggedTaskId, { parentId: newParentId }).catch(err => {
          setError(err instanceof Error ? err.message : '階層の変更に失敗しました');
          fetchData(); // エラー時はデータを再取得
        });
      }
      return;
    }

    // 階層化モード
    if (currentDragMode === 'nest' && currentNestTarget) {
      // 親タスクの情報を取得
      const parentTask = tasks.find(t => t.id === currentNestTarget);
      const parentStartDate = parentTask?.startDate ?? null;
      const parentEndDate = parentTask?.endDate ?? null;

      // 日付調整が必要なタスクを記録
      const dateUpdates: Array<{ id: string; startDate: string | null; endDate: string | null }> = [];

      // ローカル状態を即座に更新（楽観的更新）
      setTasks(prevTasks => {
          const newTasks = [...prevTasks];
          const draggedIndex = newTasks.findIndex(t => t.id === draggedTaskId);
          const targetIndex = newTasks.findIndex(t => t.id === currentNestTarget);

          if (draggedIndex === -1 || targetIndex === -1) return prevTasks;

          const draggedLevel = newTasks[draggedIndex].level ?? 0;
          const targetLevel = newTasks[targetIndex].level ?? 0;
          const levelDiff = (targetLevel + 1) - draggedLevel;

          // 子孫タスクも含めて取得
          let descendantCount = 0;
          for (let i = draggedIndex + 1; i < newTasks.length; i++) {
            if ((newTasks[i].level ?? 0) > draggedLevel) {
              descendantCount++;
            } else {
              break;
            }
          }

          // 移動するグループを抽出
          const movedGroup = newTasks.splice(draggedIndex, 1 + descendantCount);

          // レベルを更新し、日付を調整
          movedGroup.forEach(task => {
            task.level = (task.level ?? 0) + levelDiff;

            // 日付調整ロジック
            if (!parentStartDate) {
              // 親に開始日がない場合、子の開始日・終了日を消す
              if (task.startDate || task.endDate) {
                dateUpdates.push({ id: task.id, startDate: null, endDate: null });
                task.startDate = null;
                task.endDate = null;
              }
            } else {
              let newStartDate = task.startDate ?? null;
              let newEndDate = task.endDate ?? null;
              let needsUpdate = false;

              // 子の開始日が親の開始日より前なら、開始日・終了日を親の開始日に合わせる
              if (newStartDate && newStartDate < parentStartDate) {
                newStartDate = parentStartDate;
                newEndDate = parentStartDate;
                needsUpdate = true;
              }

              // 子の開始日が親の終了日より後なら、開始日と終了日を親の終了日に合わせる
              if (parentEndDate && newStartDate && newStartDate > parentEndDate) {
                newStartDate = parentEndDate;
                newEndDate = parentEndDate;
                needsUpdate = true;
              }

              // 子の終了日が親の終了日より後なら、親の終了日に合わせる
              if (parentEndDate && newEndDate && newEndDate > parentEndDate) {
                newEndDate = parentEndDate;
                needsUpdate = true;
              }

              if (needsUpdate) {
                dateUpdates.push({ id: task.id, startDate: newStartDate, endDate: newEndDate });
                task.startDate = newStartDate;
                task.endDate = newEndDate;
              }
            }
          });
          movedGroup[0].parentId = currentNestTarget;

          // 新しいターゲットインデックスを再計算（削除後にずれている可能性）
          const newTargetIndex = newTasks.findIndex(t => t.id === currentNestTarget);
          if (newTargetIndex === -1) return prevTasks;

          // ターゲットの子孫の後ろに挿入
          let insertIndex = newTargetIndex + 1;
          for (let i = newTargetIndex + 1; i < newTasks.length; i++) {
            if ((newTasks[i].level ?? 0) <= targetLevel) {
              break;
            }
            insertIndex = i + 1;
          }

          newTasks.splice(insertIndex, 0, ...movedGroup);
          return newTasks;
        });

      // APIをバックグラウンドで実行
      setDraggedTaskId(null);

      // 親IDの更新と日付調整を並列で実行
      const updatePromises: Promise<any>[] = [
        taskApi.updateTask(draggedTaskId, { parentId: currentNestTarget })
      ];
      for (const update of dateUpdates) {
        updatePromises.push(
          taskApi.updateTask(update.id, { startDate: update.startDate, endDate: update.endDate })
        );
      }

      Promise.all(updatePromises).catch(err => {
        setError(err instanceof Error ? err.message : '階層の変更に失敗しました');
        fetchData(); // エラー時はデータを再取得
      });
      return;
    }

    // 子孫タスクを含めて取得するヘルパー
    const getTaskWithDescendants = (taskIndex: number): number => {
      const taskLevel = tasks[taskIndex].level ?? 0;
      let count = 0;
      for (let i = taskIndex + 1; i < tasks.length; i++) {
        if ((tasks[i].level ?? 0) > taskLevel) {
          count++;
        } else {
          break;
        }
      }
      return count;
    };

    // 最後に移動する場合
    if (isDropToBottom) {
      try {
        const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
        if (draggedIndex === -1) {
          setDraggedTaskId(null);
          return;
        }

        // 子孫タスクも含めて移動
        const descendantCount = getTaskWithDescendants(draggedIndex);
        const groupSize = 1 + descendantCount;

        // 既に最後にいる場合は何もしない
        if (draggedIndex + groupSize >= tasks.length) {
          setDraggedTaskId(null);
          return;
        }

        const newTasks = [...tasks];
        const movedGroup = newTasks.splice(draggedIndex, groupSize);
        newTasks.push(...movedGroup);

        // displayOrderを更新（バックグラウンドで）
        const updatePromises: Promise<any>[] = [];
        for (let i = 0; i < newTasks.length; i++) {
          if (newTasks[i].displayOrder !== i + 1) {
            newTasks[i] = { ...newTasks[i], displayOrder: i + 1 };
            updatePromises.push(taskApi.updateTask(newTasks[i].id, { displayOrder: i + 1 }));
          }
        }

        // ローカル状態を即座に更新
        setTasks(newTasks);

        // APIは並列で実行
        await Promise.all(updatePromises);
      } catch (err) {
        setError(err instanceof Error ? err.message : '順序の変更に失敗しました');
      } finally {
        setDraggedTaskId(null);
      }
      return;
    }

    if (!effectiveTargetId || draggedTaskId === effectiveTargetId) {
      setDraggedTaskId(null);
      return;
    }

    try {
      const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
      const targetIndex = tasks.findIndex(t => t.id === effectiveTargetId);

      if (draggedIndex === -1 || targetIndex === -1) return;

      // 子孫タスクも含めて移動
      const descendantCount = getTaskWithDescendants(draggedIndex);
      const groupSize = 1 + descendantCount;

      // ターゲットがドラッグ中のグループ内にある場合は何もしない
      if (targetIndex > draggedIndex && targetIndex <= draggedIndex + descendantCount) {
        setDraggedTaskId(null);
        return;
      }

      const newTasks = [...tasks];
      const movedGroup = newTasks.splice(draggedIndex, groupSize);

      // 上から下にドラッグする場合、削除後にインデックスが調整される
      let insertIndex: number;
      if (draggedIndex < targetIndex) {
        insertIndex = targetIndex - groupSize;
      } else {
        insertIndex = targetIndex;
      }
      newTasks.splice(insertIndex, 0, ...movedGroup);

      // displayOrderを更新（バックグラウンドで）
      const updatePromises: Promise<any>[] = [];
      for (let i = 0; i < newTasks.length; i++) {
        if (newTasks[i].displayOrder !== i + 1) {
          newTasks[i] = { ...newTasks[i], displayOrder: i + 1 };
          updatePromises.push(taskApi.updateTask(newTasks[i].id, { displayOrder: i + 1 }));
        }
      }

      // ローカル状態を即座に更新
      setTasks(newTasks);

      // APIは並列で実行
      await Promise.all(updatePromises);
    } catch (err) {
      setError(err instanceof Error ? err.message : '順序の変更に失敗しました');
    } finally {
      setDraggedTaskId(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);
    // ドラッグ終了時にスクロールを復元
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
    }
  };

  const handleSortByStartDate = async () => {
    // 階層構造を保持したソート
    const sortHierarchically = (
      taskList: TaskWithCompletions[],
      compareFn: (a: TaskWithCompletions, b: TaskWithCompletions) => number
    ): TaskWithCompletions[] => {
      // ルートタスク（parentIdがnull）を取得
      const rootTasks = taskList.filter(t => !t.parentId);

      // 子タスクをparentIdでグループ化
      const childrenMap = new Map<string, TaskWithCompletions[]>();
      taskList.forEach(t => {
        if (t.parentId) {
          const children = childrenMap.get(t.parentId) || [];
          children.push(t);
          childrenMap.set(t.parentId, children);
        }
      });

      // 再帰的にソートしてフラット化
      const sortAndFlatten = (tasksToSort: TaskWithCompletions[]): TaskWithCompletions[] => {
        const sorted = [...tasksToSort].sort(compareFn);
        const result: TaskWithCompletions[] = [];

        for (const task of sorted) {
          result.push(task);
          const children = childrenMap.get(task.id);
          if (children && children.length > 0) {
            result.push(...sortAndFlatten(children));
          }
        }
        return result;
      };

      return sortAndFlatten(rootTasks);
    };

    // 未完了タスクと完了タスクを分ける
    const incompleteTasks = tasks.filter(t => !t.isCompleted);
    const completedTasks = tasks.filter(t => t.isCompleted);

    // 未完了タスクのみを階層ソート
    const sortedIncomplete = sortHierarchically(incompleteTasks, (a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.localeCompare(b.startDate);
    });

    // 完了タスクも階層ソート（完了日や元の順序を維持）
    const sortedCompleted = sortHierarchically(completedTasks, (a, b) => {
      return a.displayOrder - b.displayOrder;
    });

    // 結合してdisplayOrderを更新
    const sorted = [...sortedIncomplete, ...sortedCompleted].map((task, i) => ({
      ...task,
      displayOrder: i + 1,
    }));

    // ローカル状態を即座に更新（楽観的更新）
    setTasks(sorted);

    // 各タスクのdisplayOrderを更新（並列で実行）
    try {
      const updatePromises = sorted.map((task, i) =>
        taskApi.updateTask(task.id, { displayOrder: i + 1 })
      );
      await Promise.all(updatePromises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ソートに失敗しました');
      // エラー時はデータを再取得
      await fetchData();
    }
  };

  const handleCompleteSelected = async () => {
    if (checkedTasks.size === 0) {
      return;
    }

    // チェックされたタスクが全て完了済みかどうかを判定
    const checkedTaskObjects = tasks.filter(t => checkedTasks.has(t.id));
    const allCompleted = checkedTaskObjects.every(t => t.isCompleted);
    const newCompletedStatus = !allCompleted;

    // タスクを再ソート（未完了タスクを上、完了タスクを下）
    const updatedTasks = tasks.map(t => {
      if (checkedTasks.has(t.id)) {
        return { ...t, isCompleted: newCompletedStatus };
      }
      return t;
    });

    const incompleteTasks = updatedTasks.filter(t => !t.isCompleted);
    const completedTasks = updatedTasks.filter(t => t.isCompleted);

    const sortedTasks = [...incompleteTasks, ...completedTasks].map((task, i) => ({
      ...task,
      displayOrder: i + 1,
    }));

    // ローカル状態を即座に更新（楽観的更新）
    setTasks(sortedTasks);
    setCheckedTasks(new Set());

    try {
      // 完了/未完了の切り替えとdisplayOrderの更新を並列で実行
      const updatePromises: Promise<any>[] = [];

      // 完了/未完了の切り替え
      for (const taskId of checkedTasks) {
        updatePromises.push(taskApi.updateTask(taskId, { isCompleted: newCompletedStatus }));
      }

      // displayOrderの更新
      for (let i = 0; i < sortedTasks.length; i++) {
        updatePromises.push(taskApi.updateTask(sortedTasks[i].id, { displayOrder: i + 1 }));
      }

      await Promise.all(updatePromises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの完了/未完了の切り替えに失敗しました');
      // エラー時はデータを再取得
      await fetchData();
    }
  };

  const handleApplyTemplate = async () => {
    try {
      // APIから月次テンプレート、年次タスク、スポットタスクを取得
      const DEFAULT_TEMPLATE_NAME = '__default_monthly__';

      interface TemplateTask {
        id: string;
        name: string;
        displayOrder: number;
        startDay: number | null;
        endDay: number | null;
        parentId: string | null;
      }

      interface YearlyTaskItem {
        id: string;
        name: string;
        displayOrder: number;
        implementationMonth: number | null;
        startDay: number | null;
        endDay: number | null;
        parentId?: string | null;
      }

      // 階層データをフラット化するヘルパー関数
      const flattenHierarchy = <T extends { id: string; parentId?: string | null; children?: T[] }>(
        items: T[],
        parentId: string | null = null
      ): (T & { parentId: string | null })[] => {
        const result: (T & { parentId: string | null })[] = [];
        for (const item of items) {
          const { children, ...rest } = item as T & { children?: T[] };
          result.push({ ...rest, parentId } as T & { parentId: string | null });
          if (children && children.length > 0) {
            result.push(...flattenHierarchy(children, item.id));
          }
        }
        return result;
      };

      // 並列でAPIを呼び出す
      const [monthlyResult, yearlyResult, spotResult, weeklyResult, dailyResult] = await Promise.all([
        templateApi.getTemplateDetails(DEFAULT_TEMPLATE_NAME).catch(() => ({ tasks: [] as TemplateTask[] })),
        yearlyTaskApi.getAll().catch(() => ({ yearlyTasks: [] as YearlyTaskItem[] })),
        spotTaskApi.getByYearMonth(year, month),
        weeklyTaskApi.getAll().catch(() => ({ weeklyTasks: [] as WeeklyTask[] })),
        dailyTaskApi.getAll().catch(() => ({ dailyTasks: [] as DailyTask[] })),
      ]);

      const monthlyTemplateTasks = monthlyResult.tasks;

      // 年次タスクは階層構造で返ってくるのでフラット化する
      const yearlyTasks = flattenHierarchy(yearlyResult.yearlyTasks);

      // スポットタスクはAPIが既にフラットで返すのでそのまま使用（parentId保持）
      const spotTasks = spotResult.spotTasks || [];

      // 週次タスクをフラット化
      const weeklyTasks = flattenHierarchy(weeklyResult.weeklyTasks);

      // 週次タスクを対象月の曜日に展開する
      // dayOfWeek: 0=月, 1=火, 2=水, 3=木, 4=金, 5=土, 6=日
      // JS Date.getDay(): 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土
      const getDatesForDayOfWeek = (dayOfWeek: number): number[] => {
        const jsDayOfWeek = (dayOfWeek + 1) % 7; // 週次タスクの曜日をJS曜日に変換
        const dates: number[] = [];
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          if (date.getDay() === jsDayOfWeek) {
            dates.push(day);
          }
        }
        return dates;
      };

      // 週次タスクを展開（各曜日の日付ごとにタスクを生成）
      interface ExpandedWeeklyTask {
        id: string;
        name: string;
        startDay: number;
        endDay: number;
        startTime: string | null;
        endTime: string | null;
        parentId: string | null;
        originalTaskId: string;
        dayOfWeek: number;
      }

      const expandedWeeklyTasks: ExpandedWeeklyTask[] = [];
      for (const task of weeklyTasks) {
        if (task.schedules && task.schedules.length > 0) {
          for (const schedule of task.schedules) {
            const dates = getDatesForDayOfWeek(schedule.dayOfWeek);
            for (const day of dates) {
              expandedWeeklyTasks.push({
                id: `${task.id}-${schedule.dayOfWeek}-${day}`,
                name: task.name,
                startDay: day,
                endDay: day,
                startTime: schedule.startTime ?? null,
                endTime: schedule.endTime ?? null,
                parentId: task.parentId ?? null,
                originalTaskId: task.id,
                dayOfWeek: schedule.dayOfWeek,
              });
            }
          }
        }
      }

      // 日次タスクをフラット化
      const dailyTasks = flattenHierarchy(dailyResult.dailyTasks);

      // 日次タスクを平日（土日祝を除く）に展開
      interface ExpandedDailyTask {
        id: string;
        name: string;
        startDay: number;
        endDay: number;
        startTime: string | null;
        endTime: string | null;
        parentId: string | null;
        originalTaskId: string;
      }

      // 対象月の平日（土日祝を除く）を取得
      const getWeekdaysInMonth = (): number[] => {
        const weekdays: number[] = [];
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const dayOfWeek = date.getDay();
          const isSaturday = dayOfWeek === 6;
          const isSunday = dayOfWeek === 0;
          const isHoliday = holidays.has(day);

          if (!isSaturday && !isSunday && !isHoliday) {
            weekdays.push(day);
          }
        }
        return weekdays;
      };

      const weekdaysInMonth = getWeekdaysInMonth();

      const expandedDailyTasks: ExpandedDailyTask[] = [];
      for (const task of dailyTasks) {
        for (const day of weekdaysInMonth) {
          expandedDailyTasks.push({
            id: `${task.id}-daily-${day}`,
            name: task.name,
            startDay: day,
            endDay: day,
            startTime: task.startTime ?? null,
            endTime: task.endTime ?? null,
            parentId: task.parentId ?? null,
            originalTaskId: task.id,
          });
        }
      }

      // 現在の月に一致する年次タスク、または月未設定で子が対象月に含まれる親タスクをフィルタリング
      // Step 1: 対象月に一致するタスクのIDを収集
      const matchingMonthIds = new Set(
        yearlyTasks.filter(task => task.implementationMonth === month).map(t => t.id)
      );

      // Step 2: 対象月タスクの親IDを収集（祖先を含める）
      const parentIdsToInclude = new Set<string>();
      const collectParentIds = (taskId: string) => {
        const task = yearlyTasks.find(t => t.id === taskId);
        if (task?.parentId && !parentIdsToInclude.has(task.parentId)) {
          parentIdsToInclude.add(task.parentId);
          collectParentIds(task.parentId);
        }
      };
      matchingMonthIds.forEach(id => collectParentIds(id));

      // Step 3: 対象月タスク + その親タスクを含める
      const matchingYearlyTasks = yearlyTasks.filter(task =>
        matchingMonthIds.has(task.id) || parentIdsToInclude.has(task.id)
      );

      const totalTaskCount = monthlyTemplateTasks.length + matchingYearlyTasks.length + spotTasks.length + expandedWeeklyTasks.length + expandedDailyTasks.length;

      if (totalTaskCount === 0) {
        alert('貼り付けるタスクがありません。先に「月次タスク作成」「年次タスク作成」「スポットタスク作成」「週次タスク作成」または「日次タスク作成」画面でタスクを作成してください。');
        return;
      }

      const message = `月次タスク（${monthlyTemplateTasks.length}件）+ 年次タスク（${matchingYearlyTasks.length}件）+ スポットタスク（${spotTasks.length}件）+ 週次タスク（${expandedWeeklyTasks.length}件）+ 日次タスク（${expandedDailyTasks.length}件）= 合計${totalTaskCount}件のタスクを追加しますか？`;

      if (!confirm(message)) {
        return;
      }

      // 現在の最大displayOrderを取得
      const maxDisplayOrder = tasks.length > 0
        ? Math.max(...tasks.map(t => t.displayOrder))
        : 0;

      // その月の日数を取得
      const daysInCurrentMonth = new Date(year, month, 0).getDate();

      // 階層を保持してタスクを作成するヘルパー関数（並列化版）
      const createTasksWithHierarchy = async (
        sourceTasks: Array<{ id: string; name: string; startDay: number | null; endDay: number | null; startTime?: string | null; endTime?: string | null; parentId?: string | null }>,
        startingOrder: number,
        sourceType: 'monthly' | 'yearly' | 'spot'
      ): Promise<TaskWithCompletions[]> => {
        const sortedTasks = [...sourceTasks];

        // Step 1: 日付を事前計算して保持
        const computedDates: Array<{ startDate: string | null; endDate: string | null }> = sortedTasks.map((sourceTask) => {
          if (sourceTask.startDay !== null && sourceTask.endDay !== null) {
            const adjustedStartDay = Math.min(sourceTask.startDay, daysInCurrentMonth);
            const adjustedEndDay = Math.min(sourceTask.endDay, daysInCurrentMonth);
            return {
              startDate: `${year}-${String(month).padStart(2, '0')}-${String(adjustedStartDay).padStart(2, '0')}`,
              endDate: `${year}-${String(month).padStart(2, '0')}-${String(adjustedEndDay).padStart(2, '0')}`,
            };
          }
          return { startDate: null, endDate: null };
        });

        // Step 2: 全タスクを並列で作成（parentIdなし）
        const createPromises = sortedTasks.map((sourceTask, i) => {
          const { startDate, endDate } = computedDates[i];
          return taskApi.createTask(
            sourceTask.name,
            year,
            month,
            startingOrder + i,
            startDate ?? undefined,
            endDate ?? undefined,
            sourceTask.startTime ?? null,
            sourceTask.endTime ?? null,
            sourceType
          );
        });

        const createResults = await Promise.all(createPromises);

        // 旧IDと新IDのマッピングを作成
        const oldIdToNewId = new Map<string, string>();
        sortedTasks.forEach((sourceTask, i) => {
          oldIdToNewId.set(sourceTask.id, createResults[i].task.id);
        });

        // Step 3: 親タスクがあるものだけ並列でparentIdを更新
        const updatePromises: Promise<any>[] = [];
        const parentIdMap = new Map<string, string>(); // newTaskId -> newParentId

        sortedTasks.forEach((sourceTask, i) => {
          if (sourceTask.parentId && oldIdToNewId.has(sourceTask.parentId)) {
            const newTaskId = createResults[i].task.id;
            const newParentId = oldIdToNewId.get(sourceTask.parentId)!;
            parentIdMap.set(newTaskId, newParentId);
            updatePromises.push(taskApi.updateTask(newTaskId, { parentId: newParentId }));
          }
        });

        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
        }

        // Step 4: レベルを計算してTaskWithCompletions形式に変換
        const calculateLevel = (taskId: string): number => {
          const parentId = parentIdMap.get(taskId);
          if (!parentId) return 0;
          return calculateLevel(parentId) + 1;
        };

        const results: TaskWithCompletions[] = createResults.map((result, i) => {
          const newTaskId = result.task.id;
          const newParentId = parentIdMap.get(newTaskId) ?? null;
          const level = calculateLevel(newTaskId);
          const { startDate, endDate } = computedDates[i];
          const sourceTask = sortedTasks[i];

          return {
            id: newTaskId,
            name: result.task.name,
            year: result.task.year,
            month: result.task.month,
            displayOrder: result.task.displayOrder,
            startDate,
            endDate,
            startTime: sourceTask.startTime ?? null,
            endTime: sourceTask.endTime ?? null,
            sourceType: sourceType,
            isCompleted: result.task.isCompleted ?? false,
            parentId: newParentId,
            completions: {},
            level,
          };
        });

        return results;
      };

      // 各タスクソースを並列で処理
      const baseOrder = maxDisplayOrder + 1;
      const monthlyOrder = baseOrder;
      const yearlyOrder = baseOrder + monthlyTemplateTasks.length;
      const spotOrder = yearlyOrder + matchingYearlyTasks.length;
      const weeklyOrder = spotOrder + spotTasks.length;
      const dailyOrder = weeklyOrder + expandedWeeklyTasks.length;

      // 週次タスクを作成するヘルパー関数（階層なし、日付ごとに独立）
      const createWeeklyTasks = async (
        tasks: ExpandedWeeklyTask[],
        startingOrder: number
      ): Promise<TaskWithCompletions[]> => {
        if (tasks.length === 0) return [];

        const createPromises = tasks.map((task, i) => {
          const startDate = `${year}-${String(month).padStart(2, '0')}-${String(task.startDay).padStart(2, '0')}`;
          const endDate = `${year}-${String(month).padStart(2, '0')}-${String(task.endDay).padStart(2, '0')}`;
          return taskApi.createTask(
            task.name,
            year,
            month,
            startingOrder + i,
            startDate,
            endDate,
            task.startTime,
            task.endTime,
            'weekly'
          );
        });

        const createResults = await Promise.all(createPromises);

        return createResults.map((result, i) => ({
          id: result.task.id,
          name: result.task.name,
          year: result.task.year,
          month: result.task.month,
          displayOrder: result.task.displayOrder,
          startDate: `${year}-${String(month).padStart(2, '0')}-${String(tasks[i].startDay).padStart(2, '0')}`,
          endDate: `${year}-${String(month).padStart(2, '0')}-${String(tasks[i].endDay).padStart(2, '0')}`,
          startTime: tasks[i].startTime,
          endTime: tasks[i].endTime,
          sourceType: 'weekly' as const,
          isCompleted: result.task.isCompleted ?? false,
          parentId: null,
          completions: {},
          level: 0,
        }));
      };

      // 日次タスクを作成するヘルパー関数（階層なし、日付ごとに独立）
      const createDailyTasks = async (
        tasks: ExpandedDailyTask[],
        startingOrder: number
      ): Promise<TaskWithCompletions[]> => {
        if (tasks.length === 0) return [];

        const createPromises = tasks.map((task, i) => {
          const startDate = `${year}-${String(month).padStart(2, '0')}-${String(task.startDay).padStart(2, '0')}`;
          const endDate = `${year}-${String(month).padStart(2, '0')}-${String(task.endDay).padStart(2, '0')}`;
          return taskApi.createTask(
            task.name,
            year,
            month,
            startingOrder + i,
            startDate,
            endDate,
            task.startTime,
            task.endTime,
            'daily'
          );
        });

        const createResults = await Promise.all(createPromises);

        return createResults.map((result, i) => ({
          id: result.task.id,
          name: result.task.name,
          year: result.task.year,
          month: result.task.month,
          displayOrder: result.task.displayOrder,
          startDate: `${year}-${String(month).padStart(2, '0')}-${String(tasks[i].startDay).padStart(2, '0')}`,
          endDate: `${year}-${String(month).padStart(2, '0')}-${String(tasks[i].endDay).padStart(2, '0')}`,
          startTime: tasks[i].startTime,
          endTime: tasks[i].endTime,
          sourceType: 'daily' as const,
          isCompleted: result.task.isCompleted ?? false,
          parentId: null,
          completions: {},
          level: 0,
        }));
      };

      // 5種類のタスクを並列で作成
      const [monthlyResults, yearlyResults, spotResults, weeklyResults, dailyResults] = await Promise.all([
        monthlyTemplateTasks.length > 0
          ? createTasksWithHierarchy(monthlyTemplateTasks, monthlyOrder, 'monthly')
          : Promise.resolve([]),
        matchingYearlyTasks.length > 0
          ? createTasksWithHierarchy(matchingYearlyTasks, yearlyOrder, 'yearly')
          : Promise.resolve([]),
        spotTasks.length > 0
          ? createTasksWithHierarchy(spotTasks, spotOrder, 'spot')
          : Promise.resolve([]),
        expandedWeeklyTasks.length > 0
          ? createWeeklyTasks(expandedWeeklyTasks, weeklyOrder)
          : Promise.resolve([]),
        expandedDailyTasks.length > 0
          ? createDailyTasks(expandedDailyTasks, dailyOrder)
          : Promise.resolve([]),
      ]);

      const newTasks = [...monthlyResults, ...yearlyResults, ...spotResults, ...weeklyResults, ...dailyResults];

      // 新規タスクをローカルステートに直接追加（リロード不要）
      setTasks(prevTasks => [...prevTasks, ...newTasks]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの貼り付けに失敗しました');
      // エラー時はデータを再取得
      await fetchData();
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
      <header className="bg-[#5B9BD5] shadow-lg">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-white tracking-wide">
                月次タスク管理
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={onNavigateToDailyTaskCreator}
                  className="px-4 py-2 bg-white/20 text-white rounded-md hover:bg-white/30 transition-colors text-sm font-medium"
                >
                  日次タスク作成
                </button>
                <button
                  onClick={onNavigateToWeeklyTaskCreator}
                  className="px-4 py-2 bg-white/20 text-white rounded-md hover:bg-white/30 transition-colors text-sm font-medium"
                >
                  週次タスク作成
                </button>
                <button
                  onClick={onNavigateToTemplateCreator}
                  className="px-4 py-2 bg-white/20 text-white rounded-md hover:bg-white/30 transition-colors text-sm font-medium"
                >
                  月次タスク作成
                </button>
                <button
                  onClick={onNavigateToYearlyTaskCreator}
                  className="px-4 py-2 bg-white/20 text-white rounded-md hover:bg-white/30 transition-colors text-sm font-medium"
                >
                  年次タスク作成
                </button>
                <button
                  onClick={onNavigateToSpotTaskCreator}
                  className="px-4 py-2 bg-white/20 text-white rounded-md hover:bg-white/30 transition-colors text-sm font-medium"
                >
                  スポットタスク作成
                </button>
              </div>
            </div>
            <AccountMenu onNavigateToOrganization={onNavigateToOrganization} />
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}


        <div className="bg-white shadow-md rounded-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-5">
            <button
              onClick={goToPreviousMonth}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700 font-medium"
            >
              ◀ 前月
            </button>
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-gray-800">
                {year}年 <span className="text-[#5B9BD5]">{month}月</span>
              </h2>
              <button
                onClick={goToToday}
                className="px-3 py-1.5 text-sm bg-[#5B9BD5]/10 hover:bg-[#5B9BD5]/20 text-[#5B9BD5] rounded-md font-medium transition-colors"
              >
                今月
              </button>
            </div>
            <button
              onClick={goToNextMonth}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700 font-medium"
            >
              次月 ▶
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // blurを防ぐ
                handleAddTask();
              }}
              className="px-4 py-2 bg-[#5B9BD5] text-white rounded-md hover:bg-[#4A8AC9] transition-colors text-sm font-medium shadow-sm"
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
                  className={`px-4 py-2 text-white rounded-md transition-colors text-sm font-medium shadow-sm ${
                    checkedTasks.size === 0
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {allCheckedCompleted ? '↶ 未完了に戻す' : '✓ 完了'} ({checkedTasks.size})
                </button>
              );
            })()}
            <button
              onClick={handleBulkDelete}
              disabled={checkedTasks.size === 0}
              className={`px-4 py-2 text-white rounded-md transition-colors text-sm font-medium shadow-sm ${
                checkedTasks.size === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              削除 ({checkedTasks.size})
            </button>
            <button
              onClick={handleSortByStartDate}
              className="px-4 py-2 bg-[#5B9BD5] text-white rounded-md hover:bg-[#4A8AC9] transition-colors text-sm font-medium shadow-sm"
            >
              ソート
            </button>
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className={`px-4 py-2 text-white rounded-md transition-colors text-sm font-medium shadow-sm ${
                undoStack.length === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-[#5B9BD5] hover:bg-[#4A8AC9]'
              }`}
            >
              ↶ 戻す {undoStack.length > 0 && `(${undoStack.length})`}
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <button
              onClick={handleCarryForward}
              className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm font-medium shadow-sm"
            >
              ➡️ 繰越
            </button>
            <button
              onClick={handleApplyTemplate}
              className="px-4 py-2 bg-[#5B9BD5] text-white rounded-md hover:bg-[#4A8AC9] transition-colors text-sm font-medium shadow-sm"
            >
              貼り付け
            </button>
          </div>

          <div ref={scrollContainerRef} className="overflow-x-auto overflow-y-auto rounded-lg border border-gray-200 whitespace-nowrap" style={{ maxHeight: 'calc(100vh - 220px)' }}>
            <table ref={tableRef} className="border-collapse inline-block align-top">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="px-2 py-3 bg-[#5B9BD5] text-white sticky left-0 z-30 w-[140px] min-w-[140px] font-medium" style={{ boxShadow: '1px 0 0 0 #d1d5db' }}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tasks.length > 0 && checkedTasks.size === tasks.length}
                        onChange={handleToggleAllTasks}
                        className="w-4 h-4 cursor-pointer accent-blue-500"
                        title="全選択/全解除"
                      />
                      <span className="text-sm">タスク</span>
                    </div>
                  </th>
                  <th className="px-2 py-2 text-xs font-medium bg-[#5B9BD5] text-white sticky left-[140px] z-30 w-[90px] min-w-[90px]" style={{ boxShadow: '1px 0 0 0 #d1d5db' }}>
                    開始時間
                  </th>
                  <th className="px-2 py-2 text-xs font-medium bg-[#5B9BD5] text-white sticky left-[230px] z-30 w-[90px] min-w-[90px]" style={{ boxShadow: '1px 0 0 0 #d1d5db' }}>
                    終了時間
                  </th>
                  {days.map((day) => {
                    const date = new Date(year, month - 1, day);
                    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][
                      date.getDay()
                    ];
                    const isSunday = date.getDay() === 0;
                    const isSaturday = date.getDay() === 6;
                    const holidayName = holidays.get(day);
                    const isHoliday = !!holidayName;
                    const isNonWorkday = isSunday || isSaturday || isHoliday;
                    return (
                      <th
                        key={day}
                        className={`border-r border-gray-200 px-1 py-2 text-xs font-medium w-[53px] min-w-[53px] ${isNonWorkday ? 'bg-[#6BA8D9]' : 'bg-[#5B9BD5]'} text-white`}
                        title={holidayName || undefined}
                      >
                        <div className={`font-semibold ${isHoliday ? 'text-red-200' : ''}`}>{day}</div>
                        <div className={`text-[10px] ${isSunday || isHoliday ? 'text-red-200' : isSaturday ? 'text-blue-200' : 'text-white/70'}`}>{dayOfWeek}</div>
                        {isHoliday && (
                          <div className="text-[8px] text-red-200">祝</div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e)}
              >
                {tasks.map((task, index) => {
                  const taskStartDay = selectedStartDays[task.id];
                  const taskHoverDay = hoverDays[task.id];
                  const isChecked = checkedTasks.has(task.id);

                  // 他のタスクが日付選択中かどうか
                  const selectingTaskId = Object.keys(selectedStartDays).find(
                    id => selectedStartDays[id] !== null && selectedStartDays[id] !== undefined
                  );
                  const isOtherTaskSelecting = selectingTaskId && selectingTaskId !== task.id;

                  const isCompletedTask = task.isCompleted;
                  const rowBgClass = isCompletedTask ? 'bg-gray-100' : 'bg-white';
                  const textColorClass = isCompletedTask ? 'text-gray-400' : '';

                  const isDragging = draggedTaskId === task.id;
                  const isDragOver = dragOverTaskId === task.id;
                  const isLastRow = index === tasks.length - 1;
                  const showBottomBorder = isLastRow && dragOverBottom;

                  // 階層化のビジュアルフィードバック
                  const isNestTarget = nestTargetTaskId === task.id && dragMode === 'nest';
                  const taskLevel = task.level ?? 0;

                  // 階層解除モードのビジュアルフィードバック
                  const isUnnestMode = dragMode === 'unnest' && draggedTaskId === task.id;

                  return (
                    <tr
                      key={task.id}
                      data-task-id={task.id}
                      className={`${isCompletedTask ? 'opacity-60' : ''} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'border-t-2 border-t-blue-500' : ''} ${showBottomBorder ? 'border-b-2 border-b-blue-500' : ''} ${isNestTarget ? 'bg-green-100' : ''} ${isUnnestMode ? 'bg-yellow-100' : ''}`}
                      draggable={!isCompletedTask}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDrop={(e) => handleDrop(e, task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <td
                        className={`border-b border-gray-200 px-1 py-1 sticky left-0 ${isNestTarget ? 'bg-green-50' : isUnnestMode ? 'bg-amber-50' : rowBgClass} z-10 w-[140px] min-w-[140px] ${textColorClass}`}
                        style={{
                          paddingLeft: `${8 + taskLevel * 16}px`, // 階層に応じたインデント
                          boxShadow: '1px 0 0 0 #e5e7eb'
                        }}
                      >
                        <div className="flex items-center gap-1">
                          {!isCompletedTask && (
                            <span className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0" title="ドラッグして並び替え（タスク名にドロップで子タスク化、左端にドロップで階層解除）">
                              ⋮⋮
                            </span>
                          )}
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onClick={(e) => handleToggleTaskCheck(task.id, e)}
                            onChange={() => {}} // onClickで処理するためダミー
                            className="w-4 h-4 cursor-pointer flex-shrink-0"
                          />
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
                                  e.preventDefault();
                                  if (!editingTaskName.trim()) {
                                    // タスク名が空の場合、同じ階層で下に新しいタスクを挿入
                                    handleAddTask();
                                  } else {
                                    handleSaveTaskName(task.id);
                                  }
                                } else if (e.key === 'Escape') {
                                  handleCancelEditTaskName();
                                }
                              }}
                              autoFocus
                              className="flex-1 min-w-0 px-1 py-0 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <div
                              onClick={() => handleStartEditTaskName(task.id, task.name)}
                              className="cursor-text min-h-[20px] flex items-center flex-1 min-w-0 overflow-hidden"
                            >
                              <span className={`truncate ${task.sourceType === 'daily' ? 'text-green-600' : ''}`}>
                                {task.name || <span className="text-gray-400">タスク名</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`border-b border-gray-200 px-1 py-1 text-center sticky left-[140px] z-10 w-[90px] min-w-[90px] ${rowBgClass}`} style={{ boxShadow: '1px 0 0 0 #e5e7eb' }}>
                        <div className="flex items-center justify-center gap-0.5">
                          <select
                            value={task.startTime ? task.startTime.split(':')[0] : ''}
                            onChange={(e) => {
                              const hour = e.target.value;
                              const minute = task.startTime ? task.startTime.split(':')[1] : '00';
                              const newTime = hour ? `${hour}:${minute}` : null;
                              handleUpdateTaskTime(task.id, newTime, task.endTime ?? null);
                            }}
                            className="w-10 px-0.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">--</option>
                            {Array.from({ length: 24 }, (_, i) => i).map(h => (
                              <option key={h} value={h.toString().padStart(2, '0')}>{h.toString().padStart(2, '0')}</option>
                            ))}
                          </select>
                          <span className="text-xs">:</span>
                          <select
                            value={task.startTime ? task.startTime.split(':')[1] : ''}
                            onChange={(e) => {
                              const hour = task.startTime ? task.startTime.split(':')[0] : '09';
                              const minute = e.target.value;
                              const newTime = minute ? `${hour}:${minute}` : null;
                              handleUpdateTaskTime(task.id, newTime, task.endTime ?? null);
                            }}
                            className="w-10 px-0.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">--</option>
                            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                              <option key={m} value={m.toString().padStart(2, '0')}>{m.toString().padStart(2, '0')}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className={`border-b border-gray-200 px-1 py-1 text-center sticky left-[230px] z-10 w-[90px] min-w-[90px] ${rowBgClass}`} style={{ boxShadow: '1px 0 0 0 #e5e7eb' }}>
                        <div className="flex items-center justify-center gap-0.5">
                          <select
                            value={task.endTime ? task.endTime.split(':')[0] : ''}
                            onChange={(e) => {
                              const hour = e.target.value;
                              const minute = task.endTime ? task.endTime.split(':')[1] : '00';
                              const newTime = hour ? `${hour}:${minute}` : null;
                              handleUpdateTaskTime(task.id, task.startTime ?? null, newTime);
                            }}
                            className="w-10 px-0.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">--</option>
                            {Array.from({ length: 24 }, (_, i) => i).map(h => (
                              <option key={h} value={h.toString().padStart(2, '0')}>{h.toString().padStart(2, '0')}</option>
                            ))}
                          </select>
                          <span className="text-xs">:</span>
                          <select
                            value={task.endTime ? task.endTime.split(':')[1] : ''}
                            onChange={(e) => {
                              const hour = task.endTime ? task.endTime.split(':')[0] : '10';
                              const minute = e.target.value;
                              const newTime = minute ? `${hour}:${minute}` : null;
                              handleUpdateTaskTime(task.id, task.startTime ?? null, newTime);
                            }}
                            className="w-10 px-0.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">--</option>
                            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                              <option key={m} value={m.toString().padStart(2, '0')}>{m.toString().padStart(2, '0')}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      {days.map((day) => {
                        const date = new Date(year, month - 1, day);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const isHoliday = holidays.has(day);
                        const isNonWorkday = isWeekend || isHoliday;
                        const inRange = isDateInRange(task, day);
                        const isStartDay = taskStartDay === day;

                        // 開始日選択中かどうか
                        const isSelectingEndDay = taskStartDay !== null && taskStartDay !== undefined;
                        // 開始日より前の日付かどうか（選択中のみ判定）
                        const isBeforeStartDay = isSelectingEndDay && day < taskStartDay;

                        // プレビュー範囲の判定（開始日選択後、マウスオーバー中、開始日以降のみ）
                        const isInPreviewRange =
                          isSelectingEndDay &&
                          taskHoverDay !== null &&
                          taskHoverDay !== undefined &&
                          taskHoverDay >= taskStartDay &&
                          day >= taskStartDay &&
                          day <= taskHoverDay;

                        const rangeStartDay = task.startDate ? parseInt(task.startDate.split('-')[2]) : null;
                        const rangeEndDay = task.endDate ? parseInt(task.endDate.split('-')[2]) : null;
                        const isRangeStart = inRange && rangeStartDay === day;
                        const isRangeEnd = inRange && rangeEndDay === day;

                        // セルの無効化条件
                        const isCellDisabled = isCompletedTask || isOtherTaskSelecting || isBeforeStartDay;

                        return (
                          <td
                            key={day}
                            className={`border-b border-r border-gray-200 px-0.5 py-1 text-center w-[53px] min-w-[53px] ${
                              isNonWorkday ? 'bg-gray-100' : ''
                            } ${
                              isCellDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            onClick={() => !isCellDisabled && handleCellClick(task.id, day)}
                            onMouseEnter={() => !isCellDisabled && setHoverDays({ ...hoverDays, [task.id]: day })}
                            onMouseLeave={() => !isCellDisabled && setHoverDays({ ...hoverDays, [task.id]: null })}
                          >
                            <div className={`h-5 ${
                              isCompletedTask ? 'bg-gray-50' : ''
                            } ${
                              !isCompletedTask && isStartDay
                                ? 'bg-[#85c1e9] rounded animate-blink-bar'
                                : !isCompletedTask && isInPreviewRange
                                ? 'bg-[#85c1e9] rounded animate-blink-bar'
                                : !isCompletedTask && inRange
                                ? `bg-[#85c1e9] ${isRangeStart ? 'rounded-l' : ''} ${isRangeEnd ? 'rounded-r' : ''}`
                                : ''
                            }`} />
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
                {/* 欄外クリックでタスク追加 */}
                <tr
                  onClick={() => {
                    setEditingTaskId(null);
                    setTimeout(() => handleAddTask(), 0);
                  }}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td
                    colSpan={days.length + 3}
                    className="border-b border-r border-gray-200 px-4 py-3 text-center text-gray-400 text-sm"
                  >
                    + クリックしてタスクを追加
                  </td>
                </tr>
              </tbody>
            </table>
            {/* スクロール用のスペーサー */}
            <div className="inline-block" style={{ width: 'calc(100% - 320px)', minWidth: '800px' }} />
          </div>
        </div>
      </main>

      <TaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddTask}
      />
    </div>
  );
};
