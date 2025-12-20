import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { spotTaskApi } from '../services/api';

interface SpotTaskCreatorPageProps {
  onBack: () => void;
}

interface LocalSpotTask {
  id: string;
  name: string;
  displayOrder: number;
  implementationYear: number;
  implementationMonth: number;
  startDay: number | null;
  endDay: number | null;
  parentId?: string | null;
  level?: number;
  children?: LocalSpotTask[];
}

// 階層タスクをフラット化する関数
const flattenTasks = (
  tasks: LocalSpotTask[],
  level: number = 0
): LocalSpotTask[] => {
  const result: LocalSpotTask[] = [];
  for (const task of tasks) {
    result.push({ ...task, level });
    if (task.children && task.children.length > 0) {
      result.push(...flattenTasks(task.children, level + 1));
    }
  }
  return result;
};

export const SpotTaskCreatorPage = ({ onBack }: SpotTaskCreatorPageProps) => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<LocalSpotTask[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStartDays, setSelectedStartDays] = useState<Record<string, number | null>>({});
  const [hoverDays, setHoverDays] = useState<Record<string, number | null>>({});
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');
  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [editingYearValue, setEditingYearValue] = useState('');
  const [editingMonthId, setEditingMonthId] = useState<string | null>(null);
  const [editingMonthValue, setEditingMonthValue] = useState('');
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

  const currentYear = new Date().getFullYear();
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  // 保存中フラグ
  const isSavingRef = useRef(false);

  // 自動保存関数
  const autoSave = useCallback(async (tasksToSave: LocalSpotTask[]) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      // 親タスクのインデックスを計算
      const data = tasksToSave.map((t) => {
        let parentIndex: number | null = null;
        if (t.parentId) {
          parentIndex = tasksToSave.findIndex(p => p.id === t.parentId);
          if (parentIndex === -1) parentIndex = null;
        }
        return {
          name: t.name,
          displayOrder: t.displayOrder,
          implementationYear: t.implementationYear,
          implementationMonth: t.implementationMonth,
          startDay: t.startDay,
          endDay: t.endDay,
          parentIndex,
        };
      });

      await spotTaskApi.bulkSave(data);
      // 保存成功後、ローカルのIDはそのまま使用し続ける
    } catch (err) {
      console.error('スポットタスクの自動保存に失敗:', err);
      setError('スポットタスクの保存に失敗しました');
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

  // Load spot tasks from server
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const { spotTasks } = await spotTaskApi.getAll();
        // 階層構造をフラット化
        const flattenedTasks = flattenTasks(spotTasks.map(t => ({
          id: t.id,
          name: t.name,
          displayOrder: t.displayOrder,
          implementationYear: t.implementationYear,
          implementationMonth: t.implementationMonth,
          startDay: t.startDay,
          endDay: t.endDay,
          parentId: t.parentId,
          children: t.children?.map((c: any) => ({
            id: c.id,
            name: c.name,
            displayOrder: c.displayOrder,
            implementationYear: c.implementationYear,
            implementationMonth: c.implementationMonth,
            startDay: c.startDay,
            endDay: c.endDay,
            parentId: c.parentId,
            children: c.children,
          })),
        })));
        setTasks(flattenedTasks);
      } catch (err) {
        console.error('スポットタスクの読み込みに失敗:', err);
        setError('スポットタスクの読み込みに失敗しました');
      } finally {
        setLoading(false);
        setIsInitialLoad(false);
      }
    };
    loadTasks();
  }, []);

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
    const newTask: LocalSpotTask = {
      id: crypto.randomUUID(),
      name: '',
      displayOrder: 1,
      implementationYear: currentYear,
      implementationMonth: 1,
      startDay: null,
      endDay: null,
    };

    const updatedTasks = tasks.map(t => ({
      ...t,
      displayOrder: t.displayOrder + 1,
    }));

    setTasks([newTask, ...updatedTasks]);
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
    if (checkedTasks.size === 0) return;
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

  const handleStartEditYear = (taskId: string, currentYear: number) => {
    setEditingYearId(taskId);
    setEditingYearValue(String(currentYear));
  };

  const handleSaveYear = (taskId: string) => {
    const yearValue = parseInt(editingYearValue);
    if (isNaN(yearValue) || yearValue < 2000 || yearValue > 2100) {
      setEditingYearId(null);
      return;
    }
    setTasks(tasks.map(t =>
      t.id === taskId ? { ...t, implementationYear: yearValue } : t
    ));
    setEditingYearId(null);
  };

  const handleCancelEditYear = () => {
    setEditingYearId(null);
    setEditingYearValue('');
  };

  const handleStartEditMonth = (taskId: string, currentMonth: number) => {
    setEditingMonthId(taskId);
    setEditingMonthValue(String(currentMonth));
  };

  const handleSaveMonth = (taskId: string) => {
    const monthValue = parseInt(editingMonthValue);
    if (isNaN(monthValue) || monthValue < 1 || monthValue > 12) {
      setEditingMonthId(null);
      return;
    }
    setTasks(tasks.map(t =>
      t.id === taskId ? { ...t, implementationMonth: monthValue } : t
    ));
    setEditingMonthId(null);
  };

  const handleCancelEditMonth = () => {
    setEditingMonthId(null);
    setEditingMonthValue('');
  };

  const handleCellClick = (taskId: string, day: number) => {
    const currentStartDay = selectedStartDays[taskId];

    if (currentStartDay === null || currentStartDay === undefined) {
      setSelectedStartDays({ ...selectedStartDays, [taskId]: day });
    } else {
      const startDay = Math.min(currentStartDay, day);
      const endDay = Math.max(currentStartDay, day);

      setTasks(tasks.map(t =>
        t.id === taskId ? { ...t, startDay, endDay } : t
      ));

      setSelectedStartDays({ ...selectedStartDays, [taskId]: null });
      setHoverDays({ ...hoverDays, [taskId]: null });
    }
  };

  const isDayInRange = (task: LocalSpotTask, day: number): boolean => {
    if (task.startDay === null || task.endDay === null) return false;
    return day >= task.startDay && day <= task.endDay;
  };

  const handleSortByYearMonth = () => {
    const sorted = [...tasks].sort((a, b) => {
      if (a.implementationYear !== b.implementationYear) {
        return a.implementationYear - b.implementationYear;
      }
      if (a.implementationMonth !== b.implementationMonth) {
        return a.implementationMonth - b.implementationMonth;
      }
      if (a.startDay === null && b.startDay === null) return 0;
      if (a.startDay === null) return 1;
      if (b.startDay === null) return -1;
      return a.startDay - b.startDay;
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

  // ドラッグ&ドロップ関連のハンドラー
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

          // 子孫タスクの数を計算
          const taskLevel = newTasks[draggedIndex].level ?? 0;
          let descendantCount = 0;
          for (let i = draggedIndex + 1; i < newTasks.length; i++) {
            if ((newTasks[i].level ?? 0) > taskLevel) {
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

          // displayOrderを更新
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

        // 子孫タスクの数を計算
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

        // 新しいターゲットインデックスを再計算
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

        // displayOrderを更新
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

      // displayOrderを更新
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

    // ターゲットの新しいインデックスを計算（削除後にずれる可能性）
    const newTargetIndex = newTasks.findIndex(t => t.id === effectiveTargetId);
    if (newTargetIndex === -1) {
      setDraggedTaskId(null);
      return;
    }

    newTasks.splice(newTargetIndex, 0, ...movedGroup);

    // displayOrderを更新
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
    const headers = ['タスク名', '実施年', '実施月', '開始日', '終了日'];
    const rows = tasks.map(task => [
      task.name,
      String(task.implementationYear),
      String(task.implementationMonth),
      task.startDay !== null ? String(task.startDay) : '',
      task.endDay !== null ? String(task.endDay) : ''
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'スポットタスク.csv';
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

        const headerLine = lines[0];
        if (!headerLine.includes('実施年')) {
          alert('このファイルはスポットタスク用のCSVではありません。');
          return;
        }

        const newTasks: LocalSpotTask[] = [];
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
          const implementationYear = cells[1] ? parseInt(cells[1], 10) : currentYear;
          const implementationMonth = cells[2] ? parseInt(cells[2], 10) : 1;
          const startDay = cells[3] ? parseInt(cells[3], 10) : null;
          const endDay = cells[4] ? parseInt(cells[4], 10) : null;

          newTasks.push({
            id: crypto.randomUUID(),
            name,
            displayOrder: newTasks.length + 1,
            implementationYear: implementationYear && !isNaN(implementationYear) ? implementationYear : currentYear,
            implementationMonth: implementationMonth && !isNaN(implementationMonth) && implementationMonth >= 1 && implementationMonth <= 12 ? implementationMonth : 1,
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
                スポットタスク一覧
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
              onClick={handleSortByYearMonth}
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
                  <th className="border border-gray-300 px-2 py-1 bg-gray-50 sticky left-[120px] z-10 w-[70px] min-w-[70px]">
                    実施年
                  </th>
                  <th className="border border-gray-300 px-2 py-1 bg-gray-50 sticky left-[190px] z-10 w-[60px] min-w-[60px]">
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
              <tbody
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e)}
              >
                {tasks.map((task, index) => {
                  const taskStartDay = selectedStartDays[task.id];
                  const taskHoverDay = hoverDays[task.id];
                  const isChecked = checkedTasks.has(task.id);
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
                      className={`${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'border-t-2 border-t-blue-500' : ''} ${showBottomBorder ? 'border-b-2 border-b-blue-500' : ''} ${isNestTarget ? 'bg-green-100' : ''} ${isUnnestMode ? 'bg-yellow-100' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDrop={(e) => handleDrop(e, task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <td
                        className={`border border-gray-300 px-1 py-1 sticky left-0 ${isNestTarget ? 'bg-green-100' : isUnnestMode ? 'bg-yellow-100' : 'bg-white'} z-10 w-[120px] min-w-[120px]`}
                        style={{
                          paddingLeft: `${4 + taskLevel * 20}px`
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
                                  handleSaveTaskName(task.id);
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
                      <td className="border border-gray-300 px-2 py-1 text-center sticky left-[120px] bg-white z-10 w-[70px] min-w-[70px]">
                        {editingYearId === task.id ? (
                          <input
                            type="number"
                            min="2000"
                            max="2100"
                            value={editingYearValue}
                            onChange={(e) => setEditingYearValue(e.target.value)}
                            onBlur={() => handleSaveYear(task.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSaveYear(task.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelEditYear();
                              }
                            }}
                            autoFocus
                            className="w-full px-1 py-0 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          />
                        ) : (
                          <div
                            onClick={() => handleStartEditYear(task.id, task.implementationYear)}
                            className="cursor-text min-h-[20px]"
                          >
                            {task.implementationYear}年
                          </div>
                        )}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center sticky left-[190px] bg-white z-10 w-[60px] min-w-[60px]">
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
                                e.preventDefault();
                                e.stopPropagation();
                                handleSaveMonth(task.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
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
                            {task.implementationMonth}月
                          </div>
                        )}
                      </td>
                      {days.map((day) => {
                        const inRange = isDayInRange(task, day);
                        const isStartDay = taskStartDay === day;
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
