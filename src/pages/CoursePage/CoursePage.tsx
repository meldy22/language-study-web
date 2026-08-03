import { Link } from "react-router-dom";

import styles from "./CoursePage.module.css";

const jlptLevels = [5, 4, 3, 2, 1];

export default function CoursePage() {
  return (
    <section className={`page ${styles.page}`}>
      <p className={styles.eyebrow}>CHOOSE YOUR COURSE</p>
      <h1 className="page-title">학습 과정 선택</h1>
      <p className="page-description">공부할 시험과 레벨을 선택하세요.</p>

      <section className={styles.courseSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>JLPT</h2>
            <p>기초 N5부터 고급 N1까지 원하는 레벨을 선택하세요.</p>
          </div>
          <span className={styles.languageBadge}>日本語</span>
        </div>

        <div className={styles.levelGrid}>
          {jlptLevels.map((level) => (
            <article className={styles.levelCard} key={level}>
              <span className={styles.levelName}>N{level}</span>
              <span className={styles.levelDescription}>
                {level === 5 ? "입문" : level === 4 ? "초급" : level === 3 ? "중급" : level === 2 ? "중상급" : "고급"}
              </span>
              <div className={styles.levelActions}>
                <Link to={`/vocabulary/jlpt/n${level}`}>단어 학습</Link>
                <Link className={styles.quizLink} to={`/quiz/jlpt/n${level}`}>퀴즈 풀기</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.courseSection} ${styles.comingSoon}`}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>TOEIC</h2>
            <p>영어 단어 과정은 곧 준비할 예정이에요.</p>
          </div>
          <span className={styles.languageBadge}>English</span>
        </div>
      </section>
    </section>
  );
}
