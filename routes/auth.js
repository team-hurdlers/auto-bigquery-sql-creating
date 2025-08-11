const express = require('express');
const router = express.Router();
const googleApis = require('../config/google-apis');

router.get('/google', (req, res) => {
  try {
    console.log('OAuth 초기화 시도 중...');
    console.log('환경:', {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET
    });
    
    const authUrl = googleApis.getAuthUrl();
    console.log('생성된 Auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('인증 URL 생성 실패:', error);
    res.status(500).json({ error: '인증 URL 생성에 실패했습니다.', details: error.message });
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: '인증 코드가 없습니다.' });
  }

  try {
    console.log('토큰 교환 시작, 코드:', code.substring(0, 20) + '...');
    const tokens = await googleApis.getTokenFromCode(code);
    console.log('토큰 교환 성공');
    
    req.session.tokens = tokens;
    req.session.authenticated = true;
    
    // 세션 저장 강제
    req.session.save((err) => {
      if (err) {
        console.error('세션 저장 실패:', err);
        return res.status(500).json({ error: '세션 저장 실패' });
      }
      console.log('세션 저장 성공');
      res.redirect('/');
    });
  } catch (error) {
    console.error('토큰 교환 실패:', error);
    res.status(500).json({ error: '인증에 실패했습니다.' });
  }
});

router.get('/status', (req, res) => {
  console.log('세션 상태 확인:', {
    sessionExists: !!req.session,
    tokens: !!req.session?.tokens,
    authenticated: !!req.session?.authenticated
  });
  
  res.json({
    authenticated: !!req.session.tokens,
    hasServiceAccount: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    user: req.session.user || null
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: '로그아웃 실패' });
    }
    res.json({ message: '로그아웃 성공' });
  });
});

router.post('/refresh', async (req, res) => {
  if (!req.session.tokens || !req.session.tokens.refresh_token) {
    return res.status(401).json({ error: '리프레시 토큰이 없습니다.' });
  }

  try {
    googleApis.setCredentials(req.session.tokens);
    const oauth2Client = googleApis.getAuthClient();
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    req.session.tokens = credentials;
    
    res.json({ message: '토큰 갱신 성공' });
  } catch (error) {
    console.error('토큰 갱신 실패:', error);
    res.status(500).json({ error: '토큰 갱신 실패' });
  }
});

module.exports = router;