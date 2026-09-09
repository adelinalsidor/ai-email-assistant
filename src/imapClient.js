import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const URGENCY_KEYWORDS = {
  urgent: 'Urgent',
  today: 'Today',
  'can wait': 'CanWait'
};

export async function connect(imapConfig) {
  const client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: true,
    auth: { user: imapConfig.user, pass: imapConfig.pass },
    logger: false
  });
  await client.connect();
  return client;
}

// Fetches every message in INBOX with a UID greater than `sinceUid` - i.e. everything that
// arrived after the last time we processed the mailbox. Ignores the \Seen flag entirely, so
// a human reading a message in Thunderbird doesn't make it invisible to us.
// Fetches one message at a time (rather than one big multi-message command) - gentler on
// providers that are picky about bulk IMAP requests, and easier to see progress/where it breaks.
export async function fetchNewMessages(client, sinceUid, { onProgress } = {}) {
  const lock = await client.getMailboxLock('INBOX');
  const messages = [];
  try {
    const status = await client.status('INBOX', { uidNext: true });
    if (status.uidNext <= sinceUid + 1) {
      onProgress?.('No new messages since last run.');
      return messages;
    }

    const range = `${sinceUid + 1}:${status.uidNext - 1}`;
    onProgress?.(`Checking UID range ${range}...`);
    const uids = await client.search({ uid: range }, { uid: true });
    onProgress?.(`Found ${uids.length} new message(s): ${uids.join(', ')}`);

    for (const uid of uids) {
      onProgress?.(`Fetching message uid ${uid}...`);
      const message = await client.fetchOne(uid, { source: true }, { uid: true });
      const parsed = await simpleParser(message.source);
      messages.push({
        uid,
        from: parsed.from?.text ?? 'unknown sender',
        subject: parsed.subject ?? '(no subject)',
        body: parsed.text ?? ''
      });
    }
  } finally {
    lock.release();
  }
  return messages;
}

// Tags a message with who it's assigned to (by initial) and how urgent it is (by color-coded
// keyword). Both stay as IMAP keywords on the message in the shared Inbox - nothing gets moved.
// NOTE: not every IMAP server allows custom keywords. If this throws, the server likely only
// supports the standard flags (\Seen, \Answered, ...) - see README for the fallback plan.
export async function tagMessage(client, uid, { initial, urgency }) {
  const assignedKeyword = `Assigned-${initial}`;
  const urgencyKeyword = URGENCY_KEYWORDS[urgency] ?? 'Today';
  await client.messageFlagsAdd(uid, [assignedKeyword, urgencyKeyword], { uid: true });
}

export async function disconnect(client) {
  await client.logout();
}
