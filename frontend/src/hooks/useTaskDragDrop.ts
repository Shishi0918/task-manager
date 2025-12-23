import { useState, useRef, useCallback } from 'react';

// 汎用的なタスク型（最小限の必須プロパティ）
export interface DraggableTask {
  id: string;
  parentId: string | null;
  displayOrder: number;
  level?: number;
  startDate?: string | null;
  endDate?: string | null;
  isCompleted?: boolean;
}

interface UseTaskDragDropOptions<T extends DraggableTask> {
  tasks: T[];
  setTasks: React.Dispatch<React.SetStateAction<T[]>>;
  onUpdateTask: (taskId: string, data: Partial<T>) => Promise<void>;
  onError: (message: string) => void;
  onRefetch: () => void;
}

export function useTaskDragDrop<T extends DraggableTask>({
  tasks,
  setTasks,
  onUpdateTask,
  onError,
  onRefetch,
}: UseTaskDragDropOptions<T>) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverBottom, setDragOverBottom] = useState(false);
  const [dragMode, setDragMode] = useState<'reorder' | 'nest' | 'unnest'>('reorder');
  const [nestTargetTaskId, setNestTargetTaskId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'hidden';
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
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
  }, [draggedTaskId, tasks, isDescendantOf]);

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

          return newTasks;
        });

        setDraggedTaskId(null);
        onUpdateTask(draggedTaskId, { parentId: newParentId } as Partial<T>).catch(err => {
          onError(err instanceof Error ? err.message : '階層の変更に失敗しました');
          onRefetch();
        });
      }
      return;
    }

    // 階層化モード
    if (currentDragMode === 'nest' && currentNestTarget) {
      const parentTask = tasks.find(t => t.id === currentNestTarget);
      const parentStartDate = parentTask?.startDate ?? null;
      const parentEndDate = parentTask?.endDate ?? null;

      const dateUpdates: Array<{ id: string; startDate: string | null; endDate: string | null }> = [];

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

          if (!parentStartDate) {
            if (task.startDate || task.endDate) {
              dateUpdates.push({ id: task.id, startDate: null, endDate: null });
              task.startDate = null;
              task.endDate = null;
            }
          } else {
            let newStartDate = task.startDate ?? null;
            let newEndDate = task.endDate ?? null;
            let needsUpdate = false;

            if (newStartDate && newStartDate < parentStartDate) {
              newStartDate = parentStartDate;
              newEndDate = parentStartDate;
              needsUpdate = true;
            }

            if (parentEndDate && newStartDate && newStartDate > parentEndDate) {
              newStartDate = parentEndDate;
              newEndDate = parentEndDate;
              needsUpdate = true;
            }

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
        return newTasks;
      });

      setDraggedTaskId(null);

      const updatePromises: Promise<void>[] = [
        onUpdateTask(draggedTaskId, { parentId: currentNestTarget } as Partial<T>)
      ];
      for (const update of dateUpdates) {
        updatePromises.push(
          onUpdateTask(update.id, { startDate: update.startDate, endDate: update.endDate } as Partial<T>)
        );
      }

      Promise.all(updatePromises).catch(err => {
        onError(err instanceof Error ? err.message : '階層の変更に失敗しました');
        onRefetch();
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

        const descendantCount = getTaskWithDescendants(draggedIndex);
        const groupSize = 1 + descendantCount;

        if (draggedIndex + groupSize >= tasks.length) {
          setDraggedTaskId(null);
          return;
        }

        const newTasks = [...tasks];
        const movedGroup = newTasks.splice(draggedIndex, groupSize);
        newTasks.push(...movedGroup);

        const updatePromises: Promise<void>[] = [];
        for (let i = 0; i < newTasks.length; i++) {
          if (newTasks[i].displayOrder !== i + 1) {
            newTasks[i] = { ...newTasks[i], displayOrder: i + 1 };
            updatePromises.push(onUpdateTask(newTasks[i].id, { displayOrder: i + 1 } as Partial<T>));
          }
        }

        setTasks(newTasks);
        await Promise.all(updatePromises);
      } catch (err) {
        onError(err instanceof Error ? err.message : '順序の変更に失敗しました');
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

      const descendantCount = getTaskWithDescendants(draggedIndex);
      const groupSize = 1 + descendantCount;

      if (targetIndex > draggedIndex && targetIndex <= draggedIndex + descendantCount) {
        setDraggedTaskId(null);
        return;
      }

      const newTasks = [...tasks];
      const movedGroup = newTasks.splice(draggedIndex, groupSize);

      let insertIndex: number;
      if (draggedIndex < targetIndex) {
        insertIndex = targetIndex - groupSize;
      } else {
        insertIndex = targetIndex;
      }
      newTasks.splice(insertIndex, 0, ...movedGroup);

      const updatePromises: Promise<void>[] = [];
      for (let i = 0; i < newTasks.length; i++) {
        if (newTasks[i].displayOrder !== i + 1) {
          newTasks[i] = { ...newTasks[i], displayOrder: i + 1 };
          updatePromises.push(onUpdateTask(newTasks[i].id, { displayOrder: i + 1 } as Partial<T>));
        }
      }

      setTasks(newTasks);
      await Promise.all(updatePromises);
    } catch (err) {
      onError(err instanceof Error ? err.message : '順序の変更に失敗しました');
    } finally {
      setDraggedTaskId(null);
    }
  }, [dragMode, nestTargetTaskId, dragOverBottom, dragOverTaskId, draggedTaskId, tasks, setTasks, onUpdateTask, onError, onRefetch]);

  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
    }
  }, []);

  return {
    // State
    draggedTaskId,
    dragOverTaskId,
    dragOverBottom,
    dragMode,
    nestTargetTaskId,
    // Refs
    tableRef,
    scrollContainerRef,
    // Handlers
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
