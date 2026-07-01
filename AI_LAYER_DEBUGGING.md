# AI Layer — Issue, Debugging, and Final Solution

## What We Are Building

A property document analyser that:
1. Accepts a PDF (sale deed, lease, title document)
2. Extracts raw text from the PDF
3. Splits the text into chunks small enough for an LLM
4. Sends each chunk to the Groq API (Llama 3.3 70B model)
5. Gets back structured JSON — parties, clauses, risk level, etc.
6. Merges results from all chunks into a single response for the frontend

The AI layer is the heart of the system. Everything else (PDF parsing, file upload, frontend rendering) is straightforward. The hard part is reliably extracting structured JSON from an LLM that is also reading a legal document.

---

## The Bug

Every request to analyse a court judgment or a longer property document returned this error:

```json
{
  "error": "400 {\"error\":{\"message\":\"Failed to generate JSON. Please adjust your prompt.\",
  \"type\":\"invalid_request_error\",
  \"code\":\"json_validate_failed\",
  \"failed_generation\":\"{\n  22. The plaintiffs also examined PW4...\"}}"
}
```

The Groq API rejected the response before it even reached our code.

---

## Understanding the Error: `failed_generation`

Groq exposes the raw model output in `failed_generation`. Reading it carefully reveals exactly what happened:

```
{
  22. The plaintiffs also examined PW4 who deposed that he had witnessed
  the sale deeds... 23. The defendant examined DW1... 24. The plaintiffs
  and their witnesses also gave evidence...
  </document>

  {
    "extractedFields": {
      "parties": ["plaintiffs", "defendant"],
      ...
    }
  }
}
```

The model generated **two things**:
1. A continuation of the document (paragraphs 22, 23, 24...) inside the opening `{`
2. The correct JSON, nested inside the outer `{`

This produced a structure like:

```
{                          ← outer brace (forced by response_format)
  22. The plaintiffs...    ← document continuation (not valid JSON)
  </document>              ← closing tag of the document
  {                        ← actual JSON (correct, but nested)
    "extractedFields": {}
  }
}                          ← outer close brace
```

This is not valid JSON. Groq's server-side validator saw it and threw `json_validate_failed` before our application could read the response at all.

---

## Why Did the Model Do This?

This requires understanding how LLMs work at a basic level.

An LLM generates text **one token at a time**, where each token is a word fragment. At each step, it predicts: *"given everything I have seen so far, what is the most likely next token?"*

The document we sent to the model ended at paragraph 21:

```
... 20. The trial court dismissed the suit. 21. The plaintiff filed an appeal.
```

The model has been trained on millions of legal documents. In that training data, paragraph 21 is almost always followed by paragraph 22. That is an extremely strong pattern.

We then told the model: "now output a JSON object."

The model opened `{` (as required by `response_format: json_object`). But now it is in a strange position: it has `{` as the last token, and the second-strongest pattern in its context is "paragraph 22 comes next." So it writes:

```
{
  22. The plaintiffs...
```

The prompt instructions ("do not continue the document", "output JSON keys") are also competing patterns. Eventually those win, and the model outputs the correct JSON — but by then it is nested inside the garbage outer block.

**The core insight:** `response_format: json_object` forces the model to open `{`, but it does not tell the model what to put inside `{`. The model fills that in from context, and the context is a numbered legal document.

---

## Attempt 1: Stronger Prompt Instructions

### What We Tried

Added more explicit rules to the system prompt:

```
CRITICAL RULES — VIOLATION WILL CAUSE AN ERROR:
- DO NOT output paragraph numbers like "22.", "23.", "24.", etc. under any circumstances.
- DO NOT continue, extend, or complete the document in any way.
- The JSON object must have EXACTLY these top-level keys in this order:
  "extractedFields", "clauses", "summary", "overallRisk"
```

Also restructured the user message to add a hard separator:

```
=== DOCUMENT END ===

STOP. Do NOT write any more document text. Do NOT generate paragraph 22, 23, or any continuation.

Output ONLY a JSON object. The JSON must begin with the key "extractedFields".
```

### Why It Failed

The instructions did not help. Same error, same pattern.

The reason: prompt instructions are just more tokens in the context. The probability of "paragraph 22 follows paragraph 21" is learned from billions of training examples. A few sentences in the system prompt cannot fully override a pattern that deeply embedded.

Think of it like this — if you read a paragraph that ends with "1, 2, 3, 4..." and someone says "now write a JSON object," your brain still wants to write "5". The instruction and the pattern are fighting each other.

### What the Error Looked Like

```
{
  22. The plaintiffs also examined PW4 who deposed...
  </document>

  {
    "extractedFields": { ... }    ← correct JSON is here but unreachable
  }
}
```

---

## Attempt 2: Increasing `max_tokens`

### What We Tried

Changed `max_tokens` from `1500` to `4096`.

### What This Fixed

This solved a **different** bug that appeared first: the JSON was being cut off mid-generation because `1500` tokens was not enough to complete a full analysis response with multiple clauses. Increasing it to `4096` fixed that truncation issue.

### Why It Did Not Fix the Main Bug

The document-continuation bug is not about token limits. The model was not running out of tokens — it was generating the wrong content from the very first token after `{`. More tokens just let it generate more wrong content before (eventually) producing the correct JSON.

---

## Attempt 3: Regex Fallback in Parser

### What We Tried

After both the above attempts, we added a fallback in the TypeScript parser:

```typescript
const match = content.match(/\{[\s\S]*\}/);
if (match) {
  const extracted = tryParse(match[0]);
  if (extracted) return extracted;
}
```

### Why It Failed

This could never work because the error happened **before our code ran**. When `response_format: json_object` is active and the model produces invalid JSON, **Groq rejects the request server-side and returns HTTP 400**. The Groq SDK throws a `BadRequestError` exception. Our parsing code is never reached.

Even if Groq had returned the bad output, the greedy regex `/\{[\s\S]*\}/` would have matched from the first `{` to the last `}` — capturing the entire garbage block including the document continuation.

---

## Root Cause Summary

The real culprit was always **`response_format: { type: "json_object" }`**.

This API parameter tells Groq: "force the model output to be a valid JSON object." It does this by:

1. Starting the model's output with `{`
2. Running a JSON validator on the complete output
3. If invalid → returning HTTP 400 with `json_validate_failed`

Step 1 is what broke us. The model was handed the opening `{` and given no guidance about what key to write first. Its document-completion instinct filled in paragraph 22 instead of `"extractedFields"`.

---

## The Solution That Worked: XML Delimiter Extraction

### The Core Idea

Remove `response_format: json_object` entirely. Without it:
- The model does not start with a forced `{`
- The model generates its own output from scratch
- No server-side validator can reject the response

Instead, we ask the model to wrap its JSON in `<result>` XML tags and extract the JSON from those tags on our side.

### Why XML Tags Work

Models are extremely reliable at respecting XML/HTML-style tags. They have been trained on:
- HTML documents with tagged structure
- XML data files
- Documentation with code fences
- Instructional content that uses tags to delimit sections

When a model sees `Begin your response with <result>`, it opens the tag, generates content, and closes it with `</result>`. The tag is a structural signal, not an instruction competing with a pattern. It does not trigger the document-continuation instinct because `<result>` is not part of any numbered-paragraph sequence.

### The New System Prompt

```
OUTPUT FORMAT — CRITICAL:
- Wrap your entire JSON response in <result> and </result> tags.
- Inside those tags, output ONLY a valid JSON object.
- Do not output anything outside the <result> tags.

The JSON must follow this exact schema:

<result>
{
  "extractedFields": { ... },
  "clauses": [],
  "summary": "",
  "overallRisk": "Low"
}
</result>
```

The schema is shown inside `<result>` tags in the system prompt itself. This means the model has already seen the pattern `<result>{ JSON }</result>` before it starts generating. It will mirror that pattern.

### The New User Message

```
Analyse the following property document section and return the structured JSON wrapped in <result> tags.

--- DOCUMENT SECTION START ---
{document chunk here}
--- DOCUMENT SECTION END ---

Return your analysis now. Begin your response with <result>.
```

The `--- DOCUMENT SECTION END ---` separator creates a clear visual break. After it, the model knows it has finished reading and must now produce output. The final line `Begin your response with <result>` is a direct instruction that primes the model's first token.

### Example: What the Model Now Produces

**Input (last few lines of a chunk):**
```
... 20. The trial court dismissed the suit.
21. The plaintiff filed an appeal to the first appellate court.

--- DOCUMENT SECTION END ---

Return your analysis now. Begin your response with <result>.
```

**Model output:**
```
<result>
{
  "extractedFields": {
    "parties": ["Plaintiff - Ramesh Kumar", "Defendant - Suresh Patel"],
    "propertyDescription": "Plot No. 47, admeasuring 1200 sq ft",
    "propertyAddress": "Sector 12, Nagpur, Maharashtra",
    "transactionType": "Sale Deed",
    "transactionValue": "Rs. 45,00,000",
    "dates": [
      { "type": "Execution Date", "value": "15 March 1998" }
    ],
    "encumbrances": [],
    "missingFields": ["Registration Date", "Possession Date"]
  },
  "clauses": [
    {
      "text": "The vendor hereby covenants that the property is free from all encumbrances",
      "classification": "Standard",
      "reasoning": "Standard warranty of title, present in most sale deeds.",
      "confidence": "High"
    }
  ],
  "summary": "This section describes a property dispute over Plot No. 47 in Nagpur...",
  "overallRisk": "Low"
}
</result>
```

The model opened `<result>`, wrote the JSON, closed `</result>`. No document continuation.

### The Extraction Code

```typescript
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
```

**How it works:**

1. **Primary path** — regex `/<result>\s*([\s\S]*?)\s*<\/result>/` extracts the content between the tags. The `?` makes it non-greedy so it stops at the first `</result>` it finds.

2. **Fallback path** — if tags are missing (rare), a balanced-brace walker finds the outermost `{...}` block. It uses a `depth` counter: increments on `{`, decrements on `}`. When depth reaches 0 again, we have the complete outermost block. This correctly handles nested objects like `{"extractedFields": {"parties": []}}`.

   The old approach (`/\{[\s\S]*\}/`) was greedy — it matched from the first `{` to the **last** `}` in the entire response, which could include trailing text. The balanced walker is exact.

---

## The Chunking Fix

### The Old Approach (Word-Based)

```typescript
export function chunkText(text: string, maxWords = 1500): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  const overlap = 200;

  for (let i = 0; i < words.length; i += maxWords - overlap) {
    const chunk = words.slice(i, i + maxWords).join(' ');
    chunks.push(chunk);
    if (i + maxWords >= words.length) break;
  }

  return chunks;
}
```

**Problem:** This splits purely by word count. It does not know or care about sentence or paragraph boundaries.

**Example of what this produces:**

```
--- Chunk 1 (words 0–1499) ---
... 18. The defendant claimed that he purchased the plot in 1961 from
the original owner Dattatraya Rao. The sale deed dated 12th April 1961
was produced as Exhibit D-3. 19. The plaintiff countered that Dattatraya
Rao had no authority to sell as he himself was not the title holder. 20.
The trial court on examining both exhibits held that the plaintiff had
failed to establish

--- Chunk 2 (words 1300–2799) ---  ← overlap starts at word 1300
the plaintiff had failed to establish title. 21. The first appellate court
reversed the finding. 22. The High Court...
```

Notice chunk 1 ends mid-sentence: `"the plaintiff had failed to establish"`. The model seeing this fragment has an even stronger urge to complete it. Chunk 2 starts in the middle of sentence from chunk 1 — confusing but workable due to overlap.

The bigger problem: 1500 words of a numbered legal document gives the model a lot of momentum. When it finishes reading and opens `{`, paragraphs 22, 23... are statistically very close.

### The New Approach (Paragraph-Aware)

```typescript
export function chunkText(text: string, maxWords = 800): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // Split on blank lines OR numbered-paragraph boundaries like "\n21. "
  const paragraphs = normalized
    .split(/\n{2,}|\n(?=\d{1,3}\.\s)/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Accumulate paragraphs until word budget is hit, then flush
  // ...carry last paragraph into next chunk as overlap
}
```

**Key changes:**

| Aspect | Old | New |
|---|---|---|
| Split unit | Word | Paragraph (or sentence at minimum) |
| Max words | 1500 | 800 |
| Overlap | 200 words (arbitrary slice) | Last full paragraph (semantic unit) |
| Splits on | Nothing meaningful | `\n\n` and `\n21. ` patterns |

**Example of what the new chunker produces with the same document:**

```
--- Chunk 1 ---
18. The defendant claimed that he purchased the plot in 1961 from the
original owner Dattatraya Rao. The sale deed dated 12th April 1961 was
produced as Exhibit D-3.

19. The plaintiff countered that Dattatraya Rao had no authority to sell
as he himself was not the title holder.

20. The trial court on examining both exhibits held that the plaintiff had
failed to establish title and dismissed the suit.

--- Chunk 2 (overlap: paragraph 20 is carried forward) ---
20. The trial court on examining both exhibits held that the plaintiff had
failed to establish title and dismissed the suit.

21. The first appellate court reversed the trial court's finding and held
in favour of the plaintiff.
```

Every chunk now ends on a complete sentence. The model reads the last line as a finished thought, not a prompt to continue.

**Why 800 words instead of 1500?**

Smaller chunks mean less document context accumulated in the model's generation state when it transitions from reading to writing JSON. The pattern pressure from 800 words of numbered paragraphs is significantly lower than from 1500 words. Groq's rate limit for this model is also 12,000 tokens/minute — smaller chunks help stay within that limit when processing long documents in parallel.

---

## The Merging Fix

### Old Merge Logic

```typescript
const merged: AnalysisResult = {
  extractedFields: results[0].extractedFields,  // ← chunk 1 only
  clauses: results.flatMap(r => r.clauses),
  summary: results[0].summary,
  overallRisk: ...
};
```

`extractedFields` from chunks 2, 3, 4... were silently discarded. If the property address appeared in paragraph 8 (chunk 2) and the transaction value appeared in paragraph 15 (chunk 3), both would be lost.

### New Merge Logic

```typescript
function mergeExtractedFields(results: AnalysisResult[]): ExtractedFields {
  const dedup = <T>(arrays: T[][]): T[] =>
    [...new Set(arrays.flat().filter(v => v !== null && v !== undefined))];

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
```

**Rules:**
- **Array fields** (`parties`, `dates`, `encumbrances`, `missingFields`): flatten all arrays from all chunks, deduplicate. A party mentioned in chunk 2 and chunk 4 appears once.
- **String fields** (`propertyDescription`, `propertyAddress`, `transactionType`, `transactionValue`): take the first non-empty value across all chunks. Earlier chunks tend to have this info in recitals; later chunks may have empty strings for these fields.

### Old vs New: Partial Failure Handling

Old:
```typescript
const results = await Promise.all(chunks.map(analyseChunk));
// If any chunk throws, the entire Promise.all rejects
// One bad chunk = no result at all
```

New:
```typescript
const settled = await Promise.allSettled(chunks.map(analyseChunk));
// Collects fulfilled results, logs failed ones
// A 50-page document with one bad chunk still returns results from all other chunks
```

---

## Complete Comparison

| Issue | Broken Approach | Working Approach |
|---|---|---|
| JSON generation | `response_format: json_object` | Removed — no forced wrapping |
| Output structure | Model opens `{`, fills with document text | Model wraps in `<result>` tags |
| JSON extraction | `JSON.parse(content)` directly | Extract from `<result>` tags |
| Fallback extraction | Greedy regex (wrong) | Balanced-brace depth walker |
| Chunk size | 1500 words | 800 words |
| Chunk boundaries | Arbitrary word position | Paragraph / sentence boundaries |
| Overlap | 200 random words | Last full paragraph |
| Multi-chunk fields | Only chunk 1 fields kept | Merged across all chunks |
| Partial failure | One chunk fails → entire request fails | Failed chunks are skipped |

---

## Key Lesson

**Never use `response_format: json_object` when the input itself contains sequential structured text** (numbered lists, numbered paragraphs, enumerated clauses).

The JSON mode forces the model to open `{` and then step aside. At that point the model's strongest completion signal is whatever was last in the input — in our case, numbered paragraphs. The model will continue those paragraphs inside the `{}` instead of writing JSON keys.

**The reliable alternative:** Use XML/tag delimiters (`<result>`) and extract from them. Models treat tags as structural containers, not as sequences to continue. They consistently open and close them correctly.
