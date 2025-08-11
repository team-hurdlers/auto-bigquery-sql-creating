const { BigQuery } = require('@google-cloud/bigquery');
const googleApis = require('../config/google-apis');

class BigQueryService {
  constructor() {
    this.bigqueryClient = null;
    this.googleBigqueryClient = null;
  }

  initialize(auth) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      this.bigqueryClient = new BigQuery({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
      });
    } else if (auth) {
      this.googleBigqueryClient = googleApis.getBigQueryClient(auth);
    }
  }

  async listProjects(auth) {
    try {
      if (!this.googleBigqueryClient) {
        this.googleBigqueryClient = googleApis.getBigQueryClient(auth);
      }

      const response = await this.googleBigqueryClient.projects.list();
      return response.data.projects || [];
    } catch (error) {
      console.error('프로젝트 목록 가져오기 실패:', error);
      throw new Error(`프로젝트 목록을 가져올 수 없습니다: ${error.message}`);
    }
  }

  async listDatasets(projectId, auth) {
    try {
      if (this.bigqueryClient) {
        const [datasets] = await this.bigqueryClient.getDatasets({ projectId });
        return datasets.map(dataset => ({
          id: dataset.id,
          projectId: dataset.metadata.datasetReference.projectId,
          location: dataset.metadata.location,
          creationTime: dataset.metadata.creationTime
        }));
      } else if (this.googleBigqueryClient || auth) {
        if (!this.googleBigqueryClient) {
          this.googleBigqueryClient = googleApis.getBigQueryClient(auth);
        }
        
        const response = await this.googleBigqueryClient.datasets.list({
          projectId
        });
        
        return response.data.datasets || [];
      }
    } catch (error) {
      console.error('데이터셋 목록 가져오기 실패:', error);
      throw new Error(`데이터셋 목록을 가져올 수 없습니다: ${error.message}`);
    }
  }

  async listTables(projectId, datasetId, auth) {
    try {
      if (this.bigqueryClient) {
        const dataset = this.bigqueryClient.dataset(datasetId, { projectId });
        const [tables] = await dataset.getTables();
        return tables.map(table => ({
          id: table.id,
          type: table.metadata.type,
          creationTime: table.metadata.creationTime,
          numRows: table.metadata.numRows,
          numBytes: table.metadata.numBytes
        }));
      } else if (this.googleBigqueryClient || auth) {
        if (!this.googleBigqueryClient) {
          this.googleBigqueryClient = googleApis.getBigQueryClient(auth);
        }
        
        const response = await this.googleBigqueryClient.tables.list({
          projectId,
          datasetId
        });
        
        return response.data.tables || [];
      }
    } catch (error) {
      console.error('테이블 목록 가져오기 실패:', error);
      throw new Error(`테이블 목록을 가져올 수 없습니다: ${error.message}`);
    }
  }

  async executeQuery(query, projectId, auth) {
    try {
      if (this.bigqueryClient) {
        const options = {
          query,
          location: 'US',
          projectId
        };

        const [job] = await this.bigqueryClient.createQueryJob(options);
        console.log(`쿼리 작업 생성됨: ${job.id}`);

        const [rows] = await job.getQueryResults();
        
        return {
          rows,
          totalRows: rows.length,
          schema: job.metadata.statistics.query.schema,
          totalBytesProcessed: job.metadata.statistics.query.totalBytesProcessed,
          cacheHit: job.metadata.statistics.query.cacheHit
        };
      } else if (this.googleBigqueryClient || auth) {
        if (!this.googleBigqueryClient) {
          this.googleBigqueryClient = googleApis.getBigQueryClient(auth);
        }

        const request = {
          projectId,
          resource: {
            query,
            useLegacySql: false,
            maxResults: 1000
          }
        };

        const response = await this.googleBigqueryClient.jobs.query(request);
        
        return {
          rows: response.data.rows || [],
          totalRows: response.data.totalRows,
          schema: response.data.schema,
          totalBytesProcessed: response.data.totalBytesProcessed,
          cacheHit: response.data.cacheHit
        };
      }
    } catch (error) {
      console.error('쿼리 실행 실패:', error);
      throw new Error(`쿼리 실행에 실패했습니다: ${error.message}`);
    }
  }

  async createView(projectId, datasetId, viewName, query, auth) {
    try {
      if (this.bigqueryClient) {
        const dataset = this.bigqueryClient.dataset(datasetId, { projectId });
        const [view] = await dataset.createTable(viewName, {
          view: {
            query,
            useLegacySql: false
          }
        });
        
        return {
          success: true,
          viewId: view.id,
          projectId,
          datasetId,
          viewName
        };
      } else if (this.googleBigqueryClient || auth) {
        if (!this.googleBigqueryClient) {
          this.googleBigqueryClient = googleApis.getBigQueryClient(auth);
        }

        const request = {
          projectId,
          datasetId,
          resource: {
            tableReference: {
              projectId,
              datasetId,
              tableId: viewName
            },
            view: {
              query,
              useLegacySql: false
            }
          }
        };

        const response = await this.googleBigqueryClient.tables.insert(request);
        
        return {
          success: true,
          viewId: response.data.id,
          projectId,
          datasetId,
          viewName
        };
      }
    } catch (error) {
      console.error('뷰 생성 실패:', error);
      throw new Error(`뷰 생성에 실패했습니다: ${error.message}`);
    }
  }

  async exportQueryResults(query, projectId, format, auth) {
    try {
      const results = await this.executeQuery(query, projectId, auth);
      
      if (format === 'csv') {
        return this.convertToCSV(results.rows, results.schema);
      } else if (format === 'json') {
        return JSON.stringify(results.rows, null, 2);
      } else {
        throw new Error(`지원하지 않는 형식입니다: ${format}`);
      }
    } catch (error) {
      console.error('쿼리 결과 내보내기 실패:', error);
      throw error;
    }
  }

  convertToCSV(rows, schema) {
    if (!rows || rows.length === 0) {
      return '';
    }

    const headers = schema ? schema.fields.map(field => field.name) : Object.keys(rows[0]);
    const csvRows = [headers.join(',')];

    for (const row of rows) {
      const values = [];
      if (schema) {
        for (const field of schema.fields) {
          const value = row.f[schema.fields.indexOf(field)].v;
          values.push(this.escapeCSVValue(value));
        }
      } else {
        for (const header of headers) {
          values.push(this.escapeCSVValue(row[header]));
        }
      }
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  escapeCSVValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }

  async validateQuery(query, projectId, auth) {
    try {
      if (this.bigqueryClient) {
        const options = {
          query,
          location: 'US',
          projectId,
          dryRun: true
        };

        const [job] = await this.bigqueryClient.createQueryJob(options);
        
        return {
          valid: true,
          totalBytesProcessed: job.metadata.statistics.query.totalBytesProcessed,
          estimatedCost: this.calculateEstimatedCost(job.metadata.statistics.query.totalBytesProcessed)
        };
      } else if (this.googleBigqueryClient || auth) {
        if (!this.googleBigqueryClient) {
          this.googleBigqueryClient = googleApis.getBigQueryClient(auth);
        }

        const request = {
          projectId,
          resource: {
            query,
            useLegacySql: false,
            dryRun: true
          }
        };

        const response = await this.googleBigqueryClient.jobs.query(request);
        
        return {
          valid: true,
          totalBytesProcessed: response.data.totalBytesProcessed,
          estimatedCost: this.calculateEstimatedCost(response.data.totalBytesProcessed)
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  calculateEstimatedCost(bytesProcessed) {
    const GB = parseInt(bytesProcessed) / (1024 * 1024 * 1024);
    const costPerTB = 5.0;
    const cost = (GB / 1024) * costPerTB;
    
    return {
      GB: GB.toFixed(2),
      estimatedCost: cost.toFixed(4),
      currency: 'USD'
    };
  }

  async detectGA4Tables(projectId, datasetId, auth) {
    try {
      const tables = await this.listTables(projectId, datasetId, auth);
      
      const ga4Tables = tables.filter(table => {
        const tableName = table.tableId || table.id;
        return tableName.startsWith('events_') || 
               tableName.startsWith('events_intraday_') ||
               tableName === 'events';
      });

      return {
        hasGA4Data: ga4Tables.length > 0,
        tables: ga4Tables,
        tablePattern: ga4Tables.length > 0 ? 'events_*' : null
      };
    } catch (error) {
      console.error('GA4 테이블 감지 실패:', error);
      return {
        hasGA4Data: false,
        tables: [],
        error: error.message
      };
    }
  }
}

module.exports = new BigQueryService();