const express = require('express');
const router = express.Router();
const sheetsService = require('../services/sheetsService');
const taxonomyParser = require('../services/taxonomyParser');
const googleApis = require('../config/google-apis');

function requireAuth(req, res, next) {
  if (!req.session.tokens && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
  
  if (req.session.tokens) {
    googleApis.setCredentials(req.session.tokens);
  }
  
  next();
}

router.post('/load-taxonomy', requireAuth, async (req, res) => {
  const { spreadsheetUrl } = req.body;
  
  if (!spreadsheetUrl) {
    return res.status(400).json({ error: 'spreadsheetUrl이 필요합니다.' });
  }

  try {
    const auth = googleApis.getAuthClient();
    const taxonomy = await sheetsService.getTaxonomyFromUrl(spreadsheetUrl, auth);
    
    req.session.taxonomy = taxonomy;
    
    res.json({
      success: true,
      taxonomy,
      recommendations: taxonomyParser.recommendTemplates()
    });
  } catch (error) {
    console.error('택소노미 로드 실패:', error);
    res.status(500).json({ 
      error: '택소노미 로드에 실패했습니다.',
      details: error.message 
    });
  }
});

router.post('/validate-sheet', requireAuth, async (req, res) => {
  const { spreadsheetUrl } = req.body;
  
  if (!spreadsheetUrl) {
    return res.status(400).json({ error: 'spreadsheetUrl이 필요합니다.' });
  }

  try {
    const spreadsheetId = sheetsService.extractSpreadsheetId(spreadsheetUrl);
    const auth = googleApis.getAuthClient();
    const validation = await sheetsService.validateSpreadsheetAccess(spreadsheetId, auth);
    
    res.json(validation);
  } catch (error) {
    console.error('시트 검증 실패:', error);
    res.status(500).json({ 
      error: '시트 검증에 실패했습니다.',
      details: error.message 
    });
  }
});

router.get('/taxonomy', requireAuth, (req, res) => {
  if (!req.session.taxonomy) {
    return res.status(404).json({ error: '로드된 택소노미가 없습니다.' });
  }
  
  res.json({
    taxonomy: req.session.taxonomy,
    recommendations: taxonomyParser.recommendTemplates()
  });
});

router.get('/events', requireAuth, (req, res) => {
  if (!req.session.taxonomy) {
    return res.status(404).json({ error: '택소노미를 먼저 로드해주세요.' });
  }
  
  res.json({
    all: req.session.taxonomy.events,
    ecommerce: taxonomyParser.getEcommerceEvents(),
    custom: taxonomyParser.getCustomEvents()
  });
});

router.get('/event/:eventName', requireAuth, (req, res) => {
  const { eventName } = req.params;
  
  if (!req.session.taxonomy) {
    return res.status(404).json({ error: '택소노미를 먼저 로드해주세요.' });
  }
  
  const event = taxonomyParser.getEventByName(eventName);
  
  if (!event) {
    return res.status(404).json({ error: '이벤트를 찾을 수 없습니다.' });
  }
  
  res.json(event);
});

module.exports = router;