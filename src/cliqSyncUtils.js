// cliqSyncUtils.js
// Integration utilities for Zoho Cliq notifications & Shared Team Calendar

export const CLIQ_CONFIG_KEY = 'lextria_cliq_config';
export const SHARED_CALENDAR_KEY = 'lextria_shared_calendar_config';

export const DEFAULT_CLIQ_CONFIG = {
  webhookUrl: '',
  botName: 'Lextria Task Bot',
  notifyOnDeadlineSet: true,
  notifyOnDeadlineNear: true,
  lastNotifiedTasks: {} // { [taskId]: 'YYYY-MM-DD' }
};

export const DEFAULT_SHARED_CALENDAR_CONFIG = {
  calendarUrl: '', // e.g. https://calendar.google.com/... or https://calendar.zoho.com/...
  calendarType: 'google', // 'google' | 'zoho' | 'custom'
  title: 'Lextria Team Calendar'
};

export function getCliqConfig() {
  try {
    const saved = localStorage.getItem(CLIQ_CONFIG_KEY);
    if (saved) {
      return { ...DEFAULT_CLIQ_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load Cliq config:', e);
  }
  return DEFAULT_CLIQ_CONFIG;
}

export function saveCliqConfig(config) {
  try {
    localStorage.setItem(CLIQ_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Failed to save Cliq config:', e);
    return false;
  }
}

export function getSharedCalendarConfig() {
  try {
    const saved = localStorage.getItem(SHARED_CALENDAR_KEY);
    if (saved) {
      return { ...DEFAULT_SHARED_CALENDAR_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load shared calendar config:', e);
  }
  return DEFAULT_SHARED_CALENDAR_CONFIG;
}

export function saveSharedCalendarConfig(config) {
  try {
    localStorage.setItem(SHARED_CALENDAR_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Failed to save shared calendar config:', e);
    return false;
  }
}

/**
 * Dispatches a notification to Zoho Cliq incoming webhook
 * @param {Object} options
 * @param {Object} options.task - Task object
 * @param {string} options.memberName - Name of member who owns or updated task
 * @param {string} options.type - 'deadline_set' | 'deadline_near' | 'test'
 * @param {string} [options.customWebhookUrl] - Override URL (for testing in settings)
 */
export async function sendCliqNotification({ task, memberName = 'Team Member', type = 'deadline_set', customWebhookUrl = '' }) {
  const config = getCliqConfig();
  const webhookUrl = (customWebhookUrl || config.webhookUrl || '').trim();

  if (!webhookUrl) {
    return { success: false, message: 'No Zoho Cliq Webhook URL configured.' };
  }

  const title = task?.title || 'Untitled Task';
  const dueDate = task?.dueDate || task?.due_date || 'No deadline';
  const priority = task?.priority || 'Normal';
  const priorityEmoji = priority === 'High' ? '🔴' : priority === 'Medium' ? '🟡' : '🟢';

  let messageText = '';
  let cardTitle = '';

  if (type === 'test') {
    cardTitle = '🧪 Lextria Cliq Integration Test';
    messageText = `✅ *Zoho Cliq Connection Successful!*\n\nYour Lextria Task Manager notifications are now configured to post here. When members assign deadlines to tasks, or when deadlines are near, alerts will appear automatically.`;
  } else if (type === 'deadline_near') {
    cardTitle = '⏰ LEXTRIA DEADLINE APPROACHING';
    messageText = `⏰ *Task Deadline Approaching!*\n\n📌 *Task:* ${title}\n👤 *Assigned To:* ${memberName}\n📅 *Deadline:* ${dueDate}\n${priorityEmoji} *Priority:* ${priority}\n\n_Please ensure this task is prioritized for timely completion._`;
  } else {
    // deadline_set
    if (!config.notifyOnDeadlineSet) return { success: false, skipped: true };
    cardTitle = '📅 Lextria Task Deadline Scheduled';
    messageText = `📅 *New Deadline Assigned*\n\n📌 *Task:* ${title}\n👤 *Member:* ${memberName}\n📅 *Deadline:* ${dueDate}\n${priorityEmoji} *Priority:* ${priority}\n\n_Logged via Lextria Task Manager_`;
  }

  const payload = {
    text: messageText,
    card: {
      title: cardTitle,
      theme: type === 'deadline_near' ? 'modern-inline' : 'prompt'
    },
    bot: {
      name: config.botName || 'Lextria Task Bot'
    }
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return {
      success: res.ok,
      status: res.status,
      message: res.ok ? 'Notification sent to Zoho Cliq successfully' : `Cliq returned status ${res.status}`
    };
  } catch (err) {
    console.error('Zoho Cliq dispatch error:', err);
    return {
      success: false,
      error: err.message,
      message: 'Failed to send message to Zoho Cliq. Check network or webhook URL.'
    };
  }
}

/**
 * Checks all tasks across the workspace for approaching deadlines (due today or within 24h)
 * and dispatches Cliq notifications if not already notified today.
 */
export async function checkAndDispatchApproachingDeadlines(allTasks = [], allEmployees = []) {
  const config = getCliqConfig();
  if (!config.webhookUrl || !config.notifyOnDeadlineNear) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const lastNotified = { ...(config.lastNotifiedTasks || {}) };
  let hasUpdates = false;

  for (const task of allTasks) {
    if (!task || task.completed || !task.dueDate) continue;

    // Check if task is due today or tomorrow
    const isDueSoon = task.dueDate === todayStr || task.dueDate === tomorrowStr;
    if (!isDueSoon) continue;

    // Avoid duplicate notifications on the same date
    if (lastNotified[task.id] === todayStr) continue;

    const emp = allEmployees.find(e => e.id === task.agent_id);
    const memberName = emp?.name || 'Member';

    sendCliqNotification({
      task,
      memberName,
      type: 'deadline_near'
    });

    lastNotified[task.id] = todayStr;
    hasUpdates = true;
  }

  if (hasUpdates) {
    saveCliqConfig({ ...config, lastNotifiedTasks: lastNotified });
  }
}
