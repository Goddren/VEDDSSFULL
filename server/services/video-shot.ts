/**
 * Turns whatever a user typed into ONE filmable shot for the text-to-video
 * model. Users paste scripts (HOOK/BEAT/CTA), multi-scene lists, ad briefs or
 * two-word topics; the video model can only film a single visual scene, so it
 * latched onto stray words and fell back to the generic style lock. Here the
 * AI keeps the user's subject, people, setting and action and rewrites it as
 * one concrete shot. The user can see and edit the shot before rendering.
 */
export interface PlannedShot { shot: string; hook: string; planned: boolean }

const MAX_SHOT_CHARS = 600;

/** Cheap fallback when no AI is available: strip script labels, keep the first visual-looking lines. */
export function fallbackShot(input: string): string {
  const lines = input
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(HOOK|BEAT\s*\d*|CTA|CAPTION|ON-SCREEN TEXT|SCENE\s*\d*|SHOW|VO|VOICEOVER)\s*(\([^)]*\))?\s*[:\-—]\s*/i, '').trim())
    .filter((l) => l && !/^#|https?:\/\//i.test(l));
  return (lines.join(' ') || input).slice(0, MAX_SHOT_CHARS);
}

export async function planVideoShot(input: string, userId?: number): Promise<PlannedShot> {
  const text = String(input || '').trim();
  if (!text) throw new Error('prompt is required');
  try {
    const { getUniversalAIClientForUser } = await import('../openai');
    const ai: any = await getUniversalAIClientForUser(userId || 0);
    const completion = await ai.chat.completions.create({
      model: ai.defaultModel || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You turn content ideas into a single shot description for a text-to-video model. Respond with JSON only.' },
        { role: 'user', content: `Turn the input below into ONE continuous 5-second vertical (9:16) video shot that a text-to-video model can film.

Rules:
- Keep the user's subject, people, place, objects and action. Do not swap in a different idea.
- If the input is a script, ad or list of scenes, pick the single most visual moment that carries its message.
- If the input is only a topic (e.g. "ORB strategy"), invent one concrete scene that shows it (a person, a place, what they are doing, what is on the screen in front of them).
- Describe only what the camera sees: subject, setting, action, camera angle/movement, lighting. 40-70 words, present tense.
- No on-screen text, captions, logos, brand names or readable words; describe screens as "a candlestick chart" not "a chart that says...".
- Do not add a style (film grain, colour grade): that is added later.

Also write "hook": the 3-8 word caption to overlay on the video, in the input's language.

Input:
"""${text.slice(0, 4000)}"""

JSON: {"shot":"...","hook":"..."}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
    });
    const raw = (completion.choices?.[0]?.message?.content || '{}').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const out = JSON.parse(raw || '{}');
    const shot = String(out.shot || '').trim();
    if (shot.length >= 20) return { shot: shot.slice(0, MAX_SHOT_CHARS), hook: String(out.hook || '').trim().slice(0, 80), planned: true };
  } catch (e: any) {
    console.warn('[video-shot] planning failed, using fallback:', e?.message || e);
  }
  return { shot: fallbackShot(text), hook: '', planned: false };
}
