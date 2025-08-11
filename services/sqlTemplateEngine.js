const Handlebars = require('handlebars');
const sqlTemplates = require('../config/sql-templates');

class SqlTemplateEngine {
  constructor() {
    this.templates = sqlTemplates;
    this.compiledTemplates = {};
    this.initializeHelpers();
  }

  initializeHelpers() {
    Handlebars.registerHelper('formatEventList', (events) => {
      if (!events || events.length === 0) return '';
      return events.map(e => `'${e}'`).join(', ');
    });

    Handlebars.registerHelper('formatDate', (date) => {
      if (!date) return '';
      return date.replace(/-/g, '');
    });

    Handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
      switch (operator) {
        case '==': return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=': return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==': return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<': return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=': return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>': return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=': return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&': return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||': return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default: return options.inverse(this);
      }
    });
  }

  compileTemplate(templateKey) {
    if (!this.compiledTemplates[templateKey]) {
      const template = this.templates[templateKey];
      if (!template) {
        throw new Error(`템플릿을 찾을 수 없습니다: ${templateKey}`);
      }
      this.compiledTemplates[templateKey] = Handlebars.compile(template.template);
    }
    return this.compiledTemplates[templateKey];
  }

  generateParameterExtractions(parameters, scope = 'Event') {
    if (!parameters || parameters.length === 0) {
      return '';
    }

    const extractions = parameters.map(param => {
      let extraction = '';
      const columnName = param.name.replace(/[^a-zA-Z0-9_]/g, '_');
      
      if (scope === 'Event') {
        const valueField = this.getValueFieldByType(param.type);
        extraction = `(SELECT value.${valueField} FROM UNNEST(event_params) WHERE key = '${param.name}') as ${columnName}`;
      } else if (scope === 'Item') {
        const valueField = this.getValueFieldByType(param.type);
        extraction = `ARRAY(
    SELECT value.${valueField}
    FROM UNNEST(items) as item, 
    UNNEST(item.item_params) 
    WHERE key = '${param.name}'
  )[SAFE_OFFSET(0)] as ${columnName}`;
      } else if (scope === 'User') {
        const valueField = this.getValueFieldByType(param.type);
        extraction = `(SELECT value.${valueField} FROM UNNEST(user_properties) WHERE key = '${param.name}') as ${columnName}`;
      }
      
      return extraction;
    });

    return extractions.join(',\n  ');
  }

  generateParameterGroupBy(parameters) {
    if (!parameters || parameters.length === 0) {
      return '';
    }

    const groupByColumns = parameters.map(param => {
      const columnName = param.name.replace(/[^a-zA-Z0-9_]/g, '_');
      return `, ${columnName}`;
    }).join('');

    return groupByColumns;
  }

  getValueFieldByType(type) {
    const typeMap = {
      'STRING': 'string_value',
      'NUMERIC': 'double_value',
      'INT64': 'int_value',
      'FLOAT64': 'double_value',
      'BOOL': 'string_value',
      'DATE': 'string_value',
      'TIMESTAMP': 'string_value'
    };
    return typeMap[type.toUpperCase()] || 'string_value';
  }

  generateSql(templateKey, params, taxonomy) {
    try {
      const template = this.compileTemplate(templateKey);
      
      if (params.event_name && taxonomy) {
        const event = taxonomy.events.find(e => e.event_name === params.event_name);
        if (event && event.parameters) {
          params.parameter_extractions = this.generateParameterExtractions(event.parameters);
          params.parameter_group_by = this.generateParameterGroupBy(event.parameters);
          params.custom_parameter_extractions = params.parameter_extractions;
          params.custom_parameter_group_by = params.parameter_group_by;
        }
      }

      if (params.event_list && Array.isArray(params.event_list)) {
        params.event_list = params.event_list.map(e => `'${e}'`).join(', ');
      }

      if (params.start_date) {
        params.start_date = params.start_date.replace(/-/g, '');
      }
      if (params.end_date) {
        params.end_date = params.end_date.replace(/-/g, '');
      }

      return template(params);
    } catch (error) {
      console.error('SQL 생성 오류:', error);
      throw new Error(`SQL 생성 실패: ${error.message}`);
    }
  }

  generateCustomSql(eventData, params) {
    const { event_name, parameters } = eventData;
    
    let sql = `-- ${event_name} 이벤트 분석\n`;
    sql += `SELECT\n`;
    sql += `  DATE(TIMESTAMP_MICROS(event_timestamp)) as event_date,\n`;
    sql += `  event_name,\n`;
    
    if (parameters && parameters.length > 0) {
      const paramExtractions = this.generateParameterExtractions(parameters);
      sql += `  ${paramExtractions}\n`;
    }
    
    sql += `  COUNT(*) as event_count,\n`;
    sql += `  COUNT(DISTINCT user_pseudo_id) as unique_users\n`;
    sql += `FROM \`${params.project_id}.${params.dataset_id}.events_*\`\n`;
    sql += `WHERE _TABLE_SUFFIX BETWEEN '${params.start_date.replace(/-/g, '')}' AND '${params.end_date.replace(/-/g, '')}'\n`;
    sql += `  AND event_name = '${event_name}'\n`;
    sql += `GROUP BY event_date, event_name`;
    
    if (parameters && parameters.length > 0) {
      sql += this.generateParameterGroupBy(parameters);
    }
    
    sql += `\nORDER BY event_date DESC, event_count DESC\n`;
    sql += `LIMIT 1000`;
    
    return sql;
  }

  getAvailableTemplates() {
    return Object.keys(this.templates).map(key => ({
      key,
      name: this.templates[key].name,
      description: this.templates[key].description,
      parameters: this.templates[key].parameters
    }));
  }

  validateParameters(templateKey, params) {
    const template = this.templates[templateKey];
    if (!template) {
      throw new Error(`템플릿을 찾을 수 없습니다: ${templateKey}`);
    }

    const requiredParams = template.parameters.filter(p => 
      !p.startsWith('custom_') && !p.includes('_list') && !p.includes('_extractions') && !p.includes('_group_by')
    );

    const missingParams = requiredParams.filter(p => !params[p]);
    if (missingParams.length > 0) {
      throw new Error(`필수 파라미터가 누락되었습니다: ${missingParams.join(', ')}`);
    }

    return true;
  }

  estimateQueryCost(sql, dataSize = 1) {
    const processingCost = 5.0;
    const estimatedGB = dataSize;
    const estimatedCost = (estimatedGB * processingCost) / 1000;
    
    return {
      estimatedGB,
      estimatedCost: estimatedCost.toFixed(4),
      currency: 'USD',
      note: '실제 비용은 처리되는 데이터 크기에 따라 달라질 수 있습니다.'
    };
  }
}

module.exports = new SqlTemplateEngine();