import { useState, useEffect, useRef } from 'react';
import { completionApi, taskApi, spotTaskApi } from '../services/api';
import type { TaskWithCompletions, Stats } from '../types';
import { TaskModal } from '../components/TaskModal';
import { AccountMenu } from '../components/AccountMenu';

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
  onNavigateToOrganization?: () => void;
}

export const CalendarPage = ({ onNavigateToTemplateCreator, onNavigateToYearlyTaskCreator, onNavigateToSpotTaskCreator, onNavigateToOrganization }: CalendarPageProps) => {
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
      // 階層タスクをフラット化して表示用に変換
      const flattenedTasks = flattenTasks(completionsData.tasks);
      setTasks(flattenedTasks);
      setStats(statsData);

      // ローカルストレージにキャッシュ
      const cacheKey = `tasks_${year}_${month}`;
      localStorage.setItem(cacheKey, JSON.stringify(flattenedTasks));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // キャッシュから先にデータを読み込み（即座に表示）
    const cacheKey = `tasks_${year}_${month}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const cachedTasks = JSON.parse(cachedData);
        setTasks(cachedTasks);
        setLoading(false); // キャッシュがあれば即座にロード完了
      } catch {
        // キャッシュが壊れている場合は無視
      }
    }
    // バックグラウンドで最新データを取得
    fetchData();
  }, [year, month]);

  // Enterキーで次のタスクを編集するためのキーボードリスナー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 編集中でなく、最後に保存したタスクがある場合
      if (e.key === 'Enter' && !editingTaskId && lastSavedTaskId) {
        e.preventDefault();

        // 最後に保存したタスクの次のタスクを見つける
        const lastSavedIndex = tasks.findIndex(t => t.id === lastSavedTaskId);
        if (lastSavedIndex !== -1 && lastSavedIndex < tasks.length - 1) {
          // 完了済みタスクはスキップして次の未完了タスクを探す
          let nextIndex = lastSavedIndex + 1;
          while (nextIndex < tasks.length && tasks[nextIndex].isCompleted) {
            nextIndex++;
          }
          if (nextIndex < tasks.length) {
            const targetTask = tasks[nextIndex];
            setEditingTaskId(targetTask.id);
            setEditingTaskName(targetTask.name);
            setLastSavedTaskId(null);
          }
        } else {
          setLastSavedTaskId(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingTaskId, lastSavedTaskId, tasks]);

  const handleAddTask = async () => {
    try {
      // 新規タスクを末尾に追加（既存タスクの更新は不要）
      const maxDisplayOrder = tasks.length > 0
        ? Math.max(...tasks.map(t => t.displayOrder))
        : 0;

      const response = await taskApi.createTask('', year, month, maxDisplayOrder + 1);
      const newTask = response.task;

      // ローカル状態を即座に更新（リロードなし）
      const newTaskWithCompletions: TaskWithCompletions = {
        id: newTask.id,
        name: newTask.name,
        year: newTask.year,
        month: newTask.month,
        displayOrder: newTask.displayOrder,
        startDate: newTask.startDate,
        endDate: newTask.endDate,
        isCompleted: newTask.isCompleted,
        parentId: newTask.parentId,
        completions: {},
        level: 0,
      };
      setTasks(prevTasks => [...prevTasks, newTaskWithCompletions]);

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

    try {
      await taskApi.updateTask(taskId, { name: editingTaskName.trim() });

      // ローカル状態を直接更新（リロードなし）
      setTasks(prevTasks =>
        prevTasks.map(t =>
          t.id === taskId ? { ...t, name: editingTaskName.trim() } : t
        )
      );

      setEditingTaskId(null);
      setLastSavedTaskId(taskId); // 次のEnterで下のタスクを編集するため
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスク名の更新に失敗しました');
    }
  };

  const handleCancelEditTaskName = () => {
    setEditingTaskId(null);
    setEditingTaskName('');
    setLastSavedTaskId(null);
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

          // レベルを更新
          movedGroup.forEach(task => {
            task.level = (task.level ?? 0) + levelDiff;
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
      taskApi.updateTask(draggedTaskId, { parentId: currentNestTarget }).catch(err => {
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
  };

  const handleSortByStartDate = async () => {
    // 未完了タスクと完了タスクを分ける
    const incompleteTasks = [...tasks.filter(t => !t.isCompleted)];
    const completedTasks = [...tasks.filter(t => t.isCompleted)];

    // 未完了タスクのみをソート
    incompleteTasks.sort((a, b) => {
      // startDateがない場合は後ろに配置
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;

      // startDateで比較（YYYY-MM-DD形式の文字列比較）
      return a.startDate.localeCompare(b.startDate);
    });

    // 未完了タスク + 完了タスクの順に結合し、displayOrderを更新
    const sorted = [...incompleteTasks, ...completedTasks].map((task, i) => ({
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
      // localStorageから月次テンプレートと年次タスクを取得
      const savedMonthlyTemplate = localStorage.getItem('monthlyTemplate');
      const savedYearlyTasks = localStorage.getItem('yearlyTasks');

      interface MonthlyTemplateTask {
        id: string;
        name: string;
        displayOrder: number;
        startDay: number | null;
        endDay: number | null;
      }

      interface YearlyTask {
        id: string;
        name: string;
        displayOrder: number;
        implementationMonth: number | null;
        startDay: number | null;
        endDay: number | null;
      }

      const monthlyTemplateTasks: MonthlyTemplateTask[] = savedMonthlyTemplate ? JSON.parse(savedMonthlyTemplate) : [];
      const yearlyTasks: YearlyTask[] = savedYearlyTasks ? JSON.parse(savedYearlyTasks) : [];

      // 現在の月に一致する年次タスクをフィルタリング
      const matchingYearlyTasks = yearlyTasks.filter((task) => task.implementationMonth === month);

      // APIからスポットタスクを取得（年月でフィルタリング）
      const { spotTasks } = await spotTaskApi.getByYearMonth(year, month);

      const totalTaskCount = monthlyTemplateTasks.length + matchingYearlyTasks.length + spotTasks.length;

      if (totalTaskCount === 0) {
        alert('貼り付けるタスクがありません。先に「月次タスク作成」「年次タスク作成」または「スポットタスク作成」画面でタスクを作成してください。');
        return;
      }

      const message = `月次タスク（${monthlyTemplateTasks.length}件）+ 年次タスク（${matchingYearlyTasks.length}件）+ スポットタスク（${spotTasks.length}件）= 合計${totalTaskCount}件のタスクを追加しますか？`;

      if (!confirm(message)) {
        return;
      }

      // 現在の最大displayOrderを取得
      const maxDisplayOrder = tasks.length > 0
        ? Math.max(...tasks.map(t => t.displayOrder))
        : 0;

      // その月の日数を取得
      const daysInCurrentMonth = new Date(year, month, 0).getDate();

      // すべてのタスク作成リクエストを並列で実行
      const createPromises: Promise<any>[] = [];
      let orderIndex = 0;

      // 月次テンプレートから新しいタスクを作成
      for (const templateTask of monthlyTemplateTasks) {
        let startDateStr: string | undefined = undefined;
        let endDateStr: string | undefined = undefined;

        if (templateTask.startDay !== null && templateTask.endDay !== null) {
          const adjustedStartDay = Math.min(templateTask.startDay, daysInCurrentMonth);
          const adjustedEndDay = Math.min(templateTask.endDay, daysInCurrentMonth);
          startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedStartDay).padStart(2, '0')}`;
          endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedEndDay).padStart(2, '0')}`;
        }

        createPromises.push(
          taskApi.createTask(templateTask.name, year, month, maxDisplayOrder + orderIndex + 1, startDateStr, endDateStr)
        );
        orderIndex++;
      }

      // 年次タスクを月次タスクとして追加
      for (const yearlyTask of matchingYearlyTasks) {
        let startDateStr: string | undefined = undefined;
        let endDateStr: string | undefined = undefined;

        if (yearlyTask.startDay !== null && yearlyTask.endDay !== null) {
          const adjustedStartDay = Math.min(yearlyTask.startDay, daysInCurrentMonth);
          const adjustedEndDay = Math.min(yearlyTask.endDay, daysInCurrentMonth);
          startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedStartDay).padStart(2, '0')}`;
          endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedEndDay).padStart(2, '0')}`;
        }

        createPromises.push(
          taskApi.createTask(yearlyTask.name, year, month, maxDisplayOrder + orderIndex + 1, startDateStr, endDateStr)
        );
        orderIndex++;
      }

      // スポットタスクを月次タスクとして追加
      for (const spotTask of spotTasks) {
        let startDateStr: string | undefined = undefined;
        let endDateStr: string | undefined = undefined;

        if (spotTask.startDay !== null && spotTask.endDay !== null) {
          const adjustedStartDay = Math.min(spotTask.startDay, daysInCurrentMonth);
          const adjustedEndDay = Math.min(spotTask.endDay, daysInCurrentMonth);
          startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedStartDay).padStart(2, '0')}`;
          endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedEndDay).padStart(2, '0')}`;
        }

        createPromises.push(
          taskApi.createTask(spotTask.name, year, month, maxDisplayOrder + orderIndex + 1, startDateStr, endDateStr)
        );
        orderIndex++;
      }

      // 並列でタスク作成を実行
      const results = await Promise.all(createPromises);

      // レスポンスからタスクを取得してローカル状態に追加
      const newTasks: TaskWithCompletions[] = results.map(response => ({
        id: response.task.id,
        name: response.task.name,
        year: response.task.year,
        month: response.task.month,
        displayOrder: response.task.displayOrder,
        startDate: response.task.startDate,
        endDate: response.task.endDate,
        isCompleted: response.task.isCompleted,
        parentId: response.task.parentId,
        completions: {},
        level: 0,
      }));

      setTasks(prevTasks => [...prevTasks, ...newTasks]);

      alert(`タスクを追加しました（月次: ${monthlyTemplateTasks.length}件、年次: ${matchingYearlyTasks.length}件、スポット: ${spotTasks.length}件、合計: ${results.length}件）`);
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
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">
                月次タスク管理
              </h1>
              <button
                onClick={onNavigateToTemplateCreator}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                📝 月次タスク作成
              </button>
              <button
                onClick={onNavigateToYearlyTaskCreator}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                📅 年次タスク作成
              </button>
              <button
                onClick={onNavigateToSpotTaskCreator}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                ⚡ スポットタスク作成
              </button>
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
              onClick={handleApplyTemplate}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              📋 タスク貼り付け
            </button>
          </div>

          <div className="overflow-x-auto overflow-y-visible pb-4" style={{ scrollbarWidth: 'thin' }}>
            <table ref={tableRef} className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-300 px-1 py-1 bg-gray-50 sticky left-0 z-10 w-[120px] min-w-[120px]">
                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={tasks.length > 0 && checkedTasks.size === tasks.length}
                        onChange={handleToggleAllTasks}
                        className="w-4 h-4 cursor-pointer"
                        title="全選択/全解除"
                      />
                      <span>タスク</span>
                    </div>
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
              <tbody
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e)}
              >
                {tasks.map((task, index) => {
                  const taskStartDay = selectedStartDays[task.id];
                  const taskHoverDay = hoverDays[task.id];
                  const isChecked = checkedTasks.has(task.id);

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
                        className={`border border-gray-300 px-1 py-1 sticky left-0 ${isNestTarget ? 'bg-green-100' : isUnnestMode ? 'bg-yellow-100' : rowBgClass} z-10 w-[120px] min-w-[120px] ${textColorClass}`}
                        style={{
                          paddingLeft: `${4 + taskLevel * 20}px` // 階層に応じたインデント
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
                            onChange={() => handleToggleTaskCheck(task.id)}
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
                                  handleSaveTaskName(task.id);
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
                              <span className="truncate">
                                {task.name || <span className="text-gray-400">タスク名</span>}
                              </span>
                            </div>
                          )}
                        </div>
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
    </div>
  );
};
