import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CheckSquare, LayoutGrid, Calendar as CalendarIcon, Timer, Flame,
  Hourglass, Search, Bell, RefreshCw, Plus, X, ChevronRight, ChevronDown,
  ChevronLeft, Trash2, Tag, Flag, Clock, Play, Pause, RotateCcw, Check,
  Circle, CheckCircle2, List, Filter, Award, Sparkles, Smile, ArrowRight,
  MoreHorizontal, Download, Upload, ExternalLink, Link2, Globe, Copy,
  CheckCheck, Settings, Send, CalendarCheck
} from 'lucide-react';
import {
  getGoogleCalendarUrl,
  getZohoCalendarUrl,
  generateICalendar,
  formatCalendarPayload,
  GOOGLE_APPS_SCRIPT_TEMPLATE
} from './calendarSyncUtils.js';

const STORAGE_KEY = 'lextria_leader_ticktick_data';

// Initial seed data based exactly on Leader Pranav Bhat's TickTick workspace screenshots
const DEFAULT_LEADER_DATA = {
  tasks: [
    {
      id: 'task-1',
      title: 'MAIL - PHISTRAP LLP',
      list: 'Inbox',
      quadrant: 'do_now', // Quadrant I: Do Now
      dueDate: '2026-10-03',
      priority: 'High',
      completed: false,
      tags: ['followup'],
      notes: 'Follow up on legal notice and mail dispatch.',
      subtasks: [{ id: 's1', text: 'Draft reply', done: true }, { id: 's2', text: 'Send dispatch', done: false }]
    },
    {
      id: 'task-2',
      title: 'Shop 4 rent agreement',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '2026-10-05',
      priority: 'High',
      completed: false,
      tags: ['Bill'],
      notes: 'Finalize terms and stamp duty.',
      subtasks: []
    },
    {
      id: 'task-3',
      title: 'Email - Anupama Bhat INVOICE',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '2026-10-06',
      priority: 'High',
      completed: false,
      tags: ['Kavana', 'Bill'],
      notes: 'Attach invoice and statement of fees.',
      subtasks: []
    },
    {
      id: 'task-4',
      title: 'Peace in Pace email connect forward',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '',
      priority: 'High',
      completed: false,
      tags: ['Lead'],
      notes: 'Forward deck and connect over email.',
      subtasks: []
    },
    {
      id: 'task-5',
      title: 'Reconstitution Deed Lextria',
      list: 'Inbox',
      quadrant: 'park', // Quadrant II: Park / Plan
      dueDate: '2026-07-30',
      priority: 'Medium',
      completed: false,
      tags: ['followup'],
      notes: 'Review deed clauses with partners.',
      subtasks: []
    },
    {
      id: 'task-6',
      title: 'Bank work',
      list: 'Inbox',
      quadrant: 'park',
      dueDate: '2026-10-03',
      priority: 'Medium',
      completed: false,
      tags: ['Bill'],
      notes: 'Authorized signatory update.',
      subtasks: []
    },
    {
      id: 'task-7',
      title: 'Coconut Dehusker',
      list: 'Inbox',
      quadrant: 'park',
      dueDate: '2026-10-04',
      priority: 'Medium',
      completed: false,
      tags: ['Patent'],
      notes: 'Prior art analysis and claims review.',
      subtasks: []
    },
    {
      id: 'task-8',
      title: 'BMS <> Erulli Pre-Grant opposition',
      list: 'Inbox',
      quadrant: 'park',
      dueDate: '2026-10-19',
      priority: 'Medium',
      completed: false,
      tags: ['Patent', 'query'],
      notes: 'Grounds for opposition under Section 25(1).',
      subtasks: []
    },
    {
      id: 'task-9',
      title: 'Peace in Pace connect to Java Capital',
      list: 'Inbox',
      quadrant: 'park',
      dueDate: '',
      priority: 'Medium',
      completed: false,
      tags: ['Lead'],
      notes: 'Introductory call schedule.',
      subtasks: []
    },
    {
      id: 'task-10',
      title: 'Batra Report related',
      list: 'Inbox',
      quadrant: 'delegate', // Quadrant III: Delegate
      dueDate: '',
      priority: 'Low',
      completed: false,
      tags: ['Sharan'],
      notes: 'Coordinate with Sharan for Batra case study.',
      subtasks: []
    },
    {
      id: 'task-11',
      title: 'Anupama Bhat',
      list: 'Inbox',
      quadrant: 'bills_quotes', // Quadrant IV: Bill and Quotes
      dueDate: '2026-07-29',
      priority: 'Low',
      completed: false,
      tags: ['Bill'],
      notes: 'Quarterly billing reconciliation.',
      subtasks: []
    },
    {
      id: 'task-12',
      title: 'E-Actuel',
      list: 'Inbox',
      quadrant: 'bills_quotes',
      dueDate: '2026-08-11',
      priority: 'Low',
      completed: false,
      tags: ['Bill'],
      notes: 'Subscription renewal.',
      subtasks: []
    },
    {
      id: 'task-13',
      title: 'SP35',
      list: 'Inbox',
      quadrant: 'bills_quotes',
      dueDate: '2026-08-24',
      priority: 'Low',
      completed: false,
      tags: ['Bill'],
      notes: 'Filing fees voucher.',
      subtasks: []
    },
    {
      id: 'task-14',
      title: 'Call - Kuntavalli Vishwanath',
      list: 'Inbox',
      quadrant: 'bills_quotes',
      dueDate: '2026-09-30',
      priority: 'Low',
      completed: false,
      tags: ['Call'],
      notes: 'Consultation callback.',
      subtasks: []
    },
    {
      id: 'task-15',
      title: 'SkillBytes',
      list: 'Inbox',
      quadrant: 'bills_quotes',
      dueDate: '2026-10-01',
      priority: 'Low',
      completed: false,
      tags: ['Bill'],
      notes: 'Platform subscription.',
      subtasks: []
    },
    {
      id: 'task-16',
      title: 'CALL - Bombay Aditya',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '2026-10-12',
      priority: 'High',
      completed: false,
      tags: ['Call'],
      notes: 'Urgent strategy call on high court matter.',
      subtasks: []
    },
    {
      id: 'task-17',
      title: 'Write a letter',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '2026-10-12',
      priority: 'Medium',
      completed: false,
      tags: ['followup'],
      notes: 'Formal representation letter.',
      subtasks: []
    },
    {
      id: 'task-18',
      title: 'HEARING - SC 11:00 AM',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '2026-10-15',
      priority: 'High',
      completed: false,
      tags: ['followup'],
      notes: 'Supreme Court virtual listing.',
      subtasks: []
    },
    {
      id: 'task-19',
      title: 'TR147 10:00 AM',
      list: 'Inbox',
      quadrant: 'park',
      dueDate: '2026-10-22',
      priority: 'Medium',
      completed: false,
      tags: ['Patent'],
      notes: 'Technical review hearing.',
      subtasks: []
    },
    {
      id: 'task-20',
      title: 'TR145 10:00 AM',
      list: 'Inbox',
      quadrant: 'park',
      dueDate: '2026-10-22',
      priority: 'Medium',
      completed: false,
      tags: ['Patent'],
      notes: 'Patent controller examination.',
      subtasks: []
    },
    // Completed items from Screenshot 9
    {
      id: 'task-c1',
      title: 'should be in bengaluru on 23/09/2026',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '2026-09-23',
      priority: 'Medium',
      completed: true,
      tags: ['Kavana'],
      notes: 'Travel arrangement confirmed.',
      subtasks: []
    },
    {
      id: 'task-c2',
      title: 'expected to be in bengaluru on 23/09/2026',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '2026-09-21',
      priority: 'Medium',
      completed: true,
      tags: ['Kavana'],
      notes: 'Flight booked.',
      subtasks: []
    },
    {
      id: 'task-c3',
      title: 'schedule call with yash saini to discuss about his matter',
      list: 'Inbox',
      quadrant: 'do_now',
      dueDate: '2026-09-08',
      priority: 'Medium',
      completed: true,
      tags: ['Kavana'],
      notes: 'Discussed retainership.',
      subtasks: []
    },
    {
      id: 'task-c4',
      title: 'Invoice to Codezyng',
      list: 'Inbox',
      quadrant: 'bills_quotes',
      dueDate: '2026-08-31',
      priority: 'Low',
      completed: true,
      tags: ['Kavana', 'Bill'],
      notes: 'Payment received.',
      subtasks: []
    },
    {
      id: 'task-c5',
      title: 'zupaloop invoice',
      list: 'Inbox',
      quadrant: 'bills_quotes',
      dueDate: '2026-08-31',
      priority: 'Low',
      completed: true,
      tags: ['Kavana'],
      notes: 'Dispatched.',
      subtasks: []
    }
  ],
  customLists: ['Executive', 'Legal', 'Operations', 'Personal'],
  customTags: [
    { name: 'followup', color: '#3b82f6' },
    { name: 'Kavana', color: '#a855f7' },
    { name: 'Prashanth', color: '#f97316' },
    { name: 'Ganesh', color: '#0ea5e9' },
    { name: 'Akshay', color: '#ec4899' },
    { name: 'Sharan', color: '#f59e0b' },
    { name: 'Bill', color: '#ef4444' },
    { name: 'Call', color: '#10b981' },
    { name: 'query', color: '#8b5cf6' },
    { name: 'Lead', color: '#e11d48' },
    { name: 'Patent', color: '#06b6d4' }
  ],
  habits: [
    {
      id: 'h-1',
      name: 'Write a letter',
      emoji: '😊',
      streak: 0,
      bestStreak: 7,
      history: { '2026-10-12': true, '2026-10-11': true, '2026-10-10': true }
    },
    {
      id: 'h-2',
      name: 'Review Daily Queries',
      emoji: '📖',
      streak: 4,
      bestStreak: 14,
      history: { '2026-10-12': true, '2026-10-11': true }
    },
    {
      id: 'h-3',
      name: 'Client Follow-ups',
      emoji: '💼',
      streak: 5,
      bestStreak: 12,
      history: { '2026-10-12': true }
    }
  ],
  countdowns: [
    {
      id: 'cd-1',
      title: "New Year's Day",
      emoji: '🎆',
      targetDate: '2027-01-01',
      type: 'until'
    },
    {
      id: 'cd-2',
      title: "Pranav's Bday",
      emoji: '🎂',
      targetDate: '2027-08-10',
      type: 'until'
    },
    {
      id: 'cd-3',
      title: "Use TickTick",
      emoji: '🚀',
      targetDate: '2019-01-22',
      type: 'since'
    }
  ],
  pomoStats: {
    todayPomos: 2,
    todayMinutes: 50,
    totalPomos: 14,
    totalMinutes: 350,
    records: [
      { id: 'p-1', taskTitle: 'Reconstitution Deed Lextria', duration: 25, date: '2026-10-12 11:30' },
      { id: 'p-2', taskTitle: 'CALL - Bombay Aditya', duration: 25, date: '2026-10-12 12:15' }
    ]
  },
  calendarSync: {
    googleWebhookUrl: '',
    zohoWebhookUrl: '',
    autoSyncEnabled: true,
    lastSyncedAt: null,
    syncHistory: []
  }
};

export default function LeaderTaskboard({ currentUser }) {
  // Persistence
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.calendarSync) {
          parsed.calendarSync = {
            googleWebhookUrl: '',
            zohoWebhookUrl: '',
            autoSyncEnabled: true,
            lastSyncedAt: null,
            syncHistory: []
          };
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load leader workspace data:', e);
    }
    return DEFAULT_LEADER_DATA;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save leader workspace data:', e);
    }
  }, [data]);

  // Active view inside Leader Taskboard:
  // 'tasks' | 'matrix' | 'calendar' | 'pomo' | 'habit' | 'countdown'
  const [activeModule, setActiveModule] = useState('tasks');

  // Search & Notification popover states
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTab, setSearchTab] = useState('Task'); // 'Task' | 'Tags' | 'List'
  const [searchKeyword, setSearchKeyword] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifTab, setNotifTab] = useState('Notifications'); // 'Notifications' | 'Activities'

  // Selected Task Drawer
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  // Active Filter in Tasks module: { type: 'smart'|'list'|'tag', value: string }
  const [activeTaskFilter, setActiveTaskFilter] = useState({ type: 'smart', value: 'Today' });
  const [newTaskInput, setNewTaskInput] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('Medium');

  // Completed section collapsed state
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);

  // Helper date calculations
  const todayStr = '2026-10-12'; // Live anchored date

  // Calendar Synchronization States
  const [showCalendarSyncModal, setShowCalendarSyncModal] = useState(false);
  const [calendarSyncTab, setCalendarSyncTab] = useState('overview'); // 'overview' | 'google' | 'zoho' | 'ical'
  const [syncToast, setSyncToast] = useState(null); // { message, type }
  const [copiedScript, setCopiedScript] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // -------------------------------------------------------------
  // AUTOMATED CALENDAR SYNCHRONIZATION DISPATCHER
  // -------------------------------------------------------------
  const triggerCalendarSync = async (task, action = 'update') => {
    if (!task || !task.dueDate) return;
    const syncConfig = data.calendarSync || {};
    if (!syncConfig.autoSyncEnabled) return;

    const googleUrl = syncConfig.googleWebhookUrl;
    const zohoUrl = syncConfig.zohoWebhookUrl;

    if (!googleUrl && !zohoUrl) return;

    const payload = {
      action,
      timestamp: new Date().toISOString(),
      task: {
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        priority: task.priority || 'Normal',
        notes: task.notes || '',
        quadrant: task.quadrant || 'Executive',
        list: task.list || 'Inbox',
        completed: !!task.completed
      }
    };

    const newTargets = [];

    // Google Apps Script Webhook
    if (googleUrl) {
      try {
        fetch(googleUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(err => console.warn('Google Calendar webhook background dispatch:', err));
        newTargets.push('Google Calendar');
      } catch (err) {
        console.warn('Google Calendar dispatch error:', err);
      }
    }

    // Zoho Flow / Webhook
    if (zohoUrl) {
      try {
        fetch(zohoUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(err => console.warn('Zoho Calendar webhook background dispatch:', err));
        newTargets.push('Zoho Calendar');
      } catch (err) {
        console.warn('Zoho Calendar dispatch error:', err);
      }
    }

    if (newTargets.length > 0) {
      const historyEntry = {
        id: `sync-${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        taskTitle: task.title,
        dueDate: task.dueDate,
        targets: newTargets
      };

      setSyncToast({
        message: `Task "${task.title.slice(0, 24)}${task.title.length > 24 ? '...' : ''}" synced to ${newTargets.join(' & ')}!`,
        type: 'success'
      });
      setTimeout(() => setSyncToast(null), 4000);

      setData(prev => ({
        ...prev,
        calendarSync: {
          ...prev.calendarSync,
          lastSyncedAt: new Date().toISOString(),
          syncHistory: [historyEntry, ...(prev.calendarSync?.syncHistory || []).slice(0, 19)]
        }
      }));
    }
  };

  const handleDownloadIcs = () => {
    const icsContent = generateICalendar(data.tasks);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lextria_leader_tasks_${todayStr}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setSyncToast({
      message: 'RFC 5545 iCalendar (.ics) downloaded! Ready to import into Google or Zoho Calendar.',
      type: 'info'
    });
    setTimeout(() => setSyncToast(null), 4000);
  };

  const handleTestWebhook = async (targetType) => {
    const url = targetType === 'google' 
      ? data.calendarSync?.googleWebhookUrl 
      : data.calendarSync?.zohoWebhookUrl;
      
    if (!url) {
      setTestResult({ type: 'error', message: `Please enter a valid ${targetType === 'google' ? 'Google Apps Script' : 'Zoho Flow'} Webhook URL first.` });
      return;
    }

    setTestingWebhook(true);
    setTestResult(null);

    const testPayload = {
      action: 'test_connection',
      timestamp: new Date().toISOString(),
      task: {
        id: 'test-ping',
        title: 'Lextria Leader Test Event',
        dueDate: todayStr,
        priority: 'High',
        notes: 'Verification test from Lextria Leader Taskboard',
        quadrant: 'do_now',
        list: 'Inbox'
      }
    };

    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });
      setTestResult({
        type: 'success',
        message: `Webhook test dispatched to ${targetType === 'google' ? 'Google Calendar' : 'Zoho Calendar'}! Check your calendar for the test event.`
      });
    } catch (err) {
      setTestResult({
        type: 'error',
        message: `Failed to dispatch test payload: ${err.message}`
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE).then(() => {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    });
  };

  // -------------------------------------------------------------
  // TASK ACTIONS
  // -------------------------------------------------------------
  const handleToggleTask = (taskId) => {
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t)
    }));
  };

  const handleAddTask = (e) => {
    if (e) e.preventDefault();
    if (!newTaskInput.trim()) return;

    const assignedList = activeTaskFilter.type === 'list' ? activeTaskFilter.value : 'Inbox';
    const assignedTags = activeTaskFilter.type === 'tag' ? [activeTaskFilter.value] : [];
    const assignedDueDate = activeTaskFilter.type === 'smart' && activeTaskFilter.value === 'Today' ? todayStr : newTaskDueDate;

    const newTask = {
      id: `task-${Date.now()}`,
      title: newTaskInput.trim(),
      list: assignedList,
      quadrant: 'do_now',
      dueDate: assignedDueDate,
      priority: newTaskPriority,
      completed: false,
      tags: assignedTags,
      notes: '',
      subtasks: []
    };

    setData(prev => ({
      ...prev,
      tasks: [newTask, ...prev.tasks]
    }));
    setNewTaskInput('');
    setNewTaskDueDate('');
    setSelectedTaskId(newTask.id);

    if (newTask.dueDate) {
      triggerCalendarSync(newTask, 'create');
    }
  };

  const handleUpdateTask = (taskId, fields) => {
    setData(prev => {
      let targetTask = null;
      const updatedTasks = prev.tasks.map(t => {
        if (t.id === taskId) {
          const updated = { ...t, ...fields };
          targetTask = updated;
          return updated;
        }
        return t;
      });

      if (targetTask && (fields.dueDate !== undefined || fields.title !== undefined || fields.priority !== undefined || fields.notes !== undefined || fields.completed !== undefined)) {
        if (targetTask.dueDate) {
          triggerCalendarSync(targetTask, 'update');
        }
      }

      return { ...prev, tasks: updatedTasks };
    });
  };

  const handleDeleteTask = (taskId) => {
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== taskId)
    }));
    if (selectedTaskId === taskId) setSelectedTaskId(null);
  };

  const handleAddSubtask = (taskId, text) => {
    if (!text.trim()) return;
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        if (t.id !== taskId) return t;
        const sub = { id: `st-${Date.now()}`, text: text.trim(), done: false };
        return { ...t, subtasks: [...(t.subtasks || []), sub] };
      })
    }));
  };

  const handleToggleSubtask = (taskId, subtaskId) => {
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: (t.subtasks || []).map(st => st.id === subtaskId ? { ...st, done: !st.done } : st)
        };
      })
    }));
  };

  const handleDeleteSubtask = (taskId, subtaskId) => {
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: (t.subtasks || []).map(st => st.id !== subtaskId)
        };
      })
    }));
  };

  // -------------------------------------------------------------
  // FILTERED TASKS COMPUTATION
  // -------------------------------------------------------------
  const filteredTasks = useMemo(() => {
    return data.tasks.filter(t => {
      if (activeTaskFilter.type === 'smart') {
        if (activeTaskFilter.value === 'Today') {
          return !t.completed ? (t.dueDate === todayStr || (t.dueDate && t.dueDate < todayStr)) : t.dueDate === todayStr;
        }
        if (activeTaskFilter.value === 'Next 7 Days') {
          return t.dueDate && t.dueDate >= todayStr;
        }
        if (activeTaskFilter.value === 'Inbox') {
          return t.list === 'Inbox';
        }
      } else if (activeTaskFilter.type === 'list') {
        return t.list === activeTaskFilter.value;
      } else if (activeTaskFilter.type === 'tag') {
        return t.tags && t.tags.includes(activeTaskFilter.value);
      }
      return true;
    });
  }, [data.tasks, activeTaskFilter, todayStr]);

  const activeFilteredTasks = filteredTasks.filter(t => !t.completed);
  const completedFilteredTasks = filteredTasks.filter(t => t.completed);

  const selectedTask = useMemo(() => {
    return data.tasks.find(t => t.id === selectedTaskId) || null;
  }, [data.tasks, selectedTaskId]);

  // Counts for smart lists
  const countToday = useMemo(() => {
    return data.tasks.filter(t => !t.completed && (t.dueDate === todayStr || (t.dueDate && t.dueDate < todayStr))).length;
  }, [data.tasks, todayStr]);

  const countNext7 = useMemo(() => {
    return data.tasks.filter(t => !t.completed && t.dueDate && t.dueDate >= todayStr).length;
  }, [data.tasks, todayStr]);

  const countInbox = useMemo(() => {
    return data.tasks.filter(t => !t.completed && t.list === 'Inbox').length;
  }, [data.tasks]);

  // Tag helper
  const getTagColor = (tagName) => {
    const found = data.customTags.find(ct => ct.name.toLowerCase() === tagName.toLowerCase());
    return found ? found.color : '#3b82f6';
  };

  // -------------------------------------------------------------
  // POMODORO TIMER STATE
  // -------------------------------------------------------------
  const [pomoMode, setPomoMode] = useState('pomo'); // 'pomo' | 'stopwatch'
  const [pomoSeconds, setPomoSeconds] = useState(25 * 60);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoTaskTitle, setPomoTaskTitle] = useState('');

  useEffect(() => {
    let interval = null;
    if (pomoRunning) {
      interval = setInterval(() => {
        setPomoSeconds(prev => {
          if (pomoMode === 'pomo') {
            if (prev <= 1) {
              setPomoRunning(false);
              // Record completion
              const durationMin = 25;
              setData(d => ({
                ...d,
                pomoStats: {
                  ...d.pomoStats,
                  todayPomos: (d.pomoStats.todayPomos || 0) + 1,
                  todayMinutes: (d.pomoStats.todayMinutes || 0) + durationMin,
                  totalPomos: (d.pomoStats.totalPomos || 0) + 1,
                  totalMinutes: (d.pomoStats.totalMinutes || 0) + durationMin,
                  records: [
                    { id: `pr-${Date.now()}`, taskTitle: pomoTaskTitle || 'Focus Session', duration: durationMin, date: 'Just now' },
                    ...(d.pomoStats.records || [])
                  ]
                }
              }));
              alert('🎉 Focus Session Completed!');
              return 25 * 60;
            }
            return prev - 1;
          } else {
            return prev + 1;
          }
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [pomoRunning, pomoMode, pomoTaskTitle]);

  const formatPomoTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // -------------------------------------------------------------
  // HABIT CHECK-IN ACTIONS
  // -------------------------------------------------------------
  const handleToggleHabitDay = (habitId, dateStr) => {
    setData(prev => ({
      ...prev,
      habits: prev.habits.map(h => {
        if (h.id !== habitId) return h;
        const currentHist = { ...(h.history || {}) };
        const isDone = !!currentHist[dateStr];
        if (isDone) {
          delete currentHist[dateStr];
        } else {
          currentHist[dateStr] = true;
        }
        // Calculate new streak
        const streakCount = Object.keys(currentHist).length;
        return {
          ...h,
          history: currentHist,
          streak: streakCount,
          bestStreak: Math.max(h.bestStreak || 0, streakCount)
        };
      })
    }));
  };

  // Add Habit modal state
  const [showAddHabitModal, setShowAddHabitModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitEmoji, setNewHabitEmoji] = useState('😊');

  const handleCreateHabit = () => {
    if (!newHabitName.trim()) return;
    const newH = {
      id: `h-${Date.now()}`,
      name: newHabitName.trim(),
      emoji: newHabitEmoji || '⭐',
      streak: 0,
      bestStreak: 0,
      history: {}
    };
    setData(prev => ({ ...prev, habits: [...prev.habits, newH] }));
    setNewHabitName('');
    setShowAddHabitModal(false);
  };

  // -------------------------------------------------------------
  // COUNTDOWN ACTIONS
  // -------------------------------------------------------------
  const [showAddCountdownModal, setShowAddCountdownModal] = useState(false);
  const [newCountdownTitle, setNewCountdownTitle] = useState('');
  const [newCountdownDate, setNewCountdownDate] = useState('');
  const [newCountdownEmoji, setNewCountdownEmoji] = useState('🎯');
  const [newCountdownType, setNewCountdownType] = useState('until');

  const handleCreateCountdown = () => {
    if (!newCountdownTitle.trim() || !newCountdownDate) return;
    const newCd = {
      id: `cd-${Date.now()}`,
      title: newCountdownTitle.trim(),
      emoji: newCountdownEmoji || '🎯',
      targetDate: newCountdownDate,
      type: newCountdownType
    };
    setData(prev => ({ ...prev, countdowns: [...prev.countdowns, newCd] }));
    setNewCountdownTitle('');
    setNewCountdownDate('');
    setShowAddCountdownModal(false);
  };

  const calculateDaysDiff = (targetDate, type) => {
    const now = new Date('2026-10-12T00:00:00');
    const target = new Date(`${targetDate}T00:00:00`);
    const diffTime = target - now;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (type === 'since') {
      return Math.abs(diffDays);
    }
    return diffDays;
  };

  // -------------------------------------------------------------
  // CALENDAR VIEW HELPERS
  // -------------------------------------------------------------
  const [calendarMonth, setCalendarMonth] = useState(9); // 0-indexed: 9 = October
  const [calendarYear, setCalendarYear] = useState(2026);

  // Month days for Oct 2026 (Starts on Thursday Oct 1)
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay(); // 0 is Sun, 1 is Mon...
    // Adjust to Monday start: 0->6, 1->0, 2->1...
    const adjustedStart = (firstDayIndex + 6) % 7;
    
    const days = [];
    // Leading days from previous month
    for (let i = 0; i < adjustedStart; i++) {
      days.push({ day: 0, dateStr: '', currentMonth: false });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(calendarMonth + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      days.push({
        day: d,
        dateStr: `${calendarYear}-${monthStr}-${dayStr}`,
        currentMonth: true
      });
    }
    return days;
  }, [calendarMonth, calendarYear]);

  // Tasks mapped by dateStr
  const tasksByDate = useMemo(() => {
    const map = {};
    data.tasks.forEach(t => {
      if (t.dueDate) {
        if (!map[t.dueDate]) map[t.dueDate] = [];
        map[t.dueDate].push(t);
      }
    });
    return map;
  }, [data.tasks]);

  // -------------------------------------------------------------
  // EXPORT / IMPORT BACKUP
  // -------------------------------------------------------------
  const handleExportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lextria_leader_ticktick_backup_${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full w-full bg-[#121214] text-slate-100 font-sans select-none overflow-hidden">
      
      {/* ========================================================= */}
      {/* 1. TICKTICK LEFT ICON RAIL */}
      {/* ========================================================= */}
      <aside className="w-14 shrink-0 bg-[#0c0c0e] border-r border-white/5 flex flex-col items-center py-4 justify-between z-20 shadow-xl">
        {/* Top: Avatar with Crown */}
        <div className="flex flex-col items-center gap-6">
          <div className="relative group cursor-pointer" title="Leader Profile: Pranav Bhat">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 p-0.5 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
              <div className="w-full h-full rounded-full bg-[#18181b] flex items-center justify-center font-bold text-xs text-amber-300">
                PB
              </div>
            </div>
            <span className="absolute -top-1 -right-1 text-xs" title="Leader Mode Active">👑</span>
          </div>

          {/* Module Icons Strip */}
          <nav className="flex flex-col items-center gap-2">
            {[
              { id: 'tasks', label: 'Tasks', icon: CheckSquare },
              { id: 'matrix', label: 'Eisenhower Matrix', icon: LayoutGrid },
              { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
              { id: 'pomo', label: 'Pomodoro Focus', icon: Timer },
              { id: 'habit', label: 'Habit Tracker', icon: Flame },
              { id: 'countdown', label: 'Countdown', icon: Hourglass },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveModule(id)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group ${
                  activeModule === id
                    ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.5)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                title={label}
              >
                <Icon size={19} />
                {activeModule === id && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-400 rounded-r-full" />
                )}
                {/* Floating tooltip */}
                <span className="absolute left-14 bg-[#1f1f23] text-white text-xs px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg border border-white/10 z-50">
                  {label}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Bottom Utility Icons */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Quick Search"
          >
            <Search size={18} />
          </button>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer relative"
            title="Notifications"
          >
            <Bell size={18} />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-blue-500" />
          </button>
          <button
            onClick={() => setShowCalendarSyncModal(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer relative group"
            title="Google & Zoho Calendar Integration"
          >
            <CalendarCheck size={18} />
            {(data.calendarSync?.googleWebhookUrl || data.calendarSync?.zohoWebhookUrl) && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            )}
            <span className="absolute left-14 bg-[#1f1f23] text-white text-xs px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg border border-white/10 z-50">
              Calendar Sync (Google & Zoho)
            </span>
          </button>
          <button
            onClick={handleExportBackup}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Download Workspace Backup (JSON)"
          >
            <Download size={17} />
          </button>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. MAIN WORKSPACE CONTENT BASED ON ACTIVE MODULE */}
      {/* ========================================================= */}
      <div className="flex-1 flex overflow-hidden bg-[#18181b]">

        {/* ------------------------------------------------------- */}
        {/* MODULE 1: TASKS VIEW (Image 9) */}
        {/* ------------------------------------------------------- */}
        {activeModule === 'tasks' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Smart Lists & Tags */}
            <aside className="w-56 shrink-0 bg-[#141416] border-r border-white/5 flex flex-col py-4 px-3 overflow-y-auto custom-scrollbar">
              <div className="space-y-1 mb-6">
                <button
                  onClick={() => setActiveTaskFilter({ type: 'smart', value: 'Today' })}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTaskFilter.type === 'smart' && activeTaskFilter.value === 'Today'
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarIcon size={16} className="text-blue-400" /> Today
                  </span>
                  <span className="text-xs text-slate-400">{countToday}</span>
                </button>

                <button
                  onClick={() => setActiveTaskFilter({ type: 'smart', value: 'Next 7 Days' })}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTaskFilter.type === 'smart' && activeTaskFilter.value === 'Next 7 Days'
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarDaysIcon size={16} className="text-amber-400" /> Next 7 Days
                  </span>
                  <span className="text-xs text-slate-400">{countNext7}</span>
                </button>

                <button
                  onClick={() => setActiveTaskFilter({ type: 'smart', value: 'Inbox' })}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTaskFilter.type === 'smart' && activeTaskFilter.value === 'Inbox'
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <List size={16} className="text-emerald-400" /> Inbox
                  </span>
                  <span className="text-xs text-slate-400">{countInbox}</span>
                </button>
              </div>

              {/* Custom Lists Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                  <span>Lists</span>
                </div>
                <div className="space-y-1">
                  {data.customLists.map(lst => (
                    <button
                      key={lst}
                      onClick={() => setActiveTaskFilter({ type: 'list', value: lst })}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                        activeTaskFilter.type === 'list' && activeTaskFilter.value === lst
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className="w-2 h-2 rounded-full bg-slate-500" /> {lst}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {data.tasks.filter(t => !t.completed && t.list === lst).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags Section */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                  <span>Tags</span>
                </div>
                <div className="space-y-1">
                  {data.customTags.map(tagObj => (
                    <button
                      key={tagObj.name}
                      onClick={() => setActiveTaskFilter({ type: 'tag', value: tagObj.name })}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                        activeTaskFilter.type === 'tag' && activeTaskFilter.value === tagObj.name
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Tag size={13} style={{ color: tagObj.color }} /> {tagObj.name}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {data.tasks.filter(t => !t.completed && t.tags && t.tags.includes(tagObj.name)).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* Middle Column: Task List */}
            <main className="flex-1 flex flex-col overflow-hidden bg-[#18181b]">
              {/* Header Bar */}
              <div className="h-14 px-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#161619]">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {activeTaskFilter.type === 'tag' && <Tag size={17} style={{ color: getTagColor(activeTaskFilter.value) }} />}
                    {activeTaskFilter.value}
                  </h2>
                  <span className="text-xs text-slate-500 font-semibold bg-white/5 px-2 py-0.5 rounded-full">
                    {activeFilteredTasks.length}
                  </span>
                </div>
              </div>

              {/* Task Quick Input Bar */}
              <form onSubmit={handleAddTask} className="p-4 border-b border-white/5 bg-[#1a1a1e] shrink-0">
                <div className="flex items-center gap-3 bg-[#242429] border border-white/10 rounded-xl px-4 py-2.5 focus-within:border-blue-500/50 shadow-inner">
                  <Plus size={18} className="text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={newTaskInput}
                    onChange={(e) => setNewTaskInput(e.target.value)}
                    placeholder={`+ Add a task to "${activeTaskFilter.value}", press Enter...`}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
                  />
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="bg-transparent text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1 focus:outline-none"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="bg-transparent text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1 focus:outline-none"
                  >
                    <option value="High" className="bg-[#1f1f23]">🔴 High</option>
                    <option value="Medium" className="bg-[#1f1f23]">🟡 Med</option>
                    <option value="Low" className="bg-[#1f1f23]">🔵 Low</option>
                  </select>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-lg transition cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </form>

              {/* Tasks Scrollable List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {activeFilteredTasks.length === 0 && (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No active tasks in this view. Enjoy your focus time!
                  </div>
                )}

                {/* Active Tasks */}
                {activeFilteredTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedTaskId === task.id
                        ? 'bg-[#25252c] border-blue-500/40 shadow-md'
                        : 'bg-[#1e1e23] border-white/5 hover:border-white/15 hover:bg-[#222228]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTask(task.id);
                      }}
                      className="mt-0.5 w-4 h-4 rounded-full border border-slate-500 hover:border-blue-400 flex items-center justify-center transition cursor-pointer shrink-0"
                    >
                      {task.completed && <Check size={11} className="text-blue-400" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200 truncate">
                          {task.title}
                        </span>
                        {task.priority === 'High' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="High Priority" />}
                      </div>

                      {/* Metadata Chips: Tags, Date, Subtasks */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {task.tags && task.tags.map(tg => (
                          <span
                            key={tg}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${getTagColor(tg)}20`,
                              color: getTagColor(tg),
                              border: `1px solid ${getTagColor(tg)}40`
                            }}
                          >
                            {tg}
                          </span>
                        ))}
                        {task.dueDate && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 ${
                            task.dueDate < todayStr ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-slate-400'
                          }`}>
                            <Clock size={10} /> {task.dueDate}
                          </span>
                        )}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <span className="text-[10px] font-medium text-slate-400 bg-white/5 px-2 py-0.5 rounded-md">
                            {task.subtasks.filter(s => s.done).length}/{task.subtasks.length} subtasks
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                  </div>
                ))}

                {/* Completed Tasks Accordion */}
                {completedFilteredTasks.length > 0 && (
                  <div className="pt-4 border-t border-white/5">
                    <button
                      onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                      className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-300 transition mb-3 cursor-pointer"
                    >
                      <ChevronDown size={14} className={`transition-transform ${showCompletedTasks ? '' : '-rotate-90'}`} />
                      <span>Completed ({completedFilteredTasks.length})</span>
                    </button>

                    {showCompletedTasks && (
                      <div className="space-y-1.5">
                        {completedFilteredTasks.map(task => (
                          <div
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-[#18181c] border border-white/5 opacity-60 hover:opacity-100 transition cursor-pointer"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTask(task.id);
                              }}
                              className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0"
                            >
                              <Check size={11} className="text-white" />
                            </button>
                            <span className="text-xs text-slate-400 line-through truncate flex-1">
                              {task.title}
                            </span>
                            {task.dueDate && (
                              <span className="text-[10px] text-slate-500">{task.dueDate}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </main>

            {/* Right Column: Task Details Drawer */}
            {selectedTask && (
              <aside className="w-80 shrink-0 bg-[#161619] border-l border-white/5 flex flex-col p-5 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Task Detail</span>
                  <button
                    onClick={() => setSelectedTaskId(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4 flex-1">
                  {/* Title */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Title</label>
                    <input
                      type="text"
                      value={selectedTask.title}
                      onChange={(e) => handleUpdateTask(selectedTask.id, { title: e.target.value })}
                      className="w-full bg-[#202026] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Priority & Due Date */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">Priority</label>
                      <select
                        value={selectedTask.priority}
                        onChange={(e) => handleUpdateTask(selectedTask.id, { priority: e.target.value })}
                        className="w-full bg-[#202026] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                      >
                        <option value="High" className="bg-[#1f1f23]">🔴 High</option>
                        <option value="Medium" className="bg-[#1f1f23]">🟡 Medium</option>
                        <option value="Low" className="bg-[#1f1f23]">🔵 Low</option>
                        <option value="None" className="bg-[#1f1f23]">⚪ None</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">Due Date</label>
                      <input
                        type="date"
                        value={selectedTask.dueDate || ''}
                        onChange={(e) => handleUpdateTask(selectedTask.id, { dueDate: e.target.value })}
                        className="w-full bg-[#202026] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Eisenhower Quadrant */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Eisenhower Matrix</label>
                    <select
                      value={selectedTask.quadrant || 'do_now'}
                      onChange={(e) => handleUpdateTask(selectedTask.id, { quadrant: e.target.value })}
                      className="w-full bg-[#202026] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="do_now" className="bg-[#1f1f23]">Quadrant I: Pranav Do Now (Urgent & Important)</option>
                      <option value="park" className="bg-[#1f1f23]">Quadrant II: Pranav Park (Important & Not Urgent)</option>
                      <option value="delegate" className="bg-[#1f1f23]">Quadrant III: Delegate (Urgent & Not Important)</option>
                      <option value="bills_quotes" className="bg-[#1f1f23]">Quadrant IV: Bill & Quotes (Not Urgent)</option>
                    </select>
                  </div>

                  {/* Checklist Subtasks */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Subtasks Checklist</label>
                    <div className="space-y-1 mb-2">
                      {(selectedTask.subtasks || []).map(st => (
                        <div key={st.id} className="flex items-center gap-2 group/st py-1">
                          <button
                            type="button"
                            onClick={() => handleToggleSubtask(selectedTask.id, st.id)}
                            className="w-3.5 h-3.5 rounded border border-slate-500 hover:border-blue-400 flex items-center justify-center shrink-0 cursor-pointer"
                          >
                            {st.done && <Check size={10} className="text-blue-400" />}
                          </button>
                          <span className={`text-xs flex-1 truncate ${st.done ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                            {st.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubtask(selectedTask.id, st.id)}
                            className="text-slate-600 hover:text-red-400 opacity-0 group-hover/st:opacity-100 transition"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Add subtask input */}
                    <input
                      type="text"
                      placeholder="+ Add subtask..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddSubtask(selectedTask.id, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full bg-[#202026] border border-white/5 rounded-lg px-2.5 py-1 text-xs text-slate-300 placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Notes / Description</label>
                    <textarea
                      rows={4}
                      value={selectedTask.notes || ''}
                      onChange={(e) => handleUpdateTask(selectedTask.id, { notes: e.target.value })}
                      placeholder="Add detailed task notes or links..."
                      className="w-full bg-[#202026] border border-white/10 rounded-lg p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Calendar Sync & Integration Links */}
                  <div className="bg-[#1b1b22] border border-white/5 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        <CalendarCheck size={13} className="text-blue-400" /> Reflect in Calendar
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCalendarSyncModal(true)}
                        className="text-[10px] text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Settings size={10} /> Setup
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={getGoogleCalendarUrl(selectedTask)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-lg text-[11px] font-medium text-blue-300 hover:text-white transition cursor-pointer"
                        title="Add/Reflect in Google Calendar"
                      >
                        <ExternalLink size={11} /> Google Cal
                      </a>

                      <a
                        href={getZohoCalendarUrl(selectedTask)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 rounded-lg text-[11px] font-medium text-amber-300 hover:text-white transition cursor-pointer"
                        title="Add/Reflect in Zoho Calendar"
                      >
                        <ExternalLink size={11} /> Zoho Cal
                      </a>
                    </div>

                    {(data.calendarSync?.googleWebhookUrl || data.calendarSync?.zohoWebhookUrl) && (
                      <button
                        type="button"
                        onClick={() => triggerCalendarSync(selectedTask, 'manual_sync')}
                        className="w-full py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 rounded-lg text-[11px] font-medium text-emerald-300 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Send size={11} /> Sync Now to Connected Calendars
                      </button>
                    )}
                  </div>
                </div>

                {/* Delete Button */}
                <div className="pt-4 border-t border-white/5 flex justify-end">
                  <button
                    onClick={() => handleDeleteTask(selectedTask.id)}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 py-1 px-2.5 rounded-lg hover:bg-red-500/10 transition cursor-pointer"
                  >
                    <Trash2 size={13} /> Delete Task
                  </button>
                </div>
              </aside>
            )}
          </div>
        )}

        {/* ------------------------------------------------------- */}
        {/* MODULE 2: EISENHOWER MATRIX (Image 1) */}
        {/* ------------------------------------------------------- */}
        {activeModule === 'matrix' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <LayoutGrid className="text-amber-400" size={22} /> Eisenhower Matrix
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Priority-based decision grid customized for Pranav Bhat's executive workflow.
                </p>
              </div>
            </div>

            {/* 2x2 Quadrant Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-[600px]">
              
              {/* Quadrant I: Pranav Do Now */}
              <div className="bg-[#1b1b20] border border-red-500/30 rounded-2xl p-4 flex flex-col shadow-lg shadow-red-950/20">
                <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">
                      I
                    </span>
                    <h3 className="text-sm font-bold text-red-400">Pranav Do Now</h3>
                    <span className="text-xs text-slate-500 font-semibold">(Urgent & Important)</span>
                  </div>
                  <span className="text-xs font-semibold bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full">
                    {data.tasks.filter(t => !t.completed && (t.quadrant === 'do_now' || t.priority === 'High')).length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[320px]">
                  {data.tasks
                    .filter(t => !t.completed && (t.quadrant === 'do_now' || t.priority === 'High'))
                    .map(task => (
                      <div
                        key={task.id}
                        onClick={() => { setActiveModule('tasks'); setSelectedTaskId(task.id); }}
                        className="p-2.5 rounded-xl bg-[#23232a] border border-white/5 hover:border-red-500/40 flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleTask(task.id); }}
                            className="w-4 h-4 rounded-full border border-slate-500 hover:border-red-400 flex items-center justify-center shrink-0"
                          >
                            {task.completed && <Check size={10} className="text-red-400" />}
                          </button>
                          <span className="text-xs font-medium text-slate-200 truncate">{task.title}</span>
                        </div>
                        {task.dueDate && (
                          <span className="text-[10px] text-red-300 bg-red-500/10 px-2 py-0.5 rounded shrink-0">
                            {task.dueDate}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Quadrant II: Pranav Park */}
              <div className="bg-[#1b1b20] border border-amber-500/30 rounded-2xl p-4 flex flex-col shadow-lg shadow-amber-950/20">
                <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">
                      II
                    </span>
                    <h3 className="text-sm font-bold text-amber-400">Pranav Park</h3>
                    <span className="text-xs text-slate-500 font-semibold">(Important & Not Urgent)</span>
                  </div>
                  <span className="text-xs font-semibold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                    {data.tasks.filter(t => !t.completed && t.quadrant === 'park').length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[320px]">
                  {data.tasks
                    .filter(t => !t.completed && t.quadrant === 'park')
                    .map(task => (
                      <div
                        key={task.id}
                        onClick={() => { setActiveModule('tasks'); setSelectedTaskId(task.id); }}
                        className="p-2.5 rounded-xl bg-[#23232a] border border-white/5 hover:border-amber-500/40 flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleTask(task.id); }}
                            className="w-4 h-4 rounded-full border border-slate-500 hover:border-amber-400 flex items-center justify-center shrink-0"
                          >
                            {task.completed && <Check size={10} className="text-amber-400" />}
                          </button>
                          <span className="text-xs font-medium text-slate-200 truncate">{task.title}</span>
                        </div>
                        {task.dueDate && (
                          <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded shrink-0">
                            {task.dueDate}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Quadrant III: Delegate */}
              <div className="bg-[#1b1b20] border border-blue-500/30 rounded-2xl p-4 flex flex-col shadow-lg shadow-blue-950/20">
                <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold">
                      III
                    </span>
                    <h3 className="text-sm font-bold text-blue-400">Delegate</h3>
                    <span className="text-xs text-slate-500 font-semibold">(Urgent & Not Important)</span>
                  </div>
                  <span className="text-xs font-semibold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
                    {data.tasks.filter(t => !t.completed && t.quadrant === 'delegate').length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[320px]">
                  {data.tasks
                    .filter(t => !t.completed && t.quadrant === 'delegate')
                    .map(task => (
                      <div
                        key={task.id}
                        onClick={() => { setActiveModule('tasks'); setSelectedTaskId(task.id); }}
                        className="p-2.5 rounded-xl bg-[#23232a] border border-white/5 hover:border-blue-500/40 flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleTask(task.id); }}
                            className="w-4 h-4 rounded-full border border-slate-500 hover:border-blue-400 flex items-center justify-center shrink-0"
                          >
                            {task.completed && <Check size={10} className="text-blue-400" />}
                          </button>
                          <span className="text-xs font-medium text-slate-200 truncate">{task.title}</span>
                        </div>
                        {task.dueDate && (
                          <span className="text-[10px] text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded shrink-0">
                            {task.dueDate}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Quadrant IV: Pranav Bill and Quotes */}
              <div className="bg-[#1b1b20] border border-emerald-500/30 rounded-2xl p-4 flex flex-col shadow-lg shadow-emerald-950/20">
                <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                      IV
                    </span>
                    <h3 className="text-sm font-bold text-emerald-400">Pranav Bill and Quotes</h3>
                    <span className="text-xs text-slate-500 font-semibold">(Not Urgent & Administrative)</span>
                  </div>
                  <span className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                    {data.tasks.filter(t => !t.completed && t.quadrant === 'bills_quotes').length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[320px]">
                  {data.tasks
                    .filter(t => !t.completed && t.quadrant === 'bills_quotes')
                    .map(task => (
                      <div
                        key={task.id}
                        onClick={() => { setActiveModule('tasks'); setSelectedTaskId(task.id); }}
                        className="p-2.5 rounded-xl bg-[#23232a] border border-white/5 hover:border-emerald-500/40 flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleTask(task.id); }}
                            className="w-4 h-4 rounded-full border border-slate-500 hover:border-emerald-400 flex items-center justify-center shrink-0"
                          >
                            {task.completed && <Check size={10} className="text-emerald-400" />}
                          </button>
                          <span className="text-xs font-medium text-slate-200 truncate">{task.title}</span>
                        </div>
                        {task.dueDate && (
                          <span className="text-[10px] text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded shrink-0">
                            {task.dueDate}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ------------------------------------------------------- */}
        {/* MODULE 3: CALENDAR VIEW (Image 3) */}
        {/* ------------------------------------------------------- */}
        {activeModule === 'calendar' && (
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <CalendarIcon className="text-blue-400" size={20} />
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][calendarMonth]}, {calendarYear}
                </h2>
                <div className="flex items-center gap-1 bg-[#222228] border border-white/10 rounded-lg p-1 text-xs">
                  <button
                    onClick={() => {
                      if (calendarMonth === 0) {
                        setCalendarMonth(11);
                        setCalendarYear(y => y - 1);
                      } else {
                        setCalendarMonth(m => m - 1);
                      }
                    }}
                    className="p-1 rounded hover:bg-white/10 text-slate-300 transition cursor-pointer"
                    title="Previous Month"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setCalendarMonth(9);
                      setCalendarYear(2026);
                    }}
                    className="px-2.5 py-1 rounded bg-blue-600 text-white font-medium shadow cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      if (calendarMonth === 11) {
                        setCalendarMonth(0);
                        setCalendarYear(y => y + 1);
                      } else {
                        setCalendarMonth(m => m + 1);
                      }
                    }}
                    className="p-1 rounded hover:bg-white/10 text-slate-300 transition cursor-pointer"
                    title="Next Month"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadIcs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#222228] hover:bg-[#2c2c34] text-xs font-medium text-slate-300 transition cursor-pointer border border-white/5"
                  title="Download standard RFC 5545 iCalendar feed"
                >
                  <Download size={13} /> Export .ics
                </button>
                <button
                  onClick={() => setShowCalendarSyncModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-[0_0_15px_rgba(37,99,235,0.4)] transition cursor-pointer"
                >
                  <CalendarCheck size={14} /> Sync Google & Zoho Calendar
                </button>
              </div>
            </div>

            {/* 7-Day Columns Header */}
            <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/10 rounded-t-xl text-center py-2 text-xs font-semibold text-slate-400">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 flex-1 gap-px bg-white/5 border-x border-b border-white/10 rounded-b-xl overflow-y-auto custom-scrollbar">
              {calendarDays.map((cd, idx) => {
                const dayTasks = cd.dateStr ? (tasksByDate[cd.dateStr] || []) : [];
                const isToday = cd.dateStr === todayStr;

                return (
                  <div
                    key={idx}
                    className={`min-h-[90px] p-2 bg-[#17171a] flex flex-col transition ${
                      !cd.currentMonth ? 'opacity-25' : 'hover:bg-[#1c1c20]'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-xs font-bold ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center'
                          : 'text-slate-400'
                      }`}>
                        {cd.day || ''}
                      </span>
                    </div>

                    <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar max-h-[70px]">
                      {dayTasks.map(t => (
                        <div
                          key={t.id}
                          onClick={() => { setActiveModule('tasks'); setSelectedTaskId(t.id); }}
                          className={`text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer font-medium ${
                            t.completed
                              ? 'bg-slate-800 text-slate-500 line-through'
                              : t.priority === 'High'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}
                          title={t.title}
                        >
                          {t.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- */}
        {/* MODULE 4: POMODORO & STOPWATCH (Image 2) */}
        {/* ------------------------------------------------------- */}
        {activeModule === 'pomo' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Timer Panel */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 border-r border-white/5 bg-[#161619]">
              {/* Header Toggle */}
              <div className="flex items-center p-1 bg-[#242429] border border-white/10 rounded-xl mb-10 text-xs">
                <button
                  onClick={() => { setPomoMode('pomo'); setPomoSeconds(25 * 60); setPomoRunning(false); }}
                  className={`px-4 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    pomoMode === 'pomo' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pomo
                </button>
                <button
                  onClick={() => { setPomoMode('stopwatch'); setPomoSeconds(0); setPomoRunning(false); }}
                  className={`px-4 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    pomoMode === 'stopwatch' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Stopwatch
                </button>
              </div>

              {/* Task Selector */}
              <div className="mb-6 flex items-center gap-2 text-xs text-slate-400">
                <span>Focus Target:</span>
                <select
                  value={pomoTaskTitle}
                  onChange={(e) => setPomoTaskTitle(e.target.value)}
                  className="bg-[#222228] border border-white/10 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none"
                >
                  <option value="">General Focus</option>
                  {data.tasks.filter(t => !t.completed).map(t => (
                    <option key={t.id} value={t.title}>{t.title}</option>
                  ))}
                </select>
              </div>

              {/* Circular Timer Display */}
              <div className="relative w-72 h-72 rounded-full border-4 border-blue-500/30 flex items-center justify-center shadow-[0_0_50px_rgba(37,99,235,0.15)] mb-10">
                <div className="text-5xl font-black tracking-tight text-white font-mono">
                  {formatPomoTime(pomoSeconds)}
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setPomoRunning(!pomoRunning)}
                  className={`px-8 py-3 rounded-full text-sm font-bold shadow-lg transition transform active:scale-95 cursor-pointer ${
                    pomoRunning
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25'
                  }`}
                >
                  {pomoRunning ? 'Pause' : 'Start'}
                </button>
                <button
                  onClick={() => { setPomoRunning(false); setPomoSeconds(pomoMode === 'pomo' ? 25 * 60 : 0); }}
                  className="p-3 rounded-full bg-[#242429] hover:bg-[#2d2d33] text-slate-400 hover:text-white transition cursor-pointer"
                  title="Reset Timer"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>

            {/* Right Overview & History Panel */}
            <div className="w-80 shrink-0 bg-[#141416] p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <h3 className="text-base font-bold text-white mb-4">Overview</h3>

              <div className="grid grid-cols-2 gap-3 mb-8">
                <div className="bg-[#1e1e24] border border-white/5 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 block mb-1">Today's Pomos</span>
                  <span className="text-2xl font-bold text-white">{data.pomoStats?.todayPomos || 0}</span>
                </div>
                <div className="bg-[#1e1e24] border border-white/5 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 block mb-1">Today's Duration</span>
                  <span className="text-2xl font-bold text-white">{data.pomoStats?.todayMinutes || 0}<span className="text-xs font-normal text-slate-400 ml-1">m</span></span>
                </div>
                <div className="bg-[#1e1e24] border border-white/5 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 block mb-1">Total Pomos</span>
                  <span className="text-2xl font-bold text-white">{data.pomoStats?.totalPomos || 0}</span>
                </div>
                <div className="bg-[#1e1e24] border border-white/5 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 block mb-1">Total Duration</span>
                  <span className="text-2xl font-bold text-white">{data.pomoStats?.totalMinutes || 0}<span className="text-xs font-normal text-slate-400 ml-1">m</span></span>
                </div>
              </div>

              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Focus Record</h4>
                <div className="space-y-2">
                  {(data.pomoStats?.records || []).map((rec, i) => (
                    <div key={i} className="p-3 rounded-lg bg-[#1a1a20] border border-white/5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-medium text-slate-200 truncate">{rec.taskTitle}</p>
                        <span className="text-[10px] text-slate-500">{rec.date}</span>
                      </div>
                      <span className="text-xs font-bold text-blue-400 shrink-0">{rec.duration}m</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- */}
        {/* MODULE 5: HABIT TRACKER (Image 5) */}
        {/* ------------------------------------------------------- */}
        {activeModule === 'habit' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Flame className="text-orange-400" size={22} /> Habit Tracker
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Build and maintain executive discipline with daily check-ins.
                </p>
              </div>
              <button
                onClick={() => setShowAddHabitModal(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition cursor-pointer shadow"
              >
                <Plus size={15} /> Add Habit
              </button>
            </div>

            {/* Current Week Header */}
            <div className="bg-[#1e1e24] border border-white/5 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-slate-400">Current Week</span>
                <span className="text-xs text-blue-400 font-medium">Monday, Oct 12 Today</span>
              </div>
              <div className="grid grid-cols-7 gap-2 text-center">
                {[
                  { name: 'Tue', date: '6', str: '2026-10-06' },
                  { name: 'Wed', date: '7', str: '2026-10-07' },
                  { name: 'Thu', date: '8', str: '2026-10-08' },
                  { name: 'Fri', date: '9', str: '2026-10-09' },
                  { name: 'Sat', date: '10', str: '2026-10-10' },
                  { name: 'Sun', date: '11', str: '2026-10-11' },
                  { name: 'Mon', date: '12', str: '2026-10-12', active: true },
                ].map(d => (
                  <div key={d.date} className={`p-2 rounded-xl ${d.active ? 'bg-blue-600/20 border border-blue-500/40' : 'bg-white/5'}`}>
                    <span className="text-[11px] text-slate-400 block">{d.name}</span>
                    <span className={`text-sm font-bold block mt-0.5 ${d.active ? 'text-blue-400' : 'text-slate-200'}`}>
                      {d.date}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Habits List */}
            <div className="space-y-3">
              {data.habits.map(habit => (
                <div
                  key={habit.id}
                  className="bg-[#1e1e24] border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-2xl">{habit.emoji}</span>
                    <div>
                      <h4 className="text-sm font-bold text-white">{habit.name}</h4>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span>⚡ {habit.streak || 0} Day Streak</span>
                        <span>•</span>
                        <span>🔥 {habit.bestStreak || 0} Day Best</span>
                      </div>
                    </div>
                  </div>

                  {/* 7-day interactive check-in bubbles */}
                  <div className="flex items-center gap-2">
                    {['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'].map(dateStr => {
                      const isDone = !!(habit.history && habit.history[dateStr]);
                      return (
                        <button
                          key={dateStr}
                          onClick={() => handleToggleHabitDay(habit.id, dateStr)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                            isDone
                              ? 'bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.5)]'
                              : 'bg-white/5 border border-white/10 hover:border-blue-400 text-transparent'
                          }`}
                          title={`Toggle check-in for ${dateStr}`}
                        >
                          <Check size={13} className={isDone ? 'opacity-100' : 'opacity-0'} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Habit Modal */}
            {showAddHabitModal && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1f1f25] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="text-base font-bold text-white mb-4">Create New Habit</h3>
                  <div className="space-y-3 mb-5">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Habit Name</label>
                      <input
                        type="text"
                        value={newHabitName}
                        onChange={(e) => setNewHabitName(e.target.value)}
                        placeholder="e.g. Read for 20 mins"
                        className="w-full bg-[#26262e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Emoji Icon</label>
                      <input
                        type="text"
                        value={newHabitEmoji}
                        onChange={(e) => setNewHabitEmoji(e.target.value)}
                        className="w-full bg-[#26262e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowAddHabitModal(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateHabit}
                      className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------- */}
        {/* MODULE 6: COUNTDOWN & MILESTONES (Image 4) */}
        {/* ------------------------------------------------------- */}
        {activeModule === 'countdown' && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Hourglass className="text-purple-400" size={22} /> Countdown & Milestones
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Key deadlines, anniversaries, and personal milestones.
                </p>
              </div>
              <button
                onClick={() => setShowAddCountdownModal(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition cursor-pointer shadow"
              >
                <Plus size={15} /> Add Countdown
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.countdowns.map(cd => {
                const diffDays = calculateDaysDiff(cd.targetDate, cd.type);
                return (
                  <div
                    key={cd.id}
                    className="bg-[#1e1e24] border border-white/5 hover:border-white/15 rounded-2xl p-6 shadow-xl flex flex-col justify-between transition"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xl">{cd.emoji}</span>
                      <h3 className="text-sm font-bold text-white truncate">{cd.title}</h3>
                    </div>

                    <div className="my-3 text-center">
                      <span className="text-5xl font-black text-blue-400 tracking-tight block">
                        {diffDays}
                      </span>
                      <span className="text-xs text-slate-400 font-medium mt-1 block">
                        {cd.type === 'since' ? `Days since ${cd.targetDate}` : `Days until ${cd.targetDate}`}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-white/5 flex justify-end">
                      <button
                        onClick={() => {
                          setData(prev => ({
                            ...prev,
                            countdowns: prev.countdowns.filter(c => c.id !== cd.id)
                          }));
                        }}
                        className="text-slate-500 hover:text-red-400 text-xs transition cursor-pointer"
                        title="Delete Milestone"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Countdown Modal */}
            {showAddCountdownModal && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1f1f25] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="text-base font-bold text-white mb-4">New Countdown Milestone</h3>
                  <div className="space-y-3 mb-5">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Event Title</label>
                      <input
                        type="text"
                        value={newCountdownTitle}
                        onChange={(e) => setNewCountdownTitle(e.target.value)}
                        placeholder="e.g. Q4 Strategy Review"
                        className="w-full bg-[#26262e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Target Date</label>
                      <input
                        type="date"
                        value={newCountdownDate}
                        onChange={(e) => setNewCountdownDate(e.target.value)}
                        className="w-full bg-[#26262e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Mode</label>
                      <select
                        value={newCountdownType}
                        onChange={(e) => setNewCountdownType(e.target.value)}
                        className="w-full bg-[#26262e] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none"
                      >
                        <option value="until">Countdown To (Days until)</option>
                        <option value="since">Milestone Since (Days since)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowAddCountdownModal(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateCountdown}
                      className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ========================================================= */}
      {/* QUICK SEARCH MODAL (Image 6) */}
      {/* ========================================================= */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1f1f25] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Search Input Bar */}
            <div className="p-4 border-b border-white/10 flex items-center gap-3">
              <Search size={18} className="text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Search tasks, tags, lists..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              <button onClick={() => setSearchOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1a20] border-b border-white/5 text-xs">
              {['Task', 'Tags', 'List'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setSearchTab(tab)}
                  className={`px-3 py-1 rounded-md transition ${
                    searchTab === tab ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search Results */}
            <div className="p-4 max-h-80 overflow-y-auto custom-scrollbar space-y-2">
              {searchKeyword.trim() === '' ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Enter keywords to search across your workspace
                </div>
              ) : (
                data.tasks
                  .filter(t => t.title.toLowerCase().includes(searchKeyword.toLowerCase()) || (t.notes && t.notes.toLowerCase().includes(searchKeyword.toLowerCase())))
                  .map(t => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setActiveModule('tasks');
                        setSelectedTaskId(t.id);
                        setSearchOpen(false);
                      }}
                      className="p-2.5 rounded-lg bg-[#26262e] hover:bg-[#2c2c36] flex items-center justify-between cursor-pointer transition"
                    >
                      <span className="text-xs text-slate-200 truncate">{t.title}</span>
                      <span className="text-[10px] text-slate-400">{t.list}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* NOTIFICATIONS & ACTIVITIES POPOVER (Image 7) */}
      {/* ========================================================= */}
      {notificationsOpen && (
        <div className="fixed top-20 left-16 z-50 w-72 bg-[#1f1f25] border border-white/10 rounded-2xl shadow-2xl p-4 animate-in fade-in duration-150">
          <div className="flex items-center p-1 bg-[#26262e] rounded-lg text-xs mb-4">
            <button
              onClick={() => setNotifTab('Notifications')}
              className={`flex-1 py-1 rounded font-medium transition ${
                notifTab === 'Notifications' ? 'bg-blue-600 text-white' : 'text-slate-400'
              }`}
            >
              Notifications
            </button>
            <button
              onClick={() => setNotifTab('Activities')}
              className={`flex-1 py-1 rounded font-medium transition ${
                notifTab === 'Activities' ? 'bg-blue-600 text-white' : 'text-slate-400'
              }`}
            >
              Activities
            </button>
          </div>

          <div className="text-center py-6 text-slate-500 text-xs">
            {notifTab === 'Notifications' ? (
              <p>No new notifications.<br />All executive tasks on schedule.</p>
            ) : (
              <div className="space-y-2 text-left">
                <p className="text-slate-300">✓ Checked in 3 habits today</p>
                <p className="text-slate-300">✓ Completed 2 pomodoros (50m)</p>
                <p className="text-slate-300">✓ 21 active tasks queued</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* GOOGLE & ZOHO CALENDAR INTEGRATION MODAL */}
      {/* ========================================================= */}
      {showCalendarSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1b1b22] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#15151b]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                  <CalendarCheck size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Google & Zoho Calendar Integration
                    <span className="text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                      Leader Exclusive
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Keep your external Google and Zoho calendars automatically in sync with Lextria tasks & dates.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowCalendarSyncModal(false); setTestResult(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Global Sync Status Bar */}
            <div className="px-5 py-3 bg-[#131317] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                {/* Google Calendar Status */}
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${data.calendarSync?.googleWebhookUrl ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-500'}`} />
                  <span className="text-slate-300 font-medium">Google Calendar:</span>
                  <span className={data.calendarSync?.googleWebhookUrl ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {data.calendarSync?.googleWebhookUrl ? 'Webhook Active' : 'Direct Link Ready'}
                  </span>
                </div>

                {/* Zoho Calendar Status */}
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${data.calendarSync?.zohoWebhookUrl ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-slate-500'}`} />
                  <span className="text-slate-300 font-medium">Zoho Calendar:</span>
                  <span className={data.calendarSync?.zohoWebhookUrl ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                    {data.calendarSync?.zohoWebhookUrl ? 'Webhook Active' : 'Direct Link Ready'}
                  </span>
                </div>
              </div>

              {/* Real-time Auto-Sync Toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={data.calendarSync?.autoSyncEnabled ?? true}
                  onChange={(e) => {
                    setData(prev => ({
                      ...prev,
                      calendarSync: { ...prev.calendarSync, autoSyncEnabled: e.target.checked }
                    }));
                  }}
                  className="rounded border-slate-600 text-blue-600 focus:ring-0 w-3.5 h-3.5 bg-[#202026]"
                />
                <span className="text-slate-300 text-xs">Auto-sync when task dates change</span>
              </label>
            </div>

            {/* Tabs Bar */}
            <div className="flex items-center gap-2 px-5 py-2.5 bg-[#18181f] border-b border-white/5 text-xs">
              {[
                { id: 'overview', label: 'Overview & Sync Feed' },
                { id: 'google', label: 'Google Calendar Setup' },
                { id: 'zoho', label: 'Zoho Calendar Setup' },
                { id: 'ical', label: 'iCalendar (.ics) Feed' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setCalendarSyncTab(tab.id); setTestResult(null); }}
                  className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                    calendarSyncTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              
              {/* TAB 1: OVERVIEW & SYNC FEED */}
              {calendarSyncTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Card 1: 1-Click Direct Links */}
                    <div className="bg-[#202028] border border-white/5 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs">
                        <ExternalLink size={14} /> 1-Click Task Reflect
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Every task with a due date has direct Google and Zoho calendar buttons to reflect into your calendar with title, notes, and quadrant.
                      </p>
                      <div className="pt-1 flex gap-2">
                        <a
                          href="https://calendar.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] bg-blue-600/20 text-blue-300 px-2 py-1 rounded hover:bg-blue-600/30 transition flex items-center gap-1"
                        >
                          <ExternalLink size={9} /> Google Cal
                        </a>
                        <a
                          href="https://calendar.zoho.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] bg-amber-600/20 text-amber-300 px-2 py-1 rounded hover:bg-amber-600/30 transition flex items-center gap-1"
                        >
                          <ExternalLink size={9} /> Zoho Cal
                        </a>
                      </div>
                    </div>

                    {/* Card 2: Real-Time Webhook Sync */}
                    <div className="bg-[#202028] border border-white/5 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                        <Send size={14} /> Automated Real-Time Sync
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Attach a Google Apps Script Web App or Zoho Flow webhook. Tasks auto-sync whenever titles, dates, or priorities are modified.
                      </p>
                      <button
                        onClick={() => setCalendarSyncTab('google')}
                        className="text-[10px] text-emerald-300 hover:underline pt-1 block cursor-pointer"
                      >
                        Configure Webhooks →
                      </button>
                    </div>

                    {/* Card 3: Standard .ics Feed */}
                    <div className="bg-[#202028] border border-white/5 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs">
                        <Download size={14} /> RFC 5545 iCalendar Feed
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Export all scheduled tasks into standard <code>.ics</code> format. Compatible with Google, Zoho, Outlook, and Apple Calendar.
                      </p>
                      <button
                        onClick={handleDownloadIcs}
                        className="text-[10px] bg-purple-600/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-600/30 transition flex items-center gap-1 cursor-pointer"
                      >
                        <Download size={9} /> Download .ics
                      </button>
                    </div>
                  </div>

                  {/* Recent Sync History */}
                  <div className="bg-[#17171d] border border-white/5 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-white mb-2 flex items-center justify-between">
                      <span>Recent Calendar Sync Activity</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        Last synced: {data.calendarSync?.lastSyncedAt ? new Date(data.calendarSync.lastSyncedAt).toLocaleString() : 'Never'}
                      </span>
                    </h4>
                    
                    {(!data.calendarSync?.syncHistory || data.calendarSync.syncHistory.length === 0) ? (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        No calendar synchronization events recorded yet. Connect a webhook or update a task with a date to initiate sync.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                        {data.calendarSync.syncHistory.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-[#202026] text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCheck size={13} className="text-emerald-400 shrink-0" />
                              <span className="text-slate-200 truncate">{item.taskTitle}</span>
                              <span className="text-[10px] text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0">{item.dueDate}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-slate-400">{item.targets.join(', ')}</span>
                              <span className="text-[10px] text-slate-500">{item.time}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: GOOGLE CALENDAR SETUP */}
              {calendarSyncTab === 'google' && (
                <div className="space-y-4">
                  <div className="bg-[#202028] border border-blue-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-2">
                        Google Calendar Webhook URL (Google Apps Script Web App)
                      </label>
                      <button
                        onClick={copyScriptToClipboard}
                        className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {copiedScript ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        {copiedScript ? 'Copied Script!' : 'Copy Apps Script Code'}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={data.calendarSync?.googleWebhookUrl || ''}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          setData(prev => ({
                            ...prev,
                            calendarSync: { ...prev.calendarSync, googleWebhookUrl: val }
                          }));
                        }}
                        placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                        className="flex-1 bg-[#17171d] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <button
                        onClick={() => handleTestWebhook('google')}
                        disabled={testingWebhook || !data.calendarSync?.googleWebhookUrl}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                      >
                        {testingWebhook ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        Test
                      </button>
                    </div>

                    {testResult && (
                      <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                        testResult.type === 'success' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'
                      }`}>
                        {testResult.type === 'success' ? <Check size={14} /> : <X size={14} />}
                        <span>{testResult.message}</span>
                      </div>
                    )}
                  </div>

                  {/* 3 Step Deployment Guide */}
                  <div className="bg-[#17171d] border border-white/5 rounded-xl p-4 space-y-3 text-xs">
                    <h4 className="font-bold text-white flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-400" /> 1-Minute Automated Setup Guide:
                    </h4>
                    <ol className="space-y-2 list-decimal list-inside text-slate-300 leading-relaxed">
                      <li>
                        Open <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline font-medium">script.google.com</a> under Pranav's Google account and click <strong>New project</strong>.
                      </li>
                      <li>
                        Click the <strong>Copy Apps Script Code</strong> button above, paste it into the editor, and press <kbd className="bg-[#24242e] px-1 py-0.5 rounded text-[10px]">Ctrl+S</kbd>.
                      </li>
                      <li>
                        Click <strong>Deploy</strong> (top right) → <strong>New deployment</strong> → Select type <strong>Web app</strong>.
                      </li>
                      <li>
                        Set <em>Execute as:</em> <strong>Me</strong> and <em>Who has access:</em> <strong>Anyone</strong>, then click <strong>Deploy</strong>.
                      </li>
                      <li>
                        Copy the resulting <strong>Web app URL</strong>, paste it into the input field above, and click <strong>Test</strong>. All task updates with dates will now automatically reflect in Google Calendar in real-time!
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {/* TAB 3: ZOHO CALENDAR SETUP */}
              {calendarSyncTab === 'zoho' && (
                <div className="space-y-4">
                  <div className="bg-[#202028] border border-amber-500/20 rounded-xl p-4 space-y-3">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      Zoho Calendar Webhook URL (Zoho Flow / Zoho Webhook)
                    </label>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={data.calendarSync?.zohoWebhookUrl || ''}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          setData(prev => ({
                            ...prev,
                            calendarSync: { ...prev.calendarSync, zohoWebhookUrl: val }
                          }));
                        }}
                        placeholder="https://flow.zoho.com/api/v1/webhook/... or Zoho webhook URL"
                        className="flex-1 bg-[#17171d] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                      />
                      <button
                        onClick={() => handleTestWebhook('zoho')}
                        disabled={testingWebhook || !data.calendarSync?.zohoWebhookUrl}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                      >
                        {testingWebhook ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        Test
                      </button>
                    </div>

                    {testResult && (
                      <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                        testResult.type === 'success' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'
                      }`}>
                        {testResult.type === 'success' ? <Check size={14} /> : <X size={14} />}
                        <span>{testResult.message}</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-[#17171d] border border-white/5 rounded-xl p-4 space-y-3 text-xs text-slate-300 leading-relaxed">
                    <h4 className="font-bold text-white flex items-center gap-1.5">
                      <Globe size={14} className="text-amber-400" /> Zoho Calendar Integration Options:
                    </h4>
                    <ul className="space-y-2 list-disc list-inside">
                      <li>
                        <strong>Direct 1-Click Link:</strong> Click <em>Zoho Cal</em> on any task in the task detail drawer to immediately open Zoho Calendar with title, date, and description prefilled.
                      </li>
                      <li>
                        <strong>Automated Zoho Flow:</strong> In Zoho Flow (<a href="https://flow.zoho.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">flow.zoho.com</a>), create a Flow with trigger <em>Webhook</em> and action <em>Zoho Calendar → Create Event</em>. Paste the generated webhook endpoint above.
                      </li>
                      <li>
                        <strong>Zoho Calendar ICS Import:</strong> In <a href="https://calendar.zoho.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">calendar.zoho.com</a>, go to <em>Settings → Import</em> and upload your exported <code>.ics</code> file.
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* TAB 4: ICALENDAR (.ICS) FEED */}
              {calendarSyncTab === 'ical' && (
                <div className="space-y-4">
                  <div className="bg-[#202028] border border-purple-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">RFC 5545 iCalendar Calendar File</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Download a standard calendar file containing all scheduled executive tasks from Pranav's workspace.
                        </p>
                      </div>
                      <button
                        onClick={handleDownloadIcs}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Download size={13} /> Download .ics File
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-[#17171d] border border-white/5 rounded-xl p-4 space-y-2">
                      <h5 className="font-bold text-blue-300">Google Calendar Import:</h5>
                      <ol className="space-y-1 list-decimal list-inside text-slate-400 text-[11px] leading-relaxed">
                        <li>Download the <code>.ics</code> file using the button above.</li>
                        <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Google Calendar</a>.</li>
                        <li>Click the gear icon (Settings) → <strong>Import & export</strong>.</li>
                        <li>Select the downloaded file and choose the destination calendar.</li>
                      </ol>
                    </div>

                    <div className="bg-[#17171d] border border-white/5 rounded-xl p-4 space-y-2">
                      <h5 className="font-bold text-amber-300">Zoho Calendar Import:</h5>
                      <ol className="space-y-1 list-decimal list-inside text-slate-400 text-[11px] leading-relaxed">
                        <li>Download the <code>.ics</code> file using the button above.</li>
                        <li>Open <a href="https://calendar.zoho.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">Zoho Calendar</a>.</li>
                        <li>Go to <strong>Settings</strong> (gear icon) → <strong>Import</strong>.</li>
                        <li>Upload the file to populate all events and milestones.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 bg-[#15151b] flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Lextria Executive Workspace • Pranav Bhat & Sharan
              </span>
              <button
                onClick={() => { setShowCalendarSyncModal(false); setTestResult(null); }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Floating Sync Toast */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#1e293b] border border-blue-500/40 text-white rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
          <CalendarCheck size={18} className="text-blue-400 shrink-0" />
          <span className="text-xs font-medium">{syncToast.message}</span>
          <button onClick={() => setSyncToast(null)} className="text-slate-400 hover:text-white ml-1 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

    </div>
  );
}

function CalendarDaysIcon({ size = 16, className = '' }) {
  return <CalendarIcon size={size} className={className} />;
}
