import { loadEnv, loadClassificationRules } from './config.js';
import { connect, disconnect, fetchNewMessages, tagMessage } from './imapClient.js';
import { createClassifier } from './claudeClassifier.js';
import { logClassification } from './activityLog.js';
import { loadState, saveState } from './state.js';

async function main() {
  const { anthropicApiKey, imap } = loadEnv();
  const rules = loadClassificationRules();
  const classifyEmail = createClassifier(anthropicApiKey, rules);
  const state = loadState();

  console.log(`Connecting to ${imap.host} as ${imap.user}...`);
  const client = await connect(imap);
  console.log('Connected.');

  const summary = { urgent: 0, today: 0, 'can wait': 0 };
  let highestUidSeen = state.lastUid;

  try {
    console.log(`Fetching messages newer than uid ${state.lastUid}...`);
    const emails = await fetchNewMessages(client, state.lastUid, {
      onProgress: (msg) => console.log(`  ${msg}`)
    });
    console.log(`Found ${emails.length} new email(s).\n`);

    for (const email of emails) {
      console.log(`Classifying: "${email.subject}"...`);
      const result = await classifyEmail(email);
      summary[result.urgency] = (summary[result.urgency] ?? 0) + 1;
      highestUidSeen = Math.max(highestUidSeen, email.uid);

      console.log(`[${result.initial}] ${email.subject}`);
      console.log(`   -> ${result.category} / ${result.urgency} / ${result.assignedTo}`);
      console.log(`   -> ${result.reasoning}`);

      try {
        await tagMessage(client, email.uid, result);
      } catch (err) {
        console.warn(`   ! could not tag message ${email.uid} (server may not support custom keywords): ${err.message}`);
      }

      logClassification(email, result);
      console.log('');
    }

    console.log('--- Summary ---');
    console.log(`Urgent: ${summary.urgent} | Today: ${summary.today} | Can wait: ${summary['can wait']}`);
  } finally {
    try {
      await disconnect(client);
    } catch (err) {
      console.warn('(non-fatal) failed to close IMAP connection cleanly:', err.message);
    }
    saveState({ lastUid: highestUidSeen });
  }
}

main().catch((err) => {
  console.error('Run failed:', err);
  process.exit(1);
});
