# Language Study Web

일본어, 영어를 시작으로 여러 언어의 단어와 퀴즈를 학습하는 웹 앱입니다.

## JLPT 단어 데이터 준비

이 앱은 [JLPT Vocabulary API](https://jlpt-vocab-api.vercel.app/)의 단어를 Supabase에 한 번 저장하고, 화면에서는 Supabase의 데이터를 조회합니다.

### 1. 테이블 만들기

Supabase 프로젝트의 **SQL Editor**에서 `supabase/migrations/001_create_jlpt_vocabulary.sql` 파일의 내용을 실행합니다.

### 2. 환경 변수 입력하기

`.env.example`을 참고해 프로젝트 루트의 `.env.local`에 아래 값을 입력합니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY`는 데이터 가져오기에서만 사용하며 브라우저 코드에는 포함되지 않습니다. `.env.local`은 Git에 올라가지 않습니다.

### 3. JLPT N1~N5 단어 가져오기

```bash
npm run import:jlpt
```

다시 실행해도 같은 단어는 중복 저장되지 않습니다.

### 4. 앱 실행하기

```bash
npm run dev
```

화면에서 **코스 → JLPT N3 단어**로 이동하면 Supabase에 저장된 단어 중 처음 50개를 볼 수 있습니다.

## 주요 명령어

- `npm run dev`: 개발 화면 실행
- `npm run build`: 배포용 빌드 확인
- `npm run lint`: 코드 검사
- `npm run import:jlpt`: JLPT API의 단어를 Supabase에 저장
