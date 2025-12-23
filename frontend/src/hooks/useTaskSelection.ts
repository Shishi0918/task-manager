import { useState, useCallback } from 'react';

interface SelectableTask {
  id: string;
}

export function useTaskSelection<T extends SelectableTask>(tasks: T[]) {
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [lastCheckedTaskId, setLastCheckedTaskId] = useState<string | null>(null);

  const handleToggleTask = useCallback((taskId: string, e?: React.MouseEvent) => {
    const newChecked = new Set(checkedTasks);

    // Shift+クリックで範囲選択
    if (e?.shiftKey && lastCheckedTaskId) {
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
  }, [checkedTasks, lastCheckedTaskId, tasks]);

  const handleToggleAllTasks = useCallback(() => {
    if (checkedTasks.size === tasks.length) {
      setCheckedTasks(new Set());
    } else {
      setCheckedTasks(new Set(tasks.map(t => t.id)));
    }
  }, [checkedTasks.size, tasks]);

  const clearSelection = useCallback(() => {
    setCheckedTasks(new Set());
    setLastCheckedTaskId(null);
  }, []);

  const isAllSelected = tasks.length > 0 && checkedTasks.size === tasks.length;

  return {
    checkedTasks,
    isAllSelected,
    handleToggleTask,
    handleToggleAllTasks,
    clearSelection,
    setCheckedTasks,
  };
}
