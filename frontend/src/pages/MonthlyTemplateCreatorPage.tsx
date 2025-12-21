import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { templateApi } from '../services/api';

// デフォルトの月次テンプレート名
const DEFAULT_TEMPLATE_NAME = '__default_monthly__';

interface MonthlyTemplateTask {
  id: string;
  name: string;
  displayOrder: number;
  startDay: number | null;
  endDay: number | null;
  startTime: string | null;
  endTime: string | null;
  parentId?: string | null;
  level?: number;
}

interface MonthlyTemplateCreatorPageProps {
  onBack: () => void;
}

export const MonthlyTemplateCreatorPage = ({ onBack }: MonthlyTemplateCreatorPageProps) => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<MonthlyTemplateTask[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStartDays, setSelectedStartDays] = useState<Record<string, number | null>>({});
  const [hoverDays, setHoverDays] = useState<Record<string, number | null>>({});
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  // 1-31日を固定で表示
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  // 自動保存関数
  const autoSave = useCallback(async (tasksToSave: MonthlyTemplateTask[]) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      const data = tasksToSave.map((task, index) => {
        // parentIdからparentIndexを計算
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
          startDay: task.startDay,
          endDay: task.endDay,
          startTime: task.startTime,
          endTime: task.endTime,
          parentIndex,
        };
      });

      await templateApi.saveMonthlyTemplate(DEFAULT_TEMPLATE_NAME, data);
    } catch (err) {
      console.error('月次テンプレートの自動保存に失敗:', err);
      setError('月次テンプレートの保存に失敗しました');
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

  // 初回ロード時にAPIから月次テンプレートを読み込む
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const loadTasks = async () => {
      try {
        const data = await templateApi.getTemplateDetails(DEFAULT_TEMPLATE_NAME);

        // parentIdからlevelを計算するヘルパー関数
        const calculateLevel = (taskId: string, tasksMap: Map<string, { parentId: string | null }>, cache: Map<string, number>): number => {
          if (cache.has(taskId)) return cache.get(taskId)!;

          const task = tasksMap.get(taskId);
          if (!task || !task.parentId) {
            cache.set(taskId, 0);
            return 0;
          }

          const parentLevel = calculateLevel(task.parentId, tasksMap, cache);
          const level = parentLevel + 1;
          cache.set(taskId, level);
          return level;
        };

        // タスクマップを作成
        const tasksMap = new Map(data.tasks.map(t => [t.id, { parentId: t.parentId }]));
        const levelCache = new Map<string, number>();

        const loadedTasks: MonthlyTemplateTask[] = data.tasks.map((task, index) => ({
          id: task.id,
          name: task.name,
          displayOrder: task.displayOrder || index + 1,
          startDay: task.startDay,
          endDay: task.endDay,
          startTime: task.startTime,
          endTime: task.endTime,
          parentId: task.parentId,
          level: calculateLevel(task.id, tasksMap, levelCache),
        }));
        setTasks(loadedTasks);
      } catch (err) {
        // テンプレートが見つからない場合は空のまま
        console.log('月次テンプレートが見つかりません（新規作成）');
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
      // 編集中でなく、最後に保存したタスクがある場合
      if (e.key === 'Enter' && !editingTaskId && lastSavedTaskId) {
        e.preventDefault();

        // 最後に保存したタスクの次のタスクを見つける
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
    // 編集中のタスクがある場合、その直下に同じ階層で追加
    let insertIndex = tasks.length; // デフォルトは末尾
    let parentId: string | null = null;
    let level = 0;

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
          if (nextLevel <= level) {
            break;
          }
          nextIndex++;
        }
        insertIndex = nextIndex;
      }
    }

    const newTask: MonthlyTemplateTask = {
      id: crypto.randomUUID(),
      name: '',
      displayOrder: insertIndex + 1,
      startDay: null,
      endDay: null,
      startTime: null,
      endTime: null,
      parentId,
      level,
    };

    // 挿入位置にタスクを追加し、displayOrderを再割り当て
    const newTasks = [...tasks];
    newTasks.splice(insertIndex, 0, newTask);
    const reorderedTasks = newTasks.map((t, i) => ({ ...t, displayOrder: i + 1 }));
    setTasks(reorderedTasks);

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

  const handleCellClick = (taskId: string, day: number) => {
    // 他のタスクが日付選択中の場合は操作不可
    const selectingTaskId = Object.keys(selectedStartDays).find(
      id => selectedStartDays[id] !== null && selectedStartDays[id] !== undefined
    );
    if (selectingTaskId && selectingTaskId !== taskId) {
      return; // 他のタスクが選択中なので無視
    }

    const task = tasks.find(t => t.id === taskId);
    const currentStartDay = selectedStartDays[taskId];

    // 既に確定した範囲内をクリックした場合はクリア
    if (task && isDateInRange(task, day) && (currentStartDay === null || currentStartDay === undefined)) {
      setTasks(tasks.map(t =>
        t.id === taskId ? { ...t, startDay: null, endDay: null } : t
      ));
      return;
    }

    if (currentStartDay === null || currentStartDay === undefined) {
      // 1クリック目: 開始日を設定
      setSelectedStartDays({ ...selectedStartDays, [taskId]: day });
    } else {
      // 2クリック目: 終了日を設定
      // 開始日より前の日付は選択不可
      if (day < currentStartDay) {
        return;
      }
      const startDay = currentStartDay;
      const endDay = day;

      setTasks(tasks.map(t =>
        t.id === taskId ? { ...t, startDay, endDay } : t
      ));

      setSelectedStartDays({ ...selectedStartDays, [taskId]: null });
      setHoverDays({ ...hoverDays, [taskId]: null });
    }
  };

  const isDateInRange = (task: MonthlyTemplateTask, day: number): boolean => {
    if (task.startDay === null || task.endDay === null) return false;
    return day >= task.startDay && day <= task.endDay;
  };

  const handleSortByStartDay = () => {
    // 階層構造を保持したソート
    const sortHierarchically = (
      taskList: MonthlyTemplateTask[],
      compareFn: (a: MonthlyTemplateTask, b: MonthlyTemplateTask) => number
    ): MonthlyTemplateTask[] => {
      // タスクIDのセットを作成（存在確認用）
      const taskIds = new Set(taskList.map(t => t.id));

      // ルートタスク（parentIdがnull/undefined、または親が存在しない孤立タスク）を取得
      const rootTasks = taskList.filter(t => !t.parentId || !taskIds.has(t.parentId));

      // 子タスクをparentIdでグループ化（親が存在する場合のみ）
      const childrenMap = new Map<string, MonthlyTemplateTask[]>();
      taskList.forEach(t => {
        if (t.parentId && taskIds.has(t.parentId)) {
          const children = childrenMap.get(t.parentId) || [];
          children.push(t);
          childrenMap.set(t.parentId, children);
        }
      });

      // 再帰的にソートしてフラット化
      const sortAndFlatten = (tasksToSort: MonthlyTemplateTask[], level: number): MonthlyTemplateTask[] => {
        const sorted = [...tasksToSort].sort(compareFn);
        const result: MonthlyTemplateTask[] = [];

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

  // 子孫タスクの数を取得するヘルパー
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

    // 通常の並び替えモード
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
    // ドラッグ終了時にスクロールを復元
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
    }
  };

  const handleExportCSV = () => {
    // CSVヘッダーとデータを作成（階層情報を含む）
    const headers = ['タスク名', '階層', '開始日', '終了日'];
    const rows = tasks.map(task => [
      task.name,
      String(task.level ?? 0),
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
    link.download = '月次タスク.csv';
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

        // ヘッダー行を検証（年次タスクのCSVでないか確認）
        const headerLine = lines[0];
        if (headerLine.includes('実施月')) {
          alert('このファイルは年次タスク用のCSVです。\n月次タスク作成画面では月次タスク用のCSVをインポートしてください。');
          return;
        }

        // 階層列があるかどうかを判定
        const hasLevelColumn = headerLine.includes('階層');

        // ヘッダー行をスキップしてデータを読み込む
        const newTasks: MonthlyTemplateTask[] = [];
        // 階層構造を再構築するための親IDスタック
        const parentStack: { id: string; level: number }[] = [];

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

          let name: string;
          let level: number;
          let startDay: number | null;
          let endDay: number | null;

          if (hasLevelColumn) {
            // 新形式: タスク名, 階層, 開始日, 終了日
            name = cells[0] || '';
            level = cells[1] ? parseInt(cells[1], 10) : 0;
            if (isNaN(level)) level = 0;
            startDay = cells[2] ? parseInt(cells[2], 10) : null;
            endDay = cells[3] ? parseInt(cells[3], 10) : null;
          } else {
            // 旧形式: タスク名, 開始日, 終了日
            name = cells[0] || '';
            level = 0;
            startDay = cells[1] ? parseInt(cells[1], 10) : null;
            endDay = cells[2] ? parseInt(cells[2], 10) : null;
          }

          // 親IDを決定
          let parentId: string | null = null;
          if (level > 0) {
            // 現在のレベルより低いレベルの親を探す
            while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
              parentStack.pop();
            }
            if (parentStack.length > 0) {
              parentId = parentStack[parentStack.length - 1].id;
            }
          } else {
            // レベル0の場合はスタックをクリア
            parentStack.length = 0;
          }

          const taskId = crypto.randomUUID();
          newTasks.push({
            id: taskId,
            name,
            displayOrder: newTasks.length + 1,
            startDay: startDay && !isNaN(startDay) ? startDay : null,
            endDay: endDay && !isNaN(endDay) ? endDay : null,
            startTime: null,
            endTime: null,
            parentId,
            level,
          });

          // スタックに追加
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
                月次テンプレート作成
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
              onClick={handleSortByStartDay}
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
                  {days.map((day) => (
                    <th
                      key={day}
                      className="border-r border-gray-300 px-1 py-2 text-xs font-medium bg-[#5B9BD5] text-white w-[53px] min-w-[53px]"
                    >
                      <div className="font-semibold">{day}</div>
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
                  const taskStartDay = selectedStartDays[task.id];
                  const taskHoverDay = hoverDays[task.id];
                  const isChecked = checkedTasks.has(task.id);

                  // 他のタスクが日付選択中かどうか
                  const selectingTaskId = Object.keys(selectedStartDays).find(
                    id => selectedStartDays[id] !== null && selectedStartDays[id] !== undefined
                  );
                  const isOtherTaskSelecting = selectingTaskId && selectingTaskId !== task.id;

                  const isDragging = draggedTaskId === task.id;
                  const isDragOver = dragOverTaskId === task.id;
                  const isLastRow = index === tasks.length - 1;
                  const showBottomBorder = isLastRow && dragOverBottom;

                  // 階層化のビジュアルフィードバック
                  const isNestTarget = nestTargetTaskId === task.id && dragMode === 'nest';
                  const taskLevel = task.level ?? 0;
                  const isUnnestMode = dragMode === 'unnest' && draggedTaskId === task.id;

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
                        className={`border-b border-gray-200 px-1 py-1 sticky left-0 ${isNestTarget ? 'bg-green-50' : isUnnestMode ? 'bg-amber-50' : 'bg-white'} z-10 w-[140px] min-w-[140px]`}
                        style={{
                          paddingLeft: `${8 + taskLevel * 16}px`,
                          boxShadow: '1px 0 0 0 #e5e7eb'
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0" title="ドラッグして並び替え（タスク名にドロップで子タスク化、左端にドロップで階層解除）">
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
                                    // タスク名が空の場合、同じ階層で下に新しいタスクを挿入
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
                      <td className={`border-b border-gray-200 px-1 py-1 text-center sticky left-[140px] z-10 w-[90px] min-w-[90px] ${isNestTarget ? 'bg-green-50' : isUnnestMode ? 'bg-amber-50' : 'bg-white'}`} style={{ boxShadow: '1px 0 0 0 #e5e7eb' }}>
                        <div className="flex items-center justify-center gap-0.5">
                          <select
                            value={task.startTime ? task.startTime.split(':')[0] : ''}
                            onChange={(e) => {
                              const hour = e.target.value;
                              const minute = task.startTime ? task.startTime.split(':')[1] : '00';
                              const newTime = hour ? `${hour}:${minute}` : null;
                              setTasks(tasks.map(t => t.id === task.id ? { ...t, startTime: newTime } : t));
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
                              setTasks(tasks.map(t => t.id === task.id ? { ...t, startTime: newTime } : t));
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
                      <td className={`border-b border-gray-200 px-1 py-1 text-center sticky left-[230px] z-10 w-[90px] min-w-[90px] ${isNestTarget ? 'bg-green-50' : isUnnestMode ? 'bg-amber-50' : 'bg-white'}`} style={{ boxShadow: '1px 0 0 0 #e5e7eb' }}>
                        <div className="flex items-center justify-center gap-0.5">
                          <select
                            value={task.endTime ? task.endTime.split(':')[0] : ''}
                            onChange={(e) => {
                              const hour = e.target.value;
                              const minute = task.endTime ? task.endTime.split(':')[1] : '00';
                              const newTime = hour ? `${hour}:${minute}` : null;
                              setTasks(tasks.map(t => t.id === task.id ? { ...t, endTime: newTime } : t));
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
                              setTasks(tasks.map(t => t.id === task.id ? { ...t, endTime: newTime } : t));
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

                        const isRangeStart = inRange && task.startDay === day;
                        const isRangeEnd = inRange && task.endDay === day;

                        // セルの無効化条件
                        const isCellDisabled = isOtherTaskSelecting || isBeforeStartDay;

                        return (
                          <td
                            key={day}
                            className={`border-b border-r border-gray-200 px-0.5 py-1 text-center w-[53px] min-w-[53px] ${
                              isCellDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            onClick={() => !isCellDisabled && handleCellClick(task.id, day)}
                            onMouseEnter={() => !isCellDisabled && setHoverDays({ ...hoverDays, [task.id]: day })}
                            onMouseLeave={() => !isCellDisabled && setHoverDays({ ...hoverDays, [task.id]: null })}
                          >
                            <div className={`h-5 ${
                              isStartDay
                                ? 'bg-[#85c1e9] rounded animate-blink-bar'
                                : isInPreviewRange
                                ? 'bg-[#85c1e9] rounded animate-blink-bar'
                                : inRange
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
            {/* 31日をタスク列の隣までスクロールするためのスペーサー */}
            <div className="inline-block" style={{ width: 'calc(100% - 320px)', minWidth: '800px' }} />
          </div>
        </div>
      </main>
    </div>
  );
};
