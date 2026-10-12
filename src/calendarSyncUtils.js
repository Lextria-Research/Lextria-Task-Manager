/**
 * Calendar Synchronization Utilities for Lextria Leader Taskboard (Pranav Bhat & Sharan)
 * Supports Google Calendar (Direct & Webhook), Zoho Calendar (Direct & Flow), and RFC 5545 iCalendar (.ics)
 */

/**
 * Generates direct Google Calendar URL to create/reflect an event in 1 click
 */
export function getGoogleCalendarUrl(task) {
  if (!task) return '';
  const date = task.dueDate || new Date().toISOString().split('T')[0];
  const dateCompact = date.replace(/-/g, '');
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayCompact = nextDay.toISOString().split('T')[0].replace(/-/g, '');
  const title = encodeURIComponent(`[Lextria] ${task.title || 'Task'}`);
  const details = encodeURIComponent(
    `${task.notes || ''}\n\nQuadrant: ${task.quadrant || 'Executive'}\nPriority: ${task.priority || 'Normal'}\nList: ${task.list || 'Inbox'}`
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateCompact}/${nextDayCompact}&details=${details}`;
}

/**
 * Generates direct Zoho Calendar URL to create/reflect an event in 1 click
 */
export function getZohoCalendarUrl(task) {
  if (!task) return '';
  const date = task.dueDate || new Date().toISOString().split('T')[0];
  const dateCompact = date.replace(/-/g, '');
  const title = encodeURIComponent(`[Lextria] ${task.title || 'Task'}`);
  const desc = encodeURIComponent(
    `${task.notes || ''}\n\nQuadrant: ${task.quadrant || 'Executive'}\nPriority: ${task.priority || 'Normal'}\nList: ${task.list || 'Inbox'}`
  );
  return `https://calendar.zoho.com/eventreq/add?title=${title}&date=${dateCompact}&desc=${desc}`;
}

/**
 * Exports all scheduled tasks into standard RFC 5545 iCalendar (.ics) format
 * Compatible with Google Calendar (Import/Subscribe) and Zoho Calendar
 */
export function generateICalendar(tasks = []) {
  const scheduledTasks = (tasks || []).filter(t => t.dueDate);
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lextria//Leader Taskboard//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lextria Leader Taskboard (Pranav Bhat)',
    'X-WR-TIMEZONE:Asia/Kolkata'
  ];

  scheduledTasks.forEach(task => {
    const dateCompact = task.dueDate.replace(/-/g, '');
    const nextDay = new Date(task.dueDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayCompact = nextDay.toISOString().split('T')[0].replace(/-/g, '');
    const uid = `${task.id || Math.random().toString(36).substring(2)}@lextria.internal`;
    const cleanTitle = (task.title || 'Untitled Task').replace(/[\\,;]/g, ' ');
    const cleanNotes = (task.notes || '').replace(/[\\,;]/g, ' ').replace(/\n/g, '\\n');
    const priority = task.priority === 'High' ? '1' : task.priority === 'Medium' ? '5' : '9';
    const status = task.completed ? 'COMPLETED' : 'NEEDS-ACTION';

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid}`);
    icsLines.push(`DTSTAMP:${now}`);
    icsLines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
    icsLines.push(`DTEND;VALUE=DATE:${nextDayCompact}`);
    icsLines.push(`SUMMARY:${cleanTitle}`);
    if (cleanNotes) icsLines.push(`DESCRIPTION:${cleanNotes}`);
    icsLines.push(`PRIORITY:${priority}`);
    icsLines.push(`STATUS:${status}`);
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');
  return icsLines.join('\r\n');
}

/**
 * Builds formatted webhook payload for background synchronization
 */
export function formatCalendarPayload(task, action = 'update') {
  return {
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
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// Google Apps Script to auto-sync Lextria Leader Tasks into Google Calendar
// 1. Go to https://script.google.com and click 'New Project'
// 2. Paste this code and save (Ctrl+S)
// 3. Click 'Deploy' -> 'New deployment' -> Select type 'Web app'
// 4. Set 'Execute as' to 'Me' and 'Who has access' to 'Anyone'
// 5. Copy the Web app URL and paste it into Lextria Leader Taskboard Calendar Sync settings!

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var task = data.task;
    var calendar = CalendarApp.getDefaultCalendar();
    
    var title = "[Lextria] " + task.title;
    var dateParts = task.dueDate.split('-');
    var eventDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    var description = (task.notes || "") + "\\nPriority: " + (task.priority || "Normal") + "\\nQuadrant: " + (task.quadrant || "") + "\\nList: " + (task.list || "Inbox");
    
    // Check if event already exists for today
    var existingEvents = calendar.getEventsForDay(eventDate, { search: task.title });
    if (existingEvents.length > 0) {
      existingEvents[0].setTitle(title);
      existingEvents[0].setDescription(description);
    } else {
      calendar.createAllDayEvent(title, eventDate, { description: description });
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", taskId: task.id })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
