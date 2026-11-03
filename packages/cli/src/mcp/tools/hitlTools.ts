import { z } from 'zod';
import type { MissionAgent } from '../agent';
import { type DefineTool, riskCategory, waitControl } from '../toolKit';

/** Human-in-the-loop tools: ask, wait, inbox, answer. */
export function registerHitlTools(tool: DefineTool, agent: MissionAgent) {
  tool(
    'ask_human',
    {
      title: 'Ask the human',
      description:
        'Ask the human a question. It lands in the command center inbox (Waiting on you) and this call waits for the answer, up to waitSeconds (default 600; 50 for Codex). Returns answered=false with a questionId on timeout: call wait_for_answer to keep waiting. Set framing=true for the framing questions of a mission that does not exist yet.',
    },
    {
      question: z.string().min(1),
      suggestions: z.array(z.string()).optional().describe('Suggested replies, shown as one-click answers.'),
      waitSeconds: z.number().int().min(0).max(86_400).optional(),
      framing: z.boolean().optional(),
      category: riskCategory.optional(),
    },
    (a, extra) => agent.ask(a, waitControl(extra)),
  );

  tool(
    'wait_for_answer',
    {
      title: 'Wait for an answer',
      description: 'Keep waiting for the answer to a question asked with ask_human.',
      readOnly: true,
    },
    { questionId: z.string(), waitSeconds: z.number().int().min(0).max(86_400).optional() },
    (a, extra) => agent.waitForAnswer(a, waitControl(extra)),
  );

  tool(
    'list_inbox',
    {
      title: 'Inbox',
      description: 'Questions from every connected agent that are waiting on the human, oldest first.',
      readOnly: true,
    },
    {},
    () => agent.inbox(),
  );

  tool(
    'answer_question',
    {
      title: 'Answer a question',
      description:
        "Answer a waiting question on the human's behalf, with the human's own words from this chat. Only use text the human gave you.",
    },
    { questionId: z.string(), answer: z.string().min(1) },
    (a) => agent.answerQuestion(a),
  );
}
