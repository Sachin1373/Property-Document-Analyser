import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface Clause {
  text: string;
  classification: 'Standard' | 'Unusual' | 'Red Flag';
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface ExtractedFields {
  parties: string[];
  propertyDescription: string;
  propertyAddress: string;
  transactionType: string;
  transactionValue: string;
  dates: { type: string; value: string }[];
  encumbrances: string[];
  missingFields: string[];
}

export interface AnalysisResult {
  extractedFields: ExtractedFields;
  clauses: Clause[];
  summary: string;
  overallRisk: 'Low' | 'Medium' | 'High';
}


const SYSTEM_PROMPT = `You are a legal document analysis engine specialising in Indian property law.

You will receive a section of a property document. Analyse it and return structured data.

OUTPUT FORMAT — CRITICAL:
- Wrap your entire JSON response in <result> and </result> tags.
- Inside those tags, output ONLY a valid JSON object — no prose, no markdown, no code fences.
- Do not output anything outside the <result> tags.

The JSON must follow this exact schema:

<result>
{
  "extractedFields": {
    "parties": [],
    "propertyDescription": "",
    "propertyAddress": "",
    "transactionType": "",
    "transactionValue": "",
    "dates": [],
    "encumbrances": [],
    "missingFields": []
  },
  "clauses": [],
  "summary": "",
  "overallRisk": "Low"
}
</result>

Field definitions:
- parties: array of strings — names of all parties (buyer, seller, witnesses, etc.)
- propertyDescription: physical description of the property (plot/survey number, area, boundaries)
- propertyAddress: full postal address of the property
- transactionType: e.g. "Sale Deed", "Lease Agreement", "Mortgage Deed"
- transactionValue: consideration amount in INR as a string
- dates: array of { "type": "...", "value": "..." } objects (execution date, registration date, possession date, etc.)
- encumbrances: array of strings describing liens, mortgages, disputes, or other charges
- missingFields: array of field names expected in this document type that are absent
- clauses: array of { "text": "...", "classification": "Standard|Unusual|Red Flag", "reasoning": "...", "confidence": "High|Medium|Low" }
  - text: verbatim clause text (max 200 characters)
  - classification: Standard = normal boilerplate; Unusual = worth reviewing; Red Flag = potentially harmful
  - reasoning: 1–2 sentences explaining the classification
  - confidence: how certain you are of the classification
- summary: 2–3 sentence plain-English summary of this document section
- overallRisk: "Low", "Medium", or "High" based on the clauses found

IMPORTANT:
- The document section is READ-ONLY. Do NOT continue, extend, or complete it.
- The section may end mid-sentence. That is expected — treat it as complete.
- Use empty string "" for fields not found. Use empty array [] for array fields not found.
- Never invent information not present in the document.`;

function buildUserMessage(chunk: string): string {
  return `Analyse the following property document section and return the structured JSON wrapped in <result> tags.

--- DOCUMENT SECTION START ---
${chunk}
--- DOCUMENT SECTION END ---

Return your analysis now. Begin your response with <result>.`;
}


function extractJSON(raw: string): string | null {
  // Primary: extract from <result> tags
  const tagMatch = raw.match(/<result>\s*([\s\S]*?)\s*<\/result>/);
  if (tagMatch) return tagMatch[1].trim();

  // Fallback: find the outermost balanced {...} block
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function validateResult(parsed: unknown): parsed is AnalysisResult {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const p = parsed as Record<string, unknown>;
  return (
    typeof p.extractedFields === 'object' && p.extractedFields !== null &&
    Array.isArray(p.clauses) &&
    typeof p.summary === 'string' &&
    ['Low', 'Medium', 'High'].includes(p.overallRisk as string)
  );
}


async function analyseChunk(chunk: string): Promise<AnalysisResult> {
  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    max_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: buildUserMessage(chunk) },
    ],
  });

  const raw = response.choices[0].message.content ?? '';

  if (!raw.trim()) {
    throw new Error('Empty response from Groq');
  }

  const jsonStr = extractJSON(raw);
  if (!jsonStr) {
    console.error('Could not find JSON in response:\n', raw.substring(0, 600));
    throw new Error('No JSON found in Groq response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('JSON parse failed. Raw JSON string:\n', jsonStr.substring(0, 600));
    throw new Error('Groq returned malformed JSON');
  }

  if (!validateResult(parsed)) {
    console.error('Schema validation failed:', JSON.stringify(parsed).substring(0, 400));
    throw new Error('Groq response did not match expected schema');
  }

  return parsed;
}


function mergeExtractedFields(results: AnalysisResult[]): ExtractedFields {
  const dedup = <T>(arrays: T[][]): T[] =>
    [...new Set(arrays.flat().filter((v): v is T => v !== null && v !== undefined))];

  const firstNonEmpty = (vals: string[]): string =>
    vals.find(v => v && v.trim().length > 0) ?? '';

  const all = results.map(r => r.extractedFields);

  return {
    parties:             dedup(all.map(f => f.parties)),
    propertyDescription: firstNonEmpty(all.map(f => f.propertyDescription)),
    propertyAddress:     firstNonEmpty(all.map(f => f.propertyAddress)),
    transactionType:     firstNonEmpty(all.map(f => f.transactionType)),
    transactionValue:    firstNonEmpty(all.map(f => f.transactionValue)),
    dates:               dedup(all.map(f => f.dates)),
    encumbrances:        dedup(all.map(f => f.encumbrances)),
    missingFields:       dedup(all.map(f => f.missingFields)),
  };
}


export async function analyseDocument(text: string): Promise<AnalysisResult> {
  const { chunkText } = await import('./chunkText');
  const chunks = chunkText(text);

  if (chunks.length === 0) {
    throw new Error('No text content could be extracted from the document');
  }

  if (chunks.length === 1) {
    return analyseChunk(chunks[0]);
  }

  const settled = await Promise.allSettled(chunks.map(analyseChunk));

  const results: AnalysisResult[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    } else {
      console.error(`Chunk ${i + 1}/${chunks.length} failed:`, outcome.reason);
    }
  });

  if (results.length === 0) {
    throw new Error('All document chunks failed to analyse');
  }

  return {
    extractedFields: mergeExtractedFields(results),
    clauses: results.flatMap(r => r.clauses),
    summary: results[0].summary,
    overallRisk:
      results.some(r => r.overallRisk === 'High')   ? 'High' :
      results.some(r => r.overallRisk === 'Medium') ? 'Medium' : 'Low',
  };
}
