import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import SpeechButton from "../../components/SpeechButton/SpeechButton";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import type { ToeicWord } from "../../types/toeic";
import styles from "./ToeicQuizPage.module.css";

type QuizQuestion = { word: ToeicWord; choices: string[] };
type Answer = { question: QuizQuestion; selected: string };

const QUESTION_COUNT = 10;
const MIN_DAY = 1;
const MAX_DAY = 30;

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function createQuestions(words: ToeicWord[]): QuizQuestion[] {
  return shuffle(words).slice(0, Math.min(QUESTION_COUNT, words.length)).map((word) => {
    const distractors = shuffle(
      words
        .filter((item) => item.id !== word.id && item.meaning !== word.meaning)
        .map((item) => item.meaning),
    );
    return {
      word,
      choices: shuffle([word.meaning, ...Array.from(new Set(distractors)).slice(0, 3)]),
    };
  });
}

async function fetchAllWords() {
  if (!supabase) return { data: null, error: new Error("Supabase is not configured") };
  const allWords: ToeicWord[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("toeic_vocabulary")
      .select("id, day, position, topic, word, meaning")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return { data: null, error };
    allWords.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: allWords, error: null };
}

export default function ToeicQuizPage() {
  const { scope = "day-1" } = useParams<{ scope: string }>();
  const isAllDays = scope === "all";
  const day = Number(scope.replace("day-", ""));
  const isValidScope = isAllDays || (Number.isInteger(day) && day >= MIN_DAY && day <= MAX_DAY);
  const [words, setWords] = useState<ToeicWord[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWords = useCallback(async () => {
    if (!isValidScope) {
      setError("지원하지 않는 TOEIC 퀴즈 범위입니다.");
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
    const result = isAllDays
      ? await fetchAllWords()
      : await supabase
          .from("toeic_vocabulary")
          .select("id, day, position, topic, word, meaning")
          .eq("day", day)
          .order("position", { ascending: true });

    if (result.error || !result.data || result.data.length < 4) {
      setError("퀴즈에 필요한 단어를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } else {
      setWords(result.data);
      setQuestions(createQuestions(result.data));
      setCurrent(0);
      setSelected(null);
      setAnswers([]);
    }
    setIsLoading(false);
  }, [day, isAllDays, isValidScope]);

  useEffect(() => { void Promise.resolve().then(loadWords); }, [loadWords]);

  function restartQuiz() {
    setQuestions(createQuestions(words));
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

  const score = useMemo(
    () => answers.filter(({ question, selected: answer }) => question.word.meaning === answer).length,
    [answers],
  );
  const isFinished = questions.length > 0 && current >= questions.length;
  const title = isAllDays ? "Day 1~30 종합" : `Day ${day}`;
  const question = questions[current];

  if (isLoading) return <section className={`page ${styles.page}`}><p className={styles.status}>랜덤 퀴즈를 만들고 있어요…</p></section>;
  if (error) return <section className={`page ${styles.page}`}><Link className={styles.backLink} to="/courses">← 학습 코스</Link><div className={styles.notice} role="alert"><strong>퀴즈를 시작할 수 없어요</strong><p>{error}</p><button onClick={() => void loadWords()} type="button">다시 시도</button></div></section>;

  if (isFinished) {
    const wrongAnswers = answers.filter(({ question: item, selected: answer }) => item.word.meaning !== answer);
    return (
      <section className={`page ${styles.page}`}>
        <div className={styles.resultCard}>
          <span>{title} 랜덤 퀴즈 완료</span>
          <div className={styles.score}><strong>{score}</strong><span>/ {questions.length}</span></div>
          <h1>{score === questions.length ? "완벽해요!" : score >= 7 ? "아주 잘했어요!" : "조금만 더 복습해 봐요!"}</h1>
          <p>정답률 {Math.round((score / questions.length) * 100)}%</p>
          <div className={styles.resultActions}><button onClick={restartQuiz} type="button">새 문제 풀기</button><Link to={isAllDays ? "/courses" : `/vocabulary/toeic/day/${day}`}>단어 복습</Link></div>
        </div>
        {wrongAnswers.length > 0 && <section className={styles.review}><h2>틀린 단어 복습</h2><ul>{wrongAnswers.map(({ question: item, selected: answer }) => <li key={item.word.id}><div><strong>{item.word.word}</strong><span>Day {item.word.day} · {item.word.topic}</span></div><div><span className={styles.wrong}>내 답: {answer}</span><span className={styles.correct}>정답: {item.word.meaning}</span></div></li>)}</ul></section>}
      </section>
    );
  }

  return (
    <section className={`page ${styles.page}`}>
      <div className={styles.quizTop}><Link to={isAllDays ? "/courses" : `/vocabulary/toeic/day/${day}`}>× 나가기</Link><strong>{title} 랜덤 퀴즈</strong></div>
      <nav className={styles.scopePicker} aria-label="TOEIC 퀴즈 범위 선택">
        <Link className={isAllDays ? styles.activeScope : undefined} to="/quiz/toeic/all">전체</Link>
        {Array.from({ length: MAX_DAY }, (_, index) => index + 1).map((item) => <Link className={!isAllDays && item === day ? styles.activeScope : undefined} key={item} to={`/quiz/toeic/day-${item}`}>{item}</Link>)}
      </nav>
      <div className={styles.progressMeta}><span>{current + 1} / {questions.length}</span><span>{Math.round(((current + 1) / questions.length) * 100)}%</span></div>
      <div className={styles.progress}><span style={{ width: `${((current + 1) / questions.length) * 100}%` }} /></div>
      <div className={styles.questionCard}>
        <p className={styles.direction}>이 단어의 의미는 무엇인가요?</p>
        <div className={styles.questionWord}>
          <h1 lang="en">{question.word.word}</h1>
          <SpeechButton text={question.word.word} />
        </div>
        <span className={styles.wordMeta}>Day {question.word.day} · {question.word.topic}</span>
        <div className={styles.choices}>
          {question.choices.map((choice, index) => {
            const state = selected ? choice === question.word.meaning ? styles.correctChoice : choice === selected ? styles.wrongChoice : styles.dimmedChoice : "";
            return <button className={state} key={choice} onClick={() => chooseAnswer(choice)} type="button"><span>{index + 1}</span>{choice}</button>;
          })}
        </div>
        {selected && <div className={`${styles.feedback} ${selected === question.word.meaning ? styles.success : styles.failure}`}><div><strong>{selected === question.word.meaning ? "정답이에요!" : "아쉬워요!"}</strong>{selected !== question.word.meaning && <span>정답은 “{question.word.meaning}”예요.</span>}</div><button onClick={nextQuestion} type="button">{current + 1 === questions.length ? "결과 보기" : "다음 문제"} →</button></div>}
      </div>
    </section>
  );
}
