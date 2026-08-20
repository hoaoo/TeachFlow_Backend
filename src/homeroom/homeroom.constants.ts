export const HOMEROOM_RULES = {
  // Threshold for unexcused absences in the time window to flag attention
  UNEXCUSED_ABSENCE_THRESHOLD: 1,
  // Threshold for late arrivals in the time window to flag attention
  LATE_THRESHOLD: 2,
  // Threshold for behavior reminders in the time window to flag attention
  BEHAVIOR_REMINDER_THRESHOLD: 2,
  // Rolling time window in days for evaluating attendance and behavior signals
  ATTENTION_WINDOW_DAYS: 30,
  // Default days ahead for upcoming birthdays
  DEFAULT_BIRTHDAY_DAYS: 30,
};
