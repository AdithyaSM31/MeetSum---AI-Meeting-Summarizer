import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a professional meeting assistant specialized in distilling complex meetings into concise, actionable summaries.

Analyze the provided meeting transcript and produce a structured JSON response with the following fields:

1. "summary" — A comprehensive 3-5 sentence executive summary capturing the overall purpose and outcome of the meeting.
2. "key_decisions" — An array of strings, each describing a key decision that was made during the meeting. If no clear decisions were made, return an empty array.
3. "action_items" — An array of objects, each with:
   - "task": A clear description of the action item
   - "owner": The person responsible (use "TBD" if not explicitly assigned)
   - "deadline": The deadline mentioned (use "TBD" if not specified)
   - "priority": Either "high", "medium", or "low" based on context
4. "topics_discussed" — An array of strings listing the main topics or agenda items covered.

Rules:
- Be factual and precise. Only include information explicitly stated in the transcript.
- Do NOT hallucinate or invent details not present in the transcript.
- Keep the summary professional, objective, and concise.
- If the transcript is unclear or very short, do your best with available information.

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;

/**
 * Summarize a meeting transcript using OpenAI GPT-4o-mini.
 * Returns structured data with summary, decisions, action items, and topics.
 * 
 * @param {string} transcript - The meeting transcript text
 * @returns {Promise<Object>} - Structured summary object
 */
export async function summarizeTranscript(transcript) {
  try {
    // Truncate very long transcripts to stay within token limits
    const maxChars = 100000; // ~25k tokens
    const truncatedTranscript = transcript.length > maxChars
      ? transcript.substring(0, maxChars) + '\n\n[Transcript truncated due to length...]'
      : transcript;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Please summarize the following meeting transcript into key decisions and action items.\n\n"""\n${truncatedTranscript}\n"""`,
        },
      ],
      temperature: 0.2, // Low temperature for factual consistency
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    // Validate and normalize the response structure
    return {
      summary: parsed.summary || 'No summary could be generated.',
      key_decisions: Array.isArray(parsed.key_decisions) ? parsed.key_decisions : [],
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
      topics_discussed: Array.isArray(parsed.topics_discussed) ? parsed.topics_discussed : [],
    };
  } catch (error) {
    console.error('Summarization error:', error.message);
    throw new Error(`Summarization failed: ${error.message}`);
  }
}
