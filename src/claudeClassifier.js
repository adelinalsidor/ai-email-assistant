import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';

const MODEL = 'claude-sonnet-5';
const URGENCY_LEVELS = ['urgent', 'today', 'can wait'];

function buildSchema(categories) {
  return {
    type: 'object',
    properties: {
      category: { type: 'string', enum: categories },
      urgency: { type: 'string', enum: URGENCY_LEVELS },
      reasoning: {
        type: 'string',
        description: 'One short sentence explaining the category and urgency choice.'
      }
    },
    required: ['category', 'urgency', 'reasoning']
  };
}

function buildPrompt(rules, email) {
  const rulesTable = rules
    .map((r) => `- "${r.category}" -> handled by ${r.assignedTo} (typically ${r.defaultUrgency})`)
    .join('\n');

  return `You triage incoming email for a shared team inbox at a logistics company.

Here is how the team currently splits the work (a starting point, not a rigid rule):
${rulesTable}

For the email below:
1. Pick the single closest category from the list above. If nothing fits, use "Other / unclear".
2. Judge urgency (urgent / today / can wait) from what the email actually says, not just
   from the category's typical default above - the same category can have very different
   urgency depending on the content. A complaint that says "no rush" is not urgent. A quote
   request with a same-day deadline is not "can wait".
3. Give one short sentence of reasoning.

Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}`;
}

export function createClassifier(apiKey, rules) {
  const client = new Anthropic({ apiKey });
  const categories = [...new Set(rules.map((r) => r.category))];
  if (!categories.includes('Other / unclear')) categories.push('Other / unclear');
  const schema = buildSchema(categories);

  const ruleByCategory = new Map(rules.map((r) => [r.category, r]));
  const fallbackRule = rules.find((r) => r.category === 'Other / unclear') ?? rules[rules.length - 1];

  return async function classifyEmail(email) {
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: buildPrompt(rules, email) }],
      output_config: { format: jsonSchemaOutputFormat(schema) }
    });

    const result = message.parsed_output;
    const matchedRule = ruleByCategory.get(result.category) ?? fallbackRule;

    return {
      category: result.category,
      urgency: result.urgency,
      reasoning: result.reasoning,
      assignedTo: matchedRule.assignedTo,
      initial: matchedRule.initial
    };
  };
}
