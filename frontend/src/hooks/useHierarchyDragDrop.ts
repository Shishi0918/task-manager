import { useState, useRef, useCallback } from 'react';

export interface HierarchicalTask {
  id: string;
  name: string;
  displayOrder: number;
  parentId?: string | null;
  level?: number;
  children?: HierarchicalTask[];
}

// 階層タスクをフラット化する関数
export const flattenTasks = <T extends HierarchicalTask>(
  tasks: T[],
  level: number = 0
): T[] => {
  const result: T[] = [];
  for (const task of tasks) {
    result.push({ ...task, level });
    if (task.children && task.children.length > 0) {
      result.push(...flattenTasks(task.children as T[], level + 1));
    }
  }
  return result;
};

// 階層構造を再構築する関数
export const buildHierarchy = <T extends HierarchicalTask>(
  flatTasks: T[]
): T[] => {
  const taskMap = new Map<string, T>();
  const rootTasks: T[] = [];

  // まずすべてのタスクをマップに登録
  flatTasks.forEach(task => {
    taskMap.set(task.id, { ...task, children: [] });
  });

  // 親子関係を構築
  flatTasks.forEach(task => {
    const currentTask = taskMap.get(task.id)!;
    if (task.parentId && taskMap.has(task.parentId)) {
      const parent = taskMap.get(task.parentId)!;
      if (!parent.children) parent.children = [];
      parent.children.push(currentTask);
    } else {
      rootTasks.push(currentTask);
    }
  });

  return rootTasks;
};

export type DragMode = 'reorder' | 'nest' | 'unnest';

interface UseHierarchyDragDropOptions<T extends HierarchicalTask> {
  tasks: T[];
  setTasks: React.Dispatch<React.SetStateAction<T[]>>;
  onUpdateParent?: (taskId: string, parentId: string | null) => Promise<void>;
  onReorder?: (tasks: T[]) => Promise<void>;
  maxLevel?: number; // デフォルト2
}

interface UseHierarchyDragDropReturn {
  draggedTaskId: string | null;
  dragOverTaskId: string | null;
  dragOverBottom: boolean;
  dragMode: DragMode;
  nestTargetTaskId: string | null;
  handleDragStart: (e: React.DragEvent, taskId: string) => void;
  handleDragOver: (e: React.DragEvent, tableRef: React.RefObject<HTMLTableElement>) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, targetTaskId?: string) => Promise<void>;
  handleDragEnd: () => void;
}

export function useHierarchyDragDrop<T extends HierarchicalTask>({
  tasks,
  setTasks,
  onUpdateParent,
  onReorder,
  maxLevel = 2,
}: UseHierarchyDragDropOptions<T>): UseHierarchyDragDropReturn {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverBottom, setDragOverBottom] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>('reorder');
  const [nestTargetTaskId, setNestTargetTaskId] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

  // タスクが別のタスクの子孫かどうかをチェック
  const isDescendantOf = useCallback((taskId: string, potentialAncestorId: string): boolean => {
    const ancestorIndex = tasks.findIndex(t => t.id === potentialAncestorId);
    if (ancestorIndex === -1) return false;

    const ancestorLevel = tasks[ancestorIndex].level ?? 0;

    for (let i = ancestorIndex + 1; i < tasks.length; i++) {
      const currentLevel = tasks[i].level ?? 0;
      if (currentLevel <= ancestorLevel) break;
      if (tasks[i].id === taskId) return true;
    }
    return false;
  }, [tasks]);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tableRef: React.RefObject<HTMLTableElement>) => {
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

    // 左端に近い場合は階層解除モード
    if (mouseX < leftEdge + 50 && draggedTask && (draggedTask.level ?? 0) > 0) {
      setDragMode('unnest');
      setDragOverTaskId(null);
      setNestTargetTaskId(null);
      setDragOverBottom(false);
      return;
    }

    // 行の中央部分は階層化モード
    const rowRelativeY = (mouseY - rect.top) / rect.height;
    const isInMiddleZone = rowRelativeY > 0.3 && rowRelativeY < 0.7;

    const taskNameCell = tr.querySelector('td:nth-child(1)');
    if (taskNameCell && taskId && taskId !== draggedTaskId && isInMiddleZone) {
      const cellRect = taskNameCell.getBoundingClientRect();
      const nestAreaLeft = cellRect.left + cellRect.width * 0.4;
      const isOverNestArea = mouseX >= nestAreaLeft && mouseX <= cellRect.right;

      if (isOverNestArea && hoveredTask) {
        const targetLevel = hoveredTask.level ?? 0;

        if (targetLevel < maxLevel && !isDescendantOf(draggedTaskId, taskId)) {
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
  }, [draggedTaskId, tasks, maxLevel, isDescendantOf]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !relatedTarget.closest('tbody')) {
      setDragOverTaskId(null);
      setDragOverBottom(false);
      setDragMode('reorder');
      setNestTargetTaskId(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetTaskId?: string) => {
    e.preventDefault();

    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

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
      isProcessingRef.current = false;
      return;
    }

    try {
      // 子孫タスクを含めて取得
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

      // 階層解除モード
      if (currentDragMode === 'unnest') {
        const draggedTask = tasks.find(t => t.id === draggedTaskId);
        if (draggedTask && draggedTask.parentId) {
          const parentTask = tasks.find(t => t.id === draggedTask.parentId);
          const newParentId = parentTask?.parentId ?? null;

          if (onUpdateParent) {
            await onUpdateParent(draggedTaskId, newParentId);
          }

          setTasks(prevTasks => {
            const newTasks = [...prevTasks];
            const draggedIndex = newTasks.findIndex(t => t.id === draggedTaskId);
            if (draggedIndex === -1) return prevTasks;

            const draggedLevel = newTasks[draggedIndex].level ?? 0;
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
              task.level = Math.max(0, (task.level ?? 0) - 1);
            });
            movedGroup[0].parentId = newParentId;

            if (newParentId === null) {
              const oldParentIndex = newTasks.findIndex(t => t.id === parentTask?.id);
              if (oldParentIndex !== -1) {
                const oldParentLevel = newTasks[oldParentIndex].level ?? 0;
                let insertIndex = oldParentIndex + 1;
                for (let i = oldParentIndex + 1; i < newTasks.length; i++) {
                  if ((newTasks[i].level ?? 0) <= oldParentLevel) break;
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
                  if ((newTasks[i].level ?? 0) <= newParentLevel) break;
                  insertIndex = i + 1;
                }
                newTasks.splice(insertIndex, 0, ...movedGroup);
              } else {
                newTasks.push(...movedGroup);
              }
            }

            return newTasks;
          });
        }
        return;
      }

      // 階層化モード
      if (currentDragMode === 'nest' && currentNestTarget) {
        if (onUpdateParent) {
          await onUpdateParent(draggedTaskId, currentNestTarget);
        }

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
            if ((newTasks[i].level ?? 0) <= targetLevel) break;
            insertIndex = i + 1;
          }

          newTasks.splice(insertIndex, 0, ...movedGroup);
          return newTasks;
        });
        return;
      }

      // 最後に移動
      if (isDropToBottom) {
        const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
        if (draggedIndex === -1) return;

        const descendantCount = getTaskWithDescendants(draggedIndex);
        const groupSize = 1 + descendantCount;

        if (draggedIndex + groupSize >= tasks.length) return;

        setTasks(prevTasks => {
          const newTasks = [...prevTasks];
          const movedGroup = newTasks.splice(draggedIndex, groupSize);
          newTasks.push(...movedGroup);

          // displayOrderを更新
          newTasks.forEach((task, index) => {
            task.displayOrder = index + 1;
          });

          return newTasks;
        });

        if (onReorder) {
          const newTasks = [...tasks];
          const movedGroup = newTasks.splice(draggedIndex, groupSize);
          newTasks.push(...movedGroup);
          newTasks.forEach((task, index) => {
            task.displayOrder = index + 1;
          });
          await onReorder(newTasks);
        }
        return;
      }

      // 通常の並び替え
      if (!effectiveTargetId || draggedTaskId === effectiveTargetId) return;

      const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
      const targetIndex = tasks.findIndex(t => t.id === effectiveTargetId);

      if (draggedIndex === -1 || targetIndex === -1) return;

      const descendantCount = getTaskWithDescendants(draggedIndex);
      const groupSize = 1 + descendantCount;

      if (targetIndex > draggedIndex && targetIndex <= draggedIndex + descendantCount) return;

      setTasks(prevTasks => {
        const newTasks = [...prevTasks];
        const movedGroup = newTasks.splice(draggedIndex, groupSize);

        let insertIndex: number;
        if (draggedIndex < targetIndex) {
          insertIndex = targetIndex - groupSize;
        } else {
          insertIndex = targetIndex;
        }
        newTasks.splice(insertIndex, 0, ...movedGroup);

        newTasks.forEach((task, index) => {
          task.displayOrder = index + 1;
        });

        return newTasks;
      });

      if (onReorder) {
        const newTasks = [...tasks];
        const movedGroup = newTasks.splice(draggedIndex, groupSize);
        let insertIndex = draggedIndex < targetIndex ? targetIndex - groupSize : targetIndex;
        newTasks.splice(insertIndex, 0, ...movedGroup);
        newTasks.forEach((task, index) => {
          task.displayOrder = index + 1;
        });
        await onReorder(newTasks);
      }
    } finally {
      setDraggedTaskId(null);
      isProcessingRef.current = false;
    }
  }, [draggedTaskId, dragMode, nestTargetTaskId, dragOverBottom, dragOverTaskId, tasks, setTasks, onUpdateParent, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);
  }, []);

  return {
    draggedTaskId,
    dragOverTaskId,
    dragOverBottom,
    dragMode,
    nestTargetTaskId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
