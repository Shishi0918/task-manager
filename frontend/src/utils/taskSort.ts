// タスクソート共通ユーティリティ

// ソート可能なタスクの最小インターフェース
export interface SortableTask {
  id: string;
  parentId?: string | null;
  displayOrder: number;
  isCompleted: boolean;
  startDate?: string | null;
}

// 階層構造を保持したソート
export function sortHierarchically<T extends SortableTask>(
  taskList: T[],
  compareFn: (a: T, b: T) => number
): T[] {
  // ルートタスク（parentIdがnull）を取得
  const rootTasks = taskList.filter(t => !t.parentId);

  // 子タスクをparentIdでグループ化
  const childrenMap = new Map<string, T[]>();
  taskList.forEach(t => {
    if (t.parentId) {
      const children = childrenMap.get(t.parentId) || [];
      children.push(t);
      childrenMap.set(t.parentId, children);
    }
  });

  // 再帰的にソートしてフラット化
  const sortAndFlatten = (tasksToSort: T[]): T[] => {
    const sorted = [...tasksToSort].sort(compareFn);
    const result: T[] = [];

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
}

// 開始日でソートする比較関数
export function compareByStartDate<T extends SortableTask>(a: T, b: T): number {
  if (!a.startDate && !b.startDate) return 0;
  if (!a.startDate) return 1;
  if (!b.startDate) return -1;
  return a.startDate.localeCompare(b.startDate);
}

// displayOrderでソートする比較関数
export function compareByDisplayOrder<T extends SortableTask>(a: T, b: T): number {
  return a.displayOrder - b.displayOrder;
}

// 開始日でソート（未完了タスクを上、完了タスクを下）
export function sortTasksByStartDate<T extends SortableTask>(tasks: T[]): T[] {
  const incompleteTasks = tasks.filter(t => !t.isCompleted);
  const completedTasks = tasks.filter(t => t.isCompleted);

  // 未完了タスクを開始日でソート
  const sortedIncomplete = sortHierarchically(incompleteTasks, compareByStartDate);

  // 完了タスクは元の順序を維持
  const sortedCompleted = sortHierarchically(completedTasks, compareByDisplayOrder);

  // 結合してdisplayOrderを更新
  return [...sortedIncomplete, ...sortedCompleted].map((task, i) => ({
    ...task,
    displayOrder: i + 1,
  }));
}

// displayOrderでソート
export function sortTasksByDisplayOrder<T extends SortableTask>(tasks: T[]): T[] {
  const incompleteTasks = tasks.filter(t => !t.isCompleted);
  const completedTasks = tasks.filter(t => t.isCompleted);

  const sortedIncomplete = sortHierarchically(incompleteTasks, compareByDisplayOrder);
  const sortedCompleted = sortHierarchically(completedTasks, compareByDisplayOrder);

  return [...sortedIncomplete, ...sortedCompleted].map((task, i) => ({
    ...task,
    displayOrder: i + 1,
  }));
}
