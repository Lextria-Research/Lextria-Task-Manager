import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Search, Shield, Plus, Trash2, Edit2, CheckCircle2, Circle,
  Bell, Calendar, X, Lock, Unlock, AlertCircle, GripVertical, GripHorizontal, Building2, Layout, Users, ChevronRight, ChevronLeft, ArrowLeft, History, RotateCcw, Tag, BarChart3, Filter, SlidersHorizontal, Image, UploadCloud, Link, Clock, Download, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown,
  CheckSquare, Database, Wrench
} from 'lucide-react';
import QueryManager from './QueryManager';
import LoginPage from './LoginPage';
import MemberManualModal from './MemberManualModal';

// --- SYSTEM UNDER MAINTENANCE MODE ---
// Set to true to lock down the site and pause all user interactions during upgrades.
// Set to false to immediately restore the full dashboard once maintenance is complete.
const IS_UNDER_MAINTENANCE = false;

function MaintenanceScreen() {
  return (
    <div className="fixed inset-0 z-[99999] bg-[#03071b]/95 backdrop-blur-2xl flex items-center justify-center p-4 select-none cursor-not-allowed">
      {/* Ambient glowing background orbs */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-brand-600/20 blur-[130px] pointer-events-none -top-20 -left-20" />
      <div className="absolute w-[450px] h-[450px] rounded-full bg-blue-500/15 blur-[120px] pointer-events-none -bottom-20 -right-20" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-amber-500/10 blur-[100px] pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      <div className="relative max-w-lg w-full bg-[#07102e]/90 border border-white/15 p-8 md:p-10 rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.9),0_0_40px_rgba(37,99,235,0.25)] text-center animate-in fade-in zoom-in-95 duration-300">
        {/* Logo with pulsing glow */}
        <div className="relative inline-block mb-5">
          <div className="absolute inset-0 rounded-full bg-brand-500/30 blur-md animate-pulse" />
          <img
            src="/logo.png"
            alt="Lextria Logo"
            className="relative w-16 h-16 rounded-full object-cover border-2 border-brand-500/50 shadow-xl mx-auto"
          />
        </div>

        {/* Maintenance Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-4">
          <Wrench size={14} className="animate-spin" style={{ animationDuration: '6s' }} />
          <span>Under Maintenance</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-3 tracking-tight">
          System Maintenance in Progress
        </h1>

        <p className="text-slate-300 text-sm leading-relaxed mb-6">
          The Lextria Task Dashboard is temporarily undergoing scheduled server migration and infrastructure upgrades. All activities and interactions are paused to ensure data safety during the transition.
        </p>

        {/* Status Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-left space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">System Status:</span>
            <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Maintenance Active
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">User Interactions:</span>
            <span className="flex items-center gap-1 text-red-400 font-semibold">
              <Lock size={12} /> Paused / Locked
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Current Task:</span>
            <span className="text-brand-300 font-medium">Server Migration & Infrastructure Upgrade</span>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Thank you for your patience. We will be back online as soon as the updates are completed.
        </p>
      </div>
    </div>
  );
}


// --- INITIAL DATA & UTILS ---
const defaultData = [
  {
    id: 'dept-1',
    name: 'General',
    boards: [
      {
        id: 'board-1',
        name: 'Main Board',
        employees: []
      }
    ]
  }
];

const avatarColors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
const generateId = () => Math.random().toString(36).substr(2, 9);
function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}
function formatDateToDDMMYY(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0].substring(2); // '26'
    const month = parts[1]; // '05'
    const day = parts[2]; // '26'
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDateLong(dateInput) {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function parseTimeToHours(timeStr) {
  if (!timeStr || timeStr === 'Undefined') return 0;
  const str = timeStr.toLowerCase().trim();
  
  const numMatch = str.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const num = parseFloat(numMatch[1]);
    if (str.includes('min')) {
      return num / 60;
    } else if (str.includes('hour') || str.includes('hr')) {
      return num;
    } else if (str.includes('day')) {
      return num * 8;
    } else if (str.includes('week')) {
      return num * 40;
    }
  }

  if (str.includes('under 5 min')) return 5 / 60;
  if (str.includes('under 15 min')) return 15 / 60;
  if (str.includes('under 30 min')) return 30 / 60;
  if (str.includes('under 45 min')) return 45 / 60;

  return 0;
}

function formatHoursToHuman(hoursDecimal) {
  if (!hoursDecimal || hoursDecimal <= 0) return '0 min';
  
  const totalMinutes = Math.round(hoursDecimal * 60);
  if (totalMinutes === 0) return '0 min';

  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hrs === 0) {
    return `${mins} min`;
  }
  if (mins === 0) {
    return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'}`;
  }
  return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'}, ${mins} min`;
}

function parseTimeToMinutes(timeStr) {
  return Math.round(parseTimeToHours(timeStr) * 60);
}

function formatTimerDisplay(task, _tick) {
  if (!task.timerStartedAt || !task.requiredTime || task.completed) return null;
  
  const allottedMin = parseTimeToMinutes(task.requiredTime);
  if (allottedMin <= 0) return null;
  
  const elapsedMin = Math.floor((Date.now() - new Date(task.timerStartedAt).getTime()) / 60000);
  
  if (elapsedMin <= allottedMin) {
    return { text: `${elapsedMin}/${allottedMin}`, overtime: false };
  }
  return { text: `+${elapsedMin - allottedMin}`, overtime: true };
}

function renderDescriptionWithLinks(text) {
  if (!text) return null;
  const linkRegex = /((?:https?:\/\/|www\.)[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const parts = text.split(linkRegex);
  return parts.map((part, index) => {
    if (linkRegex.test(part)) {
      let href = part;
      if (part.toLowerCase().startsWith('www.')) {
        href = `https://${part}`;
      } else if (part.includes('@') && !part.toLowerCase().startsWith('http')) {
        href = `mailto:${part}`;
      }
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-400 hover:text-brand-300 underline break-all cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

// --- SORTABLE TASK ITEM ---
function SortableTaskItem({ task, employeeId, updateTask, deleteTask, onTaskClick, timerTick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'Task', task, employeeId }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col gap-2 transition-all hover:bg-white/10 ${task.completed ? 'opacity-50' : ''}`}
    >
      {task.screenshotUrl && (
        <div 
          onClick={() => onTaskClick(employeeId, task.id)}
          className="w-full h-28 rounded-md overflow-hidden border border-white/5 mb-1 cursor-pointer flex-shrink-0"
        >
          <img 
            src={task.screenshotUrl} 
            alt={task.title} 
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex items-start gap-2">
        <div {...attributes} {...listeners} className="mt-0.5 cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 touch-none">
          <GripVertical size={16} />
        </div>
        <button onClick={() => updateTask(employeeId, task.id, { completed: !task.completed })} className={`mt-0.5 flex-shrink-0 transition-colors ${task.completed ? 'text-brand-400' : 'text-slate-400 hover:text-brand-300'}`}>
          {task.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onTaskClick(employeeId, task.id)}>
          <p className={`text-sm font-medium truncate ${task.completed ? 'line-through text-slate-400' : 'text-slate-200'}`}>
            {task.title}
          </p>
        </div>
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            deleteTask(employeeId, task);
          }} 
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1 cursor-pointer"
          title="Delete Task"
        >
          <Trash2 size={14} />
        </button>
      </div>
      
      <div className="flex flex-wrap items-center gap-2 pl-8">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
          task.priority === 'High' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
          task.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
          'bg-green-500/20 text-green-400 border-green-500/30'
        }`}>
          {task.priority}
        </span>
        {task.requiredTime && task.requiredTime !== 'Undefined' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 font-medium transition-colors bg-cyan-500/15 text-cyan-300 border-cyan-500/30">
            <Clock size={10} /> {task.requiredTime}
          </span>
        )}
        {(() => {
          const timerInfo = formatTimerDisplay(task, timerTick);
          if (!timerInfo) return null;
          return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 font-bold transition-all min-w-[2.5rem] justify-center ${
              timerInfo.overtime
                ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            }`}>
              ⏱ {timerInfo.text}
            </span>
          );
        })()}
        {task.tag && task.tag !== 'Undefined' && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 font-medium transition-colors ${
            task.tag === 'Under 5 min' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' :
            task.tag === 'Under 15 min' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
            task.tag === 'Under 30 min' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
            task.tag === 'Under 45 min' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
            'bg-slate-500/20 text-slate-300 border-slate-500/30'
          }`}>
            <Tag size={10} /> {task.tag}
          </span>
        )}
        {task.dueDate && <span className="text-[10px] text-slate-400 flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded"><Calendar size={10}/> {formatDateToDDMMYY(task.dueDate)}</span>}
        {task.reminderTime && <span className="text-[10px] text-slate-400 flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded"><Bell size={10} className="text-brand-400"/> {task.reminderTime}</span>}
      </div>
    </div>
  );
}

// --- SORTABLE EMPLOYEE CARD (KANBAN COLUMN) ---
function SortableEmployeeCard({ employee, isAdmin, onDelete, onEdit, updateTask, deleteTask, addTask, onTaskClick, priorityFilter, dueDateFilter, archivedTasks = [], timerTick }) {
  const [isAdding, setIsAdding] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: employee.id,
    data: { type: 'Employee', employee }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const tasksCompleted = employee.tasks.filter(t => t.completed).length;
  const totalTasks = employee.tasks.length;
  const progress = totalTasks === 0 ? 0 : Math.round((tasksCompleted / totalTasks) * 100);

  const todayStr = new Date().toISOString().split('T')[0];

  const activeHours = employee.tasks
    .filter(t => t.completed && (t.completedDate || t.completed_date) === todayStr)
    .reduce((sum, t) => sum + parseTimeToHours(t.requiredTime || t.required_time || t.tag), 0);

  const archivedHours = (archivedTasks || [])
    .filter(t => (t.agent_id === employee.id || t.agentId === employee.id) && (t.completedDate || t.completed_date) === todayStr)
    .reduce((sum, t) => sum + parseTimeToHours(t.requiredTime || t.required_time || t.tag), 0);

  const completedHoursRaw = activeHours + archivedHours;
  const completedHours = Math.round(completedHoursRaw * 10) / 10;
  const hoursPct = Math.round((completedHoursRaw / 8) * 100);
  const isOvertime = completedHoursRaw > 8;

  const activeTimerTask = employee.tasks?.find(t => t.timerStartedAt && !t.completed);
  let activeTimerDetails = null;
  if (activeTimerTask) {
    const allottedMin = parseTimeToMinutes(activeTimerTask.requiredTime);
    if (allottedMin > 0) {
      const elapsedMin = Math.floor((Date.now() - new Date(activeTimerTask.timerStartedAt).getTime()) / 60000);
      const pct = Math.min(Math.round((elapsedMin / allottedMin) * 100), 100);
      const isTimerOvertime = elapsedMin > allottedMin;
      activeTimerDetails = {
        title: activeTimerTask.title,
        allotted: allottedMin,
        elapsed: elapsedMin,
        pct,
        isOvertime: isTimerOvertime
      };
    }
  }

  const activeTasks = employee.tasks.filter(t => {
    if (t.completed) return false;
    if (priorityFilter && priorityFilter !== 'All' && t.priority !== priorityFilter) return false;
    if (dueDateFilter && dueDateFilter !== 'All') {
      const todayStr = new Date().toISOString().split('T')[0];
      if (dueDateFilter === 'Today') {
        if (t.due_date !== todayStr) return false;
      } else if (dueDateFilter === 'Overdue') {
        if (!t.due_date || t.due_date >= todayStr) return false;
      }
    }
    return true;
  });

  const sortedTasks = [...activeTasks].sort((a, b) => {
    const pVals = { High: 3, Medium: 2, Low: 1 };
    return (pVals[b.priority] || 0) - (pVals[a.priority] || 0);
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`glass-card flex flex-col w-[320px] h-[580px] flex-shrink-0 transition-all duration-300 rounded-2xl overflow-hidden ${isDragging ? 'shadow-[0_0_30px_rgba(37,99,235,0.5)]' : ''}`}
    >
      <div className="p-4 bg-white/5 border-b border-white/10 relative group">
        <div {...attributes} {...listeners} className="absolute top-2 left-2 cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300">
           <GripHorizontal size={16} />
        </div>
        <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(employee)} className="p-1.5 rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-colors">
            <Edit2 size={12} />
          </button>
          {isAdmin && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(employee);
              }} 
              className="p-1.5 rounded-md hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition-colors cursor-pointer"
              title="Delete Agent"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center space-x-3 mt-3">
          <div className={`w-10 h-10 rounded-full ${employee.color} flex items-center justify-center text-sm font-bold shadow-lg flex-shrink-0`}>
            {getInitials(employee.name)}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base truncate text-white">{employee.name}</h3>
            <p className="text-slate-400 text-xs truncate">{employee.role}</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <div>
            <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              <span>Tasks Progress</span>
              <span className="font-semibold text-brand-400">{tasksCompleted}/{totalTasks} ({progress}%)</span>
            </div>
            <div className="w-full bg-slate-800/50 rounded-full h-1.5">
              <div className="bg-brand-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              <span className="flex items-center gap-1">
                <Clock size={10} className={isOvertime ? "text-amber-400" : "text-cyan-400"} /> Work Hours (8h Day)
              </span>
              <span className={`font-semibold flex items-center gap-1 ${isOvertime ? 'text-amber-300 font-bold' : 'text-cyan-300'}`}>
                {isOvertime && <span title="Overtime Productivity">⚡</span>}
                {formatHoursToHuman(completedHoursRaw)} / 8 hrs ({hoursPct}%)
              </span>
            </div>
            <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  isOvertime 
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-400 shadow-[0_0_12px_rgba(251,191,36,0.5)] animate-pulse' 
                    : 'bg-gradient-to-r from-cyan-500 to-teal-400'
                }`} 
                style={{ width: `${Math.min(hoursPct, 100)}%` }} 
              />
            </div>
          </div>

          {activeTimerDetails && (
            <div className="animate-in fade-in slide-in-from-top duration-300">
              <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                <span className="flex items-center gap-1 text-emerald-400 font-medium truncate max-w-[140px]" title={`Active: ${activeTimerDetails.title}`}>
                  ⚡ Active: {activeTimerDetails.title}
                </span>
                <span className={`font-semibold ${activeTimerDetails.isOvertime ? 'text-red-400 animate-pulse font-bold' : 'text-emerald-400'}`}>
                  {activeTimerDetails.isOvertime 
                    ? `+${activeTimerDetails.elapsed - activeTimerDetails.allotted} min Overtime` 
                    : `${activeTimerDetails.elapsed} / ${activeTimerDetails.allotted} min (${activeTimerDetails.pct}%)`}
                </span>
              </div>
              <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden p-0">
                <div 
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    activeTimerDetails.isOvertime 
                      ? 'bg-gradient-to-r from-red-500 to-rose-400 shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse' 
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  }`} 
                  style={{ width: `${activeTimerDetails.pct}%` }} 
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar min-h-[150px]">
        <SortableContext items={sortedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {sortedTasks.map(task => (
            <SortableTaskItem 
              key={task.id} 
              task={task} 
              employeeId={employee.id} 
              updateTask={updateTask} 
              deleteTask={deleteTask} 
              onTaskClick={onTaskClick}
              timerTick={timerTick}
            />
          ))}
        </SortableContext>
      </div>

      <div className="p-3 border-t border-white/10 bg-black/20">
        {isAdding ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Enter task title..."
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              className="glass-input w-full text-xs py-1.5 px-3 font-sans"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (titleInput.trim()) {
                    addTask(employee.id, titleInput.trim());
                    setTitleInput('');
                    setIsAdding(false);
                  }
                } else if (e.key === 'Escape') {
                  setIsAdding(false);
                  setTitleInput('');
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setTitleInput('');
                }}
                className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-white/5 rounded transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (titleInput.trim()) {
                    addTask(employee.id, titleInput.trim());
                    setTitleInput('');
                    setIsAdding(false);
                  }
                }}
                className="px-3 py-1 text-[11px] bg-brand-600 hover:bg-brand-500 text-white rounded font-medium shadow-md shadow-brand-600/35 transition-all cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => {
              setIsAdding(true);
              setTitleInput('');
            }}
            className="w-full py-2 flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer"
          >
            <Plus size={16} /> Add Task
          </button>
        )}
      </div>
    </div>
  );
}

// --- TASK COMPILATION HELPERS ---
const getDeptTaskStats = (dept) => {
  let total = 0;
  let completed = 0;
  dept.boards?.forEach(board => {
    board.employees?.forEach(emp => {
      emp.tasks?.forEach(task => {
        total++;
        if (task.completed) {
          completed++;
        }
      });
    });
  });
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, pct };
};

const getBoardTaskStats = (board) => {
  let total = 0;
  let completed = 0;
  board.employees?.forEach(emp => {
    emp.tasks?.forEach(task => {
      total++;
      if (task.completed) {
        completed++;
      }
    });
  });
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, pct };
};

// CSV Report Exporter Helper
function downloadCSVReport(tasks, reportTitle) {
  if (!tasks || tasks.length === 0) {
    alert("No tasks found matching your filter criteria.");
    return;
  }

  const headers = [
    "Task Title",
    "Department",
    "Board",
    "Agent Name",
    "Status",
    "Priority",
    "Required Time",
    "Created Date",
    "Completed Date"
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = tasks.map(t => [
    escapeCSV(t.title),
    escapeCSV(t.deptName),
    escapeCSV(t.boardName),
    escapeCSV(t.agentName),
    escapeCSV(t.completed ? "Completed" : "Pending"),
    escapeCSV(t.priority),
    escapeCSV(t.requiredTime || "N/A"),
    escapeCSV(t.createdAt ? formatDateLong(t.createdAt) : "N/A"),
    escapeCSV(t.completedDate ? formatDateLong(t.completedDate) : "N/A")
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const filename = `${reportTitle.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- INTERACTIVE ANALYTICS CHARTS ---
function CompletionTrendChart({ tasks }) {
  const [daysRange, setDaysRange] = useState(14);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const trendData = useMemo(() => {
    const data = [];
    const today = new Date();

    for (let i = daysRange - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = `${d.getDate()} ${MONTH_NAMES[d.getMonth()].substring(0, 3)}`;

      let count = 0;
      let hours = 0;

      tasks.forEach(t => {
        if (t.completed) {
          const cDate = t.completedDate || (t.createdAt ? t.createdAt.split('T')[0] : '');
          if (cDate === dateStr) {
            count++;
            hours += parseTimeToHours(t.requiredTime);
          }
        }
      });

      data.push({ dateStr, label, count, hours: Math.round(hours * 10) / 10 });
    }

    return data;
  }, [tasks, daysRange]);

  const maxVal = Math.max(...trendData.map(d => d.count), 5);
  const width = 600;
  const height = 220;
  const padding = 35;

  const points = trendData.map((d, i) => {
    const x = padding + (i / (trendData.length - 1)) * (width - padding * 2);
    const y = height - padding - (d.count / maxVal) * (height - padding * 2);
    return { ...d, x, y };
  });

  const pathD = points.length > 0
    ? points.reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '')
    : '';

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
    : '';

  return (
    <div className="glass-card p-6 rounded-2xl relative flex flex-col justify-between h-full border border-white/10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="text-brand-400" size={18} /> Daily Completion Trend
          </h3>
          <p className="text-xs text-slate-400">Task completion activity over time</p>
        </div>
        <div className="flex items-center p-1 bg-white/5 border border-white/10 rounded-xl text-xs">
          {[7, 14, 30].map(range => (
            <button
              key={range}
              onClick={() => setDaysRange(range)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                daysRange === range
                  ? 'bg-brand-500 text-white shadow-[0_0_12px_rgba(37,99,235,0.5)] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {range}D
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padding + ratio * (height - padding * 2);
            return (
              <line
                key={i}
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray="4 4"
              />
            );
          })}

          {areaD && <path d={areaD} fill="url(#areaGradient)" />}

          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]"
            />
          )}

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredPoint?.dateStr === p.dateStr ? 6 : 4}
                className={`transition-all duration-150 cursor-pointer ${
                  hoveredPoint?.dateStr === p.dateStr
                    ? 'fill-brand-400 stroke-white stroke-2 shadow-[0_0_15px_#38bdf8]'
                    : 'fill-brand-500 stroke-[#03071b] stroke-2'
                }`}
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              {(daysRange <= 14 || i % Math.ceil(daysRange / 7) === 0) && (
                <text
                  x={p.x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px] font-medium"
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>

        {hoveredPoint && (() => {
          const isNearTop = hoveredPoint.y < 95;
          const posX = (hoveredPoint.x / width) * 100;
          const posY = (hoveredPoint.y / height) * 100;
          const clampedX = Math.max(16, Math.min(84, posX));

          return (
            <div
              className="absolute z-30 pointer-events-none bg-[#07102e]/98 border border-brand-500/50 p-2.5 rounded-xl shadow-[0_4px_25px_rgba(0,0,0,0.8),0_0_15px_rgba(37,99,235,0.3)] backdrop-blur-xl text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap"
              style={{
                left: `${clampedX}%`,
                top: `${posY}%`,
                transform: isNearTop ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))'
              }}
            >
              <div className="font-bold text-white text-xs border-b border-white/10 pb-1 flex items-center justify-between gap-3">
                <span>📅 {formatDateLong(hoveredPoint.dateStr)}</span>
              </div>
              <div className="text-slate-300 flex items-center gap-1.5 pt-0.5">
                <span className="w-2 h-2 rounded-full bg-brand-400" />
                <span>Completed: <strong className="text-brand-300 font-semibold">{hoveredPoint.count} tasks</strong></span>
              </div>
              <div className="text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>Hours: <strong className="text-cyan-300 font-semibold">{formatHoursToHuman(hoveredPoint.hours)}</strong></span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function DepartmentBarChart({ departments, allFlattenedTasks = [] }) {
  const [hoveredDept, setHoveredDept] = useState(null);

  const deptData = useMemo(() => {
    const map = new Map();

    departments.forEach(dept => {
      let boardCount = dept.boards?.length || 0;
      let agentCount = 0;
      dept.boards?.forEach(b => {
        agentCount += b.employees?.length || 0;
      });

      map.set(dept.id, {
        id: dept.id,
        name: dept.name,
        boardCount,
        agentCount,
        total: 0,
        completed: 0,
        hours: 0
      });
    });

    allFlattenedTasks.forEach(t => {
      let dId = t.deptId;
      if (!map.has(dId)) {
        const foundDept = departments.find(d => d.name === t.deptName);
        if (foundDept) dId = foundDept.id;
      }

      if (map.has(dId)) {
        const item = map.get(dId);
        item.total += 1;
        if (t.completed) {
          item.completed += 1;
          item.hours += parseTimeToHours(t.requiredTime);
        }
      }
    });

    return Array.from(map.values()).map(d => {
      const pending = d.total - d.completed;
      const pct = d.total === 0 ? 0 : Math.round((d.completed / d.total) * 100);
      return { ...d, pending, pct, hours: Math.round(d.hours * 10) / 10 };
    });
  }, [departments, allFlattenedTasks]);

  return (
    <div className="glass-card p-6 rounded-2xl relative overflow-hidden flex flex-col h-full border border-white/10 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Building2 className="text-brand-400" size={18} /> Department Comparison
        </h3>
        <p className="text-xs text-slate-400">Total vs Completed workload metrics per department</p>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-1">
        {deptData.map(d => (
          <div
            key={d.id}
            className="p-4 bg-white/5 border border-white/5 hover:border-brand-500/30 rounded-xl transition-all space-y-3 group cursor-pointer"
            onMouseEnter={() => setHoveredDept(d)}
            onMouseLeave={() => setHoveredDept(null)}
          >
            <div className="flex justify-between items-center text-xs flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm group-hover:text-brand-300 transition-colors">{d.name}</span>
                <span className="text-[10px] text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md font-medium">
                  {d.boardCount} Boards • {d.agentCount} Agents
                </span>
              </div>
              <span className="text-slate-300 font-semibold text-xs">
                <strong className="text-brand-400">{d.completed}</strong> / {d.total} Tasks ({d.pct}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden p-0.5 flex items-center border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-brand-600 to-sky-400 rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                style={{ width: `${d.pct}%` }}
              />
            </div>

            {/* Metrics Breakdown Row */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
              <span>Completed: <strong className="text-green-400">{d.completed}</strong></span>
              <span>Pending: <strong className="text-amber-400">{d.pending}</strong></span>
              <span>Hours Tracked: <strong className="text-cyan-300">{formatHoursToHuman(d.hours)}</strong></span>
            </div>
          </div>
        ))}

        {deptData.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-6">No department data available.</p>
        )}
      </div>
    </div>
  );
}

function PriorityDistributionChart({ tasks }) {
  const [hoveredPriority, setHoveredPriority] = useState(null);

  const priorityCounts = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    tasks.forEach(t => {
      if (t.priority === 'High') high++;
      else if (t.priority === 'Low') low++;
      else medium++;
    });
    const total = high + medium + low || 1;
    return [
      { key: 'High', label: 'High Priority', count: high, color: '#ef4444', pct: Math.round((high / total) * 100) },
      { key: 'Medium', label: 'Medium Priority', count: medium, color: '#eab308', pct: Math.round((medium / total) * 100) },
      { key: 'Low', label: 'Low Priority', count: low, color: '#3b82f6', pct: Math.round((low / total) * 100) }
    ];
  }, [tasks]);

  const totalTasks = tasks.length;

  return (
    <div className="glass-card p-6 rounded-2xl flex flex-col justify-between h-full border border-white/10">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Tag className="text-brand-400" size={18} /> Priority Distribution
        </h3>
        <p className="text-xs text-slate-400">Breakdown of tasks by urgency level</p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-auto">
        <div className="relative w-36 h-36 flex items-center justify-center flex-shrink-0 select-none">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" className="stroke-white/5 fill-none stroke-[10]" />
            {(() => {
              let accumulatedPct = 0;
              const circumference = 2 * Math.PI * 38;
              return priorityCounts.map(item => {
                const strokeDasharray = `${(item.pct / 100) * circumference} ${circumference}`;
                const strokeDashoffset = - (accumulatedPct / 100) * circumference;
                accumulatedPct += item.pct;
                const isHovered = hoveredPriority === item.key;

                return (
                  <circle
                    key={item.key}
                    cx="50"
                    cy="50"
                    r="38"
                    stroke={item.color}
                    strokeWidth={isHovered ? "14" : "10"}
                    className="fill-none transition-all duration-300 cursor-pointer"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    onMouseEnter={() => setHoveredPriority(item.key)}
                    onMouseLeave={() => setHoveredPriority(null)}
                  />
                );
              });
            })()}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-xl font-bold text-white">{totalTasks}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Tasks</span>
          </div>
        </div>

        <div className="space-y-3 w-full sm:w-auto">
          {priorityCounts.map(item => (
            <div
              key={item.key}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                hoveredPriority === item.key
                  ? 'bg-white/10 border-white/20 scale-105 shadow-[0_0_12px_rgba(255,255,255,0.1)]'
                  : 'bg-white/5 border-white/5 hover:bg-white/10'
              }`}
              onMouseEnter={() => setHoveredPriority(item.key)}
              onMouseLeave={() => setHoveredPriority(null)}
            >
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs font-medium text-slate-200">{item.label}</span>
              </div>
              <span className="text-xs font-bold text-white">{item.count} ({item.pct}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- ANALYTICS DASHBOARD COMPONENT ---
function AnalyticsDashboard({ departments, archivedTasks = [] }) {
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDeptId, setReportDeptId] = useState('ALL');
  const [reportAgentId, setReportAgentId] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quickPreset, setQuickPreset] = useState('ALL_TIME');
  const [agentFilterMode, setAgentFilterMode] = useState('OVERALL'); // 'OVERALL' | 'DAILY'

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Compute Stats across active departments
  let totalTasks = 0;
  let completedTasks = 0;
  const deptStats = [];

  departments.forEach(dept => {
    let deptTotal = 0;
    let deptCompleted = 0;
    dept.boards?.forEach(board => {
      board.employees?.forEach(emp => {
        emp.tasks?.forEach(task => {
          totalTasks++;
          deptTotal++;
          if (task.completed) {
            completedTasks++;
            deptCompleted++;
          }
        });
      });
    });
    deptStats.push({ id: dept.id, name: dept.name, total: deptTotal, completed: deptCompleted });
  });

  const overallPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  // Flatten all tasks (active + archived) for custom filtering & reports
  const allFlattenedTasks = useMemo(() => {
    const list = [];
    const agentMap = {};

    departments.forEach(dept => {
      dept.boards?.forEach(board => {
        board.employees?.forEach(emp => {
          agentMap[emp.id] = {
            agentId: emp.id,
            agentName: emp.name,
            boardId: board.id,
            boardName: board.name,
            deptId: dept.id,
            deptName: dept.name
          };

          emp.tasks?.forEach(task => {
            const rawCustom = task.custom_completed_at || task.customCompletedAt || task.completed_at || task.completedAt || (task.completed_date ? `${task.completed_date}T00:00:00.000Z` : null);
            const resolvedCompDate = (rawCustom ? rawCustom.split('T')[0] : null) || task.completed_date || task.completedDate || '';
            list.push({
              id: task.id,
              title: task.title || 'Untitled Task',
              completed: !!task.completed,
              priority: task.priority || 'Medium',
              requiredTime: task.requiredTime || task.required_time || task.tag || '',
              createdAt: task.created_at || task.createdAt || '',
              completedDate: resolvedCompDate,
              customCompletedAt: rawCustom,
              agentId: emp.id,
              agentName: emp.name,
              boardId: board.id,
              boardName: board.name,
              deptId: dept.id,
              deptName: dept.name,
              isArchived: false
            });
          });
        });
      });
    });

    archivedTasks.forEach(task => {
      const meta = agentMap[task.agent_id] || {
        agentId: task.agent_id || 'Unknown',
        agentName: 'Unassigned/Legacy Agent',
        boardId: task.board_id || '',
        boardName: 'N/A',
        deptId: task.department_id || '',
        deptName: 'Archived Tasks'
      };
      const rawCustom = task.custom_completed_at || task.customCompletedAt || task.completed_at || task.completedAt || (task.completed_date ? `${task.completed_date}T00:00:00.000Z` : null);
      const resolvedCompDate = (rawCustom ? rawCustom.split('T')[0] : null) || task.completed_date || task.completedDate || '';
      list.push({
        id: task.id,
        title: task.title || 'Untitled Task',
        completed: true,
        priority: task.priority || 'Medium',
        requiredTime: task.requiredTime || task.required_time || task.tag || '',
        createdAt: task.created_at || task.createdAt || '',
        completedDate: resolvedCompDate,
        customCompletedAt: rawCustom,
        agentId: meta.agentId,
        agentName: meta.agentName,
        boardId: meta.boardId,
        boardName: meta.boardName,
        deptId: meta.deptId,
        deptName: meta.deptName,
        isArchived: true
      });
    });

    return list;
  }, [departments, archivedTasks]);

  // Top Agents Leaderboard calculation (Overall vs Daily) including archived tasks
  const topAgents = useMemo(() => {
    const agentMap = new Map();

    departments.forEach(dept => {
      dept.boards?.forEach(board => {
        board.employees?.forEach(emp => {
          agentMap.set(emp.id, {
            id: emp.id,
            name: emp.name,
            deptName: dept.name,
            completed: 0
          });
        });
      });
    });

    allFlattenedTasks.forEach(t => {
      if (!t.completed) return;

      if (agentFilterMode === 'DAILY') {
        if (t.completedDate !== todayStr) return;
      }

      if (agentMap.has(t.agentId)) {
        agentMap.get(t.agentId).completed += 1;
      } else if (t.agentId && t.agentName) {
        agentMap.set(t.agentId, {
          id: t.agentId,
          name: t.agentName,
          deptName: t.deptName || 'General',
          completed: 1
        });
      }
    });

    const list = Array.from(agentMap.values());
    if (agentFilterMode === 'DAILY') {
      const activeToday = list.filter(a => a.completed > 0);
      activeToday.sort((a, b) => b.completed - a.completed);
      return activeToday.slice(0, 10);
    }

    list.sort((a, b) => b.completed - a.completed);
    return list.slice(0, 10);
  }, [departments, allFlattenedTasks, agentFilterMode, todayStr]);



  // List of agents for selector dropdowns (filtered by chosen department)
  const availableAgents = useMemo(() => {
    const map = new Map();
    departments.forEach(dept => {
      if (reportDeptId === 'ALL' || dept.id === reportDeptId) {
        dept.boards?.forEach(board => {
          board.employees?.forEach(emp => {
            if (!map.has(emp.id)) {
              map.set(emp.id, { id: emp.id, name: emp.name, deptName: dept.name });
            }
          });
        });
      }
    });
    return Array.from(map.values());
  }, [departments, reportDeptId]);

  // Quick Date Presets Handler
  const applyPreset = (presetKey) => {
    setQuickPreset(presetKey);
    const today = new Date();
    const todayStrVal = today.toISOString().split('T')[0];

    if (presetKey === 'TODAY') {
      setStartDate(todayStrVal);
      setEndDate(todayStrVal);
    } else if (presetKey === 'LAST_7') {
      const d7 = new Date(today);
      d7.setDate(d7.getDate() - 7);
      setStartDate(d7.toISOString().split('T')[0]);
      setEndDate(todayStrVal);
    } else if (presetKey === 'LAST_30') {
      const d30 = new Date(today);
      d30.setDate(d30.getDate() - 30);
      setStartDate(d30.toISOString().split('T')[0]);
      setEndDate(todayStrVal);
    } else if (presetKey === 'THIS_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStrVal);
    } else if (presetKey === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Filtered tasks for the report
  const filteredReportTasks = useMemo(() => {
    return allFlattenedTasks.filter(t => {
      // Department filter
      if (reportDeptId !== 'ALL' && t.deptId !== reportDeptId) return false;
      // Agent filter
      if (reportAgentId !== 'ALL' && t.agentId !== reportAgentId) return false;
      // Date range filter
      let taskDateStr = t.completedDate || (t.createdAt ? t.createdAt.split('T')[0] : '');
      if (startDate && taskDateStr && taskDateStr < startDate) return false;
      if (endDate && taskDateStr && taskDateStr > endDate) return false;

      return true;
    });
  }, [allFlattenedTasks, reportDeptId, reportAgentId, startDate, endDate]);

  const reportCompletedCount = filteredReportTasks.filter(t => t.completed).length;
  const reportTotalHours = Math.round(filteredReportTasks.reduce((sum, t) => sum + parseTimeToHours(t.requiredTime), 0) * 10) / 10;
  const reportCompletionPct = filteredReportTasks.length === 0 ? 0 : Math.round((reportCompletedCount / filteredReportTasks.length) * 100);

  const openReportModalForDept = (deptId = 'ALL') => {
    setReportDeptId(deptId);
    setReportAgentId('ALL');
    applyPreset('ALL_TIME');
    setShowReportModal(true);
  };

  const handleExportCSV = () => {
    let deptNameStr = 'All_Departments';
    if (reportDeptId !== 'ALL') {
      const targetDept = departments.find(d => d.id === reportDeptId);
      if (targetDept) deptNameStr = targetDept.name;
    }
    if (reportAgentId !== 'ALL') {
      const targetAgent = availableAgents.find(a => a.id === reportAgentId);
      if (targetAgent) deptNameStr += `_${targetAgent.name}`;
    }
    downloadCSVReport(filteredReportTasks, `${deptNameStr}_Analytics_Report`);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-7xl mx-auto space-y-6">
      {/* System Overview Header */}
      <div className="glass-card p-8 flex flex-col md:flex-row items-center justify-between gap-8 border-t border-brand-500/30">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <BarChart3 className="text-brand-400"/> System Overview
          </h2>
          <p className="text-slate-400">Total metrics across all departments and boards.</p>
          <button
            onClick={() => openReportModalForDept('ALL')}
            className="mt-4 px-4 py-2 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] transition-all active:scale-95 cursor-pointer"
          >
            <Download size={14} /> Generate Custom Report
          </button>
        </div>
        <div className="flex flex-col items-center">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" className="stroke-white/10 fill-none stroke-[8]"></circle>
              <circle cx="50" cy="50" r="40" className="stroke-brand-500 fill-none stroke-[8] transition-all duration-1000" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * overallPct) / 100} strokeLinecap="round"></circle>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{overallPct}%</span>
            </div>
          </div>
          <div className="mt-4 text-center text-sm font-medium text-slate-300">
            <span className="text-green-400">{completedTasks}</span> / {totalTasks} Tasks Completed
          </div>
        </div>
      </div>

      {/* Interactive Charts Suite */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CompletionTrendChart tasks={allFlattenedTasks} />
        </div>
        <div>
          <PriorityDistributionChart tasks={allFlattenedTasks} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DepartmentBarChart departments={departments} allFlattenedTasks={allFlattenedTasks} />

        {/* Agent Leaderboard with Daily/Overall Toggle */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4 flex-wrap gap-2">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              Top Agents 
              <span className="bg-brand-500/20 text-brand-300 text-xs px-2 py-0.5 rounded-full font-medium">
                Leaderboard
              </span>
            </h3>
            {/* Toggle Mode Switch Pill */}
            <div className="flex items-center p-1 bg-white/5 border border-white/10 rounded-xl text-xs">
              <button
                onClick={() => setAgentFilterMode('OVERALL')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  agentFilterMode === 'OVERALL'
                    ? 'bg-brand-500 text-white shadow-[0_0_12px_rgba(37,99,235,0.5)] font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Overall
              </button>
              <button
                onClick={() => setAgentFilterMode('DAILY')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  agentFilterMode === 'DAILY'
                    ? 'bg-brand-500 text-white shadow-[0_0_12px_rgba(37,99,235,0.5)] font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Daily
              </button>
            </div>
          </div>
          <div className="space-y-4">
            {topAgents.map((ag, i) => (
              <div key={ag.id || i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${i === 0 ? 'bg-amber-400 text-amber-950 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-slate-400'}`}>
                    #{i + 1}
                  </div>
                  <div>
                    <div className="text-white font-semibold text-sm">{ag.name}</div>
                    <div className="text-xs text-slate-400">{ag.deptName}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-brand-400">{ag.completed}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                    {agentFilterMode === 'DAILY' ? 'Today' : 'Completed'}
                  </div>
                </div>
              </div>
            ))}
            {topAgents.length === 0 && (
              <p className="text-slate-500 text-center py-6">
                {agentFilterMode === 'DAILY' ? 'No tasks completed today.' : 'No active agents.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Glassmorphism Report Generation & Filter Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="glass-card border border-brand-500/30 w-full max-w-4xl p-6 rounded-2xl shadow-[0_0_50px_rgba(37,99,235,0.3)] bg-[#050c26]/95 text-slate-200 space-y-6 relative max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-500/20 text-brand-400 rounded-xl border border-brand-500/30">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Department Report & Analytics Export</h3>
                  <p className="text-xs text-slate-400">Filter task data by Department, Agent, and Date Range, then download as CSV.</p>
                </div>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto space-y-6 pr-1 custom-scrollbar">
              {/* Glassmorphism Filtering Controls */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-300 uppercase tracking-wider">
                  <Filter size={14} /> Filter Options
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Department Filter */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Department</label>
                    <select
                      value={reportDeptId}
                      onChange={(e) => {
                        setReportDeptId(e.target.value);
                        setReportAgentId('ALL');
                      }}
                      className="w-full bg-[#0c173c] border border-white/15 text-white text-xs rounded-xl p-2.5 focus:border-brand-500 focus:outline-none transition-all cursor-pointer"
                    >
                      <option value="ALL">All Departments</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Agent Filter */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Agent</label>
                    <select
                      value={reportAgentId}
                      onChange={(e) => setReportAgentId(e.target.value)}
                      className="w-full bg-[#0c173c] border border-white/15 text-white text-xs rounded-xl p-2.5 focus:border-brand-500 focus:outline-none transition-all cursor-pointer"
                    >
                      <option value="ALL">All Agents ({availableAgents.length})</option>
                      {availableAgents.map(ag => (
                        <option key={ag.id} value={ag.id}>{ag.name} ({ag.deptName})</option>
                      ))}
                    </select>
                  </div>

                  {/* From Date */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">From Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setQuickPreset('CUSTOM');
                      }}
                      className="w-full bg-[#0c173c] border border-white/15 text-white text-xs rounded-xl p-2 focus:border-brand-500 focus:outline-none transition-all"
                    />
                  </div>

                  {/* To Date */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">To Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setQuickPreset('CUSTOM');
                      }}
                      className="w-full bg-[#0c173c] border border-white/15 text-white text-xs rounded-xl p-2 focus:border-brand-500 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Quick Date Presets Bar */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                  <span className="text-[11px] text-slate-400 mr-1 font-medium">Quick Presets:</span>
                  {[
                    { key: 'ALL_TIME', label: 'All Time' },
                    { key: 'TODAY', label: 'Today' },
                    { key: 'LAST_7', label: 'Last 7 Days' },
                    { key: 'LAST_30', label: 'Last 30 Days' },
                    { key: 'THIS_MONTH', label: 'This Month' },
                  ].map(preset => (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset(preset.key)}
                      className={`text-xs px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                        quickPreset === preset.key
                          ? 'bg-brand-500/30 text-brand-300 border-brand-500/50 shadow-[0_0_10px_rgba(37,99,235,0.3)] font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/10'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl text-center">
                  <div className="text-slate-400 text-xs font-medium">Matching Tasks</div>
                  <div className="text-xl font-bold text-white mt-1">{filteredReportTasks.length}</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl text-center">
                  <div className="text-slate-400 text-xs font-medium">Completed</div>
                  <div className="text-xl font-bold text-green-400 mt-1">{reportCompletedCount}</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl text-center">
                  <div className="text-slate-400 text-xs font-medium">Hours Tracked</div>
                  <div className="text-xl font-bold text-sky-400 mt-1">{formatHoursToHuman(reportTotalHours)}</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl text-center">
                  <div className="text-slate-400 text-xs font-medium">Completion Rate</div>
                  <div className="text-xl font-bold text-brand-400 mt-1">{reportCompletionPct}%</div>
                </div>
              </div>

              {/* Report Data Table Preview */}
              <div className="bg-[#07102e] border border-white/10 rounded-xl overflow-hidden shadow-inner">
                <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-300">Report Preview ({filteredReportTasks.length} records)</span>
                </div>
                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                  {filteredReportTasks.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No tasks match the selected Department, Agent, or Date Range filters.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/5 text-slate-400 sticky top-0 backdrop-blur-md">
                        <tr>
                          <th className="p-3">Task Title</th>
                          <th className="p-3">Department</th>
                          <th className="p-3">Agent</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Priority</th>
                          <th className="p-3">Completed Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        {filteredReportTasks.slice(0, 50).map(t => (
                          <tr key={t.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-3 font-medium text-white max-w-[200px] truncate">{t.title}</td>
                            <td className="p-3">{t.deptName}</td>
                            <td className="p-3">{t.agentName}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                t.completed ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}>
                                {t.completed ? 'Completed' : 'Pending'}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] border ${
                                t.priority === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                t.priority === 'Medium' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 
                                'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              }`}>
                                {t.priority}
                              </span>
                            </td>
                            <td className="p-3 text-slate-400">{t.completedDate ? formatDateLong(t.completedDate) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <span className="text-xs text-slate-500">
                {filteredReportTasks.length > 50 ? `Showing top 50 of ${filteredReportTasks.length} tasks in preview. CSV will contain all records.` : ''}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={filteredReportTasks.length === 0}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                    filteredReportTasks.length > 0
                      ? 'bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.5)] active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                  }`}
                >
                  <Download size={14} /> Download CSV Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SORTABLE DEPARTMENTS & BOARDS COMPONENTS ---
function SortableDepartment({
  dept,
  isAdmin,
  unlockedDepartments,
  setSelectedDeptId,
  setDeptToUnlock,
  setDeptUnlockPassword,
  setDeptUnlockError,
  setEditingDepartment,
  setShowAddDeptModal,
  setDepartmentToDelete,
  getDeptTaskStats,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dept.id, disabled: !isAdmin });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`glass-card p-6 rounded-2xl hover:bg-white/10 transition-all group flex flex-col justify-between min-h-[160px] relative select-none ${
        isAdmin ? 'cursor-grab active:cursor-grabbing border-brand-500/10 hover:border-brand-500/30' : 'cursor-pointer'
      } ${isDragging ? 'border-brand-500 bg-white/10 ring-2 ring-brand-500/50 scale-[1.02] shadow-xl' : ''}`}
      onClick={(e) => {
        if (e.target.closest('button')) return;
        if (isAdmin || !dept.has_password || unlockedDepartments.includes(dept.id)) {
          setSelectedDeptId(dept.id);
        } else {
          setDeptToUnlock(dept);
          setDeptUnlockPassword('');
          setDeptUnlockError(false);
        }
      }}
    >
      <div>
        <h3 className="text-xl font-bold text-white mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 overflow-hidden text-ellipsis">
            {isAdmin && <GripVertical className="text-slate-500/50 group-hover:text-slate-300 w-4 h-4 shrink-0" />}
            <span className="truncate">{dept.name}</span>
          </span>
          {dept.has_password && <Lock size={16} className="text-slate-500 shrink-0" title="Password Protected" />}
        </h3>
        <div className="flex items-center justify-between text-slate-400 text-xs mb-3">
          <span>{dept.boards?.length || 0} Boards</span>
          {(() => {
            const stats = getDeptTaskStats(dept);
            if (stats.total > 0) {
              return <span className="font-semibold text-brand-400">{stats.completed}/{stats.total} ({stats.pct}%)</span>;
            }
            return <span>0 Tasks</span>;
          })()}
        </div>
        {(() => {
          const stats = getDeptTaskStats(dept);
          if (stats.total > 0) {
            return (
              <div className="w-full bg-slate-800/50 rounded-full h-1">
                <div className="bg-brand-500 h-1 rounded-full transition-all duration-500" style={{ width: `${stats.pct}%` }} />
              </div>
            );
          }
          return null;
        })()}
      </div>
      <div className="flex justify-end gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
        {isAdmin && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingDepartment(dept);
                setShowAddDeptModal(true);
              }}
              className="p-2 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDepartmentToDelete(dept);
              }}
              className="p-2 hover:bg-red-500/20 rounded-lg text-slate-300 hover:text-red-400"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SortableBoard({
  board,
  isAdmin,
  setSelectedBoardId,
  setEditingBoard,
  setShowAddBoardModal,
  setBoardToDelete,
  getBoardTaskStats,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: board.id, disabled: !isAdmin });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`glass-card p-6 rounded-2xl hover:bg-white/10 transition-all group flex flex-col justify-between min-h-[160px] relative select-none ${
        isAdmin ? 'cursor-grab active:cursor-grabbing border-brand-500/10 hover:border-brand-500/30' : 'cursor-pointer'
      } ${isDragging ? 'border-brand-500 bg-white/10 ring-2 ring-brand-500/50 scale-[1.02] shadow-xl' : ''}`}
      onClick={(e) => {
        if (e.target.closest('button')) return;
        setSelectedBoardId(board.id);
      }}
    >
      <div>
        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2 overflow-hidden text-ellipsis">
          {isAdmin && <GripVertical className="text-slate-500/50 group-hover:text-slate-300 w-4 h-4 shrink-0" />}
          <span className="truncate">{board.name}</span>
        </h3>
        <div className="flex items-center justify-between text-slate-400 text-xs mb-3">
          <span className="flex items-center gap-1"><Users size={12}/> {board.employees?.length || 0} Agents</span>
          {(() => {
            const stats = getBoardTaskStats(board);
            if (stats.total > 0) {
              return <span className="font-semibold text-brand-400">{stats.completed}/{stats.total} ({stats.pct}%)</span>;
            }
            return <span>0 Tasks</span>;
          })()}
        </div>
        {(() => {
          const stats = getBoardTaskStats(board);
          if (stats.total > 0) {
            return (
              <div className="w-full bg-slate-800/50 rounded-full h-1">
                <div className="bg-brand-500 h-1 rounded-full transition-all duration-500" style={{ width: `${stats.pct}%` }} />
              </div>
            );
          }
          return null;
        })()}
      </div>
      <div className="flex justify-end gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
        {isAdmin && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingBoard(board);
                setShowAddBoardModal(true);
              }}
              className="p-2 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBoardToDelete(board);
              }}
              className="p-2 hover:bg-red-500/20 rounded-lg text-slate-300 hover:text-red-400"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// --- MAIN APP COMPONENT ---
// --- 2-DAY UPDATE NOTICE ---
function UpdateNotice({ onDismiss }) {
  const [activeTab, setActiveTab] = useState('fixes');

  const steps = [
    {
      icon: '✅',
      title: 'Marking a Task Complete',
      desc: 'Click the circle icon next to any task, or open the task and toggle the Status button to "Completed".'
    },
    {
      icon: '📅',
      title: 'Viewing Completion Date',
      desc: 'Open any completed task → the Status card shows the exact "Completion Date & Time" that was permanently recorded.'
    },
    {
      icon: '📊',
      title: 'Reading Reports',
      desc: 'All charts, leaderboards, and history use the original completion date — even if a task was accidentally re-completed later.'
    },
    {
      icon: '🗂️',
      title: 'Task History / Archive',
      desc: 'Click the "History" or "Archive" button in the top bar to view all completed tasks, filter by agent, date, or department.'
    },
    {
      icon: '🔄',
      title: 'If a Task Reverts to Incomplete',
      desc: 'Simply re-mark it as completed. The system will automatically restore the original completion date — your reports will stay accurate.'
    }
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(5, 10, 30, 0.92)', backdropFilter: 'blur(16px)' }}>
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #0b193c 0%, #1a2a6c 60%, #0d1a3a 100%)' }}>

        {/* Header Banner */}
        <div className="flex-shrink-0 px-8 pt-7 pb-5 border-b border-white/10"
          style={{ background: 'linear-gradient(90deg, #1d4ed8 0%, #2563eb 100%)' }}>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🛡️</span>
            <span className="text-xs font-bold tracking-widest text-blue-200 uppercase">System Update — Lextria Task Manager</span>
          </div>
          <h1 className="text-2xl font-bold text-white leading-snug">Important Fixes & Feature Update</h1>
          <p className="text-blue-100 text-sm mt-1 opacity-80">Please read before continuing · This notice will disappear in 2 days</p>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex border-b border-white/10">
          {[
            { key: 'fixes', label: '🔧 What Was Fixed' },
            { key: 'guide', label: '📖 How To Use' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-semibold transition-all cursor-pointer ${
                activeTab === tab.key
                  ? 'text-white border-b-2 border-blue-400 bg-white/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-7 space-y-5 custom-scrollbar">

          {activeTab === 'fixes' && (
            <>
              {/* Fix 1 */}
              <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm flex-shrink-0">1</span>
                  <h2 className="text-base font-bold text-green-300">Task Completion Reversion — Fixed</h2>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  A bug caused completed tasks to sometimes revert to <span className="text-yellow-300 font-semibold">Incomplete</span> overnight.
                  This happened because the system's auto-archiving process was silently failing for some tasks.
                  The fix ensures all completed tasks are safely and permanently archived at the end of each day — they will no longer revert.
                </p>
                <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400">
                  <span className="text-blue-300 font-semibold">Technical detail: </span>
                  Archive writes are now batched and include error logging. A realtime sync delay guard also prevents stale data from overwriting fresh completions.
                </div>
              </div>

              {/* Fix 2 */}
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">2</span>
                  <h2 className="text-base font-bold text-blue-300">Custom Completion Date — New Feature</h2>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  A new <span className="text-emerald-300 font-semibold">Custom Completion Date</span> is now automatically recorded the moment any task is marked complete.
                  This date is <span className="font-semibold text-white">permanently saved and never overwritten</span> — even if a task is accidentally un-marked and re-completed later.
                </p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-emerald-300 font-semibold text-xs mb-1">✅ What this means for you</div>
                    <ul className="text-slate-300 text-xs space-y-1 list-disc list-inside">
                      <li>Reports always show the <span className="font-semibold text-white">true original date</span></li>
                      <li>Re-completing a task won't change the recorded date</li>
                      <li>Visible inside every completed task's detail card</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="text-amber-300 font-semibold text-xs mb-1">⚠️ If a task was re-completed today</div>
                    <ul className="text-slate-300 text-xs space-y-1 list-disc list-inside">
                      <li>The original completion date is safely preserved</li>
                      <li>Open the task → check "Completion Date & Time"</li>
                      <li>Contact admin if the date looks incorrect</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Fix 3 */}
              <div className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-sm flex-shrink-0">3</span>
                  <h2 className="text-base font-bold text-purple-300">Reports Use True Completion Dates</h2>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  All analytics dashboards, leaderboards, completion charts, and task history now use the <span className="text-emerald-300 font-semibold">Custom Completion Date</span> as the authoritative source.
                  This means even if a task was re-completed on a different day due to the old bug, your reports will <span className="font-semibold text-white">reflect the correct original date</span>.
                </p>
              </div>
            </>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4">
              <p className="text-slate-400 text-sm">A quick reference for the most common actions in Lextria Task Manager.</p>
              {steps.map((step, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl border border-white/8 bg-white/4 hover:bg-white/8 transition-colors">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/25 flex items-center justify-center text-xl">
                    {step.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm mb-0.5">{step.title}</div>
                    <div className="text-slate-400 text-xs leading-relaxed">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-7 py-5 border-t border-white/10 flex items-center justify-between bg-white/3">
          <p className="text-xs text-slate-500">This notice will stop appearing after <span className="text-slate-300 font-semibold">2 days</span> from today.</p>
          <button
            onClick={onDismiss}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-all shadow-lg hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(90deg, #1d4ed8, #2563eb)' }}
          >
            ✓ Got it, Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// --- ANIMATED INTRO SPLASH SCREEN ---
function SplashScreen({ onFinished }) {
  const videoRef = useRef(null);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleExit = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => {
      onFinished();
    }, 600); // matches the CSS exit animation duration
  }, [exiting, onFinished]);

  useEffect(() => {
    // Fallback timeout: if video doesn't fire 'ended', dismiss after 6 seconds
    const fallback = setTimeout(handleExit, 6000);
    return () => clearTimeout(fallback);
  }, [handleExit]);

  // Track video progress for the progress bar
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTimeUpdate = () => {
      if (vid.duration) {
        setProgress((vid.currentTime / vid.duration) * 100);
      }
    };
    vid.addEventListener('timeupdate', onTimeUpdate);
    return () => vid.removeEventListener('timeupdate', onTimeUpdate);
  }, []);

  return (
    <div className={`splash-container ${exiting ? 'splash-exit' : ''}`}>
      <div className="splash-video-wrapper">
        <video
          ref={videoRef}
          src="/LEX_ANI_LOGO.mp4"
          autoPlay
          muted
          playsInline
          onEnded={handleExit}
          style={{ background: 'transparent' }}
        />
      </div>
      <div className="splash-title">Lextria Task Manager</div>
      <div className="splash-progress-track">
        <div
          className="splash-progress-fill"
          style={{ width: `${progress}%`, transition: 'width 0.2s linear' }}
        />
      </div>
    </div>
  );
}


export default function App() {
  const [departments, setDepartments] = useState([]);

  // --- ANTI-DEVTOOLS SECURITY ---
  useEffect(() => {
    // Disable right-click context menu
    const handleContextMenu = (e) => e.preventDefault();
    
    // Disable keyboard shortcuts for DevTools
    const handleKeyDown = (e) => {
      if (
        e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) || 
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Splash intro — only shows once per session
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('lextria_splash_shown');
  });

  // 2-day update notice: displayed on every refresh for 48 hours until expiry timestamp passes
  const [showUpdateNotice, setShowUpdateNotice] = useState(() => {
    const NOTICE_KEY = 'lextria_update_notice_expiry';
    let expiry = localStorage.getItem(NOTICE_KEY);
    if (!expiry) {
      // First time: set expiry to 48 hours from now
      expiry = String(Date.now() + 48 * 60 * 60 * 1000);
      localStorage.setItem(NOTICE_KEY, expiry);
    }
    return Date.now() < Number(expiry);
  });

  // --- GLOBAL AUTHENTICATION ---
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('lextria_user_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      const saved = localStorage.getItem('lextria_user_session');
      const user = saved ? JSON.parse(saved) : null;
      return user?.role === 'leader';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setIsAdmin(currentUser?.role === 'leader');
  }, [currentUser]);

  // Member Manual / What's New popup on login
  const [showMemberManual, setShowMemberManual] = useState(() => {
    try {
      const saved = localStorage.getItem('lextria_user_session');
      const user = saved ? JSON.parse(saved) : null;
      if (!user) return false;
      const storageKey = 'lextria_guide_seen_' + (user.id || user.name || 'user');
      const alreadySeen = localStorage.getItem(storageKey) === 'true';
      const sessionDismissed = sessionStorage.getItem('lextria_guide_dismissed_session') === 'true';
      return !alreadySeen && !sessionDismissed;
    } catch {
      return false;
    }
  });

  const handleGlobalLogin = (userData) => {
    const sessionData = {
      id: userData.id,
      name: userData.name,
      role: userData.role || 'member'
    };
    localStorage.setItem('lextria_user_session', JSON.stringify(sessionData));
    localStorage.setItem('lextria_query_session', JSON.stringify(sessionData));
    setCurrentUser(sessionData);
    setIsAdmin(sessionData.role === 'leader');

    // Trigger manual on login if not permanently dismissed
    const storageKey = 'lextria_guide_seen_' + (userData.id || userData.name || 'user');
    const alreadySeen = localStorage.getItem(storageKey) === 'true';
    if (!alreadySeen) {
      setShowMemberManual(true);
    }
  };

  const handleGlobalLogout = () => {
    localStorage.removeItem('lextria_user_session');
    localStorage.removeItem('lextria_query_session');
    setCurrentUser(null);
    setIsAdmin(false);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activeTab, setActiveTab] = useState('tasks'); // 'tasks' | 'queries'
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [dueDateFilter, setDueDateFilter] = useState('All');
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');

  // Live Date & Time
  const [liveDateTime, setLiveDateTime] = useState(new Date());
  useEffect(() => {
    const tick = setInterval(() => setLiveDateTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);
  
  // Navigation State
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [unlockedDepartments, setUnlockedDepartments] = useState([]);
  const [deptToUnlock, setDeptToUnlock] = useState(null);
  const [deptUnlockPassword, setDeptUnlockPassword] = useState('');
  const [deptUnlockError, setDeptUnlockError] = useState(false);

  // Modal States
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [departmentToDelete, setDepartmentToDelete] = useState(null);

  const [showAddBoardModal, setShowAddBoardModal] = useState(false);
  const [editingBoard, setEditingBoard] = useState(null);
  const [boardToDelete, setBoardToDelete] = useState(null);

  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  
  const [selectedTaskDetails, setSelectedTaskDetails] = useState(null);
  const [activeDragItem, setActiveDragItem] = useState(null);

  // Local states for the task details editor to ensure buttery-smooth typing & inputting without network lag
  const [localTitle, setLocalTitle] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localDueDate, setLocalDueDate] = useState('');
  const [localReminderTime, setLocalReminderTime] = useState('');
  const [localScreenshotUrl, setLocalScreenshotUrl] = useState('');
  const [localStatus, setLocalStatus] = useState(false);
  const [localPriority, setLocalPriority] = useState('Medium');
  const [localTag, setLocalTag] = useState('Undefined');
  const [localRequiredTime, setLocalRequiredTime] = useState('');
  const [localCustomCompletedAt, setLocalCustomCompletedAt] = useState('');
  const [showRequiredTimePopover, setShowRequiredTimePopover] = useState(false);
  const [customTimeVal, setCustomTimeVal] = useState('');
  const [customTimeUnit, setCustomTimeUnit] = useState('min');
  const [localAssigneeId, setLocalAssigneeId] = useState('');
  const [localEmp, setLocalEmp] = useState(null);
  const [localBoard, setLocalBoard] = useState(null);
  const [localDept, setLocalDept] = useState(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('');
  const [historyDeptFilter, setHistoryDeptFilter] = useState('ALL');
  const [historyAgentFilter, setHistoryAgentFilter] = useState('ALL');
  const [historyDateFilter, setHistoryDateFilter] = useState('ALL');
  const [historyPriorityFilter, setHistoryPriorityFilter] = useState('ALL');
  const [showArchivePage, setShowArchivePage] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [archiveSortField, setArchiveSortField] = useState('completed_date'); // 'completed_date' | 'created_at' | 'title' | 'agent'
  const [archiveSortOrder, setArchiveSortOrder] = useState('desc'); // 'desc' | 'asc'
  const [archivePriorityFilter, setArchivePriorityFilter] = useState('ALL');
  const [archiveAgentFilter, setArchiveAgentFilter] = useState('ALL');
  const [archiveCurrentPage, setArchiveCurrentPage] = useState(1);
  const [archivePageSize, setArchivePageSize] = useState(50);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showAssigneePopover, setShowAssigneePopover] = useState(false);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');

  // Dynamic toast reminder states & checker
  const notificationsRef = useRef([]);
  const [notifications, setNotifications] = useState([]);
  const triggeredRemindersRef = useRef({}); // Format: { [taskId]: 'YYYY-MM-DD' }
  const titleFlashIntervalRef = useRef(null);
  const lastLocalActionTimeRef = useRef(0);


  const [notificationPermission, setNotificationPermission] = useState('default');

  // Track and synchronize desktop notification permission state on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const [timerTick, setTimerTick] = useState(0);

  useEffect(() => {
    const hasActiveTimers = departments.some(d =>
      d.boards?.some(b =>
        b.employees?.some(e =>
          e.tasks?.some(t => t.timerStartedAt && !t.completed)
        )
      )
    );
    if (!hasActiveTimers) return;
    
    const interval = setInterval(() => setTimerTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, [departments]);

  const requestNotificationPermission = () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return;
    }
    
    Notification.requestPermission().then(permission => {
      setNotificationPermission(permission);
      if (permission === 'granted') {
        playNotificationSound();
        try {
          new Notification('🔔 Lextria Alerts Active!', {
            body: 'You will now receive task reminders in this browser.',
            icon: window.location.origin + '/favicon.svg'
          });
        } catch (e) {
          console.warn('Test notification dispatch failed:', e);
        }
      }
    }).catch(err => {
      console.error('Permission request failed:', err);
    });
  };

  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const playChimeNode = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.02); // 12% pleasant volume
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      // High-end futuristic warm double-chime chime
      playChimeNode(880, now, 0.15); // A5 note
      playChimeNode(1109.73, now + 0.08, 0.3); // C#6 note
    } catch (error) {
      console.warn('AudioContext playback failed', error);
    }
  };

  // Tab Title Flashing Logic
  const startTitleFlash = (taskTitle) => {
    if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current);
    
    let isOriginal = false;
    document.title = `🔔 Reminder: ${taskTitle}`;
    
    titleFlashIntervalRef.current = setInterval(() => {
      document.title = isOriginal ? `🔔 Reminder: ${taskTitle}` : 'Lextria Task Dashboard - Premium Office Task Management';
      isOriginal = !isOriginal;
    }, 1200);
  };

  const stopTitleFlash = () => {
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current);
      titleFlashIntervalRef.current = null;
    }
    document.title = 'Lextria Task Dashboard - Premium Office Task Management';
  };

  // Stop flashing when tab is visible / window is focused
  useEffect(() => {
    const handleFocus = () => {
      stopTitleFlash();
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        stopTitleFlash();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current);
    };
  }, []);

  const triggerNotification = (task, emp, board, dept) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newNotif = {
      id,
      taskTitle: task.title,
      employeeName: emp.name,
      boardName: board.name,
      time: task.reminderTime
    };

    setNotifications(prev => [...prev, newNotif]);

    // Play default synthesized premium chime sound
    playNotificationSound();

    // If tab is in the background or minimized, trigger HTML5 native desktop notifications & tab title flashing
    if (document.hidden || !document.hasFocus()) {
      startTitleFlash(task.title);

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const options = {
            body: `Assigned to ${emp.name} in ${board.name} (${dept.name}).`,
            icon: window.location.origin + '/favicon.svg',
            tag: task.id,
            requireInteraction: true // Keep open until actioned
          };
          
          const nativeNotification = new Notification(`🔔 Task Reminder: ${task.title}`, options);
          
          nativeNotification.onclick = () => {
            window.focus();
            // Deep-link to task details
            setSelectedDeptId(dept.id);
            setSelectedBoardId(board.id);
            setSelectedTaskDetails({ empId: emp.id, taskId: task.id });
            nativeNotification.close();
            stopTitleFlash();
          };
        } catch (e) {
          console.warn('Native Notification failed to initialize:', e);
        }
      }
    }

    // Auto-remove toast after 8 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 8000);
  };

  const checkReminders = () => {
    const now = new Date();
    
    // YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    // HH:MM
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    departments.forEach(dept => {
      dept.boards?.forEach(board => {
        board.employees?.forEach(emp => {
          emp.tasks?.forEach(task => {
            if (task.reminderTime) {
              const taskReminder = task.reminderTime.trim().substring(0, 5); // HH:MM
              
              if (taskReminder === currentTimeStr) {
                // If it has a due date, check if due date matches today
                const isDueToday = !task.dueDate || task.dueDate === todayStr;
                
                if (isDueToday) {
                  const alreadyTriggered = triggeredRemindersRef.current[task.id] === todayStr;
                  
                  if (!alreadyTriggered) {
                    triggeredRemindersRef.current[task.id] = todayStr;
                    triggerNotification(task, emp, board, dept);
                  }
                }
              }
            }
          });
        });
      });
    });
  };

  // Run reminder checker on load and tick every 8 seconds
  useEffect(() => {
    if (departments.length === 0) return;
    
    checkReminders();
    const interval = setInterval(checkReminders, 8000);
    return () => clearInterval(interval);
  }, [departments]);

  // Scrollbar and wheel scroll states & helpers
  const boardContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = boardContainerRef.current;
    if (el) {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    if (selectedBoardId) {
      const timer = setTimeout(checkScroll, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedBoardId, departments]);

  useEffect(() => {
    const el = boardContainerRef.current;
    if (el) {
      const handleWheel = (e) => {
        // If scrolling inside an element that is scrollable vertically, let it scroll naturally
        const scrollableChild = e.target.closest('.custom-scrollbar');
        if (scrollableChild && scrollableChild.scrollHeight > scrollableChild.clientHeight) {
          return;
        }

        if (el.scrollWidth > el.clientWidth) {
          if (e.deltaY !== 0) {
            e.preventDefault();
            // Scroll direct. The browser's native/CSS scroll-behavior smooths this interaction!
            el.scrollLeft += e.deltaY * 1.2;
          }
        }
      };

      el.addEventListener('scroll', checkScroll);
      el.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('resize', checkScroll);
      checkScroll();

      // Check again shortly to allow DOM elements to fully settle
      const timer = setTimeout(checkScroll, 200);

      return () => {
        el.removeEventListener('scroll', checkScroll);
        el.removeEventListener('wheel', handleWheel);
        window.removeEventListener('resize', checkScroll);
        clearTimeout(timer);
      };
    }
  }, [selectedBoardId, departments]);

  // Supabase Fetch & Realtime
  const fetchData = async () => {
    const { data: deptData } = await supabase.from('departments').select('*').order('position', { ascending: true }).order('created_at', { ascending: true });
    const { data: boardData } = await supabase.from('boards').select('*').order('position', { ascending: true }).order('created_at', { ascending: true });
    const { data: agentData } = await supabase.from('agents').select('*').order('position', { ascending: true }).order('created_at', { ascending: true });
    
    // Paginate task fetching to overcome the default 1000-row limit in Supabase/PostgREST
    let allTasks = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error("Error fetching tasks page:", error);
        break;
      }

      if (data && data.length > 0) {
        allTasks = [...allTasks, ...data];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }


    const today = new Date().toISOString().split('T')[0];
    const tasksToArchive = [];

    // Helper to resolve true completion timestamp for any task without overwriting database
    const resolveTaskDates = (t) => {
      let compDate = t.completed_date;
      let customAt = t.custom_completed_at || t.completed_at;

      if (t.completed) {
        // For legacy tasks with no completion dates, fall back to created_at (NOT today)
        const createdDate = t.created_at ? t.created_at.split('T')[0] : null;
        if (!compDate) {
          compDate = customAt ? customAt.split('T')[0] : (createdDate || today);
        }
        if (!customAt) {
          customAt = compDate ? `${compDate}T00:00:00.000Z` : (t.created_at || new Date().toISOString());
        }
      }

      return {
        ...t,
        dueDate: t.due_date,
        reminderTime: t.reminder_time,
        screenshotUrl: t.screenshot_url,
        requiredTime: t.required_time || '',
        completedDate: compDate,
        customCompletedAt: customAt,
        timerStartedAt: t.timer_started_at || null
      };
    };

    // Auto-archive past completed tasks with robust batching
    allTasks.forEach(t => {
      // Only check real completion date — NEVER fall back to createdDate, which would archive newly-completed old tasks!
      const compDate = (t.custom_completed_at ? t.custom_completed_at.split('T')[0] : null) || t.completed_date;

      if (t.completed && !t.is_archived) {
        // Only archive if explicitly completed on a previous day
        if (compDate && compDate < today) {
          t.is_archived = true;
          tasksToArchive.push(t.id);
        }
      }
    });

    // Batch update archive status in Supabase so past tasks are safely archived without failing
    if (tasksToArchive.length > 0) {
      lastLocalActionTimeRef.current = Date.now();
      supabase.from('tasks').update({ is_archived: true }).in('id', tasksToArchive).then(({ error }) => {
        if (error) console.error("Error batch auto-archiving past tasks in Supabase:", error);
      });
    }

    const activeTasks = allTasks.filter(t => !t.is_archived);
    const archivedTasksList = allTasks.filter(t => t.is_archived).map(resolveTaskDates);
    setArchivedTasks(archivedTasksList);

    const taskData = activeTasks.map(resolveTaskDates);

    if (deptData) {
      const nested = deptData.map(d => ({
        ...d,
        boards: (boardData || []).filter(b => b.department_id === d.id).map(b => ({
          ...b,
          employees: (agentData || []).filter(a => a.board_id === b.id).map(a => ({
            ...a,
            tasks: taskData.filter(t => t.agent_id === a.id)
          }))
        }))
      }));
      setDepartments(nested);
    }
  };

  useEffect(() => {
    fetchData();

    let fetchTimer;
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        clearTimeout(fetchTimer);
        const timeSinceLocalAction = Date.now() - lastLocalActionTimeRef.current;
        const delay = timeSinceLocalAction < 3000 ? 3000 : 1000;
        fetchTimer = setTimeout(() => {
          fetchData();
        }, delay);
      })
      .subscribe();

    return () => {
      clearTimeout(fetchTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- ADMIN ACTIONS ---
  const toggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      setShowAdminModal(true);
    }
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === '334') {
      setIsAdmin(true);
      setShowAdminModal(false);
      setAdminPassword('');
    } else {
      alert('Incorrect Password');
    }
  };

  // --- CRUD DEPARTMENTS ---
  const handleAddDept = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name');
    const password = formData.get('password') || '';
    
    if (editingDepartment) {
      const removePassword = formData.get('remove_password') === 'on';
      let changePassword = false;
      let newPassword = '';
      if (removePassword) {
        changePassword = true;
        newPassword = '';
      } else if (password !== '') {
        changePassword = true;
        newPassword = password;
      }
      
      const hasPassword = removePassword ? false : (password !== '' ? true : editingDepartment.has_password);
      
      // Optimistic edit
      setDepartments(prev => prev.map(d => d.id === editingDepartment.id ? {
        ...d,
        name,
        has_password: hasPassword
      } : d));
      setShowAddDeptModal(false);
      const originalDept = { ...editingDepartment };
      setEditingDepartment(null);

      try {
        await supabase.rpc('update_department', {
          dept_id: originalDept.id,
          dept_name: name,
          input_password: newPassword,
          change_password: changePassword
        });
      } catch (err) {
        console.error(err);
      }
    } else {
      const tempId = 'temp-dept-' + Math.random().toString(36).substring(2, 11);
      const newDeptObj = {
        id: tempId,
        name,
        boards: [],
        has_password: password !== '',
        position: 999
      };
      
      // Optimistic insert
      setDepartments(prev => [...prev, newDeptObj]);
      setShowAddDeptModal(false);
      setSelectedDeptId(tempId);

      try {
        const { data: newDeptId, error } = await supabase.rpc('create_department_with_password', {
          dept_name: name,
          input_password: password
        });

        if (error) {
          console.error(error);
          // Rollback
          setDepartments(prev => prev.filter(d => d.id !== tempId));
          setSelectedDeptId(null);
          return;
        }

        if (newDeptId) {
          setDepartments(prev => prev.map(d => d.id === tempId ? { ...d, id: newDeptId } : d));
          setSelectedDeptId(newDeptId);
        }
      } catch (err) {
        console.error(err);
        // Rollback
        setDepartments(prev => prev.filter(d => d.id !== tempId));
        setSelectedDeptId(null);
      }
    }
  };

  const handleAddBoard = async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    if (editingBoard) {
      // Optimistic edit
      setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
        ...d,
        boards: d.boards.map(b => b.id === editingBoard.id ? { ...b, name } : b)
      } : d));
      setShowAddBoardModal(false);
      const originalBoard = { ...editingBoard };
      setEditingBoard(null);

      try {
        await supabase.from('boards').update({ name }).eq('id', originalBoard.id);
      } catch (err) {
        console.error(err);
      }
    } else {
      const tempId = 'temp-board-' + Math.random().toString(36).substring(2, 11);
      const newBoardObj = {
        id: tempId,
        department_id: selectedDeptId,
        name,
        employees: [],
        position: 999
      };

      // Optimistic insert
      setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
        ...d,
        boards: [...(d.boards || []), newBoardObj]
      } : d));
      setShowAddBoardModal(false);
      setSelectedBoardId(tempId);

      try {
        const { data, error } = await supabase.from('boards').insert([{ department_id: selectedDeptId, name }]).select();
        
        if (error) {
          console.error(error);
          // Rollback
          setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
            ...d,
            boards: d.boards.filter(b => b.id !== tempId)
          } : d));
          setSelectedBoardId(null);
          return;
        }

        if (data && data[0]) {
          const realBoard = {
            ...data[0],
            employees: []
          };
          setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
            ...d,
            boards: d.boards.map(b => b.id === tempId ? realBoard : b)
          } : d));
          setSelectedBoardId(realBoard.id);
        }
      } catch (err) {
        console.error(err);
        // Rollback
        setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
          ...d,
          boards: d.boards.filter(b => b.id !== tempId)
        } : d));
        setSelectedBoardId(null);
      }
    }
  };

  const handleAddOrEditEmployee = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name');
    const role = formData.get('role');
    const color = formData.get('color');

    if (editingEmployee) {
      // Optimistic edit
      setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
        ...d,
        boards: d.boards.map(b => b.id === selectedBoardId ? {
          ...b,
          employees: b.employees.map(emp => emp.id === editingEmployee.id ? {
            ...emp, name, role, color
          } : emp)
        } : b)
      } : d));
      setShowAddEmpModal(false);
      const originalEmployee = { ...editingEmployee };
      setEditingEmployee(null);

      try {
        await supabase.from('agents').update({ name, role, color }).eq('id', originalEmployee.id);
      } catch (err) {
        console.error(err);
      }
    } else {
      const tempId = 'temp-emp-' + Math.random().toString(36).substring(2, 11);
      const newEmpObj = {
        id: tempId,
        board_id: selectedBoardId,
        name,
        role,
        color,
        tasks: [],
        position: 999
      };

      // Optimistic insert
      setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
        ...d,
        boards: d.boards.map(b => b.id === selectedBoardId ? {
          ...b,
          employees: [...(b.employees || []), newEmpObj]
        } : b)
      } : d));
      setShowAddEmpModal(false);

      try {
        const { data, error } = await supabase.from('agents').insert([{ board_id: selectedBoardId, name, role, color }]).select();
        
        if (error) {
          console.error(error);
          // Rollback
          setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
            ...d,
            boards: d.boards.map(b => b.id === selectedBoardId ? {
              ...b,
              employees: b.employees.filter(emp => emp.id !== tempId)
            } : b)
          } : d));
          return;
        }

        if (data && data[0]) {
          const realEmp = {
            ...data[0],
            tasks: []
          };
          setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
            ...d,
            boards: d.boards.map(b => b.id === selectedBoardId ? {
              ...b,
              employees: b.employees.map(emp => emp.id === tempId ? realEmp : emp)
            } : b)
          } : d));
        }
      } catch (err) {
        console.error(err);
        // Rollback
        setDepartments(prev => prev.map(d => d.id === selectedDeptId ? {
          ...d,
          boards: d.boards.map(b => b.id === selectedBoardId ? {
            ...b,
            employees: b.employees.filter(emp => emp.id !== tempId)
          } : b)
        } : d));
      }
    }
  };

  const deleteEmployee = async (empId) => {
    // Optimistic
    setDepartments(prev => prev.map(d => ({
      ...d,
      boards: d.boards.map(b => ({
        ...b,
        employees: b.employees.filter(e => e.id !== empId)
      }))
    })));
    await supabase.from('agents').delete().eq('id', empId);
  };

  const addTask = async (empId, title = 'New Task') => {
    const tempId = 'temp-task-' + Math.random().toString(36).substring(2, 11);
    const newTaskObj = {
      id: tempId,
      agent_id: empId,
      title: title,
      description: '',
      completed: false,
      priority: 'Medium',
      dueDate: '',
      reminderTime: '',
      tag: 'Undefined',
      requiredTime: '',
      screenshotUrl: '',
      timerStartedAt: null,
      customCompletedAt: null,
      position: 0
    };

    // Optimistic insert
    setDepartments(prev => prev.map(d => ({
      ...d,
      boards: d.boards.map(b => ({
        ...b,
        employees: b.employees.map(e => e.id === empId ? {
          ...e,
          tasks: [...(e.tasks || []), newTaskObj]
        } : e)
      }))
    })));

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{ agent_id: empId, title }])
        .select();

      if (error) {
        console.error("Error creating task:", error);
        // Rollback
        setDepartments(prev => prev.map(d => ({
          ...d,
          boards: d.boards.map(b => ({
            ...b,
            employees: b.employees.map(e => e.id === empId ? {
              ...e,
              tasks: e.tasks.filter(t => t.id !== tempId)
            } : e)
          }))
        })));
        return;
      }

      if (data && data[0]) {
        const realTask = {
          ...data[0],
          dueDate: data[0].due_date,
          reminderTime: data[0].reminder_time,
          screenshotUrl: data[0].screenshot_url,
          requiredTime: data[0].required_time || '',
          timerStartedAt: data[0].timer_started_at || null,
          customCompletedAt: data[0].custom_completed_at || null
        };
        // Replace temp task with real task
        setDepartments(prev => prev.map(d => ({
          ...d,
          boards: d.boards.map(b => ({
            ...b,
            employees: b.employees.map(e => e.id === empId ? {
              ...e,
              tasks: e.tasks.map(t => t.id === tempId ? realTask : t)
            } : e)
          }))
        })));

        // Sync details modal selection ID if user opened it while temp
        setSelectedTaskDetails(prev => {
          if (prev && prev.taskId === tempId) {
            return { ...prev, taskId: realTask.id };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error(err);
      // Rollback
      setDepartments(prev => prev.map(d => ({
        ...d,
        boards: d.boards.map(b => ({
          ...b,
          employees: b.employees.map(e => e.id === empId ? {
            ...e,
            tasks: e.tasks.filter(t => t.id !== tempId)
          } : e)
        }))
      })));
    }
  };

  const updateTask = async (empId, taskId, updates) => {
    lastLocalActionTimeRef.current = Date.now();
    let localUpdates = { ...updates };

    // Find current task to check current values
    let currentTask = null;
    let currentRequiredTime = '';
    let currentTimerStartedAt = null;
    let currentCustomCompletedAt = null;
    let currentCompletedDate = null;
    const foundEmp = allEmployees.find(e => e.id === empId);
    if (foundEmp) {
      currentTask = foundEmp.tasks?.find(t => t.id === taskId);
    }
    if (!currentTask && archivedTasks) {
      currentTask = archivedTasks.find(t => t.id === taskId);
    }
    if (currentTask) {
      currentRequiredTime = currentTask.requiredTime || currentTask.required_time || '';
      currentTimerStartedAt = currentTask.timerStartedAt || currentTask.timer_started_at || null;
      currentCustomCompletedAt = currentTask.customCompletedAt || currentTask.custom_completed_at || null;
      currentCompletedDate = currentTask.completedDate || currentTask.completed_date || null;
    }

    if (updates.completed !== undefined) {
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      
      if (updates.completed) {
        // If task was already completed, preserve existing completion date; otherwise newly set to today
        const wasAlreadyCompleted = currentTask?.completed;
        const preserveDate = (wasAlreadyCompleted && currentCompletedDate) ? currentCompletedDate : todayStr;
        const preserveCustomAt = (wasAlreadyCompleted && currentCustomCompletedAt) ? currentCustomCompletedAt : nowIso;
        
        localUpdates.completed = true;
        localUpdates.completed_date = preserveDate;
        localUpdates.completedDate = preserveDate;
        localUpdates.completed_at = preserveCustomAt;
        localUpdates.completedAt = preserveCustomAt;
        localUpdates.custom_completed_at = preserveCustomAt;
        localUpdates.customCompletedAt = preserveCustomAt;
        localUpdates.updated_at = nowIso;
        localUpdates.is_archived = false;
      } else {
        localUpdates.completed = false;
        localUpdates.completed_date = null;
        localUpdates.completedDate = null;
        localUpdates.completed_at = null;
        localUpdates.completedAt = null;
        localUpdates.updated_at = nowIso;
        localUpdates.is_archived = false;
      }

      // Stop/reset timer when completed
      localUpdates.timerStartedAt = null;
    }

    if (updates.customCompletedAt !== undefined || updates.custom_completed_at !== undefined) {
      const val = updates.customCompletedAt || updates.custom_completed_at;
      localUpdates.customCompletedAt = val;
      localUpdates.custom_completed_at = val;
      if (val) {
        const dStr = val.split('T')[0];
        localUpdates.completed_date = dStr;
        localUpdates.completedDate = dStr;
      }
    }

    // Auto-start / change / clear timer when requiredTime is updated
    if (updates.requiredTime !== undefined) {
      const newRequiredTime = updates.requiredTime ? updates.requiredTime.trim() : '';
      const isTaskCompleted = updates.completed !== undefined ? updates.completed : currentTask?.completed;
      if (!isTaskCompleted && newRequiredTime && newRequiredTime !== 'Undefined') {
        // Only set new timer if the required time value actually changed OR there's no active timer
        if (newRequiredTime !== currentRequiredTime || !currentTimerStartedAt) {
          const nowIso = new Date().toISOString();
          localUpdates.timerStartedAt = nowIso;
        }
      } else {
        // If requiredTime is removed/cleared or task is completed
        localUpdates.timerStartedAt = null;
      }
    }

    // Handle restoring archived tasks if un-completed (Undo action)
    if (updates.completed === false) {
      setArchivedTasks(prev => {
        const archivedTask = prev.find(t => t.id === taskId);
        if (archivedTask) {
          const targetEmpId = updates.agent_id || empId || archivedTask.agent_id;
          setDepartments(deptPrev => deptPrev.map(d => ({
            ...d,
            boards: d.boards.map(b => ({
              ...b,
              employees: b.employees.map(e => {
                if (e.id === targetEmpId) {
                  const exists = e.tasks?.some(t => t.id === taskId);
                  if (!exists) {
                    const restoredTask = {
                      ...archivedTask,
                      ...localUpdates,
                      completed: false,
                      completed_date: null,
                      completedDate: null,
                      completed_at: null,
                      completedAt: null,
                      timerStartedAt: null,
                      is_archived: false
                    };
                    return { ...e, tasks: [...(e.tasks || []), restoredTask] };
                  }
                }
                return e;
              })
            }))
          })));
        }
        return prev.filter(t => t.id !== taskId);
      });
    }

    // Optimistic relocation across employees, boards, and departments
    setDepartments(prev => {
      let taskToMove = null;
      const isMovingEmployee = updates.agent_id !== undefined && updates.agent_id !== empId;

      if (isMovingEmployee) {
        // Pre-locate the task to ensure its details are not lost due to array mapping order
        for (const d of prev) {
          for (const b of d.boards || []) {
            for (const e of b.employees || []) {
              if (e.id === empId) {
                taskToMove = e.tasks?.find(t => t.id === taskId);
                break;
              }
            }
            if (taskToMove) break;
          }
          if (taskToMove) break;
        }
      }

      return prev.map(d => ({
        ...d,
        boards: d.boards.map(b => ({
          ...b,
          employees: b.employees.map(e => {
            // Case 1: The old assignee (remove the task from their list if moving)
            if (e.id === empId) {
              if (isMovingEmployee) {
                return {
                  ...e,
                  tasks: e.tasks.filter(t => t.id !== taskId)
                };
              } else {
                // Regular updates in-place
                // If starting a timer for this task, clear all other tasks' timerStartedAt
                const clearOtherTimers = localUpdates.timerStartedAt !== undefined && localUpdates.timerStartedAt !== null;
                return {
                  ...e,
                  tasks: e.tasks.map(t => {
                    if (t.id === taskId) {
                      return { ...t, ...localUpdates };
                    } else if (clearOtherTimers) {
                      return { ...t, timerStartedAt: null };
                    }
                    return t;
                  })
                };
              }
            }
            // Case 2: The new assignee (append the task to their list with new updates)
            if (isMovingEmployee && e.id === updates.agent_id) {
              const updatedTask = taskToMove ? { ...taskToMove, ...localUpdates } : { id: taskId, ...localUpdates };
              const clearOtherTimers = localUpdates.timerStartedAt !== undefined && localUpdates.timerStartedAt !== null;
              return {
                ...e,
                tasks: [
                  ...(e.tasks || []).map(t => clearOtherTimers ? { ...t, timerStartedAt: null } : t),
                  updatedTask
                ]
              };
            }
            return e;
          })
        }))
      }));
    });
    
    // API
    const dbUpdates = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.completed !== undefined) {
      dbUpdates.completed = updates.completed;
      if (updates.completed) {
        const wasAlreadyCompleted = currentTask?.completed;
        const preserveDate = (wasAlreadyCompleted && currentCompletedDate) ? currentCompletedDate : new Date().toISOString().split('T')[0];
        const preserveCustomAt = (wasAlreadyCompleted && currentCustomCompletedAt) ? currentCustomCompletedAt : new Date().toISOString();
        dbUpdates.completed_date = preserveDate;
        dbUpdates.custom_completed_at = preserveCustomAt;
      } else {
        dbUpdates.completed_date = null;
        dbUpdates.custom_completed_at = null;
        dbUpdates.is_archived = false;
      }
      dbUpdates.timer_started_at = null;
    }
    if (updates.customCompletedAt !== undefined || updates.custom_completed_at !== undefined) {
      const val = updates.customCompletedAt || updates.custom_completed_at;
      dbUpdates.custom_completed_at = val;
      if (val) {
        dbUpdates.completed_date = val.split('T')[0];
      }
    }
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.requiredTime !== undefined) {
      const newRequiredTime = updates.requiredTime ? updates.requiredTime.trim() : '';
      dbUpdates.required_time = newRequiredTime;
      const isTaskCompleted = updates.completed !== undefined ? updates.completed : currentTask?.completed;
      if (!isTaskCompleted && newRequiredTime && newRequiredTime !== 'Undefined') {
        if (newRequiredTime !== currentRequiredTime || !currentTimerStartedAt) {
          dbUpdates.timer_started_at = localUpdates.timerStartedAt || new Date().toISOString();
        }
      } else {
        dbUpdates.timer_started_at = null;
      }
    }
    if (updates.tag !== undefined) {
      dbUpdates.tag = updates.tag;
    }
    if (updates.agent_id !== undefined) dbUpdates.agent_id = updates.agent_id;
    if (updates.screenshotUrl !== undefined) dbUpdates.screenshot_url = updates.screenshotUrl;
    if (updates.reminderTime !== undefined) {
      dbUpdates.reminder_time = updates.reminderTime;
      // Reset reminder trigger state so if user sets it to the current time, it triggers immediately
      if (triggeredRemindersRef.current) {
        delete triggeredRemindersRef.current[taskId];
      }
    }
    
    // Stop all other running timers in the database for the targeted agent
    const targetAgentId = updates.agent_id !== undefined ? updates.agent_id : empId;
    if (dbUpdates.timer_started_at && targetAgentId) {
      const { error: resetError } = await supabase
        .from('tasks')
        .update({ timer_started_at: null })
        .eq('agent_id', targetAgentId)
        .neq('id', taskId);
      if (resetError) {
        console.error('Failed to reset other task timers in Supabase:', resetError);
      }
    }
    
    let { error } = await supabase.from('tasks').update(dbUpdates).eq('id', taskId);
    if (error && error.message && error.message.includes('custom_completed_at')) {
      const fallbackUpdates = { ...dbUpdates };
      delete fallbackUpdates.custom_completed_at;
      const retry = await supabase.from('tasks').update(fallbackUpdates).eq('id', taskId);
      if (retry.error) {
        console.error('Failed to update task in Supabase fallback:', retry.error);
      }
    } else if (error) {
      console.error('Failed to update task in Supabase:', error);
    }

    // Refresh timestamp after database write finishes to guarantee realtime debounce window
    lastLocalActionTimeRef.current = Date.now();
  };

  const deleteTask = async (empId, taskId) => {
    lastLocalActionTimeRef.current = Date.now();
    // Optimistic
    setDepartments(prev => prev.map(d => ({
      ...d,
      boards: d.boards.map(b => ({
        ...b,
        employees: b.employees.map(e => e.id === empId ? {
          ...e, tasks: e.tasks.filter(t => t.id !== taskId)
        } : e)
      }))
    })));
    await supabase.from('tasks').delete().eq('id', taskId);
  };

  // --- DRAG AND DROP HANDLERS ---
  const handleDragStart = (event) => {
    const { active } = event;
    lastLocalActionTimeRef.current = Date.now();
    setActiveDragItem(active.data.current);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (!activeData || !overData) return;

    if (activeData.type === 'Task') {
      const activeEmpId = activeData.employeeId;
      const overEmpId = overData.type === 'Task' ? overData.employeeId : overData.type === 'Employee' ? overData.employee.id : null;
      
      if (!overEmpId || activeEmpId === overEmpId) return;

      lastLocalActionTimeRef.current = Date.now();

      setDepartments(prev => {
        const next = JSON.parse(JSON.stringify(prev));
        const dept = next.find(d => d.id === selectedDeptId);
        const board = dept.boards.find(b => b.id === selectedBoardId);

        let srcEmp, destEmp;
        board.employees.forEach(e => {
          if (e.id === activeEmpId) srcEmp = e;
          if (e.id === overEmpId) destEmp = e;
        });

        const taskIndex = srcEmp.tasks.findIndex(t => t.id === active.id);
        const [task] = srcEmp.tasks.splice(taskIndex, 1);

        if (overData.type === 'Task') {
          const overIndex = destEmp.tasks.findIndex(t => t.id === over.id);
          const isBelowOverItem = over && active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height;
          const modifier = isBelowOverItem ? 1 : 0;
          destEmp.tasks.splice(overIndex >= 0 ? overIndex + modifier : destEmp.tasks.length, 0, task);
        } else {
          destEmp.tasks.push(task);
        }
        
        active.data.current.employeeId = overEmpId;
        return next;
      });
    }
  };

  const handleDragEnd = (event) => {
    setActiveDragItem(null);
    lastLocalActionTimeRef.current = Date.now();
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'Task') {
      const taskId = active.id;

      if (overData?.type === 'Task' && activeData.employeeId === overData.employeeId) {
        if (active.id !== over.id) {
          setDepartments(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const dept = next.find(d => d.id === selectedDeptId);
            const board = dept?.boards.find(b => b.id === selectedBoardId);
            let emp = board?.employees.find(e => e.id === activeData.employeeId);
            if (emp) {
              const oldIndex = emp.tasks.findIndex(t => t.id === active.id);
              const newIndex = emp.tasks.findIndex(t => t.id === over.id);
              const updatedTasks = arrayMove(emp.tasks, oldIndex, newIndex);
              emp.tasks = updatedTasks;

              // Asynchronously update positions in Supabase
              updatedTasks.forEach((t, index) => {
                supabase.from('tasks').update({ position: index }).eq('id', t.id).then();
              });
            }
            return next;
          });
        }
      }

      // Persist the final agent_id and position to Supabase
      setTimeout(() => {
        setDepartments(currentDepts => {
          let targetEmpId = null;
          let targetIndex = 0;

          currentDepts.forEach(d => {
            d.boards?.forEach(b => {
              b.employees?.forEach(e => {
                const idx = e.tasks?.findIndex(t => t.id === taskId);
                if (idx !== -1 && idx !== undefined) {
                  targetEmpId = e.id;
                  targetIndex = idx;
                }
              });
            });
          });

          if (targetEmpId) {
            supabase.from('tasks').update({ 
              agent_id: targetEmpId, 
              position: targetIndex 
            }).eq('id', taskId).then(({ error }) => {
              if (error) console.error('Error saving dragged task to Supabase:', error);
            });
          }

          return currentDepts;
        });
      }, 50);
    }

    if (activeData.type === 'Employee' && overData.type === 'Employee') {
      if (active.id !== over.id) {
        setDepartments(prev => {
          const next = JSON.parse(JSON.stringify(prev));
          const dept = next.find(d => d.id === selectedDeptId);
          const board = dept.boards.find(b => b.id === selectedBoardId);
          const oldIndex = board.employees.findIndex(e => e.id === active.id);
          const newIndex = board.employees.findIndex(e => e.id === over.id);
          const updatedEmployees = arrayMove(board.employees, oldIndex, newIndex);
          board.employees = updatedEmployees;

          // Asynchronously save the new custom position order to Supabase
          updatedEmployees.forEach((emp, index) => {
            supabase.from('agents').update({ position: index }).eq('id', emp.id).then();
          });

          return next;
        });
      }
    }
  };

  const handleDepartmentDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDepartments(prev => {
      const oldIndex = prev.findIndex(d => d.id === active.id);
      const newIndex = prev.findIndex(d => d.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const updatedDepts = arrayMove(prev, oldIndex, newIndex);

      // Asynchronously update position in Supabase
      updatedDepts.forEach((dept, index) => {
        supabase.from('departments').update({ position: index }).eq('id', dept.id).then();
      });

      return updatedDepts;
    });
  };

  const handleBoardDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDepartments(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const dept = next.find(d => d.id === selectedDeptId);
      if (!dept) return prev;

      const oldIndex = dept.boards.findIndex(b => b.id === active.id);
      const newIndex = dept.boards.findIndex(b => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const updatedBoards = arrayMove(dept.boards, oldIndex, newIndex);
      dept.boards = updatedBoards;

      // Asynchronously update position in Supabase
      updatedBoards.forEach((board, index) => {
        supabase.from('boards').update({ position: index }).eq('id', board.id).then();
      });

      return next;
    });
  };

  // --- RENDER HELPERS ---
  const currentDept = selectedDeptId ? departments.find(d => d.id === selectedDeptId) : null;
  const currentBoard = currentDept && selectedBoardId ? currentDept.boards.find(b => b.id === selectedBoardId) : null;

  const allEmployees = useMemo(() => {
    const list = [];
    departments.forEach(dept => {
      dept.boards?.forEach(board => {
        board.employees?.forEach(emp => {
          list.push({
            ...emp,
            boardName: board.name,
            deptName: dept.name
          });
        });
      });
    });
    return list;
  }, [departments]);

  const activeTaskDetails = useMemo(() => {
    if (!selectedTaskDetails) return null;
    const { taskId } = selectedTaskDetails;
    for (const dept of departments) {
      for (const board of dept.boards || []) {
        for (const emp of board.employees || []) {
          const task = emp.tasks?.find(t => t.id === taskId);
          if (task) {
            return { dept, board, emp, task };
          }
        }
      }
    }
    return null;
  }, [selectedTaskDetails, departments]);

  const completedTasks = useMemo(() => {
    const list = [];
    const empMap = new Map();

    departments.forEach(dept => {
      dept.boards?.forEach(board => {
        board.employees?.forEach(emp => {
          empMap.set(emp.id, emp);
          emp.tasks?.forEach(task => {
            if (task.completed) {
              list.push({ task, emp, boardName: board.name, deptName: dept.name });
            }
          });
        });
      });
    });

    (archivedTasks || []).forEach(task => {
      const emp = empMap.get(task.agent_id) || { id: task.agent_id, name: 'Agent', color: 'bg-slate-500' };
      const rawCustom = task.custom_completed_at || task.customCompletedAt || task.completed_at || task.completedAt || (task.completed_date ? `${task.completed_date}T00:00:00.000Z` : null);
      list.push({
        task: {
          id: task.id,
          title: task.title || 'Untitled Task',
          description: task.description || '',
          completed: true,
          priority: task.priority || 'Medium',
          completed_date: task.completed_date || task.completedDate,
          completed_at: task.completed_at || task.completedAt || task.updated_at,
          custom_completed_at: rawCustom,
          customCompletedAt: rawCustom,
          created_at: task.created_at || task.createdAt
        },
        emp,
        boardName: 'Archived',
        deptName: 'Archived'
      });
    });

    return list.sort((a, b) => {
      const getTimestamp = (t) => {
        if (t.custom_completed_at) return new Date(t.custom_completed_at).getTime();
        if (t.customCompletedAt) return new Date(t.customCompletedAt).getTime();
        if (t.completed_at) return new Date(t.completed_at).getTime();
        if (t.completedAt) return new Date(t.completedAt).getTime();
        if (t.updated_at) return new Date(t.updated_at).getTime();
        if (t.completed_date) return new Date(t.completed_date).getTime();
        if (t.completedDate) return new Date(t.completedDate).getTime();
        if (t.created_at) return new Date(t.created_at).getTime();
        return 0;
      };
      return getTimestamp(b.task) - getTimestamp(a.task);
    });
  }, [departments, archivedTasks]);

  const filteredCompletedTasks = useMemo(() => {
    const todayStrVal = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStrVal = yesterdayDate.toISOString().split('T')[0];
    const d7Date = new Date();
    d7Date.setDate(d7Date.getDate() - 7);
    const d7StrVal = d7Date.toISOString().split('T')[0];

    return completedTasks.filter(({ task, emp, deptName }) => {
      // Search query filter
      if (searchHistoryQuery.trim()) {
        const query = searchHistoryQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDesc = task.description && task.description.toLowerCase().includes(query);
        const matchesAgent = emp.name.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesAgent) return false;
      }

      // Department filter
      if (historyDeptFilter !== 'ALL' && deptName !== historyDeptFilter) return false;

      // Agent filter
      if (historyAgentFilter !== 'ALL' && emp.id !== historyAgentFilter) return false;

      // Priority filter
      if (historyPriorityFilter !== 'ALL' && (task.priority || 'Medium') !== historyPriorityFilter) return false;

      // Date filter using true Custom Completion Date
      const customVal = task.custom_completed_at || task.customCompletedAt;
      const taskDate = (customVal ? customVal.split('T')[0] : null) || task.completed_date || task.completedDate || (task.created_at ? task.created_at.split('T')[0] : '');
      if (historyDateFilter === 'TODAY' && taskDate !== todayStrVal) return false;
      if (historyDateFilter === 'YESTERDAY' && taskDate !== yesterdayStrVal) return false;
      if (historyDateFilter === 'LAST_7' && taskDate < d7StrVal) return false;

      return true;
    });
  }, [completedTasks, searchHistoryQuery, historyDeptFilter, historyAgentFilter, historyDateFilter, historyPriorityFilter]);

  const filteredAndSortedArchivedTasks = useMemo(() => {
    let list = [...(archivedTasks || [])];

    // Agent map lookup for fast resolution
    const agentMap = new Map();
    departments.forEach(d => {
      d.boards?.forEach(b => {
        b.employees?.forEach(e => {
          agentMap.set(e.id, { name: e.name, color: e.color, boardName: b.name, deptName: d.name });
        });
      });
    });

    // 1. Search Query filter (Task title, description, agent name, priority, date)
    if (archiveSearchQuery.trim()) {
      const q = archiveSearchQuery.toLowerCase();
      list = list.filter(t => {
        const titleMatch = t.title && t.title.toLowerCase().includes(q);
        const descMatch = t.description && t.description.toLowerCase().includes(q);
        const agentMeta = agentMap.get(t.agent_id);
        const agentMatch = (agentMeta?.name && agentMeta.name.toLowerCase().includes(q)) || (t.agent_id && t.agent_id.toLowerCase().includes(q));
        const prioMatch = t.priority && t.priority.toLowerCase().includes(q);
        const dateMatch = (t.completed_date && t.completed_date.includes(q)) || (t.created_at && t.created_at.includes(q));
        return titleMatch || descMatch || agentMatch || prioMatch || dateMatch;
      });
    }

    // 2. Priority Filter
    if (archivePriorityFilter !== 'ALL') {
      list = list.filter(t => (t.priority || 'Medium') === archivePriorityFilter);
    }

    // 3. Agent Filter
    if (archiveAgentFilter !== 'ALL') {
      list = list.filter(t => t.agent_id === archiveAgentFilter);
    }

    // 4. Sorting
    list.sort((a, b) => {
      if (archiveSortField === 'completed_date') {
        const timeA = a.customCompletedAt || a.custom_completed_at || a.completed_date || a.completedDate || a.completed_at;
        const timeB = b.customCompletedAt || b.custom_completed_at || b.completed_date || b.completedDate || b.completed_at;
        const valA = timeA ? new Date(timeA).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const valB = timeB ? new Date(timeB).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return archiveSortOrder === 'asc' ? valA - valB : valB - valA;
      } else if (archiveSortField === 'created_at') {
        const valA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const valB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return archiveSortOrder === 'asc' ? valA - valB : valB - valA;
      } else if (archiveSortField === 'title') {
        const valA = (a.title || '').toLowerCase();
        const valB = (b.title || '').toLowerCase();
        return archiveSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (archiveSortField === 'agent') {
        const valA = (agentMap.get(a.agent_id)?.name || a.agent_id || '').toLowerCase();
        const valB = (agentMap.get(b.agent_id)?.name || b.agent_id || '').toLowerCase();
        return archiveSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return 0;
    });

    return list;
  }, [archivedTasks, departments, archiveSearchQuery, archivePriorityFilter, archiveAgentFilter, archiveSortField, archiveSortOrder]);

  // Synchronize local modal editor state when the selected task changes
  useEffect(() => {
    if (activeTaskDetails) {
      setLocalTitle(activeTaskDetails.task.title || '');
      setLocalDescription(activeTaskDetails.task.description || '');
      setLocalDueDate(activeTaskDetails.task.dueDate || '');
      setLocalReminderTime(activeTaskDetails.task.reminderTime || '');
      setLocalScreenshotUrl(activeTaskDetails.task.screenshotUrl || '');
      setLocalStatus(activeTaskDetails.task.completed || false);
      setLocalPriority(activeTaskDetails.task.priority || 'Medium');
      setLocalTag(activeTaskDetails.task.tag || 'Undefined');
      setLocalRequiredTime(activeTaskDetails.task.requiredTime || '');
      // Format for datetime-local input (YYYY-MM-DDTHH:mm)
      const rawCat = activeTaskDetails.task.customCompletedAt || activeTaskDetails.task.custom_completed_at || activeTaskDetails.task.completed_at;
      setLocalCustomCompletedAt(rawCat ? new Date(rawCat).toISOString().slice(0, 16) : '');
      setShowRequiredTimePopover(false);
      setCustomTimeVal('');
      setLocalAssigneeId(activeTaskDetails.emp.id || '');
      setLocalEmp(activeTaskDetails.emp);
      setLocalBoard(activeTaskDetails.board);
      setLocalDept(activeTaskDetails.dept);
      setShowTagPopover(false);
      setTagSearchQuery('');
      setIsEditingDescription(false);
      setShowAssigneePopover(false);
      setAssigneeSearchQuery('');
    } else {
      setLocalTitle('');
      setLocalDescription('');
      setLocalDueDate('');
      setLocalReminderTime('');
      setLocalScreenshotUrl('');
      setLocalStatus(false);
      setLocalPriority('Medium');
      setLocalTag('Undefined');
      setLocalRequiredTime('');
      setLocalCustomCompletedAt('');
      setShowRequiredTimePopover(false);
      setCustomTimeVal('');
      setLocalAssigneeId('');
      setLocalEmp(null);
      setLocalBoard(null);
      setLocalDept(null);
      setShowTagPopover(false);
      setTagSearchQuery('');
      setIsEditingDescription(false);
      setShowAssigneePopover(false);
      setAssigneeSearchQuery('');
    }
  }, [activeTaskDetails?.task.id]);

  // --- GLOBAL AUTHENTICATION GATE ---
  if (!currentUser) {
    return <LoginPage onLogin={handleGlobalLogin} />;
  }

  return (
    <div className="relative min-h-screen text-slate-100 overflow-x-hidden font-sans">
      {/* System Under Maintenance Lockout */}
      {IS_UNDER_MAINTENANCE && <MaintenanceScreen />}

      {/* Animated Intro Splash */}
      {showSplash && (
        <SplashScreen onFinished={() => {
          sessionStorage.setItem('lextria_splash_shown', 'true');
          setShowSplash(false);
        }} />
      )}

      {/* 2-Day Update Notice — displayed on every refresh for 2 days */}
      {!showSplash && showUpdateNotice && (
        <UpdateNotice onDismiss={() => setShowUpdateNotice(false)} />
      )}

      {/* Member What's New & User Manual Popup on Login */}
      {!showSplash && (
        <MemberManualModal
          isOpen={showMemberManual}
          onClose={() => setShowMemberManual(false)}
          currentUser={currentUser}
        />
      )}

      {/* Background Orbs */}
      <div className="bg-orb bg-brand-600/30 w-[500px] h-[500px] top-[-100px] left-[-100px]" />
      <div className="bg-orb bg-accent-500/20 w-[400px] h-[400px] bottom-[10%] right-[-50px]" style={{ animationDelay: '-5s' }} />
      <div className="bg-orb bg-brand-400/20 w-[600px] h-[600px] top-[40%] left-[30%]" style={{ animationDelay: '-10s' }} />

      {/* Navbar */}
      <nav className="glass-card rounded-none border-t-0 border-x-0 border-b-white/10 px-4 lg:px-6 py-3 sticky top-0 z-40 backdrop-blur-2xl bg-[#0a0a1a]/80">
        <div className="w-full flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3 shrink-0">
            <img 
              src="/logo.png" 
              alt="Lextria Logo" 
              className="w-10 h-10 rounded-full object-cover shadow-lg border border-white/15 shrink-0"
            />
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 whitespace-nowrap">
              Lextria Task & Query Manager
            </h1>
          </div>

          {/* Global Search Bar */}
          <div className="relative flex-1 max-w-xs xl:max-w-sm hidden md:block z-50">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-400 transition-colors pointer-events-none" size={17} />
              <input 
                type="text" 
                placeholder="Search tasks, tags, agents..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-full py-2 pr-8 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all shadow-[0_0_15px_rgba(0,0,0,0.2)]"
                style={{ paddingLeft: '2.6rem' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  title="Clear Search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {/* Search Results Dropdown */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute top-full mt-2 w-full bg-[#050c26]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden max-h-[400px] overflow-y-auto">
                {(() => {
                  const query = searchQuery.toLowerCase();
                  const results = [];
                  departments.forEach(d => {
                    d.boards?.forEach(b => {
                      b.employees?.forEach(e => {
                        e.tasks?.forEach(t => {
                          if (t.title.toLowerCase().includes(query) || 
                              t.description?.toLowerCase().includes(query) || 
                              t.tag?.toLowerCase().includes(query) ||
                              e.name.toLowerCase().includes(query)) {
                            results.push({ dept: d, board: b, emp: e, task: t });
                          }
                        });
                      });
                    });
                  });
                  if (results.length === 0) {
                    return <div className="p-4 text-center text-slate-400 text-sm">No tasks found.</div>;
                  }
                  return results.map((res, i) => (
                    <button 
                      key={i} 
                      onClick={() => {
                        setShowAnalytics(false);
                        setSelectedDeptId(res.dept.id);
                        setSelectedBoardId(res.board.id);
                        setSelectedTaskDetails({ empId: res.emp.id, taskId: res.task.id });
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/10 transition-colors flex flex-col gap-1"
                    >
                      <div className="text-white text-sm font-semibold truncate flex items-center gap-2">
                        {res.task.completed ? <CheckCircle2 size={14} className="text-green-400"/> : <Circle size={14} className="text-brand-400"/>}
                        {res.task.title}
                      </div>
                      <div className="text-xs text-slate-400 truncate flex items-center gap-1">
                        <Building2 size={10}/> {res.dept.name} <ChevronRight size={10}/> {res.board.name} <ChevronRight size={10}/> {res.emp.name}
                      </div>
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {notificationPermission === 'default' && (
              <button 
                onClick={requestNotificationPermission} 
                className="flex items-center gap-2 text-xs font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30 px-3 py-1.5 rounded-xl hover:bg-brand-500/30 transition-all shadow-[0_0_10px_rgba(37,99,235,0.15)] hover:shadow-[0_0_15px_rgba(37,99,235,0.3)] animate-pulse"
              >
                <Bell size={14} /> Enable Desktop Alerts
              </button>
            )}
            
            {notificationPermission === 'denied' && (
              <span 
                className="flex items-center gap-1.5 text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-xl cursor-help"
                title="Notifications blocked. Please enable them in your browser site settings to receive reminders in other tabs."
              >
                <AlertCircle size={12} /> Alerts Blocked
              </span>
            )}

            {notificationPermission === 'granted' && (
              <span 
                className="flex items-center gap-1.5 text-[11px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-xl cursor-default"
                title="Desktop alerts are active!"
              >
                <CheckCircle2 size={12} /> Alerts Active
              </span>
            )}

            {isAdmin && (
              <button 
                onClick={() => setShowAnalytics(!showAnalytics)} 
                className={`p-2.5 rounded-xl transition-all flex items-center gap-2 ${showAnalytics ? 'bg-brand-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                title="Analytics Dashboard"
              >
                <BarChart3 size={18} />
                <span className="text-xs font-semibold hidden md:inline">Analytics</span>
              </button>
            )}

            {/* User Manual & Guide Button */}
            <button
              onClick={() => setShowMemberManual(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-200 hover:text-white bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 transition-all cursor-pointer shadow-[0_0_10px_rgba(59,130,246,0.15)]"
              title="User Manual & What's New"
            >
              <span>📖</span>
              <span className="hidden sm:inline">Guide</span>
            </button>

            {/* Live Date & Time */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-medium text-slate-300">
              <span>📅 {formatDateLong(liveDateTime)}</span>
              <span className="text-white/20">|</span>
              <span>🕐 {liveDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
            </div>

            {/* User Profile Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl">
              <span className="text-xs font-semibold text-white">
                {currentUser?.name}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                isAdmin
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                  : 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
              }`}>
                {currentUser?.role || 'member'}
              </span>
            </div>

            {/* Logout Button */}
            <button 
              onClick={handleGlobalLogout} 
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors cursor-pointer" 
              title="Sign out"
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      {/* Sidebar + Content Layout */}
      <div className="flex min-h-[calc(100vh-73px)]">

        {/* Left Sidebar */}
        <aside className="w-16 md:w-56 flex-shrink-0 sticky top-[73px] h-[calc(100vh-73px)] bg-[#07091a]/80 backdrop-blur-xl border-r border-white/8 flex flex-col pt-4 z-30">
          <nav className="flex flex-col gap-1 px-2">
            {[
              { id: 'tasks', label: 'Tasks', icon: CheckSquare },
              { id: 'queries', label: 'Queries', icon: Database },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeTab === id
                    ? 'bg-brand-500/20 text-brand-300 shadow-[0_0_12px_rgba(37,99,235,0.2)] border border-brand-500/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
                }`}
                title={label}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="hidden md:inline truncate">{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Right: Breadcrumbs + Main Content */}
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Breadcrumbs Navigation — only shown on Tasks tab */}
          {activeTab === 'tasks' && (
            <div className="px-6 pt-6">
              <div className="flex items-center space-x-2 text-sm text-slate-400">
                <button
                  onClick={() => { setSelectedDeptId(null); setSelectedBoardId(null); }}
                  className={`hover:text-white transition-colors ${!selectedDeptId ? 'text-brand-400 font-semibold' : ''}`}
                >
                  Departments
                </button>

                {currentDept && (
                  <>
                    <ChevronRight size={14} className="text-slate-600" />
                    <button
                      onClick={() => setSelectedBoardId(null)}
                      className={`hover:text-white transition-colors flex items-center gap-1 ${selectedDeptId && !selectedBoardId ? 'text-brand-400 font-semibold' : ''}`}
                    >
                      <Building2 size={12} /> {currentDept.name}
                    </button>
                  </>
                )}

                {currentBoard && (
                  <>
                    <ChevronRight size={14} className="text-slate-600" />
                    <span className="text-brand-400 font-semibold flex items-center gap-1">
                      <Layout size={12} /> {currentBoard.name}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Main Content */}
          <main className={`flex-1 ${activeTab === 'queries' ? 'p-0 flex flex-col min-h-0 overflow-auto' : 'px-6 py-6'}`}>

          {/* Queries Page */}
          {activeTab === 'queries' && (
            <QueryManager 
              agents={allEmployees} 
              isAdmin={isAdmin} 
              currentUser={currentUser}
              onLogout={handleGlobalLogout}
            />
          )}

          {activeTab === 'tasks' && (showAnalytics && isAdmin ? (
            <AnalyticsDashboard departments={departments} archivedTasks={archivedTasks} />
          ) : (
            <>
            {/* LEVEL 1: DEPARTMENTS LIST */}
            {!selectedDeptId && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2"><Building2 className="text-brand-400"/> Select a Department</h2>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDepartmentDragEnd}>
              <SortableContext items={departments.map(d => d.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {departments.map(dept => (
                    <SortableDepartment
                      key={dept.id}
                      dept={dept}
                      isAdmin={isAdmin}
                      unlockedDepartments={unlockedDepartments}
                      setSelectedDeptId={setSelectedDeptId}
                      setDeptToUnlock={setDeptToUnlock}
                      setDeptUnlockPassword={setDeptUnlockPassword}
                      setDeptUnlockError={setDeptUnlockError}
                      setEditingDepartment={setEditingDepartment}
                      setShowAddDeptModal={setShowAddDeptModal}
                      setDepartmentToDelete={setDepartmentToDelete}
                      getDeptTaskStats={getDeptTaskStats}
                    />
                  ))}
                  {departments.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-white/10 rounded-2xl">
                      No departments found. Add one to get started.
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* LEVEL 2: BOARDS LIST */}
        {selectedDeptId && !selectedBoardId && currentDept && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Layout className="text-brand-400"/> Boards in {currentDept.name}</h2>
              <button onClick={() => setSelectedDeptId(null)} className="glass-button text-sm py-2 px-4 flex items-center gap-2"><ArrowLeft size={16}/> Back</button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBoardDragEnd}>
              <SortableContext items={currentDept.boards.map(b => b.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {currentDept.boards.map(board => (
                    <SortableBoard
                      key={board.id}
                      board={board}
                      isAdmin={isAdmin}
                      setSelectedBoardId={setSelectedBoardId}
                      setEditingBoard={setEditingBoard}
                      setShowAddBoardModal={setShowAddBoardModal}
                      setBoardToDelete={setBoardToDelete}
                      getBoardTaskStats={getBoardTaskStats}
                    />
                  ))}
                  {currentDept.boards.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-white/10 rounded-2xl">
                      No boards found in this department.
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* LEVEL 3: AGENTS KANBAN VIEW */}
        {selectedBoardId && currentBoard && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Users className="text-brand-400"/> Agents: {currentBoard.name}</h2>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 shadow-md">
                  <Filter size={14} className="text-slate-400" />
                  <select 
                    value={priorityFilter} 
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="bg-transparent text-sm text-slate-300 focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="All" className="bg-[#1a0a2e]">All Priorities</option>
                    <option value="High" className="bg-[#1a0a2e]">High</option>
                    <option value="Medium" className="bg-[#1a0a2e]">Medium</option>
                    <option value="Low" className="bg-[#1a0a2e]">Low</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 shadow-md">
                  <Calendar size={14} className="text-slate-400" />
                  <select 
                    value={dueDateFilter} 
                    onChange={(e) => setDueDateFilter(e.target.value)}
                    className="bg-transparent text-sm text-slate-300 focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="All" className="bg-[#1a0a2e]">Any Date</option>
                    <option value="Today" className="bg-[#1a0a2e]">Due Today</option>
                    <option value="Overdue" className="bg-[#1a0a2e]">Overdue</option>
                  </select>
                </div>
                <button 
                  onClick={() => setShowHistorySidebar(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300 hover:text-white transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <History size={16} className="text-slate-400" />
                  <span>History</span>
                  {completedTasks.length > 0 && (
                    <span className="bg-brand-500/20 text-brand-300 border border-brand-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {completedTasks.length}
                    </span>
                  )}
                </button>
                {isAdmin && (
                <button 
                  onClick={() => setShowArchivePage(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300 hover:text-white transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Building2 size={16} className="text-slate-400" />
                  <span>Archive & Reports</span>
                </button>
                )}
                <button onClick={() => setSelectedBoardId(null)} className="glass-button text-sm py-2 px-4 flex items-center gap-2"><ArrowLeft size={16}/> Back</button>
              </div>
            </div>
            
            <div className="relative group/board">
              {/* Left Scroll Paddle */}
              {canScrollLeft && (
                <button
                  onClick={() => {
                    boardContainerRef.current?.scrollBy({ left: -340, behavior: 'smooth' });
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-brand-400 hover:text-brand-300 border border-white/10 hover:border-brand-500/50 flex items-center justify-center backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all z-20 hover:scale-110 active:scale-95"
                  title="Scroll Left"
                  aria-label="Scroll left"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {/* Right Scroll Paddle */}
              {canScrollRight && (
                <button
                  onClick={() => {
                    boardContainerRef.current?.scrollBy({ left: 340, behavior: 'smooth' });
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-brand-400 hover:text-brand-300 border border-white/10 hover:border-brand-500/50 flex items-center justify-center backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all z-20 hover:scale-110 active:scale-95"
                  title="Scroll Right"
                  aria-label="Scroll right"
                >
                  <ChevronRight size={24} />
                </button>
              )}

              <div 
                ref={boardContainerRef}
                className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide items-stretch min-h-[500px]"
              >
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
                  <SortableContext items={currentBoard.employees.map(e => e.id)} strategy={horizontalListSortingStrategy}>
                    {currentBoard.employees.map(emp => (
                      <SortableEmployeeCard
                        key={emp.id}
                        employee={emp}
                        isAdmin={isAdmin}
                        onDelete={(emp) => setEmployeeToDelete(emp)}
                        onEdit={(emp) => { setEditingEmployee(emp); setShowAddEmpModal(true); }}
                        updateTask={updateTask}
                        deleteTask={(empId, taskOrId) => {
                          if (typeof taskOrId === 'object' && taskOrId !== null) {
                            setTaskToDelete({ empId, taskId: taskOrId.id, title: taskOrId.title });
                          } else {
                            const foundTask = emp.tasks?.find(t => t.id === taskOrId);
                            setTaskToDelete({ empId, taskId: taskOrId, title: foundTask?.title || 'this task' });
                          }
                        }}
                        addTask={addTask}
                        onTaskClick={(empId, taskId) => setSelectedTaskDetails({ empId, taskId })}
                        priorityFilter={priorityFilter}
                        dueDateFilter={dueDateFilter}
                        archivedTasks={archivedTasks}
                        timerTick={timerTick}
                      />
                    ))}
                  </SortableContext>
                  {currentBoard.employees.length === 0 && (
                    <div className="w-[320px] flex-shrink-0 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center text-slate-500 p-6 text-center">
                      No agents on this board. Add one to get started.
                    </div>
                  )}
                  <DragOverlay dropAnimation={defaultDropAnimationSideEffects({ duration: 250 })}>
                    {activeDragItem?.type === 'Task' && (
                      <SortableTaskItem task={activeDragItem.task} employeeId={activeDragItem.employeeId} updateTask={()=>{}} deleteTask={()=>{}} onTaskClick={()=>{}} timerTick={timerTick} />
                    )}
                    {activeDragItem?.type === 'Employee' && (
                      <SortableEmployeeCard 
                        employee={activeDragItem.employee} 
                        isAdmin={isAdmin} 
                        onDelete={()=>{}} 
                        onEdit={()=>{}} 
                        updateTask={()=>{}} 
                        deleteTask={()=>{}} 
                        addTask={()=>{}} 
                        onTaskClick={()=>{}}
                        priorityFilter={priorityFilter}
                        dueDateFilter={dueDateFilter}
                        archivedTasks={archivedTasks}
                        timerTick={timerTick}
                      />
                    )}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          </div>
        )}
        </>
        ))}

      </main>
        </div> {/* end right column */}
      </div> {/* end sidebar layout */}

      {/* Contextual Floating Action Button — Tasks tab only */}
      {activeTab === 'tasks' && (
        <button
          onClick={() => {
            if (!selectedDeptId) {
              setEditingDepartment(null); setShowAddDeptModal(true);
            } else if (selectedDeptId && !selectedBoardId) {
              setEditingBoard(null); setShowAddBoardModal(true);
            } else if (selectedBoardId) {
              setEditingEmployee(null); setShowAddEmpModal(true);
            }
          }}
          className="fixed bottom-8 right-8 w-14 h-14 bg-brand-600 hover:bg-brand-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(124,58,237,0.6)] hover:shadow-[0_0_30px_rgba(124,58,237,0.8)] transition-all z-30 hover:scale-110"
          title={!selectedDeptId ? "Add Department" : !selectedBoardId ? "Add Board" : "Add Agent"}
        >
          <Plus size={28} />
        </button>
      )}

      {/* --- MODALS --- */}
      
      {/* Admin Login Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-sm p-6 relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setShowAdminModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2"><Lock size={20} className="text-brand-400"/> Admin Access</h2>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Enter admin password" className="glass-input w-full text-center" autoFocus />
              <button type="submit" className="glass-button w-full">Unlock</button>
            </form>
          </div>
        </div>
      )}

      {/* Department Login Modal */}
      {deptToUnlock && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-sm p-6 relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setDeptToUnlock(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2"><Lock size={20} className="text-brand-400"/> Department Access</h2>
            <p className="text-slate-400 text-sm mb-4">Enter the password to access {deptToUnlock.name}.</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const { data: isValid, error } = await supabase.rpc('verify_department_password', {
                dept_id: deptToUnlock.id,
                input_password: deptUnlockPassword
              });
              if (!error && isValid) {
                setUnlockedDepartments([...unlockedDepartments, deptToUnlock.id]);
                setSelectedDeptId(deptToUnlock.id);
                setDeptToUnlock(null);
              } else {
                setDeptUnlockError(true);
              }
            }} className="space-y-4">
              <input type="password" value={deptUnlockPassword} onChange={(e) => { setDeptUnlockPassword(e.target.value); setDeptUnlockError(false); }} placeholder="Password" className={`glass-input w-full text-center tracking-widest ${deptUnlockError ? 'border-red-500 focus:ring-red-500' : ''}`} autoFocus />
              {deptUnlockError && <p className="text-red-400 text-xs text-center">Incorrect password.</p>}
              <button type="submit" className="glass-button w-full">Unlock</button>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Department Modal */}
      {showAddDeptModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setShowAddDeptModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2"><Building2 className="text-brand-400"/> {editingDepartment ? 'Edit Department' : 'Add Department'}</h2>
            <form onSubmit={handleAddDept} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Department Name</label>
                <input name="name" defaultValue={editingDepartment?.name} required className="glass-input w-full" placeholder="e.g. Engineering" autoFocus />
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Access Password (Optional)</label>
                  <input
                    type="password"
                    name="password"
                    className="glass-input w-full"
                    placeholder={
                      editingDepartment?.has_password 
                        ? "•••••••• (leave blank to keep existing)" 
                        : "Leave empty for public access"
                    }
                  />
                  {editingDepartment?.has_password && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        name="remove_password"
                        id="remove_password"
                        className="rounded border-slate-700 bg-slate-800 text-brand-500 focus:ring-brand-500 cursor-pointer"
                      />
                      <label htmlFor="remove_password" className="text-xs text-slate-400 cursor-pointer select-none">
                        Remove password protection (make department public)
                      </label>
                    </div>
                  )}
                </div>
              )}
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setShowAddDeptModal(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors">Cancel</button>
                <button type="submit" className="glass-button">{editingDepartment ? 'Save Changes' : 'Create Department'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Department Modal */}
      {departmentToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200 border border-red-500/30">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2"><Trash2 className="text-red-400" size={24}/> Delete Department</h2>
            <p className="text-slate-300 mb-6">Are you sure you want to delete <strong className="text-white">{departmentToDelete.name}</strong>? All boards and agents will be lost.</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setDepartmentToDelete(null)} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5">Cancel</button>
              <button onClick={async () => {
                const id = departmentToDelete.id;
                setDepartmentToDelete(null);
                // Optimistic delete
                setDepartments(prev => prev.filter(d => d.id !== id));
                if (selectedDeptId === id) setSelectedDeptId(null);
                
                try {
                  await supabase.from('departments').delete().eq('id', id);
                } catch (err) {
                  console.error(err);
                }
              }} className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Board Modal */}
      {showAddBoardModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setShowAddBoardModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2"><Layout className="text-brand-400"/> {editingBoard ? 'Edit Board' : 'Add Board'}</h2>
            <form onSubmit={handleAddBoard} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Board Name</label>
                <input name="name" defaultValue={editingBoard?.name} required className="glass-input w-full" placeholder="e.g. Q3 Sprint" autoFocus />
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setShowAddBoardModal(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors">Cancel</button>
                <button type="submit" className="glass-button">{editingBoard ? 'Save Changes' : 'Create Board'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Board Modal */}
      {boardToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200 border border-red-500/30">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2"><Trash2 className="text-red-400" size={24}/> Delete Board</h2>
            <p className="text-slate-300 mb-6">Are you sure you want to delete <strong className="text-white">{boardToDelete.name}</strong>? All agents and tasks inside will be lost.</p>
            <div className="flex justify-end space-x-3">
              <button 
                type="button" 
                onClick={() => setBoardToDelete(null)} 
                className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                No, Cancel
              </button>
              <button 
                type="button"
                onClick={async () => {
                  const id = boardToDelete.id;
                  setBoardToDelete(null);
                  // Optimistic delete
                  setDepartments(prev => prev.map(d => ({
                    ...d,
                    boards: d.boards.filter(b => b.id !== id)
                  })));
                  if (selectedBoardId === id) setSelectedBoardId(null);

                  try {
                    await supabase.from('boards').delete().eq('id', id);
                  } catch (err) {
                    console.error(err);
                  }
                }} 
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 font-medium transition-all cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Agent / Employee Modal */}
      {employeeToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200 border border-red-500/30">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <Trash2 className="text-red-400" size={24}/> Delete Agent
            </h2>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete <strong className="text-white">{employeeToDelete.name}</strong>? All tasks assigned to this agent will also be permanently deleted.
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                type="button"
                onClick={() => setEmployeeToDelete(null)} 
                className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                No, Cancel
              </button>
              <button 
                type="button"
                onClick={async () => {
                  const emp = employeeToDelete;
                  setEmployeeToDelete(null);
                  await deleteEmployee(emp.id);
                }} 
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 font-medium transition-all cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Task Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200 border border-red-500/30">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <Trash2 className="text-red-400" size={24}/> Delete Task
            </h2>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete <strong className="text-white">{taskToDelete.title || 'this task'}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                type="button"
                onClick={() => setTaskToDelete(null)} 
                className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                No, Cancel
              </button>
              <button 
                type="button"
                onClick={async () => {
                  const { empId, taskId } = taskToDelete;
                  setTaskToDelete(null);
                  if (activeTaskDetails?.task?.id === taskId || selectedTaskDetails?.taskId === taskId) {
                    setSelectedTaskDetails(null);
                  }
                  await deleteTask(empId, taskId);
                }} 
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 font-medium transition-all cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Agent Modal */}
      {showAddEmpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setShowAddEmpModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2"><Users className="text-brand-400"/> {editingEmployee ? 'Edit Agent' : 'Add Agent'}</h2>
            <form onSubmit={handleAddOrEditEmployee} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                <input name="name" required defaultValue={editingEmployee?.name} className="glass-input w-full" placeholder="e.g. John Doe" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role / Specialization</label>
                <input name="role" required defaultValue={editingEmployee?.role} className="glass-input w-full" placeholder="e.g. Frontend Dev" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Avatar Color</label>
                <div className="flex space-x-3">
                  {avatarColors.map(c => (
                    <label key={c} className="cursor-pointer relative">
                      <input type="radio" name="color" value={c} defaultChecked={editingEmployee ? editingEmployee.color === c : c === avatarColors[0]} className="peer sr-only" />
                      <div className={`w-8 h-8 rounded-full ${c} peer-checked:ring-2 peer-checked:ring-white peer-checked:ring-offset-2 peer-checked:ring-offset-[#1a0a2e] transition-all`}></div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setShowAddEmpModal(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors">Cancel</button>
                <button type="submit" className="glass-button">{editingEmployee ? 'Save Changes' : 'Create Agent'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Details Modal */}
      {/* Task Details Modal */}
      {activeTaskDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTaskDetails(null)} />
          <div className="glass-card relative w-full max-w-2xl bg-[#07102e]/95 backdrop-blur-xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col animate-in fade-in zoom-in duration-200 max-h-[90vh]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5 rounded-t-2xl">
              <h2 className="text-xl font-bold text-white">Task Details</h2>
              <button onClick={() => setSelectedTaskDetails(null)} className="text-slate-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="relative">
                 <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Assigned To</label>
                 <button
                   type="button"
                   onClick={() => setShowAssigneePopover(!showAssigneePopover)}
                   className="w-full flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10 hover:bg-white/10 transition-all text-left cursor-pointer"
                 >
                   <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full ${localEmp ? localEmp.color : 'bg-slate-500'} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                        {localEmp ? getInitials(localEmp.name) : ''}
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">{localEmp ? localEmp.name : 'Unassigned'}</p>
                        <p className="text-xs text-slate-400">{localBoard ? localBoard.name : ''} ({localDept ? localDept.name : ''})</p>
                      </div>
                   </div>
                   <ChevronRight size={16} className={`text-slate-400 transition-transform ${showAssigneePopover ? 'rotate-95' : ''}`} />
                 </button>

                 {showAssigneePopover && (
                   <div className="absolute left-0 right-0 mt-2 z-20 bg-[#0a1438]/98 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-xl p-3 w-full animate-in fade-in duration-200">
                     <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Assign to Employee</div>
                     
                     {/* Search Box */}
                     <div className="relative mb-2">
                       <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                       <input
                         type="text"
                         placeholder="Search Employees..."
                         value={assigneeSearchQuery}
                         onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                         className="glass-input text-xs w-full pr-7 py-1.5 font-sans"
                         style={{ paddingLeft: '2.25rem' }}
                         autoFocus
                       />
                       {assigneeSearchQuery && (
                         <button
                           onClick={() => setAssigneeSearchQuery('')}
                           className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                         >
                           <X size={13} />
                         </button>
                       )}
                     </div>

                     {/* Employees List */}
                     <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                       {allEmployees
                         .filter(emp => emp.name.toLowerCase().includes(assigneeSearchQuery.toLowerCase()))
                         .map(emp => {
                           const isSelected = emp.id === localAssigneeId;
                           return (
                             <button
                               key={emp.id}
                               type="button"
                               onClick={() => {
                                 setLocalAssigneeId(emp.id);
                                 setLocalEmp(emp);
                                 setLocalBoard({ name: emp.boardName });
                                 setLocalDept({ name: emp.deptName });
                                 setShowAssigneePopover(false);
                                 setAssigneeSearchQuery('');
                               }}
                               className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-all cursor-pointer ${
                                 isSelected ? 'bg-white/10 text-white font-semibold' : 'hover:bg-white/5 text-slate-300'
                               }`}
                             >
                               <div className="flex items-center gap-3">
                                 <div className={`w-6 h-6 rounded-full ${emp.color} flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>
                                   {getInitials(emp.name)}
                                 </div>
                                 <div>
                                   <span className="text-xs block font-medium text-white">{emp.name}</span>
                                   <span className="text-[10px] text-slate-400 block">{emp.boardName} ({emp.deptName})</span>
                                 </div>
                               </div>
                               {isSelected && (
                                 <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                               )}
                             </button>
                           );
                         })}
                       {allEmployees.filter(emp => emp.name.toLowerCase().includes(assigneeSearchQuery.toLowerCase())).length === 0 && (
                         <div className="text-slate-500 text-xs text-center py-3">No employees match your search</div>
                       )}
                     </div>
                   </div>
                 )}
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Task Title</label>
                <textarea 
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  className="glass-input w-full min-h-[120px] resize-none text-base font-sans"
                />
              </div>

              {/* Required Time to Complete (Prominently Placed at Top) */}
              <div className="relative">
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-medium">
                  <Clock size={13} className="text-brand-400" /> Required Time to Complete
                </label>
                <button
                  type="button"
                  onClick={() => setShowRequiredTimePopover(!showRequiredTimePopover)}
                  className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white hover:bg-white/10 transition-all text-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-slate-400" />
                    {localRequiredTime ? (
                      <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
                        <span>⏱️ {localRequiredTime}</span>
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocalRequiredTime('');
                          }}
                          className="hover:bg-cyan-400/30 p-0.5 rounded text-cyan-200 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                          title="Remove required time"
                        >
                          <X size={12} />
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">Set required time (e.g. 10 min, 20 min, 2 hours)...</span>
                    )}
                  </div>
                  <ChevronRight size={16} className={`text-slate-400 transition-transform ${showRequiredTimePopover ? 'rotate-90' : ''}`} />
                </button>

                {showRequiredTimePopover && (
                  <div className="absolute left-0 right-0 mt-2 z-30 bg-[#0a1438]/98 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-xl p-4 w-full animate-in fade-in duration-200">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Quick Presets</div>
                    
                    {/* Presets Grid */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {['10 min', '20 min', '30 min', '45 min', '1 hour', '2 hours', '1 day', '2 days'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setLocalRequiredTime(preset);
                            setShowRequiredTimePopover(false);
                          }}
                          className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                            localRequiredTime === preset
                              ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                              : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Custom Time Builder</div>
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="number"
                        min="1"
                        placeholder=""
                        value={customTimeVal}
                        onChange={(e) => setCustomTimeVal(e.target.value)}
                        className="glass-input text-xs w-24 py-1.5 px-3 font-sans"
                      />
                      <select
                        value={customTimeUnit}
                        onChange={(e) => setCustomTimeUnit(e.target.value)}
                        className="glass-input text-xs py-1.5 px-3 font-sans bg-[#0a1438] text-white cursor-pointer rounded-lg border border-white/15 focus:outline-none focus:ring-1 focus:ring-brand-400"
                      >
                        <option value="min" className="bg-[#0a1438] text-white py-1">Minutes (min)</option>
                        <option value="hours" className="bg-[#0a1438] text-white py-1">Hours (hr)</option>
                        <option value="days" className="bg-[#0a1438] text-white py-1">Days</option>
                        <option value="weeks" className="bg-[#0a1438] text-white py-1">Weeks</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (customTimeVal.trim()) {
                            const val = customTimeVal.trim();
                            const unitStr = customTimeUnit === 'min' ? 'min' : customTimeUnit === 'hours' ? (val === '1' ? 'hour' : 'hours') : customTimeUnit === 'days' ? (val === '1' ? 'day' : 'days') : (val === '1' ? 'week' : 'weeks');
                            setLocalRequiredTime(`${val} ${unitStr}`);
                            setShowRequiredTimePopover(false);
                            setCustomTimeVal('');
                          }
                        }}
                        className="bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        Set Time
                      </button>
                    </div>

                    {localRequiredTime && (
                      <button
                        type="button"
                        onClick={() => {
                          setLocalRequiredTime('');
                          setShowRequiredTimePopover(false);
                        }}
                        className="w-full text-center text-xs text-red-400 hover:text-red-300 py-1 transition-colors border-t border-white/10 pt-2"
                      >
                        Remove Required Time
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Task Description (Optional)</label>
                {isEditingDescription ? (
                  <textarea 
                    value={localDescription}
                    onChange={(e) => setLocalDescription(e.target.value)}
                    onBlur={() => setIsEditingDescription(false)}
                    className="glass-input w-full min-h-[100px] resize-none text-sm font-sans"
                    placeholder="Add more details about this task..."
                    autoFocus
                  />
                ) : (
                  <div 
                    onClick={() => setIsEditingDescription(true)}
                    className="glass-input w-full min-h-[100px] text-sm cursor-pointer whitespace-pre-wrap hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10 font-sans"
                  >
                    {renderDescriptionWithLinks(localDescription) || (
                      <span className="text-slate-500 italic">Add more details about this task...</span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Screenshot (Optional) */}
              <div className="space-y-2">
                <label className="text-xs text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
                  <Image size={12} className="text-brand-400" /> Screenshot (Optional)
                </label>
                {localScreenshotUrl ? (
                  <div className="relative group rounded-xl overflow-hidden border border-white/10 max-h-60 flex items-center justify-center bg-white/5 p-2">
                    <img 
                      src={localScreenshotUrl} 
                      alt="Task Screenshot" 
                      className="max-w-full max-h-56 object-contain rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        type="button" 
                        onClick={() => setLocalScreenshotUrl('')}
                        className="bg-red-600 hover:bg-red-500 text-white font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                      >
                        <Trash2 size={14} /> Remove Screenshot
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Upload Dropzone */}
                    <label className="border border-dashed border-white/20 hover:border-brand-500/50 hover:bg-brand-500/5 transition-all rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer text-center group min-h-[120px]">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setLocalScreenshotUrl(reader.result);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <UploadCloud size={24} className="text-slate-400 group-hover:text-brand-400 transition-colors mb-2" />
                      <span className="text-xs text-slate-200 font-medium">Upload Local Image</span>
                      <span className="text-[10px] text-slate-500 mt-1">PNG, JPG, GIF up to 5MB</span>
                    </label>

                    {/* Paste URL */}
                    <div className="border border-white/10 rounded-xl p-5 bg-white/5 flex flex-col justify-center gap-3 min-h-[120px]">
                      <span className="text-xs text-slate-200 font-medium flex items-center gap-1.5">
                        <Link size={12} className="text-slate-400" /> Paste Image URL
                      </span>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="https://example.com/image.png" 
                          id="temp-screenshot-url-input"
                          className="glass-input text-xs flex-1 py-1.5 pr-2 pl-3"
                        />
                        <button 
                          type="button" 
                          onClick={() => {
                            const val = document.getElementById('temp-screenshot-url-input')?.value;
                            if (val) {
                              setLocalScreenshotUrl(val);
                            }
                          }}
                          className="bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs px-3 rounded-lg transition-colors cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white/5 p-4 rounded-lg border border-white/10 space-y-3">
                 <div className="flex items-center justify-between">
                   <span className="text-sm text-slate-300 font-medium">Status</span>
                   <button 
                    type="button"
                    onClick={() => setLocalStatus(!localStatus)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${localStatus ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-slate-700 text-slate-300'}`}
                   >
                     {localStatus ? <CheckCircle2 size={16}/> : <Circle size={16}/>}
                     {localStatus ? 'Completed' : 'Incomplete'}
                   </button>
                 </div>
                 {localStatus && (
                   <div className="pt-3 border-t border-white/5 space-y-1.5">
                     <label className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                       <CheckCircle2 size={12} className="text-green-400" /> Completion Date &amp; Time
                       <span className="ml-1 text-slate-500 font-normal">(editable — used in all reports)</span>
                     </label>
                     <input
                       type="datetime-local"
                       className="glass-input w-full text-sm text-emerald-300 font-medium"
                       value={localCustomCompletedAt}
                       onChange={(e) => setLocalCustomCompletedAt(e.target.value)}
                       style={{ colorScheme: 'dark' }}
                     />
                   </div>
                 )}
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Priority</label>
                <div className="flex gap-2">
                  {['Low', 'Medium', 'High'].map(p => (
                    <button
                      key={p}
                      onClick={() => setLocalPriority(p)}
                      className={`flex-1 py-2 rounded-lg text-sm transition-all border ${
                        localPriority === p 
                        ? (p === 'High' ? 'bg-red-500/20 text-red-400 border-red-500/50' : p === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' : 'bg-green-500/20 text-green-400 border-green-500/50')
                        : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Tag As</label>
                <button
                  type="button"
                  onClick={() => setShowTagPopover(!showTagPopover)}
                  className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white hover:bg-white/10 transition-all text-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Tag size={16} className="text-slate-400" />
                    {localTag && localTag !== 'Undefined' ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        localTag === 'Under 5 min' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                        localTag === 'Under 15 min' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        localTag === 'Under 30 min' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        localTag === 'Under 45 min' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                        'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                      }`}>
                        {localTag}
                      </span>
                    ) : (
                      <span className="text-slate-400">Undefined</span>
                    )}
                  </div>
                  <ChevronRight size={16} className={`text-slate-400 transition-transform ${showTagPopover ? 'rotate-90' : ''}`} />
                </button>

                {showTagPopover && (
                  <div className="absolute left-0 right-0 mt-2 z-20 bg-[#160b2d]/98 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-xl p-3 w-64 animate-in fade-in duration-200">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tag as</div>
                    
                    {/* Search Tags box */}
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search Tags..."
                        value={tagSearchQuery}
                        onChange={(e) => setTagSearchQuery(e.target.value)}
                        className="glass-input text-xs w-full pr-7 py-1.5 font-sans"
                        style={{ paddingLeft: '2.25rem' }}
                        autoFocus
                      />
                      {tagSearchQuery && (
                        <button
                          onClick={() => setTagSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    {/* Tags List */}
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                      {[
                        { name: 'Under 5 min', colorClass: 'bg-cyan-500' },
                        { name: 'Under 15 min', colorClass: 'bg-emerald-500' },
                        { name: 'Under 30 min', colorClass: 'bg-amber-500' },
                        { name: 'Under 45 min', colorClass: 'bg-rose-500' },
                        { name: 'Undefined', colorClass: 'bg-slate-500' }
                      ]
                        .filter(t => t.name.toLowerCase().includes(tagSearchQuery.toLowerCase()))
                        .map(t => {
                          const isSelected = localTag === t.name || (t.name === 'Undefined' && (!localTag || localTag === 'Undefined'));
                          return (
                            <button
                              key={t.name}
                              type="button"
                              onClick={() => {
                                setLocalTag(t.name);
                                setShowTagPopover(false);
                                setTagSearchQuery('');
                              }}
                              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-left transition-all cursor-pointer ${
                                isSelected ? 'bg-white/10 text-white font-semibold' : 'hover:bg-white/5 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-3.5 h-3.5 rounded ${t.colorClass} shadow-md flex-shrink-0`} />
                                <span>{t.name}</span>
                              </div>
                              {isSelected && (
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                              )}
                            </button>
                          );
                        })}
                      {[
                        { name: 'Under 5 min' },
                        { name: 'Under 15 min' },
                        { name: 'Under 30 min' },
                        { name: 'Under 45 min' },
                        { name: 'Undefined' }
                      ].filter(t => t.name.toLowerCase().includes(tagSearchQuery.toLowerCase())).length === 0 && (
                        <div className="text-slate-500 text-xs text-center py-3">No tags match your search</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Calendar size={12}/> Due Date</label>
                  <input 
                    type="date" 
                    className="glass-input w-full text-sm" 
                    value={localDueDate} 
                    onChange={(e) => {
                      setLocalDueDate(e.target.value);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Bell size={12}/> Reminder</label>
                  <input 
                    type="time" 
                    className="glass-input w-full text-sm" 
                    value={localReminderTime} 
                    onChange={(e) => {
                      setLocalReminderTime(e.target.value);
                      if ('Notification' in window && Notification.permission === 'default') {
                        Notification.requestPermission().then(permission => {
                          setNotificationPermission(permission);
                        }).catch(err => {
                          console.warn('Desktop notifications permission request failed', err);
                        });
                      }
                    }}
                  />
                </div>
              </div>
            </div>
            
            {/* Modal Actions Footer */}
            <div className="p-5 border-t border-white/10 flex items-center justify-between bg-white/5 rounded-b-2xl">
              <button
                type="button"
                onClick={() => {
                  setTaskToDelete({
                    empId: activeTaskDetails.emp.id,
                    taskId: activeTaskDetails.task.id,
                    title: activeTaskDetails.task.title
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 text-xs font-semibold transition-colors cursor-pointer"
                title="Delete this task"
              >
                <Trash2 size={14} />
                <span>Delete Task</span>
              </button>
              <div className="flex items-center space-x-3">
                <button 
                  type="button" 
                  onClick={() => setSelectedTaskDetails(null)} 
                  className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors font-medium text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={async () => {
                    const updates = {
                      title: localTitle,
                      description: localDescription,
                      completed: localStatus,
                      priority: localPriority,
                      tag: localTag,
                      requiredTime: localRequiredTime,
                      dueDate: localDueDate,
                      reminderTime: localReminderTime,
                      screenshotUrl: localScreenshotUrl
                    };
                    if (localAssigneeId !== activeTaskDetails.emp.id) {
                      updates.agent_id = localAssigneeId;
                    }
                    // If user has set/edited a custom completion date and task is completed, save it
                    if (localStatus && localCustomCompletedAt) {
                      updates.customCompletedAt = new Date(localCustomCompletedAt).toISOString();
                    }
                    await updateTask(activeTaskDetails.emp.id, activeTaskDetails.task.id, updates);
                    setSelectedTaskDetails(null);
                  }} 
                  className="glass-button text-sm px-5 py-2 font-semibold bg-brand-600 hover:bg-brand-500 rounded-lg text-white transition-all shadow-[0_0_15px_rgba(124,58,237,0.4)] cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification Popups */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {notifications.map(notif => (
          <div 
            key={notif.id}
            className="pointer-events-auto glass-card border border-brand-500/40 p-4 rounded-xl shadow-[0_10px_30px_rgba(124,58,237,0.25)] flex items-start gap-3 animate-in slide-in-from-bottom-6 fade-in duration-300 relative overflow-hidden bg-slate-950/80 backdrop-blur-xl"
          >
            {/* Pulsing indicator light */}
            <div className="absolute top-0 left-0 w-[4px] h-full bg-brand-500 shadow-[0_0_8px_#8b5cf6]" />
            
            {/* Bell icon container with a gorgeous pulse */}
            <div className="flex-shrink-0 bg-brand-500/20 p-2 rounded-lg text-brand-400 animate-pulse mt-0.5 border border-brand-500/30">
              <Bell size={18} />
            </div>

            {/* Notification details */}
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-brand-400 tracking-wider uppercase">Reminder</span>
                <span className="text-[10px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">{notif.time}</span>
              </div>
              <h4 className="text-sm font-bold text-white truncate mb-1">{notif.taskTitle}</h4>
              <p className="text-xs text-slate-300 flex items-center gap-1">
                <Users size={12} className="text-slate-400" />
                <span>Assigned to: <strong className="text-brand-300">{notif.employeeName}</strong></span>
              </p>
            </div>

            {/* Close button */}
            <button 
              onClick={() => dismissNotification(notif.id)}
              className="text-slate-400 hover:text-white hover:bg-white/5 p-1 rounded-md transition-colors flex-shrink-0"
              aria-label="Dismiss reminder"
            >
              <X size={14} />
            </button>

            {/* Draining visual progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
              <div 
                className="h-full bg-gradient-to-r from-brand-500 to-accent-400 transition-all duration-[8000ms] ease-linear"
                style={{ width: '0%', animation: 'shrinkBar 8s linear forwards' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Task Archive & Reports Page */}
      {showArchivePage && isAdmin && (
        <div className="fixed inset-0 z-[60] bg-[#03071b] flex flex-col animate-in fade-in zoom-in-95 duration-200">
          {/* Top Bar Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#07102e]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
                <Building2 size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white leading-tight">Archive & Reports</h2>
                <p className="text-xs text-slate-400">Search, filter, and analyze past completed tasks</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3.5 py-1.5 bg-brand-500/15 text-brand-300 rounded-lg border border-brand-500/25 text-xs font-semibold flex items-center gap-1.5">
                <span>Total Archived:</span>
                <span className="text-white font-bold">{archivedTasks.length}</span>
              </div>
              <button 
                onClick={() => setShowArchivePage(false)} 
                className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
                title="Close Archive"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#03071b] custom-scrollbar">
            <div className="max-w-6xl mx-auto space-y-5">
              
              {/* Search, Sort, & Filter Controls Card */}
              <div className="bg-[#07102e] border border-white/10 p-4 rounded-xl shadow-lg space-y-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                  
                  {/* Search Box */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                    <input
                      type="text"
                      value={archiveSearchQuery}
                      onChange={(e) => {
                        setArchiveSearchQuery(e.target.value);
                        setArchiveCurrentPage(1);
                      }}
                      placeholder="Search tasks by name, agent, priority, or date..."
                      className="glass-input w-full pr-9 py-2 text-sm text-white placeholder-slate-400 focus:border-brand-500/60"
                      style={{ paddingLeft: '2.6rem' }}
                      spellCheck={false}
                    />
                    {archiveSearchQuery && (
                      <button
                        onClick={() => {
                          setArchiveSearchQuery('');
                          setArchiveCurrentPage(1);
                        }}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        title="Clear Search"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {/* Quick Sort Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 whitespace-nowrap flex items-center gap-1 font-medium">
                      <ArrowUpDown size={13} className="text-brand-400" /> Sort by:
                    </span>
                    <select
                      value={`${archiveSortField}-${archiveSortOrder}`}
                      onChange={(e) => {
                        const [field, order] = e.target.value.split('-');
                        setArchiveSortField(field);
                        setArchiveSortOrder(order);
                        setArchiveCurrentPage(1);
                      }}
                      className="bg-white/5 border border-white/10 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-brand-500/50 cursor-pointer"
                    >
                      <option value="completed_date-desc" className="bg-[#07102e]">Completed Date (Newest first)</option>
                      <option value="completed_date-asc" className="bg-[#07102e]">Completed Date (Oldest first)</option>
                      <option value="created_at-desc" className="bg-[#07102e]">Created Date (Newest first)</option>
                      <option value="created_at-asc" className="bg-[#07102e]">Created Date (Oldest first)</option>
                      <option value="title-asc" className="bg-[#07102e]">Task Name (A → Z)</option>
                      <option value="title-desc" className="bg-[#07102e]">Task Name (Z → A)</option>
                      <option value="agent-asc" className="bg-[#07102e]">Agent Name (A → Z)</option>
                    </select>
                  </div>
                </div>

                {/* Second Row: Filters & Reset */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400 flex items-center gap-1 font-medium mr-1">
                      <Filter size={12} className="text-brand-400" /> Filters:
                    </span>

                    {/* Priority Filter */}
                    <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-0.5">
                      {['ALL', 'High', 'Medium', 'Low'].map(p => (
                        <button
                          key={p}
                          onClick={() => {
                            setArchivePriorityFilter(p);
                            setArchiveCurrentPage(1);
                          }}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                            archivePriorityFilter === p
                              ? 'bg-brand-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {p === 'ALL' ? 'All Priority' : p}
                        </button>
                      ))}
                    </div>

                    {/* Agent Filter */}
                    <select
                      value={archiveAgentFilter}
                      onChange={(e) => {
                        setArchiveAgentFilter(e.target.value);
                        setArchiveCurrentPage(1);
                      }}
                      className="bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg px-2.5 py-1 outline-none focus:border-brand-500/50 cursor-pointer"
                    >
                      <option value="ALL" className="bg-[#07102e]">All Agents</option>
                      {allEmployees.map(emp => (
                        <option key={emp.id} value={emp.id} className="bg-[#07102e]">{emp.name}</option>
                      ))}
                    </select>

                    {/* Reset Button */}
                    {(archiveSearchQuery || archivePriorityFilter !== 'ALL' || archiveAgentFilter !== 'ALL' || archiveSortField !== 'completed_date' || archiveSortOrder !== 'desc') && (
                      <button
                        onClick={() => {
                          setArchiveSearchQuery('');
                          setArchivePriorityFilter('ALL');
                          setArchiveAgentFilter('ALL');
                          setArchiveSortField('completed_date');
                          setArchiveSortOrder('desc');
                          setArchiveCurrentPage(1);
                        }}
                        className="text-brand-400 hover:text-brand-300 text-xs font-semibold px-2 py-1 rounded hover:bg-brand-500/10 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw size={11} /> Reset All
                      </button>
                    )}
                  </div>

                  {/* Results Count & Page Size */}
                  <div className="flex items-center gap-3 text-slate-400">
                    <span>
                      Found <strong className="text-white">{filteredAndSortedArchivedTasks.length}</strong> matching tasks
                    </span>
                    <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
                      <span>Per page:</span>
                      <select
                        value={archivePageSize}
                        onChange={(e) => {
                          setArchivePageSize(Number(e.target.value));
                          setArchiveCurrentPage(1);
                        }}
                        className="bg-white/5 border border-white/10 text-slate-200 text-xs rounded px-2 py-0.5 outline-none cursor-pointer"
                      >
                        <option value={25} className="bg-[#07102e]">25</option>
                        <option value={50} className="bg-[#07102e]">50</option>
                        <option value={100} className="bg-[#07102e]">100</option>
                        <option value={500} className="bg-[#07102e]">500</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tasks Table */}
              {filteredAndSortedArchivedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 border border-dashed border-white/10 rounded-2xl bg-[#07102e]/50">
                  <History size={44} className="mb-3 text-slate-500 opacity-60" />
                  <h3 className="text-base font-semibold text-white mb-1">No matching archived tasks</h3>
                  <p className="text-xs text-slate-400 max-w-sm text-center">
                    {archiveSearchQuery || archivePriorityFilter !== 'ALL' || archiveAgentFilter !== 'ALL'
                      ? 'Try adjusting your search keywords or resetting filters.'
                      : 'No past completed tasks are currently archived.'}
                  </p>
                  {(archiveSearchQuery || archivePriorityFilter !== 'ALL' || archiveAgentFilter !== 'ALL') && (
                    <button
                      onClick={() => {
                        setArchiveSearchQuery('');
                        setArchivePriorityFilter('ALL');
                        setArchiveAgentFilter('ALL');
                        setArchiveCurrentPage(1);
                      }}
                      className="mt-4 px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      Clear Filters &amp; Search
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-[#07102e] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white/5 border-b border-white/10 text-slate-400 select-none">
                        <tr>
                          {/* Column: Task Name */}
                          <th 
                            onClick={() => {
                              if (archiveSortField === 'title') {
                                setArchiveSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                              } else {
                                setArchiveSortField('title');
                                setArchiveSortOrder('asc');
                              }
                            }}
                            className="px-6 py-3.5 font-semibold text-xs tracking-wider uppercase cursor-pointer hover:text-white transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Task Name</span>
                              {archiveSortField === 'title' ? (
                                archiveSortOrder === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                              ) : (
                                <ArrowUpDown size={12} className="opacity-40" />
                              )}
                            </div>
                          </th>

                          {/* Column: Agent Name */}
                          <th 
                            onClick={() => {
                              if (archiveSortField === 'agent') {
                                setArchiveSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                              } else {
                                setArchiveSortField('agent');
                                setArchiveSortOrder('asc');
                              }
                            }}
                            className="px-6 py-3.5 font-semibold text-xs tracking-wider uppercase cursor-pointer hover:text-white transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Agent Name</span>
                              {archiveSortField === 'agent' ? (
                                archiveSortOrder === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                              ) : (
                                <ArrowUpDown size={12} className="opacity-40" />
                              )}
                            </div>
                          </th>

                          {/* Column: Priority */}
                          <th className="px-6 py-3.5 font-semibold text-xs tracking-wider uppercase">
                            Priority
                          </th>

                          {/* Column: Created Date */}
                          <th 
                            onClick={() => {
                              if (archiveSortField === 'created_at') {
                                setArchiveSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                              } else {
                                setArchiveSortField('created_at');
                                setArchiveSortOrder('desc');
                              }
                            }}
                            className="px-6 py-3.5 font-semibold text-xs tracking-wider uppercase cursor-pointer hover:text-white transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Created Date</span>
                              {archiveSortField === 'created_at' ? (
                                archiveSortOrder === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                              ) : (
                                <ArrowUpDown size={12} className="opacity-40" />
                              )}
                            </div>
                          </th>

                          {/* Column: Completed Date */}
                          <th 
                            onClick={() => {
                              if (archiveSortField === 'completed_date') {
                                setArchiveSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                              } else {
                                setArchiveSortField('completed_date');
                                setArchiveSortOrder('desc');
                              }
                            }}
                            className="px-6 py-3.5 font-semibold text-xs tracking-wider uppercase cursor-pointer hover:text-white transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Completed Date</span>
                              {archiveSortField === 'completed_date' ? (
                                archiveSortOrder === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                              ) : (
                                <ArrowUpDown size={12} className="opacity-40" />
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        {filteredAndSortedArchivedTasks
                          .slice((archiveCurrentPage - 1) * archivePageSize, archiveCurrentPage * archivePageSize)
                          .map(task => {
                            const agent = allEmployees.find(a => a.id === task.agent_id);
                            const agentName = agent?.name || task.agent_id || 'Unknown';
                            const completedTimestamp = task.customCompletedAt || task.custom_completed_at || task.completed_date || task.completedDate;
                            
                            return (
                              <tr key={task.id} className="hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4 font-medium text-white max-w-xs truncate" title={task.title}>
                                  {task.title || 'Untitled Task'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-5 h-5 rounded-full ${agent?.color || 'bg-slate-600'} flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0`}>
                                      {getInitials(agentName)}
                                    </div>
                                    <span className="text-slate-200">{agentName}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                                    task.priority === 'High' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 
                                    task.priority === 'Medium' ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' : 
                                    'bg-green-500/15 text-green-400 border-green-500/30'
                                  }`}>
                                    {task.priority || 'Medium'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-400 whitespace-nowrap text-xs">
                                  {formatDateLong(task.created_at)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs">
                                  {completedTimestamp ? (
                                    <span className="text-emerald-300 font-medium bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                      {formatDateLong(completedTimestamp)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  {filteredAndSortedArchivedTasks.length > archivePageSize && (
                    <div className="p-4 border-t border-white/10 bg-white/3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                      <div>
                        Showing <strong className="text-white">{Math.min((archiveCurrentPage - 1) * archivePageSize + 1, filteredAndSortedArchivedTasks.length)}</strong>–<strong className="text-white">{Math.min(archiveCurrentPage * archivePageSize, filteredAndSortedArchivedTasks.length)}</strong> of <strong className="text-white">{filteredAndSortedArchivedTasks.length}</strong> tasks
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={archiveCurrentPage <= 1}
                          onClick={() => setArchiveCurrentPage(prev => Math.max(1, prev - 1))}
                          className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          Previous
                        </button>
                        <span className="px-2 font-medium text-slate-300">
                          Page {archiveCurrentPage} of {Math.ceil(filteredAndSortedArchivedTasks.length / archivePageSize) || 1}
                        </span>
                        <button
                          disabled={archiveCurrentPage >= Math.ceil(filteredAndSortedArchivedTasks.length / archivePageSize)}
                          onClick={() => setArchiveCurrentPage(prev => Math.min(Math.ceil(filteredAndSortedArchivedTasks.length / archivePageSize), prev + 1))}
                          className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task History Sidebar */}
      {showHistorySidebar && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop with a smooth dark blur */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" onClick={() => setShowHistorySidebar(false)} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-[#07102e]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              {/* Sidebar Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5 rounded-tl-2xl">
                <div className="flex items-center gap-2">
                  <History className="text-brand-400 animate-pulse" size={20} />
                  <h2 className="text-lg font-bold text-white">Completed Task History</h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 font-semibold ml-1">
                    {filteredCompletedTasks.length}
                  </span>
                </div>
                <button onClick={() => setShowHistorySidebar(false)} className="text-slate-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              {/* Search Box & Filter Controls */}
              <div className="p-4 border-b border-white/10 bg-white/5 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  <input
                    type="text"
                    value={searchHistoryQuery}
                    onChange={(e) => setSearchHistoryQuery(e.target.value)}
                    placeholder="Search completed tasks or agents..."
                    className="glass-input w-full pr-8 py-2 text-sm"
                    style={{ paddingLeft: '2.6rem' }}
                    spellCheck={false}
                  />
                  {searchHistoryQuery && (
                    <button
                      onClick={() => setSearchHistoryQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      title="Clear Search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filter Options Controls Bar */}
                <div className="space-y-2 pt-1 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <SlidersHorizontal size={13} className="text-brand-400" /> Filter History
                    </span>
                    {(historyDeptFilter !== 'ALL' || historyAgentFilter !== 'ALL' || historyDateFilter !== 'ALL' || historyPriorityFilter !== 'ALL') && (
                      <button
                        onClick={() => {
                          setHistoryDeptFilter('ALL');
                          setHistoryAgentFilter('ALL');
                          setHistoryDateFilter('ALL');
                          setHistoryPriorityFilter('ALL');
                        }}
                        className="text-brand-400 hover:text-brand-300 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Department Filter */}
                    <select
                      value={historyDeptFilter}
                      onChange={(e) => setHistoryDeptFilter(e.target.value)}
                      className="glass-input text-[11px] py-1.5 px-2 bg-[#0a1438] text-white cursor-pointer rounded-lg border border-white/15 focus:outline-none focus:ring-1 focus:ring-brand-400 font-medium"
                    >
                      <option value="ALL" className="bg-[#0a1438] text-white py-1">All Departments</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.name} className="bg-[#0a1438] text-white py-1">{d.name}</option>
                      ))}
                    </select>

                    {/* Agent Filter */}
                    <select
                      value={historyAgentFilter}
                      onChange={(e) => setHistoryAgentFilter(e.target.value)}
                      className="glass-input text-[11px] py-1.5 px-2 bg-[#0a1438] text-white cursor-pointer rounded-lg border border-white/15 focus:outline-none focus:ring-1 focus:ring-brand-400 font-medium"
                    >
                      <option value="ALL" className="bg-[#0a1438] text-white py-1">All Agents ({allEmployees.length})</option>
                      {allEmployees.map(emp => (
                        <option key={emp.id} value={emp.id} className="bg-[#0a1438] text-white py-1">{emp.name}</option>
                      ))}
                    </select>

                    {/* Date Filter */}
                    <select
                      value={historyDateFilter}
                      onChange={(e) => setHistoryDateFilter(e.target.value)}
                      className="glass-input text-[11px] py-1.5 px-2 bg-[#0a1438] text-white cursor-pointer rounded-lg border border-white/15 focus:outline-none focus:ring-1 focus:ring-brand-400 font-medium"
                    >
                      <option value="ALL" className="bg-[#0a1438] text-white py-1">All Dates</option>
                      <option value="TODAY" className="bg-[#0a1438] text-white py-1">Today</option>
                      <option value="YESTERDAY" className="bg-[#0a1438] text-white py-1">Yesterday</option>
                      <option value="LAST_7" className="bg-[#0a1438] text-white py-1">Last 7 Days</option>
                    </select>

                    {/* Priority Filter */}
                    <select
                      value={historyPriorityFilter}
                      onChange={(e) => setHistoryPriorityFilter(e.target.value)}
                      className="glass-input text-[11px] py-1.5 px-2 bg-[#0a1438] text-white cursor-pointer rounded-lg border border-white/15 focus:outline-none focus:ring-1 focus:ring-brand-400 font-medium"
                    >
                      <option value="ALL" className="bg-[#0a1438] text-white py-1">All Priorities</option>
                      <option value="High" className="bg-[#0a1438] text-white py-1">High Priority</option>
                      <option value="Medium" className="bg-[#0a1438] text-white py-1">Medium Priority</option>
                      <option value="Low" className="bg-[#0a1438] text-white py-1">Low Priority</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sidebar Content (Completed Tasks List) */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                {filteredCompletedTasks.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 py-12 text-center">
                    <History size={40} className="text-slate-600 mb-2 opacity-60" />
                    <p className="text-sm font-medium">No completed tasks found</p>
                  </div>
                ) : (
                  filteredCompletedTasks.map(({ task, emp, boardName, deptName }) => {
                    const cDate = task.completed_date || task.completedDate || task.created_at;
                    return (
                      <div key={task.id} className="glass-card p-4 border border-white/10 rounded-xl bg-white/5 flex flex-col gap-3 hover:bg-white/10 transition-all group">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-semibold text-white leading-snug break-words">{task.title}</h4>
                            </div>
                            {deptName && boardName && deptName !== 'Archived' && (
                              <span className="text-[10px] text-slate-400 block mt-1 font-medium">
                                {deptName} • {boardName}
                              </span>
                            )}
                            {task.description && (
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              updateTask(emp.id, task.id, { completed: false });
                            }}
                            className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-brand-500/20 hover:bg-brand-500 text-brand-300 hover:text-white border border-brand-500/30 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-[0_0_10px_rgba(37,99,235,0.2)]"
                            title="Undo completion and restore task to Kanban board"
                          >
                            <RotateCcw size={13} /> Undo
                          </button>
                        </div>

                        <div className="flex items-center justify-between border-t border-white/5 pt-2.5 text-[11px]">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full ${emp.color || 'bg-slate-500'} flex items-center justify-center text-[10px] font-bold shadow flex-shrink-0`}>
                              {getInitials(emp.name)}
                            </div>
                            <span className="text-slate-200 font-medium truncate max-w-[110px]">{emp.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-300 text-[10px] flex items-center gap-1 font-medium bg-white/5 px-2 py-0.5 rounded-md border border-white/10" title="Completion Date">
                              📅 {formatDateLong(cDate)}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold ${
                              task.priority === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              task.priority === 'Medium' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                              'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            }`}>
                              {task.priority || 'Medium'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
