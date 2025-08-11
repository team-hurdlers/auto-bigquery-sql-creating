const express = require('express');
const router = express.Router();
const resourceManagerService = require('../services/resourceManagerService');
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

router.get('/search', requireAuth, async (req, res) => {
  const { query } = req.query;
  
  try {
    const auth = googleApis.getAuthClient();
    const projects = await resourceManagerService.searchProjects(query, auth);
    
    res.json({ 
      projects: resourceManagerService.formatProjectData(projects)
    });
  } catch (error) {
    console.error('프로젝트 검색 실패:', error);
    res.status(500).json({ 
      error: '프로젝트 검색에 실패했습니다.',
      details: error.message 
    });
  }
});

router.get('/resources', requireAuth, async (req, res) => {
  try {
    const auth = googleApis.getAuthClient();
    const resources = await resourceManagerService.getAccessibleResources(auth);
    
    res.json(resources);
  } catch (error) {
    console.error('리소스 조회 실패:', error);
    res.status(500).json({ 
      error: '리소스 조회에 실패했습니다.',
      details: error.message 
    });
  }
});

router.get('/organizations', requireAuth, async (req, res) => {
  try {
    const auth = googleApis.getAuthClient();
    const organizations = await resourceManagerService.listOrganizations(auth);
    
    res.json({ organizations });
  } catch (error) {
    console.error('조직 목록 조회 실패:', error);
    res.status(500).json({ 
      error: '조직 목록을 가져올 수 없습니다.',
      details: error.message 
    });
  }
});

router.get('/folders', requireAuth, async (req, res) => {
  const { parent } = req.query;
  
  try {
    const auth = googleApis.getAuthClient();
    const folders = await resourceManagerService.listFolders(parent, auth);
    
    res.json({ folders });
  } catch (error) {
    console.error('폴더 목록 조회 실패:', error);
    res.status(500).json({ 
      error: '폴더 목록을 가져올 수 없습니다.',
      details: error.message 
    });
  }
});

router.get('/:projectId/hierarchy', requireAuth, async (req, res) => {
  const { projectId } = req.params;
  
  try {
    const auth = googleApis.getAuthClient();
    const hierarchy = await resourceManagerService.getProjectHierarchy(projectId, auth);
    
    res.json(hierarchy);
  } catch (error) {
    console.error('프로젝트 계층 조회 실패:', error);
    res.status(500).json({ 
      error: '프로젝트 계층을 가져올 수 없습니다.',
      details: error.message 
    });
  }
});

router.get('/by-parent', requireAuth, async (req, res) => {
  const { parent } = req.query;
  
  try {
    const auth = googleApis.getAuthClient();
    const projects = await resourceManagerService.getProjectsByParent(parent, auth);
    
    res.json({ 
      projects: resourceManagerService.formatProjectData(projects)
    });
  } catch (error) {
    console.error('부모별 프로젝트 조회 실패:', error);
    res.status(500).json({ 
      error: '프로젝트 목록을 가져올 수 없습니다.',
      details: error.message 
    });
  }
});

module.exports = router;