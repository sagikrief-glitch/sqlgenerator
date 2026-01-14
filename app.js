/**
 * Main application logic for SQL Configuration Generator
 */

// Firebase configuration (using Realtime Database - free tier)
const firebaseConfig = {
    apiKey: "AIzaSyB-QfQaE7yNaG_IVczFgs9C5k6e598JI1Q",
    authDomain: "sql-generator-shared.firebaseapp.com",
    databaseURL: "https://sql-generator-shared-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "sql-generator-shared",
    storageBucket: "sql-generator-shared.firebasestorage.app",
    messagingSenderId: "265551350997",
    appId: "1:265551350997:web:1bc136836885c60017a65c"
};

// Initialize Firebase (only if not already initialized)
let firebaseDb = null;
if (typeof firebase !== 'undefined') {
    try {
        // Check if Firebase is already initialized
        if (!firebase.apps || firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig);
        }
        firebaseDb = firebase.database();
    } catch (e) {
        console.log('Firebase initialization error:', e);
        // Firebase not configured yet - will fallback to GitHub
    }
}

// Fallback URL for shared configs (if Firebase not configured)
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
    
    // Load shared actions from Firebase Realtime Database (no token needed!)
    let sharedActions = [];
    try {
        if (firebaseDb) {
            // Try Firebase first
            const snapshot = await firebaseDb.ref('sharedConfigs').once('value');
            const sharedData = snapshot.val();
            if (sharedData) {
                if (Array.isArray(sharedData)) {
                    sharedActions = sharedData;
                } else if (typeof sharedData === 'object') {
                    // Convert object to array
                    sharedActions = Object.values(sharedData);
                }
                // Mark as shared
                sharedActions = sharedActions.map(action => ({ ...action, isShared: true, isBuiltIn: false }));
            }
        } else {
            // Fallback to GitHub if Firebase not configured
            const response = await fetch(SHARED_CONFIGS_URL);
            if (response.ok) {
                sharedActions = await response.json();
                sharedActions = sharedActions.map(action => ({ ...action, isShared: true, isBuiltIn: false }));
            }
        }
    } catch (error) {
        console.log('Could not load shared configurations:', error);
        // Try GitHub fallback
        try {
            const response = await fetch(SHARED_CONFIGS_URL);
            if (response.ok) {
                sharedActions = await response.json();
                sharedActions = sharedActions.map(action => ({ ...action, isShared: true, isBuiltIn: false }));
            }
        } catch (fallbackError) {
            console.log('Fallback also failed:', fallbackError);
        }
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
                    ${action.kind === 'script_group' ? '<span style="background: #2196F3; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">GROUP</span>' : ''}
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
                        <button class="btn-delete" onclick="event.stopPropagation(); removeFromShared('${action.id}')" title="Remove from shared">Remove</button>
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
    
    // Handle script groups
    if (selectedAction.kind === 'script_group') {
        renderScriptGroupForm(selectedAction);
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
        <div class="description-header" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 20px;">
            ${action.description ? `
                <p id="actionDescriptionDisplay" style="color: #666; margin: 0; flex: 1;">${escapeHtml(action.description)}</p>
            ` : `
                <p id="actionDescriptionDisplay" style="color: #999; font-style: italic; margin: 0; flex: 1;">No description</p>
            `}
            ${!action.isBuiltIn ? `
                <button class="btn-edit-title" id="editDescriptionBtn" title="Edit description" style="padding: 6px;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.333 2.00001C11.5084 1.82445 11.7163 1.68506 11.9448 1.58933C12.1733 1.4936 12.4179 1.44336 12.6663 1.44336C12.9148 1.44336 13.1594 1.4936 13.3879 1.58933C13.6164 1.68506 13.8243 1.82445 13.9997 2.00001C14.1752 2.17557 14.3146 2.38345 14.4103 2.61194C14.5061 2.84043 14.5563 3.08501 14.5563 3.33345C14.5563 3.58189 14.5061 3.82647 14.4103 4.05496C14.3146 4.28345 14.1752 4.49133 13.9997 4.66689L5.33301 13.3336L1.33301 14.6669L2.66634 10.6669L11.333 2.00001Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            ` : ''}
        </div>
        
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
        <div class="description-header" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 20px;">
            ${action.description ? `
                <p id="actionDescriptionDisplay" style="color: #666; margin: 0; flex: 1;">${escapeHtml(action.description)}</p>
            ` : `
                <p id="actionDescriptionDisplay" style="color: #999; font-style: italic; margin: 0; flex: 1;">No description</p>
            `}
            ${!action.isBuiltIn ? `
                <button class="btn-edit-title" id="editDescriptionBtn" title="Edit description" style="padding: 6px;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.333 2.00001C11.5084 1.82445 11.7163 1.68506 11.9448 1.58933C12.1733 1.4936 12.4179 1.44336 12.6663 1.44336C12.9148 1.44336 13.1594 1.4936 13.3879 1.58933C13.6164 1.68506 13.8243 1.82445 13.9997 2.00001C14.1752 2.17557 14.3146 2.38345 14.4103 2.61194C14.5061 2.84043 14.5563 3.08501 14.5563 3.33345C14.5563 3.58189 14.5061 3.82647 14.4103 4.05496C14.3146 4.28345 14.1752 4.49133 13.9997 4.66689L5.33301 13.3336L1.33301 14.6669L2.66634 10.6669L11.333 2.00001Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            ` : ''}
        </div>
        
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
    
    // Add description edit functionality
    setupDescriptionEdit();
    
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
    
    // Handle script_group action type
    if (selectedAction.kind === 'script_group') {
        generateScriptGroupSQL();
        return;
    }
    
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
    
    // Create Script Group button
    document.getElementById('createScriptGroupBtn').addEventListener('click', () => {
        openScriptGroupModal();
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
    
    // Script Group Modal
    document.getElementById('closeScriptGroupModal').addEventListener('click', closeScriptGroupModal);
    document.getElementById('cancelScriptGroupModalBtn').addEventListener('click', closeScriptGroupModal);
    document.getElementById('scriptGroupForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveScriptGroup();
    });
    // Make scripts list clickable to add new scripts
    const scriptsList = document.getElementById('scriptGroupScriptsList');
    if (scriptsList) {
        scriptsList.addEventListener('click', (e) => {
            // Only trigger if clicking on the empty area, not on existing scripts
            if (e.target === scriptsList || e.target.classList.contains('script-group-scripts-list')) {
                const isInModal = document.getElementById('scriptGroupModal') && document.getElementById('scriptGroupModal').style.display !== 'none';
                if (isInModal) {
                    // In modal - get group from editingActionId or create temp
                    let group = null;
                    if (editingActionId) {
                        group = allActions.find(a => a.id === editingActionId);
                    }
                    if (!group) {
                        // Creating new - will be saved when modal is saved
                        group = window.tempScriptGroup || {
                            id: 'script_group_temp_' + Date.now(),
                            kind: 'script_group',
                            title: document.getElementById('scriptGroupTitleInput').value.trim(),
                            description: document.getElementById('scriptGroupDescription').value.trim(),
                            scripts: []
                        };
                        window.tempScriptGroup = group;
                    }
                    // Automatically open script editor for raw SQL block
                    openScriptEditorModal('raw_sql_block', null, group);
                }
            }
        });
    }
    
    // Script Editor Modal
    document.getElementById('closeScriptEditorModal').addEventListener('click', closeScriptEditorModal);
    document.getElementById('cancelScriptEditorModalBtn').addEventListener('click', closeScriptEditorModal);
    
    // Setup script editor modal listeners (will be called when modal opens)
    setupScriptEditorModalListeners();
    
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
        modalTitle.textContent = 'Create JSON_SET';
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
    
    // Check if it's a Script Group
    if (action.kind === 'script_group') {
        openScriptGroupModal(actionId);
        return;
    }
    
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
    
    // Create a deep copy
    const cloned = JSON.parse(JSON.stringify(action));
    
    // Generate new ID
    cloned.id = generateCustomActionId();
    cloned.title = action.title + ' (Copy)';
    cloned.isBuiltIn = false;
    cloned.isShared = false;
    
    // Handle script groups - deep clone scripts array with new IDs
    if (cloned.kind === 'script_group' && cloned.scripts) {
        cloned.scripts = cloned.scripts.map(script => ({
            ...script,
            id: 'sg_item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        }));
    }
    
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
 * Setup inline description editing
 */
function setupDescriptionEdit() {
    const editBtn = document.getElementById('editDescriptionBtn');
    const descriptionDisplay = document.getElementById('actionDescriptionDisplay');
    
    if (!editBtn || !descriptionDisplay || !selectedAction || selectedAction.isBuiltIn) {
        return;
    }
    
    editBtn.addEventListener('click', () => {
        const currentDescription = selectedAction.description || '';
        
        // Replace p with textarea
        const descriptionInput = document.createElement('textarea');
        descriptionInput.value = currentDescription;
        descriptionInput.className = 'title-input';
        descriptionInput.style.cssText = 'padding: 4px 8px; border: 2px solid #4CAF50; border-radius: 4px; width: 100%; max-width: 600px; min-height: 60px; resize: vertical; font-family: inherit; font-size: 14px;';
        descriptionInput.placeholder = 'Enter description (optional)';
        
        // Replace description with textarea
        const descriptionHeader = descriptionDisplay.parentElement;
        descriptionDisplay.style.display = 'none';
        editBtn.style.display = 'none';
        descriptionHeader.appendChild(descriptionInput);
        descriptionInput.focus();
        descriptionInput.setSelectionRange(descriptionInput.value.length, descriptionInput.value.length);
        
        // Save on blur
        const saveDescription = () => {
            const newDescription = descriptionInput.value.trim();
            if (newDescription !== currentDescription) {
                // Update action description
                selectedAction.description = newDescription || undefined;
                
                // If it's a shared action, update Firebase
                if (selectedAction.isShared) {
                    updateSharedActionDescription(selectedAction.id, newDescription || undefined);
                } else {
                    // Save to localStorage
                    saveCustomActions();
                }
                
                // Update actions list
                renderActionsList();
                
                // Re-render form to show updated description
                renderActionForm();
            } else {
                // No change, just restore
                descriptionInput.remove();
                descriptionDisplay.style.display = '';
                editBtn.style.display = '';
            }
        };
        
        const cancelEdit = () => {
            descriptionInput.remove();
            descriptionDisplay.style.display = '';
            editBtn.style.display = '';
        };
        
        descriptionInput.addEventListener('blur', saveDescription);
        descriptionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
            // Allow Enter for multi-line descriptions
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
 * Add action to shared configurations (using Firebase - no token needed!)
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
        let sharedConfigs = [];
        
        if (firebaseDb) {
            // Load from Firebase
            const snapshot = await firebaseDb.ref('sharedConfigs').once('value');
            const sharedData = snapshot.val();
            if (sharedData) {
                if (Array.isArray(sharedData)) {
                    sharedConfigs = sharedData;
                } else if (typeof sharedData === 'object') {
                    sharedConfigs = Object.values(sharedData);
                }
            }
        } else {
            // Fallback to GitHub if Firebase not configured
            const response = await fetch(SHARED_CONFIGS_URL);
            if (response.ok) {
                sharedConfigs = await response.json();
            }
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
        
        // Save to Firebase (no token needed!)
        if (firebaseDb) {
            await firebaseDb.ref('sharedConfigs').set(sharedConfigs);
            alert(`✅ Configuration "${action.title}" has been shared with the team!`);
            // Reload actions to get updated shared configs
            await loadActions();
            renderActionsList();
        } else {
            // Firebase not configured - show setup instructions
            alert(
                `⚠️ Firebase is not configured yet.\n\n` +
                `To enable sharing:\n` +
                `1. Set up Firebase (see FIREBASE_SETUP.md)\n` +
                `2. Update firebaseConfig in app.js with your Firebase credentials\n` +
                `3. Refresh the page\n\n` +
                `Configuration is saved locally for now.`
            );
        }
    } catch (error) {
        alert('❌ Error sharing configuration: ' + error.message + '\n\nMake sure Firebase is properly configured.');
        console.error('Error sharing to Firebase:', error);
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

/**
 * Update shared action description in Firebase
 */
async function updateSharedActionDescription(actionId, description) {
    try {
        // Get current shared configs
        let sharedConfigs = [];
        
        if (firebaseDb) {
            const snapshot = await firebaseDb.ref('sharedConfigs').once('value');
            const sharedData = snapshot.val();
            if (sharedData) {
                if (Array.isArray(sharedData)) {
                    sharedConfigs = sharedData;
                } else if (typeof sharedData === 'object') {
                    sharedConfigs = Object.values(sharedData);
                }
            }
            
            // Find and update the action
            const actionIndex = sharedConfigs.findIndex(a => a.id === actionId);
            if (actionIndex !== -1) {
                sharedConfigs[actionIndex].description = description;
                
                // Save back to Firebase
                await firebaseDb.ref('sharedConfigs').set(sharedConfigs);
                
                // Update local copy
                const localIndex = allActions.findIndex(a => a.id === actionId);
                if (localIndex !== -1) {
                    allActions[localIndex].description = description;
                }
            }
        }
    } catch (error) {
        console.error('Error updating shared action description:', error);
        alert('Error updating description in shared configs. Changes saved locally only.');
        // Still save locally
        saveCustomActions();
    }
}

/**
 * Remove action from shared configurations
 */
async function removeFromShared(actionId) {
    const action = allActions.find(a => a.id === actionId && a.isShared);
    if (!action) return;
    
    if (!confirm(`Are you sure you want to remove "${action.title}" from shared configurations?`)) {
        return;
    }
    
    try {
        // Get current shared configs
        let sharedConfigs = [];
        
        if (firebaseDb) {
            const snapshot = await firebaseDb.ref('sharedConfigs').once('value');
            const sharedData = snapshot.val();
            if (sharedData) {
                if (Array.isArray(sharedData)) {
                    sharedConfigs = sharedData;
                } else if (typeof sharedData === 'object') {
                    sharedConfigs = Object.values(sharedData);
                }
            }
        } else {
            const response = await fetch(SHARED_CONFIGS_URL);
            if (response.ok) {
                sharedConfigs = await response.json();
            }
        }
        
        // Remove the action
        sharedConfigs = sharedConfigs.filter(a => a.id !== actionId);
        
        // Save to Firebase
        if (firebaseDb) {
            await firebaseDb.ref('sharedConfigs').set(sharedConfigs);
            alert(`✅ "${action.title}" has been removed from shared configurations.`);
            // Reload actions
            await loadActions();
            renderActionsList();
        } else {
            alert('Firebase not configured. Cannot remove from shared.');
        }
    } catch (error) {
        alert('❌ Error removing configuration: ' + error.message);
        console.error('Error removing from Firebase:', error);
    }
}

// ============================================================================
// Script Group Functions
// ============================================================================

/**
 * Ensure trailing semicolon if enabled
 */
function ensureTrailingSemicolon(text, enabled) {
    if (!enabled) return text;
    const trimmed = text.trimRight();
    if (trimmed.endsWith(';')) {
        return text; // Already has semicolon
    }
    return text + ';';
}

/**
 * Generate SQL for individual script (handles both types)
 */
function generateScriptSQL(script, storeNos) {
    if (script.type === 'raw_sql_block') {
        return ensureTrailingSemicolon(script.sqlBlock, script.ensureTrailingSemicolon !== false);
    } else if (script.type === 'update_json_set') {
        // Build SQL using script's rows array
        const rows = script.rows || [];
        if (rows.length === 0) {
            return '';
        }
        
        // Parse StoreNos
        const storeNosResult = parseStoreNos(storeNos);
        if (!storeNosResult.valid || storeNosResult.stores.length === 0) {
            return '';
        }
        
        // Build JSON_SET arguments from rows
        const jsonSetArgs = [];
        rows.forEach(row => {
            const path = ensureJsonPathPrefix(row.path);
            const value = formatSqlValue(row.valueType, row.value);
            jsonSetArgs.push(`'${path}', ${value}`);
        });
        
        const tableName = script.tableName || 'StoreStations';
        const configColumn = script.configColumn || 'Configuration';
        const stationColumn = script.stationColumn || 'StationId';
        const stationId = script.stationId || '';
        const storeColumn = script.storeColumn || 'StoreNo';
        const storeNosStr = storeNosResult.stores.join(', ');
        
        return `UPDATE ${tableName}
SET ${configColumn} = JSON_SET(${configColumn}, ${jsonSetArgs.join(', ')})
WHERE ${stationColumn} = '${escapeSqlString(stationId)}'
AND ${storeColumn} IN (${storeNosStr});`;
    }
    return '';
}

/**
 * Build combined output for all scripts in group
 */
function buildScriptGroupOutput(group, storeNos) {
    const parts = [];
    group.scripts.forEach((script, index) => {
        const number = index + 1;
        parts.push(`/* ${number}) ${script.title} */`);
        
        const sql = generateScriptSQL(script, storeNos);
        parts.push(sql);
        parts.push(''); // Empty line between scripts
    });
    
    return parts.join('\n');
}

/**
 * Render form for script group
 */
function renderScriptGroupForm(action) {
    const formContainer = document.getElementById('formContainer');
    const lastStoreNos = localStorage.getItem('lastStoreNos') || '';
    
    const scriptsHtml = action.scripts && action.scripts.length > 0
        ? action.scripts.map((script, index) => {
            const typeBadge = script.type === 'raw_sql_block' ? 'RAW SQL' : 'JSON_SET';
            return `
                <div class="script-item" data-script-id="${script.id}">
                    <div class="script-item-header">
                        <span class="script-type-badge">${typeBadge}</span>
                        <strong>${escapeHtml(script.title)}</strong>
                        <div class="script-actions">
                            <button type="button" class="btn btn-small" onclick="editScriptInGroup('${script.id}')">Edit</button>
                            <button type="button" class="btn btn-small" onclick="moveScriptUp('${script.id}')" ${index === 0 ? 'disabled' : ''}>↑</button>
                            <button type="button" class="btn btn-small" onclick="moveScriptDown('${script.id}')" ${index === action.scripts.length - 1 ? 'disabled' : ''}>↓</button>
                            <button type="button" class="btn btn-small btn-danger" onclick="removeScriptFromGroup('${script.id}')">Delete</button>
                        </div>
                    </div>
                    ${script.description ? `<div style="color: #666; font-size: 12px; margin-top: 4px;">${escapeHtml(script.description)}</div>` : ''}
                </div>
            `;
        }).join('')
        : '<p style="color: #999; padding: 10px;">No scripts added yet. Click "Add Script" to get started.</p>';
    
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
        <div class="description-header" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 20px;">
            ${action.description ? `
                <p id="actionDescriptionDisplay" style="color: #666; margin: 0; flex: 1;">${escapeHtml(action.description)}</p>
            ` : `
                <p id="actionDescriptionDisplay" style="color: #999; font-style: italic; margin: 0; flex: 1;">No description</p>
            `}
            ${!action.isBuiltIn ? `
                <button class="btn-edit-title" id="editDescriptionBtn" title="Edit description" style="padding: 6px;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.333 2.00001C11.5084 1.82445 11.7163 1.68506 11.9448 1.58933C12.1733 1.4936 12.4179 1.44336 12.6663 1.44336C12.9148 1.44336 13.1594 1.4936 13.3879 1.58933C13.6164 1.68506 13.8243 1.82445 13.9997 2.00001C14.1752 2.17557 14.3146 2.38345 14.4103 2.61194C14.5061 2.84043 14.5563 3.08501 14.5563 3.33345C14.5563 3.58189 14.5061 3.82647 14.4103 4.05496C14.3146 4.28345 14.1752 4.49133 13.9997 4.66689L5.33301 13.3336L1.33301 14.6669L2.66634 10.6669L11.333 2.00001Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            ` : ''}
        </div>
        
        <form id="actionForm">
            <div class="form-group">
                <label for="storeNos">StoreNos (for JSON_SET scripts)</label>
                <textarea id="storeNos" placeholder="123, 124, 125 or 100-105 or one per line">${escapeHtml(lastStoreNos)}</textarea>
                <div id="storeNosError" class="error-message" style="display: none;"></div>
                <div id="storeNosCount" class="store-count"></div>
            </div>
            
            <div class="form-group">
                <label>Scripts</label>
                <button type="button" class="btn btn-secondary" id="addScriptToGroupFormBtn" style="margin-bottom: 10px;">+ Add Script</button>
                <div id="scriptGroupScriptsList" class="script-group-scripts-list" style="min-height: 100px;">
                    ${scriptsHtml}
                </div>
            </div>
            
            <button type="submit" class="btn btn-primary">Generate All</button>
        </form>
    `;
    
    // Add Script button in form view
    const addScriptBtn = document.getElementById('addScriptToGroupFormBtn');
    if (addScriptBtn) {
        addScriptBtn.addEventListener('click', () => {
            showScriptTypeChooser();
        });
    }
    
    const storeNosInput = document.getElementById('storeNos');
    if (storeNosInput) {
        storeNosInput.addEventListener('input', validateAndPreviewStoreNos);
    }
    
    document.getElementById('actionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        generateScriptGroupSQL();
    });
    
    // Add title edit functionality
    setupTitleEdit();
    
    // Add description edit functionality
    setupDescriptionEdit();
    
    // Initial validation
    validateAndPreviewStoreNos();
}

/**
 * Show script type chooser
 */
function showScriptTypeChooser() {
    const isInModal = editingActionId !== null || !selectedAction;
    const targetGroup = selectedAction || (editingActionId ? allActions.find(a => a.id === editingActionId) : null);
    
    // Simple prompt for now - can be improved with a modal later
    const choice = confirm('Click OK for Raw SQL Block\nClick Cancel for JSON_SET Update');
    if (choice) {
        openScriptEditorModal('raw_sql_block', null, targetGroup);
    } else {
        openScriptEditorModal('update_json_set', null, targetGroup);
    }
}

/**
 * Generate SQL for script group
 */
function generateScriptGroupSQL() {
    if (!selectedAction || selectedAction.kind !== 'script_group') return;
    
    const storeNosInput = document.getElementById('storeNos').value;
    
    // Validate StoreNos (only needed for JSON_SET scripts, but validate anyway)
    const storeNosResult = parseStoreNos(storeNosInput);
    if (!storeNosResult.valid) {
        alert('Please fix StoreNos errors before generating SQL');
        return;
    }
    
    // Check if there are any JSON_SET scripts that need StoreNos
    const hasJsonSetScripts = selectedAction.scripts && selectedAction.scripts.some(s => s.type === 'update_json_set');
    if (hasJsonSetScripts && storeNosResult.stores.length === 0) {
        alert('StoreNos are required for JSON_SET scripts');
        return;
    }
    
    // Generate combined output
    const output = buildScriptGroupOutput(selectedAction, storeNosInput);
    
    // Display SQL
    const sqlOutput = document.getElementById('sqlOutput');
    const outputContainer = document.getElementById('outputContainer');
    sqlOutput.textContent = output;
    outputContainer.style.display = 'block';
    
    // Apply formatting if enabled
    updateSQLFormatting();
    
    // Save last used values
    localStorage.setItem('lastStoreNos', storeNosInput);
}

/**
 * Open script group modal for creating/editing
 */
function openScriptGroupModal(actionId) {
    editingActionId = actionId;
    const modal = document.getElementById('scriptGroupModal');
    const titleEl = document.getElementById('scriptGroupModalTitle');
    
    if (actionId) {
        // Editing existing
        const action = allActions.find(a => a.id === actionId);
        if (!action || action.kind !== 'script_group') return;
        
        titleEl.textContent = 'Edit Script Group';
        document.getElementById('scriptGroupTitleInput').value = action.title || '';
        document.getElementById('scriptGroupDescription').value = action.description || '';
        
        // Render scripts list
        renderScriptGroupScriptsList(action);
    } else {
        // Creating new
        titleEl.textContent = 'Create Script Group';
        document.getElementById('scriptGroupTitleInput').value = '';
        document.getElementById('scriptGroupDescription').value = '';
        document.getElementById('scriptGroupScriptsList').innerHTML = '<p style="color: #999; padding: 10px;">Click anywhere in this area or start typing to add your first script...</p>';
        
        // Clear temp group
        window.tempScriptGroup = null;
    }
    
    modal.style.display = 'block';
    
    // If creating new and no scripts, automatically open script editor after a short delay
    if (!actionId) {
        setTimeout(() => {
            // Check if user hasn't already started adding scripts
            if (!window.tempScriptGroup || !window.tempScriptGroup.scripts || window.tempScriptGroup.scripts.length === 0) {
                // Automatically open script editor for raw SQL block (most common use case)
                const tempGroup = {
                    id: 'script_group_temp_' + Date.now(),
                    kind: 'script_group',
                    title: '',
                    description: '',
                    scripts: []
                };
                window.tempScriptGroup = tempGroup;
                openScriptEditorModal('raw_sql_block', null, tempGroup);
            }
        }, 300);
    }
}

/**
 * Close script group modal
 */
function closeScriptGroupModal() {
    document.getElementById('scriptGroupModal').style.display = 'none';
    editingActionId = null;
    window.tempScriptGroup = null; // Clear temporary group
}

/**
 * Render scripts list in modal
 */
function renderScriptGroupScriptsList(group) {
    const container = document.getElementById('scriptGroupScriptsList');
    if (!group || !group.scripts || group.scripts.length === 0) {
        container.innerHTML = '<p style="color: #999; padding: 10px;">No scripts added yet.</p>';
        return;
    }
    
    container.innerHTML = group.scripts.map((script, index) => {
        const typeBadge = script.type === 'raw_sql_block' ? 'RAW SQL' : 'JSON_SET';
        return `
            <div class="script-item" data-script-id="${script.id}">
                <div class="script-item-header">
                    <span class="script-type-badge">${typeBadge}</span>
                    <strong>${escapeHtml(script.title)}</strong>
                    <div class="script-actions">
                        <button type="button" class="btn btn-small" onclick="editScriptInGroupModal('${script.id}')">Edit</button>
                        <button type="button" class="btn btn-small" onclick="moveScriptUpModal('${script.id}')" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" class="btn btn-small" onclick="moveScriptDownModal('${script.id}')" ${index === group.scripts.length - 1 ? 'disabled' : ''}>↓</button>
                        <button type="button" class="btn btn-small btn-danger" onclick="removeScriptFromGroupModal('${script.id}')">Delete</button>
                    </div>
                </div>
                ${script.description ? `<div style="color: #666; font-size: 12px; margin-top: 4px;">${escapeHtml(script.description)}</div>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Open script editor modal
 */
function openScriptEditorModal(type, existingScript, groupAction) {
    const modal = document.getElementById('scriptEditorModal');
    const titleEl = document.getElementById('scriptEditorModalTitle');
    const rawSqlContainer = document.getElementById('scriptEditorRawSqlContainer');
    const jsonSetContainer = document.getElementById('scriptEditorJsonSetContainer');
    
    // Determine if we're in modal or form context
    const isInModal = document.getElementById('scriptGroupModal') && document.getElementById('scriptGroupModal').style.display !== 'none';
    let targetGroup = groupAction;
    
    // If no groupAction provided, try to get from context
    if (!targetGroup) {
        if (isInModal) {
            // In modal - try editingActionId or temp group
            if (editingActionId) {
                targetGroup = allActions.find(a => a.id === editingActionId);
            }
            if (!targetGroup) {
                targetGroup = window.tempScriptGroup;
            }
        } else {
            // In form - use selectedAction
            targetGroup = selectedAction;
        }
    }
    
    // If still no group, create a temporary one (for new script groups)
    if (!targetGroup) {
        targetGroup = {
            id: 'script_group_temp_' + Date.now(),
            kind: 'script_group',
            title: '',
            description: '',
            scripts: []
        };
        window.tempScriptGroup = targetGroup;
    }
    
    if (type === 'raw_sql_block') {
        titleEl.textContent = existingScript ? 'Edit Raw SQL Block' : 'Add Raw SQL Block';
        rawSqlContainer.style.display = 'block';
        jsonSetContainer.style.display = 'none';
        
        if (existingScript) {
            document.getElementById('scriptEditorTitleInput').value = existingScript.title || '';
            document.getElementById('scriptEditorDescription').value = existingScript.description || '';
            document.getElementById('scriptEditorSqlBlock').value = existingScript.sqlBlock || '';
            document.getElementById('scriptEditorEnsureSemicolon').checked = existingScript.ensureTrailingSemicolon !== false;
        } else {
            document.getElementById('scriptEditorTitleInput').value = '';
            document.getElementById('scriptEditorDescription').value = '';
            document.getElementById('scriptEditorSqlBlock').value = '';
            document.getElementById('scriptEditorEnsureSemicolon').checked = true;
        }
    } else if (type === 'update_json_set') {
        titleEl.textContent = existingScript ? 'Edit JSON_SET Update' : 'Add JSON_SET Update';
        rawSqlContainer.style.display = 'none';
        jsonSetContainer.style.display = 'block';
        
        if (existingScript) {
            document.getElementById('scriptEditorJsonSetTitleInput').value = existingScript.title || '';
            document.getElementById('scriptEditorJsonSetStationId').value = existingScript.stationId || '';
            document.getElementById('scriptEditorJsonSetTableName').value = existingScript.tableName || 'StoreStations';
            document.getElementById('scriptEditorJsonSetStationColumn').value = existingScript.stationColumn || 'StationId';
            document.getElementById('scriptEditorJsonSetStoreColumn').value = existingScript.storeColumn || 'StoreNo';
            document.getElementById('scriptEditorJsonSetConfigColumn').value = existingScript.configColumn || 'Configuration';
            
            // Handle rows
            if (existingScript.rows && existingScript.rows.length > 1) {
                // Multi-mode
                document.getElementById('scriptEditorJsonSetSingleContainer').style.display = 'none';
                document.getElementById('scriptEditorJsonSetMultiContainer').style.display = 'block';
                renderScriptEditorJsonSetMultiRows(existingScript.rows);
            } else {
                // Single mode
                document.getElementById('scriptEditorJsonSetSingleContainer').style.display = 'block';
                document.getElementById('scriptEditorJsonSetMultiContainer').style.display = 'none';
                const firstRow = existingScript.rows && existingScript.rows.length > 0 ? existingScript.rows[0] : {};
                document.getElementById('scriptEditorJsonSetJsonPath').value = firstRow.path || '';
                document.getElementById('scriptEditorJsonSetValueType').value = firstRow.valueType || 'string';
                updateScriptEditorJsonSetValueInput(firstRow.valueType || 'string');
                const valueInput = document.getElementById('scriptEditorJsonSetValue');
                if (valueInput) {
                    if (firstRow.valueType === 'boolean') {
                        valueInput.value = firstRow.value === 'true' || firstRow.value === true ? 'true' : 'false';
                    } else {
                        valueInput.value = firstRow.value || '';
                    }
                }
            }
        } else {
            // New script - defaults
            document.getElementById('scriptEditorJsonSetTitleInput').value = '';
            document.getElementById('scriptEditorJsonSetDescription').value = '';
            document.getElementById('scriptEditorJsonSetStationId').value = '';
            document.getElementById('scriptEditorJsonSetTableName').value = 'StoreStations';
            document.getElementById('scriptEditorJsonSetStationColumn').value = 'StationId';
            document.getElementById('scriptEditorJsonSetStoreColumn').value = 'StoreNo';
            document.getElementById('scriptEditorJsonSetConfigColumn').value = 'Configuration';
            document.getElementById('scriptEditorJsonSetJsonPath').value = '';
            document.getElementById('scriptEditorJsonSetValueType').value = 'string';
            document.getElementById('scriptEditorJsonSetSingleContainer').style.display = 'block';
            document.getElementById('scriptEditorJsonSetMultiContainer').style.display = 'none';
            updateScriptEditorJsonSetValueInput('string');
        }
    }
    
    // Store context for save
    window.currentScriptEditorContext = {
        type,
        existingScript,
        groupAction: targetGroup,
        isInModal
    };
    
    // Setup auto-prefix for JSON path input
    setTimeout(() => {
        const jsonPathInput = document.getElementById('scriptEditorJsonSetJsonPath');
        if (jsonPathInput && !jsonPathInput.dataset.listenerAttached) {
            jsonPathInput.addEventListener('blur', (e) => {
                const formatted = ensureJsonPathPrefix(e.target.value);
                if (formatted !== e.target.value) {
                    e.target.value = formatted;
                }
            });
            jsonPathInput.dataset.listenerAttached = 'true';
        }
    }, 100);
    
    // Setup form submit handler (ensure it's attached when modal opens)
    setTimeout(() => {
        const form = document.getElementById('scriptEditorForm');
        if (form) {
            // Remove old listener if exists
            if (form.dataset.submitListenerAttached) {
                form.removeEventListener('submit', form._submitHandler);
            }
            
            // Create new handler
            form._submitHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                saveScriptFromEditor();
                return false;
            };
            
            form.addEventListener('submit', form._submitHandler);
            form.dataset.submitListenerAttached = 'true';
        }
        
        // Also attach click handler to Save button as backup
        const saveBtn = form ? form.querySelector('button[type="submit"]') : null;
        if (saveBtn && !saveBtn.dataset.clickListenerAttached) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                saveScriptFromEditor();
                return false;
            });
            saveBtn.dataset.clickListenerAttached = 'true';
        }
    }, 50);
    
    modal.style.display = 'block';
}

/**
 * Close script editor modal
 */
function closeScriptEditorModal() {
    document.getElementById('scriptEditorModal').style.display = 'none';
    window.currentScriptEditorContext = null;
}

/**
 * Save script from editor
 */
function saveScriptFromEditor() {
    const context = window.currentScriptEditorContext;
    if (!context) {
        alert('Error: No context found. Please try again.');
        return;
    }
    
    const { type, existingScript, groupAction, isInModal } = context;
    let targetGroup = groupAction || selectedAction;
    
    // If in modal and no group yet, use temp group or create one
    if (isInModal && !targetGroup) {
        targetGroup = window.tempScriptGroup;
    }
    
    // If still no group, create a temporary one
    if (!targetGroup) {
        targetGroup = {
            id: 'script_group_temp_' + Date.now(),
            kind: 'script_group',
            title: '',
            description: '',
            scripts: []
        };
        window.tempScriptGroup = targetGroup;
    }
    
    if (targetGroup.kind !== 'script_group') {
        alert('Error: Invalid script group. Please try again.');
        return;
    }
    
    let script = existingScript ? { ...existingScript } : {
        id: 'sg_item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: type
    };
    
    if (type === 'raw_sql_block') {
        const title = document.getElementById('scriptEditorTitleInput').value.trim();
        const description = document.getElementById('scriptEditorDescription').value.trim();
        const sqlBlock = document.getElementById('scriptEditorSqlBlock').value.trim();
        const ensureSemicolon = document.getElementById('scriptEditorEnsureSemicolon').checked;
        
        if (!title || !sqlBlock) {
            alert('Please fill in all required fields');
            return;
        }
        
        script.title = title;
        script.description = description || undefined; // Store only if not empty
        script.sqlBlock = sqlBlock;
        script.ensureTrailingSemicolon = ensureSemicolon;
    } else if (type === 'update_json_set') {
        const title = document.getElementById('scriptEditorJsonSetTitleInput').value.trim();
        const description = document.getElementById('scriptEditorJsonSetDescription').value.trim();
        const stationId = document.getElementById('scriptEditorJsonSetStationId').value.trim();
        const tableName = document.getElementById('scriptEditorJsonSetTableName').value.trim() || 'StoreStations';
        const stationColumn = document.getElementById('scriptEditorJsonSetStationColumn').value.trim() || 'StationId';
        const storeColumn = document.getElementById('scriptEditorJsonSetStoreColumn').value.trim() || 'StoreNo';
        const configColumn = document.getElementById('scriptEditorJsonSetConfigColumn').value.trim() || 'Configuration';
        
        if (!title || !stationId) {
            alert('Please fill in all required fields');
            return;
        }
        
        // Get rows
        let rows = [];
        const multiContainer = document.getElementById('scriptEditorJsonSetMultiContainer');
        if (multiContainer.style.display !== 'none') {
            // Multi-mode
            rows = getScriptEditorJsonSetMultiRows();
        } else {
            // Single mode
            const jsonPath = ensureJsonPathPrefix(document.getElementById('scriptEditorJsonSetJsonPath').value.trim());
            const valueType = document.getElementById('scriptEditorJsonSetValueType').value;
            const valueInput = document.getElementById('scriptEditorJsonSetValue');
            let value = '';
            if (valueType === 'boolean') {
                value = valueInput.value === 'true' ? 'true' : 'false';
            } else {
                value = valueInput.value.trim();
            }
            
            if (!jsonPath) {
                alert('JSON Path is required');
                return;
            }
            
            rows = [{ path: jsonPath, valueType, value }];
        }
        
        if (rows.length === 0) {
            alert('At least one JSON path/value pair is required');
            return;
        }
        
        script.title = title;
        script.description = description || undefined; // Store only if not empty
        script.stationId = stationId;
        script.tableName = tableName;
        script.stationColumn = stationColumn;
        script.storeColumn = storeColumn;
        script.configColumn = configColumn;
        script.rows = rows;
    }
    
    // Add or update script in group
    if (!targetGroup.scripts) {
        targetGroup.scripts = [];
    }
    
    if (existingScript) {
        // Update existing
        const index = targetGroup.scripts.findIndex(s => s.id === existingScript.id);
        if (index !== -1) {
            targetGroup.scripts[index] = script;
        }
    } else {
        // Add new
        targetGroup.scripts.push(script);
    }
    
    // If in modal and creating new group, store in window temporarily
    if (isInModal && !editingActionId) {
        window.tempScriptGroup = targetGroup;
    } else {
        // Update in allActions
        const actionIndex = allActions.findIndex(a => a.id === targetGroup.id);
        if (actionIndex !== -1) {
            allActions[actionIndex] = targetGroup;
        } else if (editingActionId) {
            // Editing existing - update it
            const editIndex = allActions.findIndex(a => a.id === editingActionId);
            if (editIndex !== -1) {
                allActions[editIndex] = targetGroup;
            }
        }
    }
    
    // Save only if not temporary
    if (!isInModal || editingActionId) {
        saveCustomActions();
    }
    
    // Refresh UI
    if (isInModal) {
        renderScriptGroupScriptsList(targetGroup);
    } else {
        renderScriptGroupForm(targetGroup);
        selectedAction = targetGroup;
    }
    
    closeScriptEditorModal();
}

/**
 * Remove script from group
 */
function removeScriptFromGroup(scriptId) {
    if (!selectedAction || selectedAction.kind !== 'script_group') return;
    if (!confirm('Are you sure you want to remove this script?')) return;
    
    selectedAction.scripts = selectedAction.scripts.filter(s => s.id !== scriptId);
    
    // Update in allActions
    const actionIndex = allActions.findIndex(a => a.id === selectedAction.id);
    if (actionIndex !== -1) {
        allActions[actionIndex] = selectedAction;
    }
    
    saveCustomActions();
    renderScriptGroupForm(selectedAction);
}

/**
 * Move script up
 */
function moveScriptUp(scriptId) {
    if (!selectedAction || selectedAction.kind !== 'script_group') return;
    
    const scripts = selectedAction.scripts;
    const index = scripts.findIndex(s => s.id === scriptId);
    if (index <= 0) return;
    
    // Swap with previous
    [scripts[index - 1], scripts[index]] = [scripts[index], scripts[index - 1]];
    
    // Update in allActions
    const actionIndex = allActions.findIndex(a => a.id === selectedAction.id);
    if (actionIndex !== -1) {
        allActions[actionIndex] = selectedAction;
    }
    
    saveCustomActions();
    renderScriptGroupForm(selectedAction);
}

/**
 * Move script down
 */
function moveScriptDown(scriptId) {
    if (!selectedAction || selectedAction.kind !== 'script_group') return;
    
    const scripts = selectedAction.scripts;
    const index = scripts.findIndex(s => s.id === scriptId);
    if (index < 0 || index >= scripts.length - 1) return;
    
    // Swap with next
    [scripts[index], scripts[index + 1]] = [scripts[index + 1], scripts[index]];
    
    // Update in allActions
    const actionIndex = allActions.findIndex(a => a.id === selectedAction.id);
    if (actionIndex !== -1) {
        allActions[actionIndex] = selectedAction;
    }
    
    saveCustomActions();
    renderScriptGroupForm(selectedAction);
}

/**
 * Edit script in group (from form)
 */
function editScriptInGroup(scriptId) {
    if (!selectedAction || selectedAction.kind !== 'script_group') return;
    const script = selectedAction.scripts.find(s => s.id === scriptId);
    if (!script) return;
    openScriptEditorModal(script.type, script, selectedAction);
}

/**
 * Modal versions of script management functions
 */
function removeScriptFromGroupModal(scriptId) {
    const titleInput = document.getElementById('scriptGroupTitleInput');
    const descInput = document.getElementById('scriptGroupDescription');
    
    // Get current group (either editing, temp, or create new)
    let group = null;
    if (editingActionId) {
        group = allActions.find(a => a.id === editingActionId);
    } else if (window.tempScriptGroup) {
        group = window.tempScriptGroup;
    }
    
    if (!group) {
        // Creating new - need to build from form or use temp
        group = window.tempScriptGroup || {
            id: 'script_group_' + Date.now(),
            kind: 'script_group',
            title: titleInput.value.trim(),
            description: descInput.value.trim(),
            scripts: []
        };
        window.tempScriptGroup = group;
    }
    
    if (!group.scripts) group.scripts = [];
    group.scripts = group.scripts.filter(s => s.id !== scriptId);
    renderScriptGroupScriptsList(group);
}

function moveScriptUpModal(scriptId) {
    const titleInput = document.getElementById('scriptGroupTitleInput');
    const descInput = document.getElementById('scriptGroupDescription');
    
    let group = null;
    if (editingActionId) {
        group = allActions.find(a => a.id === editingActionId);
    } else if (window.tempScriptGroup) {
        group = window.tempScriptGroup;
    }
    
    if (!group) {
        group = {
            id: 'script_group_' + Date.now(),
            kind: 'script_group',
            title: titleInput.value.trim(),
            description: descInput.value.trim(),
            scripts: []
        };
        window.tempScriptGroup = group;
    }
    
    if (!group.scripts) group.scripts = [];
    const scripts = group.scripts;
    const index = scripts.findIndex(s => s.id === scriptId);
    if (index <= 0) return;
    [scripts[index - 1], scripts[index]] = [scripts[index], scripts[index - 1]];
    renderScriptGroupScriptsList(group);
}

function moveScriptDownModal(scriptId) {
    const titleInput = document.getElementById('scriptGroupTitleInput');
    const descInput = document.getElementById('scriptGroupDescription');
    
    let group = null;
    if (editingActionId) {
        group = allActions.find(a => a.id === editingActionId);
    } else if (window.tempScriptGroup) {
        group = window.tempScriptGroup;
    }
    
    if (!group) {
        group = {
            id: 'script_group_' + Date.now(),
            kind: 'script_group',
            title: titleInput.value.trim(),
            description: descInput.value.trim(),
            scripts: []
        };
        window.tempScriptGroup = group;
    }
    
    if (!group.scripts) group.scripts = [];
    const scripts = group.scripts;
    const index = scripts.findIndex(s => s.id === scriptId);
    if (index < 0 || index >= scripts.length - 1) return;
    [scripts[index], scripts[index + 1]] = [scripts[index + 1], scripts[index]];
    renderScriptGroupScriptsList(group);
}

function editScriptInGroupModal(scriptId) {
    const titleInput = document.getElementById('scriptGroupTitleInput');
    const descInput = document.getElementById('scriptGroupDescription');
    
    let group = null;
    if (editingActionId) {
        group = allActions.find(a => a.id === editingActionId);
    } else if (window.tempScriptGroup) {
        group = window.tempScriptGroup;
    }
    
    if (!group) {
        group = {
            id: 'script_group_' + Date.now(),
            kind: 'script_group',
            title: titleInput.value.trim(),
            description: descInput.value.trim(),
            scripts: []
        };
        window.tempScriptGroup = group;
    }
    
    if (!group.scripts) group.scripts = [];
    const script = group.scripts.find(s => s.id === scriptId);
    if (!script) return;
    openScriptEditorModal(script.type, script, group);
}

/**
 * Save script group from modal
 */
function saveScriptGroup() {
    const title = document.getElementById('scriptGroupTitleInput').value.trim();
    if (!title) {
        alert('Title is required');
        return;
    }
    
    const description = document.getElementById('scriptGroupDescription').value.trim();
    
    // Get current group state
    let group = null;
    if (editingActionId) {
        group = allActions.find(a => a.id === editingActionId);
    } else if (window.tempScriptGroup) {
        // Use temporary group created during script editing
        group = window.tempScriptGroup;
    }
    
    if (!group) {
        // Create new
        group = {
            id: 'script_group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            kind: 'script_group',
            title,
            description,
            scripts: []
        };
    } else {
        // Update existing
        group.title = title;
        group.description = description;
    }
    
    // Validate at least one script
    if (!group.scripts || group.scripts.length === 0) {
        alert('Script group must have at least one script');
        return;
    }
    
    // Update or add to allActions
    if (editingActionId) {
        const index = allActions.findIndex(a => a.id === editingActionId);
        if (index !== -1) {
            allActions[index] = group;
        }
    } else {
        allActions.push(group);
    }
    
    // Clear temporary group
    window.tempScriptGroup = null;
    
    saveCustomActions();
    renderActionsList();
    closeScriptGroupModal();
    
    // Select the new/edited action
    selectAction(group.id);
}

/**
 * Helper functions for JSON_SET editor in script editor modal
 */
let scriptEditorJsonSetMultiRows = [];

function renderScriptEditorJsonSetMultiRows(rows) {
    scriptEditorJsonSetMultiRows = rows ? [...rows] : [{ path: '$.', valueType: 'string', value: '' }];
    const container = document.getElementById('scriptEditorJsonSetMultiRowsContainer');
    container.innerHTML = scriptEditorJsonSetMultiRows.map((row, index) => {
        return getScriptEditorJsonSetRowHtml(row, index);
    }).join('');
    
    // Setup auto-prefix for JSON paths
    setTimeout(() => {
        const jsonPathInputs = container.querySelectorAll('.script-editor-json-path');
        jsonPathInputs.forEach(input => {
            if (!input.dataset.listenerAttached) {
                input.addEventListener('blur', (e) => {
                    const formatted = ensureJsonPathPrefix(e.target.value);
                    if (formatted !== e.target.value) {
                        e.target.value = formatted;
                    }
                });
                input.dataset.listenerAttached = 'true';
            }
        });
    }, 50);
}

function getScriptEditorJsonSetRowHtml(row, index) {
    const valueHtml = getScriptEditorJsonSetValueInputHtml(row.valueType, row.value, index);
    return `
        <div class="multi-row" data-row-index="${index}">
            <div class="multi-row-item">
                <label>JSON Path *</label>
                <input type="text" class="script-editor-json-path" data-index="${index}" value="${escapeHtml(row.path || '$.')}" placeholder="$.cancelOrder">
            </div>
            <div class="multi-row-item">
                <label>Value Type *</label>
                <select class="script-editor-value-type" data-index="${index}">
                    <option value="boolean" ${row.valueType === 'boolean' ? 'selected' : ''}>Boolean</option>
                    <option value="string" ${row.valueType === 'string' ? 'selected' : ''}>String</option>
                    <option value="number" ${row.valueType === 'number' ? 'selected' : ''}>Number</option>
                </select>
            </div>
            <div class="multi-row-item">
                <label>Value *</label>
                ${valueHtml}
            </div>
            <div class="multi-row-actions">
                <button type="button" class="btn btn-small btn-danger" onclick="removeScriptEditorJsonSetRow(${index})">Remove</button>
            </div>
        </div>
    `;
}

function getScriptEditorJsonSetValueInputHtml(valueType, value, index) {
    if (valueType === 'boolean') {
        const boolValue = value === 'true' || value === true ? 'true' : 'false';
        return `
            <select class="script-editor-value" data-index="${index}">
                <option value="true" ${boolValue === 'true' ? 'selected' : ''}>true</option>
                <option value="false" ${boolValue === 'false' ? 'selected' : ''}>false</option>
            </select>
        `;
    } else {
        return `<input type="${valueType === 'number' ? 'number' : 'text'}" class="script-editor-value" data-index="${index}" value="${escapeHtml(value || '')}">`;
    }
}

function updateScriptEditorJsonSetValueInput(valueType) {
    const container = document.getElementById('scriptEditorJsonSetValueContainer');
    const valueInput = getScriptEditorJsonSetValueInputHtml(valueType, '', 0);
    container.innerHTML = valueInput;
}

function getScriptEditorJsonSetMultiRows() {
    const container = document.getElementById('scriptEditorJsonSetMultiRowsContainer');
    const rows = [];
    const rowElements = container.querySelectorAll('.multi-row');
    
    rowElements.forEach((rowEl, index) => {
        const pathInput = rowEl.querySelector('.script-editor-json-path');
        const typeSelect = rowEl.querySelector('.script-editor-value-type');
        const valueInput = rowEl.querySelector('.script-editor-value');
        
        if (pathInput && typeSelect && valueInput) {
            const path = ensureJsonPathPrefix(pathInput.value.trim());
            const valueType = typeSelect.value;
            let value = valueInput.value;
            if (valueType === 'boolean') {
                value = value === 'true' ? 'true' : 'false';
            } else {
                value = value.trim();
            }
            
            if (path) {
                rows.push({ path, valueType, value });
            }
        }
    });
    
    return rows;
}

function removeScriptEditorJsonSetRow(index) {
    scriptEditorJsonSetMultiRows.splice(index, 1);
    renderScriptEditorJsonSetMultiRows(scriptEditorJsonSetMultiRows);
}

// Make removeScriptEditorJsonSetRow available globally
window.removeScriptEditorJsonSetRow = removeScriptEditorJsonSetRow;

/**
 * Setup event listeners for script editor modal
 */
function setupScriptEditorModalListeners() {
    // Add value button for JSON_SET
    const addValueBtn = document.getElementById('scriptEditorJsonSetAddValueBtn');
    if (addValueBtn) {
        addValueBtn.addEventListener('click', () => {
            const singleContainer = document.getElementById('scriptEditorJsonSetSingleContainer');
            const multiContainer = document.getElementById('scriptEditorJsonSetMultiContainer');
            
            // Get current single value
            const jsonPath = ensureJsonPathPrefix(document.getElementById('scriptEditorJsonSetJsonPath').value.trim());
            const valueType = document.getElementById('scriptEditorJsonSetValueType').value;
            const valueInput = document.getElementById('scriptEditorJsonSetValue');
            let value = '';
            if (valueType === 'boolean') {
                value = valueInput.value === 'true' ? 'true' : 'false';
            } else {
                value = valueInput.value.trim();
            }
            
            // Switch to multi-mode
            singleContainer.style.display = 'none';
            multiContainer.style.display = 'block';
            
            // Initialize with first row
            scriptEditorJsonSetMultiRows = [{ path: jsonPath || '$.', valueType, value }];
            renderScriptEditorJsonSetMultiRows(scriptEditorJsonSetMultiRows);
        });
    }
    
    // Add row button
    const addRowBtn = document.getElementById('scriptEditorJsonSetAddRowBtn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            scriptEditorJsonSetMultiRows.push({ path: '$.', valueType: 'string', value: '' });
            renderScriptEditorJsonSetMultiRows(scriptEditorJsonSetMultiRows);
        });
    }
    
    // Value type change
    const valueTypeSelect = document.getElementById('scriptEditorJsonSetValueType');
    if (valueTypeSelect) {
        valueTypeSelect.addEventListener('change', (e) => {
            updateScriptEditorJsonSetValueInput(e.target.value);
        });
    }
    
    // Form submit
    const form = document.getElementById('scriptEditorForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveScriptFromEditor();
        });
    }
    
    // Auto-add "$." prefix to JSON paths in script editor modal
    // This will be set up when modal opens, but we can also set up for dynamic inputs
    setTimeout(() => {
        const jsonPathInputs = document.querySelectorAll('.script-editor-json-path, #scriptEditorJsonSetJsonPath');
        jsonPathInputs.forEach(input => {
            if (!input.dataset.listenerAttached) {
                input.addEventListener('blur', (e) => {
                    const formatted = ensureJsonPathPrefix(e.target.value);
                    if (formatted !== e.target.value) {
                        e.target.value = formatted;
                    }
                });
                input.dataset.listenerAttached = 'true';
            }
        });
    }, 100);
}

// Make functions available globally for onclick handlers
window.editAction = editAction;
window.deleteAction = deleteAction;
window.cloneAction = cloneAction;
window.removeMultiRowFromUI = removeMultiRowFromUI;
window.removeModalMultiRowFromUI = removeModalMultiRowFromUI;
window.addToShared = addToShared;
window.addToLocal = addToLocal;
window.removeFromShared = removeFromShared;
window.editScriptInGroup = editScriptInGroup;
window.removeScriptFromGroup = removeScriptFromGroup;
window.moveScriptUp = moveScriptUp;
window.moveScriptDown = moveScriptDown;
window.editScriptInGroupModal = editScriptInGroupModal;
window.removeScriptFromGroupModal = removeScriptFromGroupModal;
window.moveScriptUpModal = moveScriptUpModal;
window.moveScriptDownModal = moveScriptDownModal;