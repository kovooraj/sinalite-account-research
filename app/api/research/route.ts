import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { Account, ResearchResult, Verdict, Confidence } from '@/lib/types';

// Vercel: allow up to 30 seconds per account (requires Hobby+ plan)
export const maxDuration = 30;

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a business analyst for SinaLite, a Canadian wholesale commercial printing company. SinaLite sells to the trade ONLY — customers must be businesses that buy printed products to resell or use in client work.

Your task is to analyze account data and decide whether a business qualifies as a "print reseller."

═══ APPROVED — Print Resellers ═══
• Print brokers and print resellers
• Graphic designers and design studios
• Marketing agencies and advertising agencies
• Photographers who produce prints for clients
• Commercial printers, copy shops, quick-print centres
• Sign shops and large-format print companies
• Apparel printing, screen printing, and embroidery shops
• Packaging companies and box manufacturers
• Promotional product companies
• Event planners and event management companies that order printed collateral
• Trade show display and exhibit companies
• Photo labs and photo printing services

═══ NOT APPROVED — End-Users / Non-Resellers ═══
• Individuals buying for personal use
• Restaurants, cafes, and retail stores buying for their own operations only
• Medical clinics, law firms, accountants, financial advisors buying for internal use
• Non-profits with no print resale activity
• Real estate agents (unless running a design/print side business)

═══ ANALYSIS RULES ═══
1. Treat the self-declared "Business Type" as a HINT ONLY — it is often wrong.
2. Email domain is a strong signal:
   - Business domain (e.g., @365design.com, @quickprints.ca) → positive
   - Personal domain (gmail, yahoo, hotmail, outlook, icloud) → negative signal, not disqualifying alone
3. Website / email domain name is a strong signal (e.g., printserve.com, designco.ca, signsbysarah.com).
4. Company name is a strong signal (e.g., "XYZ Printing", "ABC Design Studio", "QuickSigns").
5. Address / city context can help (e.g., industrial area suggests a printer; suburban home address suggests consumer).
6. When signals are weak, sparse, or contradictory → classify as "uncertain" with low/medium confidence.
7. A Gmail address + no website + vague company name → almost certainly "uncertain" or review manually.

═══ OUTPUT FORMAT ═══
Return ONLY a valid JSON object. No markdown code fences, no extra text, no explanation outside the JSON.

{
  "verdict": "reseller" | "not_reseller" | "uncertain",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2–3 sentence explanation of the verdict based on the signals",
  "businessDescription": "One sentence describing what this business appears to do",
  "keySignals": ["signal 1", "signal 2", "signal 3"]
}`;

// ── Build user message ────────────────────────────────────────────────────────
function buildPrompt(account: Account): string {
  const knownKeys = ['id', 'name', 'firstName', 'lastName', 'company', 'email', 'website', 'address', 'city', 'province', 'country', 'postalCode', 'businessType', 'phone'];

  const addressParts = [account.address, account.city, account.province, account.postalCode, account.country].filter(Boolean).join(', ');

  const lines: string[] = [];
  if (account.company) lines.push(`Company: ${account.company}`);
  if (account.name) lines.push(`Contact Name: ${account.name}`);
  if (account.email) lines.push(`Email: ${account.email}`);
  if (account.website) lines.push(`Website: ${account.website}`);
  if (addressParts) lines.push(`Address: ${addressParts}`);
  if (account.phone) lines.push(`Phone: ${account.phone}`);
  if (account.businessType) lines.push(`Self-Declared Business Type (hint only): ${account.businessType}`);

  // Append any extra columns from the CSV we don't explicitly know about
  for (const [key, val] of Object.entries(account)) {
    if (val && !knownKeys.includes(key)) {
      lines.push(`${key}: ${val}`);
    }
  }

  if (lines.length === 0) {
    lines.push('(No account data provided)');
  }

  return `Analyze this SinaLite account and determine if they qualify as a print reseller:\n\n${lines.join('\n')}\n\nReturn your JSON verdict only.`;
}

// ── Parse Claude's response ───────────────────────────────────────────────────
function parseVerdict(text: string, account: Account): ResearchResult {
  // Find JSON object in response (in case Claude adds any surrounding text)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in Claude response: "${text.slice(0, 200)}"`);

  const parsed = JSON.parse(jsonMatch[0]);

  const validVerdicts: Verdict[] = ['reseller', 'not_reseller', 'uncertain'];
  const validConfidences: Confidence[] = ['high', 'medium', 'low'];

  return {
    account,
    verdict: validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'uncertain',
    confidence: validConfidences.includes(parsed.confidence) ? parsed.confidence : 'low',
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided.',
    businessDescription: typeof parsed.businessDescription === 'string' ? parsed.businessDescription : 'Unknown.',
    keySignals: Array.isArray(parsed.keySignals) ? parsed.keySignals.map(String) : [],
  };
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server is missing ANTHROPIC_API_KEY. Contact the admin.' },
      { status: 500 }
    );
  }

  let account: Account;
  try {
    ({ account } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!account || typeof account !== 'object') {
    return NextResponse.json({ error: 'Account data is required.' }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(account) }],
    });

    const textBlock = response.content.find(c => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no text content.');
    }

    const result = parseVerdict(textBlock.text, account);
    return NextResponse.json(result);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('401') || message.toLowerCase().includes('authentication') || message.toLowerCase().includes('unauthorized')) {
      return NextResponse.json({ error: 'Server-side API key was rejected by Anthropic. Contact the admin.' }, { status: 401 });
    }
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return NextResponse.json({ error: 'Claude rate limit hit. Please wait 10 seconds and try again.' }, { status: 429 });
    }
    if (message.includes('529') || message.toLowerCase().includes('overloaded')) {
      return NextResponse.json({ error: 'Claude is temporarily overloaded. Please try again in a moment.' }, { status: 503 });
    }

    console.error('[research route] Error:', message);
    return NextResponse.json({ error: `Research failed: ${message}` }, { status: 500 });
  }
}
