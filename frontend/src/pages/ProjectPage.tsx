import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { projectApi } from '../services/api';
import type { ProjectTask, ProjectDetail, ProjectMember } from '../types';
import { getHolidaysForMonth } from '../utils/holidays';
import { sortTasksByStartDate } from '../utils/taskSort';
import { GanttChart } from '../components/GanttChart';
import type { CalendarDay } from '../components/GanttChart';

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

  // 日付選択状態
  const [selectedStartDate, setSelectedStartDate] = useState<Record<string, string | null>>({});
  const [hoverDate, setHoverDate] = useState<Record<string, string | null>>({});

  // チェック状態
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [lastCheckedTaskId, setLastCheckedTaskId] = useState<string | null>(null);

  // 編集状態
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [lastSavedTaskId, setLastSavedTaskId] = useState<string | null>(null);
  const [shouldAddNewTask, setShouldAddNewTask] = useState(false);

  // ドラッグ状態
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverBottom, setDragOverBottom] = useState(false);
  const [dragMode, setDragMode] = useState<'reorder' | 'nest' | 'unnest'>('reorder');
  const [nestTargetTaskId, setNestTargetTaskId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 仮ID → 実IDのマッピング
  const tempIdMapRef = useRef<Map<string, string>>(new Map());

  // 表示中の年月
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());
  const [displayMonth, setDisplayMonth] = useState(new Date().getMonth() + 1);

  // カレンダー開始位置（現在月の1ヶ月前から24ヶ月分）
  const calendarStart = useMemo(() => {
    const now = new Date();
    let startMonth = now.getMonth();
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
        const offset = 240; // タスク列 + 担当者列
        scrollContainerRef.current.scrollLeft = Math.max(0, todayIndex * dayColumnWidth - offset);
      }
    }
  }, [calendarDays]);

  // データ取得
  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const projectData = await projectApi.get(projectId);
      setProject(projectData.project);
      setMembers(projectData.project.members || []);

      // APIから返されたタスクをそのまま使う（階層処理なし）
      const allTasks: ProjectTask[] = projectData.project.tasks || [];

      // デバッグ: APIレスポンスを確認
      console.log('API Response tasks:', allTasks.length, allTasks.map(t => ({ id: t.id, name: t.name, parentId: t.parentId })));

      // IDで重複排除
      const seen = new Set<string>();
      const uniqueTasks = allTasks.filter(t => {
        if (seen.has(t.id)) {
          console.log('Duplicate found:', t.id, t.name);
          return false;
        }
        seen.add(t.id);
        return true;
      });

      console.log('After dedup:', uniqueTasks.length);

      // parentIdからlevelを計算する関数
      const calculateLevel = (taskId: string, taskMap: Map<string, ProjectTask>, visited: Set<string> = new Set()): number => {
        if (visited.has(taskId)) return 0; // 循環参照防止
        visited.add(taskId);

        const task = taskMap.get(taskId);
        if (!task || !task.parentId) return 0;

        const parentTask = taskMap.get(task.parentId);
        if (!parentTask) return 0;

        return 1 + calculateLevel(task.parentId, taskMap, visited);
      };

      // タスクマップを作成
      const taskMap = new Map(uniqueTasks.map(t => [t.id, t]));

      // displayOrderでソート、levelをparentIdから計算
      const sortedTasks = uniqueTasks
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(t => ({ ...t, level: calculateLevel(t.id, taskMap) }));

      setTasks(sortedTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  // スクロールで表示月を更新
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const dayColumnWidth = 53;
    const offset = 240;
    const visibleDayIndex = Math.floor((scrollLeft + offset) / dayColumnWidth);
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

  // タスク追加（楽観的UI: API待ち前に表示）
  const handleAddTask = async () => {
    const tempId = `temp-${Date.now()}`;
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.displayOrder)) : 0;
    const newTask: ProjectTask = {
      id: tempId,
      projectId,
      name: '',
      displayOrder: maxOrder + 1,
      isCompleted: false,
      level: 0,
      startDate: null,
      endDate: null,
      memberId: null,
      parentId: null,
      children: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 即座に画面に追加
    setTasks(prev => [...prev, newTask]);
    setEditingTaskId(tempId);

    // バックグラウンドでAPI呼び出し
    try {
      const result = await projectApi.createTask(projectId, {
        name: '',
        displayOrder: maxOrder + 1,
      });
      // 仮ID→実IDのマッピングを保存
      tempIdMapRef.current.set(tempId, result.task.id);
      // 編集中のタスクIDも更新（入力中に勝手に閉じないようにする）
      setEditingTaskId(prev => prev === tempId ? result.task.id : prev);
      // 仮IDを実際のIDに置換（ローカルで変更された名前は保持する）
      setTasks(prev => prev.map(t => {
        if (t.id === tempId) {
          return { ...result.task, level: 0, name: t.name || result.task.name };
        }
        return t;
      }));
    } catch (err) {
      // 失敗時は仮タスクを削除
      setTasks(prev => prev.filter(t => t.id !== tempId));
      setEditingTaskId(null);
      setError(err instanceof Error ? err.message : 'タスクの追加に失敗しました');
    }
  };

  // タスク名保存（楽観的UI: 即座に画面更新、APIはバックグラウンド）
  const handleSaveTaskName = useCallback(async (taskId: string, name: string) => {
    // 即座に画面を更新
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, name } : t));
    setEditingTaskId(null);
    setLastSavedTaskId(taskId);

    // バックグラウンドでAPI呼び出し
    const saveToServer = async () => {
      // 仮IDの場合は実IDを待つ
      if (taskId.startsWith('temp-') && !tempIdMapRef.current.has(taskId)) {
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (tempIdMapRef.current.has(taskId)) break;
        }
      }

      const finalId = tempIdMapRef.current.get(taskId) || taskId;
      if (finalId.startsWith('temp-')) return; // まだ解決されていない

      try {
        await projectApi.updateTask(projectId, finalId, { name });
        // IDが変わった場合はタスクリストを更新
        if (finalId !== taskId) {
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, id: finalId, name } : t));
        }
        tempIdMapRef.current.delete(taskId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'タスク名の保存に失敗しました');
      }
    };

    saveToServer();
  }, [projectId]);

  // 編集キャンセル
  const handleCancelEdit = useCallback(() => {
    setEditingTaskId(null);
  }, []);

  // チェックボックス
  const handleToggleAllTasks = () => {
    if (checkedTasks.size === tasks.length) {
      setCheckedTasks(new Set());
    } else {
      setCheckedTasks(new Set(tasks.map(t => t.id)));
    }
  };

  const handleToggleTaskCheck = (taskId: string, e: React.MouseEvent) => {
    const newChecked = new Set(checkedTasks);

    if (e.shiftKey && lastCheckedTaskId) {
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
  };

  // 子タスクを再帰的に取得
  const getDescendantIds = (parentIds: Set<string>): Set<string> => {
    const descendants = new Set<string>();
    const findChildren = (ids: Set<string>) => {
      for (const id of ids) {
        const children = tasks.filter(t => t.parentId === id);
        for (const child of children) {
          if (!descendants.has(child.id)) {
            descendants.add(child.id);
            findChildren(new Set([child.id]));
          }
        }
      }
    };
    findChildren(parentIds);
    return descendants;
  };

  // 完了切り替え
  const handleCompleteSelected = async () => {
    if (checkedTasks.size === 0) return;
    const checkedTaskObjects = tasks.filter(t => checkedTasks.has(t.id));
    const allCompleted = checkedTaskObjects.every(t => t.isCompleted);
    const newIsCompleted = !allCompleted;

    // 完了にする場合は子タスクも含める
    let targetIds = new Set(checkedTasks);
    if (newIsCompleted) {
      const descendantIds = getDescendantIds(checkedTasks);
      targetIds = new Set([...checkedTasks, ...descendantIds]);
    }

    setTasks(prev => prev.map(t =>
      targetIds.has(t.id) ? { ...t, isCompleted: newIsCompleted } : t
    ));

    try {
      await Promise.all(
        Array.from(targetIds).map(id =>
          projectApi.updateTask(projectId, id, { isCompleted: newIsCompleted })
        )
      );
      setCheckedTasks(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : '完了状態の更新に失敗しました');
      fetchData();
    }
  };

  // 削除
  const handleBulkDelete = async () => {
    if (checkedTasks.size === 0) return;
    if (!confirm(`${checkedTasks.size}件のタスクを削除しますか？`)) return;

    setTasks(prev => prev.filter(t => !checkedTasks.has(t.id)));

    try {
      await projectApi.bulkDeleteTasks(projectId, Array.from(checkedTasks));
      setCheckedTasks(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タスクの削除に失敗しました');
      fetchData();
    }
  };

  // 開始日でソート
  const handleSortByStartDate = async () => {
    const sorted = sortTasksByStartDate(tasks);
    setTasks(sorted);

    try {
      const updates = sorted.map((task, i) => ({
        id: task.id,
        displayOrder: i + 1,
      }));
      await projectApi.bulkUpdateTasks(projectId, updates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ソートに失敗しました');
      fetchData();
    }
  };

  // CSVダウンロード（階層情報あり）
  const handleCsvDownload = () => {
    const headers = ['タスク名', '親タスク', 'レベル', '担当者', '開始日', '終了日', '完了'];
    const rows = tasks.map(task => {
      const member = members.find(m => m.id === task.memberId);
      const parentTask = task.parentId ? tasks.find(t => t.id === task.parentId) : null;
      return [
        task.name,
        parentTask?.name || '',
        String(task.level ?? 0),
        member?.name || '',
        task.startDate || '',
        task.endDate || '',
        task.isCompleted ? '完了' : ''
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project?.name || 'project'}_tasks.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // CSVインポート（階層情報あり）
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('CSVからタスクをインポートします。続行しますか？')) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim());

      if (lines.length < 2) {
        setError('CSVファイルにデータがありません');
        e.target.value = '';
        return;
      }

      // CSVパース関数
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      // ヘッダーを解析してフォーマットを判定
      const headerLine = parseCsvLine(lines[0]);
      const hasHierarchy = headerLine.includes('親タスク') || headerLine.includes('レベル');

      // ヘッダーをスキップしてデータ行をパース
      const csvRows = lines.slice(1).map(line => parseCsvLine(line));

      // 既存タスク名のセット
      const existingNames = new Set(tasks.map(t => t.name));

      // 新規タスクのみをフィルタ
      const newRows = csvRows.filter(row => {
        const name = row[0];
        return name && !existingNames.has(name);
      });

      if (newRows.length === 0) {
        setError('インポートする新規タスクがありません');
        e.target.value = '';
        return;
      }

      // メンバー名→IDマップ
      const memberNameToId = new Map(members.map(m => [m.name, m.id]));

      // タスク名→IDマップ（既存 + 新規作成分）
      const taskNameToId = new Map(tasks.map(t => [t.name, t.id]));

      // タスクを作成
      const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.displayOrder)) : 0;

      // 階層情報を持つタスクの親設定を後で行う
      const tasksToSetParent: { taskId: string; parentName: string }[] = [];

      for (let i = 0; i < newRows.length; i++) {
        let name: string, parentName: string, memberName: string, startDate: string, endDate: string, completed: string;

        if (hasHierarchy) {
          // 新フォーマット: タスク名, 親タスク, レベル, 担当者, 開始日, 終了日, 完了
          const row = newRows[i];
          name = row[0];
          parentName = row[1];
          // row[2] is level (not used, calculated from parentId)
          memberName = row[3];
          startDate = row[4];
          endDate = row[5];
          completed = row[6];
        } else {
          // 旧フォーマット: タスク名, 担当者, 開始日, 終了日, 完了
          [name, memberName, startDate, endDate, completed] = newRows[i];
          parentName = '';
        }

        // 日付をYYYY-MM-DD形式に変換（ISO形式から抽出）
        const formatDateForApi = (dateStr: string): string | null => {
          if (!dateStr) return null;
          const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
          return match ? match[1] : dateStr;
        };

        try {
          const result = await projectApi.createTask(projectId, {
            name,
            memberId: memberName ? memberNameToId.get(memberName) || null : null,
            startDate: formatDateForApi(startDate),
            endDate: formatDateForApi(endDate),
            displayOrder: maxOrder + i + 1,
          });

          // 新規作成したタスクをマップに追加
          taskNameToId.set(name, result.task.id);

          if (completed === '完了') {
            await projectApi.updateTask(projectId, result.task.id, { isCompleted: true });
          }

          // 親タスクがある場合は後で設定
          if (parentName) {
            tasksToSetParent.push({ taskId: result.task.id, parentName });
          }
        } catch (err) {
          console.error(`タスク "${name}" の作成に失敗:`, err);
        }
      }

      // 親タスクを設定
      for (const { taskId, parentName } of tasksToSetParent) {
        const parentId = taskNameToId.get(parentName);
        if (parentId) {
          try {
            await projectApi.updateTask(projectId, taskId, { parentId });
          } catch (err) {
            console.error(`タスクの親設定に失敗:`, err);
          }
        }
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSVインポートに失敗しました');
    }

    e.target.value = '';
  };

  // 日付範囲内判定
  const isDateInRange = (task: ProjectTask, dateStr: string): boolean => {
    if (!task.startDate || !task.endDate) return false;
    // ISO形式からYYYY-MM-DD部分を抽出して比較
    const normalizeDate = (d: string) => d.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || d;
    const start = normalizeDate(task.startDate);
    const end = normalizeDate(task.endDate);
    return dateStr >= start && dateStr <= end;
  };

  // 日付クリック
  const handleCellClick = async (taskId: string, dateStr: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.isCompleted) return;

    // 親タスクの日付範囲をチェック
    if (task.parentId) {
      const parentTask = tasks.find(t => t.id === task.parentId);
      if (parentTask) {
        // 親に日付範囲がない場合は子も日付設定不可
        if (!parentTask.startDate || !parentTask.endDate) {
          return;
        }
        // クリックした日が親の範囲外なら無視
        if (dateStr < parentTask.startDate || dateStr > parentTask.endDate) {
          return;
        }
      }
    }

    const currentStartDate = selectedStartDate[taskId];

    // 既に確定した範囲内をクリックした場合はクリア
    if (task && isDateInRange(task, dateStr) && (currentStartDate === null || currentStartDate === undefined)) {
      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId ? { ...t, startDate: null, endDate: null } : t
      ));
      try {
        await projectApi.updateTask(projectId, taskId, { startDate: null, endDate: null });
      } catch (err) {
        setError(err instanceof Error ? err.message : '日付のクリアに失敗しました');
      }
      return;
    }

    if (currentStartDate === null || currentStartDate === undefined) {
      // 開始日を選択
      setSelectedStartDate({ ...selectedStartDate, [taskId]: dateStr });
    } else {
      // 終了日を選択
      if (dateStr < currentStartDate) return;

      const startDateStr = currentStartDate;
      const endDateStr = dateStr;

      setTasks(prevTasks => prevTasks.map(t =>
        t.id === taskId ? { ...t, startDate: startDateStr, endDate: endDateStr } : t
      ));
      setSelectedStartDate({ ...selectedStartDate, [taskId]: null });
      setHoverDate({ ...hoverDate, [taskId]: null });

      try {
        await projectApi.updateTask(projectId, taskId, { startDate: startDateStr, endDate: endDateStr });
      } catch (err) {
        setError(err instanceof Error ? err.message : '日付の更新に失敗しました');
        fetchData();
      }
    }
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

  // ドラッグ&ドロップ
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    // ドラッグ中のタスクの情報を取得
    const draggedTask = tasks.find(t => t.id === draggedTaskId);
    const hasParent = !!draggedTask?.parentId;

    // div-based structure: query all elements with data-task-id attribute
    const rows = Array.from(document.querySelectorAll('[data-task-id]'));
    const mouseY = e.clientY;
    const mouseX = e.clientX;

    // 階層解除判定: 親を持つタスクをドラッグ中で、マウスが左端付近にある場合
    const UNNEST_THRESHOLD = 50; // 左端50px以内でunnestモード
    const container = document.querySelector('[data-task-id]')?.parentElement;
    const containerLeft = container?.getBoundingClientRect().left ?? 0;
    const relativeX = mouseX - containerLeft;

    if (hasParent && relativeX < UNNEST_THRESHOLD) {
      setDragOverTaskId(null);
      setDragOverBottom(false);
      setDragMode('unnest');
      setNestTargetTaskId(null);
      return;
    }

    let foundTarget = false;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const taskId = row.getAttribute('data-task-id');
      if (!taskId || taskId === draggedTaskId) continue;

      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        const relativeY = mouseY - rect.top;
        const rowHeight = rect.height;

        if (relativeY < rowHeight * 0.3) {
          setDragOverTaskId(taskId);
          setDragOverBottom(false);
          setDragMode('reorder');
          setNestTargetTaskId(null);
        } else if (relativeY < rowHeight * 0.7) {
          setDragOverTaskId(null);
          setDragOverBottom(false);
          setDragMode('nest');
          setNestTargetTaskId(taskId);
        } else {
          setDragOverTaskId(taskId);
          setDragOverBottom(false);
          setDragMode('reorder');
          setNestTargetTaskId(null);
        }
        foundTarget = true;
        break;
      }
    }

    if (!foundTarget) {
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        const rect = lastRow.getBoundingClientRect();
        if (mouseY > rect.bottom) {
          setDragOverTaskId(null);
          setDragOverBottom(true);
          setDragMode('reorder');
          setNestTargetTaskId(null);
        }
      }
    }
  };

  const handleDragLeave = () => {
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setNestTargetTaskId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetTaskId?: string) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    const currentDragMode = dragMode;
    const currentNestTarget = nestTargetTaskId;
    const isDropToBottom = dragOverBottom;

    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);

    // 階層化モード
    if (currentDragMode === 'nest' && currentNestTarget) {
      // 仮IDの場合はスキップ（まだ作成中のタスク）
      if (draggedTaskId.startsWith('temp-') || currentNestTarget.startsWith('temp-')) {
        setDraggedTaskId(null);
        return;
      }

      // 子タスクを含めて移動するタスクを収集
      const collectTaskAndChildren = (taskId: string, allTasks: ProjectTask[]): string[] => {
        const result: string[] = [taskId];
        const children = allTasks.filter(t => t.parentId === taskId);
        for (const child of children) {
          result.push(...collectTaskAndChildren(child.id, allTasks));
        }
        return result;
      };

      const tasksToMove = collectTaskAndChildren(draggedTaskId, tasks);

      // ターゲットが移動対象の子タスクの場合はスキップ（自分の子の下に階層化しようとしている）
      if (tasksToMove.includes(currentNestTarget)) {
        setDraggedTaskId(null);
        return;
      }

      setTasks(prevTasks => {
        const targetTask = prevTasks.find(t => t.id === currentNestTarget);
        if (!targetTask) return prevTasks;

        const targetLevel = targetTask.level ?? 0;
        const draggedTask = prevTasks.find(t => t.id === draggedTaskId);
        if (!draggedTask) return prevTasks;

        const oldLevel = draggedTask.level ?? 0;
        const levelDiff = (targetLevel + 1) - oldLevel;

        // 移動するタスクを抽出（順序を保持）
        const movedTasks: ProjectTask[] = [];
        for (const taskId of tasksToMove) {
          const task = prevTasks.find(t => t.id === taskId);
          if (task) {
            // レベルを調整
            const newTask = { ...task };
            if (taskId === draggedTaskId) {
              newTask.parentId = currentNestTarget;
              newTask.level = targetLevel + 1;
            } else {
              // 子タスクはレベル差分を適用
              newTask.level = (task.level ?? 0) + levelDiff;
            }
            movedTasks.push(newTask);
          }
        }

        // 移動するタスクを元の配列から削除
        const filteredTasks = prevTasks.filter(t => !tasksToMove.includes(t.id));

        // ターゲットの新しいインデックスを見つける
        const newTargetIndex = filteredTasks.findIndex(t => t.id === currentNestTarget);

        // ターゲットの直後に挿入
        filteredTasks.splice(newTargetIndex + 1, 0, ...movedTasks);

        return filteredTasks;
      });

      setDraggedTaskId(null);
      projectApi.updateTask(projectId, draggedTaskId, { parentId: currentNestTarget }).catch(err => {
        setError(err instanceof Error ? err.message : '階層の変更に失敗しました');
        fetchData();
      });
      return;
    }

    // 階層解除モード
    if (currentDragMode === 'unnest') {
      const draggedTask = tasks.find(t => t.id === draggedTaskId);
      if (!draggedTask || !draggedTask.parentId) {
        setDraggedTaskId(null);
        return;
      }

      // 仮IDの場合はスキップ
      if (draggedTaskId.startsWith('temp-')) {
        setDraggedTaskId(null);
        return;
      }

      // 現在の親タスクを取得
      const currentParent = tasks.find(t => t.id === draggedTask.parentId);
      // 新しい親（祖父母）を取得。親がなければnull（ルートレベルへ）
      const newParentId = currentParent?.parentId || null;
      const newLevel = newParentId ? (tasks.find(t => t.id === newParentId)?.level ?? 0) + 1 : 0;

      // 子タスクを含めて移動するタスクを収集
      const collectTaskAndChildren = (taskId: string, allTasks: ProjectTask[]): string[] => {
        const result: string[] = [taskId];
        const children = allTasks.filter(t => t.parentId === taskId);
        for (const child of children) {
          result.push(...collectTaskAndChildren(child.id, allTasks));
        }
        return result;
      };

      const tasksToMove = collectTaskAndChildren(draggedTaskId, tasks);
      const oldLevel = draggedTask.level ?? 0;
      const levelDiff = newLevel - oldLevel;

      setTasks(prevTasks => {
        // レベルを調整
        return prevTasks.map(task => {
          if (task.id === draggedTaskId) {
            return { ...task, parentId: newParentId, level: newLevel };
          } else if (tasksToMove.includes(task.id)) {
            return { ...task, level: (task.level ?? 0) + levelDiff };
          }
          return task;
        });
      });

      setDraggedTaskId(null);
      projectApi.updateTask(projectId, draggedTaskId, { parentId: newParentId }).catch(err => {
        setError(err instanceof Error ? err.message : '階層解除に失敗しました');
        fetchData();
      });
      return;
    }

    // 仮IDの場合はドラッグ操作をスキップ
    if (draggedTaskId.startsWith('temp-')) {
      setDraggedTaskId(null);
      return;
    }

    // 最後に移動
    if (isDropToBottom) {
      const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
      if (draggedIndex === -1) {
        setDraggedTaskId(null);
        return;
      }

      // 子タスクを含めて移動するタスクを収集
      const collectTaskAndChildren = (taskId: string, allTasks: ProjectTask[]): string[] => {
        const result: string[] = [taskId];
        const children = allTasks.filter(t => t.parentId === taskId);
        for (const child of children) {
          result.push(...collectTaskAndChildren(child.id, allTasks));
        }
        return result;
      };

      const tasksToMove = collectTaskAndChildren(draggedTaskId, tasks);

      // 移動するタスクを抽出（順序を保持）
      const movedTasks: ProjectTask[] = [];
      for (const taskId of tasksToMove) {
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
          movedTasks.push(tasks[idx]);
        }
      }

      // すでに最後にある場合はスキップ
      const lastTaskId = tasks[tasks.length - 1]?.id;
      if (tasksToMove.includes(lastTaskId)) {
        setDraggedTaskId(null);
        return;
      }

      // 移動するタスクを元の配列から削除
      const filteredTasks = tasks.filter(t => !tasksToMove.includes(t.id));

      // 最後に追加
      filteredTasks.push(...movedTasks);

      const updatePromises: Promise<any>[] = [];
      for (let i = 0; i < filteredTasks.length; i++) {
        if (filteredTasks[i].displayOrder !== i + 1 && !filteredTasks[i].id.startsWith('temp-')) {
          filteredTasks[i] = { ...filteredTasks[i], displayOrder: i + 1 };
          updatePromises.push(projectApi.updateTask(projectId, filteredTasks[i].id, { displayOrder: i + 1 }));
        }
      }

      setTasks(filteredTasks);
      setDraggedTaskId(null);
      await Promise.all(updatePromises);
      return;
    }

    const effectiveTargetId = targetTaskId || dragOverTaskId;
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

    // 子タスクを含めて移動するタスクを収集
    const collectTaskAndChildren = (taskId: string, allTasks: ProjectTask[]): string[] => {
      const result: string[] = [taskId];
      const children = allTasks.filter(t => t.parentId === taskId);
      for (const child of children) {
        result.push(...collectTaskAndChildren(child.id, allTasks));
      }
      return result;
    };

    const tasksToMove = collectTaskAndChildren(draggedTaskId, tasks);

    // ターゲットが移動対象の子タスクの場合はスキップ
    if (tasksToMove.includes(effectiveTargetId)) {
      setDraggedTaskId(null);
      return;
    }

    const newTasks = [...tasks];

    // 移動するタスクを抽出（順序を保持）
    const movedTasks: ProjectTask[] = [];
    for (const taskId of tasksToMove) {
      const idx = newTasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        movedTasks.push(newTasks[idx]);
      }
    }

    // 移動するタスクを元の配列から削除
    const filteredTasks = newTasks.filter(t => !tasksToMove.includes(t.id));

    // ターゲットの新しいインデックスを見つける
    const newTargetIndex = filteredTasks.findIndex(t => t.id === effectiveTargetId);

    // ターゲットの位置に挿入
    filteredTasks.splice(newTargetIndex, 0, ...movedTasks);

    const updatePromises: Promise<any>[] = [];
    for (let i = 0; i < filteredTasks.length; i++) {
      if (filteredTasks[i].displayOrder !== i + 1 && !filteredTasks[i].id.startsWith('temp-')) {
        filteredTasks[i] = { ...filteredTasks[i], displayOrder: i + 1 };
        updatePromises.push(projectApi.updateTask(projectId, filteredTasks[i].id, { displayOrder: i + 1 }));
      }
    }

    setTasks(filteredTasks);
    setDraggedTaskId(null);
    await Promise.all(updatePromises);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    setDragOverBottom(false);
    setDragMode('reorder');
    setNestTargetTaskId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
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
              <h1 className="text-xl font-bold text-gray-900">{project?.name || 'プロジェクト'}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={scrollToToday} className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 rounded text-blue-700">
                今日
              </button>
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
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">✕</button>
          </div>
        )}

        {/* アクションボタン */}
        <div className="mb-4 flex items-center gap-2 flex-wrap relative">
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
          <button
            onClick={handleCsvDownload}
            className="px-4 py-2 bg-[#5B9BD5] text-white rounded-md hover:bg-[#4A8AC9] text-sm font-medium shadow-sm"
          >
            CSVダウンロード
          </button>
          <label className="px-4 py-2 bg-[#5B9BD5] text-white rounded-md hover:bg-[#4A8AC9] text-sm font-medium shadow-sm cursor-pointer">
            CSVインポート
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvImport}
              className="hidden"
            />
          </label>
          <span className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-bold text-gray-800 pointer-events-none">{displayYear}年{displayMonth}月</span>
        </div>

        {/* ガントチャート */}
        <GanttChart
          tasks={tasks}
          members={members}
          calendarDays={calendarDays}
          holidaysMap={holidaysMap}
          checkedTasks={checkedTasks}
          editingTaskId={editingTaskId}
          selectedStartDate={selectedStartDate}
          hoverDate={hoverDate}
          draggedTaskId={draggedTaskId}
          dragOverTaskId={dragOverTaskId}
          dragOverBottom={dragOverBottom}
          dragMode={dragMode}
          nestTargetTaskId={nestTargetTaskId}
          scrollContainerRef={scrollContainerRef}
          onToggleAllTasks={handleToggleAllTasks}
          onToggleTaskCheck={handleToggleTaskCheck}
          onEditTask={(taskId) => setEditingTaskId(taskId)}
          onSaveTaskName={handleSaveTaskName}
          onCancelEdit={handleCancelEdit}
          onMemberChange={handleMemberChange}
          onCellClick={handleCellClick}
          onCellHover={(taskId, dateStr) => setHoverDate({ ...hoverDate, [taskId]: dateStr })}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          onAddTask={() => {
            setEditingTaskId(null);
            setTimeout(() => handleAddTask(), 0);
          }}
          onScroll={(scrollLeft) => {
            const dayColumnWidth = 53;
            const visibleDayIndex = Math.floor(scrollLeft / dayColumnWidth);
            const clampedIndex = Math.max(0, Math.min(visibleDayIndex, calendarDays.length - 1));
            const visibleDay = calendarDays[clampedIndex];
            if (visibleDay && (visibleDay.year !== displayYear || visibleDay.month !== displayMonth)) {
              setDisplayYear(visibleDay.year);
              setDisplayMonth(visibleDay.month);
            }
          }}
          isDateInRange={isDateInRange}
        />
      </main>
    </div>
  );
}
