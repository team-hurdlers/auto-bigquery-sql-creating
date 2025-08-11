# BigQuery SQL Generator

GA4 이벤트 택소노미 기반 BigQuery SQL 자동 생성 도구

## 주요 기능

- Google Sheets에서 이벤트 택소노미 데이터 로드
- 다양한 SQL 템플릿 제공 (이벤트 분석, 파라미터 분석, 퍼널 분석 등)
- BigQuery 직접 연동 및 쿼리 실행
- 쿼리 결과를 View로 저장
- CSV/JSON 형식으로 결과 내보내기

## 설치 방법

### 1. 저장소 클론
```bash
git clone https://github.com/team-hurdlers/auto-bigquery-sql-creating.git
cd auto-bigquery-sql-creating
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 환경 변수 설정
`.env` 파일을 생성하고 다음 내용을 추가:

```env
# Google OAuth2 설정
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Session Secret
SESSION_SECRET=your-session-secret

# Port
PORT=3000
```

### 4. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트 생성
2. APIs & Services > Credentials에서 OAuth 2.0 Client ID 생성
3. Authorized redirect URIs에 `http://localhost:3000/api/auth/callback` 추가
4. 다음 API 활성화:
   - Google Sheets API
   - BigQuery API
   - Google Drive API
   - Cloud Resource Manager API

## 실행 방법

```bash
npm start
```

브라우저에서 `http://localhost:3000` 접속

## 사용 방법

1. **Google 로그인**: Google 계정으로 로그인
2. **프로젝트 선택**: BigQuery 프로젝트 선택
3. **택소노미 로드**: Google Sheets URL 입력하여 이벤트 택소노미 로드
4. **SQL 생성**: 템플릿 선택 및 파라미터 설정
5. **데이터셋 선택**: 쿼리를 실행할 데이터셋 선택
6. **실행 및 저장**: 쿼리 실행, View 저장, 결과 내보내기

## 프로젝트 구조

```
├── server.js              # Express 서버
├── routes/               # API 라우트
├── services/             # 비즈니스 로직
├── templates/            # SQL 템플릿
├── public/               # 프론트엔드 파일
│   ├── index.html
│   ├── app.js
│   └── style.css
└── config/               # 설정 파일
```

## 기술 스택

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **APIs**: Google Sheets API, BigQuery API, OAuth 2.0
- **Template Engine**: Handlebars

## 라이센스

MIT
