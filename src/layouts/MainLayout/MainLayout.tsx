import { Link, Outlet } from "react-router-dom";

import styles from "./MainLayout.module.css";

export default function MainLayout() {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.logo} to="/">
            Language Study
          </Link>

          <nav className={styles.navigation} aria-label="주요 메뉴">
            <Link to="/">홈</Link>
            <Link to="/courses">학습하기</Link>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}