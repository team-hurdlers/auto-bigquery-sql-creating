# Vercel 배포 가이드

## Vercel 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:

1. **Settings > Environment Variables**로 이동

2. 다음 변수들을 추가:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
SESSION_SECRET=your-random-session-secret
NODE_ENV=production
```

3. **GOOGLE_REDIRECT_URI는 설정하지 마세요** - Vercel URL이 자동으로 감지됩니다.

## Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com)에서 OAuth 2.0 Client 설정

2. **Authorized redirect URIs**에 다음 URL들을 추가:
   - `https://your-app-name.vercel.app/api/auth/callback`
   - `https://auto-bigquery-sql-creating.vercel.app/api/auth/callback`
   - 기타 Vercel preview URL들

## 배포 방법

### GitHub 연동 (권장)

1. Vercel 대시보드에서 **New Project** 클릭
2. GitHub 저장소 import
3. 환경 변수 설정
4. Deploy 클릭

### CLI 사용

```bash
npm i -g vercel
vercel
```

## 주의사항

1. **세션 저장**: Vercel은 서버리스 환경이므로 메모리 기반 세션이 작동하지 않습니다. 
   - 현재는 임시로 메모리 세션을 사용하지만, 프로덕션에서는 Redis 등의 외부 세션 스토어를 사용하는 것이 좋습니다.

2. **콜드 스타트**: 첫 요청 시 지연이 있을 수 있습니다.

3. **환경 변수**: Vercel 대시보드에서 설정한 환경 변수는 재배포 시 자동으로 적용됩니다.

## 트러블슈팅

### 로그인이 안 되는 경우

1. Google Cloud Console에서 redirect URI가 올바르게 설정되었는지 확인
2. Vercel 환경 변수가 모두 설정되었는지 확인
3. 브라우저 쿠키를 삭제하고 다시 시도

### 세션이 유지되지 않는 경우

서버리스 환경의 한계로 인해 세션이 간헐적으로 초기화될 수 있습니다. 
프로덕션 환경에서는 다음을 고려하세요:

- Redis 세션 스토어 추가
- JWT 토큰 기반 인증으로 변경
- Vercel KV 스토리지 사용