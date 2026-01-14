/**
 * Built-in actions registry
 * Each action defines a configuration button that generates SQL for updating JSON fields
 */

const ACTIONS = [
  {
    id: 'cancel_order',
    title: 'Cancel Order',
    description: 'Enable or disable order cancellation',
    stationId: 'Dispatch',
    jsonPath: '$.cancelOrder',
    valueType: 'boolean',
    value: true,
    tableName: 'StoreStations',
    stationColumn: 'StationId',
    storeColumn: 'StoreNo',
    configColumn: 'Configuration',
    isBuiltIn: true
  },
  {
    id: 'enable_tips',
    title: 'Enable Tips',
    description: 'Enable or disable tips functionality',
    stationId: 'Dispatch',
    jsonPath: '$.tipsEnabled',
    valueType: 'boolean',
    value: true,
    tableName: 'StoreStations',
    stationColumn: 'StationId',
    storeColumn: 'StoreNo',
    configColumn: 'Configuration',
    isBuiltIn: true
  },
  {
    id: 'set_max_items',
    title: 'Set Max Items',
    description: 'Set maximum items allowed',
    stationId: 'Dispatch',
    jsonPath: '$.maxItems',
    valueType: 'number',
    value: 10,
    tableName: 'StoreStations',
    stationColumn: 'StationId',
    storeColumn: 'StoreNo',
    configColumn: 'Configuration',
    isBuiltIn: true
  },
  {
    id: 'free_sql',
    title: 'Free SQL',
    description: 'Paste any SQL and optionally add StoreNo filter',
    kind: 'free_sql',
    storeColumn: 'StoreNo',
    isBuiltIn: true
  }
];
