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
  const [lastSavedTaskId, setLastSavedTaskId] = useState<string | null>(null);
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
      const projectData = await projectApi.get(projectId);
      setProject(projectData.project);
      setMembers(projectData.project.members || []);
      // 階層タスクをフラット化して表示用に変換
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

  // Enterキーで次のタスクを編集、または新規タスク追加するためのフラグ
  const [shouldAddNewTask, setShouldAddNewTask] = useState(false);

  // Enterキーで次のタスクを編集するためのキーボードリスナー
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !editingTaskId && checkedTasks.size > 0) {
        e.preventDefault();
        const tasksToCopy = tasks.filter(t => checkedTasks.has(t.id));
        setCopiedTasks(tasksToCopy);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedTasks.length > 0) {
        e.preventDefault();

        try {
          const newTasks: ProjectTask[] = [];

          if (editingTaskId) {
            const editingIndex = tasks.findIndex(t => t.id === editingTaskId);
            if (editingIndex === -1) return;

            const editingTask = tasks[editingIndex];
            const insertBaseLevel = editingTask.level ?? 0;
            const minCopiedLevel = Math.min(...copiedTasks.map(t => t.level ?? 0));
            const baseDisplayOrder = editingIndex === 0
              ? 1
              : (tasks[editingIndex - 1]?.displayOrder ?? 0) + 1;

            const oldIdToNewId = new Map<string, string>();
            const copiedTaskIds = new Set(copiedTasks.map(t => t.id));

            for (let i = 0; i < copiedTasks.length; i++) {
              const sourceTask = copiedTasks[i];
              const relativeLevel = (sourceTask.level ?? 0) - minCopiedLevel;
              const newLevel = insertBaseLevel + relativeLevel;

              const result = await projectApi.createTask(projectId, {
                name: sourceTask.name,
                displayOrder: baseDisplayOrder + i,
                startDate: sourceTask.startDate ?? null,
                endDate: sourceTask.endDate ?? null,
                memberId: sourceTask.memberId ?? null,
              });

              oldIdToNewId.set(sourceTask.id, result.task.id);

              let newParentId: string | null = null;
              if (sourceTask.parentId && copiedTaskIds.has(sourceTask.parentId)) {
                newParentId = oldIdToNewId.get(sourceTask.parentId) ?? null;
              } else if (relativeLevel === 0) {
                newParentId = editingTask.parentId ?? null;
              }

              newTasks.push({
                ...result.task,
                parentId: newParentId,
                level: newLevel,
              });

              if (newParentId) {
                await projectApi.updateTask(projectId, result.task.id, { parentId: newParentId });
              }
            }

            setTasks(prevTasks => {
              const newTaskList = [...prevTasks];
              newTaskList.splice(editingIndex, 0, ...newTasks);
              return newTaskList;
            });

            setEditingTaskId(null);
            setEditingTaskName('');
          } else {
            const maxDisplayOrder = tasks.length > 0
              ? Math.max(...tasks.map(t => t.displayOrder))
              : 0;

            const minCopiedLevel = Math.min(...copiedTasks.map(t => t.level ?? 0));
            const oldIdToNewId = new Map<string, string>();
            const copiedTaskIds = new Set(copiedTasks.map(t => t.id));

            for (let i = 0; i < copiedTasks.length; i++) {
              const sourceTask = copiedTasks[i];
              const newDisplayOrder = maxDisplayOrder + 1 + i;
              const relativeLevel = (sourceTask.level ?? 0) - minCopiedLevel;

              const result = await projectApi.createTask(projectId, {
                name: sourceTask.name,
                displayOrder: newDisplayOrder,
                startDate: sourceTask.startDate ?? null,
                endDate: sourceTask.endDate ?? null,
                memberId: sourceTask.memberId ?? null,
              });

              oldIdToNewId.set(sourceTask.id, result.task.id);

              let newParentId: string | null = null;
              if (sourceTask.parentId && copiedTaskIds.has(sourceTask.parentId)) {
                newParentId = oldIdToNewId.get(sourceTask.parentId) ?? null;
              }

              newTasks.push({
                ...result.task,
                parentId: newParentId,
                level: relativeLevel,
              });

              if (newParentId) {
                await projectApi.updateTask(projectId, result.task.id, { parentId: newParentId });
              }
            }

            setTasks(prevTasks => [...prevTasks, ...newTasks]);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'タスクの貼り付けに失敗しました');
        }
      }
    };

    document.addEventListener('keydown', handleCopyPaste);
    return () => document.removeEventListener('keydown', handleCopyPaste);
  }, [editingTaskId, checkedTasks, copiedTasks, tasks, projectId]);

  const handleAddTask = async () => {
    const tempId = `temp_${Date.now()}`;

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
        displayOrder = insertIndex + 1;
      } else {
        displayOrder = tasks.length + 1;
      }
    } else {
      displayOrder = tasks.length > 0
        ? Math.max(...tasks.map(t => t.displayOrder)) + 1
        : 1;
    }

    const tempTask: ProjectTask = {
      id: tempId,
      projectId,
      name: '',
      memberId: null,
      displayOrder,
      startDate: null,
      endDate: null,
      isCompleted: false,
      parentId,
      level,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setTasks(prevTasks => {
      const newTasks = [...prevTasks];
      newTasks.splice(insertIndex, 0, tempTask);
      return newTasks.map((t, i) => ({ ...t, displayOrder: i + 1 }));
    });
    setEditingTaskId(tempId);
    setEditingTaskName('');

    try {
      const response = await projectApi.createTask(projectId, {
        name: '',
        displayOrder,
        parentId,
      });
      const newTask = response.task;

      let savedName = '';
      setTasks(prevTasks => prevTasks.map(t => {
        if (t.id === tempId) {
          savedName = t.name;
          return { ...t, id: newTask.id };
        }
        return t;
      }));

      setEditingTaskId(prevId => prevId === tempId ? newTask.id : prevId);

      if (savedName) {
        projectApi.updateTask(projectId, newTask.id, { name: savedName }).catch(err => {
          console.error('Failed to save task name:', err);
        });
      }
    } catch (err) {
      setTasks(prevTasks => prevTasks.filter(t => t.id !== tempId));
      setEditingTaskId(null);
      setError(err instanceof Error ? err.message : 'タスクの追加に失敗しました');
    }
  };

  const handleToggleTaskCheck = (taskId: string, event?: React.MouseEvent) => {
    const isShiftClick = event?.shiftKey ?? false;

    if (isShiftClick && lastCheckedTaskId) {
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
      setCheckedTasks(new Set());
    } else {
      setCheckedTasks(new Set(tasks.map(t => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (checkedTasks.size === 0) {
      return;
    }

    try {
      const checkedTaskIds = Array.from(checkedTasks);
      setTasks(prevTasks => prevTasks.filter(task => !checkedTasks.has(task.id)));
      setCheckedTasks(new Set());

      await projectApi.bulkDeleteTasks(projectId, checkedTaskIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの削除に失敗しました');
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

    setTasks(prevTasks =>
      prevTasks.map(t =>
        t.id === taskId ? { ...t, name: trimmedName } : t
      )
    );
    setEditingTaskId(null);
    setLastSavedTaskId(taskId);

    if (taskId.startsWith('temp_')) {
      return;
    }

    projectApi.updateTask(projectId, taskId, { name: trimmedName }).catch(err => {
      setError(err instanceof Error ? err.message : 'タスク名の更新に失敗しました');
    });
  };

  const handleCancelEditTaskName = () => {
    setEditingTaskId(null);
    setEditingTaskName('');
    setLastSavedTaskId(null);
  };

  const handleUpdateMember = async (taskId: string, memberId: string | null) => {
    if (taskId.startsWith('temp_')) {
      return;
    }

    setTasks(prevTasks =>
      prevTasks.map(t =>
        t.id === taskId ? { ...t, memberId, member: members.find(m => m.id === memberId) || null } : t
      )
    );

    projectApi.updateTask(projectId, taskId, { memberId }).catch(err => {
      setError(err instanceof Error ? err.message : '担当者の更新に失敗しました');
    });
  };

  const handleCellClick = async (taskId: string, day: number) => {
    const selectingTaskId = Object.keys(selectedStartDays).find(
      id => selectedStartDays[id] !== null && selectedStartDays[id] !== undefined
    );
    if (selectingTaskId && selectingTaskId !== taskId) {
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    const currentStartDay = selectedStartDays[taskId];

    if (task?.parentId) {
      const parentTask = tasks.find(t => t.id === task.parentId);
      if (parentTask) {
        if (!parentTask.startDate || !parentTask.endDate) {
          return;
        }
        const parentStartDay = parseInt(parentTask.startDate.split('-')[2], 10);
        const parentEndDay = parseInt(parentTask.endDate.split('-')[2], 10);
        if (day < parentStartDay || day > parentEndDay) {
          return;
        }
      }
    }

    if (task && isDateInRange(task, day) && (currentStartDay === null || currentStartDay === undefined)) {
      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId ? { ...t, startDate: null, endDate: null } : t
      ));

      if (!taskId.startsWith('temp_')) {
        try {
          await projectApi.updateTask(projectId, taskId, { startDate: null, endDate: null });
        } catch (err) {
          setError(err instanceof Error ? err.message : '日付のクリアに失敗しました');
        }
      }
      return;
    }

    if (currentStartDay === null || currentStartDay === undefined) {
      setSelectedStartDays({ ...selectedStartDays, [taskId]: day });
    } else {
      if (day < currentStartDay) {
        return;
      }
      const startDay = currentStartDay;
      const endDay = day;

      const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId
          ? { ...t, startDate: startDateStr, endDate: endDateStr }
          : t
      ));
      setSelectedStartDays({ ...selectedStartDays, [taskId]: null });
      setHoverDays({ ...hoverDays, [taskId]: null });

      try {
        await projectApi.updateTask(projectId, taskId, { startDate: startDateStr, endDate: endDateStr });
      } catch (err) {
        setError(err instanceof Error ? err.message : '期間の設定に失敗しました');
        await fetchData();
      }
    }
  };

  const isDateInRange = (task: ProjectTask, day: number): boolean => {
    if (!task.startDate || !task.endDate) return false;

    const [startYear, startMonth, startDay] = task.startDate.split('T')[0].split('-').map(Number);
    const [endYear, endMonth, endDay] = task.endDate.split('T')[0].split('-').map(Number);

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

  // ドラッグ&ドロップ関連のハンドラー
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
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

  const handleDragLeave = (e: React.DragEvent) => {
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
        projectApi.updateTask(projectId, draggedTaskId, { parentId: newParentId }).catch(err => {
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
      const updatePromises: Promise<unknown>[] = [
        projectApi.updateTask(projectId, draggedTaskId, { parentId: currentNestTarget })
      ];
      for (const update of dateUpdates) {
        updatePromises.push(
          projectApi.updateTask(projectId, update.id, { startDate: update.startDate, endDate: update.endDate })
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
        const updatePromises: Promise<unknown>[] = [];
        for (let i = 0; i < newTasks.length; i++) {
          if (newTasks[i].displayOrder !== i + 1) {
            newTasks[i] = { ...newTasks[i], displayOrder: i + 1 };
            updatePromises.push(projectApi.updateTask(projectId, newTasks[i].id, { displayOrder: i + 1 }));
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
      const updatePromises: Promise<unknown>[] = [];
      for (let i = 0; i < newTasks.length; i++) {
        if (newTasks[i].displayOrder !== i + 1) {
          newTasks[i] = { ...newTasks[i], displayOrder: i + 1 };
          updatePromises.push(projectApi.updateTask(projectId, newTasks[i].id, { displayOrder: i + 1 }));
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
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
    }
  };

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
      return a.displayOrder - b.displayOrder;
    });

    const sorted = [...sortedIncomplete, ...sortedCompleted].map((task, i) => ({
      ...task,
      displayOrder: i + 1,
    }));

    setTasks(sorted);

    try {
      const updatePromises = sorted.map((task, i) =>
        projectApi.updateTask(projectId, task.id, { displayOrder: i + 1 })
      );
      await Promise.all(updatePromises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ソートに失敗しました');
      await fetchData();
    }
  };

  const handleCompleteSelected = async () => {
    if (checkedTasks.size === 0) {
      return;
    }

    const checkedTaskObjects = tasks.filter(t => checkedTasks.has(t.id));
    const allCompleted = checkedTaskObjects.every(t => t.isCompleted);
    const newCompletedStatus = !allCompleted;

    // 完了しても位置を移動しない（そのままの場所でグレーアウト）
    const updatedTasks = tasks.map(t => {
      if (checkedTasks.has(t.id)) {
        return { ...t, isCompleted: newCompletedStatus };
      }
      return t;
    });

    setTasks(updatedTasks);
    setCheckedTasks(new Set());

    try {
      const updatePromises: Promise<unknown>[] = [];
      for (const taskId of checkedTasks) {
        updatePromises.push(projectApi.updateTask(projectId, taskId, { isCompleted: newCompletedStatus }));
      }
      await Promise.all(updatePromises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの完了/未完了の切り替えに失敗しました');
      await fetchData();
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
                className="text-white hover:text-white/80 flex items-center"
              >
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                戻る
              </button>
              <h1 className="text-2xl font-bold text-white tracking-wide">
                {project?.name || 'プロジェクト'}
              </h1>
            </div>
            <button
              onClick={onNavigateToSettings}
              className="p-2 text-white hover:bg-white/20 rounded-md transition-colors"
              title="設定"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
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
                  <th className="px-2 py-2 text-xs font-medium bg-[#5B9BD5] text-white sticky left-[140px] z-30 w-[100px] min-w-[100px]" style={{ boxShadow: '1px 0 0 0 #d1d5db' }}>
                    担当者
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
                              className={`min-h-[20px] flex items-center flex-1 min-w-0 overflow-hidden ${isCompletedTask ? 'cursor-default' : 'cursor-text'}`}
                            >
                              <span className="truncate">
                                {task.name || <span className="text-gray-400">タスク名</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`border-b border-gray-200 px-1 py-1 text-center sticky left-[140px] z-10 w-[100px] min-w-[100px] ${rowBgClass}`} style={{ boxShadow: '1px 0 0 0 #e5e7eb' }}>
                        <select
                          value={task.memberId || ''}
                          onChange={(e) => handleUpdateMember(task.id, e.target.value || null)}
                          disabled={isCompletedTask}
                          className={`w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${isCompletedTask ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                          style={task.member?.color ? { borderLeftColor: task.member.color, borderLeftWidth: '3px' } : {}}
                        >
                          <option value="">未割当</option>
                          {members.map(member => (
                            <option key={member.id} value={member.id}>{member.name}</option>
                          ))}
                        </select>
                      </td>
                      {days.map((day) => {
                        const date = new Date(year, month - 1, day);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const isHoliday = holidays.has(day);
                        const isNonWorkday = isWeekend || isHoliday;
                        const inRange = isDateInRange(task, day);
                        const isStartDay = taskStartDay === day;

                        const isSelectingEndDay = taskStartDay !== null && taskStartDay !== undefined;
                        const isBeforeStartDay = isSelectingEndDay && day < taskStartDay;

                        const isInPreviewRange =
                          isSelectingEndDay &&
                          taskHoverDay !== null &&
                          taskHoverDay !== undefined &&
                          taskHoverDay >= taskStartDay &&
                          day >= taskStartDay &&
                          day <= taskHoverDay;

                        const rangeStartDay = task.startDate ? parseInt(task.startDate.split('T')[0].split('-')[2]) : null;
                        const rangeEndDay = task.endDate ? parseInt(task.endDate.split('T')[0].split('-')[2]) : null;
                        const isRangeStart = inRange && rangeStartDay === day;
                        const isRangeEnd = inRange && rangeEndDay === day;

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
                      colSpan={days.length + 2}
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
                    colSpan={days.length + 2}
                    className="border-b border-r border-gray-200 px-4 py-3 text-center text-gray-400 text-sm"
                  >
                    + クリックしてタスクを追加
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="inline-block" style={{ width: 'calc(100% - 240px)', minWidth: '800px' }} />
          </div>
        </div>
      </main>
    </div>
  );
}
