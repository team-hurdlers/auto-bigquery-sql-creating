const express = require('express');
const router = express.Router();
const googleApis = require('../config/google-apis');

router.get('/google', (req, res) => {
  try {
    const authUrl = googleApis.getAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('인증 URL 생성 실패:', error);
    res.status(500).json({ error: '인증 URL 생성에 실패했습니다.' });
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: '인증 코드가 없습니다.' });
  }

  try {
    const tokens = await googleApis.getTokenFromCode(code);
    req.session.tokens = tokens;
    req.session.authenticated = true;
    
    res.redirect('/');
  } catch (error) {
    console.error('토큰 교환 실패:', error);
    res.status(500).json({ error: '인증에 실패했습니다.' });
  }
});

router.get('/status', (req, res) => {
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