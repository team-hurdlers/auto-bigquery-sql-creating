class TaxonomyParser {
  constructor() {
    this.cachedTaxonomy = null;
  }

  parseEventParameters(parametersData) {
    if (!parametersData || !Array.isArray(parametersData)) {
      return [];
    }

    return parametersData.map(row => ({
      name: row[0] || '',
      description: row[1] || '',
      type: this.normalizeDataType(row[2] || 'String'),
      scope: this.normalizeScope(row[3] || 'Event'),
      example: row[4] || ''
    })).filter(param => param.name);
  }

  normalizeDataType(type) {
    const typeMap = {
      'string': 'STRING',
      'number': 'NUMERIC',
      'int': 'INT64',
      'integer': 'INT64',
      'float': 'FLOAT64',
      'double': 'FLOAT64',
      'boolean': 'BOOL',
      'bool': 'BOOL',
      'date': 'DATE',
      'timestamp': 'TIMESTAMP'
    };
    return typeMap[type.toLowerCase()] || 'STRING';
  }

  normalizeScope(scope) {
    const normalizedScope = scope.toLowerCase();
    if (normalizedScope.includes('item')) return 'Item';
    if (normalizedScope.includes('user')) return 'User';
    return 'Event';
  }

  parseTaxonomySheet(sheetsData) {
    try {
      const taxonomy = {
        events: [],
        projectInfo: {},
        metadata: {
          parseDate: new Date().toISOString(),
          version: '1.0'
        }
      };

      if (!sheetsData || !sheetsData.sheets) {
        throw new Error('유효하지 않은 스프레드시트 데이터입니다.');
      }

      for (const sheet of sheetsData.sheets) {
        const sheetName = sheet.properties.title.toLowerCase();
        const data = sheet.data?.[0]?.rowData;

        if (!data) continue;

        if (sheetName.includes('event') || sheetName.includes('taxonomy')) {
          taxonomy.events = this.parseEventsSheet(data);
        } else if (sheetName.includes('project') || sheetName.includes('info')) {
          taxonomy.projectInfo = this.parseProjectInfoSheet(data);
        }
      }

      this.cachedTaxonomy = taxonomy;
      return taxonomy;
    } catch (error) {
      console.error('택소노미 파싱 오류:', error);
      throw error;
    }
  }

  parseEventsSheet(rowData) {
    const events = [];
    let currentEvent = null;
    let isHeaderRow = true;

    for (const row of rowData) {
      if (!row.values || row.values.length === 0) continue;
      
      if (isHeaderRow) {
        isHeaderRow = false;
        continue;
      }

      const values = row.values.map(cell => 
        cell.formattedValue || cell.effectiveValue?.stringValue || ''
      );

      if (values[0]) {
        if (currentEvent) {
          events.push(currentEvent);
        }
        
        currentEvent = {
          event_name: values[0],
          description: values[1] || '',
          platform: values[2] || '공통',
          category: values[3] || '',
          parameters: []
        };
      } else if (currentEvent && values[4]) {
        currentEvent.parameters.push({
          name: values[4],
          description: values[5] || '',
          type: this.normalizeDataType(values[6] || 'String'),
          scope: this.normalizeScope(values[7] || 'Event'),
          example: values[8] || '',
          required: values[9] === 'Y' || values[9] === 'true'
        });
      }
    }

    if (currentEvent) {
      events.push(currentEvent);
    }

    return events;
  }

  parseProjectInfoSheet(rowData) {
    const projectInfo = {};
    
    for (const row of rowData) {
      if (!row.values || row.values.length < 2) continue;
      
      const key = row.values[0]?.formattedValue || row.values[0]?.effectiveValue?.stringValue || '';
      const value = row.values[1]?.formattedValue || row.values[1]?.effectiveValue?.stringValue || '';
      
      if (key && value) {
        const normalizedKey = this.normalizeProjectKey(key);
        if (normalizedKey) {
          projectInfo[normalizedKey] = value;
        }
      }
    }
    
    return projectInfo;
  }

  normalizeProjectKey(key) {
    const keyMap = {
      'ga4_property_id': ['ga4', 'property', 'measurement'],
      'gtm_container_id': ['gtm', 'container', 'tag'],
      'bigquery_project': ['bigquery', 'bq', 'project'],
      'dataset_id': ['dataset', 'table'],
      'stream_name': ['stream', 'datastream']
    };

    const lowerKey = key.toLowerCase();
    
    for (const [normalized, patterns] of Object.entries(keyMap)) {
      if (patterns.some(pattern => lowerKey.includes(pattern))) {
        return normalized;
      }
    }
    
    return key.replace(/\s+/g, '_').toLowerCase();
  }

  async parseSheetsUrl(sheetsService, spreadsheetId, ranges = []) {
    try {
      const response = await sheetsService.spreadsheets.get({
        spreadsheetId,
        includeGridData: true,
        ranges: ranges.length > 0 ? ranges : undefined
      });

      return this.parseTaxonomySheet(response.data);
    } catch (error) {
      console.error('Google Sheets 데이터 가져오기 실패:', error);
      throw new Error(`스프레드시트를 읽을 수 없습니다: ${error.message}`);
    }
  }

  getEventByName(eventName) {
    if (!this.cachedTaxonomy) {
      throw new Error('택소노미가 로드되지 않았습니다.');
    }
    return this.cachedTaxonomy.events.find(e => e.event_name === eventName);
  }

  getEcommerceEvents() {
    if (!this.cachedTaxonomy) return [];
    
    const ecommerceEventNames = [
      'view_item', 'view_item_list', 'select_item', 'add_to_cart',
      'remove_from_cart', 'view_cart', 'begin_checkout', 'add_payment_info',
      'add_shipping_info', 'purchase', 'refund'
    ];
    
    return this.cachedTaxonomy.events.filter(e => 
      ecommerceEventNames.includes(e.event_name)
    );
  }

  getCustomEvents() {
    if (!this.cachedTaxonomy) return [];
    
    const defaultEvents = [
      'page_view', 'session_start', 'first_visit', 'user_engagement',
      'scroll', 'click', 'view_search_results', 'video_start', 'video_progress',
      'video_complete', 'file_download', 'form_start', 'form_submit'
    ];
    
    return this.cachedTaxonomy.events.filter(e => 
      !defaultEvents.includes(e.event_name) && !this.getEcommerceEvents().includes(e)
    );
  }

  recommendTemplates() {
    if (!this.cachedTaxonomy) {
      return {
        ecommerce: false,
        engagement: false,
        conversion: false,
        custom: false
      };
    }

    const ecommerceEvents = this.getEcommerceEvents();
    const customEvents = this.getCustomEvents();
    
    return {
      ecommerce: ecommerceEvents.length > 0,
      engagement: this.cachedTaxonomy.events.some(e => 
        ['scroll', 'click', 'video_start', 'user_engagement'].includes(e.event_name)
      ),
      conversion: this.cachedTaxonomy.events.some(e => 
        e.event_name.includes('signup') || e.event_name.includes('conversion') ||
        e.event_name.includes('complete') || e.event_name.includes('submit')
      ),
      custom: customEvents.length > 0
    };
  }
}

module.exports = new TaxonomyParser();