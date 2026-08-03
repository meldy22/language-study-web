import { Link } from "react-router-dom";

import styles from "./HomePage.module.css";

export default function HomePage() {
  return (
    <section className={`page ${styles.hero}`}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>나만의 언어 학습 공간</p>

        <h1 className={styles.title}>
          TOEIC과 JLPT를
          <br />
          한곳에서 공부하세요
        </h1>

        <p className={styles.description}>
          단어를 학습하고 퀴즈를 풀면서 나의 학습 기록을 관리해보세요.
        </p>

        <Link className={styles.startButton} to="/courses">
          학습 시작하기
        </Link>
      </div>
    </section>
  );
}