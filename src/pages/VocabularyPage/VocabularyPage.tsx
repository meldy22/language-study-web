import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import type { VocabularyWord } from "../../types/vocabulary";
import styles from "./VocabularyPage.module.css";

type VocabularyRouteParams = {
  subjectCode: string;
  level: string;
};

const PAGE_SIZE = 50;

export default function VocabularyPage() {
  const { subjectCode, level } = useParams<VocabularyRouteParams>();
  const [searchParams, setSearchParams] = useSearchParams();
  const numericLevel = Number(level?.replace(/[^0-9]/g, ""));
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadWords() {
      if (subjectCode !== "jlpt" || !Number.isInteger(numericLevel)) {
        setError("현재는 JLPT N1~N5 단어만 제공하고 있어요.");
        setIsLoading(false);
        return;
      }

      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase 연결 정보가 아직 설정되지 않았어요.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error: queryError } = await supabase
        .from("jlpt_vocabulary")
        .select("id, word, meaning, furigana, romaji, level, jlpt_example_sentences(id, japanese, reading, translation_ko, is_verified)", { count: "exact" })
        .eq("level", numericLevel)
        .order("id", { ascending: true })
        .range(from, to);

      if (!isActive) return;

      if (queryError) {
        setError("단어를 불러오지 못했어요. Supabase 테이블과 공개 조회 정책을 확인해 주세요.");
      } else {
        setWords(data ?? []);
        setTotalCount(count ?? 0);
      }
      setIsLoading(false);
    }

    void loadWords();
    return () => {
      isActive = false;
    };
  }, [currentPage, numericLevel, subjectCode]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    const start = Math.min(Math.max(currentPage - 2, 1), Math.max(totalPages - 4, 1));
    return start + index;
  });

  function moveToPage(page: number) {
    setSearch("");
    setSearchParams(page === 1 ? {} : { page: String(page) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filteredWords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return words;
    return words.filter((item) =>
      [item.word, item.furigana, item.romaji, item.meaning].some((value) =>
        value.toLocaleLowerCase().includes(query),
      ),
    );
  }, [search, words]);

  return (
    <section className={`page ${styles.page}`}>
      <div className={styles.headingRow}>
        <div>
          <Link className={styles.backLink} to="/courses">← 코스 선택</Link>
          <p className={styles.eyebrow}>JAPANESE VOCABULARY</p>
          <h1 className="page-title">JLPT N{numericLevel} 단어</h1>
          <p className="page-description">일본어 표기와 읽는 법, 영어 뜻을 함께 익혀보세요.</p>
        </div>
        <div className={styles.count}>
          <strong>{totalCount.toLocaleString()}</strong>
          <span>전체 단어</span>
        </div>
      </div>

      <label className={styles.searchLabel}>
        <span className={styles.visuallyHidden}>단어 검색</span>
        <input
          className={styles.searchInput}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="현재 페이지에서 단어, 후리가나, 뜻 검색"
          type="search"
          value={search}
        />
      </label>

      {isLoading && <p className={styles.status}>단어를 불러오는 중이에요…</p>}

      {!isLoading && error && (
        <div className={styles.notice} role="alert">
          <strong>연결 준비가 필요해요</strong>
          <p>{error}</p>
          <p className={styles.noticeHint}>프로젝트의 README에 적힌 설정 순서를 따라 주세요.</p>
        </div>
      )}

      {!isLoading && !error && filteredWords.length === 0 && (
        <p className={styles.status}>조건에 맞는 단어가 없어요.</p>
      )}

      {!isLoading && !error && filteredWords.length > 0 && (
        <>
          <p className={styles.pageSummary}>{currentPage} / {totalPages} 페이지 · 페이지당 {PAGE_SIZE}개</p>
          <ul className={styles.wordList}>
            {filteredWords.map((item) => (
              <li className={styles.wordItem} key={item.id}>
                <div className={styles.wordCard}>
                  <div className={styles.japanese}>
                    <span className={styles.word}>{item.word}</span>
                    <span className={styles.furigana}>{item.furigana}</span>
                  </div>
                  <div className={styles.definition}>
                    <span className={styles.meaning}>{item.meaning}</span>
                    <span className={styles.romaji}>{item.romaji}</span>
                  </div>
                  <span className={styles.level}>N{item.level}</span>
                </div>
                {item.jlpt_example_sentences && item.jlpt_example_sentences.length > 0 && (
                  <div className={styles.examples}>
                    <p className={styles.exampleHeading}>예문</p>
                    {item.jlpt_example_sentences.slice(0, 2).map((example, index) => (
                      <article className={styles.example} key={example.id}>
                        <span className={styles.exampleNumber}>{index + 1}</span>
                        <div>
                          <p className={styles.exampleJapanese} lang="ja">{example.japanese}</p>
                          <p className={styles.exampleReading} lang="ja">{example.reading}</p>
                          <p className={styles.exampleTranslation}>{example.translation_ko}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <nav className={styles.pagination} aria-label="단어 목록 페이지">
            <button disabled={currentPage === 1} onClick={() => moveToPage(currentPage - 1)} type="button">이전</button>
            <div className={styles.pageNumbers}>
              {visiblePages.map((page) => (
                <button
                  aria-current={page === currentPage ? "page" : undefined}
                  className={page === currentPage ? styles.activePage : undefined}
                  key={page}
                  onClick={() => moveToPage(page)}
                  type="button"
                >
                  {page}
                </button>
              ))}
            </div>
            <button disabled={currentPage >= totalPages} onClick={() => moveToPage(currentPage + 1)} type="button">다음</button>
          </nav>
        </>
      )}
    </section>
  );
}
