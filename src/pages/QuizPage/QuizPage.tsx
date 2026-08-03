import { useParams } from "react-router-dom";

type QuizRouteParams = {
  subjectCode: string;
  level: string;
};

export default function QuizPage() {
  const { subjectCode, level } = useParams<QuizRouteParams>();

  return (
    <section className="page">
      <h1 className="page-title">퀴즈</h1>

      <p className="page-description">
        선택한 시험: {subjectCode?.toUpperCase()}
        <br />
        선택한 레벨: {level?.toUpperCase()}
      </p>
    </section>
  );
}