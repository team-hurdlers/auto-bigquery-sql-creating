const sqlTemplates = {
  eventOverview: {
    name: '이벤트 발생 현황 (전체)',
    description: '선택한 이벤트들의 전체적인 발생 현황을 분석합니다.',
    template: `SELECT 
  event_name,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_pseudo_id) as unique_users,
  DATE(TIMESTAMP_MICROS(event_timestamp)) as event_date
FROM \`{{project_id}}.{{dataset_id}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN '{{start_date}}' AND '{{end_date}}'
  {{#if event_list}}AND event_name IN ({{event_list}}){{/if}}
GROUP BY event_name, event_date
ORDER BY event_date DESC, event_count DESC`,
    parameters: ['project_id', 'dataset_id', 'start_date', 'end_date', 'event_list']
  },

  eventParameters: {
    name: '특정 이벤트 파라미터 분석',
    description: '선택한 이벤트의 파라미터 값들을 상세 분석합니다.',
    template: `SELECT 
  event_name,
  {{parameter_extractions}}
  COUNT(*) as event_count,
  COUNT(DISTINCT user_pseudo_id) as unique_users
FROM \`{{project_id}}.{{dataset_id}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN '{{start_date}}' AND '{{end_date}}'
  AND event_name = '{{event_name}}'
GROUP BY event_name{{parameter_group_by}}
ORDER BY event_count DESC
LIMIT 100`,
    parameters: ['project_id', 'dataset_id', 'start_date', 'end_date', 'event_name', 'parameter_extractions', 'parameter_group_by']
  },

  ecommerceFunnel: {
    name: '전자상거래 퍼널 분석',
    description: '전자상거래 이벤트들의 전환 퍼널을 분석합니다.',
    template: `WITH funnel_data AS (
  SELECT
    user_pseudo_id,
    COUNTIF(event_name = 'view_item') as view_item_count,
    COUNTIF(event_name = 'add_to_cart') as add_to_cart_count,
    COUNTIF(event_name = 'begin_checkout') as begin_checkout_count,
    COUNTIF(event_name = 'purchase') as purchase_count,
    MAX(IF(event_name = 'purchase', 
      (SELECT value.double_value FROM UNNEST(event_params) WHERE key = 'value'), 
      NULL)) as purchase_value
  FROM \`{{project_id}}.{{dataset_id}}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '{{start_date}}' AND '{{end_date}}'
    AND event_name IN ('view_item', 'add_to_cart', 'begin_checkout', 'purchase')
  GROUP BY user_pseudo_id
)
SELECT
  COUNT(DISTINCT user_pseudo_id) as total_users,
  COUNTIF(view_item_count > 0) as viewed_item_users,
  COUNTIF(add_to_cart_count > 0) as added_to_cart_users,
  COUNTIF(begin_checkout_count > 0) as began_checkout_users,
  COUNTIF(purchase_count > 0) as purchased_users,
  SAFE_DIVIDE(COUNTIF(add_to_cart_count > 0), COUNTIF(view_item_count > 0)) * 100 as view_to_cart_rate,
  SAFE_DIVIDE(COUNTIF(begin_checkout_count > 0), COUNTIF(add_to_cart_count > 0)) * 100 as cart_to_checkout_rate,
  SAFE_DIVIDE(COUNTIF(purchase_count > 0), COUNTIF(begin_checkout_count > 0)) * 100 as checkout_to_purchase_rate,
  SUM(purchase_value) as total_revenue,
  AVG(purchase_value) as avg_purchase_value
FROM funnel_data`,
    parameters: ['project_id', 'dataset_id', 'start_date', 'end_date']
  },

  userEngagement: {
    name: '사용자 참여도 분석',
    description: '사용자들의 이벤트 참여 패턴을 분석합니다.',
    template: `SELECT
  user_pseudo_id,
  COUNT(DISTINCT DATE(TIMESTAMP_MICROS(event_timestamp))) as active_days,
  COUNT(DISTINCT event_name) as unique_events,
  COUNT(*) as total_events,
  MIN(TIMESTAMP_MICROS(event_timestamp)) as first_seen,
  MAX(TIMESTAMP_MICROS(event_timestamp)) as last_seen,
  TIMESTAMP_DIFF(
    MAX(TIMESTAMP_MICROS(event_timestamp)), 
    MIN(TIMESTAMP_MICROS(event_timestamp)), 
    DAY
  ) as days_active
FROM \`{{project_id}}.{{dataset_id}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN '{{start_date}}' AND '{{end_date}}'
  {{#if event_list}}AND event_name IN ({{event_list}}){{/if}}
GROUP BY user_pseudo_id
ORDER BY total_events DESC
LIMIT 1000`,
    parameters: ['project_id', 'dataset_id', 'start_date', 'end_date', 'event_list']
  },

  eventSequence: {
    name: '이벤트 시퀀스 분석',
    description: '사용자별 이벤트 발생 순서를 분석합니다.',
    template: `WITH event_sequence AS (
  SELECT
    user_pseudo_id,
    event_name,
    TIMESTAMP_MICROS(event_timestamp) as event_time,
    LAG(event_name) OVER (
      PARTITION BY user_pseudo_id 
      ORDER BY event_timestamp
    ) as previous_event,
    LEAD(event_name) OVER (
      PARTITION BY user_pseudo_id 
      ORDER BY event_timestamp
    ) as next_event
  FROM \`{{project_id}}.{{dataset_id}}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '{{start_date}}' AND '{{end_date}}'
    {{#if event_list}}AND event_name IN ({{event_list}}){{/if}}
)
SELECT
  previous_event,
  event_name,
  next_event,
  COUNT(*) as sequence_count
FROM event_sequence
WHERE previous_event IS NOT NULL
GROUP BY previous_event, event_name, next_event
ORDER BY sequence_count DESC
LIMIT 100`,
    parameters: ['project_id', 'dataset_id', 'start_date', 'end_date', 'event_list']
  },

  dailyTrends: {
    name: '일별 트렌드 분석',
    description: '이벤트들의 일별 발생 트렌드를 분석합니다.',
    template: `SELECT
  DATE(TIMESTAMP_MICROS(event_timestamp)) as event_date,
  event_name,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_pseudo_id) as unique_users,
  COUNT(*) / COUNT(DISTINCT user_pseudo_id) as events_per_user
FROM \`{{project_id}}.{{dataset_id}}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN '{{start_date}}' AND '{{end_date}}'
  {{#if event_list}}AND event_name IN ({{event_list}}){{/if}}
GROUP BY event_date, event_name
ORDER BY event_date DESC, event_count DESC`,
    parameters: ['project_id', 'dataset_id', 'start_date', 'end_date', 'event_list']
  },

  customEventAnalysis: {
    name: '커스텀 이벤트 상세 분석',
    description: '커스텀 이벤트의 모든 파라미터를 추출하여 분석합니다.',
    template: `WITH event_data AS (
  SELECT
    user_pseudo_id,
    event_name,
    TIMESTAMP_MICROS(event_timestamp) as event_time,
    device.category as device_category,
    device.operating_system as os,
    geo.country as country,
    traffic_source.source as traffic_source,
    traffic_source.medium as traffic_medium,
    event_params
  FROM \`{{project_id}}.{{dataset_id}}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '{{start_date}}' AND '{{end_date}}'
    AND event_name = '{{event_name}}'
)
SELECT
  event_name,
  device_category,
  os,
  country,
  traffic_source,
  traffic_medium,
  {{custom_parameter_extractions}}
  COUNT(*) as event_count,
  COUNT(DISTINCT user_pseudo_id) as unique_users
FROM event_data
GROUP BY 
  event_name,
  device_category,
  os,
  country,
  traffic_source,
  traffic_medium
  {{custom_parameter_group_by}}
ORDER BY event_count DESC
LIMIT 500`,
    parameters: ['project_id', 'dataset_id', 'start_date', 'end_date', 'event_name', 'custom_parameter_extractions', 'custom_parameter_group_by']
  }
};

module.exports = sqlTemplates;