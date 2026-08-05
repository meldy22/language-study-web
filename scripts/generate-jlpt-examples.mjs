import { createClient } from "@supabase/supabase-js";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "meta/llama-3.1-8b-instruct";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const level = Number(option("level", "5"));
const limit = Number(option("limit", "20"));
const offset = Number(option("offset", "0"));
const examplesPerWord = Number(option("examples-per-word", "2"));
const delay = Number(option("delay", "800"));
const dryRun = process.argv.includes("--dry-run");
const model = option("model", process.env.NVIDIA_MODEL || DEFAULT_MODEL);

if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error("--level은 1부터 5까지 입력해 주세요.");
if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) throw new Error("--limit과 --offset을 확인해 주세요.");
if (!Number.isInteger(examplesPerWord) || examplesPerWord < 1) throw new Error("--examples-per-word는 1 이상이어야 합니다.");

const required = ["NVIDIA_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name}가 .env.local에 없습니다.`);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function extractJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("모델 응답에서 JSON을 찾지 못했습니다.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function generate(word, count) {
  const prompt = `한국인 JLPT 학습자를 위한 일본어 예문을 ${count}개 만드세요.

대상 단어: ${word.word}
읽기: ${word.furigana}
한국어 뜻: ${word.meaning}
JLPT 레벨: N${word.level}

조건:
- 모든 일본어 문장에 대상 단어 또는 자연스러운 활용형을 포함하세요.
- N${word.level} 수준에 적절한 현대 일본어를 사용하세요.
- 문장은 간결하고 서로 다른 상황이어야 합니다.
- reading은 문장 전체를 히라가나로 적고 문장부호를 유지하세요.
- 자연스럽고 정확한 한국어 번역을 제공하세요.
- 반드시 다음 형태의 JSON만 출력하세요.
{"examples":[{"japanese":"...","reading":"...","translation_ko":"..."}]}`;

  const response = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "당신은 꼼꼼한 일본어 교사입니다. 유효한 JSON만 출력하세요." },
        { role: "user", content: prompt },
      ],
      temperature: 0.25,
      top_p: 0.9,
      max_tokens: 1200,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`NVIDIA API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json();
  const parsed = extractJson(payload.choices?.[0]?.message?.content || "");
  if (!Array.isArray(parsed.examples) || parsed.examples.length !== count) throw new Error(`예문이 정확히 ${count}개 생성되지 않았습니다.`);
  return parsed.examples.map((example) => {
    const row = {
      japanese: String(example.japanese || "").trim(),
      reading: String(example.reading || "").trim(),
      translation_ko: String(example.translation_ko || "").trim(),
    };
    if (!row.japanese || !row.reading || !row.translation_ko) throw new Error("예문 필수 항목이 비어 있습니다.");
    return row;
  });
}

const { data: words, error: wordsError } = await supabase
  .from("jlpt_vocabulary")
  .select("id, word, meaning, furigana, level")
  .eq("level", level)
  .order("id", { ascending: true })
  .range(offset, offset + limit - 1);
if (wordsError) throw wordsError;

console.log(`N${level} 단어 ${words.length}개 · ${model}`);
let succeeded = 0;
let skipped = 0;
let failed = 0;

for (const [index, word] of words.entries()) {
  const label = `[${index + 1}/${words.length}] ${word.word}`;
  try {
    let existing = 0;
    if (!dryRun) {
      const { count, error } = await supabase
        .from("jlpt_example_sentences")
        .select("id", { count: "exact", head: true })
        .eq("vocabulary_id", word.id);
      if (error) throw error;
      existing = count || 0;
      if (existing >= examplesPerWord) {
        skipped += 1;
        console.log(`${label}: 건너뜀 (${existing}개 저장됨)`);
        continue;
      }
    }

    const examples = await generate(word, examplesPerWord - existing);
    if (dryRun) console.log(JSON.stringify({ word: word.word, examples }, null, 2));
    else {
      const rows = examples.map((example) => ({ ...example, vocabulary_id: word.id, source: "nvidia_nim", model, is_verified: false }));
      const { error } = await supabase.from("jlpt_example_sentences").upsert(rows, { onConflict: "vocabulary_id,japanese", ignoreDuplicates: true });
      if (error) throw error;
      console.log(`${label}: ${examples.length}개 저장 (${existing + examples.length}개)`);
    }
    succeeded += 1;
  } catch (error) {
    failed += 1;
    console.error(`${label}: 오류 - ${error.message}`);
  }
  if (index < words.length - 1 && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

console.log(`완료: 성공 ${succeeded}, 건너뜀 ${skipped}, 실패 ${failed}`);
if (failed > 0) process.exitCode = 1;
