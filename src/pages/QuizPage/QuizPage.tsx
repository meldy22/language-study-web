import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import type { VocabularyWord } from "../../types/vocabulary";
import styles from "./QuizPage.module.css";

type QuizRouteParams = { subjectCode: string; level: string };
type QuizMode = "word" | "meaning" | "reading" | "mixed";
type QuizQuestion = {
  word: VocabularyWord;
  prompt: string;
  answer: string;
  choices: string[];
  direction: string;
};

const QUESTION_COUNT = 10;
const MODES: { id: QuizMode; icon: string; title: string; description: string }[] = [
  { id: "word", icon: "日", title: "단어 → 의미", description: "일본어 단어에 맞는 한국어 뜻 고르기" },
  { id: "meaning", icon: "가", title: "의미 → 단어", description: "한국어 뜻에 맞는 일본어 단어 고르기" },
  { id: "reading", icon: "あ", title: "단어 → 읽기", description: "단어의 올바른 후리가나 고르기" },
  { id: "mixed", icon: "Mix", title: "종합 퀴즈", description: "세 가지 유형을 골고루 풀기" },
];

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function createQuestions(words: VocabularyWord[], mode: QuizMode): QuizQuestion[] {
  return shuffle(words).slice(0, Math.min(QUESTION_COUNT, words.length)).map((word, index) => {
    const type = mode === "mixed" ? (["word", "meaning", "reading"] as const)[index % 3] : mode;
    const getValue = (item: VocabularyWord) =>
      type === "word" ? item.meaning : type === "meaning" ? item.word : item.furigana;
    const answer = getValue(word);
    const distractors = shuffle(words.filter((item) => item.id !== word.id).map(getValue).filter((value) => value && value !== answer));
    const choices = shuffle([answer, ...Array.from(new Set(distractors)).slice(0, 3)]);

    return {
      word,
      answer,
      choices,
      prompt: type === "meaning" ? word.meaning : word.word,
      direction: type === "word" ? "이 단어의 의미는 무엇인가요?" : type === "meaning" ? "이 의미에 맞는 단어는 무엇인가요?" : "이 단어는 어떻게 읽나요?",
    };
  });
}

export default function QuizPage() {
  const { subjectCode, level } = useParams<QuizRouteParams>();
  const numericLevel = Number(level?.replace(/[^0-9]/g, ""));
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [mode, setMode] = useState<QuizMode | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ question: QuizQuestion; selected: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWords = useCallback(async () => {
    if (subjectCode !== "jlpt" || !Number.isInteger(numericLevel) || numericLevel < 1 || numericLevel > 5) {
      setError("지원하지 않는 JLPT 레벨입니다.");
      setIsLoading(false);
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setError("퀴즈 데이터를 불러오려면 Supabase 환경 변수 설정이 필요합니다.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("jlpt_vocabulary")
      .select("id, word, meaning, furigana, romaji, level")
      .eq("level", numericLevel)
      .limit(100);
    if (queryError || !data || data.length < 4) setError("퀴즈에 필요한 단어를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    else setWords(data);
    setIsLoading(false);
  }, [numericLevel, subjectCode]);

  useEffect(() => {
    void Promise.resolve().then(loadWords);
  }, [loadWords]);

  function startQuiz(nextMode: QuizMode) {
    setMode(nextMode);
    setQuestions(createQuestions(words, nextMode));
    setCurrent(0);
    setSelected(null);
    setAnswers([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseAnswer(choice: string) {
    if (selected) return;
    setSelected(choice);
    setAnswers((previous) => [...previous, { question: questions[current], selected: choice }]);
  }

  function nextQuestion() {
    setCurrent((value) => value + 1);
    setSelected(null);
  }

  const score = useMemo(() => answers.filter(({ question, selected: answer }) => question.answer === answer).length, [answers]);
  const isFinished = questions.length > 0 && current >= questions.length;
  const question = questions[current];

  if (isLoading) return <section className={`page ${styles.page}`}><p className={styles.status}>퀴즈를 준비하고 있어요…</p></section>;

  if (error) return (
    <section className={`page ${styles.page}`}>
      <Link className={styles.backLink} to="/courses">← 코스 선택</Link>
      <div className={styles.notice} role="alert"><strong>퀴즈를 시작할 수 없어요</strong><p>{error}</p><button onClick={() => void loadWords()} type="button">다시 시도</button></div>
    </section>
  );

  if (!mode) return (
    <section className={`page ${styles.page}`}>
      <Link className={styles.backLink} to="/courses">← 코스 선택</Link>
      <p className={styles.eyebrow}>JLPT VOCABULARY QUIZ</p>
      <h1 className="page-title">JLPT N{numericLevel} 퀴즈</h1>
      <p className="page-description">오늘 풀고 싶은 퀴즈 유형을 선택하세요. 각 퀴즈는 {QUESTION_COUNT}문제예요.</p>
      <div className={styles.modeGrid}>
        {MODES.map((item) => (
          <button className={styles.modeCard} key={item.id} onClick={() => startQuiz(item.id)} type="button">
            <span className={styles.modeIcon}>{item.icon}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className={styles.arrow}>→</span>
          </button>
        ))}
      </div>
    </section>
  );

  if (isFinished) {
    const wrongAnswers = answers.filter(({ question: item, selected: answer }) => item.answer !== answer);
    return (
      <section className={`page ${styles.page}`}>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>N{numericLevel} 퀴즈 완료</span>
          <div className={styles.score}><strong>{score}</strong><span>/ {questions.length}</span></div>
          <h1>{score === questions.length ? "완벽해요!" : score >= 7 ? "아주 잘했어요!" : "조금만 더 복습해봐요!"}</h1>
          <p>정답률 {Math.round((score / questions.length) * 100)}%</p>
          <div className={styles.resultActions}><button onClick={() => startQuiz(mode)} type="button">다시 풀기</button><button className={styles.secondaryButton} onClick={() => setMode(null)} type="button">다른 유형 선택</button></div>
        </div>
        {wrongAnswers.length > 0 && <section className={styles.review}><h2>틀린 단어 복습</h2><ul>{wrongAnswers.map(({ question: item, selected: answer }) => <li key={item.word.id}><div><strong>{item.word.word}</strong><span>{item.word.furigana}</span></div><div><span className={styles.wrong}>내 답: {answer}</span><span className={styles.correct}>정답: {item.answer}</span></div></li>)}</ul></section>}
      </section>
    );
  }

  return (
    <section className={`page ${styles.page}`}>
      <div className={styles.quizTop}><button className={styles.quitButton} onClick={() => setMode(null)} type="button">× 나가기</button><span>N{numericLevel} · {MODES.find((item) => item.id === mode)?.title}</span></div>
      <div className={styles.progressMeta}><span>{current + 1} / {questions.length}</span><span>{Math.round(((current + 1) / questions.length) * 100)}%</span></div>
      <div className={styles.progress}><span style={{ width: `${((current + 1) / questions.length) * 100}%` }} /></div>
      <div className={styles.questionCard}>
        <p className={styles.direction}>{question.direction}</p>
        <h1 lang={question.direction.includes("의미에") ? "ko" : "ja"}>{question.prompt}</h1>
        {question.direction.includes("단어의 의미") && <span className={styles.reading}>{question.word.furigana}</span>}
        <div className={styles.choices}>
          {question.choices.map((choice, index) => {
            const state = selected ? choice === question.answer ? styles.correctChoice : choice === selected ? styles.wrongChoice : styles.dimmedChoice : "";
            return <button className={state} key={choice} onClick={() => chooseAnswer(choice)} type="button"><span>{index + 1}</span>{choice}</button>;
          })}
        </div>
        {selected && <div className={`${styles.feedback} ${selected === question.answer ? styles.success : styles.failure}`}><div><strong>{selected === question.answer ? "정답이에요!" : "아쉬워요!"}</strong>{selected !== question.answer && <span>정답은 “{question.answer}”예요.</span>}</div><button onClick={nextQuestion} type="button">{current + 1 === questions.length ? "결과 보기" : "다음 문제"} →</button></div>}
      </div>
    </section>
  );
}
