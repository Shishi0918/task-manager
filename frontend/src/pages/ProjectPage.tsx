import { useState, useEffect, useMemo, useCallback } from 'react';
import { projectApi } from '../services/api';
import type { ProjectTask, ProjectDetail, ProjectMember } from '../types';
import { getHolidaysForMonth } from '../utils/holidays';
import { useTaskDragDrop } from '../hooks/useTaskDragDrop';
import { useTaskSelection } from '../hooks/useTaskSelection';

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
  dateStr: string; // "YYYY-MM-DD"
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

  // 日付選択状態（フル日付文字列で管理）
  const [selectedStartDate, setSelectedStartDate] = useState<Record<string, string | null>>({});
  const [hoverDate, setHoverDate] = useState<Record<string, string | null>>({});

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [lastSavedTaskId, setLastSavedTaskId] = useState<string | null>(null);
  const [shouldAddNewTask, setShouldAddNewTask] = useState(false);

  // 表示中の年月（スクロール位置から自動更新）
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());
  const [displayMonth, setDisplayMonth] = useState(new Date().getMonth() + 1);

  // カレンダー開始位置（現在月の1ヶ月前から24ヶ月分）
  const calendarStart = useMemo(() => {
    const now = new Date();
    let startMonth = now.getMonth(); // 0-indexed, 1ヶ月前
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
        scrollContainerRef.current.scrollLeft = todayIndex * dayColumnWidth;
      }
    }
  }, [calendarDays]);

  // タスク更新用の関数
  const handleUpdateTask = async (taskId: string, data: Partial<ProjectTask>): Promise<void> => {
    await projectApi.updateTask(projectId, taskId, data);
  };

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

  // ドラッグ&ドロップ フック
  const {
    draggedTaskId,
    dragOverTaskId,
    dragOverBottom,
    dragMode,
    nestTargetTaskId,
    tableRef,
    scrollContainerRef,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = useTaskDragDrop({
    tasks,
    setTasks,
    onUpdateTask: handleUpdateTask,
    onError: setError,
    onRefetch: fetchData,
  });

  // 選択フック
  const {
    checkedTasks,
    isAllSelected,
    handleToggleTask,
    handleToggleAllTasks,
    clearSelection,
  } = useTaskSelection(tasks);

  // スクロールで表示月を更新
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const dayColumnWidth = 53;
    const visibleDayIndex = Math.floor(scrollLeft / dayColumnWidth);
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
            setEditingTaskName(targetTask.name);
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

  // タスク追加
  const handleAddTask = async () => {
    try {
      const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.displayOrder)) : 0;
      const result = await projectApi.createTask(projectId, {
        name: '',
        displayOrder: maxOrder + 1,
      });
      setTasks(prev => [...prev, { ...result.task, level: 0 }]);
      setEditingTaskId(result.task.id);
      setEditingTaskName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの追加に失敗しました');
    }
  };

  // タスク名保存
  const handleSaveTaskName = async (taskId: string) => {
    try {
      await projectApi.updateTask(projectId, taskId, { name: editingTaskName });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, name: editingTaskName } : t));
      setLastSavedTaskId(taskId);
      setEditingTaskId(null);
      setEditingTaskName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスク名の保存に失敗しました');
    }
  };

  // 選択タスク完了/未完了切り替え
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
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : '完了状態の更新に失敗しました');
      fetchData();
    }
  };

  // 選択タスク削除
  const handleBulkDelete = async () => {
    if (checkedTasks.size === 0) return;
    if (!confirm(`${checkedTasks.size}件のタスクを削除しますか？`)) return;

    setTasks(prev => prev.filter(t => !checkedTasks.has(t.id)));

    try {
      await projectApi.bulkDeleteTasks(projectId, Array.from(checkedTasks));
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの削除に失敗しました');
      fetchData();
    }
  };

  // ソート
  const handleSortByStartDate = async () => {
    const sortHierarchically = (
      taskList: ProjectTask[],
      compareFn: (a: ProjectTask, b: ProjectTask) => number
    ): ProjectTask[] => {
      const rootTasks = taskList.filter(t => !t.parentId);
      const childrenMap = new Map<string, ProjectTask[]>();
      taskList.forEach(t => {
        if (t.parentId) {
          const children = childrenMap.get(t.parentId) || [];
          children.push(t);
          childrenMap.set(t.parentId, children);
        }
      });

      const sortAndFlatten = (tasksToSort: ProjectTask[]): ProjectTask[] => {
        const sorted = [...tasksToSort].sort(compareFn);
        const result: ProjectTask[] = [];
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

    const incompleteTasks = tasks.filter(t => !t.isCompleted);
    const completedTasks = tasks.filter(t => t.isCompleted);

    const sortedIncomplete = sortHierarchically(incompleteTasks, (a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.localeCompare(b.startDate);
    });

    const sortedCompleted = sortHierarchically(completedTasks, (a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.localeCompare(b.startDate);
    });

    const sortedTasks = [...sortedIncomplete, ...sortedCompleted];
    const updatePromises: Promise<void>[] = [];

    for (let i = 0; i < sortedTasks.length; i++) {
      if (sortedTasks[i].displayOrder !== i + 1) {
        sortedTasks[i] = { ...sortedTasks[i], displayOrder: i + 1 };
        updatePromises.push(handleUpdateTask(sortedTasks[i].id, { displayOrder: i + 1 }));
      }
    }

    setTasks(sortedTasks);
    await Promise.all(updatePromises);
  };

  // 日付クリック（日付選択）- dateStrを直接受け取る
  const handleDayClick = async (taskId: string, dateStr: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.isCompleted) return;

    const parentTask = task.parentId ? tasks.find(t => t.id === task.parentId) : null;
    if (parentTask) {
      if (parentTask.startDate && dateStr < parentTask.startDate) return;
      if (parentTask.endDate && dateStr > parentTask.endDate) return;
    }

    const startDateStr = selectedStartDate[taskId];

    if (!startDateStr) {
      // 開始日を選択
      setSelectedStartDate(prev => ({ ...prev, [taskId]: dateStr }));
    } else {
      // 終了日を選択
      const newStartDate = dateStr < startDateStr ? dateStr : startDateStr;
      const newEndDate = dateStr < startDateStr ? startDateStr : dateStr;

      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, startDate: newStartDate, endDate: newEndDate } : t));
      setSelectedStartDate(prev => ({ ...prev, [taskId]: null }));
      setHoverDate(prev => ({ ...prev, [taskId]: null }));

      try {
        await projectApi.updateTask(projectId, taskId, { startDate: newStartDate, endDate: newEndDate });
      } catch (err) {
        setError(err instanceof Error ? err.message : '日付の更新に失敗しました');
        fetchData();
      }
    }
  };

  const handleDayMouseEnter = (taskId: string, dateStr: string) => {
    if (selectedStartDate[taskId]) {
      setHoverDate(prev => ({ ...prev, [taskId]: dateStr }));
    }
  };

  const handleDayMouseLeave = (taskId: string) => {
    setHoverDate(prev => ({ ...prev, [taskId]: null }));
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-full mx-auto">
        {/* ヘッダー */}
        <div className="mb-4 flex items-center justify-between">
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
            <h1 className="text-xl font-bold text-gray-800">{project?.name || 'プロジェクト'}</h1>
          </div>
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

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">✕</button>
          </div>
        )}

        {/* 年月表示（スクロールで自動更新）+ 今日ボタン */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-xl font-bold text-gray-800">{displayYear}年{displayMonth}月</span>
          <button onClick={scrollToToday} className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 rounded text-blue-700">
            今日
          </button>
          <span className="text-xs text-gray-500">← 右スクロールで先の月を表示</span>
        </div>
        {/* デバッグ: カレンダー日数 */}
        <div className="mb-2 p-2 bg-yellow-200 text-black text-sm font-bold">
          DEBUG: calendarDays.length = {calendarDays.length} 日分生成済み |
          開始: {calendarDays[0]?.dateStr || 'なし'} |
          終了: {calendarDays[calendarDays.length - 1]?.dateStr || 'なし'} |
          右にスクロールすると先の月が見えます
        </div>

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
          <button
            onClick={handleSortByStartDate}
            className="px-4 py-2 bg-[#5B9BD5] text-white rounded-md hover:bg-[#4A8AC9] text-sm font-medium shadow-sm"
          >
            ソート
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
                      checked={isAllSelected}
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
            <tbody onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e)}>
              {tasks.map((task, index) => {
                const taskSelectedStart = selectedStartDate[task.id];
                const taskHoverDate = hoverDate[task.id];
                const isChecked = checkedTasks.has(task.id);
                const selectingTaskId = Object.keys(selectedStartDate).find(id => selectedStartDate[id] !== null);
                const isOtherTaskSelecting = selectingTaskId && selectingTaskId !== task.id;
                const isThisTaskSelecting = taskSelectedStart !== null && taskSelectedStart !== undefined;
                const isCompletedTask = task.isCompleted;
                const rowBgClass = isThisTaskSelecting ? 'bg-blue-50' : isCompletedTask ? 'bg-gray-100' : 'bg-white';
                const textColorClass = isCompletedTask ? 'text-gray-400' : '';
                const isDragging = draggedTaskId === task.id;
                const isDragOver = dragOverTaskId === task.id;
                const isLastRow = index === tasks.length - 1;
                const showBottomBorder = isLastRow && dragOverBottom;
                const isNestTarget = nestTargetTaskId === task.id && dragMode === 'nest';
                const taskLevel = task.level ?? 0;
                const isUnnestMode = dragMode === 'unnest' && draggedTaskId === task.id;

                // 担当者情報（行全体で使用）
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
                      style={{ paddingLeft: `${8 + taskLevel * 16}px`, boxShadow: '1px 0 0 0 #e5e7eb' }}
                    >
                      <div className="flex items-center gap-1">
                        {!isCompletedTask && (
                          <span className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0" title="ドラッグして並び替え">⋮⋮</span>
                        )}
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTask(task.id)}
                          onClick={(e) => handleToggleTask(task.id, e)}
                          className="w-3.5 h-3.5 cursor-pointer accent-blue-500 flex-shrink-0"
                        />
                        {editingTaskId === task.id ? (
                          <input
                            type="text"
                            value={editingTaskName}
                            onChange={(e) => setEditingTaskName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isComposing) {
                                e.preventDefault();
                                handleSaveTaskName(task.id);
                              } else if (e.key === 'Escape') {
                                setEditingTaskId(null);
                                setEditingTaskName('');
                              }
                            }}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                            onBlur={() => handleSaveTaskName(task.id)}
                            autoFocus
                            className="text-xs px-1 py-0.5 border border-blue-400 rounded w-full min-w-0 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        ) : (
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              onClick={() => { if (!isCompletedTask) { setEditingTaskId(task.id); setEditingTaskName(task.name); } }}
                              className={`text-xs truncate ${!isCompletedTask ? 'cursor-pointer hover:text-blue-600' : ''}`}
                              title={task.name}
                            >
                              {task.name || '(未入力)'}
                            </span>
                            {isThisTaskSelecting && (
                              <span
                                className="text-[10px] bg-blue-500 text-white px-1 rounded flex-shrink-0 cursor-pointer"
                                title={`開始: ${taskSelectedStart} - 終了日をクリック (キャンセル)`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStartDate(prev => ({ ...prev, [task.id]: null }));
                                }}
                              >
                                選択中
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td
                      className={`border-b border-gray-200 px-1 py-1 sticky left-[140px] z-10 w-[100px] min-w-[100px]`}
                      style={{
                        boxShadow: '1px 0 0 0 #e5e7eb',
                        backgroundColor: memberColor || (isCompletedTask ? '#f3f4f6' : isThisTaskSelecting ? '#eff6ff' : '#ffffff'),
                      }}
                    >
                      <select
                        value={task.memberId || ''}
                        onChange={(e) => handleMemberChange(task.id, e.target.value || null)}
                        disabled={isCompletedTask}
                        className="text-xs w-full px-1 py-0.5 border-0 rounded disabled:cursor-not-allowed font-medium"
                        style={{
                          backgroundColor: 'transparent',
                          color: memberColor ? '#000' : '#374151',
                        }}
                      >
                        <option value="" style={{ backgroundColor: 'white' }}>未割当</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id} style={{ backgroundColor: m.color || 'white' }}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                    {calendarDays.map((calDay, idx) => {
                      const dateStr = calDay.dateStr;
                      const hasStart = task.startDate && task.startDate <= dateStr;
                      const hasEnd = task.endDate && task.endDate >= dateStr;
                      const isInRange = hasStart && hasEnd;
                      const isStartDate = task.startDate === dateStr;
                      const isEndDate = task.endDate === dateStr;
                      const date = new Date(calDay.year, calDay.month - 1, calDay.day);
                      const isSunday = date.getDay() === 0;
                      const isSaturday = date.getDay() === 6;
                      const holidaysForMonth = holidaysMap.get(`${calDay.year}-${calDay.month}`);
                      const holidayName = holidaysForMonth?.get(calDay.day);
                      const isHoliday = !!holidayName;
                      const isNonWorkday = isSunday || isSaturday || isHoliday;

                      let isSelecting = false;
                      let isInSelectRange = false;
                      if (taskSelectedStart) {
                        isSelecting = dateStr === taskSelectedStart;
                        if (taskHoverDate) {
                          const rangeStart = taskSelectedStart < taskHoverDate ? taskSelectedStart : taskHoverDate;
                          const rangeEnd = taskSelectedStart < taskHoverDate ? taskHoverDate : taskSelectedStart;
                          isInSelectRange = dateStr >= rangeStart && dateStr <= rangeEnd;
                        }
                      }

                      const parentTask = task.parentId ? tasks.find(t => t.id === task.parentId) : null;
                      let isDisabled = isCompletedTask || !!isOtherTaskSelecting;
                      if (parentTask) {
                        if (parentTask.startDate && dateStr < parentTask.startDate) isDisabled = true;
                        if (parentTask.endDate && dateStr > parentTask.endDate) isDisabled = true;
                      }

                      const barColor = memberColor || '#5B9BD5';

                      return (
                        <td
                          key={idx}
                          className={`border-r border-b border-gray-200 w-[53px] min-w-[53px] h-8 p-0 ${isNonWorkday ? 'bg-gray-50' : rowBgClass} ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${calDay.isFirstDayOfMonth ? 'border-l-2 border-l-gray-300' : ''}`}
                          onClick={() => !isDisabled && handleDayClick(task.id, dateStr)}
                          onMouseEnter={() => handleDayMouseEnter(task.id, dateStr)}
                          onMouseLeave={() => handleDayMouseLeave(task.id)}
                        >
                          <div className="relative w-full h-full flex items-center justify-center">
                            {isInRange && (
                              <div
                                className="absolute top-1/2 -translate-y-1/2 h-4"
                                style={{
                                  backgroundColor: barColor,
                                  opacity: isCompletedTask ? 0.4 : 0.8,
                                  left: isStartDate ? '50%' : 0,
                                  right: isEndDate ? '50%' : 0,
                                }}
                              />
                            )}
                            {(isSelecting || isInSelectRange) && (
                              <div className="absolute inset-0 bg-blue-200 opacity-50" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
