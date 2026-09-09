import 'dotenv/config';
import { readFileSync } from 'fs';
import { read, utils } from 'xlsx';

const RULES_PATH = new URL('../config/classification-rules.xlsx', import.meta.url);

export function loadEnv() {
  const required = ['ANTHROPIC_API_KEY', 'IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_APP_PASSWORD'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required .env values: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  }

  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    imap: {
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT),
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_APP_PASSWORD
    }
  };
}

// Reads config/classification-rules.xlsx and returns the rule rows.
// This is the only place that knows about the spreadsheet layout - if the
// team's categories/roles change, only this file (or the spreadsheet) needs editing.
export function loadClassificationRules() {
  const buffer = readFileSync(RULES_PATH);
  const workbook = read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // header row is row 4 in the spreadsheet (rows 1-2 are title/instructions, row 3 is blank)
  const rows = utils.sheet_to_json(sheet, { range: 3, defval: '' });

  const rules = rows
    .filter((row) => row['Category'])
    .map((row) => ({
      category: String(row['Category']).trim(),
      assignedTo: String(row['Assigned to']).trim(),
      initial: String(row['Initial']).trim(),
      defaultUrgency: String(row['Default urgency']).trim()
    }));

  if (rules.length === 0) {
    throw new Error(`No classification rules found in ${RULES_PATH.pathname}. Check the spreadsheet still has its header row.`);
  }

  return rules;
}
