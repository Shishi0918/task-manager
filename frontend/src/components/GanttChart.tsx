import { useRef, useCallback, memo } from 'react';
import type { ProjectTask, ProjectMember } from '../types';

// タスク名入力コンポーネント
export const TaskNameInput = memo(function TaskNameInput({
  taskId,
  initialName,
  onSave,
  onCancel,
}: {
  taskId: string;
  initialName: string;
  onSave: (taskId: string, name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [isComposing, setIsComposing] = useState(false);

  return (
    <input
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onBlur={() => onSave(taskId, name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isComposing) {
          e.preventDefault();
          onSave(taskId, name);
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      autoFocus
      className="flex-1 min-w-0 px-1 py-0 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
});

import { useState } from 'react';

// カレンダー日付の型
export interface CalendarDay {
  year: number;
  month: number;
  day: number;
  dateStr: string;
  isFirstDayOfMonth: boolean;
}

interface GanttChartProps {
  tasks: ProjectTask[];
  members: ProjectMember[];
  calendarDays: CalendarDay[];
  holidaysMap: Map<string, Map<number, string>>;
  checkedTasks: Set<string>;
  editingTaskId: string | null;
  selectedStartDate: Record<string, string | null>;
  hoverDate: Record<string, string | null>;
  draggedTaskId: string | null;
  dragOverTaskId: string | null;
  dragOverBottom: boolean;
  dragMode: 'reorder' | 'nest' | 'unnest';
  nestTargetTaskId: string | null;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onToggleAllTasks: () => void;
  onToggleTaskCheck: (taskId: string, e: React.MouseEvent) => void;
  onEditTask: (taskId: string) => void;
  onSaveTaskName: (taskId: string, name: string) => void;
  onCancelEdit: () => void;
  onMemberChange: (taskId: string, memberId: string | null) => void;
  onCellClick: (taskId: string, dateStr: string) => void;
  onCellHover: (taskId: string, dateStr: string | null) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetTaskId?: string) => void;
  onDragEnd: () => void;
  onAddTask: () => void;
  onScroll?: (scrollLeft: number) => void;
  isDateInRange: (task: ProjectTask, dateStr: string) => boolean;
}

export function GanttChart({
  tasks,
  members,
  calendarDays,
  holidaysMap,
  checkedTasks,
  editingTaskId,
  selectedStartDate,
  hoverDate,
  draggedTaskId,
  dragOverTaskId,
  dragOverBottom,
  dragMode,
  nestTargetTaskId,
  scrollContainerRef,
  onToggleAllTasks,
  onToggleTaskCheck,
  onEditTask,
  onSaveTaskName,
  onCancelEdit,
  onMemberChange,
  onCellClick,
  onCellHover,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAddTask,
  onScroll,
  isDateInRange,
}: GanttChartProps) {
  const fixedRef = useRef<HTMLDivElement>(null);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  // Use provided ref or internal ref
  const scrollRef = scrollContainerRef || internalScrollRef;

  // 縦スクロール同期
  const syncVerticalScroll = useCallback((source: 'fixed' | 'scroll') => {
    if (!fixedRef.current || !scrollRef.current) return;
    if (source === 'fixed') {
      scrollRef.current.scrollTop = fixedRef.current.scrollTop;
    } else {
      fixedRef.current.scrollTop = scrollRef.current.scrollTop;
    }
  }, []);

  // 横スクロール同期（ヘッダーとボディ）
  const syncHorizontalScroll = useCallback(() => {
    if (!scrollRef.current || !headerScrollRef.current) return;
    headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
    onScroll?.(scrollRef.current.scrollLeft);
  }, [onScroll]);

  // 固定列の幅
  const TASK_COL_WIDTH = 240;
  const MEMBER_COL_WIDTH = 100;
  const DATE_COL_WIDTH = 53;
  const FIXED_WIDTH = TASK_COL_WIDTH + MEMBER_COL_WIDTH;

  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      {/* 左側：固定列（タスク名 + 担当者） */}
      <div className="flex-shrink-0" style={{ width: FIXED_WIDTH }}>
        {/* 固定列ヘッダー */}
        <div className="flex bg-[#5B9BD5] text-white" style={{ height: 60 }}>
          <div className="px-2 py-3 font-medium flex items-center gap-2" style={{ width: TASK_COL_WIDTH, borderRight: '1px solid #d1d5db' }}>
            <input
              type="checkbox"
              checked={tasks.length > 0 && checkedTasks.size === tasks.length}
              onChange={onToggleAllTasks}
              className="w-4 h-4 cursor-pointer accent-blue-500"
              title="全選択/全解除"
            />
            <span className="text-sm">タスク</span>
          </div>
          <div className="px-2 py-2 text-xs font-medium flex items-center justify-center" style={{ width: MEMBER_COL_WIDTH, borderRight: '1px solid #d1d5db' }}>
            担当者
          </div>
        </div>

        {/* 固定列ボディ */}
        <div
          ref={fixedRef}
          className="overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: 'calc(100vh - 280px)' }}
          onScroll={() => syncVerticalScroll('fixed')}
        >
          {tasks.map((task, index) => {
            const isChecked = checkedTasks.has(task.id);
            const isCompletedTask = task.isCompleted;
            const isDragging = draggedTaskId === task.id;
            const isDragOver = dragOverTaskId === task.id;
            const isLastRow = index === tasks.length - 1;
            const showBottomBorder = isLastRow && dragOverBottom;
            const isNestTarget = nestTargetTaskId === task.id && dragMode === 'nest';
            const taskLevel = task.level ?? 0;
            const isUnnestMode = dragMode === 'unnest' && draggedTaskId === task.id;
            const taskMember = task.memberId ? members.find(m => m.id === task.memberId) : null;
            const memberColor = taskMember?.color || null;
            const taskBgColor = isNestTarget ? '#f0fdf4' : isUnnestMode ? '#fffbeb' : isCompletedTask ? '#f3f4f6' : '#ffffff';
            const memberBgColor = memberColor || (isCompletedTask ? '#f3f4f6' : '#ffffff');
            const textColorClass = isCompletedTask ? 'text-gray-400' : '';

            return (
              <div
                key={task.id}
                data-task-id={task.id}
                className={`flex ${isCompletedTask ? 'opacity-60' : ''} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'border-t-2 border-t-blue-500' : ''} ${showBottomBorder ? 'border-b-2 border-b-blue-500' : ''}`}
                style={{ height: 36 }}
                draggable={!isCompletedTask}
                onDragStart={(e) => onDragStart(e, task.id)}
                onDrop={(e) => onDrop(e, task.id)}
                onDragEnd={onDragEnd}
              >
                {/* タスク名セル */}
                <div
                  className={`border-b border-gray-200 px-1 py-1 overflow-hidden ${textColorClass}`}
                  style={{
                    width: TASK_COL_WIDTH,
                    paddingLeft: `${8 + taskLevel * 16}px`,
                    backgroundColor: taskBgColor,
                    borderRight: '1px solid #e5e7eb',
                  }}
                >
                  <div className="flex items-center gap-1 h-full">
                    {!isCompletedTask && (
                      <span className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0" title="ドラッグして並び替え">
                        ⋮⋮
                      </span>
                    )}
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onClick={(e) => onToggleTaskCheck(task.id, e)}
                      onChange={() => {}}
                      className="w-4 h-4 cursor-pointer flex-shrink-0"
                    />
                    {editingTaskId === task.id && !isCompletedTask ? (
                      <TaskNameInput
                        taskId={task.id}
                        initialName={task.name}
                        onSave={onSaveTaskName}
                        onCancel={onCancelEdit}
                      />
                    ) : (
                      <div
                        onClick={() => !isCompletedTask && onEditTask(task.id)}
                        className={`min-h-[20px] flex items-center flex-1 truncate ${isCompletedTask ? 'cursor-default' : 'cursor-text'}`}
                      >
                        <span className="truncate">
                          {task.name || <span className="text-gray-400">タスク名</span>}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 担当者セル */}
                <div
                  className="border-b border-gray-200 px-1 py-1 flex items-center justify-center"
                  style={{
                    width: MEMBER_COL_WIDTH,
                    backgroundColor: memberBgColor,
                    borderRight: '1px solid #e5e7eb',
                  }}
                >
                  <select
                    value={task.memberId || ''}
                    onChange={(e) => onMemberChange(task.id, e.target.value || null)}
                    disabled={isCompletedTask}
                    className="w-full px-0.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ backgroundColor: memberColor ? 'rgba(255,255,255,0.8)' : 'white' }}
                  >
                    <option value="">--</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}

          {/* 空状態 */}
          {tasks.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-500 border-b border-gray-200">
              タスクがありません
            </div>
          )}

          {/* タスク追加行 */}
          <div
            onClick={onAddTask}
            className="flex cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-200"
            style={{ height: 44 }}
          >
            <div className="px-4 py-3 text-center text-gray-400 text-sm" style={{ width: FIXED_WIDTH }}>
              + クリックしてタスクを追加
            </div>
          </div>
        </div>
      </div>

      {/* 右側：スクロール列（日付） */}
      <div className="flex-1 overflow-hidden">
        {/* 日付ヘッダー */}
        <div
          ref={headerScrollRef}
          className="overflow-hidden bg-[#5B9BD5]"
          style={{ height: 60 }}
        >
          <div className="flex">
            {calendarDays.map((calDay, idx) => {
              const date = new Date(calDay.year, calDay.month - 1, calDay.day);
              const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
              const isSunday = date.getDay() === 0;
              const isSaturday = date.getDay() === 6;
              const holidaysForMonth = holidaysMap.get(`${calDay.year}-${calDay.month}`);
              const holidayName = holidaysForMonth?.get(calDay.day);
              const isHoliday = !!holidayName;
              const isNonWorkday = isSunday || isSaturday || isHoliday;

              const today = new Date();
              const isToday = calDay.year === today.getFullYear() &&
                              calDay.month === today.getMonth() + 1 &&
                              calDay.day === today.getDate();

              return (
                <div
                  key={idx}
                  className={`border-r border-gray-200 px-1 py-2 text-xs font-medium text-center text-white flex-shrink-0 ${isNonWorkday ? 'bg-[#6BA8D9]' : 'bg-[#5B9BD5]'} ${calDay.isFirstDayOfMonth ? 'border-l-2 border-l-white' : ''}`}
                  style={{ width: DATE_COL_WIDTH }}
                  title={holidayName || `${calDay.year}/${calDay.month}/${calDay.day}`}
                >
                  {calDay.isFirstDayOfMonth && (
                    <div className="text-[9px] text-white/80 -mb-0.5">{calDay.month}月</div>
                  )}
                  <div className={`font-semibold ${isHoliday ? 'text-red-200' : ''} ${isToday ? 'bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center mx-auto' : ''}`}>
                    {calDay.day}
                  </div>
                  <div className={`text-[10px] ${isSunday || isHoliday ? 'text-red-200' : isSaturday ? 'text-blue-200' : 'text-white/70'}`}>{dayOfWeek}</div>
                  {isHoliday && <div className="text-[8px] text-red-200">祝</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 日付ボディ */}
        <div
          ref={scrollRef}
          className="overflow-auto"
          style={{ maxHeight: 'calc(100vh - 280px)' }}
          onScroll={() => {
            syncVerticalScroll('scroll');
            syncHorizontalScroll();
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e)}
        >
          {tasks.map((task) => {
            const taskStartDate = selectedStartDate[task.id];
            const taskHoverDate = hoverDate[task.id];
            const isCompletedTask = task.isCompleted;
            const taskMember = task.memberId ? members.find(m => m.id === task.memberId) : null;
            const memberColor = taskMember?.color || null;

            const selectingTaskId = Object.keys(selectedStartDate).find(
              id => selectedStartDate[id] !== null && selectedStartDate[id] !== undefined
            );
            const isOtherTaskSelecting = selectingTaskId && selectingTaskId !== task.id;

            return (
              <div key={task.id} className="flex" style={{ height: 36 }}>
                {calendarDays.map((calDay, idx) => {
                  const dateStr = calDay.dateStr;
                  const date = new Date(calDay.year, calDay.month - 1, calDay.day);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const holidaysForMonth = holidaysMap.get(`${calDay.year}-${calDay.month}`);
                  const isHoliday = !!holidaysForMonth?.get(calDay.day);
                  const isNonWorkday = isWeekend || isHoliday;
                  const inRange = isDateInRange(task, dateStr);
                  const isStartDay = taskStartDate === dateStr;

                  const isSelectingEndDay = taskStartDate !== null && taskStartDate !== undefined;
                  const isBeforeStartDay = isSelectingEndDay && dateStr < taskStartDate;

                  const isInPreviewRange =
                    isSelectingEndDay &&
                    taskHoverDate !== null &&
                    taskHoverDate !== undefined &&
                    taskHoverDate >= taskStartDate &&
                    dateStr >= taskStartDate &&
                    dateStr <= taskHoverDate;

                  const isRangeStart = inRange && task.startDate === dateStr;
                  const isRangeEnd = inRange && task.endDate === dateStr;

                  const isCellDisabled = isCompletedTask || !!isOtherTaskSelecting || isBeforeStartDay;
                  const barColor = memberColor || '#85c1e9';

                  return (
                    <div
                      key={idx}
                      className={`border-b border-r border-gray-200 px-0.5 py-1 flex-shrink-0 ${
                        isNonWorkday ? 'bg-gray-100' : 'bg-white'
                      } ${
                        isCellDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                      } ${calDay.isFirstDayOfMonth ? 'border-l-2 border-l-gray-300' : ''}`}
                      style={{ width: DATE_COL_WIDTH }}
                      onClick={() => !isCellDisabled && onCellClick(task.id, dateStr)}
                      onMouseEnter={() => !isCellDisabled && onCellHover(task.id, dateStr)}
                      onMouseLeave={() => !isCellDisabled && onCellHover(task.id, null)}
                    >
                      <div
                        className={`h-5 ${
                          isCompletedTask ? 'bg-gray-50' : ''
                        } ${
                          !isCompletedTask && isStartDay
                            ? 'rounded animate-pulse'
                            : !isCompletedTask && isInPreviewRange
                            ? 'rounded animate-pulse'
                            : !isCompletedTask && inRange
                            ? `${isRangeStart ? 'rounded-l' : ''} ${isRangeEnd ? 'rounded-r' : ''}`
                            : ''
                        }`}
                        style={
                          !isCompletedTask && (isStartDay || isInPreviewRange || inRange)
                            ? { backgroundColor: barColor }
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 空状態のスペーサー */}
          {tasks.length === 0 && (
            <div style={{ height: 64, width: calendarDays.length * DATE_COL_WIDTH }} />
          )}

          {/* タスク追加行のスペーサー */}
          <div style={{ height: 44, width: calendarDays.length * DATE_COL_WIDTH }} />
        </div>
      </div>
    </div>
  );
}

// スクロールRef取得用のフック
export function useGanttScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToPosition = useCallback((scrollLeft: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  return { scrollRef, scrollToPosition };
}
