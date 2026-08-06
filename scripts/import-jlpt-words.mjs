import { createClient } from "@supabase/supabase-js";

const apiBaseUrl = "https://jlpt-vocab-api.vercel.app/api/words/all";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

for (let level = 1; level <= 5; level += 1) {
  const response = await fetch(`${apiBaseUrl}?level=${level}`);
  if (!response.ok) throw new Error(`JLPT N${level} API 요청 실패: ${response.status}`);

  const payload = await response.json();
  const words = Array.isArray(payload) ? payload : payload.words;
  if (!Array.isArray(words)) throw new Error(`JLPT N${level} 응답 형식을 확인할 수 없습니다.`);

  const rows = words.map(({ word, meaning, furigana, romaji }) => ({
    word,
    meaning,
    furigana: furigana ?? "",
    romaji: romaji ?? "",
    level,
  }));

  for (let start = 0; start < rows.length; start += 500) {
    const { error } = await supabase
      .from("jlpt_vocabulary")
      .upsert(rows.slice(start, start + 500), { onConflict: "word,meaning,level" });
    if (error) throw error;
  }

  console.log(`JLPT N${level}: ${rows.length}개 저장 완료`);
}
