import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { weeklyTaskApi, type WeeklyTaskSchedule, type WeeklyTask as ApiWeeklyTask } from '../services/api';

interface WeeklyTask {
  id: string;
  name: string;
  displayOrder: number;
  parentId?: string | null;
  level?: number;
  schedules: WeeklyTaskSchedule[];
  children?: ApiWeeklyTask[];
}

interface TimeInputModalProps {
  isOpen: boolean;
  dayOfWeek: number;
  initialStartTime: string;
  initialEndTime: string;
  onClose: () => void;
  onConfirm: (startTime: string, endTime: string) => void;
  onDelete: () => void;
  hasExistingSchedule: boolean;
}

const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

// 時間入力モーダルコンポーネント
const TimeInputModal = ({
  isOpen,
  dayOfWeek,
  initialStartTime,
  initialEndTime,
  onClose,
  onConfirm,
  onDelete,
  hasExistingSchedule,
}: TimeInputModalProps) => {
  const [startHour, setStartHour] = useState(9);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(10);
  const [endMinute, setEndMinute] = useState(0);

  useEffect(() => {
    if (initialStartTime) {
      const [h, m] = initialStartTime.split(':').map(Number);
      setStartHour(h);
      setStartMinute(m);
    } else {
      setStartHour(9);
      setStartMinute(0);
    }
    if (initialEndTime) {
      const [h, m] = initialEndTime.split(':').map(Number);
      setEndHour(h);
      setEndMinute(m);
    } else {
      setEndHour(10);
      setEndMinute(0);
    }
  }, [initialStartTime, initialEndTime, isOpen]);

  if (!isOpen) return null;

  const formatTime = (hour: number, minute: number) => {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  const handleConfirm = () => {
    onConfirm(formatTime(startHour, startMinute), formatTime(endHour, endMinute));
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[320px]">
        <h3 className="text-lg font-bold mb-4 text-center">
          {DAY_NAMES[dayOfWeek]}曜日の時間設定
        </h3>

        <div className="space-y-4">
          {/* 開始時間 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">開始時間</label>
            <div className="flex items-center gap-2">
              <select
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              >
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="text-xl font-bold">:</span>
              <select
                value={startMinute}
                onChange={(e) => setStartMinute(Number(e.target.value))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 終了時間 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">終了時間</label>
            <div className="flex items-center gap-2">
              <select
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              >
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="text-xl font-bold">:</span>
              <select
                value={endMinute}
                onChange={(e) => setEndMinute(Number(e.target.value))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          {hasExistingSchedule && (
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              削除
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-[#5B9BD5] text-white rounded-md hover:bg-[#4A8AC9] transition-colors"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
};

interface WeeklyTaskCreatorPageProps {
  onBack: () => void;
}

export const WeeklyTaskCreatorPage = ({ onBack }: WeeklyTaskCreatorPageProps) => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [lastSavedTaskId, setLastSavedTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverBottom, setDragOverBottom] = useState(false);
  const [dragMode, setDragMode] = useState<'reorder' | 'nest' | 'unnest'>('reorder');
  const [nestTargetTaskId, setNestTargetTaskId] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const tableRef = useRef<HTMLTableElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  // 時間入力モーダル用の状態
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [modalDayOfWeek, setModalDayOfWeek] = useState(0);
  const [modalStartTime, setModalStartTime] = useState('');
  const [modalEndTime, setModalEndTime] = useState('');

  // 自動保存関数
  const autoSave = useCallback(async (tasksToSave: WeeklyTask[]) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      const data = tasksToSave.map((task, index) => {
        let parentIndex: number | null = null;
        if (task.parentId) {
          const parentIdx = tasksToSave.findIndex(t => t.id === task.parentId);
          if (parentIdx !== -1 && parentIdx < index) {
            parentIndex = parentIdx;
          }
        }

        return {
          name: task.name,
          displayOrder: index + 1,
          parentIndex,
          schedules: task.schedules,
        };
      });

      await weeklyTaskApi.bulkSave(data);
    } catch (err) {
      console.error('週次タスクの自動保存に失敗:', err);
      setError('週次タスクの保存に失敗しました');
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  // タスクが変更されたら自動保存（デバウンス付き）
  useEffect(() => {
    if (isInitialLoad) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      autoSave(tasks);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [tasks, isInitialLoad, autoSave]);

  // 階層を持つタスクをフラット化するヘルパー関数
  const flattenTasks = (taskList: ApiWeeklyTask[], parentId: string | null = null, level = 0): WeeklyTask[] => {
    const result: WeeklyTask[] = [];
    for (const task of taskList) {
      result.push({
        id: task.id,
        name: task.name,
        displayOrder: task.displayOrder,
        parentId,
        level,
        schedules: task.schedules || [],
      });
      if (task.children && task.children.length > 0) {
        result.push(...flattenTasks(task.children, task.id, level + 1));
      }
    }
    return result;
  };

  // 初回ロード時にAPIから週次タスクを読み込む
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const loadTasks = async () => {
      try {
        const data = await weeklyTaskApi.getAll();
        const flatTasks = flattenTasks(data.weeklyTasks);
        setTasks(flatTasks);
      } catch (err) {
        console.log('週次タスクが見つかりません（新規作成）');
      } finally {
        setLoading(false);
        setIsInitialLoad(false);
      }
    };
    loadTasks();
  }, [user?.id]);

  // Enterキーで次のタスクを編集するためのキーボードリスナー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !editingTaskId && lastSavedTaskId) {
        e.preventDefault();
        const lastSavedIndex = tasks.findIndex(t => t.id === lastSavedTaskId);
        if (lastSavedIndex !== -1 && lastSavedIndex < tasks.length - 1) {
          const nextIndex = lastSavedIndex + 1;
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

  const handleAddTask = () => {
    let insertIndex = tasks.length;
    let parentId: string | null = null;
    let level = 0;

    if (editingTaskId) {
      const editingIndex = tasks.findIndex(t => t.id === editingTaskId);
      if (editingIndex !== -1) {
        const editingTask = tasks[editingIndex];
        parentId = editingTask.parentId ?? null;
        level = editingTask.level ?? 0;

        let nextIndex = editingIndex + 1;
        while (nextIndex < tasks.length) {
          const nextTask = tasks[nextIndex];
          const nextLevel = nextTask.level ?? 0;
          if (nextLevel <= level) {
            break;
          }
          nextIndex++;
        }
        insertIndex = nextIndex;
      }
    }

    const newTask: WeeklyTask = {
      id: crypto.randomUUID(),
      name: '',
      displayOrder: insertIndex + 1,
      parentId,
      level,
      schedules: [],
    };

    const newTasks = [...tasks];
    newTasks.splice(insertIndex, 0, newTask);
    const reorderedTasks = newTasks.map((t, i) => ({ ...t, displayOrder: i + 1 }));
    setTasks(reorderedTasks);

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
      setCheckedTasks(new Set());
    } else {
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
    setLastSavedTaskId(null);
  };

  const handleSaveTaskName = (taskId: string) => {
    if (!editingTaskName.trim()) {
      setEditingTaskId(null);
      setLastSavedTaskId(null);
      return;
    }

    setTasks(tasks.map(t =>
      t.id === taskId ? { ...t, name: editingTaskName.trim() } : t
    ));
    setEditingTaskId(null);
    setLastSavedTaskId(taskId);
  };

  const handleCancelEditTaskName = () => {
    setEditingTaskId(null);
    setEditingTaskName('');
    setLastSavedTaskId(null);
  };

  // 曜日セルをクリックしたときの処理
  const handleDayCellClick = (taskId: string, dayOfWeek: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const existingSchedule = task.schedules.find(s => s.dayOfWeek === dayOfWeek);

    setModalTaskId(taskId);
    setModalDayOfWeek(dayOfWeek);
    setModalStartTime(existingSchedule?.startTime || '');
    setModalEndTime(existingSchedule?.endTime || '');
    setModalOpen(true);
  };

  // 時間設定を確定
  const handleConfirmTime = (startTime: string, endTime: string) => {
    if (!modalTaskId) return;

    setTasks(tasks.map(task => {
      if (task.id !== modalTaskId) return task;

      const newSchedules = task.schedules.filter(s => s.dayOfWeek !== modalDayOfWeek);
      newSchedules.push({
        dayOfWeek: modalDayOfWeek,
        startTime,
        endTime,
      });
      // 曜日順にソート
      newSchedules.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

      return { ...task, schedules: newSchedules };
    }));

    setModalOpen(false);
  };

  // 時間設定を削除
  const handleDeleteTime = () => {
    if (!modalTaskId) return;

    setTasks(tasks.map(task => {
      if (task.id !== modalTaskId) return task;

      return {
        ...task,
        schedules: task.schedules.filter(s => s.dayOfWeek !== modalDayOfWeek),
      };
    }));

    setModalOpen(false);
  };

  // タスクのスケジュールから開始時間・終了時間を取得（最初のスケジュール）
  const getDisplayTimes = (task: WeeklyTask) => {
    if (task.schedules.length === 0) {
      return { startTime: '', endTime: '' };
    }
    // 最初のスケジュールの時間を表示
    const first = task.schedules[0];
    return { startTime: first.startTime, endTime: first.endTime };
  };

  const handleSortByStartTime = () => {
    const sortHierarchically = (
      taskList: WeeklyTask[],
      compareFn: (a: WeeklyTask, b: WeeklyTask) => number
    ): WeeklyTask[] => {
      const taskIds = new Set(taskList.map(t => t.id));
      const rootTasks = taskList.filter(t => !t.parentId || !taskIds.has(t.parentId));

      const childrenMap = new Map<string, WeeklyTask[]>();
      taskList.forEach(t => {
        if (t.parentId && taskIds.has(t.parentId)) {
          const children = childrenMap.get(t.parentId) || [];
          children.push(t);
          childrenMap.set(t.parentId, children);
        }
      });

      const sortAndFlatten = (tasksToSort: WeeklyTask[], level: number): WeeklyTask[] => {
        const sorted = [...tasksToSort].sort(compareFn);
        const result: WeeklyTask[] = [];

        for (const task of sorted) {
          result.push({ ...task, level });
          const children = childrenMap.get(task.id);
          if (children && children.length > 0) {
            result.push(...sortAndFlatten(children, level + 1));
          }
        }
        return result;
      };

      return sortAndFlatten(rootTasks, 0);
    };

    const sorted = sortHierarchically(tasks, (a, b) => {
      // 曜日で比較（スケジュールがない場合は最後に）
      const aDayOfWeek = a.schedules.length > 0 ? a.schedules[0].dayOfWeek : 99;
      const bDayOfWeek = b.schedules.length > 0 ? b.schedules[0].dayOfWeek : 99;
      if (aDayOfWeek !== bDayOfWeek) {
        return aDayOfWeek - bDayOfWeek;
      }
      // 同じ曜日なら時間で比較
      const aTime = a.schedules.length > 0 ? a.schedules[0].startTime : '99:99';
      const bTime = b.schedules.length > 0 ? b.schedules[0].startTime : '99:99';
      return aTime.localeCompare(bTime);
    });

    const reorderedTasks = sorted.map((task, index) => ({
      ...task,
      displayOrder: index + 1,
    }));

    setTasks(reorderedTasks);
  };

  // タスクが別のタスクの子孫かどうかをチェック
  const isDescendantOf = (taskId: string, potentialAncestorId: string): boolean => {
    const ancestorIndex = tasks.findIndex(t => t.id === potentialAncestorId);
    if (ancestorIndex === -1) return false;

    const ancestorLevel = tasks[ancestorIndex].level ?? 0;

    for (let i = ancestorIndex + 1; i < tasks.length; i++) {
      const currentLevel = tasks[i].level ?? 0;
      if (currentLevel <= ancestorLevel) break;
      if (tasks[i].id === taskId) return true;
    }
    return false;
  };

  const getDescendantCount = (taskIndex: number): number => {
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

  // ドラッグ&ドロップ関連のハンドラー（MonthlyTemplateCreatorPageと同様）
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    const target = e.target as HTMLElement;
    const tr = target.closest('tr');
    if (!tr) return;

    const rect = tr.getBoundingClientRect();
    const mouseY = e.clientY;
    const mouseX = e.clientX;
    const taskId = tr.getAttribute('data-task-id');

    const tableRect = tableRef.current?.getBoundingClientRect();
    const leftEdge = tableRect?.left ?? 0;

    const draggedTask = tasks.find(t => t.id === draggedTaskId);
    const hoveredTask = taskId ? tasks.find(t => t.id === taskId) : null;

    if (mouseX < leftEdge + 50 && draggedTask && (draggedTask.level ?? 0) > 0) {
      setDragMode('unnest');
      setDragOverTaskId(null);
      setNestTargetTaskId(null);
      setDragOverBottom(false);
      return;
    }

    const rowRelativeY = (mouseY - rect.top) / rect.height;
    const isInMiddleZone = rowRelativeY > 0.3 && rowRelativeY < 0.7;

    const taskNameCell = tr.querySelector('td:nth-child(1)');
    if (taskNameCell && taskId && taskId !== draggedTaskId && isInMiddleZone) {
      const cellRect = taskNameCell.getBoundingClientRect();
      const nestAreaLeft = cellRect.left + cellRect.width * 0.4;
      const isOverNestArea = mouseX >= nestAreaLeft && mouseX <= cellRect.right;

      if (isOverNestArea && hoveredTask) {
        const targetLevel = hoveredTask.level ?? 0;

        if (targetLevel < 2 && !isDescendantOf(draggedTaskId, taskId)) {
          setDragMode('nest');
          setNestTargetTaskId(taskId);
          setDragOverTaskId(null);
          setDragOverBottom(false);
          return;
        }
      }
    }

    setDragMode('reorder');
    setNestTargetTaskId(null);

    const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
    const hoveredIndex = taskId ? tasks.findIndex(t => t.id === taskId) : -1;
    const isDraggingUp = draggedIndex > hoveredIndex;

    const thresholdRatio = isDraggingUp ? 0.7 : 0.3;
    const threshold = rect.top + rect.height * thresholdRatio;

    let targetTaskId: string | null = null;
    let isBottom = false;

    if (taskId) {
      const currentIndex = tasks.findIndex(t => t.id === taskId);
      if (mouseY < threshold) {
        targetTaskId = taskId;
      } else {
        if (currentIndex < tasks.length - 1) {
          targetTaskId = tasks[currentIndex + 1].id;
        } else {
          isBottom = true;
        }
      }
    }

    if (isBottom) {
      if (draggedIndex !== tasks.length - 1) {
        setDragOverTaskId(null);
        setDragOverBottom(true);
        return;
      }
    }

    setDragOverBottom(false);

    if (targetTaskId && targetTaskId !== draggedTaskId) {
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

  const handleDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !relatedTarget.closest('tbody')) {
      setDragOverTaskId(null);
      setDragOverBottom(false);
      setDragMode('reorder');
      setNestTargetTaskId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetTaskId?: string) => {
    e.preventDefault();

    const currentDragMode = dragMode;
    const currentNestTarget = nestTargetTaskId;
    const isDropToBottom = dragOverBottom;
    const effectiveTargetId = dragOverTaskId || targetTaskId;

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
        const parentTask = tasks.find(t => t.id === draggedTask.parentId);
        const newParentId = parentTask?.parentId ?? null;

        setTasks(prevTasks => {
          const newTasks = [...prevTasks];
          const draggedIndex = newTasks.findIndex(t => t.id === draggedTaskId);
          if (draggedIndex === -1) return prevTasks;

          const taskLevel = newTasks[draggedIndex].level ?? 0;
          let descendantCount = 0;
          for (let i = draggedIndex + 1; i < newTasks.length; i++) {
            if ((newTasks[i].level ?? 0) > taskLevel) {
              descendantCount++;
            } else {
              break;
            }
          }

          const movedGroup = newTasks.splice(draggedIndex, 1 + descendantCount);

          movedGroup.forEach(task => {
            task.level = Math.max(0, (task.level ?? 0) - 1);
          });
          movedGroup[0].parentId = newParentId;

          if (newParentId === null) {
            const oldParentIndex = newTasks.findIndex(t => t.id === parentTask?.id);
            if (oldParentIndex !== -1) {
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

          return newTasks.map((task, index) => ({
            ...task,
            displayOrder: index + 1,
          }));
        });
      }
      setDraggedTaskId(null);
      return;
    }

    // 階層化モード
    if (currentDragMode === 'nest' && currentNestTarget) {
      setTasks(prevTasks => {
        const newTasks = [...prevTasks];
        const draggedIndex = newTasks.findIndex(t => t.id === draggedTaskId);
        const targetIndex = newTasks.findIndex(t => t.id === currentNestTarget);

        if (draggedIndex === -1 || targetIndex === -1) return prevTasks;

        const draggedLevel = newTasks[draggedIndex].level ?? 0;
        const targetLevel = newTasks[targetIndex].level ?? 0;
        const levelDiff = (targetLevel + 1) - draggedLevel;

        let descendantCount = 0;
        for (let i = draggedIndex + 1; i < newTasks.length; i++) {
          if ((newTasks[i].level ?? 0) > draggedLevel) {
            descendantCount++;
          } else {
            break;
          }
        }

        const movedGroup = newTasks.splice(draggedIndex, 1 + descendantCount);

        movedGroup.forEach(task => {
          task.level = (task.level ?? 0) + levelDiff;
        });
        movedGroup[0].parentId = currentNestTarget;

        const newTargetIndex = newTasks.findIndex(t => t.id === currentNestTarget);
        if (newTargetIndex === -1) return prevTasks;

        let insertIndex = newTargetIndex + 1;
        for (let i = newTargetIndex + 1; i < newTasks.length; i++) {
          if ((newTasks[i].level ?? 0) <= targetLevel) {
            break;
          }
          insertIndex = i + 1;
        }

        newTasks.splice(insertIndex, 0, ...movedGroup);

        return newTasks.map((task, index) => ({
          ...task,
          displayOrder: index + 1,
        }));
      });
      setDraggedTaskId(null);
      return;
    }

    // 最後に移動する場合
    if (isDropToBottom) {
      const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
      if (draggedIndex === -1) {
        setDraggedTaskId(null);
        return;
      }

      const descendantCount = getDescendantCount(draggedIndex);
      const groupSize = 1 + descendantCount;

      if (draggedIndex + groupSize >= tasks.length) {
        setDraggedTaskId(null);
        return;
      }

      const newTasks = [...tasks];
      const movedGroup = newTasks.splice(draggedIndex, groupSize);
      newTasks.push(...movedGroup);

      const reorderedTasks = newTasks.map((task, index) => ({
        ...task,
        displayOrder: index + 1,
      }));

      setTasks(reorderedTasks);
      setDraggedTaskId(null);
      return;
    }

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

    const descendantCount = getDescendantCount(draggedIndex);
    const groupSize = 1 + descendantCount;

    const newTasks = [...tasks];
    const movedGroup = newTasks.splice(draggedIndex, groupSize);

    const newTargetIndex = newTasks.findIndex(t => t.id === effectiveTargetId);
    if (newTargetIndex === -1) {
      setDraggedTaskId(null);
      return;
    }

    newTasks.splice(newTargetIndex, 0, ...movedGroup);

    const reorderedTasks = newTasks.map((task, index) => ({
      ...task,
      displayOrder: index + 1,
    }));

    setTasks(reorderedTasks);
    setDraggedTaskId(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);
  };

  const handleExportCSV = () => {
    const headers = ['タスク名', '階層', '開始時間', '終了時間', '月', '火', '水', '木', '金', '土', '日'];
    const rows = tasks.map(task => {
      const times = getDisplayTimes(task);
      const dayFlags = DAY_NAMES.map((_, idx) =>
        task.schedules.some(s => s.dayOfWeek === idx) ? '1' : ''
      );
      return [
        task.name,
        String(task.level ?? 0),
        times.startTime,
        times.endTime,
        ...dayFlags,
      ];
    });

    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '週次タスク.csv';
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

        const newTasks: WeeklyTask[] = [];
        const parentStack: { id: string; level: number }[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
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
          let level = cells[1] ? parseInt(cells[1], 10) : 0;
          if (isNaN(level)) level = 0;
          const startTime = cells[2] || '';
          const endTime = cells[3] || '';

          // 曜日フラグ（4〜10列目）
          const schedules: WeeklyTaskSchedule[] = [];
          for (let d = 0; d < 7; d++) {
            if (cells[4 + d] === '1' && startTime && endTime) {
              schedules.push({ dayOfWeek: d, startTime, endTime });
            }
          }

          let parentId: string | null = null;
          if (level > 0) {
            while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
              parentStack.pop();
            }
            if (parentStack.length > 0) {
              parentId = parentStack[parentStack.length - 1].id;
            }
          } else {
            parentStack.length = 0;
          }

          const taskId = crypto.randomUUID();
          newTasks.push({
            id: taskId,
            name,
            displayOrder: newTasks.length + 1,
            parentId,
            level,
            schedules,
          });

          parentStack.push({ id: taskId, level });
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
    event.target.value = '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  // モーダル用の既存スケジュールがあるか確認
  const modalTask = modalTaskId ? tasks.find(t => t.id === modalTaskId) : null;
  const hasExistingSchedule = modalTask?.schedules.some(s => s.dayOfWeek === modalDayOfWeek) ?? false;

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
                週次タスク作成
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/80">{user?.username}</span>
              <button
                onClick={logout}
                className="text-sm text-white/80 hover:text-white"
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

        <div className="bg-white shadow-md rounded-xl p-6 mb-6">
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
            <button
              onClick={handleBulkDelete}
              disabled={checkedTasks.size === 0}
              className={`px-4 py-2 text-white rounded-md transition-colors text-sm font-medium shadow-sm ${
                checkedTasks.size === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              タスク削除 ({checkedTasks.size})
            </button>
            <button
              onClick={handleSortByStartTime}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-sm font-medium text-gray-700"
            >
              ソート
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-sm font-medium text-gray-700"
            >
              CSVエクスポート
            </button>
            <label className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-sm font-medium text-gray-700 cursor-pointer">
              CSVインポート
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
              />
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 whitespace-nowrap">
            <table ref={tableRef} className="border-collapse inline-block align-top">
              <thead>
                <tr>
                  <th className="border-r border-gray-300 px-2 py-3 bg-[#5B9BD5] text-white sticky left-0 z-10 w-[200px] min-w-[200px] font-medium">
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
                  <th className="border-r border-gray-300 px-2 py-2 text-xs font-medium bg-[#5B9BD5] text-white w-[80px] min-w-[80px]">
                    開始時間
                  </th>
                  <th className="border-r border-gray-300 px-2 py-2 text-xs font-medium bg-[#5B9BD5] text-white w-[80px] min-w-[80px]">
                    終了時間
                  </th>
                  {DAY_NAMES.map((day, idx) => (
                    <th
                      key={idx}
                      className={`border-r border-gray-300 px-3 py-2 text-xs font-medium bg-[#5B9BD5] w-[60px] min-w-[60px] ${
                        idx === 5 ? 'text-blue-200' : idx === 6 ? 'text-red-200' : 'text-white'
                      }`}
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e)}
              >
                {tasks.map((task, index) => {
                  const isChecked = checkedTasks.has(task.id);
                  const isDragging = draggedTaskId === task.id;
                  const isDragOver = dragOverTaskId === task.id;
                  const isLastRow = index === tasks.length - 1;
                  const showBottomBorder = isLastRow && dragOverBottom;
                  const isNestTarget = nestTargetTaskId === task.id && dragMode === 'nest';
                  const taskLevel = task.level ?? 0;
                  const isUnnestMode = dragMode === 'unnest' && draggedTaskId === task.id;
                  const times = getDisplayTimes(task);

                  return (
                    <tr
                      key={task.id}
                      data-task-id={task.id}
                      className={`${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'border-t-2 border-t-purple-500' : ''} ${showBottomBorder ? 'border-b-2 border-b-purple-500' : ''} ${isNestTarget ? 'bg-green-50' : ''} ${isUnnestMode ? 'bg-amber-50' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDrop={(e) => handleDrop(e, task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <td
                        className={`border-b border-r border-gray-200 px-1 py-1 sticky left-0 ${isNestTarget ? 'bg-green-50' : isUnnestMode ? 'bg-amber-50' : 'bg-white'} z-10 w-[200px] min-w-[200px]`}
                        style={{
                          paddingLeft: `${8 + taskLevel * 16}px`
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0" title="ドラッグして並び替え">
                            ⋮⋮
                          </span>
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
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!editingTaskName.trim()) {
                                    handleAddTask();
                                  } else {
                                    handleSaveTaskName(task.id);
                                  }
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
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
                      <td className="border-b border-r border-gray-200 px-2 py-1 text-center text-sm">
                        {times.startTime}
                      </td>
                      <td className="border-b border-r border-gray-200 px-2 py-1 text-center text-sm">
                        {times.endTime}
                      </td>
                      {DAY_NAMES.map((_, dayIdx) => {
                        const hasSchedule = task.schedules.some(s => s.dayOfWeek === dayIdx);
                        const isSaturday = dayIdx === 5;
                        const isSunday = dayIdx === 6;

                        return (
                          <td
                            key={dayIdx}
                            className={`border-b border-r border-gray-200 px-1 py-1 cursor-pointer hover:bg-gray-100 ${
                              isSaturday ? 'bg-blue-50' : isSunday ? 'bg-red-50' : ''
                            }`}
                            onClick={() => handleDayCellClick(task.id, dayIdx)}
                          >
                            <div className={`h-5 rounded ${hasSchedule ? 'bg-[#85c1e9]' : ''}`} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {tasks.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
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
                    colSpan={10}
                    className="border-b border-r border-gray-200 px-4 py-3 text-center text-gray-400 text-sm"
                  >
                    + クリックしてタスクを追加
                  </td>
                </tr>
              </tbody>
            </table>
            {/* スクロール用のスペーサー */}
            <div className="inline-block" style={{ width: 'calc(100% - 240px)', minWidth: '800px' }} />
          </div>
        </div>
      </main>

      {/* 時間入力モーダル */}
      <TimeInputModal
        isOpen={modalOpen}
        dayOfWeek={modalDayOfWeek}
        initialStartTime={modalStartTime}
        initialEndTime={modalEndTime}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirmTime}
        onDelete={handleDeleteTime}
        hasExistingSchedule={hasExistingSchedule}
      />
    </div>
  );
};
