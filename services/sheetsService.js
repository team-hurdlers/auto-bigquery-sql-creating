const googleApis = require('../config/google-apis');
const taxonomyParser = require('./taxonomyParser');

class SheetsService {
  constructor() {
    this.sheetsClient = null;
  }

  initialize(auth) {
    this.sheetsClient = googleApis.getSheetsClient(auth);
  }

  extractSpreadsheetId(url) {
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /[?&]id=([a-zA-Z0-9-_]+)/,
      /^([a-zA-Z0-9-_]+)$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    throw new Error('유효하지 않은 Google Sheets URL입니다.');
  }

  async getTaxonomyFromUrl(url, auth) {
    try {
      if (!this.sheetsClient) {
        this.initialize(auth);
      }

      const spreadsheetId = this.extractSpreadsheetId(url);
      
      const metadataResponse = await this.sheetsClient.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      });

      const sheetNames = metadataResponse.data.sheets.map(sheet => sheet.properties.title);
      console.log('발견된 시트:', sheetNames);

      const response = await this.sheetsClient.spreadsheets.get({
        spreadsheetId,
        includeGridData: true
      });

      return taxonomyParser.parseTaxonomySheet(response.data);
    } catch (error) {
      console.error('Google Sheets 읽기 오류:', error);
      throw new Error(`스프레드시트를 읽을 수 없습니다: ${error.message}`);
    }
  }

  async getSheetData(spreadsheetId, range, auth) {
    try {
      if (!this.sheetsClient) {
        this.initialize(auth);
      }

      const response = await this.sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      return response.data.values || [];
    } catch (error) {
      console.error('시트 데이터 가져오기 오류:', error);
      throw error;
    }
  }

  async batchGetSheetData(spreadsheetId, ranges, auth) {
    try {
      if (!this.sheetsClient) {
        this.initialize(auth);
      }

      const response = await this.sheetsClient.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      return response.data.valueRanges || [];
    } catch (error) {
      console.error('배치 데이터 가져오기 오류:', error);
      throw error;
    }
  }

  async validateSpreadsheetAccess(spreadsheetId, auth) {
    try {
      if (!this.sheetsClient) {
        this.initialize(auth);
      }

      const response = await this.sheetsClient.spreadsheets.get({
        spreadsheetId,
        fields: 'spreadsheetId,properties.title'
      });

      return {
        accessible: true,
        title: response.data.properties.title,
        spreadsheetId: response.data.spreadsheetId
      };
    } catch (error) {
      return {
        accessible: false,
        error: error.message
      };
    }
  }

  parseSimpleTaxonomy(data) {
    const taxonomy = {
      events: [],
      projectInfo: {},
      metadata: {
        parseDate: new Date().toISOString()
      }
    };

    if (!data || data.length === 0) {
      return taxonomy;
    }

    const headers = data[0];
    const eventNameIndex = headers.findIndex(h => 
      h && h.toLowerCase().includes('event')
    );
    const descriptionIndex = headers.findIndex(h => 
      h && h.toLowerCase().includes('description')
    );
    const platformIndex = headers.findIndex(h => 
      h && h.toLowerCase().includes('platform')
    );

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const eventName = row[eventNameIndex] || row[0];
      if (!eventName) continue;

      taxonomy.events.push({
        event_name: eventName,
        description: row[descriptionIndex] || '',
        platform: row[platformIndex] || '공통',
        parameters: []
      });
    }

    return taxonomy;
  }
}

module.exports = new SheetsService();