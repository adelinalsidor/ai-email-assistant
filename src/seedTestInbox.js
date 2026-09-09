// Pushes the fake emails from test-data/sample-emails.json into the test mailbox's
// INBOX over IMAP, as if they had just arrived. Lets us test classification end-to-end
// without needing a second mailbox to actually send from.
import { readFileSync } from 'fs';
import { loadEnv } from './config.js';
import { connect, disconnect } from './imapClient.js';

const SAMPLE_EMAILS_PATH = new URL('../test-data/sample-emails.json', import.meta.url);

function toRawMessage(email) {
  return (
    `From: ${email.from}\r\n` +
    `To: ${process.env.IMAP_USER}\r\n` +
    `Subject: ${email.subject}\r\n` +
    `Date: ${new Date().toUTCString()}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    `${email.body}\r\n`
  );
}

async function main() {
  const { imap } = loadEnv();
  const emails = JSON.parse(readFileSync(SAMPLE_EMAILS_PATH, 'utf-8'));

  console.log(`Connecting to ${imap.host} as ${imap.user}...`);
  const client = await connect(imap);

  try {
    for (const email of emails) {
      const result = await client.append('INBOX', toRawMessage(email), [], new Date());
      console.log(`  [${email.id}] appended "${email.subject}" (uid ${result.uid})`);
    }
    console.log(`\nDone - ${emails.length} test emails added to INBOX.`);
  } finally {
    await disconnect(client);
  }
}

main().catch((err) => {
  console.error('Failed to seed test inbox:', err);
  process.exit(1);
});
