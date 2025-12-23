import { useState, useEffect, useRef, useMemo } from 'react';
import { projectApi } from '../services/api';
import type { ProjectTask, ProjectDetail, ProjectMember } from '../types';
import { getHolidaysForMonth } from '../utils/holidays';

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

interface ProjectPageProps {
  projectId: string;
  onBack: () => void;
  onNavigateToSettings: () => void;
}

export function ProjectPage({ projectId, onBack, onNavigateToSettings }: ProjectPageProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStartDays, setSelectedStartDays] = useState<Record<string, number | null>>({});
  const [hoverDays, setHoverDays] = useState<Record<string, number | null>>({});
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [lastCheckedTaskId, setLastCheckedTaskId] = useState<string | null>(null);
  const [copiedTasks, setCopiedTasks] = useState<ProjectTask[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverBottom, setDragOverBottom] = useState(false);
  const [dragMode, setDragMode] = useState<'reorder' | 'nest' | 'unnest'>('reorder');
  const [nestTargetTaskId, setNestTargetTaskId] = useState<string | null>(null);
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
      const data = await projectApi.get(projectId);
      setProject(data.project);
      setMembers(data.project.members || []);
      const flattenedTasks = flattenTasks(data.project.tasks || []);
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

  // 月移動
  const goToPreviousMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  // タスク追加
  const handleAddTask = async () => {
    try {
      const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.displayOrder)) : 0;
      await projectApi.createTask(projectId, {
        name: '',
        displayOrder: maxOrder + 1,
      });
      await fetchData(false);

      // 新しいタスクを編集モードにする
      setTimeout(() => {
        const newTask = tasks[tasks.length - 1];
        if (newTask) {
          setEditingTaskId(newTask.id);
          setEditingTaskName('');
        }
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの追加に失敗しました');
    }
  };

  // タスク名編集開始
  const handleStartEditTaskName = (taskId: string, name: string) => {
    setEditingTaskId(taskId);
    setEditingTaskName(name);
  };

  // タスク名保存
  const handleSaveTaskName = async (taskId: string) => {
    const trimmedName = editingTaskName.trim();
    if (!trimmedName) {
      setEditingTaskId(null);
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.name === trimmedName) {
      setEditingTaskId(null);
      return;
    }

    setEditingTaskId(null);

    try {
      await projectApi.updateTask(projectId, taskId, { name: trimmedName });
      await fetchData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスク名の更新に失敗しました');
    }
  };

  // 編集キャンセル
  const handleCancelEditTaskName = () => {
    setEditingTaskId(null);
    setEditingTaskName('');
  };

  // チェック処理
  const handleToggleTaskCheck = (taskId: string, e: React.MouseEvent) => {
    const task = tasks.find(t => t.id === taskId);
    if (task?.isCompleted) return; // 完了済みは選択不可

    const newCheckedTasks = new Set(checkedTasks);

    if (e.shiftKey && lastCheckedTaskId) {
      const lastIndex = tasks.findIndex(t => t.id === lastCheckedTaskId);
      const currentIndex = tasks.findIndex(t => t.id === taskId);
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);

      for (let i = start; i <= end; i++) {
        if (!tasks[i].isCompleted) {
          newCheckedTasks.add(tasks[i].id);
        }
      }
    } else {
      if (newCheckedTasks.has(taskId)) {
        newCheckedTasks.delete(taskId);
      } else {
        newCheckedTasks.add(taskId);
      }
    }

    setCheckedTasks(newCheckedTasks);
    setLastCheckedTaskId(taskId);
  };

  // 全選択/解除
  const handleToggleAllTasks = () => {
    const incompleteTasks = tasks.filter(t => !t.isCompleted);
    if (checkedTasks.size === incompleteTasks.length) {
      setCheckedTasks(new Set());
    } else {
      setCheckedTasks(new Set(incompleteTasks.map(t => t.id)));
    }
  };

  // 選択削除
  const handleDeleteSelected = async () => {
    if (checkedTasks.size === 0) return;
    if (!confirm(`${checkedTasks.size}件のタスクを削除しますか？`)) return;

    try {
      await projectApi.bulkDeleteTasks(projectId, Array.from(checkedTasks));
      setCheckedTasks(new Set());
      await fetchData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの削除に失敗しました');
    }
  };

  // 完了処理
  const handleCompleteSelected = async () => {
    if (checkedTasks.size === 0) return;

    const checkedTaskObjects = tasks.filter(t => checkedTasks.has(t.id));
    const allCheckedCompleted = checkedTaskObjects.every(t => t.isCompleted);
    const newCompletedStatus = !allCheckedCompleted;

    try {
      for (const taskId of checkedTasks) {
        await projectApi.updateTask(projectId, taskId, { isCompleted: newCompletedStatus });
      }
      setCheckedTasks(new Set());
      await fetchData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの更新に失敗しました');
    }
  };

  // メンバー変更
  const handleMemberChange = async (taskId: string, memberId: string | null) => {
    try {
      await projectApi.updateTask(projectId, taskId, { memberId });
      await fetchData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メンバーの更新に失敗しました');
    }
  };

  // 日付範囲選択
  const handleDayCellClick = async (taskId: string, day: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.isCompleted) return;

    const taskStartDay = selectedStartDays[taskId];

    if (taskStartDay === null || taskStartDay === undefined) {
      setSelectedStartDays({ ...selectedStartDays, [taskId]: day });
    } else {
      const startDay = Math.min(taskStartDay, day);
      const endDay = Math.max(taskStartDay, day);

      const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

      try {
        await projectApi.updateTask(projectId, taskId, {
          startDate: startDateStr,
          endDate: endDateStr,
        });
        setSelectedStartDays({ ...selectedStartDays, [taskId]: null });
        setHoverDays({ ...hoverDays, [taskId]: null });
        await fetchData(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '日付の更新に失敗しました');
      }
    }
  };

  // ホバー
  const handleDayCellHover = (taskId: string, day: number | null) => {
    if (selectedStartDays[taskId] !== null && selectedStartDays[taskId] !== undefined) {
      setHoverDays({ ...hoverDays, [taskId]: day });
    }
  };

  // タスクが特定の日に範囲を持っているか
  const getTaskDayStatus = (task: ProjectTask, day: number) => {
    const taskStartDay = selectedStartDays[task.id];
    const taskHoverDay = hoverDays[task.id];

    // 選択中の範囲
    if (taskStartDay !== null && taskStartDay !== undefined) {
      if (taskHoverDay !== null && taskHoverDay !== undefined) {
        const start = Math.min(taskStartDay, taskHoverDay);
        const end = Math.max(taskStartDay, taskHoverDay);
        if (day >= start && day <= end) {
          return 'selecting';
        }
      } else if (day === taskStartDay) {
        return 'selecting';
      }
    }

    // 保存済みの範囲
    if (task.startDate && task.endDate) {
      const startDate = new Date(task.startDate);
      const endDate = new Date(task.endDate);
      const currentDate = new Date(year, month - 1, day);

      if (currentDate >= startDate && currentDate <= endDate) {
        return 'saved';
      }
    }

    return null;
  };

  // ドラッグ&ドロップ
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task?.isCompleted) {
      e.preventDefault();
      return;
    }
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    const target = (e.target as HTMLElement).closest('tr');
    if (target) {
      const taskId = target.getAttribute('data-task-id');
      if (taskId && taskId !== draggedTaskId) {
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;

        if (x < width * 0.2) {
          setDragMode('nest');
          setNestTargetTaskId(taskId);
        } else if (x > width * 0.8) {
          setDragMode('unnest');
          setNestTargetTaskId(null);
        } else {
          setDragMode('reorder');
          setNestTargetTaskId(null);
        }

        setDragOverTaskId(taskId);
        setDragOverBottom(false);
      }
    }
  };

  const handleDragLeave = () => {
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId?: string) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    const targetTask = targetTaskId ? tasks.find(t => t.id === targetTaskId) : null;
    if (targetTask?.isCompleted) {
      handleDragEnd();
      return;
    }

    try {
      if (targetTaskId && targetTaskId !== draggedTaskId) {
        if (dragMode === 'nest') {
          await projectApi.updateTask(projectId, draggedTaskId, { parentId: targetTaskId });
        } else if (dragMode === 'unnest') {
          await projectApi.updateTask(projectId, draggedTaskId, { parentId: null });
        } else {
          const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
          const targetIndex = tasks.findIndex(t => t.id === targetTaskId);
          const newOrder = targetIndex < draggedIndex
            ? tasks[targetIndex].displayOrder
            : tasks[targetIndex].displayOrder + 1;
          await projectApi.updateTask(projectId, draggedTaskId, { displayOrder: newOrder });
        }
        await fetchData(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '並び替えに失敗しました');
    }

    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);
  };

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && checkedTasks.size > 0) {
        setCopiedTasks(tasks.filter(t => checkedTasks.has(t.id)));
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedTasks.length > 0) {
        handlePasteTasks();
      }

      if (e.key === 'Delete' && checkedTasks.size > 0 && !editingTaskId) {
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [checkedTasks, copiedTasks, tasks, editingTaskId]);

  const handlePasteTasks = async () => {
    try {
      const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.displayOrder)) : 0;
      for (let i = 0; i < copiedTasks.length; i++) {
        await projectApi.createTask(projectId, {
          name: copiedTasks[i].name + ' (コピー)',
          displayOrder: maxOrder + i + 1,
          memberId: copiedTasks[i].memberId,
        });
      }
      await fetchData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ペーストに失敗しました');
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
              <button
                onClick={onBack}
                className="px-4 py-2 bg-white/20 text-white rounded-md hover:bg-white/30 transition-colors text-sm font-medium"
              >
                ← 戻る
              </button>
              <h1 className="text-2xl font-bold text-white tracking-wide">
                {project?.name || 'プロジェクト'}
              </h1>
            </div>
            <button
              onClick={onNavigateToSettings}
              className="px-4 py-2 bg-white/20 text-white rounded-md hover:bg-white/30 transition-colors text-sm font-medium"
            >
              設定
            </button>
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
                e.preventDefault();
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
              onClick={handleDeleteSelected}
              disabled={checkedTasks.size === 0}
              className={`px-4 py-2 text-white rounded-md transition-colors text-sm font-medium shadow-sm ${
                checkedTasks.size === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              🗑 削除 ({checkedTasks.size})
            </button>
            <button
              disabled={copiedTasks.length === 0}
              onClick={handlePasteTasks}
              className={`px-4 py-2 text-white rounded-md transition-colors text-sm font-medium shadow-sm ${
                copiedTasks.length === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-[#5B9BD5] hover:bg-[#4A8AC9]'
              }`}
            >
              貼り付け
            </button>
          </div>

          <div ref={scrollContainerRef} className="overflow-x-auto overflow-y-auto rounded-lg border border-gray-200 whitespace-nowrap" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            <table ref={tableRef} className="border-collapse inline-block align-top">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="px-2 py-3 bg-[#5B9BD5] text-white sticky left-0 z-30 w-[180px] min-w-[180px] font-medium" style={{ boxShadow: '1px 0 0 0 #d1d5db' }}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tasks.filter(t => !t.isCompleted).length > 0 && checkedTasks.size === tasks.filter(t => !t.isCompleted).length}
                        onChange={handleToggleAllTasks}
                        className="w-4 h-4 cursor-pointer accent-blue-500"
                        title="全選択/全解除"
                      />
                      <span className="text-sm">タスク</span>
                    </div>
                  </th>
                  <th className="px-2 py-2 text-xs font-medium bg-[#5B9BD5] text-white sticky left-[180px] z-30 w-[120px] min-w-[120px]" style={{ boxShadow: '1px 0 0 0 #d1d5db' }}>
                    メンバー
                  </th>
                  {days.map((day) => {
                    const date = new Date(year, month - 1, day);
                    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
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
                  const isChecked = checkedTasks.has(task.id);

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

                  const isNestTarget = nestTargetTaskId === task.id && dragMode === 'nest';
                  const taskLevel = task.level ?? 0;
                  const isUnnestMode = dragMode === 'unnest' && draggedTaskId === task.id;

                  const memberColor = task.member?.color || '#3B82F6';

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
                        className={`border-b border-gray-200 px-1 py-1 sticky left-0 ${isNestTarget ? 'bg-green-50' : isUnnestMode ? 'bg-amber-50' : rowBgClass} z-10 w-[180px] min-w-[180px] ${textColorClass}`}
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
                            disabled={isCompletedTask}
                            className="w-4 h-4 cursor-pointer flex-shrink-0 disabled:cursor-not-allowed"
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
                              onClick={() => !isCompletedTask && handleStartEditTaskName(task.id, task.name)}
                              className={`cursor-text min-h-[20px] flex items-center flex-1 min-w-0 overflow-hidden ${isCompletedTask ? 'line-through' : ''}`}
                            >
                              <span className="truncate">
                                {task.name || <span className="text-gray-400">タスク名</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`border-b border-gray-200 px-1 py-1 text-center sticky left-[180px] z-10 w-[120px] min-w-[120px] ${rowBgClass}`} style={{ boxShadow: '1px 0 0 0 #e5e7eb' }}>
                        <select
                          value={task.memberId || ''}
                          onChange={(e) => handleMemberChange(task.id, e.target.value || null)}
                          disabled={isCompletedTask}
                          className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: task.member?.color ? `${task.member.color}20` : undefined,
                          }}
                        >
                          <option value="">未設定</option>
                          {members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      {days.map((day) => {
                        const status = getTaskDayStatus(task, day);
                        const isSelecting = taskStartDay !== null && taskStartDay !== undefined;

                        let bgColor = '';
                        if (status === 'selecting') {
                          bgColor = isCompletedTask ? 'bg-gray-300' : '';
                        } else if (status === 'saved') {
                          bgColor = isCompletedTask ? 'bg-gray-300' : '';
                        }

                        const style: React.CSSProperties = {};
                        if (status === 'selecting' && !isCompletedTask) {
                          style.backgroundColor = memberColor;
                          style.opacity = 0.5;
                        } else if (status === 'saved') {
                          style.backgroundColor = isCompletedTask ? '#9CA3AF' : memberColor;
                        }

                        return (
                          <td
                            key={day}
                            className={`border-b border-r border-gray-200 w-[53px] min-w-[53px] h-[32px] ${bgColor} ${
                              !isCompletedTask && !isOtherTaskSelecting ? 'cursor-pointer hover:bg-gray-100' : ''
                            } ${isSelecting && !isCompletedTask ? 'animate-blink-bar' : ''}`}
                            style={style}
                            onClick={() => !isCompletedTask && !isOtherTaskSelecting && handleDayCellClick(task.id, day)}
                            onMouseEnter={() => !isCompletedTask && handleDayCellHover(task.id, day)}
                            onMouseLeave={() => !isCompletedTask && handleDayCellHover(task.id, null)}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
