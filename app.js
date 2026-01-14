/**
 * Main application logic for SQL Configuration Generator
 */

// Shared configurations storage - using a simple approach
// No tokens needed! Uses a public JSON file that can be updated
const SHARED_CONFIGS_URL = 'https://raw.githubusercontent.com/sagikrief-glitch/sqlgenerator/master/shared-configs.json';

// Application state
let allActions = [];
let selectedAction = null;
let editingActionId = null;
let isMultiMode = false;
let multiRows = [];
let isModalMultiMode = false;
let modalMultiRows = [];

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    await loadActions();
    renderActionsList();
    setupEventListeners();
    loadLastUsedValues();
});

/**
 * Load actions from built-in, shared configs (Firebase), and localStorage
 */
async function loadActions() {
    // Load built-in actions
    const builtInActions = ACTIONS.map(action => ({ ...action, isBuiltIn: true }));
    
    // Load shared actions from GitHub (public, no token needed for reading)
    let sharedActions = [];
    try {
        const response = await fetch(SHARED_CONFIGS_URL);
        if (response.ok) {
            sharedActions = await response.json();
            // Mark as shared
            sharedActions = sharedActions.map(action => ({ ...action, isShared: true, isBuiltIn: false }));
        }
    } catch (error) {
        console.log('Could not load shared configurations:', error);
    }
    
    // Load custom actions from localStorage
    const customActionsJson = localStorage.getItem('customActions');
    const customActions = customActionsJson ? JSON.parse(customActionsJson) : [];
    
    // Merge: built-in → shared → local (local can override shared with same ID)
    const allSharedAndLocal = [...sharedActions, ...customActions];
    // Remove duplicates (local takes precedence)
    const uniqueActions = [];
    const seenIds = new Set();
    allSharedAndLocal.forEach(action => {
        if (!seenIds.has(action.id)) {
            seenIds.add(action.id);
            uniqueActions.push(action);
        }
    });
    
    allActions = [...builtInActions, ...uniqueActions];
}

/**
 * Save custom actions to localStorage
 */
function saveCustomActions() {
    // Only save local actions (not shared or built-in)
    const customActions = allActions.filter(action => !action.isBuiltIn && !action.isShared);
    localStorage.setItem('customActions', JSON.stringify(customActions));
}

/**
 * Render actions list
 */
function renderActionsList() {
    const actionsList = document.getElementById('actionsList');
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    // Filter actions based on search, excluding only the built-in free_sql (saved queries appear in list)
    const filteredActions = allActions.filter(action => 
        !(action.kind === 'free_sql' && action.isBuiltIn) &&
        (action.title.toLowerCase().includes(searchTerm) ||
        (action.description && action.description.toLowerCase().includes(searchTerm)))
    );
    
    if (filteredActions.length === 0) {
        actionsList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No actions found</p>';
        return;
    }
    
    actionsList.innerHTML = filteredActions.map(action => {
        const isActive = selectedAction && selectedAction.id === action.id;
        const canEdit = !action.isBuiltIn && !action.isShared;
        const isShared = action.isShared === true;
        
        return `
            <div class="action-card ${isActive ? 'active' : ''}" data-action-id="${action.id}">
                <div class="action-card-title">
                    ${escapeHtml(action.title)}
                    ${isShared ? '<span style="background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">SHARED</span>' : ''}
                </div>
                ${action.description ? `<div class="action-card-description">${escapeHtml(action.description)}</div>` : ''}
                <div class="action-card-actions">
                    ${canEdit ? `
                        <button class="btn-edit" onclick="event.stopPropagation(); editAction('${action.id}')">Edit</button>
                        <button class="btn-delete" onclick="event.stopPropagation(); deleteAction('${action.id}')">Delete</button>
                    ` : ''}
                    ${isShared ? `
                        <button class="btn-clone" onclick="event.stopPropagation(); addToLocal('${action.id}')" title="Add to my local configs">Add to Local</button>
                    ` : `
                    <button class="btn-clone" onclick="event.stopPropagation(); cloneAction('${action.id}')">Clone</button>
                        <button class="btn-clone" onclick="event.stopPropagation(); addToShared('${action.id}')" style="background: #4CAF50;" title="Share with team">Share</button>
                    `}
                </div>
            </div>
        `;
    }).join('');
    
    // Add click listeners
    actionsList.querySelectorAll('.action-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const actionId = card.dataset.actionId;
            selectAction(actionId);
        });
    });
}

/**
 * Select an action and render its form
 */
function selectAction(actionId) {
    selectedAction = allActions.find(a => a.id === actionId);
    if (!selectedAction) return;
    
    // Reset multi-mode when selecting a new action
    isMultiMode = false;
    multiRows = [];
    
    renderActionForm();
}

/**
 * Render form for selected action
 */
function renderActionForm() {
    const formContainer = document.getElementById('formContainer');
    if (!selectedAction) {
        formContainer.innerHTML = '<p class="placeholder-text">Select an action to get started</p>';
        return;
    }
    
    const action = selectedAction;
    
    // Check if this is a free_sql action
    if (action.kind === 'free_sql') {
        renderFreeSQLForm(action);
        return;
    }
    
    const lastStationId = localStorage.getItem('lastStationId') || action.stationId || '';
    const lastStoreNos = localStorage.getItem('lastStoreNos') || '';
    
    formContainer.innerHTML = `
        <div class="title-header">
            <h3 id="actionTitleDisplay">${escapeHtml(action.title)}</h3>
            ${!action.isBuiltIn ? `
                <button class="btn-edit-title" id="editTitleBtn" title="Edit title">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.333 2.00001C11.5084 1.82445 11.7163 1.68506 11.9448 1.58933C12.1733 1.4936 12.4179 1.44336 12.6663 1.44336C12.9148 1.44336 13.1594 1.4936 13.3879 1.58933C13.6164 1.68506 13.8243 1.82445 13.9997 2.00001C14.1752 2.17557 14.3146 2.38345 14.4103 2.61194C14.5061 2.84043 14.5563 3.08501 14.5563 3.33345C14.5563 3.58189 14.5061 3.82647 14.4103 4.05496C14.3146 4.28345 14.1752 4.49133 13.9997 4.66689L5.33301 13.3336L1.33301 14.6669L2.66634 10.6669L11.333 2.00001Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            ` : ''}
        </div>
        ${action.description ? `<p style="color: #666; margin-bottom: 20px;">${escapeHtml(action.description)}</p>` : ''}
        
        <form id="actionForm">
            <div class="form-group">
                <label for="stationId">StationId *</label>
                <input type="text" id="stationId" value="${escapeHtml(lastStationId)}" required>
            </div>
            
            <div class="form-group">
                <label for="storeNos">StoreNos *</label>
                <textarea id="storeNos" placeholder="123, 124, 125 or 100-105 or one per line" required>${escapeHtml(lastStoreNos)}</textarea>
                <div id="storeNosError" class="error-message" style="display: none;"></div>
                <div id="storeNosCount" class="store-count"></div>
            </div>
            
            <div id="singleValueContainer">
            ${renderValueInput(action)}
                <div class="form-group">
                    <button type="button" class="btn btn-secondary" id="addValueBtn" style="margin-top: 10px;">Add value</button>
                </div>
            </div>
            
            <div id="multiValueContainer" style="display: none;">
                <div class="form-group">
                    <label>JSON Paths and Values</label>
                    <div id="multiRowsContainer"></div>
                    <button type="button" class="btn btn-secondary" id="addRowBtn" style="margin-top: 10px;">Add value</button>
                    <div id="multiRowsError" class="error-message" style="display: none;"></div>
                </div>
            </div>
            
            <div class="form-group">
                <label for="tableName">Table Name</label>
                <input type="text" id="tableName" value="${escapeHtml(action.tableName || 'StoreStations')}">
            </div>
            
            <div class="form-group">
                <label for="stationColumn">Where clause</label>
                <input type="text" id="stationColumn" value="${escapeHtml(action.stationColumn || 'StationId')}">
            </div>
            
            <div class="form-group">
                <label for="storeColumn">AND clause</label>
                <input type="text" id="storeColumn" value="${escapeHtml(action.storeColumn || 'StoreNo')}">
            </div>
            
            <div class="form-group">
                <label for="configColumn">Configuration JSON Column Name</label>
                <input type="text" id="configColumn" value="${escapeHtml(action.configColumn || 'Configuration')}">
            </div>
            
            <button type="submit" class="btn btn-primary">Generate SQL</button>
        </form>
    `;
    
    // Add event listeners
    const storeNosInput = document.getElementById('storeNos');
    storeNosInput.addEventListener('input', validateAndPreviewStoreNos);
    
    // Add value button - switch to multi-mode
    const addValueBtn = document.getElementById('addValueBtn');
    if (addValueBtn) {
        addValueBtn.addEventListener('click', () => {
            enableMultiMode(action);
        });
    }
    
    // Add row button in multi-mode
    const addRowBtn = document.getElementById('addRowBtn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            addMultiRow();
        });
    }
    
    document.getElementById('actionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        generateSQL();
    });
    
    // Add title edit functionality
    setupTitleEdit();
    
    // Initial validation
    validateAndPreviewStoreNos();
    
    // Check if action has multiple JSON paths and auto-enable multi-mode
    if (action.jsonPaths && Array.isArray(action.jsonPaths) && action.jsonPaths.length > 1) {
        isMultiMode = true;
        multiRows = action.jsonPaths.map(path => ({
            path: path.path || path.jsonPath || action.jsonPath || '$.',
            type: path.type || path.valueType || action.valueType || 'string',
            value: path.value !== undefined ? path.value : (action.value !== undefined ? action.value : '')
        }));
        document.getElementById('singleValueContainer').style.display = 'none';
        document.getElementById('multiValueContainer').style.display = 'block';
        renderMultiRows();
    } else if (isMultiMode && multiRows.length > 0) {
        // Keep existing multi-mode state
        renderMultiRows();
    }
}

/**
 * Render form for Free SQL action
 */
function renderFreeSQLForm(action) {
    const formContainer = document.getElementById('formContainer');
    const lastStoreNos = localStorage.getItem('lastStoreNos') || '';
    
    // Use saved query data if available, otherwise use localStorage defaults
    const savedSQLScript = action.sqlScript || '';
    const savedStoreColumn = action.storeColumn || 'StoreNo';
    const savedAppendFilter = action.defaultAppendFilter !== undefined ? action.defaultAppendFilter : (localStorage.getItem('lastAppendFilter') !== 'false');
    const savedFilterMode = action.defaultFilterMode || localStorage.getItem('lastFilterMode') || 'auto';
    const savedApplyAll = action.defaultApplyAll !== undefined ? action.defaultApplyAll : (localStorage.getItem('lastApplyAll') === 'true');
    
    // Prefer saved query data, fallback to localStorage
    const lastSQLScript = savedSQLScript || localStorage.getItem('lastSQLScript') || '';
    const lastAppendFilter = savedAppendFilter;
    const lastFilterMode = savedFilterMode;
    const lastApplyAll = savedApplyAll;
    const lastStoreColumn = savedStoreColumn;
    
    formContainer.innerHTML = `
        <div class="title-header">
            <h3 id="actionTitleDisplay">${escapeHtml(action.title)}</h3>
            ${!action.isBuiltIn ? `
                <button class="btn-edit-title" id="editTitleBtn" title="Edit title">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.333 2.00001C11.5084 1.82445 11.7163 1.68506 11.9448 1.58933C12.1733 1.4936 12.4179 1.44336 12.6663 1.44336C12.9148 1.44336 13.1594 1.4936 13.3879 1.58933C13.6164 1.68506 13.8243 1.82445 13.9997 2.00001C14.1752 2.17557 14.3146 2.38345 14.4103 2.61194C14.5061 2.84043 14.5563 3.08501 14.5563 3.33345C14.5563 3.58189 14.5061 3.82647 14.4103 4.05496C14.3146 4.28345 14.1752 4.49133 13.9997 4.66689L5.33301 13.3336L1.33301 14.6669L2.66634 10.6669L11.333 2.00001Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            ` : ''}
        </div>
        ${action.description ? `<p style="color: #666; margin-bottom: 20px;">${escapeHtml(action.description)}</p>` : ''}
        
        <form id="actionForm">
            <div class="form-group">
                <label for="sqlScript">SQL Script *</label>
                <textarea id="sqlScript" placeholder="Paste your SQL script here..." required style="min-height: 200px; font-family: 'Courier New', monospace;">${escapeHtml(lastSQLScript)}</textarea>
            </div>
            
            <div class="form-group">
                <label for="storeNos">StoreNos</label>
                <textarea id="storeNos" placeholder="123, 124, 125 or 100-105 or one per line">${escapeHtml(lastStoreNos)}</textarea>
                <div id="storeNosError" class="error-message" style="display: none;"></div>
                <div id="storeNosCount" class="store-count"></div>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="appendFilter" ${lastAppendFilter ? 'checked' : ''}>
                    Append StoreNo filter
                </label>
            </div>
            
            <div class="form-group" id="filterOptionsGroup">
                <label for="filterMode">Filter Style</label>
                <select id="filterMode">
                    <option value="auto" ${lastFilterMode === 'auto' ? 'selected' : ''}>Auto detect</option>
                    <option value="where" ${lastFilterMode === 'where' ? 'selected' : ''}>Append as new WHERE clause</option>
                    <option value="and" ${lastFilterMode === 'and' ? 'selected' : ''}>Append as AND condition</option>
                </select>
            </div>
            
            <div class="form-group" id="storeColumnGroup">
                <label for="storeColumn">Store Column Name</label>
                <input type="text" id="storeColumn" value="${escapeHtml(lastStoreColumn)}">
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="applyAllStatements" ${lastApplyAll ? 'checked' : ''}>
                    Apply to all statements
                </label>
            </div>
            
            <button type="submit" class="btn btn-primary">Generate SQL</button>
        </form>
    `;
    
    // Add event listeners
    const storeNosInput = document.getElementById('storeNos');
    const appendFilterCheckbox = document.getElementById('appendFilter');
    const filterOptionsGroup = document.getElementById('filterOptionsGroup');
    const storeColumnGroup = document.getElementById('storeColumnGroup');
    
    // Toggle filter options visibility
    function toggleFilterOptions() {
        const isEnabled = appendFilterCheckbox.checked;
        filterOptionsGroup.style.display = isEnabled ? 'block' : 'none';
        storeColumnGroup.style.display = isEnabled ? 'block' : 'none';
    }
    
    appendFilterCheckbox.addEventListener('change', () => {
        toggleFilterOptions();
        validateAndPreviewStoreNos(); // Re-validate when checkbox changes
    });
    toggleFilterOptions(); // Initial state
    
    storeNosInput.addEventListener('input', validateAndPreviewStoreNos);
    
    document.getElementById('actionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        generateSQL();
    });
    
    // Add title edit functionality
    setupTitleEdit();
    
    // Initial validation
    validateAndPreviewStoreNos();
}

/**
 * Render value input based on value type
 */
function renderValueInput(action) {
    const valueType = action.valueType || 'string';
    const currentValue = action.value !== undefined ? action.value : '';
    
    let inputHtml = '';
    
    if (valueType === 'boolean') {
        inputHtml = `
            <div class="form-group">
                <label for="value">Value *</label>
                <select id="value" required>
                    <option value="true" ${currentValue === true || currentValue === 'true' ? 'selected' : ''}>true</option>
                    <option value="false" ${currentValue === false || currentValue === 'false' ? 'selected' : ''}>false</option>
                </select>
            </div>
        `;
    } else if (valueType === 'number') {
        inputHtml = `
            <div class="form-group">
                <label for="value">Value *</label>
                <input type="number" id="value" value="${escapeHtml(String(currentValue))}" required>
            </div>
        `;
    } else {
        inputHtml = `
            <div class="form-group">
                <label for="value">Value *</label>
                <input type="text" id="value" value="${escapeHtml(String(currentValue))}" required>
            </div>
        `;
    }
    
    return inputHtml;
}

/**
 * Parse and validate StoreNos input
 */
function parseStoreNos(input) {
    if (!input || !input.trim()) {
        return { valid: false, stores: [], error: 'StoreNos cannot be empty' };
    }
    
    const stores = [];
    const lines = input.split(/[,\n]/);
    
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        // Check for range (e.g., 100-105)
        if (line.includes('-')) {
            const parts = line.split('-').map(p => p.trim());
            if (parts.length === 2) {
                const start = parseInt(parts[0], 10);
                const end = parseInt(parts[1], 10);
                
                if (isNaN(start) || isNaN(end)) {
                    return { valid: false, stores: [], error: `Invalid range: ${line}` };
                }
                
                if (start > end) {
                    return { valid: false, stores: [], error: `Range start must be <= end: ${line}` };
                }
                
                for (let i = start; i <= end; i++) {
                    stores.push(i);
                }
                continue;
            }
        }
        
        // Single number
        const num = parseInt(line, 10);
        if (isNaN(num)) {
            return { valid: false, stores: [], error: `Invalid StoreNo: ${line}` };
        }
        
        stores.push(num);
    }
    
    // Remove duplicates and sort
    const uniqueStores = [...new Set(stores)].sort((a, b) => a - b);
    
    return { valid: true, stores: uniqueStores, error: null };
}

/**
 * Parse JSON_SET arguments string
 * Example: "'$.path1', 'value1', '$.path2', 123"
 * Returns array of {path, type, value} objects
 */
function parseJSONSetArguments(argsStr) {
    const results = [];
    let inString = false;
    let currentToken = '';
    let tokens = [];
    let quoteChar = null;
    
    // Simple tokenizer that handles quoted strings and values
    for (let i = 0; i < argsStr.length; i++) {
        const char = argsStr[i];
        const prevChar = i > 0 ? argsStr[i - 1] : '';
        
        if ((char === "'" || char === '"') && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                quoteChar = char;
                if (currentToken.trim()) {
                    tokens.push(currentToken.trim());
                    currentToken = '';
                }
            } else if (char === quoteChar) {
                inString = false;
                tokens.push(currentToken);
                currentToken = '';
                quoteChar = null;
            } else {
                currentToken += char;
            }
        } else if (!inString && char === ',') {
            if (currentToken.trim()) {
                tokens.push(currentToken.trim());
                currentToken = '';
            }
        } else if (!inString && /\s/.test(char)) {
            // Skip whitespace outside strings
            if (currentToken.trim()) {
                tokens.push(currentToken.trim());
                currentToken = '';
            }
        } else {
            currentToken += char;
        }
    }
    if (currentToken.trim()) {
        tokens.push(currentToken.trim());
    }
    
    // Process tokens in pairs (path, value)
    for (let i = 0; i < tokens.length; i += 2) {
        if (i + 1 >= tokens.length) break;
        
        let pathToken = tokens[i];
        let valueToken = tokens[i + 1];
        
        // Remove quotes from path
        pathToken = pathToken.replace(/^['"]|['"]$/g, '').replace(/''/g, "'");
        
        // Determine value type and parse
        let value, type;
        const valueUpper = valueToken.toUpperCase().trim();
        if (valueUpper === 'NULL') {
            type = 'null';
            value = null;
        } else if (valueToken === 'true' || valueToken === 'false') {
            type = 'boolean';
            value = valueToken === 'true';
        } else if (/^-?\d+(\.\d+)?$/.test(valueToken.trim())) {
            type = 'number';
            value = parseFloat(valueToken);
        } else {
            // String - remove quotes and unescape
            type = 'string';
            value = valueToken.replace(/^['"]|['"]$/g, '').replace(/''/g, "'");
        }
        
        results.push({
            path: pathToken,
            type: type,
            value: value
        });
    }
    
    return results;
}

/**
 * Parse SQL UPDATE statement and extract action data
 * Returns action object with all parsed fields
 */
function parseSQLToAction(sqlText) {
    const sql = sqlText.trim();
    
    // Extract table name
    const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
    if (!updateMatch) {
        throw new Error('Could not find UPDATE statement');
    }
    const tableName = updateMatch[1];
    
    // Extract SET clause with JSON_SET
    const setMatch = sql.match(/SET\s+(\w+)\s*=\s*JSON_SET\s*\(/i);
    if (!setMatch) {
        throw new Error('Could not find JSON_SET in SET clause');
    }
    const configColumn = setMatch[1];
    
    // Extract JSON_SET arguments (paths and values)
    const jsonSetMatch = sql.match(/JSON_SET\s*\(\s*\w+\s*,\s*([^)]+)\)/i);
    if (!jsonSetMatch) {
        throw new Error('Could not parse JSON_SET arguments');
    }
    
    const jsonSetArgs = jsonSetMatch[1];
    const pathsAndValues = parseJSONSetArguments(jsonSetArgs);
    
    if (pathsAndValues.length === 0) {
        throw new Error('No JSON paths found in JSON_SET');
    }
    
    // Extract WHERE clause
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*'([^']+)'/i);
    if (!whereMatch) {
        throw new Error('Could not find WHERE clause with StationId');
    }
    const stationColumn = whereMatch[1];
    const stationId = whereMatch[2].replace(/''/g, "'"); // Unescape single quotes
    
    // Extract store column from AND clause
    const andMatch = sql.match(/AND\s+(\w+)\s+IN\s*\(/i);
    const storeColumn = andMatch ? andMatch[1] : 'StoreNo';
    
    // Build action object
    const firstPath = pathsAndValues[0];
    const action = {
        tableName: tableName,
        configColumn: configColumn,
        stationColumn: stationColumn,
        stationId: stationId,
        storeColumn: storeColumn,
        jsonPath: firstPath.path,
        valueType: firstPath.type,
        value: firstPath.value
    };
    
    // Always include jsonPaths array if there are multiple paths
    if (pathsAndValues.length > 1) {
        action.jsonPaths = pathsAndValues;
    }
    
    return action;
}

/**
 * Validate and preview StoreNos
 */
function validateAndPreviewStoreNos() {
    const storeNosInput = document.getElementById('storeNos');
    const errorDiv = document.getElementById('storeNosError');
    const countDiv = document.getElementById('storeNosCount');
    
    if (!storeNosInput || !errorDiv || !countDiv) return;
    
    // For free_sql actions, check if filter is enabled
    if (selectedAction && selectedAction.kind === 'free_sql') {
        const appendFilter = document.getElementById('appendFilter');
        if (appendFilter && !appendFilter.checked) {
            // Filter disabled, no validation needed
            errorDiv.style.display = 'none';
            countDiv.textContent = '';
            return;
        }
    }
    
    const result = parseStoreNos(storeNosInput.value);
    
    if (!result.valid) {
        errorDiv.textContent = result.error;
        errorDiv.style.display = 'block';
        countDiv.textContent = '';
    } else {
        errorDiv.style.display = 'none';
        const count = result.stores.length;
        if (selectedAction && selectedAction.kind === 'free_sql') {
            countDiv.textContent = count > 0 ? `${count} store${count !== 1 ? 's' : ''} in filter` : '';
        } else {
        countDiv.textContent = count > 0 ? `${count} store${count !== 1 ? 's' : ''} will be updated` : '';
        }
    }
}

/**
 * Inject StoreNo filter into SQL script
 * @param {string} sqlText - The SQL script text
 * @param {number[]} storeNos - Array of store numbers
 * @param {string} storeColumn - Column name for store number
 * @param {string} mode - 'auto', 'where', or 'and'
 * @param {boolean} applyAllStatements - Whether to apply to all statements or just the last
 * @returns {string} Modified SQL text
 */
function injectStoreFilter(sqlText, storeNos, storeColumn, mode, applyAllStatements) {
    if (!sqlText || !sqlText.trim()) {
        return sqlText;
    }
    
    if (!storeNos || storeNos.length === 0) {
        return sqlText;
    }
    
    // Format store numbers as: (123, 124, 125)
    const storeNosList = '(' + storeNos.join(', ') + ')';
    const filterClause = `${storeColumn} IN ${storeNosList}`;
    
    // Split SQL into statements (by semicolon, but preserve them)
    const statements = [];
    let currentStatement = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    
    for (let i = 0; i < sqlText.length; i++) {
        const char = sqlText[i];
        const prevChar = i > 0 ? sqlText[i - 1] : '';
        
        // Track quote state (ignore escaped quotes)
        if (char === "'" && prevChar !== '\\' && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
        } else if (char === '"' && prevChar !== '\\' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
        }
        
        currentStatement += char;
        
        // If we hit a semicolon outside of quotes, it's a statement separator
        if (char === ';' && !inSingleQuote && !inDoubleQuote) {
            statements.push(currentStatement);
            currentStatement = '';
        }
    }
    
    // Add remaining text as last statement
    if (currentStatement.trim()) {
        statements.push(currentStatement);
    }
    
    // If no statements found, treat entire text as one statement
    if (statements.length === 0) {
        statements.push(sqlText);
    }
    
    // Determine which statements to modify
    const statementsToModify = applyAllStatements 
        ? statements 
        : [statements[statements.length - 1]];
    
    // Process each statement that needs modification
    const modifiedStatements = statements.map((stmt, index) => {
        if (!statementsToModify.includes(stmt)) {
            return stmt;
        }
        
        const trimmedStmt = stmt.trim();
        if (!trimmedStmt) {
            return stmt;
        }
        
        // Check if statement already has WHERE clause (outside of quotes)
        let hasWhere = false;
        let wherePosition = -1;
        inSingleQuote = false;
        inDoubleQuote = false;
        
        for (let i = 0; i < trimmedStmt.length - 5; i++) {
            const char = trimmedStmt[i];
            const prevChar = i > 0 ? trimmedStmt[i - 1] : '';
            
            if (char === "'" && prevChar !== '\\' && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            } else if (char === '"' && prevChar !== '\\' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            }
            
            // Check for WHERE keyword (case-insensitive, word boundary)
            if (!inSingleQuote && !inDoubleQuote) {
                const substr = trimmedStmt.substring(i).toUpperCase();
                if (substr.startsWith('WHERE ') && (i === 0 || /\s/.test(trimmedStmt[i - 1]))) {
                    hasWhere = true;
                    wherePosition = i;
                    break;
                }
            }
        }
        
        // Determine how to inject the filter
        let injectionMode = mode;
        if (mode === 'auto') {
            injectionMode = hasWhere ? 'and' : 'where';
        }
        
        // Find insertion point (before semicolon if present, or at end)
        // We need to find the position in the original statement, not trimmed
        let insertPosition = stmt.length;
        const lastSemicolon = stmt.lastIndexOf(';');
        if (lastSemicolon !== -1) {
            insertPosition = lastSemicolon;
        }
        
        // Build the filter to inject
        let filterToInject = '';
        if (injectionMode === 'where') {
            filterToInject = ' WHERE ' + filterClause;
        } else {
            // AND mode - add space before AND if needed
            const beforeInsert = stmt.substring(0, insertPosition).trimRight();
            if (beforeInsert && !/\s$/.test(beforeInsert)) {
                filterToInject = ' AND ' + filterClause;
            } else {
                filterToInject = 'AND ' + filterClause;
            }
        }
        
        // Insert the filter before semicolon (or at end)
        const beforeFilter = stmt.substring(0, insertPosition).trimRight();
        const afterFilter = stmt.substring(insertPosition);
        
        // Combine: before + filter + after (preserving semicolon if present)
        const result = beforeFilter + filterToInject + afterFilter;
        
        return result;
    });
    
    return modifiedStatements.join('');
}

/**
 * Generate SQL from form data
 */
function generateSQL() {
    if (!selectedAction) return;
    
    // Handle free_sql action type
    if (selectedAction.kind === 'free_sql') {
        generateFreeSQL();
        return;
    }
    
    // Get form values
    const stationId = document.getElementById('stationId').value.trim();
    const storeNosInput = document.getElementById('storeNos').value;
    const tableName = document.getElementById('tableName').value.trim() || 'StoreStations';
    const stationColumn = document.getElementById('stationColumn').value.trim() || 'StationId';
    const storeColumn = document.getElementById('storeColumn').value.trim() || 'StoreNo';
    const configColumn = document.getElementById('configColumn').value.trim() || 'Configuration';
    
    // Validate StoreNos
    const storeNosResult = parseStoreNos(storeNosInput);
    if (!storeNosResult.valid) {
        alert('Please fix StoreNos errors before generating SQL');
        return;
    }
    
    if (storeNosResult.stores.length === 0) {
        alert('At least one StoreNo is required');
        return;
    }
    
    // Check if multi-mode is active
    let rows = null;
    let jsonPath = selectedAction.jsonPath;
    let value = null;
    
    if (isMultiMode) {
        // Get rows from UI
        rows = getMultiRowsFromUI();
        
        // Validate rows
        const validation = validateRows(rows);
        if (!validation.valid) {
            // Show errors in UI
            const errorDiv = document.getElementById('multiRowsError');
            if (errorDiv) {
                errorDiv.textContent = validation.errors.join('; ');
                errorDiv.style.display = 'block';
            }
            alert('Please fix the following errors:\n' + validation.errors.join('\n'));
            return;
        }
        
        // Hide error if validation passed
        const errorDiv = document.getElementById('multiRowsError');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    } else {
        // Single mode - get value as before
        value = getFormValue();
    }
    
    // Save last used values
    localStorage.setItem('lastStationId', stationId);
    localStorage.setItem('lastStoreNos', storeNosInput);
    
    // Generate SQL
    const sql = buildSQL({
        tableName,
        configColumn,
        jsonPath,
        value,
        stationColumn,
        stationId,
        storeColumn,
        storeNos: storeNosResult.stores,
        rows: rows
    });
    
    // Display SQL
    const sqlOutput = document.getElementById('sqlOutput');
    const outputContainer = document.getElementById('outputContainer');
    sqlOutput.textContent = sql;
    outputContainer.style.display = 'block';
    
    // Apply formatting if enabled
    updateSQLFormatting();
}

/**
 * Generate SQL for Free SQL action
 */
function generateFreeSQL() {
    const sqlScript = document.getElementById('sqlScript').value.trim();
    const storeNosInput = document.getElementById('storeNos').value;
    const appendFilter = document.getElementById('appendFilter').checked;
    const filterMode = document.getElementById('filterMode').value;
    const storeColumn = document.getElementById('storeColumn').value.trim() || 'StoreNo';
    const applyAllStatements = document.getElementById('applyAllStatements').checked;
    
    // Validate SQL script
    if (!sqlScript) {
        alert('SQL Script is required');
        return;
    }
    
    // Validate StoreNos if filter is enabled
    if (appendFilter) {
        const storeNosResult = parseStoreNos(storeNosInput);
        if (!storeNosResult.valid) {
            alert('Please fix StoreNos errors before generating SQL');
            return;
        }
        
        if (storeNosResult.stores.length === 0) {
            alert('StoreNos are required when "Append StoreNo filter" is enabled');
            return;
        }
        
        // Inject filter into SQL
        const modifiedSQL = injectStoreFilter(
            sqlScript,
            storeNosResult.stores,
            storeColumn,
            filterMode,
            applyAllStatements
        );
        
        // Save last used values
        localStorage.setItem('lastSQLScript', sqlScript);
        localStorage.setItem('lastStoreNos', storeNosInput);
        localStorage.setItem('lastAppendFilter', appendFilter.toString());
        localStorage.setItem('lastFilterMode', filterMode);
        localStorage.setItem('lastApplyAll', applyAllStatements.toString());
        localStorage.setItem('lastStoreColumn', storeColumn);
        
        // Display SQL
        const sqlOutput = document.getElementById('sqlOutput');
        const outputContainer = document.getElementById('outputContainer');
        sqlOutput.textContent = modifiedSQL;
        outputContainer.style.display = 'block';
        
        // Apply formatting if enabled
        updateSQLFormatting();
    } else {
        // No filter, just output the script as-is
        localStorage.setItem('lastSQLScript', sqlScript);
        localStorage.setItem('lastStoreNos', storeNosInput);
        localStorage.setItem('lastAppendFilter', appendFilter.toString());
        localStorage.setItem('lastFilterMode', filterMode);
        localStorage.setItem('lastApplyAll', applyAllStatements.toString());
        localStorage.setItem('lastStoreColumn', storeColumn);
        
        // Display SQL
        const sqlOutput = document.getElementById('sqlOutput');
        const outputContainer = document.getElementById('outputContainer');
        sqlOutput.textContent = sqlScript;
        outputContainer.style.display = 'block';
        
        // Apply formatting if enabled
        updateSQLFormatting();
    }
}

/**
 * Get value from form based on type
 */
function getFormValue() {
    const valueInput = document.getElementById('value');
    const valueType = selectedAction.valueType || 'string';
    
    if (valueType === 'boolean') {
        return valueInput.value === 'true';
    } else if (valueType === 'number') {
        return parseFloat(valueInput.value);
    } else {
        return valueInput.value;
    }
}

/**
 * Ensure JSON path starts with "$."
 */
function ensureJsonPathPrefix(path) {
    if (!path || !path.trim()) {
        return '$.';
    }
    const trimmed = path.trim();
    if (trimmed.startsWith('$.')) {
        return trimmed;
    }
    // If it starts with just "$", add the dot
    if (trimmed.startsWith('$')) {
        return '$.' + trimmed.substring(1);
    }
    // Otherwise prepend "$."
    return '$.' + trimmed;
}

/**
 * Escape SQL string (single quotes)
 */
function escapeSqlString(str) {
    return String(str).replace(/'/g, "''");
}

/**
 * Format SQL value based on type
 */
function formatSqlValue(type, rawValue) {
    if (type === 'null') {
        return 'NULL';
    } else if (type === 'boolean') {
        return rawValue === true || rawValue === 'true' ? 'true' : 'false';
    } else if (type === 'number') {
        const num = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
        return isNaN(num) ? '0' : String(num);
    } else {
        // String: escape single quotes
        return "'" + escapeSqlString(rawValue) + "'";
    }
}

/**
 * Get single value type and value from UI
 */
function getSingleValueTypeAndValue() {
    const valueInput = document.getElementById('value');
    const valueType = selectedAction.valueType || 'string';
    let value;
    
    if (valueType === 'boolean') {
        value = valueInput.value === 'true';
    } else if (valueType === 'number') {
        value = parseFloat(valueInput.value);
    } else {
        value = valueInput.value;
    }
    
    return { type: valueType, value: value };
}

/**
 * Get multi rows from UI
 */
function getMultiRowsFromUI() {
    const rows = [];
    const rowElements = document.querySelectorAll('.multi-row');
    
    rowElements.forEach((rowEl, index) => {
        const pathInput = rowEl.querySelector('.row-json-path');
        const typeSelect = rowEl.querySelector('.row-value-type');
        const valueInput = rowEl.querySelector('.row-value');
        
        if (pathInput && typeSelect && valueInput) {
            let path = pathInput.value.trim();
            // Ensure "$." prefix
            path = ensureJsonPathPrefix(path);
            const type = typeSelect.value;
            let value = valueInput.value;
            
            // Parse value based on type
            if (type === 'boolean') {
                value = value === 'true';
            } else if (type === 'number') {
                value = parseFloat(value);
            } else if (type === 'null') {
                value = null;
            }
            
            rows.push({
                path: path,
                type: type,
                value: value
            });
        }
    });
    
    return rows;
}

/**
 * Validate multi rows
 */
function validateRows(rows) {
    const errors = [];
    const paths = new Set();
    
    rows.forEach((row, index) => {
        // Check path is required
        if (!row.path || !row.path.trim()) {
            errors.push(`Row ${index + 1}: JSON Path is required`);
            return;
        }
        
        // Ensure path starts with "$." (auto-fix)
        row.path = ensureJsonPathPrefix(row.path);
        
        // Check for duplicate paths
        if (paths.has(row.path.trim())) {
            errors.push(`Row ${index + 1}: Duplicate JSON Path "${row.path.trim()}"`);
            return;
        }
        paths.add(row.path.trim());
        
        // Validate value based on type
        if (row.type === 'number') {
            const num = typeof row.value === 'number' ? row.value : parseFloat(row.value);
            if (isNaN(num)) {
                errors.push(`Row ${index + 1}: Invalid number value`);
            }
        } else if (row.type !== 'null' && (row.value === null || row.value === undefined || row.value === '')) {
            errors.push(`Row ${index + 1}: Value is required`);
        }
    });
    
    return { valid: errors.length === 0, errors: errors };
}

/**
 * Enable multi-mode and initialize with current single value
 */
function enableMultiMode(action) {
    isMultiMode = true;
    
    // Get current single value
    const { type, value } = getSingleValueTypeAndValue();
    const jsonPath = action.jsonPath || '$.';
    
    // Initialize with first row
    multiRows = [{
        path: jsonPath,
        type: type,
        value: value
    }];
    
    // Switch UI
    document.getElementById('singleValueContainer').style.display = 'none';
    document.getElementById('multiValueContainer').style.display = 'block';
    
    // Render rows
    renderMultiRows();
}

/**
 * Add a new row to multi-mode
 */
function addMultiRow() {
    multiRows.push({
        path: '$.',
        type: 'string',
        value: ''
    });
    renderMultiRows();
}

/**
 * Remove a row from multi-mode
 */
function removeMultiRow(index) {
    multiRows.splice(index, 1);
    if (multiRows.length === 0) {
        // If no rows left, add one default row
        multiRows.push({
            path: '$.',
            type: 'string',
            value: ''
        });
    }
    renderMultiRows();
}

/**
 * Render multi rows UI
 */
function renderMultiRows() {
    const container = document.getElementById('multiRowsContainer');
    if (!container) return;
    
    container.innerHTML = multiRows.map((row, index) => {
        const valueInputHtml = getValueInputHtml(row.type, row.value, index);
        
        return `
            <div class="multi-row" data-row-index="${index}" style="border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin-bottom: 10px; background: #f9f9f9;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">JSON Path *</label>
                        <input type="text" class="row-json-path" value="${escapeHtml(row.path)}" placeholder="$.key" required style="width: 100%;">
                    </div>
                    <div style="flex: 0 0 120px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Type *</label>
                        <select class="row-value-type" required style="width: 100%;">
                            <option value="boolean" ${row.type === 'boolean' ? 'selected' : ''}>Boolean</option>
                            <option value="string" ${row.type === 'string' ? 'selected' : ''}>String</option>
                            <option value="number" ${row.type === 'number' ? 'selected' : ''}>Number</option>
                            <option value="null" ${row.type === 'null' ? 'selected' : ''}>Null</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Value ${row.type === 'null' ? '' : '*'}</label>
                        ${valueInputHtml}
                    </div>
                    <div style="flex: 0 0 40px; padding-top: 24px;">
                        <button type="button" class="btn-delete" onclick="removeMultiRowFromUI(${index})" style="padding: 6px 10px; font-size: 12px;">×</button>
                    </div>
                </div>
                <div class="row-error" style="color: #f44336; font-size: 12px; margin-top: 4px; display: none;"></div>
            </div>
        `;
    }).join('');
    
    // Add event listeners for type changes
    container.querySelectorAll('.row-value-type').forEach((select, index) => {
        select.addEventListener('change', (e) => {
            const row = multiRows[index];
            row.type = e.target.value;
            if (row.type === 'null') {
                row.value = null;
            } else if (row.type === 'boolean') {
                row.value = false;
            } else if (row.type === 'number') {
                row.value = 0;
            } else {
                row.value = '';
            }
            renderMultiRows();
        });
    });
    
    // Add event listeners for value changes
    container.querySelectorAll('.row-value').forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const row = multiRows[index];
            if (row.type === 'boolean') {
                row.value = e.target.value === 'true';
            } else if (row.type === 'number') {
                row.value = parseFloat(e.target.value) || 0;
            } else {
                row.value = e.target.value;
            }
        });
    });
    
    // Add event listeners for path changes
    container.querySelectorAll('.row-json-path').forEach((input, index) => {
        input.addEventListener('input', (e) => {
            multiRows[index].path = e.target.value;
        });
        
        // Auto-add "$." prefix on blur
        input.addEventListener('blur', (e) => {
            const formatted = ensureJsonPathPrefix(e.target.value);
            if (formatted !== e.target.value) {
                e.target.value = formatted;
                multiRows[index].path = formatted;
            }
        });
    });
}

/**
 * Get value input HTML for a row
 */
function getValueInputHtml(type, value, index) {
    if (type === 'null') {
        return '<input type="text" class="row-value" value="NULL" disabled style="width: 100%; background: #f0f0f0;">';
    } else if (type === 'boolean') {
        return `
            <select class="row-value" required style="width: 100%;">
                <option value="true" ${value === true || value === 'true' ? 'selected' : ''}>true</option>
                <option value="false" ${value === false || value === 'false' ? 'selected' : ''}>false</option>
            </select>
        `;
    } else if (type === 'number') {
        const numValue = typeof value === 'number' ? value : (parseFloat(value) || 0);
        return `<input type="number" class="row-value" value="${numValue}" required style="width: 100%;">`;
    } else {
        return `<input type="text" class="row-value" value="${escapeHtml(String(value))}" required style="width: 100%;">`;
    }
}

/**
 * Remove multi row from UI (called from onclick)
 */
function removeMultiRowFromUI(index) {
    removeMultiRow(index);
}

/**
 * Build SQL statement
 */
function buildSQL({ tableName, configColumn, jsonPath, value, stationColumn, stationId, storeColumn, storeNos, rows = null }) {
    // Build IN clause
    const storeNosList = storeNos.join(', ');
    const escapedStationId = escapeSqlString(stationId);
    
    // If rows provided, use multi JSON_SET mode
    if (rows && rows.length > 0) {
        // Build JSON_SET arguments: path1, value1, path2, value2, ...
        const jsonSetArgs = rows.map(row => {
            const formattedValue = formatSqlValue(row.type, row.value);
            const escapedPath = escapeSqlString(row.path);
            return `'${escapedPath}', ${formattedValue}`;
        }).join(',\n    ');
    
    return `UPDATE ${tableName}
SET ${configColumn} = JSON_SET(
    ${configColumn},
    ${jsonSetArgs}
)
WHERE ${stationColumn} = '${escapedStationId}'
AND ${storeColumn} IN (${storeNosList});`;
    }
    
    // Single mode - use existing logic
    const formattedValue = formatSqlValue(
        typeof value === 'boolean' ? 'boolean' : (typeof value === 'number' ? 'number' : 'string'),
        value
    );
    const escapedPath = escapeSqlString(jsonPath);
    
    return `UPDATE ${tableName}
SET ${configColumn} = JSON_SET(
    ${configColumn},
    '${escapedPath}', ${formattedValue}
)
WHERE ${stationColumn} = '${escapedStationId}'
AND ${storeColumn} IN (${storeNosList});`;
}

/**
 * Format SQL with proper indentation
 */
function formatSQL(sql) {
    const lines = sql.split('\n');
    let indent = 0;
    const indentSize = 4;
    
    return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        
        // Decrease indent before certain keywords
        if (trimmed.match(/^(WHERE|AND|OR|SET)\s/i)) {
            indent = Math.max(0, indent - 1);
        }
        
        const indented = ' '.repeat(indent * indentSize) + trimmed;
        
        // Increase indent after certain keywords
        if (trimmed.match(/^(UPDATE|SET|JSON_SET)\s/i)) {
            indent++;
        }
        
        return indented;
    }).filter(line => line).join('\n');
}

/**
 * Enable multi-mode in modal
 */
function enableModalMultiMode() {
    isModalMultiMode = true;
    
    // Get current single value
    const jsonPath = document.getElementById('modalJsonPath').value.trim() || '$.';
    const valueType = document.getElementById('modalValueType').value;
    const valueInput = document.getElementById('modalValue');
    let value = '';
    
    if (valueInput) {
        if (valueType === 'boolean') {
            value = valueInput.value === 'true';
        } else if (valueType === 'number') {
            value = parseFloat(valueInput.value) || 0;
        } else {
            value = valueInput.value;
        }
    }
    
    // Initialize with first row
    modalMultiRows = [{
        path: ensureJsonPathPrefix(jsonPath),
        type: valueType,
        value: value
    }];
    
    // Switch UI
    document.getElementById('modalSingleValueContainer').style.display = 'none';
    document.getElementById('modalMultiValueContainer').style.display = 'block';
    renderModalMultiRows();
}

/**
 * Add a new row to modal multi-mode
 */
function addModalMultiRow() {
    modalMultiRows.push({
        path: '$.',
        type: 'string',
        value: ''
    });
    renderModalMultiRows();
}

/**
 * Remove a row from modal multi-mode
 */
function removeModalMultiRow(index) {
    modalMultiRows.splice(index, 1);
    if (modalMultiRows.length === 0) {
        // If no rows left, add one default row
        modalMultiRows.push({
            path: '$.',
            type: 'string',
            value: ''
        });
    }
    renderModalMultiRows();
}

/**
 * Render modal multi rows UI
 */
function renderModalMultiRows() {
    const container = document.getElementById('modalMultiRowsContainer');
    if (!container) return;
    
    container.innerHTML = modalMultiRows.map((row, index) => {
        const valueInputHtml = getModalValueInputHtml(row.type, row.value, index);
        
        return `
            <div class="modal-multi-row" data-row-index="${index}" style="border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin-bottom: 10px; background: #f9f9f9;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">JSON Path *</label>
                        <input type="text" class="modal-row-json-path" value="${escapeHtml(row.path)}" placeholder="$.key" required style="width: 100%;">
                    </div>
                    <div style="flex: 0 0 120px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Type *</label>
                        <select class="modal-row-value-type" required style="width: 100%;">
                            <option value="boolean" ${row.type === 'boolean' ? 'selected' : ''}>Boolean</option>
                            <option value="string" ${row.type === 'string' ? 'selected' : ''}>String</option>
                            <option value="number" ${row.type === 'number' ? 'selected' : ''}>Number</option>
                            <option value="null" ${row.type === 'null' ? 'selected' : ''}>Null</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Value ${row.type === 'null' ? '' : '*'}</label>
                        ${valueInputHtml}
                    </div>
                    <div style="flex: 0 0 40px; padding-top: 24px;">
                        <button type="button" class="btn-delete" onclick="removeModalMultiRowFromUI(${index})" style="padding: 6px 10px; font-size: 12px;">×</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Add event listeners for type changes
    container.querySelectorAll('.modal-row-value-type').forEach((select, index) => {
        select.addEventListener('change', (e) => {
            const row = modalMultiRows[index];
            row.type = e.target.value;
            if (row.type === 'null') {
                row.value = null;
            } else if (row.type === 'boolean') {
                row.value = false;
            } else if (row.type === 'number') {
                row.value = 0;
            } else {
                row.value = '';
            }
            renderModalMultiRows();
        });
    });
    
    // Add event listeners for value changes
    container.querySelectorAll('.modal-row-value').forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const row = modalMultiRows[index];
            if (row.type === 'boolean') {
                row.value = e.target.value === 'true';
            } else if (row.type === 'number') {
                row.value = parseFloat(e.target.value) || 0;
            } else {
                row.value = e.target.value;
            }
        });
    });
    
    // Add event listeners for path changes
    container.querySelectorAll('.modal-row-json-path').forEach((input, index) => {
        input.addEventListener('input', (e) => {
            modalMultiRows[index].path = e.target.value;
        });
        
        // Auto-add "$." prefix on blur
        input.addEventListener('blur', (e) => {
            const formatted = ensureJsonPathPrefix(e.target.value);
            if (formatted !== e.target.value) {
                e.target.value = formatted;
                modalMultiRows[index].path = formatted;
            }
        });
    });
}

/**
 * Get value input HTML for modal rows
 */
function getModalValueInputHtml(type, value, index) {
    if (type === 'null') {
        return `<input type="text" class="modal-row-value" value="NULL" disabled style="width: 100%;">`;
    } else if (type === 'boolean') {
        return `
            <select class="modal-row-value" required style="width: 100%;">
                <option value="true" ${value === true || value === 'true' ? 'selected' : ''}>true</option>
                <option value="false" ${value === false || value === 'false' ? 'selected' : ''}>false</option>
            </select>
        `;
    } else if (type === 'number') {
        return `<input type="number" class="modal-row-value" value="${value !== undefined && value !== null ? value : ''}" required style="width: 100%;">`;
    } else {
        return `<input type="text" class="modal-row-value" value="${escapeHtml(value !== undefined && value !== null ? String(value) : '')}" required style="width: 100%;">`;
    }
}

/**
 * Get modal multi rows from UI
 */
function getModalMultiRowsFromUI() {
    const rows = [];
    const rowElements = document.querySelectorAll('.modal-multi-row');
    
    rowElements.forEach((rowEl, index) => {
        const pathInput = rowEl.querySelector('.modal-row-json-path');
        const typeSelect = rowEl.querySelector('.modal-row-value-type');
        const valueInput = rowEl.querySelector('.modal-row-value');
        
        if (pathInput && typeSelect && valueInput) {
            let path = pathInput.value.trim();
            // Ensure "$." prefix
            path = ensureJsonPathPrefix(path);
            const type = typeSelect.value;
            let value = valueInput.value;
            
            // Parse value based on type
            if (type === 'boolean') {
                value = value === 'true';
            } else if (type === 'number') {
                value = parseFloat(value);
            } else if (type === 'null') {
                value = null;
            }
            
            rows.push({
                path: path,
                type: type,
                value: value
            });
        }
    });
    
    return rows;
}

/**
 * Remove modal multi row from UI (global function for onclick)
 */
window.removeModalMultiRowFromUI = function(index) {
    removeModalMultiRow(index);
};

/**
 * Update SQL formatting based on toggle
 */
function updateSQLFormatting() {
    const sqlOutput = document.getElementById('sqlOutput');
    const formatToggle = document.getElementById('formatSqlToggle');
    const sql = sqlOutput.textContent;
    
    if (formatToggle.checked) {
        sqlOutput.textContent = formatSQL(sql);
        sqlOutput.classList.add('formatted');
    } else {
        sqlOutput.textContent = sql;
        sqlOutput.classList.remove('formatted');
    }
}

/**
 * Copy SQL to clipboard
 */
async function copySQL() {
    const sqlOutput = document.getElementById('sqlOutput');
    const sql = sqlOutput.textContent;
    
    try {
        await navigator.clipboard.writeText(sql);
        showCopyConfirmation();
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = sql;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showCopyConfirmation();
        } catch (e) {
            alert('Failed to copy SQL. Please select and copy manually.');
        }
        document.body.removeChild(textarea);
    }
}

/**
 * Show copy confirmation
 */
function showCopyConfirmation() {
    const confirmation = document.getElementById('copyConfirmation');
    confirmation.style.display = 'block';
    setTimeout(() => {
        confirmation.style.display = 'none';
    }, 2000);
}

/**
 * Clear output
 */
function clearOutput() {
    document.getElementById('outputContainer').style.display = 'none';
    document.getElementById('sqlOutput').textContent = '';
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Free SQL button
    document.getElementById('freeSqlBtn').addEventListener('click', () => {
        openFreeSqlModal();
    });
    
    // Import SQL button
    document.getElementById('importSqlBtn').addEventListener('click', () => {
        openImportSqlModal();
    });
    
    // Add Action button
    document.getElementById('addActionBtn').addEventListener('click', () => {
        openActionModal();
    });
    
    // Search input
    document.getElementById('searchInput').addEventListener('input', () => {
        renderActionsList();
    });
    
    // Copy button
    document.getElementById('copyBtn').addEventListener('click', copySQL);
    
    // Clear button
    document.getElementById('clearBtn').addEventListener('click', clearOutput);
    
    // Format toggle
    document.getElementById('formatSqlToggle').addEventListener('change', updateSQLFormatting);
    
    // Action Modal close
    document.getElementById('closeModal').addEventListener('click', closeActionModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeActionModal);
    
    // Action Modal form submit
    document.getElementById('actionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveActionFromModal();
    });
    
    // Value type change handler
    document.getElementById('modalValueType').addEventListener('change', updateModalValueInput);
    
    // Auto-add "$." prefix to JSON path in modal
    const modalJsonPathInput = document.getElementById('modalJsonPath');
    if (modalJsonPathInput) {
        modalJsonPathInput.addEventListener('blur', (e) => {
            const formatted = ensureJsonPathPrefix(e.target.value);
            if (formatted !== e.target.value) {
                e.target.value = formatted;
            }
        });
    }
    
    // Modal Add value button
    const modalAddValueBtn = document.getElementById('modalAddValueBtn');
    if (modalAddValueBtn) {
        modalAddValueBtn.addEventListener('click', (e) => {
            e.preventDefault();
            enableModalMultiMode();
        });
    }
    
    // Modal Add row button (in multi-mode)
    const modalAddRowBtn = document.getElementById('modalAddRowBtn');
    if (modalAddRowBtn) {
        modalAddRowBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addModalMultiRow();
        });
    }
    
    // Free SQL Modal close
    document.getElementById('closeFreeSqlModal').addEventListener('click', closeFreeSqlModal);
    document.getElementById('cancelFreeSqlModalBtn').addEventListener('click', closeFreeSqlModal);
    
    // Free SQL Modal form submit
    document.getElementById('freeSqlForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveFreeSqlQuery();
    });
    
    // Import SQL Modal close
    document.getElementById('closeImportSqlModal').addEventListener('click', closeImportSqlModal);
    document.getElementById('cancelImportSqlBtn').addEventListener('click', closeImportSqlModal);
    
    // Import SQL Parse button
    document.getElementById('parseImportSqlBtn').addEventListener('click', (e) => {
        e.preventDefault();
        parseAndFillImportForm();
    });
    
    // Import SQL Modal form submit
    document.getElementById('importSqlForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveActionFromImport();
    });
}

/**
 * Open action modal for creating/editing
 */
function openActionModal(actionId = null) {
    editingActionId = actionId;
    const modal = document.getElementById('actionModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('actionForm');
    
    // Reset modal multi-mode state
    isModalMultiMode = false;
    modalMultiRows = [];
    document.getElementById('modalSingleValueContainer').style.display = 'block';
    document.getElementById('modalMultiValueContainer').style.display = 'none';
    
    if (actionId) {
        // Edit mode
        const action = allActions.find(a => a.id === actionId);
        if (!action) return;
        
        modalTitle.textContent = 'Edit Action';
        populateModalForm(action);
    } else {
        // Create mode
        modalTitle.textContent = 'Add Action';
        form.reset();
        document.getElementById('modalTableName').value = 'StoreStations';
        document.getElementById('modalStationColumn').value = 'StationId';
        document.getElementById('modalStoreColumn').value = 'StoreNo';
        document.getElementById('modalConfigColumn').value = 'Configuration';
        updateModalValueInput();
    }
    
    modal.style.display = 'flex';
}

/**
 * Close action modal
 */
function closeActionModal() {
    document.getElementById('actionModal').style.display = 'none';
    editingActionId = null;
}

/**
 * Open Free SQL modal for creating/editing
 */
function openFreeSqlModal(actionId = null) {
    editingActionId = actionId;
    const modal = document.getElementById('freeSqlModal');
    const modalTitle = document.getElementById('freeSqlModalTitle');
    const form = document.getElementById('freeSqlForm');
    
    if (actionId) {
        // Edit mode
        const action = allActions.find(a => a.id === actionId);
        if (!action || action.kind !== 'free_sql') return;
        
        modalTitle.textContent = 'Edit Free SQL Query';
        populateFreeSqlModalForm(action);
    } else {
        // Create mode
        modalTitle.textContent = 'Save Free SQL Query';
        form.reset();
        document.getElementById('freeSqlStoreColumn').value = 'StoreNo';
        document.getElementById('freeSqlAppendFilter').checked = true;
        document.getElementById('freeSqlFilterMode').value = 'auto';
        document.getElementById('freeSqlApplyAll').checked = false;
    }
    
    modal.style.display = 'flex';
}

/**
 * Close Free SQL modal
 */
function closeFreeSqlModal() {
    document.getElementById('freeSqlModal').style.display = 'none';
    editingActionId = null;
}

/**
 * Open Import SQL modal
 */
function openImportSqlModal() {
    const modal = document.getElementById('importSqlModal');
    const form = document.getElementById('importSqlForm');
    
    // Reset form
    form.reset();
    document.getElementById('importSqlInput').value = '';
    document.getElementById('importParsedFields').style.display = 'none';
    document.getElementById('saveImportActionBtn').style.display = 'none';
    document.getElementById('importSqlError').style.display = 'none';
    document.getElementById('importSqlSuccess').style.display = 'none';
    
    modal.style.display = 'flex';
}

/**
 * Close Import SQL modal
 */
function closeImportSqlModal() {
    document.getElementById('importSqlModal').style.display = 'none';
}

/**
 * Parse SQL and fill import form
 */
function parseAndFillImportForm() {
    const sqlInput = document.getElementById('importSqlInput');
    const errorDiv = document.getElementById('importSqlError');
    const successDiv = document.getElementById('importSqlSuccess');
    const parsedFields = document.getElementById('importParsedFields');
    const saveBtn = document.getElementById('saveImportActionBtn');
    
    if (!sqlInput || !sqlInput.value.trim()) {
        if (errorDiv) {
            errorDiv.textContent = 'Please paste a SQL script';
            errorDiv.style.display = 'block';
        }
        if (successDiv) successDiv.style.display = 'none';
        return;
    }
    
    try {
        const parsedAction = parseSQLToAction(sqlInput.value);
        
        // Fill form fields
        document.getElementById('importStationId').value = parsedAction.stationId;
        document.getElementById('importTableName').value = parsedAction.tableName;
        document.getElementById('importStationColumn').value = parsedAction.stationColumn;
        document.getElementById('importStoreColumn').value = parsedAction.storeColumn;
        document.getElementById('importConfigColumn').value = parsedAction.configColumn;
        
        // Generate default title from first JSON path
        const defaultTitle = parsedAction.jsonPath.replace(/^\$\./, '').replace(/([A-Z])/g, ' $1').trim() || 'Imported Action';
        document.getElementById('importTitle').value = defaultTitle.charAt(0).toUpperCase() + defaultTitle.slice(1);
        
        // Display JSON paths
        const jsonPathsContainer = document.getElementById('importJsonPathsContainer');
        if (parsedAction.jsonPaths && parsedAction.jsonPaths.length > 1) {
            // Multiple paths
            jsonPathsContainer.innerHTML = `
                <div class="form-group">
                    <label>JSON Paths and Values (${parsedAction.jsonPaths.length} paths found)</label>
                    <div style="border: 1px solid #ddd; border-radius: 4px; padding: 15px; background: #f9f9f9; max-height: 300px; overflow-y: auto;">
                        ${parsedAction.jsonPaths.map((path, index) => `
                            <div style="margin-bottom: 10px; padding: 8px; background: white; border-radius: 4px;">
                                <strong>Path ${index + 1}:</strong> ${escapeHtml(path.path)}<br>
                                <strong>Type:</strong> ${path.type}<br>
                                <strong>Value:</strong> ${escapeHtml(String(path.value === null ? 'NULL' : path.value))}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            // Single path
            jsonPathsContainer.innerHTML = `
                <div class="form-group">
                    <label>JSON Path</label>
                    <input type="text" value="${escapeHtml(parsedAction.jsonPath)}" readonly style="background: #f5f5f5;">
                </div>
                <div class="form-group">
                    <label>Value Type</label>
                    <input type="text" value="${escapeHtml(parsedAction.valueType)}" readonly style="background: #f5f5f5;">
                </div>
                <div class="form-group">
                    <label>Value</label>
                    <input type="text" value="${escapeHtml(String(parsedAction.value === null ? 'NULL' : parsedAction.value))}" readonly style="background: #f5f5f5;">
                </div>
            `;
        }
        
        // Store parsed data for saving
        window.importedActionData = parsedAction;
        
        // Show parsed fields and save button
        parsedFields.style.display = 'block';
        saveBtn.style.display = 'inline-block';
        
        // Show success message
        if (errorDiv) errorDiv.style.display = 'none';
        if (successDiv) successDiv.style.display = 'block';
        
    } catch (error) {
        if (errorDiv) {
            errorDiv.textContent = 'Error parsing SQL: ' + error.message;
            errorDiv.style.display = 'block';
        }
        if (successDiv) successDiv.style.display = 'none';
        parsedFields.style.display = 'none';
        saveBtn.style.display = 'none';
    }
}

/**
 * Save action from import
 */
function saveActionFromImport() {
    const title = document.getElementById('importTitle').value.trim();
    const description = document.getElementById('importDescription').value.trim();
    const parsedData = window.importedActionData;
    
    if (!title) {
        alert('Please enter an action title');
        return;
    }
    
    if (!parsedData) {
        alert('No parsed data found. Please parse the SQL first.');
        return;
    }
    
    // Create action object
    const action = {
        id: generateCustomActionId(),
        title: title,
        description: description,
        stationId: parsedData.stationId,
        jsonPath: parsedData.jsonPath,
        valueType: parsedData.valueType,
        value: parsedData.value,
        tableName: parsedData.tableName,
        stationColumn: parsedData.stationColumn,
        storeColumn: parsedData.storeColumn,
        configColumn: parsedData.configColumn,
        isBuiltIn: false
    };
    
    // Always add jsonPaths if it exists (when multiple paths were parsed)
    if (parsedData.jsonPaths && Array.isArray(parsedData.jsonPaths) && parsedData.jsonPaths.length > 0) {
        action.jsonPaths = parsedData.jsonPaths;
    }
    
    // Add to actions array
    allActions.push(action);
    
    // Save to localStorage
    saveCustomActions();
    
    // Refresh actions list
    renderActionsList();
    
    // Close modal
    closeImportSqlModal();
    
    // Auto-select the new action
    selectAction(action.id);
    
    // Clear imported data
    window.importedActionData = null;
}

/**
 * Populate Free SQL modal form with action data
 */
function populateFreeSqlModalForm(action) {
    document.getElementById('freeSqlTitleInput').value = action.title || '';
    document.getElementById('freeSqlDescription').value = action.description || '';
    document.getElementById('freeSqlScript').value = action.sqlScript || '';
    document.getElementById('freeSqlStoreColumn').value = action.storeColumn || 'StoreNo';
    document.getElementById('freeSqlAppendFilter').checked = action.defaultAppendFilter !== undefined ? action.defaultAppendFilter : true;
    document.getElementById('freeSqlFilterMode').value = action.defaultFilterMode || 'auto';
    document.getElementById('freeSqlApplyAll').checked = action.defaultApplyAll || false;
}

/**
 * Save Free SQL query from modal
 */
function saveFreeSqlQuery() {
    const title = document.getElementById('freeSqlTitleInput').value.trim();
    const description = document.getElementById('freeSqlDescription').value.trim();
    const sqlScript = document.getElementById('freeSqlScript').value.trim();
    const storeColumn = document.getElementById('freeSqlStoreColumn').value.trim() || 'StoreNo';
    const defaultAppendFilter = document.getElementById('freeSqlAppendFilter').checked;
    const defaultFilterMode = document.getElementById('freeSqlFilterMode').value;
    const defaultApplyAll = document.getElementById('freeSqlApplyAll').checked;
    
    // Validate
    if (!title || !sqlScript) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Create action object
    const action = {
        id: editingActionId || generateCustomActionId(),
        title,
        description,
        kind: 'free_sql',
        sqlScript,
        storeColumn,
        defaultAppendFilter,
        defaultFilterMode,
        defaultApplyAll,
        isBuiltIn: false
    };
    
    if (editingActionId) {
        // Update existing
        const index = allActions.findIndex(a => a.id === editingActionId);
        if (index !== -1) {
            allActions[index] = action;
        }
    } else {
        // Add new
        allActions.push(action);
    }
    
    saveCustomActions();
    renderActionsList();
    closeFreeSqlModal();
    
    // Select the new/edited action
    selectAction(action.id);
}

/**
 * Populate modal form with action data
 */
function populateModalForm(action) {
    document.getElementById('modalTitleInput').value = action.title || '';
    document.getElementById('modalDescription').value = action.description || '';
    document.getElementById('modalStationId').value = action.stationId || '';
    document.getElementById('modalTableName').value = action.tableName || 'StoreStations';
    document.getElementById('modalStationColumn').value = action.stationColumn || 'StationId';
    document.getElementById('modalStoreColumn').value = action.storeColumn || 'StoreNo';
    document.getElementById('modalConfigColumn').value = action.configColumn || 'Configuration';
    
    // Check if action has multiple JSON paths
    if (action.jsonPaths && Array.isArray(action.jsonPaths) && action.jsonPaths.length > 1) {
        // Enable multi-mode
        isModalMultiMode = true;
        modalMultiRows = action.jsonPaths.map(path => ({
            path: path.path || path.jsonPath || action.jsonPath || '$.',
            type: path.type || path.valueType || action.valueType || 'string',
            value: path.value !== undefined ? path.value : (action.value !== undefined ? action.value : '')
        }));
        
        // Switch UI
        document.getElementById('modalSingleValueContainer').style.display = 'none';
        document.getElementById('modalMultiValueContainer').style.display = 'block';
        renderModalMultiRows();
    } else {
        // Single mode
        document.getElementById('modalJsonPath').value = action.jsonPath || '';
        document.getElementById('modalValueType').value = action.valueType || 'string';
    updateModalValueInput();
    
    // Set value
    const valueInput = document.getElementById('modalValue');
    if (valueInput) {
        if (action.valueType === 'boolean') {
            valueInput.value = action.value ? 'true' : 'false';
        } else {
            valueInput.value = action.value !== undefined ? String(action.value) : '';
            }
        }
    }
}

/**
 * Update modal value input based on type
 */
function updateModalValueInput() {
    const valueType = document.getElementById('modalValueType').value;
    const container = document.getElementById('modalValueContainer');
    
    let inputHtml = '';
    
    if (valueType === 'boolean') {
        inputHtml = `
            <select id="modalValue" required>
                <option value="true">true</option>
                <option value="false">false</option>
            </select>
        `;
    } else if (valueType === 'number') {
        inputHtml = `<input type="number" id="modalValue" required>`;
    } else {
        inputHtml = `<input type="text" id="modalValue" required>`;
    }
    
    container.innerHTML = inputHtml;
}

/**
 * Save action from modal
 */
function saveActionFromModal() {
    const title = document.getElementById('modalTitleInput').value.trim();
    const description = document.getElementById('modalDescription').value.trim();
    const stationId = document.getElementById('modalStationId').value.trim();
    const tableName = document.getElementById('modalTableName').value.trim() || 'StoreStations';
    const stationColumn = document.getElementById('modalStationColumn').value.trim() || 'StationId';
    const storeColumn = document.getElementById('modalStoreColumn').value.trim() || 'StoreNo';
    const configColumn = document.getElementById('modalConfigColumn').value.trim() || 'Configuration';
    
    // Check if in multi-mode
    let jsonPath, valueType, value, jsonPaths = null;
    
    if (isModalMultiMode && modalMultiRows.length > 0) {
        // Multi-mode: get rows from UI
        const rows = getModalMultiRowsFromUI();
        
        // Validate rows
        const errors = validateRows(rows);
        if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
        }
        
        // Use first row for single-value fields (backward compatibility)
        jsonPath = rows[0].path;
        valueType = rows[0].type;
        value = rows[0].value;
        
        // If multiple rows, save as jsonPaths
        if (rows.length > 1) {
            jsonPaths = rows;
        }
    } else {
        // Single-mode: get from single inputs
        jsonPath = document.getElementById('modalJsonPath').value.trim();
        // Ensure "$." prefix
        jsonPath = ensureJsonPathPrefix(jsonPath);
        valueType = document.getElementById('modalValueType').value;
        const valueInput = document.getElementById('modalValue');
    
    // Validate
        if (!title || !stationId || !jsonPath || !valueInput || !valueInput.value) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Parse value
    if (valueType === 'boolean') {
        value = valueInput.value === 'true';
    } else if (valueType === 'number') {
        value = parseFloat(valueInput.value);
        if (isNaN(value)) {
            alert('Invalid number value');
            return;
        }
    } else {
        value = valueInput.value;
        }
    }
    
    // Validate required fields
    if (!title || !stationId || !jsonPath) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Create action object
    const action = {
        id: editingActionId || generateCustomActionId(),
        title,
        description,
        stationId,
        jsonPath,
        valueType,
        value,
        tableName,
        stationColumn,
        storeColumn,
        configColumn,
        isBuiltIn: false
    };
    
    // Add jsonPaths if multiple paths were added
    if (jsonPaths && jsonPaths.length > 1) {
        action.jsonPaths = jsonPaths;
    }
    
    if (editingActionId) {
        // Update existing
        const index = allActions.findIndex(a => a.id === editingActionId);
        if (index !== -1) {
            allActions[index] = action;
        }
    } else {
        // Add new
        allActions.push(action);
    }
    
    saveCustomActions();
    renderActionsList();
    closeActionModal();
    
    // Select the new/edited action
    selectAction(action.id);
}

/**
 * Generate unique ID for custom action
 */
function generateCustomActionId() {
    return 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Edit action
 */
function editAction(actionId) {
    const action = allActions.find(a => a.id === actionId);
    if (!action || action.isBuiltIn) return;
    
    // Check if it's a Free SQL query
    if (action.kind === 'free_sql') {
        openFreeSqlModal(actionId);
    } else {
    openActionModal(actionId);
    }
}

/**
 * Delete action
 */
function deleteAction(actionId) {
    const action = allActions.find(a => a.id === actionId);
    if (!action || action.isBuiltIn) return;
    
    if (confirm(`Are you sure you want to delete "${action.title}"?`)) {
        allActions = allActions.filter(a => a.id !== actionId);
        saveCustomActions();
        renderActionsList();
        
        if (selectedAction && selectedAction.id === actionId) {
            selectedAction = null;
            renderActionForm();
            clearOutput();
        }
    }
}

/**
 * Clone action
 */
function cloneAction(actionId) {
    const action = allActions.find(a => a.id === actionId);
    if (!action) return;
    
    // Create a copy with new ID
    const cloned = {
        ...action,
        id: generateCustomActionId(),
        title: action.title + ' (Copy)',
        isBuiltIn: false
    };
    
    allActions.push(cloned);
    saveCustomActions();
    renderActionsList();
    selectAction(cloned.id);
}

/**
 * Load last used values
 */
function loadLastUsedValues() {
    // Values are loaded in renderActionForm
}

/**
 * Setup inline title editing
 */
function setupTitleEdit() {
    const editBtn = document.getElementById('editTitleBtn');
    const titleDisplay = document.getElementById('actionTitleDisplay');
    
    if (!editBtn || !titleDisplay || !selectedAction || selectedAction.isBuiltIn) {
        return;
    }
    
    editBtn.addEventListener('click', () => {
        const currentTitle = selectedAction.title;
        
        // Replace h3 with input field
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = currentTitle;
        titleInput.className = 'title-input';
        titleInput.style.cssText = 'font-size: 20px; font-weight: 600; padding: 4px 8px; border: 2px solid #4CAF50; border-radius: 4px; width: 100%; max-width: 600px;';
        
        // Replace title with input
        const titleHeader = titleDisplay.parentElement;
        titleDisplay.style.display = 'none';
        editBtn.style.display = 'none';
        titleHeader.appendChild(titleInput);
        titleInput.focus();
        titleInput.select();
        
        // Save on Enter or blur
        const saveTitle = () => {
            const newTitle = titleInput.value.trim();
            if (newTitle && newTitle !== currentTitle) {
                // Update action title
                selectedAction.title = newTitle;
                titleDisplay.textContent = newTitle;
                
                // Save to localStorage
                saveCustomActions();
                
                // Update actions list
                renderActionsList();
            }
            
            // Restore display
            titleInput.remove();
            titleDisplay.style.display = '';
            editBtn.style.display = '';
        };
        
        titleInput.addEventListener('blur', saveTitle);
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleInput.blur();
            } else if (e.key === 'Escape') {
                titleInput.remove();
                titleDisplay.style.display = '';
                editBtn.style.display = '';
            }
        });
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Add action to shared configurations (no token needed - uses GitHub via proxy)
 */
async function addToShared(actionId) {
    const action = allActions.find(a => a.id === actionId);
    if (!action || action.isBuiltIn || action.isShared) {
        return;
    }
    
    // Show loading
    const shareBtn = event?.target;
    if (shareBtn) {
        shareBtn.disabled = true;
        shareBtn.textContent = 'Sharing...';
    }
    
    try {
        // Get current shared configs
        const response = await fetch(SHARED_CONFIGS_URL);
        let sharedConfigs = [];
        if (response.ok) {
            sharedConfigs = await response.json();
        }
        
        // Check if action already exists in shared
        const existingIndex = sharedConfigs.findIndex(a => a.id === actionId);
        const actionToAdd = { ...action };
        delete actionToAdd.isShared; // Remove local flag
        
        if (existingIndex >= 0) {
            sharedConfigs[existingIndex] = actionToAdd;
        } else {
            sharedConfigs.push(actionToAdd);
        }
        
        // Save using serverless function (no token needed on client!)
        // The function handles GitHub API calls server-side
        // Try Vercel function first, then Netlify, then fallback
        const vercelUrl = window.location.origin + '/api/share-config';
        const netlifyUrl = window.location.origin + '/.netlify/functions/share-config';
        
        let saved = false;
        
        // Try Vercel function
        try {
            const saveResponse = await fetch(vercelUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ configs: sharedConfigs })
            });
            
            if (saveResponse.ok) {
                const result = await saveResponse.json();
                if (result.success) {
                    saved = true;
                    alert(`✅ Configuration "${action.title}" has been shared with the team!`);
                    // Wait a moment for GitHub to update, then reload
                    setTimeout(async () => {
                        await loadActions();
                        renderActionsList();
                    }, 1500);
                }
            }
        } catch (vercelError) {
            console.log('Vercel function not available, trying Netlify...');
        }
        
        // Try Netlify function if Vercel didn't work
        if (!saved) {
            try {
                const saveResponse = await fetch(netlifyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ configs: sharedConfigs })
                });
                
                if (saveResponse.ok) {
                    saved = true;
                    alert(`✅ Configuration "${action.title}" has been shared with the team!`);
                    setTimeout(async () => {
                        await loadActions();
                        renderActionsList();
                    }, 1500);
                }
            } catch (netlifyError) {
                console.log('Netlify function not available');
            }
        }
        
        // If both failed, show error
        if (!saved) {
            alert(
                `❌ Automatic sharing is not set up yet.\n\n` +
                `Please deploy the serverless function:\n` +
                `1. Deploy to Vercel or Netlify\n` +
                `2. Add GITHUB_TOKEN environment variable\n` +
                `3. See README_SHARING.md for details\n\n` +
                `For now, the configuration is saved locally.`
            );
        }
    } catch (error) {
        alert('❌ Error sharing configuration: ' + error.message);
        console.error('Error sharing:', error);
    } finally {
        if (shareBtn) {
            shareBtn.disabled = false;
            shareBtn.textContent = 'Share';
        }
    }
}

/**
 * Add shared action to local configurations
 */
function addToLocal(actionId) {
    const sharedAction = allActions.find(a => a.id === actionId && a.isShared);
    if (!sharedAction) return;
    
    // Create a local copy
    const localCopy = { ...sharedAction };
    delete localCopy.isShared;
    localCopy.id = generateCustomActionId(); // New ID for local copy
    
    // Add to local actions
    allActions.push(localCopy);
    saveCustomActions();
    renderActionsList();
    
    alert(`"${sharedAction.title}" has been added to your local configurations. You can now edit it.`);
}

// Make functions available globally for onclick handlers
window.editAction = editAction;
window.deleteAction = deleteAction;
window.cloneAction = cloneAction;
window.removeMultiRowFromUI = removeMultiRowFromUI;
window.removeModalMultiRowFromUI = removeModalMultiRowFromUI;
window.addToShared = addToShared;
window.addToLocal = addToLocal;