import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { projectApi } from '../services/api';
import type { ProjectTask, ProjectDetail, ProjectMember } from '../types';
import { getHolidaysForMonth } from '../utils/holidays';

// タスク名入力コンポーネント（独立させて再レンダリングを防ぐ）
const TaskNameInput = memo(function TaskNameInput({
  taskId,
  initialName,
  onSave,
  onCancel,
}: {
  taskId: string;
  initialName: string;
  onSave: (taskId: string, name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [isComposing, setIsComposing] = useState(false);

  return (
    <input
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onBlur={() => onSave(taskId, name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isComposing) {
          e.preventDefault();
          onSave(taskId, name);
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      autoFocus
      className="flex-1 min-w-0 px-1 py-0 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
});

// 階層タスクをフラット化する関数
const flattenTasks = (
  tasks: ProjectTask[],
  level: number = 0
): ProjectTask[] => {
  const result: ProjectTask[] = [];
  for (const task of tasks) {
    result.push({ ...task, level });
    if (task.children && task.children.length > 0) {
      result.push(...flattenTasks(task.children, level + 1));
    }
  }
  return result;
};

// カレンダー日付の型
interface CalendarDay {
  year: number;
  month: number;
  day: number;
  dateStr: string;
  isFirstDayOfMonth: boolean;
}

// 複数月分の日付配列を生成
const generateCalendarDays = (startYear: number, startMonth: number, monthCount: number): CalendarDay[] => {
  const result: CalendarDay[] = [];
  let currentYear = startYear;
  let currentMonth = startMonth;

  for (let m = 0; m < monthCount; m++) {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({
        year: currentYear,
        month: currentMonth,
        day: d,
        dateStr: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isFirstDayOfMonth: d === 1,
      });
    }
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }
  return result;
};

interface ProjectPageProps {
  projectId: string;
  onBack: () => void;
  onNavigateToSettings: () => void;
}

export function ProjectPage({ projectId, onBack, onNavigateToSettings }: ProjectPageProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 日付選択状態
  const [selectedStartDate, setSelectedStartDate] = useState<Record<string, string | null>>({});
  const [hoverDate, setHoverDate] = useState<Record<string, string | null>>({});

  // チェック状態
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [lastCheckedTaskId, setLastCheckedTaskId] = useState<string | null>(null);

  // 編集状態
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [lastSavedTaskId, setLastSavedTaskId] = useState<string | null>(null);
  const [shouldAddNewTask, setShouldAddNewTask] = useState(false);

  // ドラッグ状態
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverBottom, setDragOverBottom] = useState(false);
  const [dragMode, setDragMode] = useState<'reorder' | 'nest' | 'unnest'>('reorder');
  const [nestTargetTaskId, setNestTargetTaskId] = useState<string | null>(null);

  const tableRef = useRef<HTMLTableElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 仮ID → 実IDのマッピング
  const tempIdMapRef = useRef<Map<string, string>>(new Map());

  // 表示中の年月
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());
  const [displayMonth, setDisplayMonth] = useState(new Date().getMonth() + 1);

  // カレンダー開始位置（現在月の1ヶ月前から24ヶ月分）
  const calendarStart = useMemo(() => {
    const now = new Date();
    let startMonth = now.getMonth();
    let startYear = now.getFullYear();
    if (startMonth < 0) {
      startMonth += 12;
      startYear -= 1;
    }
    return { year: startYear, month: startMonth + 1 };
  }, []);

  // 24ヶ月分の日付を生成
  const calendarDays = useMemo(() =>
    generateCalendarDays(calendarStart.year, calendarStart.month, 24),
    [calendarStart.year, calendarStart.month]
  );

  // 各月の祝日をキャッシュ
  const holidaysMap = useMemo(() => {
    const map = new Map<string, Map<number, string>>();
    let currentYear = calendarStart.year;
    let currentMonth = calendarStart.month;
    for (let m = 0; m < 24; m++) {
      const key = `${currentYear}-${currentMonth}`;
      map.set(key, getHolidaysForMonth(currentYear, currentMonth));
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }
    return map;
  }, [calendarStart.year, calendarStart.month]);

  // 今日へスクロール
  const scrollToToday = useCallback(() => {
    if (scrollContainerRef.current && calendarDays.length > 0) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todayIndex = calendarDays.findIndex(d => d.dateStr === todayStr);
      if (todayIndex >= 0) {
        const dayColumnWidth = 53;
        const offset = 240; // タスク列 + 担当者列
        scrollContainerRef.current.scrollLeft = Math.max(0, todayIndex * dayColumnWidth - offset);
      }
    }
  }, [calendarDays]);

  // データ取得
  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const projectData = await projectApi.get(projectId);
      setProject(projectData.project);
      setMembers(projectData.project.members || []);
      const flattenedTasks = flattenTasks(projectData.project.tasks || []);
      setTasks(flattenedTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  // スクロールで表示月を更新
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const dayColumnWidth = 53;
    const offset = 240;
    const visibleDayIndex = Math.floor((scrollLeft + offset) / dayColumnWidth);
    const clampedIndex = Math.max(0, Math.min(visibleDayIndex, calendarDays.length - 1));
    const visibleDay = calendarDays[clampedIndex];
    if (visibleDay && (visibleDay.year !== displayYear || visibleDay.month !== displayMonth)) {
      setDisplayYear(visibleDay.year);
      setDisplayMonth(visibleDay.month);
    }
  }, [calendarDays, displayYear, displayMonth]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // 初期スクロール位置を今日に設定
  useEffect(() => {
    if (!loading && scrollContainerRef.current && calendarDays.length > 0) {
      scrollToToday();
    }
  }, [loading, calendarDays, scrollToToday]);

  // Enterキーで次のタスクを編集
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !editingTaskId && lastSavedTaskId) {
        e.preventDefault();
        const lastSavedIndex = tasks.findIndex(t => t.id === lastSavedTaskId);
        if (lastSavedIndex !== -1) {
          let nextIndex = lastSavedIndex + 1;
          while (nextIndex < tasks.length && tasks[nextIndex].isCompleted) {
            nextIndex++;
          }
          if (nextIndex < tasks.length) {
            const targetTask = tasks[nextIndex];
            setEditingTaskId(targetTask.id);
            setLastSavedTaskId(null);
          } else {
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

  useEffect(() => {
    if (shouldAddNewTask) {
      setShouldAddNewTask(false);
      handleAddTask();
    }
  }, [shouldAddNewTask]);

  // タスク追加（楽観的UI: API待ち前に表示）
  const handleAddTask = async () => {
    const tempId = `temp-${Date.now()}`;
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.displayOrder)) : 0;
    const newTask: ProjectTask = {
      id: tempId,
      projectId,
      name: '',
      displayOrder: maxOrder + 1,
      isCompleted: false,
      level: 0,
      startDate: null,
      endDate: null,
      memberId: null,
      parentId: null,
      children: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 即座に画面に追加
    setTasks(prev => [...prev, newTask]);
    setEditingTaskId(tempId);

    // バックグラウンドでAPI呼び出し
    try {
      const result = await projectApi.createTask(projectId, {
        name: '',
        displayOrder: maxOrder + 1,
      });
      // 仮ID→実IDのマッピングを保存
      tempIdMapRef.current.set(tempId, result.task.id);
      // 仮IDを実際のIDに置換（editingTaskIdは変更しない - 入力中のため）
      setTasks(prev => prev.map(t => t.id === tempId ? { ...result.task, level: 0 } : t));
    } catch (err) {
      // 失敗時は仮タスクを削除
      setTasks(prev => prev.filter(t => t.id !== tempId));
      setEditingTaskId(null);
      setError(err instanceof Error ? err.message : 'タスクの追加に失敗しました');
    }
  };

  // タスク名保存（楽観的UI: 即座に画面更新、APIはバックグラウンド）
  const handleSaveTaskName = useCallback(async (taskId: string, name: string) => {
    // 即座に画面を更新
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, name } : t));
    setEditingTaskId(null);
    setLastSavedTaskId(taskId);

    // バックグラウンドでAPI呼び出し
    const saveToServer = async () => {
      // 仮IDの場合は実IDを待つ
      if (taskId.startsWith('temp-') && !tempIdMapRef.current.has(taskId)) {
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (tempIdMapRef.current.has(taskId)) break;
        }
      }

      const finalId = tempIdMapRef.current.get(taskId) || taskId;
      if (finalId.startsWith('temp-')) return; // まだ解決されていない

      try {
        await projectApi.updateTask(projectId, finalId, { name });
        // IDが変わった場合はタスクリストを更新
        if (finalId !== taskId) {
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, id: finalId, name } : t));
        }
        tempIdMapRef.current.delete(taskId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'タスク名の保存に失敗しました');
      }
    };

    saveToServer();
  }, [projectId]);

  // 編集キャンセル
  const handleCancelEdit = useCallback(() => {
    setEditingTaskId(null);
  }, []);

  // チェックボックス
  const handleToggleAllTasks = () => {
    if (checkedTasks.size === tasks.length) {
      setCheckedTasks(new Set());
    } else {
      setCheckedTasks(new Set(tasks.map(t => t.id)));
    }
  };

  const handleToggleTaskCheck = (taskId: string, e: React.MouseEvent) => {
    const newChecked = new Set(checkedTasks);

    if (e.shiftKey && lastCheckedTaskId) {
      const lastIndex = tasks.findIndex(t => t.id === lastCheckedTaskId);
      const currentIndex = tasks.findIndex(t => t.id === taskId);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        for (let i = start; i <= end; i++) {
          newChecked.add(tasks[i].id);
        }
        setCheckedTasks(newChecked);
        return;
      }
    }

    if (newChecked.has(taskId)) {
      newChecked.delete(taskId);
    } else {
      newChecked.add(taskId);
    }
    setCheckedTasks(newChecked);
    setLastCheckedTaskId(taskId);
  };

  // 完了切り替え
  const handleCompleteSelected = async () => {
    if (checkedTasks.size === 0) return;
    const checkedTaskObjects = tasks.filter(t => checkedTasks.has(t.id));
    const allCompleted = checkedTaskObjects.every(t => t.isCompleted);
    const newIsCompleted = !allCompleted;

    setTasks(prev => prev.map(t =>
      checkedTasks.has(t.id) ? { ...t, isCompleted: newIsCompleted } : t
    ));

    try {
      await Promise.all(
        Array.from(checkedTasks).map(id =>
          projectApi.updateTask(projectId, id, { isCompleted: newIsCompleted })
        )
      );
      setCheckedTasks(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : '完了状態の更新に失敗しました');
      fetchData();
    }
  };

  // 削除
  const handleBulkDelete = async () => {
    if (checkedTasks.size === 0) return;
    if (!confirm(`${checkedTasks.size}件のタスクを削除しますか？`)) return;

    setTasks(prev => prev.filter(t => !checkedTasks.has(t.id)));

    try {
      await projectApi.bulkDeleteTasks(projectId, Array.from(checkedTasks));
      setCheckedTasks(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの削除に失敗しました');
      fetchData();
    }
  };

  // 日付範囲内判定
  const isDateInRange = (task: ProjectTask, dateStr: string): boolean => {
    if (!task.startDate || !task.endDate) return false;
    return dateStr >= task.startDate && dateStr <= task.endDate;
  };

  // 日付クリック
  const handleCellClick = async (taskId: string, dateStr: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.isCompleted) return;

    const currentStartDate = selectedStartDate[taskId];

    // 既に確定した範囲内をクリックした場合はクリア
    if (task && isDateInRange(task, dateStr) && (currentStartDate === null || currentStartDate === undefined)) {
      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId ? { ...t, startDate: null, endDate: null } : t
      ));
      try {
        await projectApi.updateTask(projectId, taskId, { startDate: null, endDate: null });
      } catch (err) {
        setError(err instanceof Error ? err.message : '日付のクリアに失敗しました');
      }
      return;
    }

    if (currentStartDate === null || currentStartDate === undefined) {
      // 開始日を選択
      setSelectedStartDate({ ...selectedStartDate, [taskId]: dateStr });
    } else {
      // 終了日を選択
      if (dateStr < currentStartDate) return;

      const startDateStr = currentStartDate;
      const endDateStr = dateStr;

      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId ? { ...t, startDate: startDateStr, endDate: endDateStr } : t
      ));
      setSelectedStartDate({ ...selectedStartDate, [taskId]: null });
      setHoverDate({ ...hoverDate, [taskId]: null });

      try {
        await projectApi.updateTask(projectId, taskId, { startDate: startDateStr, endDate: endDateStr });
      } catch (err) {
        setError(err instanceof Error ? err.message : '日付の更新に失敗しました');
        fetchData();
      }
    }
  };

  // 担当者変更
  const handleMemberChange = async (taskId: string, memberId: string | null) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, memberId } : t));
    try {
      await projectApi.updateTask(projectId, taskId, { memberId });
    } catch (err) {
      setError(err instanceof Error ? err.message : '担当者の更新に失敗しました');
      fetchData();
    }
  };

  // ドラッグ&ドロップ
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTaskId || !tableRef.current) return;

    const tbody = tableRef.current.querySelector('tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr[data-task-id]'));
    const mouseY = e.clientY;

    let foundTarget = false;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const taskId = row.getAttribute('data-task-id');
      if (!taskId || taskId === draggedTaskId) continue;

      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        const relativeY = mouseY - rect.top;
        const rowHeight = rect.height;

        if (relativeY < rowHeight * 0.3) {
          setDragOverTaskId(taskId);
          setDragOverBottom(false);
          setDragMode('reorder');
          setNestTargetTaskId(null);
        } else if (relativeY < rowHeight * 0.7) {
          setDragOverTaskId(null);
          setDragOverBottom(false);
          setDragMode('nest');
          setNestTargetTaskId(taskId);
        } else {
          setDragOverTaskId(taskId);
          setDragOverBottom(false);
          setDragMode('reorder');
          setNestTargetTaskId(null);
        }
        foundTarget = true;
        break;
      }
    }

    if (!foundTarget) {
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        const rect = lastRow.getBoundingClientRect();
        if (mouseY > rect.bottom) {
          setDragOverTaskId(null);
          setDragOverBottom(true);
          setDragMode('reorder');
          setNestTargetTaskId(null);
        }
      }
    }
  };

  const handleDragLeave = () => {
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setNestTargetTaskId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId?: string) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    const currentDragMode = dragMode;
    const currentNestTarget = nestTargetTaskId;
    const isDropToBottom = dragOverBottom;

    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);

    // 階層化モード
    if (currentDragMode === 'nest' && currentNestTarget) {
      setTasks(prevTasks => {
        const newTasks = [...prevTasks];
        const draggedIndex = newTasks.findIndex(t => t.id === draggedTaskId);
        const targetIndex = newTasks.findIndex(t => t.id === currentNestTarget);
        if (draggedIndex === -1 || targetIndex === -1) return prevTasks;

        const draggedTask = newTasks[draggedIndex];
        draggedTask.parentId = currentNestTarget;
        draggedTask.level = (newTasks[targetIndex].level ?? 0) + 1;

        newTasks.splice(draggedIndex, 1);
        const newTargetIndex = newTasks.findIndex(t => t.id === currentNestTarget);
        newTasks.splice(newTargetIndex + 1, 0, draggedTask);

        return newTasks;
      });

      setDraggedTaskId(null);
      projectApi.updateTask(projectId, draggedTaskId, { parentId: currentNestTarget }).catch(err => {
        setError(err instanceof Error ? err.message : '階層の変更に失敗しました');
        fetchData();
      });
      return;
    }

    // 最後に移動
    if (isDropToBottom) {
      const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
      if (draggedIndex === -1 || draggedIndex === tasks.length - 1) {
        setDraggedTaskId(null);
        return;
      }

      const newTasks = [...tasks];
      const [movedTask] = newTasks.splice(draggedIndex, 1);
      newTasks.push(movedTask);

      const updatePromises: Promise<any>[] = [];
      for (let i = 0; i < newTasks.length; i++) {
        if (newTasks[i].displayOrder !== i + 1) {
          newTasks[i] = { ...newTasks[i], displayOrder: i + 1 };
          updatePromises.push(projectApi.updateTask(projectId, newTasks[i].id, { displayOrder: i + 1 }));
        }
      }

      setTasks(newTasks);
      setDraggedTaskId(null);
      await Promise.all(updatePromises);
      return;
    }

    const effectiveTargetId = targetTaskId || dragOverTaskId;
    if (!effectiveTargetId || draggedTaskId === effectiveTargetId) {
      setDraggedTaskId(null);
      return;
    }

    const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
    const targetIndex = tasks.findIndex(t => t.id === effectiveTargetId);
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTaskId(null);
      return;
    }

    const newTasks = [...tasks];
    const [movedTask] = newTasks.splice(draggedIndex, 1);
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newTasks.splice(adjustedTargetIndex, 0, movedTask);

    const updatePromises: Promise<any>[] = [];
    for (let i = 0; i < newTasks.length; i++) {
      if (newTasks[i].displayOrder !== i + 1) {
        newTasks[i] = { ...newTasks[i], displayOrder: i + 1 };
        updatePromises.push(projectApi.updateTask(projectId, newTasks[i].id, { displayOrder: i + 1 }));
      }
    }

    setTasks(newTasks);
    setDraggedTaskId(null);
    await Promise.all(updatePromises);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="text-blue-600 hover:text-blue-800 flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                プロジェクト一覧
              </button>
              <h1 className="text-xl font-bold text-gray-900">{project?.name || 'プロジェクト'}</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-gray-800">{displayYear}年{displayMonth}月</span>
              <button onClick={scrollToToday} className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 rounded text-blue-700">
                今日
              </button>
              <button
                onClick={onNavigateToSettings}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded"
                title="設定"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">✕</button>
          </div>
        )}

        {/* アクションボタン */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <button
            onMouseDown={(e) => { e.preventDefault(); handleAddTask(); }}
            className="px-4 py-2 bg-[#5B9BD5] text-white rounded-md hover:bg-[#4A8AC9] text-sm font-medium shadow-sm"
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
                className={`px-4 py-2 text-white rounded-md text-sm font-medium shadow-sm ${
                  checkedTasks.size === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {allCheckedCompleted ? '↶ 未完了に戻す' : '✓ 完了'} ({checkedTasks.size})
              </button>
            );
          })()}
          <button
            onClick={handleBulkDelete}
            disabled={checkedTasks.size === 0}
            className={`px-4 py-2 text-white rounded-md text-sm font-medium shadow-sm ${
              checkedTasks.size === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            削除 ({checkedTasks.size})
          </button>
        </div>

        {/* テーブル */}
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
                <th className="px-2 py-2 text-xs font-medium bg-[#5B9BD5] text-white sticky left-[140px] z-30 w-[100px] min-w-[100px]" style={{ boxShadow: '1px 0 0 0 #d1d5db' }}>
                  担当者
                </th>
                {calendarDays.map((calDay, idx) => {
                  const date = new Date(calDay.year, calDay.month - 1, calDay.day);
                  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
                  const isSunday = date.getDay() === 0;
                  const isSaturday = date.getDay() === 6;
                  const holidaysForMonth = holidaysMap.get(`${calDay.year}-${calDay.month}`);
                  const holidayName = holidaysForMonth?.get(calDay.day);
                  const isHoliday = !!holidayName;
                  const isNonWorkday = isSunday || isSaturday || isHoliday;

                  const today = new Date();
                  const isToday = calDay.year === today.getFullYear() &&
                                  calDay.month === today.getMonth() + 1 &&
                                  calDay.day === today.getDate();

                  return (
                    <th
                      key={idx}
                      className={`border-r border-gray-200 px-1 py-2 text-xs font-medium w-[53px] min-w-[53px] ${isNonWorkday ? 'bg-[#6BA8D9]' : 'bg-[#5B9BD5]'} text-white ${calDay.isFirstDayOfMonth ? 'border-l-2 border-l-white' : ''}`}
                      title={holidayName || `${calDay.year}/${calDay.month}/${calDay.day}`}
                    >
                      {calDay.isFirstDayOfMonth && (
                        <div className="text-[9px] text-white/80 -mb-0.5">{calDay.month}月</div>
                      )}
                      <div className={`font-semibold ${isHoliday ? 'text-red-200' : ''} ${isToday ? 'bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center mx-auto' : ''}`}>
                        {calDay.day}
                      </div>
                      <div className={`text-[10px] ${isSunday || isHoliday ? 'text-red-200' : isSaturday ? 'text-blue-200' : 'text-white/70'}`}>{dayOfWeek}</div>
                      {isHoliday && <div className="text-[8px] text-red-200">祝</div>}
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
                const taskStartDate = selectedStartDate[task.id];
                const taskHoverDate = hoverDate[task.id];
                const isChecked = checkedTasks.has(task.id);

                const selectingTaskId = Object.keys(selectedStartDate).find(
                  id => selectedStartDate[id] !== null && selectedStartDate[id] !== undefined
                );
                const isOtherTaskSelecting = selectingTaskId && selectingTaskId !== task.id;

                const isCompletedTask = task.isCompleted;
                const rowBgClass = isCompletedTask ? 'bg-gray-100' : 'bg-white';
                const textColorClass = isCompletedTask ? 'text-gray-400' : '';

                const isDragging = draggedTaskId === task.id;
                const isDragOver = dragOverTaskId === task.id;
                const isLastRow = index === tasks.length - 1;
                const showBottomBorder = isLastRow && dragOverBottom;
                const isNestTarget = nestTargetTaskId === task.id && dragMode === 'nest';
                const taskLevel = task.level ?? 0;
                const isUnnestMode = dragMode === 'unnest' && draggedTaskId === task.id;

                // 担当者情報
                const taskMember = task.memberId ? members.find(m => m.id === task.memberId) : null;
                const memberColor = taskMember?.color || null;

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
                        paddingLeft: `${8 + taskLevel * 16}px`,
                        boxShadow: '1px 0 0 0 #e5e7eb'
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {!isCompletedTask && (
                          <span className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0" title="ドラッグして並び替え">
                            ⋮⋮
                          </span>
                        )}
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onClick={(e) => handleToggleTaskCheck(task.id, e)}
                          onChange={() => {}}
                          className="w-4 h-4 cursor-pointer flex-shrink-0"
                        />
                        {editingTaskId === task.id ? (
                          <TaskNameInput
                            taskId={task.id}
                            initialName={task.name}
                            onSave={handleSaveTaskName}
                            onCancel={handleCancelEdit}
                          />
                        ) : (
                          <div
                            onClick={() => setEditingTaskId(task.id)}
                            className="cursor-text min-h-[20px] flex items-center flex-1 min-w-0 overflow-hidden"
                          >
                            <span className="truncate">
                              {task.name || <span className="text-gray-400">タスク名</span>}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td
                      className={`border-b border-gray-200 px-1 py-1 text-center sticky left-[140px] z-10 w-[100px] min-w-[100px]`}
                      style={{
                        boxShadow: '1px 0 0 0 #e5e7eb',
                        backgroundColor: memberColor || (isCompletedTask ? '#f3f4f6' : '#ffffff'),
                      }}
                    >
                      <select
                        value={task.memberId || ''}
                        onChange={(e) => handleMemberChange(task.id, e.target.value || null)}
                        disabled={isCompletedTask}
                        className="w-full px-0.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        style={{ backgroundColor: memberColor ? 'rgba(255,255,255,0.8)' : 'white' }}
                      >
                        <option value="">--</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                    {calendarDays.map((calDay, idx) => {
                      const dateStr = calDay.dateStr;
                      const date = new Date(calDay.year, calDay.month - 1, calDay.day);
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      const holidaysForMonth = holidaysMap.get(`${calDay.year}-${calDay.month}`);
                      const isHoliday = !!holidaysForMonth?.get(calDay.day);
                      const isNonWorkday = isWeekend || isHoliday;
                      const inRange = isDateInRange(task, dateStr);
                      const isStartDay = taskStartDate === dateStr;

                      const isSelectingEndDay = taskStartDate !== null && taskStartDate !== undefined;
                      const isBeforeStartDay = isSelectingEndDay && dateStr < taskStartDate;

                      const isInPreviewRange =
                        isSelectingEndDay &&
                        taskHoverDate !== null &&
                        taskHoverDate !== undefined &&
                        taskHoverDate >= taskStartDate &&
                        dateStr >= taskStartDate &&
                        dateStr <= taskHoverDate;

                      const isRangeStart = inRange && task.startDate === dateStr;
                      const isRangeEnd = inRange && task.endDate === dateStr;

                      const isCellDisabled = isCompletedTask || !!isOtherTaskSelecting || isBeforeStartDay;

                      // バーの色（担当者色またはデフォルト）
                      const barColor = memberColor || '#85c1e9';

                      return (
                        <td
                          key={idx}
                          className={`border-b border-r border-gray-200 px-0.5 py-1 text-center w-[53px] min-w-[53px] ${
                            isNonWorkday ? 'bg-gray-100' : ''
                          } ${
                            isCellDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                          } ${calDay.isFirstDayOfMonth ? 'border-l-2 border-l-gray-300' : ''}`}
                          onClick={() => !isCellDisabled && handleCellClick(task.id, dateStr)}
                          onMouseEnter={() => !isCellDisabled && setHoverDate({ ...hoverDate, [task.id]: dateStr })}
                          onMouseLeave={() => !isCellDisabled && setHoverDate({ ...hoverDate, [task.id]: null })}
                        >
                          <div
                            className={`h-5 ${
                              isCompletedTask ? 'bg-gray-50' : ''
                            } ${
                              !isCompletedTask && isStartDay
                                ? 'rounded animate-pulse'
                                : !isCompletedTask && isInPreviewRange
                                ? 'rounded animate-pulse'
                                : !isCompletedTask && inRange
                                ? `${isRangeStart ? 'rounded-l' : ''} ${isRangeEnd ? 'rounded-r' : ''}`
                                : ''
                            }`}
                            style={
                              !isCompletedTask && (isStartDay || isInPreviewRange || inRange)
                                ? { backgroundColor: barColor }
                                : undefined
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {tasks.length === 0 && (
                <tr>
                  <td
                    colSpan={calendarDays.length + 2}
                    className="border border-gray-300 px-4 py-8 text-center text-gray-500"
                  >
                    タスクがありません。「タスク追加」ボタンから追加してください。
                  </td>
                </tr>
              )}
              <tr
                onClick={() => {
                  setEditingTaskId(null);
                  setTimeout(() => handleAddTask(), 0);
                }}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td
                  colSpan={calendarDays.length + 2}
                  className="border-b border-r border-gray-200 px-4 py-3 text-center text-gray-400 text-sm"
                >
                  + クリックしてタスクを追加
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
