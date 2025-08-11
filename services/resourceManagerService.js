const { google } = require('googleapis');
const googleApis = require('../config/google-apis');

class ResourceManagerService {
  constructor() {
    this.resourceManagerV3 = null;
    this.cloudResourceManagerV1 = null;
  }

  initialize(auth) {
    this.resourceManagerV3 = google.cloudresourcemanager({ version: 'v3', auth });
    this.cloudResourceManagerV1 = google.cloudresourcemanager({ version: 'v1', auth });
  }

  async searchProjects(query, auth) {
    try {
      if (!this.resourceManagerV3) {
        this.initialize(auth);
      }

      const searchQuery = query ? `displayName:"*${query}*" OR name:"*${query}*"` : '';
      
      const response = await this.resourceManagerV3.projects.search({
        query: searchQuery,
        pageSize: 100
      });

      return response.data.projects || [];
    } catch (error) {
      console.error('프로젝트 검색 실패:', error);
      
      try {
        const fallbackResponse = await this.listProjectsV1(auth);
        if (query) {
          return fallbackResponse.filter(p => 
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.projectId.toLowerCase().includes(query.toLowerCase())
          );
        }
        return fallbackResponse;
      } catch (fallbackError) {
        console.error('Fallback 프로젝트 목록 실패:', fallbackError);
        throw new Error(`프로젝트 검색 실패: ${error.message}`);
      }
    }
  }

  async listProjectsV1(auth) {
    try {
      if (!this.cloudResourceManagerV1) {
        this.initialize(auth);
      }

      const response = await this.cloudResourceManagerV1.projects.list({
        pageSize: 200,
        filter: 'lifecycleState:ACTIVE'
      });

      return response.data.projects || [];
    } catch (error) {
      console.error('V1 프로젝트 목록 실패:', error);
      return [];
    }
  }

  async listOrganizations(auth) {
    try {
      if (!this.resourceManagerV3) {
        this.initialize(auth);
      }

      const response = await this.resourceManagerV3.organizations.search({});
      return response.data.organizations || [];
    } catch (error) {
      console.error('조직 목록 조회 실패:', error);
      return [];
    }
  }

  async listFolders(parent, auth) {
    try {
      if (!this.resourceManagerV3) {
        this.initialize(auth);
      }

      const response = await this.resourceManagerV3.folders.list({
        parent: parent || '',
        pageSize: 100
      });

      return response.data.folders || [];
    } catch (error) {
      console.error('폴더 목록 조회 실패:', error);
      return [];
    }
  }

  async getProjectHierarchy(projectId, auth) {
    try {
      if (!this.resourceManagerV3) {
        this.initialize(auth);
      }

      const project = await this.resourceManagerV3.projects.get({
        name: `projects/${projectId}`
      });

      const hierarchy = {
        project: project.data,
        parent: null,
        organization: null
      };

      if (project.data.parent) {
        const parentType = project.data.parent.split('/')[0];
        const parentId = project.data.parent.split('/')[1];

        if (parentType === 'folders') {
          const folder = await this.resourceManagerV3.folders.get({
            name: project.data.parent
          });
          hierarchy.parent = folder.data;
        } else if (parentType === 'organizations') {
          const org = await this.resourceManagerV3.organizations.get({
            name: project.data.parent
          });
          hierarchy.organization = org.data;
        }
      }

      return hierarchy;
    } catch (error) {
      console.error('프로젝트 계층 조회 실패:', error);
      return null;
    }
  }

  async getProjectsByParent(parent, auth) {
    try {
      if (!this.resourceManagerV3) {
        this.initialize(auth);
      }

      const query = parent ? `parent:${parent}` : '';
      
      const response = await this.resourceManagerV3.projects.search({
        query,
        pageSize: 100
      });

      return response.data.projects || [];
    } catch (error) {
      console.error('부모별 프로젝트 조회 실패:', error);
      return [];
    }
  }

  formatProjectData(projects) {
    return projects.map(project => ({
      projectId: project.projectId,
      name: project.name,
      displayName: project.displayName || project.name,
      state: project.state || project.lifecycleState,
      createTime: project.createTime,
      parent: project.parent,
      labels: project.labels || {}
    }));
  }

  async getAccessibleResources(auth) {
    const resources = {
      organizations: [],
      folders: [],
      projects: []
    };

    try {
      // 조직 목록 시도 (권한이 있는 경우에만)
      try {
        resources.organizations = await this.listOrganizations(auth);
      } catch (orgError) {
        console.log('조직 목록 접근 불가 - 권한 없음');
      }

      // 프로젝트 목록 가져오기 (BigQuery API fallback 포함)
      let projects = [];
      try {
        projects = await this.searchProjects('', auth);
      } catch (error) {
        // Resource Manager API 실패시 BigQuery API로 fallback
        console.log('Resource Manager API 실패, BigQuery API로 시도');
        projects = await this.getProjectsFromBigQuery(auth);
      }
      
      resources.projects = this.formatProjectData(projects);

      // 폴더 정보 시도 (권한이 있는 경우에만)
      const uniqueParents = new Set();
      projects.forEach(project => {
        if (project.parent && project.parent.startsWith('folders/')) {
          uniqueParents.add(project.parent);
        }
      });

      for (const folderId of uniqueParents) {
        try {
          const folder = await this.resourceManagerV3.folders.get({
            name: folderId
          });
          resources.folders.push(folder.data);
        } catch (error) {
          console.log(`폴더 ${folderId} 접근 불가`);
        }
      }

      return resources;
    } catch (error) {
      console.error('리소스 접근 권한 조회 실패:', error);
      return resources;
    }
  }

  async getProjectsFromBigQuery(auth) {
    try {
      const bigquery = google.bigquery({ version: 'v2', auth });
      const response = await bigquery.projects.list();
      return response.data.projects || [];
    } catch (error) {
      console.error('BigQuery 프로젝트 목록 조회 실패:', error);
      return [];
    }
  }
}

module.exports = new ResourceManagerService();