import { existsSync, appendFileSync, writeFileSync } from 'fs';

const LOG_PATH = new URL('../data/activity-log.csv', import.meta.url);
const HEADER = 'timestamp,uid,from,subject,category,assigned_to,urgency,reasoning\n';

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function ensureLogExists() {
  if (!existsSync(LOG_PATH)) {
    writeFileSync(LOG_PATH, HEADER);
  }
}

export function logClassification(email, result) {
  ensureLogExists();
  const row = [
    new Date().toISOString(),
    email.uid,
    email.from,
    email.subject,
    result.category,
    result.assignedTo,
    result.urgency,
    result.reasoning
  ]
    .map(csvEscape)
    .join(',');
  appendFileSync(LOG_PATH, row + '\n');
}
