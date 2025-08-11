const express = require('express');
const router = express.Router();
const bigqueryService = require('../services/bigqueryService');
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

router.get('/projects', requireAuth, async (req, res) => {
  try {
    const auth = googleApis.getAuthClient();
    bigqueryService.initialize(auth);
    const projects = await bigqueryService.listProjects(auth);
    
    res.json({ projects });
  } catch (error) {
    console.error('프로젝트 목록 조회 실패:', error);
    res.status(500).json({ 
      error: '프로젝트 목록을 가져올 수 없습니다.',
      details: error.message 
    });
  }
});

router.get('/projects/:projectId/datasets', requireAuth, async (req, res) => {
  const { projectId } = req.params;
  
  try {
    const auth = googleApis.getAuthClient();
    bigqueryService.initialize(auth);
    const datasets = await bigqueryService.listDatasets(projectId, auth);
    
    res.json({ datasets });
  } catch (error) {
    console.error('데이터셋 목록 조회 실패:', error);
    res.status(500).json({ 
      error: '데이터셋 목록을 가져올 수 없습니다.',
      details: error.message 
    });
  }
});

router.get('/projects/:projectId/datasets/:datasetId/tables', requireAuth, async (req, res) => {
  const { projectId, datasetId } = req.params;
  
  try {
    const auth = googleApis.getAuthClient();
    bigqueryService.initialize(auth);
    const tables = await bigqueryService.listTables(projectId, datasetId, auth);
    const ga4Detection = await bigqueryService.detectGA4Tables(projectId, datasetId, auth);
    
    res.json({ 
      tables,
      ga4Detection 
    });
  } catch (error) {
    console.error('테이블 목록 조회 실패:', error);
    res.status(500).json({ 
      error: '테이블 목록을 가져올 수 없습니다.',
      details: error.message 
    });
  }
});

router.post('/execute', requireAuth, async (req, res) => {
  const { query, projectId } = req.body;
  
  if (!query || !projectId) {
    return res.status(400).json({ error: 'query와 projectId가 필요합니다.' });
  }

  try {
    const auth = googleApis.getAuthClient();
    bigqueryService.initialize(auth);
    const results = await bigqueryService.executeQuery(query, projectId, auth);
    
    res.json({
      success: true,
      results: {
        rows: results.rows.slice(0, 100),
        totalRows: results.totalRows,
        schema: results.schema,
        totalBytesProcessed: results.totalBytesProcessed,
        cacheHit: results.cacheHit
      }
    });
  } catch (error) {
    console.error('쿼리 실행 실패:', error);
    res.status(500).json({ 
      error: '쿼리 실행에 실패했습니다.',
      details: error.message 
    });
  }
});

router.post('/validate', requireAuth, async (req, res) => {
  const { query, projectId } = req.body;
  
  if (!query || !projectId) {
    return res.status(400).json({ error: 'query와 projectId가 필요합니다.' });
  }

  try {
    const auth = googleApis.getAuthClient();
    bigqueryService.initialize(auth);
    const validation = await bigqueryService.validateQuery(query, projectId, auth);
    
    res.json(validation);
  } catch (error) {
    console.error('쿼리 검증 실패:', error);
    res.status(500).json({ 
      error: '쿼리 검증에 실패했습니다.',
      details: error.message 
    });
  }
});

router.post('/create-view', requireAuth, async (req, res) => {
  const { projectId, datasetId, viewName, query } = req.body;
  
  if (!projectId || !datasetId || !viewName || !query) {
    return res.status(400).json({ 
      error: 'projectId, datasetId, viewName, query가 필요합니다.' 
    });
  }

  try {
    const auth = googleApis.getAuthClient();
    bigqueryService.initialize(auth);
    const result = await bigqueryService.createView(
      projectId, 
      datasetId, 
      viewName, 
      query, 
      auth
    );
    
    res.json(result);
  } catch (error) {
    console.error('뷰 생성 실패:', error);
    res.status(500).json({ 
      error: '뷰 생성에 실패했습니다.',
      details: error.message 
    });
  }
});

router.post('/export', requireAuth, async (req, res) => {
  const { query, projectId, format } = req.body;
  
  if (!query || !projectId || !format) {
    return res.status(400).json({ 
      error: 'query, projectId, format이 필요합니다.' 
    });
  }

  try {
    const auth = googleApis.getAuthClient();
    bigqueryService.initialize(auth);
    const exportData = await bigqueryService.exportQueryResults(
      query, 
      projectId, 
      format, 
      auth
    );
    
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const fileName = `export_${Date.now()}.${format}`;
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(exportData);
  } catch (error) {
    console.error('내보내기 실패:', error);
    res.status(500).json({ 
      error: '내보내기에 실패했습니다.',
      details: error.message 
    });
  }
});

module.exports = router;