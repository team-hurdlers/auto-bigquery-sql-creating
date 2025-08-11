const express = require('express');
const router = express.Router();
const sqlTemplateEngine = require('../services/sqlTemplateEngine');
const taxonomyParser = require('../services/taxonomyParser');

function requireAuth(req, res, next) {
  if (!req.session.tokens && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
  next();
}

router.get('/templates', (req, res) => {
  const templates = sqlTemplateEngine.getAvailableTemplates();
  res.json({ templates });
});

router.post('/generate', requireAuth, (req, res) => {
  const { templateKey, parameters } = req.body;
  
  if (!templateKey || !parameters) {
    return res.status(400).json({ 
      error: 'templateKey와 parameters가 필요합니다.' 
    });
  }

  try {
    sqlTemplateEngine.validateParameters(templateKey, parameters);
    
    const taxonomy = req.session.taxonomy || null;
    const sql = sqlTemplateEngine.generateSql(templateKey, parameters, taxonomy);
    const costEstimate = sqlTemplateEngine.estimateQueryCost(sql);
    
    res.json({
      success: true,
      sql,
      costEstimate,
      parameters
    });
  } catch (error) {
    console.error('SQL 생성 실패:', error);
    res.status(500).json({ 
      error: 'SQL 생성에 실패했습니다.',
      details: error.message 
    });
  }
});

router.post('/generate-custom', requireAuth, (req, res) => {
  const { eventName, parameters } = req.body;
  
  if (!eventName || !parameters) {
    return res.status(400).json({ 
      error: 'eventName과 parameters가 필요합니다.' 
    });
  }

  if (!req.session.taxonomy) {
    return res.status(400).json({ 
      error: '택소노미를 먼저 로드해주세요.' 
    });
  }

  try {
    const event = taxonomyParser.getEventByName(eventName);
    if (!event) {
      return res.status(404).json({ 
        error: '이벤트를 찾을 수 없습니다.' 
      });
    }

    const sql = sqlTemplateEngine.generateCustomSql(event, parameters);
    const costEstimate = sqlTemplateEngine.estimateQueryCost(sql);
    
    res.json({
      success: true,
      sql,
      costEstimate,
      event
    });
  } catch (error) {
    console.error('커스텀 SQL 생성 실패:', error);
    res.status(500).json({ 
      error: '커스텀 SQL 생성에 실패했습니다.',
      details: error.message 
    });
  }
});

router.post('/generate-batch', requireAuth, async (req, res) => {
  const { templates } = req.body;
  
  if (!templates || !Array.isArray(templates)) {
    return res.status(400).json({ 
      error: 'templates 배열이 필요합니다.' 
    });
  }

  try {
    const results = [];
    const taxonomy = req.session.taxonomy || null;
    
    for (const template of templates) {
      try {
        sqlTemplateEngine.validateParameters(template.templateKey, template.parameters);
        const sql = sqlTemplateEngine.generateSql(
          template.templateKey, 
          template.parameters, 
          taxonomy
        );
        
        results.push({
          templateKey: template.templateKey,
          success: true,
          sql,
          costEstimate: sqlTemplateEngine.estimateQueryCost(sql)
        });
      } catch (error) {
        results.push({
          templateKey: template.templateKey,
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('배치 SQL 생성 실패:', error);
    res.status(500).json({ 
      error: '배치 SQL 생성에 실패했습니다.',
      details: error.message 
    });
  }
});

router.post('/suggest-parameters', requireAuth, (req, res) => {
  const { templateKey } = req.body;
  
  if (!templateKey) {
    return res.status(400).json({ 
      error: 'templateKey가 필요합니다.' 
    });
  }

  const today = new Date();
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };

  const suggestions = {
    project_id: req.session.taxonomy?.projectInfo?.bigquery_project || 'your-project-id',
    dataset_id: req.session.taxonomy?.projectInfo?.dataset_id || 'analytics_123456789',
    start_date: formatDate(lastWeek),
    end_date: formatDate(today),
    event_list: req.session.taxonomy?.events?.slice(0, 5).map(e => e.event_name) || [],
    event_name: req.session.taxonomy?.events?.[0]?.event_name || 'page_view',
    ranges: {
      last_7_days: {
        start_date: formatDate(lastWeek),
        end_date: formatDate(today)
      },
      last_30_days: {
        start_date: formatDate(lastMonth),
        end_date: formatDate(today)
      },
      yesterday: {
        start_date: formatDate(new Date(today.getTime() - 24 * 60 * 60 * 1000)),
        end_date: formatDate(new Date(today.getTime() - 24 * 60 * 60 * 1000))
      }
    }
  };
  
  res.json({ suggestions });
});

module.exports = router;