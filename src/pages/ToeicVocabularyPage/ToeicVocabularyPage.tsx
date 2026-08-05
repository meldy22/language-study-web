import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import type { ToeicWord } from "../../types/toeic";
import styles from "./ToeicVocabularyPage.module.css";

const MIN_DAY = 1;
const MAX_DAY = 30;

export default function ToeicVocabularyPage() {
  const { day: dayParam } = useParams<{ day: string }>();
  const day = Number(dayParam);
  const isValidDay = Number.isInteger(day) && day >= MIN_DAY && day <= MAX_DAY;
  const [words, setWords] = useState<ToeicWord[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadWords() {
      if (!isValidDay) {
        setError("Day 1부터 Day 30까지만 선택할 수 있어요.");
        setIsLoading(false);
        return;
      }
      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase 환경 변수를 먼저 설정해 주세요.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from("toeic_vocabulary")
        .select("id, day, position, topic, word, meaning")
        .eq("day", day)
        .order("position", { ascending: true });

      if (!isActive) return;
      if (queryError) {
        setError("TOEIC 단어를 불러오지 못했어요. DB 마이그레이션과 데이터 적재 상태를 확인해 주세요.");
      } else {
        setWords(data ?? []);
      }
      setIsLoading(false);
    }

    void loadWords();
    return () => { isActive = false; };
  }, [day, isValidDay]);

  const filteredWords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return words;
    return words.filter(({ word, meaning }) =>
      `${word} ${meaning}`.toLocaleLowerCase().includes(query),
    );
  }, [search, words]);

  const topic = words[0]?.topic ?? "";

  return (
    <section className={`page ${styles.page}`}>
      <Link className={styles.backLink} to="/courses">← 학습 코스</Link>
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>TOEIC VOCABULARY</p>
          <h1 className="page-title">Day {isValidDay ? day : "-"}{topic && ` · ${topic}`}</h1>
          <p className="page-description">오늘의 단어를 순서대로 익혀 보세요.</p>
        </div>
        <div className={styles.count}><strong>{words.length}</strong><span>단어</span></div>
      </div>

      {isValidDay && <div className={styles.quizActions}><Link to={`/quiz/toeic/day-${day}`}>Day {day} 랜덤 퀴즈</Link><Link to="/quiz/toeic/all">Day 1~30 랜덤 퀴즈</Link></div>}

      <div className={styles.dayPicker} aria-label="TOEIC Day 선택">
        {Array.from({ length: MAX_DAY }, (_, index) => index + 1).map((item) => (
          <Link
            aria-current={item === day ? "page" : undefined}
            className={item === day ? styles.activeDay : undefined}
            key={item}
            to={`/vocabulary/toeic/day/${item}`}
          >
            {item}
          </Link>
        ))}
      </div>

      <input
        aria-label="TOEIC 단어 검색"
        className={styles.searchInput}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="영단어 또는 뜻 검색"
        type="search"
        value={search}
      />

      {isLoading && <p className={styles.status}>단어를 불러오는 중이에요…</p>}
      {!isLoading && error && <p className={styles.notice} role="alert">{error}</p>}
      {!isLoading && !error && filteredWords.length === 0 && <p className={styles.status}>표시할 단어가 없어요.</p>}

      {!isLoading && !error && filteredWords.length > 0 && (
        <ol className={styles.wordList}>
          {filteredWords.map((item) => (
            <li className={styles.wordCard} key={item.id} value={item.position}>
              <span className={styles.position}>{item.position}</span>
              <strong className={styles.word}>{item.word}</strong>
              <span className={styles.meaning}>{item.meaning}</span>
            </li>
          ))}
        </ol>
      )}

      {isValidDay && (
        <nav className={styles.pagination} aria-label="이전 또는 다음 Day">
          {day > MIN_DAY ? <Link to={`/vocabulary/toeic/day/${day - 1}`}>← Day {day - 1}</Link> : <span />}
          {day < MAX_DAY ? <Link to={`/vocabulary/toeic/day/${day + 1}`}>Day {day + 1} →</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
