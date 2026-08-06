import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import MainLayout from "../layouts/MainLayout/MainLayout";
import CoursePage from "../pages/CoursePage/CoursePage";
import HomePage from "../pages/HomePage/HomePage";
import QuizPage from "../pages/QuizPage/QuizPage";
import ToeicQuizPage from "../pages/ToeicQuizPage/ToeicQuizPage";
import ToeicVocabularyPage from "../pages/ToeicVocabularyPage/ToeicVocabularyPage";
import VocabularyPage from "../pages/VocabularyPage/VocabularyPage";

export default function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<HomePage />} />

          <Route path="courses" element={<CoursePage />} />

          <Route
            path="vocabulary/:subjectCode/:level"
            element={<VocabularyPage />}
          />

          <Route
            path="vocabulary/toeic/day/:day"
            element={<ToeicVocabularyPage />}
          />

          <Route
            path="quiz/:subjectCode/:level"
            element={<QuizPage />}
          />

          <Route path="quiz/toeic/:scope" element={<ToeicQuizPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
